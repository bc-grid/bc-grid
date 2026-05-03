import type { BcCellPosition, ColumnId, RowId } from "@bc-grid/core"
import type { CSSProperties, ReactNode } from "react"
import {
  type DataRowEntry,
  type GroupRowEntry,
  type ResolvedColumn,
  cellDomId,
  cellStyle,
  classNames,
  headerDomId,
  pinnedClassName,
  pinnedEdgeClassName,
} from "./gridInternals"
import { DisclosureChevron } from "./internal/disclosure-icon"
import { BcGridTooltip } from "./tooltip"
import type { BcCellRendererParams } from "./types"
import { formatCellValue, getCellValue } from "./value"

interface SearchTextPart {
  match: boolean
  text: string
}

interface RenderBodyCellParams<TRow> {
  activeCell: BcCellPosition | null
  column: ResolvedColumn<TRow> | undefined
  domBaseId: string
  entry: DataRowEntry<TRow>
  locale: string | undefined
  onCellFocus: ((position: BcCellPosition) => void) | undefined
  pinnedEdge: "left" | "right" | null
  pinnedLaneOffset?: number | undefined
  scrollLeft: number
  searchText: string
  selected: boolean
  disabled: boolean
  expanded: boolean
  /**
   * Position of the cell currently hosting an editor, or `null` when no
   * cell is being edited. The cell at this position emits
   * `aria-current="true"` per `editing-rfc §ARIA states on the cell` so
   * AT can locate the edit target while the editor input owns DOM focus.
   */
  editingCell?: BcCellPosition | null
  setActiveCell: (next: BcCellPosition | null) => void
  totalWidth: number
  viewportWidth: number
  virtualCol: { index: number; left: number; width: number; pinned: "left" | "right" | null }
  virtualRow: { height: number }
  /**
   * Overlay-aware lookup from the editing controller. When the cell has
   * been edited locally (committed via the editor framework) the overlay
   * holds the new value; the renderer prefers it over the raw row[field]
   * read so the grid reflects the commit immediately even before the
   * consumer mirrors it into their own data prop.
   */
  hasOverlayValue?: (rowId: RowId, columnId: ColumnId) => boolean
  getOverlayValue?: (rowId: RowId, columnId: ColumnId) => unknown
  /**
   * Per-cell editing entry from the controller's `getCellEditEntry`.
   * When defined, the cell has been edited (or is in flight) — the
   * renderer reflects pending / error / dirty state via
   * `data-bc-grid-cell-state` and the matching `BcCellRendererParams`
   * fields per `editing-rfc §Dirty Tracking`.
   */
  getCellEditEntry?: (
    rowId: RowId,
    columnId: ColumnId,
  ) => { pending: boolean; error?: string } | undefined
  /**
   * Aggregated edit state for the row (any cell pending / error). Used
   * by the renderer to populate `BcCellRendererParams.rowState.pending`
   * and `.error`, which the `<BcEditGrid>` action column reads to
   * disable destructive actions while a row has an in-flight commit.
   * Per `editing-rfc §Server commit + optimistic UI` (concurrency).
   */
  getRowEditState?: (rowId: RowId) => { pending: boolean; error?: string } | null
  /**
   * Validation-rejection flash predicate from the controller. When
   * true for `(rowId, columnId)`, the cell renders the
   * `data-bc-grid-error-flash="true"` attribute that the theming
   * package pairs with a 600 ms keyframe pulse so sighted users see
   * which cell was *just* rejected. The controller manages the timer
   * + auto-clear (immediate clear on a successful re-commit on the
   * same cell). Audit P1-W3-4.
   */
  isCellFlashing?: (rowId: RowId, columnId: ColumnId) => boolean
}

interface RenderGroupRowCellParams<TRow> {
  activeCell: BcCellPosition | null
  colCount: number
  column: ResolvedColumn<TRow> | undefined
  domBaseId: string
  entry: GroupRowEntry
  groupSelectionDisabled?: boolean
  groupSelectionState?: "all" | "some" | "none"
  onToggleSelection?: (entry: GroupRowEntry) => void
  onToggle: (entry: GroupRowEntry) => void
  totalWidth: number
  virtualRow: { height: number }
}

