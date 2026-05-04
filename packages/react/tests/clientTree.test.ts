import { describe, expect, test } from "bun:test"
import {
  buildClientTree,
  collectLeafDescendants,
  compactVisibleAncestors,
  expandVisibleAncestors,
  flattenClientTree,
  sortClientTreeChildren,
} from "../src/clientTree"

interface Row {
  id: string
  name: string
  parentId: string | null
  amount?: number
}

const rowId = (row: Row) => row.id
const getParent = (row: Row) => row.parentId

describe("buildClientTree (worker1 v06-client-tree-rowmodel)", () => {
  test("empty data → empty index", () => {
    const index = buildClientTree<Row>([], getParent, rowId)
    expect(index.byId.size).toBe(0)
    expect(index.rootIds).toEqual([])
    expect(index.childrenByParent.size).toBe(0)
    expect(index.parentByChild.size).toBe(0)
    expect(index.levelById.size).toBe(0)
  })

  test("root-only data → all rows are roots, level 0", () => {
    const data: Row[] = [
      { id: "a", name: "A", parentId: null },
      { id: "b", name: "B", parentId: null },
      { id: "c", name: "C", parentId: null },
    ]
    const index = buildClientTree(data, getParent, rowId)
    expect(index.rootIds).toEqual(["a", "b", "c"])
    expect(index.childrenByParent.size).toBe(0)
    expect(index.levelById.get("a")).toBe(0)
    expect(index.levelById.get("b")).toBe(0)
    expect(index.levelById.get("c")).toBe(0)
  })

  test("simple parent/child (one parent + 3 children)", () => {
    const data: Row[] = [
      { id: "p", name: "Parent", parentId: null },
      { id: "c1", name: "Child 1", parentId: "p" },
      { id: "c2", name: "Child 2", parentId: "p" },
      { id: "c3", name: "Child 3", parentId: "p" },
    ]
    const index = buildClientTree(data, getParent, rowId)
    expect(index.rootIds).toEqual(["p"])
    expect(index.childrenByParent.get("p")).toEqual(["c1", "c2", "c3"])
    expect(index.levelById.get("p")).toBe(0)
    expect(index.levelById.get("c1")).toBe(1)
    expect(index.levelById.get("c2")).toBe(1)
    expect(index.levelById.get("c3")).toBe(1)
  })

  test("deep tree (5 levels) computes correct levels", () => {
    const data: Row[] = [
      { id: "L0", name: "L0", parentId: null },
      { id: "L1", name: "L1", parentId: "L0" },
      { id: "L2", name: "L2", parentId: "L1" },
      { id: "L3", name: "L3", parentId: "L2" },
      { id: "L4", name: "L4", parentId: "L3" },
    ]
    const index = buildClientTree(data, getParent, rowId)
    expect(index.levelById.get("L0")).toBe(0)
    expect(index.levelById.get("L1")).toBe(1)
    expect(index.levelById.get("L2")).toBe(2)
    expect(index.levelById.get("L3")).toBe(3)
    expect(index.levelById.get("L4")).toBe(4)
  })

  test("cycle detection (A → B → A) breaks the late edge", () => {
    // Spy on console.error to confirm the cycle is logged.
    const originalError = console.error
    const errors: string[] = []
    console.error = (msg: unknown) => {
      errors.push(String(msg))
    }
    try {
      const data: Row[] = [
        { id: "a", name: "A", parentId: "b" },
        { id: "b", name: "B", parentId: "a" },
      ]
      const index = buildClientTree(data, getParent, rowId)
      // One of the two rows gets demoted to a root (the algorithm picks
      // one end of the cycle deterministically). Both rows must end up
      // in the index without infinite-looping.
      expect(index.byId.size).toBe(2)
      expect(errors.length).toBeGreaterThan(0)
      expect(errors[0]).toContain("cycle detected")
    } finally {
      console.error = originalError
    }
  })

  test("orphan handling (child references missing parent) demotes to root with warn", () => {
    const originalWarn = console.warn
    const warns: string[] = []
    console.warn = (msg: unknown) => {
      warns.push(String(msg))
    }
    try {
      const data: Row[] = [
        { id: "a", name: "A", parentId: null },
        { id: "ghost", name: "Ghost child", parentId: "missing-parent" },
      ]
      const index = buildClientTree(data, getParent, rowId)
      expect(index.rootIds).toEqual(["a", "ghost"])
      expect(index.parentByChild.get("ghost")).toBeNull()
      expect(warns.length).toBeGreaterThan(0)
      expect(warns[0]).toContain("not in data")
      expect(warns[0]).toContain("ghost")
    } finally {
      console.warn = originalWarn
    }
  })

  test("stable child ordering — children appear in data-array order", () => {
    // Mix the data so children precede their parent in the array. The
    // algorithm should still produce children in the relative order
    // they appear in `data` (not in some undefined hash-iteration
    // order).
    const data: Row[] = [
      { id: "c1", name: "Child 1 (first in data)", parentId: "p" },
      { id: "p", name: "Parent (after children)", parentId: null },
      { id: "c2", name: "Child 2", parentId: "p" },
      { id: "c3", name: "Child 3", parentId: "p" },
    ]
    const index = buildClientTree(data, getParent, rowId)
    expect(index.childrenByParent.get("p")).toEqual(["c1", "c2", "c3"])
  })

  test("multi-root multi-child (two trees side-by-side)", () => {
    const data: Row[] = [
      { id: "p1", name: "P1", parentId: null },
      { id: "p1c1", name: "P1 Child 1", parentId: "p1" },
      { id: "p2", name: "P2", parentId: null },
      { id: "p2c1", name: "P2 Child 1", parentId: "p2" },
      { id: "p2c2", name: "P2 Child 2", parentId: "p2" },
    ]
    const index = buildClientTree(data, getParent, rowId)
    expect(index.rootIds).toEqual(["p1", "p2"])
    expect(index.childrenByParent.get("p1")).toEqual(["p1c1"])
    expect(index.childrenByParent.get("p2")).toEqual(["p2c1", "p2c2"])
  })
})

