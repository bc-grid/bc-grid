import type { BcColumnFilter, BcGridSort, ColumnId } from "@bc-grid/core"
import {
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  Suspense,
  lazy,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import {
  type DateFilterOperator,
  type NumberFilterOperator,
  type SetFilterOperator,
  type SetFilterOptionLoader,
  type TextFilterInput,
  type TextFilterOperator,
  decodeDateFilterInput,
  decodeDateRangeFilterInput,
  decodeNumberFilterInput,
  decodeNumberRangeFilterInput,
  decodeSetFilterInput,
  decodeTextFilterInput,
  encodeDateFilterInput,
  encodeDateRangeFilterInput,
  encodeNumberFilterInput,
  encodeNumberRangeFilterInput,
  encodeSetFilterInput,
  encodeTextFilterInput,
} from "./filter"
import { getReactFilterDefinition, reportUnknownFilterDefinition } from "./filterRegistry"
import {
  type ColumnGroupHeaderCell,
  type ResolvedColumn,
  cellStyle,
  classNames,
  domToken,
  headerDomId,
  pinnedClassName,
  pinnedEdgeClassName,
} from "./gridInternals"
import { MoreVerticalIcon } from "./internal/header-icons"
import { usePopupDismiss } from "./internal/popup-dismiss"
import { computePopupPosition } from "./internal/popup-position"
import type { BcGridMessages, BcReactFilterDefinition } from "./types"

/**
 * Modifier flags forwarded from the header click / keyboard handler so the
 * grid can route to single-column toggle vs multi-column append vs remove.
 */
export interface SortModifiers {
  shiftKey: boolean
  ctrlOrMeta: boolean
}

/**
 * Pure helper that resolves the column header's `aria-sort` attribute
 * value from the current sort direction and whether the column is
 * sortable at all. Per `accessibility-rfc §Semantic DOM Model`:
 * "Sortable headers set `aria-sort='ascending' | 'descending' | 'none'
 * | 'other'` only on the active sorted header where applicable."
 *
 *   - When the column is currently sorted, return the matching
 *     "ascending" / "descending" string.
 *   - When the column is sortable but not currently sorted, return
 *     `"none"` so AT users know the column is sortable.
 *   - When the column is not sortable at all, return `undefined` so
 *     no `aria-sort` attribute is emitted (cleaner DOM than emitting
 *     `aria-sort="none"` on non-sortable columns).
 *
 * Exported for unit testing; `renderHeaderCell` uses it inline.
 */
/**
 * Stable DOM id for a column's filter popup. Single source of truth so
 * the popup root and the trigger button's `aria-controls` linkage agree.
 * Exported for unit testing.
 */
export function filterPopupDomId(columnId: ColumnId): string {
  return `bc-grid-filter-popup-${domToken(columnId)}`
}

export function ariaSortFor(
  direction: "asc" | "desc" | undefined,
  sortable: boolean,
): "ascending" | "descending" | "none" | undefined {
  if (direction === "asc") return "ascending"
  if (direction === "desc") return "descending"
  return sortable ? "none" : undefined
}

export interface ColumnMenuAnchor {
  x: number
  y: number
}

interface RenderHeaderCellParams<TRow> {
  column: ResolvedColumn<TRow>
  domBaseId: string
  headerHeight: number
  index: number
  onColumnMenu: (column: ResolvedColumn<TRow>, anchor: ColumnMenuAnchor) => void
  onConsumeReorderClickSuppression: () => boolean
  onReorderEnd: (event: PointerEvent<HTMLDivElement>) => void
  onReorderMove: (event: PointerEvent<HTMLDivElement>) => void
  onReorderStart: (column: ResolvedColumn<TRow>, event: PointerEvent<HTMLDivElement>) => void
  onResizeEnd: (event: PointerEvent<HTMLDivElement>) => void
  onResizeMove: (event: PointerEvent<HTMLDivElement>) => void
  onResizeStart: (column: ResolvedColumn<TRow>, event: PointerEvent<HTMLDivElement>) => void
  onSort: (column: ResolvedColumn<TRow>, modifiers: SortModifiers) => void
  pinnedEdge: "left" | "right" | null
  reorderingColumnId: ColumnId | undefined
  showColumnMenu?: boolean
  sortState: readonly BcGridSort[]
  /**
   * Filter-popup hookups for `column.filter.variant === "popup"` columns
   * per `filter-popup-variant`. The funnel button renders inside the
   * header cell; clicking it asks the grid to open the popup with the
   * button's bounding rect as the anchor. Active state when filterText
   * is non-empty.
   */
  filterText?: string
  filterPopupOpen?: boolean
  onOpenFilterPopup?: (column: ResolvedColumn<TRow>, anchor: DOMRect) => void
}

interface RenderColumnGroupHeaderCellParams<TRow> {
  cell: ColumnGroupHeaderCell<TRow>
  domBaseId: string
  headerHeight: number
}

export function renderColumnGroupHeaderCell<TRow>({
  cell,
  domBaseId,
  headerHeight,
}: RenderColumnGroupHeaderCellParams<TRow>): ReactNode {
  const headerLabel = typeof cell.header === "string" ? cell.header : cell.groupId

  return (
    <div
      key={`${cell.groupId}-${cell.depth}-${cell.ariaColIndex}`}
      id={`${domBaseId}-header-group-${domToken(cell.groupId)}-${cell.depth}-${cell.ariaColIndex}`}
      className={classNames(
        "bc-grid-cell",
        "bc-grid-header-cell",
        "bc-grid-header-group-cell",
        pinnedClassName(cell.pinned),
        pinnedEdgeClassName(cell.pinnedEdge),
      )}
      role="columnheader"
      aria-colindex={cell.ariaColIndex}
      aria-colspan={cell.ariaColSpan}
      aria-label={headerLabel}
      data-bc-grid-column-group-id={cell.groupId}
      data-bc-grid-column-group-depth={cell.depth}
      style={cellStyle({
        align: "center",
        height: headerHeight,
        left: cell.left,
        pinned: cell.pinned,
        width: cell.width,
        zIndex: cell.pinned ? 4 : 3,
      })}
    >
      <span className="bc-grid-header-group-label">{cell.header}</span>
    </div>
  )
}

export function renderHeaderCell<TRow>({
  column,
  domBaseId,
  headerHeight,
  index,
  onColumnMenu,
  onConsumeReorderClickSuppression,
  onReorderEnd,
  onReorderMove,
  onReorderStart,
  onResizeEnd,
  onResizeMove,
  onResizeStart,
  onSort,
  pinnedEdge,
  reorderingColumnId,
  showColumnMenu = true,
  sortState,
  filterText,
  filterPopupOpen,
  onOpenFilterPopup,
}: RenderHeaderCellParams<TRow>): ReactNode {
  const sortIndex = sortState.findIndex((entry) => entry.columnId === column.columnId)
  const sort = sortIndex >= 0 ? sortState[sortIndex] : undefined
  const sortable = column.source.sortable !== false
  const ariaSort = ariaSortFor(sort?.direction, sortable)
  // Show the 1-based sort-order index when more than one column is sorted,
  // so users can see the priority order they composed via Shift+click.
  const showSortOrder = sort != null && sortState.length > 1
  const headerLabel =
    typeof column.source.header === "string"
      ? column.source.header
      : // Synthetic master/detail column renders icon-only chrome; keep its
        // columnheader accessible name human-readable instead of exposing the
        // reserved internal column id.
        column.columnId === "__bc_detail"
        ? "Details"
        : column.columnId
  const columnMenuEnabled = showColumnMenu && column.source.columnMenu !== false

  const handleClick = sortable
    ? (event: MouseEvent<HTMLDivElement>) => {
        if (onConsumeReorderClickSuppression()) {
          event.preventDefault()
          event.stopPropagation()
          return
        }
        event.stopPropagation()
        onSort(column, {
          shiftKey: event.shiftKey,
          ctrlOrMeta: event.ctrlKey || event.metaKey,
        })
      }
    : undefined

  const handleKeyDown = sortable
    ? (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key !== "Enter" && event.key !== " ") return
        event.preventDefault()
        event.stopPropagation()
        onSort(column, {
          shiftKey: event.shiftKey,
          ctrlOrMeta: event.ctrlKey || event.metaKey,
        })
      }
    : undefined

  return (
    <div
      key={column.columnId}
      id={headerDomId(domBaseId, column.columnId)}
      className={classNames(
        "bc-grid-cell",
        "bc-grid-header-cell",
        column.source.resizable === false ? undefined : "bc-grid-header-cell-resizable",
        sortable ? "bc-grid-header-cell-sortable" : undefined,
        reorderingColumnId === column.columnId ? "bc-grid-header-cell-reordering" : undefined,
        sort ? `bc-grid-header-cell-sorted-${sort.direction}` : undefined,
        pinnedClassName(column.pinned),
        pinnedEdgeClassName(pinnedEdge),
        column.align === "right" ? "bc-grid-cell-right" : undefined,
      )}
      role="columnheader"
      aria-colindex={index + 1}
      aria-sort={ariaSort}
      tabIndex={sortable ? 0 : undefined}
      onClick={handleClick}
      onContextMenu={
        columnMenuEnabled
          ? (event) => {
              event.preventDefault()
              event.stopPropagation()
              onColumnMenu(column, { x: event.clientX, y: event.clientY })
            }
          : undefined
      }
      onKeyDown={handleKeyDown}
      onPointerDown={(event) => onReorderStart(column, event)}
      onPointerMove={onReorderMove}
      onPointerUp={onReorderEnd}
      onPointerCancel={onReorderEnd}
      style={cellStyle({
        align: column.align,
        height: headerHeight,
        left: column.left,
        pinned: column.pinned,
        width: column.width,
        zIndex: column.pinned ? 4 : 3,
      })}
      data-column-id={column.columnId}
      data-bc-grid-resizable={column.source.resizable === false ? undefined : "true"}
      aria-label={headerLabel}
    >
      <span className="bc-grid-header-label">{column.source.header}</span>
      {sort ? (
        <span
          aria-hidden="true"
          className="bc-grid-header-sort-indicator"
          data-bc-grid-sort-index={showSortOrder ? sortIndex + 1 : undefined}
        >
          {sort.direction === "asc" ? "↑" : "↓"}
          {showSortOrder ? (
            <span className="bc-grid-header-sort-order">{sortIndex + 1}</span>
          ) : null}
        </span>
      ) : null}
      {column.source.filter && column.source.filter.variant === "popup" && onOpenFilterPopup ? (
        <button
          aria-haspopup="dialog"
          aria-expanded={filterPopupOpen ? true : undefined}
          // Radix-style trigger linkage: while the popup is open, the
          // trigger announces what surface it controls. Stable id is
          // shared with `<FilterPopup>`'s own DOM id via
          // `filterPopupDomId(columnId)`.
          aria-controls={filterPopupOpen ? filterPopupDomId(column.columnId) : undefined}
          aria-label={`Filter ${headerLabel}${filterText ? " (active)" : ""}`}
          className={classNames(
            "bc-grid-header-filter-button",
            filterText ? "bc-grid-header-filter-button-active" : undefined,
          )}
          data-bc-grid-filter-button="true"
          data-active={filterText ? "true" : undefined}
          // Mirrors the Radix Popover trigger contract — `data-state`
          // tracks the popup state ("open" / "closed") so consumer CSS
          // can hook the trigger the same way it would a Radix
          // PopoverTrigger. Lets the trigger render an open-state
          // background subtle highlight without a separate boolean
          // class on the React side.
          data-state={filterPopupOpen ? "open" : "closed"}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            onOpenFilterPopup(column, event.currentTarget.getBoundingClientRect())
          }}
          // Belt-and-braces propagation hardening so a click / tap on the
          // filter trigger never bubbles into the parent header cell's
          // sort, reorder, or right-click handlers. Mirrors the column
          // menu trigger's pointer contract.
          onContextMenu={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => {
            event.preventDefault()
            event.stopPropagation()
          }}
          onPointerUp={(event) => event.stopPropagation()}
          onPointerCancel={(event) => event.stopPropagation()}
          type="button"
        >
          <FunnelIcon active={Boolean(filterText)} />
        </button>
      ) : null}
      {columnMenuEnabled ? (
        <button
          aria-haspopup="menu"
          aria-label={`Column options for ${headerLabel}`}
          className="bc-grid-header-menu-button"
          data-bc-grid-column-menu-button="true"
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            const rect = event.currentTarget.getBoundingClientRect()
            onColumnMenu(column, { x: rect.left, y: rect.bottom + 4 })
          }}
          onContextMenu={(event) => {
            // Right-clicking the trigger should not open the column
            // menu via the header's onContextMenu or the browser
            // default — let the consumer right-click on the header
            // background instead.
            event.stopPropagation()
            event.preventDefault()
          }}
          onKeyDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => {
            // Belt-and-braces against the parent header's reorder
            // pointer handler: stop the event from bubbling to the
            // sortable / reorder gesture and prevent the default
            // focus-shift so a click doesn't lift the trigger out
            // before the popup measures the bounding rect.
            event.stopPropagation()
            event.preventDefault()
          }}
          onPointerUp={(event) => event.stopPropagation()}
          onPointerCancel={(event) => event.stopPropagation()}
          type="button"
        >
          {MoreVerticalIcon}
        </button>
      ) : null}
      {column.source.resizable === false ? null : (
        // Drag handle pinned to the right edge of the header cell. Pointer
        // events with setPointerCapture so the drag survives the cursor
        // leaving the handle's bounding box during the gesture.
        <div
          aria-hidden="true"
          className="bc-grid-header-resize-handle"
          data-bc-grid-resize-handle="true"
          onPointerDown={(event) => {
            event.stopPropagation()
            onResizeStart(column, event)
          }}
          onPointerMove={onResizeMove}
          onPointerUp={onResizeEnd}
          onPointerCancel={onResizeEnd}
          onClick={(event) => event.stopPropagation()}
          style={resizeHandleStyle}
        />
      )}
    </div>
  )
}

