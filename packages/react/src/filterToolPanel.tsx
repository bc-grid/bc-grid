import type { BcColumnFilter, ColumnId } from "@bc-grid/core"
import { type ReactNode, useCallback, useEffect, useId, useMemo, useRef, useState } from "react"
import { columnIdFor, domToken } from "./gridInternals"
import { FilterEditorBody } from "./headerCells"
import type { BcReactGridColumn, BcSidebarContext } from "./types"

export interface FilterToolPanelItem {
  active: boolean
  columnId: ColumnId
  filterText: string
  label: string
  type: BcColumnFilter["type"]
}

export function BcFiltersToolPanel<TRow>({
  context,
}: {
  context: BcSidebarContext<TRow>
}): ReactNode {
  const idBase = useId()
  const [draftColumnIds, setDraftColumnIds] = useState<readonly ColumnId[]>([])
  const controlHostRefs = useRef(new Map<ColumnId, HTMLDivElement>())
  const pendingFocusColumnIdRef = useRef<ColumnId | null>(null)
  const items = useMemo(
    () => buildFilterToolPanelItems(context.columns, context.columnFilterText),
    [context.columnFilterText, context.columns],
  )
  const activeItems = useMemo(
    () => activeFilterToolPanelItems(items, draftColumnIds),
    [draftColumnIds, items],
  )
  const availableItems = items.filter(
    (item) => !item.active && !draftColumnIds.includes(item.columnId),
  )
  const hasFilters = activeItems.length > 0

  useEffect(() => {
    const columnId = pendingFocusColumnIdRef.current
    if (!columnId) return
    pendingFocusColumnIdRef.current = null
    const control = controlHostRefs.current
      .get(columnId)
      ?.querySelector<HTMLElement>("input, select, textarea, button")
    control?.focus()
  })

  const setControlHostRef = useCallback((columnId: ColumnId, node: HTMLDivElement | null) => {
    if (node) controlHostRefs.current.set(columnId, node)
    else controlHostRefs.current.delete(columnId)
  }, [])

  const clearFilter = (columnId: ColumnId) => {
    context.clearColumnFilterText(columnId)
    setDraftColumnIds((prev) => prev.filter((entry) => entry !== columnId))
  }

  return (
    <section className="bc-grid-filters-panel">
      <div className="bc-grid-filters-panel-header">
        <h2 className="bc-grid-sidebar-panel-title">Filters</h2>
        <button
          className="bc-grid-filters-panel-clear"
          disabled={!hasFilters}
          type="button"
          onClick={() => {
            context.clearColumnFilterText()
            setDraftColumnIds([])
          }}
        >
          Clear all
        </button>
      </div>

      {availableItems.length > 0 ? (
        <label className="bc-grid-filters-panel-add">
          <span className="bc-grid-filters-panel-label">Add filter</span>
          <select
            aria-label="Add filter"
            className="bc-grid-filters-panel-select"
            value=""
            onChange={(event) => {
              const columnId = event.currentTarget.value
              if (!columnId || draftColumnIds.includes(columnId)) return
              pendingFocusColumnIdRef.current = columnId
              setDraftColumnIds((prev) => [...prev, columnId])
            }}
          >
            <option value="">Choose column</option>
            {availableItems.map((item) => (
              <option key={item.columnId} value={item.columnId}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <ul className="bc-grid-filters-panel-list" aria-label="Active filters">
        {hasFilters ? (
          activeItems.map((item) => (
            <li
              aria-labelledby={`${idBase}-${domToken(item.columnId)}-title`}
              className="bc-grid-filters-panel-item"
              key={item.columnId}
            >
              <div className="bc-grid-filters-panel-item-header">
                <h3
                  className="bc-grid-filters-panel-item-title"
                  id={`${idBase}-${domToken(item.columnId)}-title`}
                >
                  {item.label}
                </h3>
                <button
                  aria-label={`Clear filter on ${item.label}`}
                  className="bc-grid-filters-panel-remove"
                  type="button"
                  onClick={() => clearFilter(item.columnId)}
                >
                  x
                </button>
              </div>
              <div
                className="bc-grid-filters-panel-control"
                ref={(node) => setControlHostRef(item.columnId, node)}
              >
                <FilterEditorBody
                  allowEscapeKeyPropagation
                  filterId={`${idBase}-${domToken(item.columnId)}-control`}
                  filterLabel={`Filter ${item.label}`}
                  filterText={item.filterText}
                  filterType={item.type}
                  getSetFilterOptions={
                    context.getSetFilterOptions
                      ? () => context.getSetFilterOptions?.(item.columnId) ?? []
                      : undefined
                  }
                  messages={context.messages}
                  onFilterChange={(next) => context.setColumnFilterText(item.columnId, next)}
                />
              </div>
            </li>
          ))
        ) : (
          <li className="bc-grid-filters-panel-empty">No active filters</li>
        )}
      </ul>
    </section>
  )
}

export function buildFilterToolPanelItems<TRow>(
  columns: readonly BcReactGridColumn<TRow>[],
  columnFilterText: Readonly<Record<ColumnId, string>>,
): readonly FilterToolPanelItem[] {
  return columns.flatMap((column, index) => {
    if (column.filter === false) return []
    const columnId = columnIdFor(column, index)
    const filterText = columnFilterText[columnId] ?? ""
    return [
      {
        active: isFilterToolPanelDraftActive(filterText),
        columnId,
        filterText,
        label: filterToolPanelLabel(column, columnId),
        type: column.filter ? column.filter.type : "text",
      },
    ]
  })
}

export function activeFilterToolPanelItems(
  items: readonly FilterToolPanelItem[],
  draftColumnIds: readonly ColumnId[] = [],
): readonly FilterToolPanelItem[] {
  const draftSet = new Set(draftColumnIds)
  return items.filter((item) => item.active || draftSet.has(item.columnId))
}

export function isFilterToolPanelDraftActive(value: string): boolean {
  return value.trim().length > 0
}

function filterToolPanelLabel<TRow>(column: BcReactGridColumn<TRow>, columnId: ColumnId): string {
  return typeof column.header === "string" ? column.header : columnId
}