describe("flattenClientTree (worker1 v06-client-tree-rowmodel)", () => {
  const buildSampleData = (): Row[] => [
    { id: "p1", name: "P1", parentId: null },
    { id: "p1c1", name: "P1 Child 1", parentId: "p1" },
    { id: "p1c2", name: "P1 Child 2", parentId: "p1" },
    { id: "p2", name: "P2", parentId: null },
    { id: "p2c1", name: "P2 Child 1", parentId: "p2" },
  ]

  test("none expanded → only root rows visible", () => {
    const data = buildSampleData()
    const index = buildClientTree(data, getParent, rowId)
    const flat = flattenClientTree({ index, expansionState: new Set<string>() })
    expect(flat.map((entry) => entry.rowId)).toEqual(["p1", "p2"])
    expect(flat[0]?.level).toBe(0)
    expect(flat[1]?.level).toBe(0)
  })

  test("all expanded → every row visible in pre-order DFS", () => {
    const data = buildSampleData()
    const index = buildClientTree(data, getParent, rowId)
    const flat = flattenClientTree({
      index,
      expansionState: new Set(["p1", "p2"]),
    })
    expect(flat.map((entry) => entry.rowId)).toEqual(["p1", "p1c1", "p1c2", "p2", "p2c1"])
    // Levels: roots at 0, children at 1.
    expect(flat[0]?.level).toBe(0)
    expect(flat[1]?.level).toBe(1)
    expect(flat[2]?.level).toBe(1)
    expect(flat[3]?.level).toBe(0)
    expect(flat[4]?.level).toBe(1)
  })

  test("partial expansion → only descendants of expanded rows", () => {
    const data = buildSampleData()
    const index = buildClientTree(data, getParent, rowId)
    const flat = flattenClientTree({
      index,
      expansionState: new Set(["p1"]), // expand p1 only
    })
    expect(flat.map((entry) => entry.rowId)).toEqual(["p1", "p1c1", "p1c2", "p2"])
  })

  test("entry.index is the contiguous DOM order (0, 1, 2, ...)", () => {
    const data = buildSampleData()
    const index = buildClientTree(data, getParent, rowId)
    const flat = flattenClientTree({
      index,
      expansionState: new Set(["p1", "p2"]),
    })
    expect(flat.map((entry) => entry.index)).toEqual([0, 1, 2, 3, 4])
  })

  test("visibleRowIds filters out non-matches (compact / kept-ancestor visible set)", () => {
    const data = buildSampleData()
    const index = buildClientTree(data, getParent, rowId)
    // Pretend the filter matched only p1c1 + its ancestor p1.
    const visibleRowIds = new Set(["p1", "p1c1"])
    const flat = flattenClientTree({
      index,
      expansionState: new Set(["p1", "p2"]),
      visibleRowIds,
    })
    expect(flat.map((entry) => entry.rowId)).toEqual(["p1", "p1c1"])
  })

  test("kind is always 'data' — tree parents are real DataRowEntry, not synthetic GroupRowEntry", () => {
    const data = buildSampleData()
    const index = buildClientTree(data, getParent, rowId)
    const flat = flattenClientTree({
      index,
      expansionState: new Set(["p1", "p2"]),
    })
    for (const entry of flat) {
      expect(entry.kind).toBe("data")
    }
  })
})

