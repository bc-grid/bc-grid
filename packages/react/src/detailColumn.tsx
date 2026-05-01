import type { RowId } from "@bc-grid/core"
import type { CSSProperties, ReactNode } from "react"
import { domToken } from "./gridInternals"
import { DisclosureChevron } from "./internal/disclosure-icon"
import type { BcReactGridColumn } from "./types"

/**
 * Synthetic ID for the pinned-left master-detail disclosure column.
 * Reserved; consumers should not use this columnId for their own columns.
 */
export const DETAIL_TOGGLE_COLUMN_ID = "__bc_detail"

interface CreateDetailToggleColumnArgs {
  domBaseId: string
  expansionState: ReadonlySet<RowId>
  setExpansionState: (next: ReadonlySet<RowId>) => void
}

interface DetailPanelHeightEntry<TRow> {
  index: number
  row: TRow
  rowId: RowId
}

export interface BcDetailPanelSlotProps<TRow> {
  colSpan: number
  domBaseId: string
  height: number
  renderDetailPanel: (params: { row: TRow; rowId: RowId; rowIndex: number }) => ReactNode
  row: TRow
  rowId: RowId
  rowIndex: number
  top: number
  width: number
}

export function createDetailToggleColumn<TRow>({
  domBaseId,
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
      const panelId = detailPanelDomId(domBaseId, params.rowId)
      const handleToggle = (): void => {
        setExpansionState(toggleDetailExpansion(expansionState, params.rowId))
      }

      return (
        <button
          type="button"
          className="bc-grid-detail-toggle"
          aria-controls={panelId}
          aria-expanded={expanded}
          aria-label={
            expanded
              ? `Collapse details for row ${params.rowId}`
              : `Expand details for row ${params.rowId}`
          }
          onClick={(event) => {
            event.stopPropagation()
            handleToggle()
          }}
          onKeyDown={stopDetailToggleGridKeyboardNav}
        >
          <DisclosureChevron className="bc-grid-detail-toggle-icon" />
        </button>
      )
    },
  }
}

export function BcDetailPanelSlot<TRow>({
  colSpan,
  domBaseId,
  height,
  renderDetailPanel,
  row,
  rowId,
  rowIndex,
  top,
  width,
}: BcDetailPanelSlotProps<TRow>): ReactNode {
  return (
    <>
      <div
        className="bc-grid-detail-panel"
        // biome-ignore lint/a11y/useSemanticElements: virtualized ARIA grid cells are div-based, not table cells.
        role="gridcell"
        aria-colindex={1}
        aria-colspan={Math.max(1, colSpan)}
        tabIndex={-1}
        style={detailPanelStyle(top, height, width)}
        onClick={(event) => event.stopPropagation()}
        onDoubleClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <section
          className="bc-grid-detail-panel-region"
          id={detailPanelDomId(domBaseId, rowId)}
          aria-label={detailPanelLabel(rowId)}
        >
          {renderDetailPanel({
            row,
            rowId,
            rowIndex,
          })}
        </section>
      </div>
    </>
  )
}

export function detailPanelDomId(domBaseId: string, rowId: RowId): string {
  return `${domBaseId}-detail-panel-${domToken(rowId)}`
}

export function detailPanelLabel(rowId: RowId): string {
  return `Details for row ${rowId}`
}

export function toggleDetailExpansion(
  expansionState: ReadonlySet<RowId>,
  rowId: RowId,
): ReadonlySet<RowId> {
  const next = new Set(expansionState)
  if (next.has(rowId)) next.delete(rowId)
  else next.add(rowId)
  return next
}

export function stopDetailToggleGridKeyboardNav(event: {
  key: string
  stopPropagation: () => void
}): void {
  if (event.key === " " || event.key === "Enter") event.stopPropagation()
}

export function resolveDetailPanelHeight<TRow>({
  defaultHeight,
  detailPanelHeight,
  entry,
  hasDetail,
}: {
  defaultHeight: number
  detailPanelHeight:
    | number
    | ((params: { row: TRow; rowId: RowId; rowIndex: number }) => number)
    | undefined
  entry: DetailPanelHeightEntry<TRow>
  hasDetail: boolean
}): number {
  if (!hasDetail) return 0
  const params = { row: entry.row, rowId: entry.rowId, rowIndex: entry.index }
  const height =
    typeof detailPanelHeight === "function"
      ? detailPanelHeight(params)
      : (detailPanelHeight ?? defaultHeight)
  return normalizeDetailPanelHeight(height)
}

export function detailRowHeight(rowHeight: number, detailHeight: number): number {
  return normalizeDetailPanelHeight(rowHeight) + normalizeDetailPanelHeight(detailHeight)
}

export function normalizeDetailPanelHeight(height: number): number {
  return Number.isFinite(height) ? Math.max(0, height) : 0
}

export function detailPanelStyle(top: number, height: number, width: number): CSSProperties {
  const normalizedHeight = normalizeDetailPanelHeight(height)
  const normalizedWidth = Number.isFinite(width) ? Math.max(width, 1) : 1
  return {
    height: normalizedHeight,
    left: 0,
    minWidth: "100%",
    overflow: "auto",
    position: "absolute",
    top: normalizeDetailPanelHeight(top),
    width: normalizedWidth,
  }
}
