import { BcGrid, type BcGridColumn, type RowId } from "@bc-grid/react"
import { useState } from "react"

// Minimal client tree row model demo. Drives the
// `apps/examples/tests/client-tree-rowmodel.pw.ts` Playwright spec
// for the v0.6 worker1 headline. Mounts under `?clientTree=1`.
//
// Production-estimating-style outline: a small bill-of-materials tree
// where each material can have children (sub-assemblies) and so on.
// The outline column carries the chevron + indent; sibling columns
// are regular columns. Phase 2.5 wires per-subtree sort + parent-row
// aggregations: with `aggregation: { type: "sum" }` on `cost`, every
// non-leaf row displays the sum of its leaf descendants instead of
// its raw value. Click any header to sort siblings within each parent.

interface BomRow {
  id: string
  parentId: string | null
  name: string
  quantity: number
  cost: number
}

const data: readonly BomRow[] = [
  { id: "A", parentId: null, name: "Assembly A (top-level)", quantity: 1, cost: 250 },
  { id: "A-1", parentId: "A", name: "Subassembly A-1", quantity: 2, cost: 80 },
  { id: "A-1-a", parentId: "A-1", name: "Component A-1-a", quantity: 4, cost: 12 },
  { id: "A-1-b", parentId: "A-1", name: "Component A-1-b", quantity: 3, cost: 18 },
  { id: "A-2", parentId: "A", name: "Subassembly A-2", quantity: 1, cost: 90 },
  { id: "A-2-a", parentId: "A-2", name: "Component A-2-a", quantity: 6, cost: 7 },
  { id: "B", parentId: null, name: "Assembly B (top-level)", quantity: 1, cost: 400 },
  { id: "B-1", parentId: "B", name: "Subassembly B-1", quantity: 5, cost: 60 },
]

const columns: readonly BcGridColumn<BomRow>[] = [
  { columnId: "name", field: "name", header: "Material", width: 320, outline: true },
  { columnId: "quantity", field: "quantity", header: "Qty", width: 100, align: "right" },
  {
    columnId: "cost",
    field: "cost",
    header: "Cost",
    width: 120,
    align: "right",
    format: "currency",
    aggregation: { type: "sum" },
  },
]

export function ClientTreeExample() {
  const [expansion, setExpansion] = useState<ReadonlySet<RowId>>(() => new Set(["A", "A-1", "B"]))

  return (
    <section aria-labelledby="client-tree-title" className="example">
      <header className="toolbar">
        <h2 id="client-tree-title">Client tree row model demo</h2>
        <p>
          Bill-of-materials outline. Click a chevron to expand/collapse a row's children. Per v0.6
          worker1 headline (RFC #438).
        </p>
        <button
          type="button"
          onClick={() => setExpansion(new Set(data.map((row) => row.id)))}
          data-testid="client-tree-expand-all"
        >
          Expand all
        </button>
        <button
          type="button"
          onClick={() => setExpansion(new Set())}
          data-testid="client-tree-collapse-all"
        >
          Collapse all
        </button>
      </header>
      <BcGrid<BomRow>
        ariaLabel="Client tree demo grid"
        columns={columns}
        data={data}
        rowId={(row) => row.id}
        treeData={{
          getRowParentId: (row) => row.parentId,
        }}
        expansion={expansion}
        onExpansionChange={(next) => setExpansion(new Set(next))}
        height={420}
      />
    </section>
  )
}
