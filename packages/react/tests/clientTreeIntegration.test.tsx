import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { BcGrid } from "../src/grid"
import type { BcGridColumn } from "../src/types"

interface BomRow {
  id: string
  parentId: string | null
  name: string
  qty: number
}

const columns: readonly BcGridColumn<BomRow>[] = [
  { columnId: "name", field: "name", header: "Material", width: 240, outline: true },
  { columnId: "qty", field: "qty", header: "Qty", width: 80 },
]

const sampleData: readonly BomRow[] = [
  { id: "A", parentId: null, name: "Assembly A", qty: 1 },
  { id: "A-1", parentId: "A", name: "Sub A-1", qty: 2 },
  { id: "A-1-a", parentId: "A-1", name: "Part A-1-a", qty: 4 },
  { id: "B", parentId: null, name: "Assembly B", qty: 1 },
]

// Integration tests exercise the `<BcGrid>` ↔ `treeData` ↔
// `flattenClientTree` pipeline via SSR markup. These are coarser than
// the per-helper tests in `clientTree.test.ts` but pin the wiring
// between BcGridProps.treeData → buildClientTree → allRowEntries
// pipeline → outline cell rendering.

describe("BcGrid + treeData pipeline (worker1 v06 client tree row model)", () => {
  test("without treeData → flat data renders all rows in input order", () => {
    const html = renderToStaticMarkup(
      <BcGrid<BomRow>
        ariaLabel="Flat"
        columns={columns}
        data={sampleData}
        rowId={(row) => row.id}
        height={240}
      />,
    )
    // No tree → every row is visible.
    expect(html).toContain("Assembly A")
    expect(html).toContain("Sub A-1")
    expect(html).toContain("Part A-1-a")
    expect(html).toContain("Assembly B")
  })

  test("with treeData + no expansion → only root rows visible", () => {
    const html = renderToStaticMarkup(
      <BcGrid<BomRow>
        ariaLabel="Tree collapsed"
        columns={columns}
        data={sampleData}
        rowId={(row) => row.id}
        treeData={{ getRowParentId: (row) => row.parentId }}
        height={240}
      />,
    )
    // Roots must render.
    expect(html).toContain("Assembly A")
    expect(html).toContain("Assembly B")
    // Children must NOT render (no expansion seeded).
    expect(html).not.toContain("Sub A-1")
    expect(html).not.toContain("Part A-1-a")
  })

  test("with treeData + expansion seeded → expanded subtrees render", () => {
    const html = renderToStaticMarkup(
      <BcGrid<BomRow>
        ariaLabel="Tree expanded"
        columns={columns}
        data={sampleData}
        rowId={(row) => row.id}
        treeData={{ getRowParentId: (row) => row.parentId }}
        defaultExpansion={new Set(["A", "A-1"])}
        height={240}
      />,
    )
    // A expanded → A-1 visible
    expect(html).toContain("Assembly A")
    expect(html).toContain("Sub A-1")
    // A-1 expanded → A-1-a visible
    expect(html).toContain("Part A-1-a")
    // B is also a root — visible
    expect(html).toContain("Assembly B")
  })

  test("outline column renders the chevron-toggle button (parent row)", () => {
    const html = renderToStaticMarkup(
      <BcGrid<BomRow>
        ariaLabel="Tree with chevron"
        columns={columns}
        data={sampleData}
        rowId={(row) => row.id}
        treeData={{ getRowParentId: (row) => row.parentId }}
        defaultExpansion={new Set(["A"])}
        height={240}
      />,
    )
    // A is a parent → chevron toggle button present.
    expect(html).toContain("bc-grid-tree-toggle")
    // Outline wrapper class.
    expect(html).toContain("bc-grid-cell-outline")
  })

  test("outline column renders a spacer for leaf rows (no chevron)", () => {
    const html = renderToStaticMarkup(
      <BcGrid<BomRow>
        ariaLabel="Tree with leaf spacer"
        columns={columns}
        data={sampleData}
        rowId={(row) => row.id}
        treeData={{ getRowParentId: (row) => row.parentId }}
        defaultExpansion={new Set(["A", "A-1"])}
        height={240}
      />,
    )
    // Leaf spacer class for the rendered leaves.
    expect(html).toContain("bc-grid-tree-leaf-spacer")
  })

  // Phase 2.5 — per-subtree sort + parent-row aggregations.

  test("phase 2.5: per-subtree sort orders siblings under each parent (desc)", () => {
    // Mixed-order rows so a sort actually changes the visible order.
    const mixedData: readonly BomRow[] = [
      { id: "A", parentId: null, name: "Assembly A", qty: 1 },
      { id: "A-1", parentId: "A", name: "Sub A-1", qty: 2 },
      { id: "A-2", parentId: "A", name: "Sub A-2", qty: 9 },
      { id: "A-3", parentId: "A", name: "Sub A-3", qty: 5 },
    ]
    const html = renderToStaticMarkup(
      <BcGrid<BomRow>
        ariaLabel="Tree sorted desc by qty"
        columns={columns}
        data={mixedData}
        rowId={(row) => row.id}
        treeData={{ getRowParentId: (row) => row.parentId }}
        defaultExpansion={new Set(["A"])}
        defaultSort={[{ columnId: "qty", direction: "desc" }]}
        height={240}
      />,
    )
    // All three siblings render under expanded parent.
    expect(html).toContain("Sub A-1")
    expect(html).toContain("Sub A-2")
    expect(html).toContain("Sub A-3")
    // Desc by qty → A-2 (9) before A-3 (5) before A-1 (2).
    const idxA2 = html.indexOf("Sub A-2")
    const idxA3 = html.indexOf("Sub A-3")
    const idxA1 = html.indexOf("Sub A-1")
    expect(idxA2).toBeGreaterThan(-1)
    expect(idxA3).toBeGreaterThan(idxA2)
    expect(idxA1).toBeGreaterThan(idxA3)
  })

  test("phase 2.5: parent rows display aggregated leaf-descendant sum", () => {
    const aggCols: readonly BcGridColumn<BomRow>[] = [
      { columnId: "name", field: "name", header: "Material", width: 240, outline: true },
      { columnId: "qty", field: "qty", header: "Qty", width: 80, aggregation: { type: "sum" } },
    ]
    // A has children A-1 (qty 2) + A-1-a (qty 4 — only this is a LEAF
    // because A-1 has its own child) + A-2 (qty 7 — leaf).
    // Leaves under A: A-1-a (4), A-2 (7) → sum = 11.
    const data: readonly BomRow[] = [
      { id: "A", parentId: null, name: "Assembly A", qty: 0 }, // raw qty replaced by agg
      { id: "A-1", parentId: "A", name: "Sub A-1", qty: 2 }, // parent — replaced too
      { id: "A-1-a", parentId: "A-1", name: "Part A-1-a", qty: 4 }, // leaf
      { id: "A-2", parentId: "A", name: "Sub A-2", qty: 7 }, // leaf
    ]
    const html = renderToStaticMarkup(
      <BcGrid<BomRow>
        ariaLabel="Tree with sum aggregation"
        columns={aggCols}
        data={data}
        rowId={(row) => row.id}
        treeData={{ getRowParentId: (row) => row.parentId }}
        defaultExpansion={new Set(["A", "A-1"])}
        height={240}
      />,
    )
    // The leaf qty values still render.
    expect(html).toContain(">4<")
    expect(html).toContain(">7<")
    // A-1's parent row should display the sum of its leaf descendants
    // (just A-1-a → 4), NOT its raw qty of 2.
    // A's parent row should display 11 (sum of all leaves under A).
    expect(html).toContain(">11<")
  })

  test("phase 2.5: leaf rows still show raw value (aggregation only overrides parents)", () => {
    const aggCols: readonly BcGridColumn<BomRow>[] = [
      { columnId: "name", field: "name", header: "Material", width: 240, outline: true },
      { columnId: "qty", field: "qty", header: "Qty", width: 80, aggregation: { type: "sum" } },
    ]
    const data: readonly BomRow[] = [
      { id: "A", parentId: null, name: "Assembly A", qty: 99 },
      { id: "A-1", parentId: "A", name: "Sub A-1", qty: 33 }, // leaf
    ]
    const html = renderToStaticMarkup(
      <BcGrid<BomRow>
        ariaLabel="Tree leaf shows raw"
        columns={aggCols}
        data={data}
        rowId={(row) => row.id}
        treeData={{ getRowParentId: (row) => row.parentId }}
        defaultExpansion={new Set(["A"])}
        height={240}
      />,
    )
    // Leaf A-1: raw qty 33 visible.
    expect(html).toContain(">33<")
    // Parent A: aggregated sum = 33 (only one leaf), not its raw 99.
    expect(html).toContain(">33<")
    expect(html).not.toContain(">99<")
  })
})
