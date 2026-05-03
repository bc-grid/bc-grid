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
})