describe("expandVisibleAncestors / compactVisibleAncestors (filter helpers)", () => {
  // Shared deep tree for ancestor expansion tests.
  //   root
  //   ├── a
  //   │   └── a-child
  //   └── b
  const buildTree = (): Row[] => [
    { id: "root", name: "Root", parentId: null },
    { id: "a", name: "A", parentId: "root" },
    { id: "a-child", name: "A child", parentId: "a" },
    { id: "b", name: "B", parentId: "root" },
  ]

  test("expandVisibleAncestors promotes ancestors of matched rows", () => {
    const index = buildClientTree(buildTree(), getParent, rowId)
    const visible = expandVisibleAncestors({
      index,
      matchedRowIds: new Set(["a-child"]),
    })
    // a-child's ancestors are a + root → all three become visible.
    expect(visible.has("a-child")).toBe(true)
    expect(visible.has("a")).toBe(true)
    expect(visible.has("root")).toBe(true)
    // b is not an ancestor of the match → stays hidden.
    expect(visible.has("b")).toBe(false)
  })

  test("expandVisibleAncestors returns the matched set unchanged for root matches", () => {
    const index = buildClientTree(buildTree(), getParent, rowId)
    const visible = expandVisibleAncestors({
      index,
      matchedRowIds: new Set(["root"]),
    })
    expect(visible).toEqual(new Set(["root"]))
  })

  test("expandVisibleAncestors handles multiple matches at different depths", () => {
    const data: Row[] = [
      { id: "p1", name: "P1", parentId: null },
      { id: "p1c", name: "P1 child", parentId: "p1" },
      { id: "p2", name: "P2", parentId: null },
      { id: "p2c", name: "P2 child", parentId: "p2" },
      { id: "p2cc", name: "P2 grandchild", parentId: "p2c" },
    ]
    const index = buildClientTree(data, getParent, rowId)
    const visible = expandVisibleAncestors({
      index,
      matchedRowIds: new Set(["p1c", "p2cc"]),
    })
    // p1c's ancestor is p1; p2cc's ancestors are p2c + p2.
    expect(visible.has("p1")).toBe(true)
    expect(visible.has("p1c")).toBe(true)
    expect(visible.has("p2")).toBe(true)
    expect(visible.has("p2c")).toBe(true)
    expect(visible.has("p2cc")).toBe(true)
  })

  test("compactVisibleAncestors mirrors expandVisibleAncestors for matched-and-ancestor sets", () => {
    const index = buildClientTree(buildTree(), getParent, rowId)
    const expanded = expandVisibleAncestors({
      index,
      matchedRowIds: new Set(["a-child"]),
    })
    const compact = compactVisibleAncestors({
      index,
      matchedRowIds: new Set(["a-child"]),
    })
    expect(compact).toEqual(expanded)
  })
})

