import { describe, expect, test } from "bun:test"
import type { RowId } from "@bc-grid/core"
import { computeTreeRowAria } from "../src/serverGrid"

interface TestRow {
  id: string
  label: string
}

type TreeNode = {
  childIds: RowId[]
  childCount: number | "unknown"
  childrenLoaded: boolean
  error: unknown
  groupPath: never[]
  hasChildren: boolean
  kind: "leaf" | "group"
  level: number
  loading: boolean
  parentRowId: RowId | null
  row: TestRow
  rowId: RowId
}

function makeNode(overrides: Partial<TreeNode> & { rowId: RowId }): TreeNode {
  return {
    childIds: [],
    childCount: 0,
    childrenLoaded: false,
    error: null,
    groupPath: [],
    hasChildren: false,
    kind: "leaf",
    level: 0,
    loading: false,
    parentRowId: null,
    row: { id: overrides.rowId, label: overrides.rowId },
    ...overrides,
  }
}

const rootA = "rootA" as RowId
const rootB = "rootB" as RowId
const childA1 = "childA1" as RowId
const childA2 = "childA2" as RowId
const grandchild = "grandchild" as RowId

function snapshot() {
  const nodes = new Map<RowId, TreeNode>([
    [
      rootA,
      makeNode({
        rowId: rootA,
        level: 0,
        kind: "group",
        hasChildren: true,
        childrenLoaded: true,
        childIds: [childA1, childA2],
      }),
    ],
    [
      rootB,
      makeNode({
        rowId: rootB,
        level: 0,
      }),
    ],
    [
      childA1,
      makeNode({
        rowId: childA1,
        level: 1,
        parentRowId: rootA,
        kind: "group",
        hasChildren: true,
        childrenLoaded: true,
        childIds: [grandchild],
      }),
    ],
    [
      childA2,
      makeNode({
        rowId: childA2,
        level: 1,
        parentRowId: rootA,
      }),
    ],
    [
      grandchild,
      makeNode({
        rowId: grandchild,
        level: 2,
        parentRowId: childA1,
      }),
    ],
  ])
  return { nodes, rootIds: [rootA, rootB] }
}

describe("computeTreeRowAria", () => {
  test("returns undefined for unknown rowIds", () => {
    expect(computeTreeRowAria(snapshot(), "missing" as RowId)).toBeUndefined()
  })

  test("roots get level 1 with posinset/setsize across rootIds", () => {
    const snap = snapshot()
    expect(computeTreeRowAria(snap, rootA)).toEqual({
      level: 1,
      posinset: 1,
      setsize: 2,
    })
    expect(computeTreeRowAria(snap, rootB)).toEqual({
      level: 1,
      posinset: 2,
      setsize: 2,
    })
  })

  test("children get level 2 and sibling indices within their parent", () => {
    const snap = snapshot()
    expect(computeTreeRowAria(snap, childA1)).toEqual({
      level: 2,
      posinset: 1,
      setsize: 2,
    })
    expect(computeTreeRowAria(snap, childA2)).toEqual({
      level: 2,
      posinset: 2,
      setsize: 2,
    })
  })

  test("grandchildren get level 3", () => {
    const snap = snapshot()
    expect(computeTreeRowAria(snap, grandchild)).toEqual({
      level: 3,
      posinset: 1,
      setsize: 1,
    })
  })

  test("omits posinset/setsize when the parent's children aren't loaded yet", () => {
    const orphanParent = "orphanParent" as RowId
    const orphanChild = "orphanChild" as RowId
    const nodes = new Map<RowId, TreeNode>([
      [
        orphanParent,
        makeNode({
          rowId: orphanParent,
          level: 0,
          kind: "group",
          hasChildren: true,
          childrenLoaded: false,
          // childIds intentionally empty — children not yet loaded.
          childIds: [],
        }),
      ],
      [
        orphanChild,
        makeNode({
          rowId: orphanChild,
          level: 1,
          parentRowId: orphanParent,
        }),
      ],
    ])
    const snap = { nodes, rootIds: [orphanParent] }
    // Child exists but the parent's childIds doesn't include it (e.g.,
    // a row added via streaming update before the parent's children
    // resolved). The helper returns level only.
    expect(computeTreeRowAria(snap, orphanChild)).toEqual({ level: 2 })
  })
})
