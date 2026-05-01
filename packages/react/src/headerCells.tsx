import type { BcColumnFilter, BcGridSort, ColumnId } from "@bc-grid/core"
import {
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
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
  type SetFilterOption,
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
import {
  type ResolvedColumn,
  cellStyle,
  classNames,
  domToken,
  headerDomId,
  pinnedClassName,
  pinnedEdgeClassName,
} from "./gridInternals"
import type { BcGridMessages } from "./types"

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
  scrollLeft: number
  showColumnMenu?: boolean
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
  showColumnMenu = true,
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
  const ariaSort = ariaSortFor(sort?.direction, sortable)
  // Show the 1-based sort-order index when more than one column is sorted,
  // so users can see the priority order they composed via Shift+click.
  const showSortOrder = sort != null && sortState.length > 1
  const headerLabel =
    typeof column.source.header === "string" ? column.source.header : column.columnId
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
          onKeyDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          type="button"
        />
      ) : null}
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
  loadSetFilterOptions?: ((columnId: ColumnId) => readonly SetFilterOption[]) | undefined
  onFilterChange: (next: string) => void
  pinnedEdge: "left" | "right" | null
  scrollLeft: number
  totalWidth: number
  viewportWidth: number
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
  scrollLeft,
  totalWidth,
  viewportWidth,
  messages,
}: RenderFilterCellParams<TRow>): ReactNode {
  const filterDisabled = column.source.filter === false
  const filterType = column.source.filter ? column.source.filter.type : "text"
  const isPopupVariant =
    Boolean(column.source.filter) &&
    column.source.filter !== false &&
    (column.source.filter as BcColumnFilter).variant === "popup"
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
          getSetFilterOptions={
            loadSetFilterOptions ? () => loadSetFilterOptions(column.columnId) : undefined
          }
          onFilterChange={onFilterChange}
          messages={messages}
        />
      )}
    </div>
  )
}

type FilterFocusElement = HTMLInputElement | HTMLSelectElement | HTMLButtonElement
type FilterKeyDownHandler = (event: KeyboardEvent<HTMLElement>) => void