const resizeHandleStyle: CSSProperties = {
  position: "absolute",
  top: 0,
  right: 0,
  width: 6,
  height: "100%",
  cursor: "col-resize",
  // Above body cells but below the focus-ring outline (z-index: 5 in the
  // benchmarks stylesheet); 4 fits between body z-index 0 and active-cell
  // outline z-index 5.
  zIndex: 4,
  // No background — the handle is invisible but capturing. Theming can add
  // a hover treatment via .bc-grid-header-resize-handle:hover.
  touchAction: "none",
  // Prevent the click from bubbling to the parent header cell, which
  // would trigger sort. We also stopPropagation in the click handler.
  userSelect: "none",
}

interface RenderFilterCellParams<TRow> {
  column: ResolvedColumn<TRow>
  domBaseId: string
  filterText: string
  headerHeight: number
  index: number
  loadSetFilterOptions?: SetFilterOptionLoader | undefined
  onFilterChange: (next: string) => void
  pinnedEdge: "left" | "right" | null
  /**
   * Localised filter strings. Threaded from the grid's resolved
   * messages so AT announcements / placeholders aren't hardcoded
   * English. Per `accessibility-rfc §Live Regions` ("Live text is
   * localized through the React layer; no hard-coded English inside
   * engine packages").
   */
  messages: BcGridMessages
}

