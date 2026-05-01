import type { RowId } from "@bc-grid/core"
import type { BcReactGridColumn } from "./types"

/**
 * Synthetic ID for the pinned-left master-detail disclosure column.
 * Reserved; consumers should not use this columnId for their own columns.
 */
const DETAIL_TOGGLE_COLUMN_ID = "__bc_detail"

interface CreateDetailToggleColumnArgs {
  expansionState: ReadonlySet<RowId>
  setExpansionState: (next: ReadonlySet<RowId>) => void
}

export function createDetailToggleColumn<TRow>({
  expansionState,
  setExpansionState,
}: CreateDetailToggleColumnArgs): BcReactGridColumn<TRow> {
  return {
    columnId: DETAIL_TOGGLE_COLUMN_ID,
    header: <span className="bc-grid-detail-header">Details</span>,
    pinned: "left",
    width: 44,
    sortable: false,
    resizable: false,
    filter: false,
    columnMenu: false,
    align: "center",
    cellRenderer(params) {
      const expanded = expansionState.has(params.rowId)
      const handleToggle = (): void => {
        const next = new Set(expansionState)
        if (expanded) next.delete(params.rowId)
        else next.add(params.rowId)
        setExpansionState(next)
      }

      return (
        <button
          type="button"
          className="bc-grid-detail-toggle"
          aria-expanded={expanded}
          aria-label={expanded ? "Collapse row" : "Expand row"}
          onClick={(event) => {
            event.stopPropagation()
            handleToggle()
          }}
          onKeyDown={stopGridKeyboardNav}
        >
          <span aria-hidden="true" className="bc-grid-detail-toggle-icon">
            &gt;
          </span>
        </button>
      )
    },
  }
}

function stopGridKeyboardNav(event: { key: string; stopPropagation: () => void }): void {
  if (event.key === " " || event.key === "Enter") event.stopPropagation()
}