function TextFilterControl({
  filterId,
  filterLabel,
  filterText,
  onFilterChange,
  onFilterKeyDown,
  primaryRef,
  placeholder,
}: {
  filterId: string
  filterLabel: string
  filterText: string
  onFilterChange: (next: string) => void
  onFilterKeyDown: FilterKeyDownHandler
  primaryRef?: { current: FilterFocusElement | null }
  placeholder?: string
}): ReactNode {
  const input = decodeTextFilterInput(filterText)
  const emit = (next: {
    op: TextFilterOperator
    value: string
    caseSensitive: boolean
    regex: boolean
  }) => {
    if (next.op === "contains" && !next.caseSensitive && !next.regex) {
      // Preserve the legacy plain-string contract for the default case so
      // pre-existing persisted state and consumers reading filterText keep
      // round-tripping unchanged.
      onFilterChange(next.value)
      return
    }
    const payload: TextFilterInput = { op: next.op, value: next.value }
    if (next.caseSensitive) payload.caseSensitive = true
    if (next.regex) payload.regex = true
    onFilterChange(encodeTextFilterInput(payload))
  }
  const flat = {
    op: input.op,
    value: input.value,
    caseSensitive: input.caseSensitive === true,
    regex: input.regex === true,
  }
  const update = (next: Partial<typeof flat>) => emit({ ...flat, ...next })

  return (
    <div className="bc-grid-filter-text">
      <select
        aria-label={`${filterLabel} operator`}
        className="bc-grid-filter-select"
        value={input.op}
        onChange={(event) => update({ op: event.currentTarget.value as TextFilterOperator })}
        onKeyDown={onFilterKeyDown}
      >
        <option value="contains">Contains</option>
        <option value="equals">Equals</option>
        <option value="starts-with">Starts with</option>
        <option value="ends-with">Ends with</option>
      </select>
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
        placeholder={placeholder}
      />
      <button
        type="button"
        aria-label={`${filterLabel} case sensitive`}
        aria-pressed={flat.caseSensitive}
        className="bc-grid-filter-text-toggle"
        onClick={() => update({ caseSensitive: !flat.caseSensitive })}
        onKeyDown={onFilterKeyDown}
      >
        Aa
      </button>
      <button
        type="button"
        aria-label={`${filterLabel} regex`}
        aria-pressed={flat.regex}
        className="bc-grid-filter-text-toggle"
        onClick={() => update({ regex: !flat.regex })}
        onKeyDown={onFilterKeyDown}
      >
        .*
      </button>
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

  return (
    <div className="bc-grid-filter-date">
      <select
        aria-label={`${filterLabel} operator`}
        className="bc-grid-filter-select"
        value={input.op}
        onChange={(event) => update({ op: event.currentTarget.value as DateFilterOperator })}
        onKeyDown={onFilterKeyDown}
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
    </div>
  )
}

function SetFilterControl({
  filterId,
  filterLabel,
  filterText,
  getSetFilterOptions,
  onFilterChange,
  onFilterKeyDown,
  primaryRef,
}: {
  filterId: string
  filterLabel: string
  filterText: string
  getSetFilterOptions?: (() => readonly SetFilterOption[]) | undefined
  onFilterChange: (next: string) => void
  onFilterKeyDown: FilterKeyDownHandler
  primaryRef?: { current: FilterFocusElement | null }
}): ReactNode {
  const input = decodeSetFilterInput(filterText)
  const [draftOp, setDraftOp] = useState<SetFilterOperator>(input.op)
  const [open, setOpen] = useState(false)
  const [menuRect, setMenuRect] = useState<{ top: number; left: number; width: number } | null>(
    null,
  )
  const [options, setOptions] = useState<readonly SetFilterOption[] | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)

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

  const op = filterText.length > 0 ? input.op : draftOp
  const selectedValues = useMemo(() => new Set(input.values), [input.values])
  const menuOptions = useMemo(() => {
    const byValue = new Map<string, SetFilterOption>()
    for (const option of options ?? []) byValue.set(option.value, option)
    for (const value of input.values) {
      if (!byValue.has(value)) byValue.set(value, { value, label: value })
    }
    return Array.from(byValue.values())
  }, [input.values, options])

  const commit = (next: { op: SetFilterOperator; values: readonly string[] }) => {
    setDraftOp(next.op)
    const values = Array.from(new Set(next.values.filter((value) => value.length > 0)))
    if (next.op === "blank") {
      onFilterChange(encodeSetFilterInput({ op: "blank", values: [] }))
      return
    }
    if (values.length === 0) {
      onFilterChange("")
      return
    }
    onFilterChange(encodeSetFilterInput({ op: next.op, values }))
  }

  const loadOptions = () => {
    setOptions(getSetFilterOptions ? getSetFilterOptions() : [])
  }

  const openMenu = (button: HTMLButtonElement) => {
    const rect = button.getBoundingClientRect()
    setMenuRect({ top: rect.bottom + 4, left: rect.left, width: rect.width })
    loadOptions()
    setOpen(true)
  }

  const toggleValue = (value: string) => {
    const values = selectedValues.has(value)
      ? input.values.filter((selected) => selected !== value)
      : [...input.values, value]
    commit({ op, values })
  }

  const summary =
    op === "blank"
      ? "Blank rows"
      : input.values.length === 0
        ? "Select values"
        : `${input.values.length} selected`
  const menuId = `${filterId}-set-menu`
  const pickerDisabled = op === "blank"

  return (
    <div ref={rootRef} className="bc-grid-filter-set">
      <select
        aria-label={`${filterLabel} operator`}
        className="bc-grid-filter-select"
        value={op}
        onChange={(event) =>
          commit({ op: event.currentTarget.value as SetFilterOperator, values: input.values })
        }
        onKeyDown={onFilterKeyDown}
      >
        <option value="in">In</option>
        <option value="not-in">Not in</option>
        <option value="blank">Blank</option>
      </select>
      <button
        ref={(el) => {
          if (primaryRef) primaryRef.current = el
        }}
        aria-controls={open ? menuId : undefined}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`${filterLabel} values`}
        className="bc-grid-filter-set-button"
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
        <div
          id={menuId}
          className="bc-grid-filter-set-menu"
          role="group"
          aria-label={`${filterLabel} values`}
          style={{
            position: "fixed",
            top: menuRect.top,
            left: menuRect.left,
            minWidth: Math.max(180, menuRect.width),
            zIndex: 110,
          }}
        >
          {menuOptions.length === 0 ? (
            <div className="bc-grid-filter-set-empty">No values</div>
          ) : (
            menuOptions.map((option) => {
              const checked = selectedValues.has(option.value)
              return (
                <label
                  key={option.value}
                  className="bc-grid-filter-set-option"
                  data-selected={checked ? "true" : undefined}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleValue(option.value)}
                    onKeyDown={onFilterKeyDown}
                  />
                  <span>{option.label}</span>
                </label>
              )
            })
          )}
          {input.values.length > 0 ? (
            <button
              type="button"
              className="bc-grid-filter-set-clear"
              onClick={() => commit({ op, values: [] })}
              onKeyDown={onFilterKeyDown}
            >
              Clear selection
            </button>
          ) : null}
        </div>
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
  getSetFilterOptions,
  onFilterChange,
  allowEscapeKeyPropagation = false,
  autoFocus,
  messages,
}: {
  filterType: BcColumnFilter["type"]
  filterText: string
  filterId: string
  filterLabel: string
  getSetFilterOptions?: (() => readonly SetFilterOption[]) | undefined
  onFilterChange: (next: string) => void
  allowEscapeKeyPropagation?: boolean
  autoFocus?: boolean
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
        filterId={filterId}
        filterLabel={filterLabel}
        filterText={filterText}
        getSetFilterOptions={getSetFilterOptions}
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
      onKeyDown={onFilterKeyDown}
      id={filterId}
      placeholder={messages.filterPlaceholder}
    />
  )
}

interface FilterPopupProps {
  anchor: DOMRect
  columnId: ColumnId
  filterType: BcColumnFilter["type"]
  filterText: string
  filterLabel: string
  getSetFilterOptions?: (() => readonly SetFilterOption[]) | undefined
  onFilterChange: (next: string) => void
  onClear: () => void
  onClose: () => void
  messages: BcGridMessages
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
  getSetFilterOptions,
  onFilterChange,
  onClear,
  onClose,
  messages,
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
        background: "var(--bc-grid-bg)",
        color: "inherit",
        border: "1px solid var(--bc-grid-border)",
        borderRadius: "var(--bc-grid-radius)",
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
        getSetFilterOptions={getSetFilterOptions}
        onFilterChange={onFilterChange}
        autoFocus
        messages={messages}
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
            border: "1px solid var(--bc-grid-border)",
            borderRadius: "calc(var(--bc-grid-radius) - 2px)",
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
        onKeyDown={onFilterKeyDown}
        placeholder={input.op === "between" ? minPlaceholder : ""}
      />
      {input.op === "between" ? (
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
      ) : null}
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
