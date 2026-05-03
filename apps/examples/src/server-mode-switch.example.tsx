import {
  type BcGridColumn,
  BcServerGrid,
  type LoadServerPage,
  type LoadServerTreeChildren,
  type RowId,
  type ServerPagedResult,
  type ServerTreeResult,
  useServerGrid,
} from "@bc-grid/react"
import { useMemo, useState } from "react"

// Minimal bsncraft-style server-mode-switch demo. Drives the
// `apps/examples/tests/server-mode-switch.pw.ts` Playwright spec for
// RFC §9 stage 3.3. Mounted via `?serverModeSwitch=1` URL flag.
//
// Uses `useServerGrid` (the polymorphic turnkey hook from #409) so a single
// hook owns both the paged and tree loaders. Flipping the "Group by Customer
// Type" toggle reroutes the active mode via the heuristic
// (`groupBy.length > 0 → "tree"`, else `"paged"`) — the structural change
// from RFC stages 1-3.2 carries the controlled-state dimensions across.

interface CustomerRow {
  id: string
  account: string
  legalName: string
  customerType: "Corporate" | "Government" | "Retail" | "Wholesale"
  region: "Northeast" | "Midwest" | "South" | "West"
  balance: number
}

const CUSTOMER_TYPES: readonly CustomerRow["customerType"][] = [
  "Corporate",
  "Government",
  "Retail",
  "Wholesale",
]

const REGIONS: readonly CustomerRow["region"][] = ["Northeast", "Midwest", "South", "West"]

function generateRows(count: number): readonly CustomerRow[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `customer-${String(index).padStart(5, "0")}`,
    account: `A${String(index).padStart(6, "0")}`,
    legalName: `Customer Inc. ${index}`,
    customerType: CUSTOMER_TYPES[index % CUSTOMER_TYPES.length] as CustomerRow["customerType"],
    region: REGIONS[Math.floor(index / 4) % REGIONS.length] as CustomerRow["region"],
    balance: ((index * 73) % 100_000) + 5_000,
  }))
}

const columns: readonly BcGridColumn<CustomerRow>[] = [
  { columnId: "account", field: "account", header: "Account", width: 140, pinned: "left" },
  { columnId: "legalName", field: "legalName", header: "Legal name", width: 240 },
  { columnId: "customerType", field: "customerType", header: "Type", width: 140 },
  { columnId: "region", field: "region", header: "Region", width: 140 },
  { columnId: "balance", field: "balance", header: "Balance", width: 140, align: "right" },
]

export function ServerModeSwitchExample() {
  const allRows = useMemo(() => generateRows(2_000), [])

  const loadPage = useMemo<LoadServerPage<CustomerRow>>(
    () => async (query) => {
      // Trivial in-memory paged loader — sufficient for the Playwright
      // contract assertions; real bsncraft consumer brings their own.
      const start = query.pageIndex * query.pageSize
      const end = Math.min(start + query.pageSize, allRows.length)
      const rows = allRows.slice(start, end)
      return {
        pageIndex: query.pageIndex,
        pageSize: query.pageSize,
        rows,
        totalRows: allRows.length,
      } satisfies ServerPagedResult<CustomerRow>
    },
    [allRows],
  )

  const loadChildren = useMemo<LoadServerTreeChildren<CustomerRow>>(
    () => async (query) => {
      // Tree mode: when `groupBy=['customerType']`, root rows are the
      // customer-type buckets; expanding a bucket fetches its children.
      const grouping = query.groupPath
      if (grouping.length === 0) {
        // Root-level: enumerate the distinct customerType values as group rows.
        const types = new Set(allRows.map((row) => row.customerType))
        const groupRows: ServerTreeResult<CustomerRow>["rows"] = Array.from(types).map((type) => {
          const child = allRows.find((row) => row.customerType === type) as CustomerRow
          return {
            kind: "group" as const,
            groupKey: { columnId: "customerType", value: type },
            childCount: allRows.filter((row) => row.customerType === type).length,
            data: child,
          }
        })
        return {
          childCount: groupRows.length,
          childStart: 0,
          groupPath: query.groupPath,
          parentRowId: query.parentRowId,
          rows: groupRows,
        } satisfies ServerTreeResult<CustomerRow>
      }
      // Leaf-level: enumerate rows under the expanded group.
      const lastKey = grouping[grouping.length - 1]
      const filtered = lastKey
        ? allRows.filter((row) => row[lastKey.columnId as keyof CustomerRow] === lastKey.value)
        : allRows
      const start = query.childStart
      const end = Math.min(start + query.childCount, filtered.length)
      const leafRows: ServerTreeResult<CustomerRow>["rows"] = filtered
        .slice(start, end)
        .map((row) => ({ kind: "leaf" as const, data: row }))
      return {
        childCount: filtered.length,
        childStart: start,
        groupPath: query.groupPath,
        parentRowId: query.parentRowId,
        rows: leafRows,
      } satisfies ServerTreeResult<CustomerRow>
    },
    [allRows],
  )

  const [groupBy, setGroupBy] = useState<readonly string[]>([])
  const grid = useServerGrid<CustomerRow>({
    gridId: "server-mode-switch-demo",
    rowId: (row: CustomerRow): RowId => row.id,
    loadPage,
    loadChildren,
    initial: { groupBy: [] },
  })

  // The polymorphic hook owns its own controlled `groupBy`, so we drive
  // it via `actions.setGroupBy` and mirror it locally for the toggle's
  // pressed state.
  const toggleGrouping = () => {
    const next = groupBy.length === 0 ? ["customerType"] : []
    setGroupBy(next)
    grid.actions.setGroupBy(next)
  }

  return (
    <section aria-labelledby="server-mode-switch-title" className="example">
      <header className="toolbar">
        <h2 id="server-mode-switch-title">Server mode-switch demo</h2>
        <p>
          {grid.state.activeMode === "tree" ? "Tree mode (grouped)" : "Paged mode (flat)"} — toggle
          to verify carry-over per RFC §9
        </p>
        <button
          type="button"
          aria-pressed={groupBy.length > 0}
          onClick={toggleGrouping}
          data-testid="server-mode-switch-toggle"
        >
          {groupBy.length > 0 ? "Ungroup" : "Group by Customer Type"}
        </button>
      </header>
      <BcServerGrid<CustomerRow>
        {...grid.props}
        ariaLabel="Server mode-switch customer demo"
        columns={columns}
        height={420}
      />
    </section>
  )
}