export function renderFilterCell<TRow>({
  column,
  domBaseId,
  filterText,
  headerHeight,
  index,
  loadSetFilterOptions,
  onFilterChange,
  pinnedEdge,
  messages,
}: RenderFilterCellParams<TRow>): ReactNode {
  const filterConfig = column.source.filter === false ? undefined : column.source.filter
  const filterDisabled = filterConfig == null
  const filterType = filterConfig?.type ?? "text"
  const isPopupVariant = filterConfig?.variant === "popup"
  const columnLabel =
    typeof column.source.header === "string" ? column.source.header : column.columnId
  const filterLabel = messages.filterAriaLabel({ columnLabel })
  const filterId = `${domBaseId}-filter-${domToken(column.columnId)}`
  return (
    <div
      key={`filter-${column.columnId}`}
      className={classNames(
        "bc-grid-cell",
        "bc-grid-filter-cell",
        pinnedClassName(column.pinned),
        pinnedEdgeClassName(pinnedEdge),
        column.align === "right" ? "bc-grid-cell-right" : undefined,
      )}
      role="gridcell"
      aria-colindex={index + 1}
      style={cellStyle({
        align: column.align,
        height: headerHeight,
        left: column.left,
        pinned: column.pinned,
        width: column.width,
        zIndex: column.pinned ? 4 : 3,
      })}
      data-column-id={column.columnId}
      onClick={(event) => {
        // Clicks on the filter cell shouldn't bubble to the header (which
        // would toggle sort).
        event.stopPropagation()
      }}
    >
      {filterDisabled || isPopupVariant ? null : (
        <FilterEditorBody
          filterType={filterType}
          filterText={filterText}
          filterId={filterId}
          filterLabel={filterLabel}
          column={column.source}
          columnId={column.columnId}
          loadSetFilterOptions={loadSetFilterOptions}
          onFilterChange={onFilterChange}
          surface="inline"
          messages={messages}
        />
      )}
    </div>
  )
}

type FilterFocusElement = HTMLInputElement | HTMLSelectElement | HTMLButtonElement
type FilterKeyDownHandler = (event: KeyboardEvent<HTMLElement>) => void
type BlankFilterOperator = "blank" | "not-blank"

const SetFilterMenu = lazy(() =>
  import("./setFilterMenu").then((module) => ({ default: module.SetFilterMenu })),
)

function isBlankFilterOperator(value: unknown): value is BlankFilterOperator {
  return value === "blank" || value === "not-blank"
}

function isTextContextFilterOperator(value: unknown): value is "current-user" | "current-team" {
  return value === "current-user" || value === "current-team"
}

function isTextValueLessOperator(value: TextFilterOperator): boolean {
  return isBlankFilterOperator(value) || isTextContextFilterOperator(value)
}

function isDateValueLessOperator(value: DateFilterOperator): boolean {
  return (
    value === "today" ||
    value === "yesterday" ||
    value === "this-week" ||
    value === "last-week" ||
    value === "this-month" ||
    value === "last-month" ||
    value === "this-fiscal-quarter" ||
    value === "last-fiscal-quarter" ||
    value === "this-fiscal-year" ||
    value === "last-fiscal-year"
  )
}

function isSetValueLessOperator(value: SetFilterOperator): boolean {
  return isBlankFilterOperator(value) || value === "current-user" || value === "current-team"
}

function BlankFilterToggle({
  filterLabel,
  op,
  onChange,
  onKeyDown,
}: {
  filterLabel: string
  op: BlankFilterOperator
  onChange: (op: BlankFilterOperator) => void
  onKeyDown: FilterKeyDownHandler
}): ReactNode {
  return (
    <div className="bc-grid-filter-blank-toggle" role="group" aria-label={`${filterLabel} blank`}>
      <button
        type="button"
        className="bc-grid-filter-text-toggle"
        aria-pressed={op === "blank"}
        onClick={() => onChange("blank")}
        onKeyDown={onKeyDown}
      >
        Blank
      </button>
      <button
        type="button"
        className="bc-grid-filter-text-toggle"
        aria-pressed={op === "not-blank"}
        onClick={() => onChange("not-blank")}
        onKeyDown={onKeyDown}
      >
        Not blank
      </button>
    </div>
  )
}

