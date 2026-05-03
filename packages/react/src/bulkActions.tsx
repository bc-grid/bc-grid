import type { BcSelection, RowId } from "@bc-grid/core"
import type { ReactNode } from "react"
import { XIcon } from "./internal/panel-icons"
import type { BcBulkActionUndoContext, BcBulkActionsContext } from "./types"

interface BcGridBulkActionsProps<TRow> {
  actions: ReactNode | ((ctx: BcBulkActionsContext<TRow>) => ReactNode)
  ctx: BcBulkActionsContext<TRow>
}

interface BcGridBulkActionUndoToastProps<TRow> {
  ctx: BcBulkActionUndoContext<TRow>
  slot?: ReactNode | ((ctx: BcBulkActionUndoContext<TRow>) => ReactNode)
}

interface RowIdEntry {
  rowId: RowId
}

export function BcGridBulkActions<TRow>({ actions, ctx }: BcGridBulkActionsProps<TRow>): ReactNode {
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

export function BcGridBulkActionUndoToast<TRow>({
  ctx,
  slot,
}: BcGridBulkActionUndoToastProps<TRow>): ReactNode {
  const content = typeof slot === "function" ? slot(ctx) : slot
  if (content != null && typeof content !== "boolean") {
    return (
      <output
        aria-live="polite"
        className="bc-grid-bulk-action-undo-toast"
        data-bc-grid-bulk-action-undo-toast="true"
      >
        {content}
      </output>
    )
  }

  return (
    <output
      aria-live="polite"
      className="bc-grid-bulk-action-undo-toast"
      data-bc-grid-bulk-action-undo-toast="true"
    >
      <span className="bc-grid-bulk-action-undo-message">{ctx.undoableAction.label}</span>
      <div className="bc-grid-bulk-action-undo-actions">
        <button
          className="bc-grid-bulk-action-undo-button"
          onClick={() => {
            void ctx.undo()
          }}
          type="button"
        >
          Undo
        </button>
        <button
          aria-label="Dismiss bulk action undo"
          className="bc-grid-bulk-action-undo-dismiss"
          onClick={ctx.dismiss}
          type="button"
        >
          {XIcon}
        </button>
      </div>
    </output>
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
