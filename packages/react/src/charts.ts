import { aggregateColumns } from "@bc-grid/aggregations"
import type { BcAggregation, BcGridColumn, ColumnId } from "@bc-grid/core"
import { useMemo } from "react"

/**
 * Charts integration per `docs/design/charts-rfc.md`. The peer-dep
 * architecture means bc-grid ships **no chart library** — consumers
 * bring their own (recharts is the documented default; echarts and
 * visx are mentioned in the recipe). This module hands consumers the
 * chart-ready data shape; the consumer's library does the rendering.
 *
 * v1 surface: a flat-row hook + a pure helper. The richer reactive
 * variant from the RFC (apiRef + `BcGridApi.subscribe` +
 * `useSyncExternalStore`) is deferred to `charts-api-subscribe`; the
 * v1 hook composes with React state in the consumer's render path.
 */

export type BcChartScope = "rows" | "filtered" | "selected" | "range" | "pivot"

/**
 * Configuration for a chart derived from the grid's row set.
 *
 * The interface is intentionally **not** generic over `TRow` because
 * the v1 surface only references rows positionally (the consumer
 * filters before passing them in) and column ids are plain strings.
 * The richer reactive variant (post-`charts-api-subscribe`) will
 * widen the consumer-facing entry point with a typed helper that
 * threads the row generic through to category / value column ids.
 */
export interface BcChartConfig {
  /**
   * Where the data comes from. Informational at v1 — the consumer
   * pre-scopes by passing the right rows to the hook. Reserved for
   * the apiRef-based reactive variant once `charts-api-subscribe`
   * lands.
   */
  scope?: BcChartScope
  /**
   * Column id used as the X-axis category. When omitted, all rows fall
   * into a single "All" category and series collapse to one value
   * each — useful for total-only summaries.
   */
  categoryColumn?: ColumnId
  /** Columns whose values are plotted as Y-axis series. */
  valueColumns?: readonly ColumnId[]
  /**
   * Optional aggregation per value column. Falls back to the column's
   * own `aggregation` (per `api.md §1.1`), then `sum`.
   */
  aggregations?: Partial<Record<ColumnId, BcAggregation>>
  /** Optional limit on category count (top-N by series-sum). Default: 50. */
  maxCategories?: number
  /**
   * Optional explicit category ordering. When supplied, categories
   * are emitted in this order (and rows whose category isn't in the
   * list are dropped). Without it, categories are ordered by series-
   * sum descending — useful for ranked bar charts.
   */
  categoryOrder?: readonly string[]
  /** Locale forwarded to aggregation context. */
  locale?: string
}

export interface BcChartSeries {
  /** Display label, e.g. "Sum of Balance". */
  label: string
  /** Values aligned to `categories[]` indices. */
  values: readonly (number | null)[]
  /** Stable id — chart libraries use this for keying. */
  id: string
  /** Reserved for pivot scope (col-group key). */
  groupKey?: string
}

export interface BcChartData {
  categories: readonly string[]
  series: readonly BcChartSeries[]
  /** True when categories were truncated to `maxCategories`. */
  truncated: boolean
}

const DEFAULT_MAX_CATEGORIES = 50
const SINGLE_CATEGORY = "All"

/**
 * Pure: derive `BcChartData` from a flat row set. Use this from any
 * non-React surface (server-side render, web worker, headless test).
 * Group-by-category, aggregate per series, optionally truncate.
 */
export function rowsToChartData<TRow>(
  rows: readonly TRow[],
  columns: readonly BcGridColumn<TRow>[],
  config: BcChartConfig,
): BcChartData {
  const valueColumnIds = config.valueColumns ?? []
  if (valueColumnIds.length === 0) {
    return { categories: [], series: [], truncated: false }
  }

  const columnMap = columnsById(columns)
  const valueColumns = valueColumnIds
    .map((id) => {
      const column = columnMap.get(id)
      return column ? { column, id } : null
    })
    .filter((entry): entry is { column: BcGridColumn<TRow>; id: ColumnId } => entry !== null)
  if (valueColumns.length === 0) {
    return { categories: [], series: [], truncated: false }
  }

  const categoryColumn = config.categoryColumn ? columnMap.get(config.categoryColumn) : undefined

  const groups = groupRowsByCategory(rows, categoryColumn)
  const aggregateContext = config.locale ? { locale: config.locale } : {}

  const valuesByCategory = new Map<string, Map<ColumnId, number | null>>()
  for (const [category, groupRows] of groups) {
    const seriesValues = new Map<ColumnId, number | null>()
    for (const { column: valueColumn, id: colId } of valueColumns) {
      const aggregation = resolveAggregation(config, valueColumn, colId)
      const colWithAgg: BcGridColumn<TRow> = { ...valueColumn, aggregation }
      const [result] = aggregateColumns(groupRows, [colWithAgg], aggregateContext)
      seriesValues.set(
        colId,
        typeof result?.value === "number" && Number.isFinite(result.value) ? result.value : null,
      )
    }
    valuesByCategory.set(category, seriesValues)
  }

  const orderedCategories = orderCategories(valuesByCategory, config.categoryOrder)
  const maxCategories = Math.max(1, config.maxCategories ?? DEFAULT_MAX_CATEGORIES)
  const truncated = orderedCategories.length > maxCategories
  const finalCategories = truncated ? orderedCategories.slice(0, maxCategories) : orderedCategories

  const series: BcChartSeries[] = valueColumns.map(({ column: valueColumn, id: colId }) => {
    const aggregation = resolveAggregation(config, valueColumn, colId)
    const values = finalCategories.map(
      (category) => valuesByCategory.get(category)?.get(colId) ?? null,
    )
    return {
      id: colId,
      label: seriesLabel(aggregation.type, valueColumn),
      values,
    }
  })

  return { categories: finalCategories, series, truncated }
}