function TextFilterControl({
  filterId,
  filterLabel,
  filterText,
  onFilterChange,
  onFilterKeyDown,
  primaryRef,
  placeholder,
  surface = "advanced",
}: {
  filterId: string
  filterLabel: string
  filterText: string
  onFilterChange: (next: string) => void
  onFilterKeyDown: FilterKeyDownHandler
  primaryRef?: { current: FilterFocusElement | null }
  placeholder?: string
  surface?: "advanced" | "inline"
}): ReactNode {
  const input = decodeTextFilterInput(filterText)
  if (surface === "inline") {
    return (
      <div className="bc-grid-filter-text bc-grid-filter-text-compact">
        <input
          ref={(el) => {
            if (primaryRef) primaryRef.current = el
          }}
          aria-label={filterLabel}
          className="bc-grid-filter-input"
          id={filterId}
          type="text"
          value={input.value}
          onChange={(event) => onFilterChange(event.currentTarget.value)}
          onKeyDown={onFilterKeyDown}
          placeholder={placeholder}
        />
      </div>
    )
  }

  const emit = (next: {
    op: TextFilterOperator
    value: string
    caseSensitive: boolean
    regex: boolean
  }) => {
    if (isTextValueLessOperator(next.op)) {
      onFilterChange(encodeTextFilterInput({ op: next.op, value: "" }))
      return
    }
    if (next.op === "contains" && !next.caseSensitive && !next.regex) {
      // Preserve the legacy plain-string contract for the default case so
      // pre-existing persisted state and consumers reading filterText keep
      // round-tripping unchanged.
      onFilterChange(next.value)
      return
    }
    const payload: TextFilterInput = { op: next.op, value: next.value }
    if (next.caseSensitive) payload.caseSensitive = true
    if (next.regex || next.op === "regex") payload.regex = true
    onFilterChange(encodeTextFilterInput(payload))
  }
  const flat = {
    op: input.op,
    value: input.value,
    caseSensitive: input.caseSensitive === true,
    regex: input.regex === true,
  }
  const regexMode = input.op === "regex" || (input.op !== "fuzzy" && flat.regex)
  const update = (next: Partial<typeof flat>) => emit({ ...flat, ...next })
  const blankOp = isBlankFilterOperator(input.op) ? input.op : null
  const contextOp = isTextContextFilterOperator(input.op)

  return (
    <div className="bc-grid-filter-text">
      <select
        aria-label={`${filterLabel} operator`}
        className="bc-grid-filter-select"
        value={input.op}
        onChange={(event) => {
          const op = event.currentTarget.value as TextFilterOperator
          update({
            op,
            ...(op === "regex" ? { regex: true } : {}),
            ...(op === "fuzzy" ? { regex: false } : {}),
          })
        }}
        onKeyDown={onFilterKeyDown}
      >
        <option value="contains">Contains</option>
        <option value="does-not-contain">Does not contain</option>
        <option value="regex">Regex</option>
        <option value="fuzzy">Fuzzy</option>
        <option value="equals">Equals</option>
        <option value="not-equals">Does not equal</option>
        <option value="starts-with">Starts with</option>
        <option value="ends-with">Ends with</option>
        <option value="current-user">Current user</option>
        <option value="current-team">Current team</option>
        <option value="blank">Blank</option>
        <option value="not-blank">Not blank</option>
      </select>
      {blankOp ? (
        <BlankFilterToggle
          filterLabel={filterLabel}
          op={blankOp}
          onChange={(op) => update({ op, value: "", caseSensitive: false, regex: false })}
          onKeyDown={onFilterKeyDown}
        />
      ) : contextOp ? null : (
        <>
          <input
            ref={(el) => {
              if (primaryRef) primaryRef.current = el
            }}
            aria-label={filterLabel}
            className="bc-grid-filter-input"
            id={filterId}
            type="text"
            value={input.value}
            onChange={(event) => update({ value: event.currentTarget.value })}
            onKeyDown={onFilterKeyDown}
            placeholder={
              regexMode ? "Regex pattern" : input.op === "fuzzy" ? "Fuzzy text" : placeholder
            }
            spellCheck={regexMode ? false : undefined}
            autoComplete={regexMode ? "off" : undefined}
          />
          <button
            type="button"
            aria-label={`${filterLabel} case sensitive`}
            aria-pressed={flat.caseSensitive}
            className="bc-grid-filter-text-toggle"
            title="Case sensitive"
            onClick={() => update({ caseSensitive: !flat.caseSensitive })}
            onKeyDown={onFilterKeyDown}
          >
            Aa
          </button>
          {input.op === "fuzzy" || input.op === "regex" ? null : (
            <button
              type="button"
              aria-label={`${filterLabel} regex`}
              aria-pressed={regexMode}
              className="bc-grid-filter-text-toggle"
              title="Regular expression"
              onClick={() => update({ regex: !regexMode })}
              onKeyDown={onFilterKeyDown}
            >
              .*
            </button>
          )}
        </>
      )}
    </div>
  )
}

