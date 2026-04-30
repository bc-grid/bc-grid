import type { BcColumnFilter, BcGridSort, ColumnId } from "@bc-grid/core"
import {
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
} from "react"
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
  filterText,
  filterPopupOpen,
  onOpenFilterPopup,
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
      {column.source.filter && column.source.filter.variant === "popup" && onOpenFilterPopup ? (
        <button
          aria-haspopup="dialog"
          aria-expanded={filterPopupOpen ? true : undefined}
          aria-label={`Filter ${headerLabel}${filterText ? " (active)" : ""}`}
          className={classNames(
            "bc-grid-header-filter-button",
            filterText ? "bc-grid-header-filter-button-active" : undefined,
          )}
          data-bc-grid-filter-button="true"
          data-active={filterText ? "true" : undefined}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            onOpenFilterPopup(column, event.currentTarget.getBoundingClientRect())
          }}
          onKeyDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          type="button"
        >
          <FunnelIcon active={Boolean(filterText)} />
        </button>
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
  const isPopupVariant =
    Boolean(column.source.filter) &&
    column.source.filter !== false &&
    (column.source.filter as BcColumnFilter).variant === "popup"
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
      {filterDisabled || isPopupVariant ? null : (
        <FilterEditorBody
          filterType={filterType}
          filterText={filterText}
          filterId={filterId}
          filterLabel={filterLabel}
          onFilterChange={onFilterChange}
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
  primaryRef,
}: {
  filterId: string
  filterLabel: string
  filterText: string
  onFilterChange: (next: string) => void
  primaryRef?: { current: HTMLInputElement | HTMLSelectElement | null }
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
        ref={(el) => {
          if (primaryRef) primaryRef.current = el
        }}
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
  filterType,
  filterText,
  filterId,
  filterLabel,
  onFilterChange,
  autoFocus,
}: {
  filterType: BcColumnFilter["type"]
  filterText: string
  filterId: string
  filterLabel: string
  onFilterChange: (next: string) => void
  autoFocus?: boolean
}): ReactNode {
  const focusRef = useRef<HTMLInputElement | HTMLSelectElement | null>(null)
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
        onKeyDown={(event) => event.stopPropagation()}
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
        primaryRef={focusRef}
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
        primaryRef={focusRef}
      />
    )
  }
  return (
    <input
      ref={(el) => {
        focusRef.current = el
      }}
      aria-label={filterLabel}
      className="bc-grid-filter-input"
      type="text"
      value={filterText}
      onChange={(event) => onFilterChange(event.currentTarget.value)}
      onKeyDown={(event) => event.stopPropagation()}
      id={filterId}
      placeholder="Filter"
    />
  )
}

interface FilterPopupProps {
  anchor: DOMRect
  columnId: ColumnId
  filterType: BcColumnFilter["type"]
  filterText: string
  filterLabel: string
  onFilterChange: (next: string) => void
  onClear: () => void
  onClose: () => void
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
  columnId,
  filterType,
  filterText,
  filterLabel,
  onFilterChange,
  onClear,
  onClose,
}: FilterPopupProps): ReactNode {
  // Close on Escape or pointer-down outside.
  useEffect(() => {
    const handleKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation()
        onClose()
      }
    }
    const handlePointer = (event: globalThis.PointerEvent) => {
      const target = event.target as Element | null
      if (!target) return
      if (target.closest('[data-bc-grid-filter-popup="true"]')) return
      if (target.closest('[data-bc-grid-filter-button="true"]')) return
      onClose()
    }
    document.addEventListener("keydown", handleKey, true)
    document.addEventListener("pointerdown", handlePointer, true)
    return () => {
      document.removeEventListener("keydown", handleKey, true)
      document.removeEventListener("pointerdown", handlePointer, true)
    }
  }, [onClose])

  const filterId = `bc-grid-filter-popup-${domToken(columnId)}`
  const top = anchor.bottom + 4
  const left = anchor.left
  return (
    <div
      data-bc-grid-filter-popup="true"
      data-column-id={columnId}
      role="dialog"
      aria-label={filterLabel}
      className="bc-grid-filter-popup"
      style={{
        position: "fixed",
        top,
        left,
        zIndex: 100,
        background: "hsl(var(--background, 0 0% 100%))",
        color: "inherit",
        border: "1px solid hsl(var(--border, 214 32% 91%))",
        borderRadius: "calc(var(--radius, 0.375rem))",
        boxShadow: "0 8px 24px -8px rgba(0, 0, 0, 0.2)",
        padding: "10px",
        minWidth: 220,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <FilterEditorBody
        filterType={filterType}
        filterText={filterText}
        filterId={filterId}
        filterLabel={filterLabel}
        onFilterChange={onFilterChange}
        autoFocus
      />
      <div
        className="bc-grid-filter-popup-footer"
        style={{ display: "flex", justifyContent: "flex-end" }}
      >
        <button
          type="button"
          aria-label={`Clear ${filterLabel}`}
          className="bc-grid-filter-popup-clear"
          data-bc-grid-filter-clear="true"
          onClick={(event) => {
            event.preventDefault()
            onClear()
          }}
          onKeyDown={(event) => event.stopPropagation()}
          disabled={filterText.length === 0}
          style={{
            font: "inherit",
            background: "transparent",
            border: "1px solid hsl(var(--border, 214 32% 91%))",
            borderRadius: "calc(var(--radius, 0.375rem) - 2px)",
            cursor: filterText ? "pointer" : "default",
            opacity: filterText ? 1 : 0.4,
            padding: "2px 8px",
          }}
        >
          × Clear
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
  primaryRef,
}: {
  filterId: string
  filterLabel: string
  filterText: string
  onFilterChange: (next: string) => void
  primaryRef?: { current: HTMLInputElement | HTMLSelectElement | null }
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