/**
 * React hook that memoises `rowsToChartData` against rows / columns /
 * config identity. Consumer-managed reactivity at v1 — pass the rows
 * you want charted (post-filter, post-selection, etc.) and the hook
 * recomputes when those inputs change.
 */
export function useBcGridChartData<TRow>(
  rows: readonly TRow[],
  columns: readonly BcGridColumn<TRow>[],
  config: BcChartConfig,
): BcChartData {
  return useMemo(() => rowsToChartData(rows, columns, config), [rows, columns, config])
}

function columnsById<TRow>(
  columns: readonly BcGridColumn<TRow>[],
): Map<ColumnId, BcGridColumn<TRow>> {
  const map = new Map<ColumnId, BcGridColumn<TRow>>()
  columns.forEach((column, index) => map.set(identifyColumn(column, index), column))
  return map
}

function identifyColumn<TRow>(column: BcGridColumn<TRow>, index = 0): ColumnId {
  return column.columnId ?? column.field ?? `column-${index}`
}

function groupRowsByCategory<TRow>(
  rows: readonly TRow[],
  categoryColumn: BcGridColumn<TRow> | undefined,
): Map<string, TRow[]> {
  const groups = new Map<string, TRow[]>()
  for (const row of rows) {
    const category = categoryColumn
      ? formatCategoryValue(readValue(categoryColumn, row))
      : SINGLE_CATEGORY
    const bucket = groups.get(category)
    if (bucket) bucket.push(row)
    else groups.set(category, [row])
  }
  return groups
}

function readValue<TRow>(column: BcGridColumn<TRow>, row: TRow): unknown {
  if (column.valueGetter) return column.valueGetter(row)
  if (column.field) return (row as Record<string, unknown>)[column.field]
  return undefined
}

function formatCategoryValue(value: unknown): string {
  if (value == null) return "—"
  if (value instanceof Date) return value.toISOString()
  return String(value)
}

function resolveAggregation<TRow>(
  config: BcChartConfig,
  column: BcGridColumn<TRow>,
  columnId: ColumnId,
): BcAggregation {
  return config.aggregations?.[columnId] ?? column.aggregation ?? { type: "sum" }
}

function seriesLabel<TRow>(
  aggregationType: BcAggregation["type"],
  column: BcGridColumn<TRow>,
): string {
  const header = column.header ?? identifyColumn(column)
  const prefix =
    aggregationType === "sum"
      ? "Sum of"
      : aggregationType === "avg"
        ? "Avg of"
        : aggregationType === "min"
          ? "Min of"
          : aggregationType === "max"
            ? "Max of"
            : aggregationType === "count"
              ? "Count of"
              : aggregationType === "custom"
                ? "Custom of"
                : aggregationType
  return `${prefix} ${header}`
}

function orderCategories(
  valuesByCategory: ReadonlyMap<string, ReadonlyMap<ColumnId, number | null>>,
  explicitOrder: readonly string[] | undefined,
): string[] {
  if (explicitOrder && explicitOrder.length > 0) {
    return explicitOrder.filter((category) => valuesByCategory.has(category))
  }
  const categoryTotals = new Map<string, number>()
  for (const [category, values] of valuesByCategory) {
    let total = 0
    for (const value of values.values()) {
      if (value != null) total += value
    }
    categoryTotals.set(category, total)
  }
  return [...valuesByCategory.keys()].sort(
    (a, b) => (categoryTotals.get(b) ?? 0) - (categoryTotals.get(a) ?? 0),
  )
}