export function renderBodyCell<TRow>({
  activeCell,
  column,
  domBaseId,
  entry,
  locale,
  onCellFocus,
  pinnedEdge,
  pinnedLaneOffset,
  scrollLeft,
  searchText,
  selected,
  disabled,
  expanded,
  editingCell,
  setActiveCell,
  totalWidth,
  viewportWidth,
  virtualCol,
  virtualRow,
  hasOverlayValue,
  getOverlayValue,
  getCellEditEntry,
  getRowEditState,
  isCellFlashing,
}: RenderBodyCellParams<TRow>): ReactNode {
  if (!column) return null

  const overlayApplies = hasOverlayValue?.(entry.rowId, column.columnId) ?? false
  const value = overlayApplies
    ? getOverlayValue?.(entry.rowId, column.columnId)
    : getCellValue(entry.row, column.source)
  const formattedValue = formatCellValue(value, entry.row, column.source, locale)
  // Aggregate row edit state for `rowState.pending` / `.error` /
  // `.dirty` so the BcEditGrid action column can disable destructive
  // actions while a row has an in-flight commit, and surface a
  // "Discard" action only when there are uncommitted edits to roll
  // back. `null` when the row has no edits at all. Audit P1-W3-3 +
  // editing-rfc §Server commit + optimistic UI.
  const rowEditState = getRowEditState?.(entry.rowId) ?? null
  const rowState = {
    rowId: entry.rowId,
    index: entry.index,
    selected,
    disabled,
    expanded,
    ...(entry.level != null ? { level: entry.level } : {}),
    ...(rowEditState?.pending ? { pending: true } : {}),
    ...(rowEditState?.error != null ? { error: rowEditState.error } : {}),
    ...(rowEditState != null ? { dirty: true } : {}),
  }

  // Editing state per `editing-rfc §Dirty Tracking`. Order of precedence:
  //   - error: async commit / server reject (highest priority)
  //   - pending: async commit in flight
  //   - dirty: locally edited, no error / pending in flight
  //   - undefined (default): clean cell
  // The overlay-applies check serves as the "isDirty" signal — a cell
  // that has any patch in the overlay is dirty. The cell-edit entry
  // adds the pending / error nuance on top.
  const editEntry = getCellEditEntry?.(entry.rowId, column.columnId)
  const isDirty = overlayApplies
  const editPending = editEntry?.pending ?? false
  const editError = editEntry?.error
  const cellEditState: "error" | "pending" | "dirty" | undefined = editError
    ? "error"
    : editPending
      ? "pending"
      : isDirty
        ? "dirty"
        : undefined
  // Flash window for the most-recent validation rejection (audit
  // P1-W3-4). Theming pairs `data-bc-grid-error-flash="true"` with a
  // ~600 ms keyframe pulse so sighted users see WHICH cell was just
  // rejected when several stripes are stacked on screen.
  const errorFlashing = isCellFlashing?.(entry.rowId, column.columnId) ?? false

  const isEditingThisCell =
    editingCell?.rowId === entry.rowId && editingCell?.columnId === column.columnId
  const params = {
    value,
    formattedValue,
    row: entry.row,
    rowId: entry.rowId,
    column: column.source,
    searchText,
    rowState,
    editing: isEditingThisCell,
    pending: editPending,
    ...(editError != null ? { editError } : {}),
    isDirty,
  } satisfies BcCellRendererParams<TRow, unknown>
  const position = { rowId: entry.rowId, columnId: column.columnId }
  const active = activeCell?.rowId === position.rowId && activeCell.columnId === position.columnId
  const coreClassName =
    typeof column.source.cellClass === "function"
      ? column.source.cellClass(value, entry.row)
      : column.source.cellClass
  const reactClassName =
    typeof column.source.cellClassName === "function"
      ? column.source.cellClassName(params)
      : column.source.cellClassName
  const customStyle =
    typeof column.source.cellStyle === "function"
      ? column.source.cellStyle(params)
      : column.source.cellStyle
  const role = column.source.rowHeader ? "rowheader" : "gridcell"
  const cellId = cellDomId(domBaseId, entry.rowId, column.columnId)
  const tooltip =
    typeof column.source.tooltip === "function"
      ? column.source.tooltip(entry.row)
      : column.source.tooltip

  // Hidden error description, referenced via `aria-describedby` so AT
  // reads "{column header} {error}" when the cell is announced. Kept
  // adjacent to the cell so the relationship is preserved across
  // virtualization. Per `editing-rfc §ARIA states on the cell`.
  const errorId = editError ? `${cellId}-error` : undefined
  const lanePinned = pinnedLaneOffset != null
  const cellLeft = lanePinned ? virtualCol.left - pinnedLaneOffset : virtualCol.left

  return (
    <BcGridTooltip key={column.columnId} content={tooltip} id={`${cellId}-tooltip`}>
      <div
        id={cellId}
        className={classNames(
          "bc-grid-cell",
          pinnedClassName(virtualCol.pinned),
          pinnedEdgeClassName(pinnedEdge),
          column.align === "right" ? "bc-grid-cell-right" : undefined,
          active ? "bc-grid-cell-active" : undefined,
          coreClassName,
          reactClassName,
        )}
        role={role}
        aria-colindex={virtualCol.index + 1}
        aria-labelledby={`${headerDomId(domBaseId, column.columnId)} ${cellId}`}
        aria-selected={selected || undefined}
        aria-invalid={editError ? true : undefined}
        aria-describedby={errorId}
        aria-current={isEditingThisCell ? "true" : undefined}
        data-bc-grid-active-cell={active || undefined}
        data-bc-grid-cell-state={cellEditState}
        data-bc-grid-error-flash={errorFlashing ? "true" : undefined}
        data-column-id={column.columnId}
        style={{
          ...cellStyle({
            align: column.align,
            height: virtualRow.height,
            left: cellLeft,
            pinned: lanePinned ? null : virtualCol.pinned,
            scrollLeft,
            totalWidth,
            viewportWidth,
            width: virtualCol.width,
          }),
          ...customStyle,
        }}
        onClick={() => {
          setActiveCell(position)
          onCellFocus?.(position)
        }}
      >
        {column.source.cellRenderer
          ? column.source.cellRenderer(params)
          : searchText
            ? highlightSearchText(formattedValue, searchText)
            : formattedValue}
        {errorId ? (
          <span id={errorId} style={visuallyHiddenCellErrorStyle}>
            {editError}
          </span>
        ) : null}
      </div>
    </BcGridTooltip>
  )
}

