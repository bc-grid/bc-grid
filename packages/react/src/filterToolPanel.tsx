import type { BcColumnFilter, ColumnId } from "@bc-grid/core"
import { type ReactNode, useCallback, useId, useMemo } from "react"
import { domToken, flattenColumnDefinitions } from "./gridInternals"
import { FilterEditorBody } from "./headerCells"
import { FilterEmptyIcon, XIcon } from "./internal/panel-icons"
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
  const items = useMemo(
    () => buildFilterToolPanelItems(context.columns, context.columnFilterText),
    [context.columnFilterText, context.columns],
  )
  const activeItems = useMemo(() => activeFilterToolPanelItems(items), [items])
  const hasFilters = activeItems.length > 0

  const clearFilter = useCallback(
    (columnId: ColumnId) => {
      context.clearColumnFilterText(columnId)
    },
    [context],
  )

  return (
    <section className="bc-grid-filters-panel">
      <div className="bc-grid-sidebar-panel-header bc-grid-filters-panel-header">
        <h2 className="bc-grid-sidebar-panel-title">Filters</h2>
        <button
          className="bc-grid-filters-panel-clear"
          disabled={!hasFilters}
          type="button"
          onClick={() => context.clearColumnFilterText()}
        >
          Clear all
        </button>
      </div>

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
                  {XIcon}
                </button>
              </div>
              <div className="bc-grid-filters-panel-control">
                <FilterEditorBody
                  allowEscapeKeyPropagation
                  filterId={`${idBase}-${domToken(item.columnId)}-control`}
                  filterLabel={context.messages.filterAriaLabel({ columnLabel: item.label })}
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
          <li className="bc-grid-filters-panel-empty">
            {FilterEmptyIcon}
            <span className="bc-grid-filters-panel-empty-label">No active filters</span>
          </li>
        )}
      </ul>
    </section>
  )
}

export function buildFilterToolPanelItems<TRow>(
  columns: readonly BcReactGridColumn<TRow>[],
  columnFilterText: Readonly<Record<ColumnId, string>>,
): readonly FilterToolPanelItem[] {
  return flattenColumnDefinitions(columns, { includeHidden: true }).flatMap(
    ({ column, columnId }) => {
      if (column.filter === false) return []
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
    },
  )
}

export function activeFilterToolPanelItems(
  items: readonly FilterToolPanelItem[],
): readonly FilterToolPanelItem[] {
  return items.filter((item) => item.active)
}

export function isFilterToolPanelDraftActive(value: string): boolean {
  return value.trim().length > 0
}

function filterToolPanelLabel<TRow>(column: BcReactGridColumn<TRow>, columnId: ColumnId): string {
  return typeof column.header === "string" ? column.header : columnId
}
