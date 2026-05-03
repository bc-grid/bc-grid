import type { BcSelection, RowId } from "@bc-grid/core"
import type { ReactNode } from "react"
import { XIcon } from "./internal/panel-icons"
import type { BcBulkActionsContext } from "./types"

interface BcGridBulkActionsProps {
  actions: ReactNode | ((ctx: BcBulkActionsContext) => ReactNode)
  ctx: BcBulkActionsContext
}

interface RowIdEntry {
  rowId: RowId
}

export function BcGridBulkActions({ actions, ctx }: BcGridBulkActionsProps): ReactNode {
  if (ctx.selectedRowCount <= 0) return null

  const content = typeof actions === "function" ? actions(ctx) : actions
  const hasContent = content != null && typeof content !== "boolean"

  return (
    <section aria-label={selectedRowsLabel(ctx.selectedRowCount)} className="bc-grid-bulk-actions">
      <span className="bc-grid-bulk-actions-count">
        {formatCount(ctx.selectedRowCount)} selected
      </span>
      {hasContent ? <div className="bc-grid-bulk-actions-slot">{content}</div> : null}
      <button
        aria-label="Clear selection"
        className="bc-grid-bulk-actions-clear"
        onClick={ctx.clearSelection}
        type="button"
      >
        {XIcon}
      </button>
    </section>
  )
}

export function resolveBulkActionSelectedRowIds(
  selection: BcSelection,
  allRows: readonly RowIdEntry[],
  filteredRows: readonly RowIdEntry[],
): readonly RowId[] {
  if (selection.mode === "explicit") return Array.from(selection.rowIds)

  const rows = selection.mode === "all" ? allRows : filteredRows
  return rows.flatMap((entry) => (selection.except.has(entry.rowId) ? [] : [entry.rowId]))
}

function selectedRowsLabel(count: number): string {
  return count === 1 ? "1 selected row" : `${formatCount(count)} selected rows`
}

function formatCount(value: number): string {
  return value.toLocaleString()
}