export function renderGroupRowCell<TRow>({
  activeCell,
  colCount,
  column,
  domBaseId,
  entry,
  groupSelectionDisabled,
  groupSelectionState,
  onToggleSelection,
  onToggle,
  totalWidth,
  virtualRow,
}: RenderGroupRowCellParams<TRow>): ReactNode {
  if (!column) return null

  const label = entry.label
  const cellId = cellDomId(domBaseId, entry.rowId, column.columnId)
  const active = activeCell?.rowId === entry.rowId

  return (
    <div
      id={cellId}
      className={classNames(
        "bc-grid-cell",
        "bc-grid-group-cell",
        active ? "bc-grid-cell-active" : undefined,
      )}
      role="rowheader"
      aria-colindex={1}
      aria-colspan={Math.max(1, colCount)}
      data-column-id={column.columnId}
      data-bc-grid-active-cell={active || undefined}
      style={groupCellStyle(entry.level, virtualRow.height, totalWidth)}
    >
      {onToggleSelection && groupSelectionState ? (
        <span
          className="bc-grid-group-selection"
          data-bc-grid-group-selection-state={groupSelectionState}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={stopGridKeyboardNav}
        >
          <input
            ref={(el) => {
              if (el) el.indeterminate = groupSelectionState === "some"
            }}
            type="checkbox"
            className="bc-grid-cell-checkbox"
            aria-label={`Select rows in ${label}`}
            checked={groupSelectionState === "all"}
            disabled={groupSelectionDisabled}
            onChange={() => onToggleSelection(entry)}
            onClick={(event) => event.stopPropagation()}
          />
        </span>
      ) : null}
      <button
        type="button"
        className="bc-grid-group-toggle"
        aria-expanded={entry.expanded}
        aria-label={entry.expanded ? `Collapse ${label}` : `Expand ${label}`}
        onClick={(event) => {
          event.stopPropagation()
          onToggle(entry)
        }}
        onKeyDown={stopGridKeyboardNav}
      >
        <DisclosureChevron className="bc-grid-group-toggle-icon" />
      </button>
      <span className="bc-grid-group-label">{label}</span>
      <span className="bc-grid-group-count">({entry.childCount})</span>
    </div>
  )
}

function groupCellStyle(level: number, height: number, width: number): CSSProperties {
  return {
    alignItems: "center",
    display: "flex",
    gap: "0.375rem",
    height,
    left: 0,
    minWidth: 0,
    overflow: "hidden",
    paddingInline: "var(--bc-grid-cell-padding-x, 12px)",
    paddingLeft: `calc(var(--bc-grid-cell-padding-x, 12px) + ${(level - 1) * 1.25}rem)`,
    position: "absolute",
    textOverflow: "ellipsis",
    top: 0,
    whiteSpace: "nowrap",
    width: Math.max(width, 1),
    zIndex: 1,
  }
}

function stopGridKeyboardNav(event: { key: string; stopPropagation: () => void }): void {
  if (event.key === " " || event.key === "Enter") event.stopPropagation()
}

const visuallyHiddenCellErrorStyle: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
  border: 0,
}

export function splitSearchText(value: string, searchText: string): SearchTextPart[] {
  const needle = searchText.trim()
  if (!needle) return [{ match: false, text: value }]

  const haystack = value.toLowerCase()
  const query = needle.toLowerCase()
  const parts: SearchTextPart[] = []
  let start = 0

  while (start < value.length) {
    const matchIndex = haystack.indexOf(query, start)
    if (matchIndex === -1) break
    if (matchIndex > start) {
      parts.push({ match: false, text: value.slice(start, matchIndex) })
    }
    const end = matchIndex + query.length
    parts.push({ match: true, text: value.slice(matchIndex, end) })
    start = end
  }

  if (start < value.length) parts.push({ match: false, text: value.slice(start) })
  return parts.length > 0 ? parts : [{ match: false, text: value }]
}

export function highlightSearchText(value: string, searchText: string): ReactNode {
  return splitSearchText(value, searchText).map((part, index) =>
    part.match ? (
      <mark
        className="bc-grid-search-match"
        data-bc-grid-search-match="true"
        key={`${part.text}-${index}`}
      >
        {part.text}
      </mark>
    ) : (
      part.text
    ),
  )
}