function DateFilterControl({
  filterId,
  filterLabel,
  filterText,
  onFilterChange,
  onFilterKeyDown,
  primaryRef,
}: {
  filterId: string
  filterLabel: string
  filterText: string
  onFilterChange: (next: string) => void
  onFilterKeyDown: FilterKeyDownHandler
  primaryRef?: { current: FilterFocusElement | null }
}): ReactNode {
  const input = decodeDateFilterInput(filterText)
  const update = (next: Partial<typeof input>) => {
    const merged = { ...input, ...next }
    onFilterChange(encodeDateFilterInput(merged))
  }
  const updateOperator = (op: DateFilterOperator) => {
    if (isBlankFilterOperator(op) || isDateValueLessOperator(op) || op === "last-n-days") {
      update({ op, value: "", valueTo: "" })
      return
    }
    update({ op })
  }
  const blankOp = isBlankFilterOperator(input.op) ? input.op : null
  const valueLessOp = isDateValueLessOperator(input.op)

  return (
    <div className="bc-grid-filter-date">
      <select
        aria-label={`${filterLabel} operator`}
        className="bc-grid-filter-select"
        value={input.op}
        onChange={(event) => updateOperator(event.currentTarget.value as DateFilterOperator)}
        onKeyDown={onFilterKeyDown}
      >
        <option value="is">Is</option>
        <option value="not-equals">Is not</option>
        <option value="before">Before</option>
        <option value="after">After</option>
        <option value="between">Between</option>
        <option value="today">Today</option>
        <option value="yesterday">Yesterday</option>
        <option value="this-week">This week</option>
        <option value="last-week">Last week</option>
        <option value="last-n-days">Last N days</option>
        <option value="this-month">This month</option>
        <option value="last-month">Last month</option>
        <option value="mtd">Month to date</option>
        <option value="qtd">Quarter to date</option>
        <option value="ytd">Year to date</option>
        <option value="last-fiscal-week">Last fiscal week</option>
        <option value="this-fiscal-quarter">This fiscal quarter</option>
        <option value="last-fiscal-quarter">Last fiscal quarter</option>
        <option value="this-fiscal-year">This fiscal year</option>
        <option value="last-fiscal-year">Last fiscal year</option>
        <option value="blank">Blank</option>
        <option value="not-blank">Not blank</option>
      </select>
      {blankOp ? (
        <BlankFilterToggle
          filterLabel={filterLabel}
          op={blankOp}
          onChange={(op) => update({ op, value: "", valueTo: "" })}
          onKeyDown={onFilterKeyDown}
        />
      ) : input.op === "last-n-days" ? (
        <input
          ref={(el) => {
            if (primaryRef) primaryRef.current = el
          }}
          aria-label={filterLabel}
          className="bc-grid-filter-input"
          id={filterId}
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          value={input.value}
          onChange={(event) => update({ value: event.currentTarget.value })}
          onKeyDown={onFilterKeyDown}
        />
      ) : valueLessOp ? null : (
        <>
          <input
            ref={(el) => {
              if (primaryRef) primaryRef.current = el
            }}
            aria-label={filterLabel}
            className="bc-grid-filter-input"
            id={filterId}
            type="date"
            value={input.value}
            onChange={(event) => update({ value: event.currentTarget.value })}
            onKeyDown={onFilterKeyDown}
          />
          {input.op === "between" ? (
            <input
              aria-label={`${filterLabel} end date`}
              className="bc-grid-filter-input"
              type="date"
              value={input.valueTo ?? ""}
              onChange={(event) => update({ valueTo: event.currentTarget.value })}
              onKeyDown={onFilterKeyDown}
            />
          ) : null}
        </>
      )}
    </div>
  )
}

function SetFilterControl({
  columnId,
  filterId,
  filterLabel,
  filterText,
  loadSetFilterOptions,
  onFilterChange,
  onFilterKeyDown,
  primaryRef,
}: {
  columnId: ColumnId
  filterId: string
  filterLabel: string
  filterText: string
  loadSetFilterOptions?: SetFilterOptionLoader | undefined
  onFilterChange: (next: string) => void
  onFilterKeyDown: FilterKeyDownHandler
  primaryRef?: { current: FilterFocusElement | null }
}): ReactNode {
  const input = useMemo(() => decodeSetFilterInput(filterText), [filterText])
  const [draftOp, setDraftOp] = useState<SetFilterOperator>(input.op)
  const [open, setOpen] = useState(false)
  const [menuRect, setMenuRect] = useState<{ top: number; left: number; width: number } | null>(
    null,
  )
  const rootRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (filterText.length > 0) setDraftOp(input.op)
  }, [filterText.length, input.op])

  useEffect(() => {
    if (!open) return
    const handlePointerDown = (event: globalThis.PointerEvent) => {
      const target = event.target as Node | null
      if (target && rootRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener("pointerdown", handlePointerDown, true)
    return () => document.removeEventListener("pointerdown", handlePointerDown, true)
  }, [open])

  const selectedValueList = input.values

  const op = filterText.length > 0 ? input.op : draftOp

  const commit = (next: { op: SetFilterOperator; values: readonly string[] }) => {
    setDraftOp(next.op)
    const values = Array.from(new Set(next.values.filter((value) => value.length > 0)))
    if (isSetValueLessOperator(next.op)) {
      onFilterChange(encodeSetFilterInput({ op: next.op, values: [] }))
      return
    }
    if (values.length === 0) {
      onFilterChange("")
      return
    }
    onFilterChange(encodeSetFilterInput({ op: next.op, values }))
  }

  const openMenu = (button: HTMLButtonElement) => {
    const rect = button.getBoundingClientRect()
    setMenuRect({ top: rect.bottom + 4, left: rect.left, width: rect.width })
    setOpen(true)
  }

  const closeMenu = () => {
    setOpen(false)
    triggerRef.current?.focus()
  }

  const summary =
    op === "blank"
      ? "Blank rows"
      : op === "not-blank"
        ? "Not blank rows"
        : op === "current-user"
          ? "Current user"
          : op === "current-team"
            ? "Current team"
            : selectedValueList.length === 0
              ? "Select values"
              : `${selectedValueList.length} selected`
  const isActive = isSetValueLessOperator(op) || selectedValueList.length > 0
  const menuId = `${filterId}-set-menu`
  const pickerDisabled = isSetValueLessOperator(op)

  return (
    <div ref={rootRef} className="bc-grid-filter-set">
      <select
        aria-label={`${filterLabel} operator`}
        className="bc-grid-filter-select"
        value={op}
        onChange={(event) =>
          commit({ op: event.currentTarget.value as SetFilterOperator, values: selectedValueList })
        }
        onKeyDown={onFilterKeyDown}
      >
        <option value="in">In</option>
        <option value="not-in">Not in</option>
        <option value="current-user">Current user</option>
        <option value="current-team">Current team</option>
        <option value="blank">Blank</option>
        <option value="not-blank">Not blank</option>
      </select>
      <button
        ref={(el) => {
          triggerRef.current = el
          if (primaryRef) primaryRef.current = el
        }}
        aria-controls={open ? menuId : undefined}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`${filterLabel} values`}
        className="bc-grid-filter-set-button"
        data-active={isActive ? "true" : undefined}
        disabled={pickerDisabled}
        id={filterId}
        onClick={(event) => {
          event.preventDefault()
          if (open) {
            setOpen(false)
          } else {
            openMenu(event.currentTarget)
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape" && open) {
            event.stopPropagation()
            setOpen(false)
            return
          }
          onFilterKeyDown(event)
          if (event.key === "ArrowDown" && !open) {
            event.preventDefault()
            openMenu(event.currentTarget)
          }
        }}
        type="button"
      >
        <span className="bc-grid-filter-set-button-label">{summary}</span>
        <span aria-hidden="true" className="bc-grid-filter-set-button-caret">
          ▾
        </span>
      </button>
      {open && menuRect ? (
        <Suspense fallback={null}>
          <SetFilterMenu
            columnId={columnId}
            filterId={filterId}
            filterLabel={filterLabel}
            loadSetFilterOptions={loadSetFilterOptions}
            menuRect={menuRect}
            op={op}
            rootRef={rootRef}
            selectedValueList={selectedValueList}
            onClose={closeMenu}
            onCommit={commit}
          />
        </Suspense>
      ) : null}
    </div>
  )
}

