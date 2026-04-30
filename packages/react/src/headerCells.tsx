import type { BcGridSort, ColumnId } from "@bc-grid/core"
import type { CSSProperties, KeyboardEvent, MouseEvent, PointerEvent, ReactNode } from "react"
import {
  type DateFilterOperator,
  type NumberFilterOperator,
  decodeDateFilterInput,
  decodeNumberFilterInput,
  encodeDateFilterInput,
  encodeNumberFilterInput,
} from "./filter"
import {
  type ResolvedColumn,
  cellStyle,
  classNames,
  domToken,
  headerDomId,
  pinnedClassName,
  pinnedEdgeClassName,
} from "./gridInternals"

/**
 * Modifier flags forwarded from the header click / keyboard handler so the
 * grid can route to single-column toggle vs multi-column append vs remove.
 */
export interface SortModifiers {
  shiftKey: boolean
  ctrlOrMeta: boolean
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
  scrollLeft: number
  sortState: readonly BcGridSort[]
  totalWidth: number
  viewportWidth: number
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
  scrollLeft,
  sortState,
  totalWidth,
  viewportWidth,
}: RenderHeaderCellParams<TRow>): ReactNode {
  const sortIndex = sortState.findIndex((entry) => entry.columnId === column.columnId)
  const sort = sortIndex >= 0 ? sortState[sortIndex] : undefined
  const sortable = column.source.sortable !== false
  const ariaSort = sort
    ? sort.direction === "asc"
      ? "ascending"
      : "descending"
    : sortable
      ? "none"
      : undefined
  // Show the 1-based sort-order index when more than one column is sorted,
  // so users can see the priority order they composed via Shift+click.
  const showSortOrder = sort != null && sortState.length > 1
  const headerLabel =
    typeof column.source.header === "string" ? column.source.header : column.columnId

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
      onContextMenu={(event) => {
        event.preventDefault()
        event.stopPropagation()
        onColumnMenu(column, { x: event.clientX, y: event.clientY })
      }}
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
        scrollLeft,
        totalWidth,
        viewportWidth,
        width: column.width,
        zIndex: column.pinned ? 4 : 3,
      })}
      data-column-id={column.columnId}
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
        onKeyDown={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        type="button"
      >
        ...
      </button>
      {column.source.resizable === false ? null : (
        // Drag handle pinned to the right edge of the header cell. Pointer
        // events with setPointerCapture so the drag survives the cursor
        // leaving the handle's bounding box during the gesture.
        <div
          aria-hidden="true"
          className="bc-grid-header-resize-handle"
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
  onFilterChange: (next: string) => void
  pinnedEdge: "left" | "right" | null
  scrollLeft: number
  totalWidth: number
  viewportWidth: number
}

export function renderFilterCell<TRow>({
  column,
  domBaseId,
  filterText,
  headerHeight,
  index,
  onFilterChange,
  pinnedEdge,
  scrollLeft,
  totalWidth,
  viewportWidth,
}: RenderFilterCellParams<TRow>): ReactNode {
  const filterDisabled = column.source.filter === false
  const filterType = column.source.filter ? column.source.filter.type : "text"
  const filterLabel = `Filter ${typeof column.source.header === "string" ? column.source.header : column.columnId}`
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
        scrollLeft,
        totalWidth,
        viewportWidth,
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
      {filterDisabled ? null : filterType === "boolean" ? (
        <select
          aria-label={filterLabel}
          className="bc-grid-filter-select"
          value={filterText}
          onChange={(event) => onFilterChange(event.currentTarget.value)}
          onKeyDown={(event) => event.stopPropagation()}
          id={filterId}
        >
          <option value="">Any</option>
          <option value="true">Yes</option>
          <option value="false">No</option>
        </select>
      ) : filterType === "number" ? (
        <NumberFilterControl
          filterId={filterId}
          filterLabel={filterLabel}
          filterText={filterText}
          onFilterChange={onFilterChange}
        />
      ) : filterType === "date" ? (
        <DateFilterControl
          filterId={filterId}
          filterLabel={filterLabel}
          filterText={filterText}
          onFilterChange={onFilterChange}
        />
      ) : (
        <input
          aria-label={filterLabel}
          className="bc-grid-filter-input"
          type="text"
          value={filterText}
          onChange={(event) => onFilterChange(event.currentTarget.value)}
          // Prevent the grid's keyboard handler from claiming arrow keys
          // while the user is typing in the filter input.
          onKeyDown={(event) => event.stopPropagation()}
          id={filterId}
          placeholder="Filter"
        />
      )}
    </div>
  )
}

function DateFilterControl({
  filterId,
  filterLabel,
  filterText,
  onFilterChange,
}: {
  filterId: string
  filterLabel: string
  filterText: string
  onFilterChange: (next: string) => void
}): ReactNode {
  const input = decodeDateFilterInput(filterText)
  const update = (next: Partial<typeof input>) => {
    const merged = { ...input, ...next }
    onFilterChange(encodeDateFilterInput(merged))
  }

  return (
    <div className="bc-grid-filter-date">
      <select
        aria-label={`${filterLabel} operator`}
        className="bc-grid-filter-select"
        value={input.op}
        onChange={(event) => update({ op: event.currentTarget.value as DateFilterOperator })}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <option value="is">Is</option>
        <option value="before">Before</option>
        <option value="after">After</option>
        <option value="between">Between</option>
      </select>
      <input
        aria-label={filterLabel}
        className="bc-grid-filter-input"
        id={filterId}
        type="date"
        value={input.value}
        onChange={(event) => update({ value: event.currentTarget.value })}
        onKeyDown={(event) => event.stopPropagation()}
      />
      {input.op === "between" ? (
        <input
          aria-label={`${filterLabel} end date`}
          className="bc-grid-filter-input"
          type="date"
          value={input.valueTo ?? ""}
          onChange={(event) => update({ valueTo: event.currentTarget.value })}
          onKeyDown={(event) => event.stopPropagation()}
        />
      ) : null}
    </div>
  )
}

function NumberFilterControl({
  filterId,
  filterLabel,
  filterText,
  onFilterChange,
}: {
  filterId: string
  filterLabel: string
  filterText: string
  onFilterChange: (next: string) => void
}): ReactNode {
  const input = decodeNumberFilterInput(filterText)
  const update = (next: Partial<typeof input>) => {
    const merged = { ...input, ...next }
    onFilterChange(encodeNumberFilterInput(merged))
  }

  return (
    <div className="bc-grid-filter-number">
      <select
        aria-label={`${filterLabel} operator`}
        className="bc-grid-filter-select"
        value={input.op}
        onChange={(event) => update({ op: event.currentTarget.value as NumberFilterOperator })}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <option value="=">=</option>
        <option value="!=">!=</option>
        <option value="<">&lt;</option>
        <option value="<=">&lt;=</option>
        <option value=">">&gt;</option>
        <option value=">=">&gt;=</option>
        <option value="between">Between</option>
      </select>
      <input
        aria-label={filterLabel}
        className="bc-grid-filter-input"
        id={filterId}
        type="number"
        inputMode="decimal"
        value={input.value}
        onChange={(event) => update({ value: event.currentTarget.value })}
        onKeyDown={(event) => event.stopPropagation()}
        placeholder={input.op === "between" ? "Min" : "Value"}
      />
      {input.op === "between" ? (
        <input
          aria-label={`${filterLabel} maximum`}
          className="bc-grid-filter-input"
          type="number"
          inputMode="decimal"
          value={input.valueTo ?? ""}
          onChange={(event) => update({ valueTo: event.currentTarget.value })}
          onKeyDown={(event) => event.stopPropagation()}
          placeholder="Max"
        />
      ) : null}
    </div>
  )
}