describe("sortClientTreeChildren (worker1 v06 phase 2.5 per-subtree sort)", () => {
  // Tree shape (in data order):
  //   root1 (name=Banana)
  //   ├── b (name=Cherry)
  //   ├── a (name=Apple)
  //   └── c (name=Date)
  //   root2 (name=Apricot)
  //   └── d (name=Elderberry)
  const buildSortableTree = (): Row[] => [
    { id: "root1", name: "Banana", parentId: null },
    { id: "b", name: "Cherry", parentId: "root1" },
    { id: "a", name: "Apple", parentId: "root1" },
    { id: "c", name: "Date", parentId: "root1" },
    { id: "root2", name: "Apricot", parentId: null },
    { id: "d", name: "Elderberry", parentId: "root2" },
  ]
  const compareByName = (a: Row, b: Row): number => a.name.localeCompare(b.name)

  test("sorts roots by the comparator", () => {
    const index = buildClientTree(buildSortableTree(), getParent, rowId)
    const sorted = sortClientTreeChildren(index, compareByName)
    // Apricot (root2) sorts before Banana (root1).
    expect(sorted.rootIds).toEqual(["root2", "root1"])
  })

  test("sorts each parent's children by the comparator", () => {
    const index = buildClientTree(buildSortableTree(), getParent, rowId)
    const sorted = sortClientTreeChildren(index, compareByName)
    // root1's children: Apple < Cherry < Date.
    expect(sorted.childrenByParent.get("root1")).toEqual(["a", "b", "c"])
    // root2's only child: Elderberry — single-element list unchanged.
    expect(sorted.childrenByParent.get("root2")).toEqual(["d"])
  })

  test("preserves byId / parentByChild / levelById references", () => {
    const index = buildClientTree(buildSortableTree(), getParent, rowId)
    const sorted = sortClientTreeChildren(index, compareByName)
    expect(sorted.byId).toBe(index.byId)
    expect(sorted.parentByChild).toBe(index.parentByChild)
    expect(sorted.levelById).toBe(index.levelById)
  })

  test("flattenClientTree against a sorted index produces sorted DFS order", () => {
    const index = buildClientTree(buildSortableTree(), getParent, rowId)
    const sorted = sortClientTreeChildren(index, compareByName)
    const flat = flattenClientTree({
      index: sorted,
      expansionState: new Set(["root1", "root2"]),
    })
    // Apricot first (root2), then its single child; then Banana
    // (root1) and its sorted children.
    expect(flat.map((entry) => entry.rowId)).toEqual(["root2", "d", "root1", "a", "b", "c"])
  })
})

describe("collectLeafDescendants (worker1 v06 phase 2.5 aggregations input)", () => {
  // Tree shape:
  //   root
  //   ├── a
  //   │   ├── a1 (leaf, amount=10)
  //   │   └── a2 (leaf, amount=20)
  //   └── b
  //       └── b1
  //           └── b1a (leaf, amount=30)
  const buildAggTree = (): Row[] => [
    { id: "root", name: "Root", parentId: null, amount: 0 },
    { id: "a", name: "A", parentId: "root", amount: 0 },
    { id: "a1", name: "A1", parentId: "a", amount: 10 },
    { id: "a2", name: "A2", parentId: "a", amount: 20 },
    { id: "b", name: "B", parentId: "root", amount: 0 },
    { id: "b1", name: "B1", parentId: "b", amount: 0 },
    { id: "b1a", name: "B1A", parentId: "b1", amount: 30 },
  ]

  test("returns only leaf descendants in pre-order DFS", () => {
    const index = buildClientTree(buildAggTree(), getParent, rowId)
    const leaves = collectLeafDescendants(index, "root")
    expect(leaves.map((row) => row.id)).toEqual(["a1", "a2", "b1a"])
  })

  test("returns only descendants of the requested parent (not siblings)", () => {
    const index = buildClientTree(buildAggTree(), getParent, rowId)
    const aLeaves = collectLeafDescendants(index, "a")
    expect(aLeaves.map((row) => row.id)).toEqual(["a1", "a2"])
  })

  test("walks deeply nested leaves (b → b1 → b1a)", () => {
    const index = buildClientTree(buildAggTree(), getParent, rowId)
    const bLeaves = collectLeafDescendants(index, "b")
    expect(bLeaves.map((row) => row.id)).toEqual(["b1a"])
  })

  test("returns the row itself when the requested parent is a leaf", () => {
    const index = buildClientTree(buildAggTree(), getParent, rowId)
    const a1Leaves = collectLeafDescendants(index, "a1")
    expect(a1Leaves.map((row) => row.id)).toEqual(["a1"])
  })

  test("returns empty when the requested parent is not in the index", () => {
    const index = buildClientTree(buildAggTree(), getParent, rowId)
    const ghost = collectLeafDescendants(index, "missing")
    expect(ghost).toEqual([])
  })
})