/**
 * Inline funnel SVG. Outline variant for inactive (no filter); solid for
 * active (filter applied). 14×14 — matches the `...` column-menu button.
 */
function FunnelIcon({ active }: { active: boolean }): ReactNode {
  if (active) {
    return (
      <svg
        aria-hidden="true"
        className="bc-grid-header-filter-icon"
        viewBox="0 0 16 16"
        width="14"
        height="14"
      >
        <path
          d="M2 3a1 1 0 0 1 1-1h10a1 1 0 0 1 .8 1.6L10 8.5V13a1 1 0 0 1-1.4.9l-2-1A1 1 0 0 1 6 12V8.5L2.2 3.6A1 1 0 0 1 2 3Z"
          fill="currentColor"
        />
      </svg>
    )
  }
  return (
    <svg
      aria-hidden="true"
      className="bc-grid-header-filter-icon"
      viewBox="0 0 16 16"
      width="14"
      height="14"
    >
      <path
        d="M2 3a1 1 0 0 1 1-1h10a1 1 0 0 1 .8 1.6L10 8.5V13a1 1 0 0 1-1.4.9l-2-1A1 1 0 0 1 6 12V8.5L2.2 3.6A1 1 0 0 1 2 3Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * Reusable filter editor body — shared between the inline filter-row cell
 * and the popup-variant `<FilterPopup>`. One implementation, two surfaces.
 */
export function FilterEditorBody({
  column,
  columnId,
  filterType,
  filterText,
  filterId,
  filterLabel,
  loadSetFilterOptions,
  onFilterChange,
  allowEscapeKeyPropagation = false,
  autoFocus,
  surface = "advanced",
  messages,
}: {
  column?: unknown
  columnId: ColumnId
  filterType: BcColumnFilter["type"]
  filterText: string
  filterId: string
  filterLabel: string
  loadSetFilterOptions?: SetFilterOptionLoader | undefined
  onFilterChange: (next: string) => void
  allowEscapeKeyPropagation?: boolean
  autoFocus?: boolean
  surface?: "advanced" | "inline"
  messages: BcGridMessages
}): ReactNode {
  const focusRef = useRef<FilterFocusElement | null>(null)
  const onFilterKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (allowEscapeKeyPropagation && event.key === "Escape") return
    event.stopPropagation()
  }

  useLayoutEffect(() => {
    if (autoFocus) focusRef.current?.focus()
  }, [autoFocus])

  if (filterType === "boolean") {
    return (
      <select
        ref={(el) => {
          focusRef.current = el
        }}
        aria-label={filterLabel}
        className="bc-grid-filter-select"
        value={filterText}
        onChange={(event) => onFilterChange(event.currentTarget.value)}
        onKeyDown={onFilterKeyDown}
        id={filterId}
      >
        <option value="">Any</option>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>
    )
  }
  if (filterType === "number") {
    return (
      <NumberFilterControl
        filterId={filterId}
        filterLabel={filterLabel}
        filterText={filterText}
        onFilterChange={onFilterChange}
        onFilterKeyDown={onFilterKeyDown}
        primaryRef={focusRef}
        minPlaceholder={messages.filterMinPlaceholder}
        maxPlaceholder={messages.filterMaxPlaceholder}
      />
    )
  }
  if (filterType === "number-range") {
    return (
      <NumberRangeFilterControl
        filterId={filterId}
        filterLabel={filterLabel}
        filterText={filterText}
        onFilterChange={onFilterChange}
        onFilterKeyDown={onFilterKeyDown}
        primaryRef={focusRef}
        minPlaceholder={messages.filterMinPlaceholder}
        maxPlaceholder={messages.filterMaxPlaceholder}
      />
    )
  }
  if (filterType === "date") {
    return (
      <DateFilterControl
        filterId={filterId}
        filterLabel={filterLabel}
        filterText={filterText}
        onFilterChange={onFilterChange}
        onFilterKeyDown={onFilterKeyDown}
        primaryRef={focusRef}
      />
    )
  }
  if (filterType === "date-range") {
    return (
      <DateRangeFilterControl
        filterId={filterId}
        filterLabel={filterLabel}
        filterText={filterText}
        onFilterChange={onFilterChange}
        onFilterKeyDown={onFilterKeyDown}
        primaryRef={focusRef}
      />
    )
  }
  if (filterType === "set") {
    return (
      <SetFilterControl
        columnId={columnId}
        filterId={filterId}
        filterLabel={filterLabel}
        filterText={filterText}
        loadSetFilterOptions={loadSetFilterOptions}
        onFilterChange={onFilterChange}
        onFilterKeyDown={onFilterKeyDown}
        primaryRef={focusRef}
      />
    )
  }
  if (filterType === "text") {
    return (
      <TextFilterControl
        filterId={filterId}
        filterLabel={filterLabel}
        filterText={filterText}
        onFilterChange={onFilterChange}
        onFilterKeyDown={onFilterKeyDown}
        primaryRef={focusRef}
        placeholder={messages.filterPlaceholder}
        surface={surface}
      />
    )
  }

  const filterDefinition = getReactFilterDefinition(filterType)
  if (!filterDefinition?.Editor) {
    reportUnknownFilterDefinition(filterType, `${filterLabel} editor`)
    return null
  }
  return (
    <RegisteredFilterControl
      column={column}
      definition={filterDefinition}
      filterText={filterText}
      onFilterChange={onFilterChange}
    />
  )
}

function RegisteredFilterControl({
  column,
  definition,
  filterText,
  onFilterChange,
}: {
  column?: unknown
  definition: BcReactFilterDefinition
  filterText: string
  onFilterChange: (next: string) => void
}): ReactNode {
  const Editor = definition.Editor
  if (!Editor) return null
  let value: unknown = null
  if (filterText.trim().length > 0) {
    try {
      value = definition.parse(filterText)
    } catch {
      value = null
    }
  }
  return (
    <Editor
      value={value}
      commit={(next) => {
        onFilterChange(next == null ? "" : definition.serialize(next))
      }}
      clear={() => onFilterChange("")}
      column={column}
    />
  )
}

interface FilterPopupProps {
  anchor: DOMRect
  column?: unknown
  columnId: ColumnId
  filterType: BcColumnFilter["type"]
  filterText: string
  filterLabel: string
  loadSetFilterOptions?: SetFilterOptionLoader | undefined
  onFilterChange: (next: string) => void
  onClear: () => void
  onClose: () => void
  messages: BcGridMessages
}

/**
 * Pre-measurement estimate for the filter popup. Width tracks the
 * `.bc-grid-filter-popup` CSS contract (`width: min(20rem, ...)`);
 * height is a generic fallback before the actual editor renders. The
 * `useLayoutEffect` re-measures and re-positions once the DOM lands,
 * so this is only the first-paint estimate.
 */
const FILTER_POPUP_ESTIMATED_SIZE = { width: 320, height: 200 }
const FILTER_POPUP_VIEWPORT_MARGIN = 8

/**
 * Selectors the dismiss helper should NOT treat as outside-pointer
 * dismissals. The popup itself is excluded by `popupRef.contains`;
 * the trigger funnel button is excluded here so its own click toggles
 * cleanly instead of fighting an open-then-close race.
 */
const FILTER_POPUP_IGNORE_SELECTORS = ['[data-bc-grid-filter-button="true"]'] as const

function computeFilterPopupPosition(anchor: DOMRect, popup: { width: number; height: number }) {
  // SSR fallback: when `window` isn't present, render at the anchor
  // origin without clamping. The component remounts on the client and
  // the layout effect re-measures, so the SSR position is ephemeral.
  const viewport =
    typeof window === "undefined"
      ? { width: anchor.left + popup.width + 32, height: anchor.bottom + popup.height + 32 }
      : { width: window.innerWidth, height: window.innerHeight }
  return computePopupPosition({
    anchor: { x: anchor.left, y: anchor.top, width: anchor.width, height: anchor.height },
    popup,
    viewport,
    side: "bottom",
    align: "start",
    sideOffset: 4,
    viewportMargin: FILTER_POPUP_VIEWPORT_MARGIN,
  })
}

/**
 * Floating filter editor anchored below a header funnel button. Per
 * `filter-popup-variant`. Click-outside or Escape closes; focus moves
 * to the editor on mount; `×` button in the footer clears the filter.
 *
 * Native absolute-positioned div — no portal library, no `<dialog>`.
 * Pointer-down outside `[data-bc-grid-filter-popup]` and
 * `[data-bc-grid-filter-button]` closes.
 */
export function FilterPopup({
  anchor,
  column,
  columnId,
  filterType,
  filterText,
  filterLabel,
  loadSetFilterOptions,
  onFilterChange,
  onClear,
  onClose,
  messages,
}: FilterPopupProps): ReactNode {
  const filterId = filterPopupDomId(columnId)
  const titleId = `${filterId}-title`
  const isActive = filterText.length > 0
  const popupRef = useRef<HTMLDivElement | null>(null)
  // Shared dismiss-and-focus-return contract — Escape closes, outside
  // pointer-down closes (skipping the trigger button so its own click
  // toggles cleanly), focus returns to the trigger button when the
  // popup unmounts.
  usePopupDismiss({
    open: true,
    onClose,
    popupRef,
    ignoreSelectors: FILTER_POPUP_IGNORE_SELECTORS,
  })
  // Initial position estimate, refined to the actual popup size after
  // mount. The estimate uses the .bc-grid-filter-popup CSS contract
  // (`width: min(20rem, ...)` so ~320px) and a generic editor height.
  // See docs/coordination/radix-shadcn-chrome-cleanup.md.
  const [position, setPosition] = useState(() =>
    computeFilterPopupPosition(anchor, FILTER_POPUP_ESTIMATED_SIZE),
  )
  useLayoutEffect(() => {
    const node = popupRef.current
    if (!node) return
    const rect = node.getBoundingClientRect()
    setPosition(
      computeFilterPopupPosition(anchor, {
        width: rect.width || FILTER_POPUP_ESTIMATED_SIZE.width,
        height: rect.height || FILTER_POPUP_ESTIMATED_SIZE.height,
      }),
    )
  }, [anchor])
  return (
    <div
      data-bc-grid-filter-popup="true"
      data-column-id={columnId}
      data-active={isActive ? "true" : undefined}
      // Radix popper conventions: `data-state="open"` lets consumer
      // CSS animate enter/exit and condition styles. The popup is
      // unmount-on-close, so the value is constant — but the
      // attribute is set explicitly so apps can target the popup
      // exactly the same way they would a Radix Popover.Content.
      data-state="open"
      data-side={position.side}
      data-align={position.align}
      role="dialog"
      aria-labelledby={titleId}
      className="bc-grid-filter-popup"
      ref={popupRef}
      style={{ top: position.y, left: position.x }}
    >
      <div className="bc-grid-filter-popup-header">
        <span id={titleId} className="bc-grid-filter-popup-title">
          {filterLabel}
        </span>
        {isActive ? <span className="bc-grid-filter-popup-active-dot" aria-hidden="true" /> : null}
      </div>
      <div className="bc-grid-filter-popup-body" data-bc-grid-filter-popup-body="true">
        <FilterEditorBody
          filterType={filterType}
          filterText={filterText}
          filterId={filterId}
          filterLabel={filterLabel}
          column={column}
          columnId={columnId}
          loadSetFilterOptions={loadSetFilterOptions}
          onFilterChange={onFilterChange}
          autoFocus
          messages={messages}
        />
      </div>
      <div className="bc-grid-filter-popup-footer">
        <button
          type="button"
          aria-label={`Clear ${filterLabel}`}
          className="bc-grid-filter-popup-button bc-grid-filter-popup-clear"
          data-bc-grid-filter-clear="true"
          data-variant="ghost"
          onClick={(event) => {
            event.preventDefault()
            onClear()
          }}
          onKeyDown={(event) => event.stopPropagation()}
          disabled={!isActive}
        >
          Clear
        </button>
        <button
          type="button"
          aria-label={`Apply ${filterLabel}`}
          className="bc-grid-filter-popup-button bc-grid-filter-popup-apply"
          data-variant="primary"
          onClick={(event) => {
            event.preventDefault()
            onClose()
          }}
          onKeyDown={(event) => event.stopPropagation()}
        >
          Apply
        </button>
      </div>
    </div>
  )
}

function NumberFilterControl({
  filterId,
  filterLabel,
  filterText,
  onFilterChange,
  onFilterKeyDown,
  primaryRef,
  minPlaceholder,
  maxPlaceholder,
}: {
  filterId: string
  filterLabel: string
  filterText: string
  onFilterChange: (next: string) => void
  onFilterKeyDown: FilterKeyDownHandler
  primaryRef?: { current: FilterFocusElement | null }
  minPlaceholder: string
  maxPlaceholder: string
}): ReactNode {
  const input = decodeNumberFilterInput(filterText)
  const update = (next: Partial<typeof input>) => {
    const merged = { ...input, ...next }
    onFilterChange(encodeNumberFilterInput(merged))
  }
  const blankOp = isBlankFilterOperator(input.op) ? input.op : null

  return (
    <div className="bc-grid-filter-number">
      <select
        aria-label={`${filterLabel} operator`}
        className="bc-grid-filter-select"
        value={input.op}
        onChange={(event) => update({ op: event.currentTarget.value as NumberFilterOperator })}
        onKeyDown={onFilterKeyDown}
      >
        <option value="=">=</option>
        <option value="!=">!=</option>
        <option value="<">&lt;</option>
        <option value="<=">&lt;=</option>
        <option value=">">&gt;</option>
        <option value=">=">&gt;=</option>
        <option value="between">Between</option>
        <option value="blank">Blank</option>
        <option value="not-blank">Not blank</option>
      </select>
      {blankOp ? (
        <BlankFilterToggle
          filterLabel={filterLabel}
          op={blankOp}
          onChange={(op) => update({ op, value: "", valueTo: "" })}
          onKeyDown={onFilterKeyDown}
        />
      ) : (
        <>
          <input
            ref={(el) => {
              if (primaryRef) primaryRef.current = el
            }}
            aria-label={filterLabel}
            className="bc-grid-filter-input"
            id={filterId}
            type="number"
            inputMode="decimal"
            value={input.value}
            onChange={(event) => update({ value: event.currentTarget.value })}
            onKeyDown={onFilterKeyDown}
            placeholder={input.op === "between" ? minPlaceholder : ""}
          />
          {input.op === "between" ? (
            <>
              <input
                aria-label={`${filterLabel} maximum`}
                className="bc-grid-filter-input"
                type="number"
                inputMode="decimal"
                value={input.valueTo ?? ""}
                onChange={(event) => update({ valueTo: event.currentTarget.value })}
                onKeyDown={onFilterKeyDown}
                placeholder={maxPlaceholder}
              />
              <button
                type="button"
                aria-label={`${filterLabel} include minimum`}
                aria-pressed={input.includeMin !== false}
                className="bc-grid-filter-text-toggle"
                title="Include minimum"
                onClick={() => update({ includeMin: input.includeMin === false })}
                onKeyDown={onFilterKeyDown}
              >
                [
              </button>
              <button
                type="button"
                aria-label={`${filterLabel} include maximum`}
                aria-pressed={input.includeMax !== false}
                className="bc-grid-filter-text-toggle"
                title="Include maximum"
                onClick={() => update({ includeMax: input.includeMax === false })}
                onKeyDown={onFilterKeyDown}
              >
                ]
              </button>
            </>
          ) : null}
        </>
      )}
    </div>
  )
}

/**
 * Two-input min/max filter for `BcColumnFilter.type === "number-range"`.
 * Convenience over the `number` filter's `between` operator: no operator
 * dropdown, two `inputMode="decimal"` fields separated by an em-dash.
 * Per `filter-registry-rfc §number-range`.
 */
function NumberRangeFilterControl({
  filterId,
  filterLabel,
  filterText,
  onFilterChange,
  onFilterKeyDown,
  primaryRef,
  minPlaceholder,
  maxPlaceholder,
}: {
  filterId: string
  filterLabel: string
  filterText: string
  onFilterChange: (next: string) => void
  onFilterKeyDown: FilterKeyDownHandler
  primaryRef?: { current: FilterFocusElement | null }
  minPlaceholder: string
  maxPlaceholder: string
}): ReactNode {
  const input = decodeNumberRangeFilterInput(filterText)
  const update = (next: Partial<typeof input>) => {
    const merged = { ...input, ...next }
    onFilterChange(encodeNumberRangeFilterInput(merged))
  }

  return (
    <div className="bc-grid-filter-number-range">
      <input
        ref={(el) => {
          if (primaryRef) primaryRef.current = el
        }}
        aria-label={`${filterLabel} minimum`}
        className="bc-grid-filter-input"
        id={filterId}
        type="number"
        inputMode="decimal"
        value={input.value}
        onChange={(event) => update({ value: event.currentTarget.value })}
        onKeyDown={onFilterKeyDown}
        placeholder={minPlaceholder}
      />
      <span aria-hidden="true" className="bc-grid-filter-number-range-separator">
        —
      </span>
      <input
        aria-label={`${filterLabel} maximum`}
        className="bc-grid-filter-input"
        type="number"
        inputMode="decimal"
        value={input.valueTo}
        onChange={(event) => update({ valueTo: event.currentTarget.value })}
        onKeyDown={onFilterKeyDown}
        placeholder={maxPlaceholder}
      />
    </div>
  )
}

/**
 * Two-input from/to filter for `BcColumnFilter.type === "date-range"`.
 * Convenience over the `date` filter's `between` operator: no operator
 * dropdown, two `<input type="date">` fields separated by an em-dash.
 * Per `filter-registry-rfc §date-range`. Mirrors the
 * `NumberRangeFilterControl` idiom for visual consistency.
 */
function DateRangeFilterControl({
  filterId,
  filterLabel,
  filterText,
  onFilterChange,
  onFilterKeyDown,
  primaryRef,
}: {
  filterId: string
  filterLabel: string
  filterText: string
  onFilterChange: (next: string) => void
  onFilterKeyDown: FilterKeyDownHandler
  primaryRef?: { current: FilterFocusElement | null }
}): ReactNode {
  const input = decodeDateRangeFilterInput(filterText)
  const update = (next: Partial<typeof input>) => {
    const merged = { ...input, ...next }
    onFilterChange(encodeDateRangeFilterInput(merged))
  }

  return (
    <div className="bc-grid-filter-date-range">
      <input
        ref={(el) => {
          if (primaryRef) primaryRef.current = el
        }}
        aria-label={`${filterLabel} from`}
        className="bc-grid-filter-input"
        id={filterId}
        type="date"
        value={input.value}
        onChange={(event) => update({ value: event.currentTarget.value })}
        onKeyDown={onFilterKeyDown}
      />
      <span aria-hidden="true" className="bc-grid-filter-date-range-separator">
        —
      </span>
      <input
        aria-label={`${filterLabel} to`}
        className="bc-grid-filter-input"
        type="date"
        value={input.valueTo}
        onChange={(event) => update({ valueTo: event.currentTarget.value })}
        onKeyDown={onFilterKeyDown}
      />
    </div>
  )
}
