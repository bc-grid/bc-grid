import type { BcColumnFilter, ColumnId } from "@bc-grid/core"
import { type ReactNode, useCallback, useId, useMemo } from "react"
import { summarizeColumnFilter } from "./filter"
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
            <BcFiltersToolPanelItem
              context={context}
              idBase={idBase}
              item={item}
              key={item.columnId}
              onClear={clearFilter}
            />
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

interface FilterToolPanelItemProps<TRow> {
  context: BcSidebarContext<TRow>
  idBase: string
  item: FilterToolPanelItem
  onClear: (columnId: ColumnId) => void
}

/**
 * Single panel row. Reads as a deliberate summary card by default
 * (column label + operator chip + compact value summary + per-row
 * clear), and expands to the full inline editor body when the user
 * wants to refine the filter via the "Edit" button. Keeping the
 * editor mounted only while expanded avoids paying for the full
 * `<select>` / `<input>` chrome on every active filter when the host
 * has many columns filtered at once.
 */
function BcFiltersToolPanelItem<TRow>({
  context,
  idBase,
  item,
  onClear,
}: FilterToolPanelItemProps<TRow>): ReactNode {
  const slug = `${idBase}-${domToken(item.columnId)}`
  const titleId = `${slug}-title`
  const controlId = `${slug}-control`
  const setFilterOptions = context.getSetFilterOptions?.(item.columnId)
  const summary = summarizeColumnFilter(
    item.filterText,
    item.type,
    setFilterOptions ? { setFilterOptions } : undefined,
  )

  return (
    <li aria-labelledby={titleId} className="bc-grid-filters-panel-item">
      <div className="bc-grid-filters-panel-item-header">
        <h3 className="bc-grid-filters-panel-item-title" id={titleId}>
          {item.label}
        </h3>
        <button
          aria-label={`Clear filter on ${item.label}`}
          className="bc-grid-filters-panel-remove"
          type="button"
          onClick={() => onClear(item.columnId)}
        >
          {XIcon}
        </button>
      </div>
      {summary ? (
        <p className="bc-grid-filters-panel-item-summary">
          <span className="bc-grid-filters-panel-item-operator">{summary.operatorLabel}</span>
          {summary.valueSummary ? (
            <span className="bc-grid-filters-panel-item-value">{summary.valueSummary}</span>
          ) : null}
          {summary.modifiers?.map((modifier) => (
            <span className="bc-grid-filters-panel-item-modifier" key={modifier}>
              {modifier}
            </span>
          ))}
        </p>
      ) : null}
      <div className="bc-grid-filters-panel-control" id={controlId}>
        <FilterEditorBody
          allowEscapeKeyPropagation
          filterId={`${controlId}-editor`}
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
