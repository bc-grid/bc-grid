import type {
  BcGridColumn,
  BcPivotCellDTO,
  BcPivotColNodeDTO,
  BcPivotRowNodeDTO,
  BcPivotState,
  BcPivotedDataDTO,
  ColumnId,
} from "@bc-grid/core"
import {
  type AggregateOptions,
  type Aggregation,
  type AggregationContext,
  type AggregationResult,
  createAggregationContext,
  getColumnValue,
  resolveAggregationDefinition,
} from "./aggregate"

export interface PivotOptions extends AggregateOptions {}

export interface BcPivotRowNode<TRow> extends BcPivotRowNodeDTO {
  rows: readonly TRow[]
  children: readonly BcPivotRowNode<TRow>[]
}

export interface BcPivotColNode extends BcPivotColNodeDTO {
  children: readonly BcPivotColNode[]
}

export interface BcPivotCell extends BcPivotCellDTO {
  cacheKey: string
  results: readonly AggregationResult[]
}

export interface BcPivotedData<TRow> extends BcPivotedDataDTO {
  rowRoot: BcPivotRowNode<TRow>
  colRoot: BcPivotColNode
  cells: readonly BcPivotCell[]
  cellIndex: ReadonlyMap<string, BcPivotCell>
}

interface AxisDraft<TRow> {
  value: unknown
  keyPath: readonly unknown[]
  rows: TRow[]
  children: Map<string, AxisDraft<TRow>>
}

interface ResolvedPivotValue<TRow> {
  aggregation: Aggregation<TRow, unknown, unknown, unknown>
  column: BcGridColumn<TRow, unknown>
  ctx: AggregationContext<TRow, unknown>
}

interface PivotCellAccumulator<TRow> {
  rowKeyPath: readonly unknown[]
  colKeyPath: readonly unknown[]
  values: PivotValueAccumulator<TRow>[]
}

interface PivotValueAccumulator<TRow> {
  definition: ResolvedPivotValue<TRow>
  acc: unknown
  rowCount: number
}

export function pivot<TRow>(
  rows: readonly TRow[],
  columns: readonly BcGridColumn<TRow>[],
  state: BcPivotState,
  options: PivotOptions = {},
): BcPivotedData<TRow> {
  const columnsById = columnsByColumnId(columns)
  const rowDimensions = resolveColumns(state.rowGroups, columnsById)
  const colDimensions = resolveColumns(state.colGroups, columnsById)
  const values = resolvePivotValues(state, columnsById, options)
  const rowRoot = toRowNode(buildAxisDraft(rows, rowDimensions), options.locale)
  const colRoot = toColNode(buildAxisDraft(rows, colDimensions), options.locale)
  const cells = buildPivotCells(rows, rowDimensions, colDimensions, values, state, options)
  const cellIndex = new Map(cells.map((cell) => [cell.cacheKey, cell]))

  return {
    cellIndex,
    cells,
    colRoot,
    rowRoot,
  }
}

function columnsByColumnId<TRow>(
  columns: readonly BcGridColumn<TRow>[],
): ReadonlyMap<ColumnId, BcGridColumn<TRow, unknown>> {
  const byId = new Map<ColumnId, BcGridColumn<TRow, unknown>>()
  columns.forEach((column, index) => {
    const columnId = column.columnId ?? column.field ?? `column-${index}`
    byId.set(columnId, column as BcGridColumn<TRow, unknown>)
  })
  return byId
}

function resolveColumns<TRow>(
  columnIds: readonly ColumnId[],
  columnsById: ReadonlyMap<ColumnId, BcGridColumn<TRow, unknown>>,
): readonly BcGridColumn<TRow, unknown>[] {
  return columnIds.flatMap((columnId) => {
    const column = columnsById.get(columnId)
    return column ? [column] : []
  })
}

function resolvePivotValues<TRow>(
  state: BcPivotState,
  columnsById: ReadonlyMap<ColumnId, BcGridColumn<TRow, unknown>>,
  options: PivotOptions,
): readonly ResolvedPivotValue<TRow>[] {
  return state.values.flatMap((value) => {
    const column = columnsById.get(value.columnId)
    if (!column) return []
    const aggregation = resolveAggregationDefinition(value.aggregation ?? column.aggregation)
    if (!aggregation) return []
    return [
      {
        aggregation: aggregation as Aggregation<TRow, unknown, unknown, unknown>,
        column,
        ctx: createAggregationContext(column, options),
      },
    ]
  })
}

function buildAxisDraft<TRow>(
  rows: readonly TRow[],
  dimensions: readonly BcGridColumn<TRow, unknown>[],
): AxisDraft<TRow> {
  const root: AxisDraft<TRow> = {
    children: new Map(),
    keyPath: [],
    rows: [],
    value: null,
  }

  for (const row of rows) {
    root.rows.push(row)
    let cursor = root
    const keyPath: unknown[] = []
    for (const dimension of dimensions) {
      const value = getColumnValue(row, dimension)
      keyPath.push(value)
      const key = stableValueKey(value)
      let child = cursor.children.get(key)
      if (!child) {
        child = {
          children: new Map(),
          keyPath: keyPath.slice(),
          rows: [],
          value,
        }
        cursor.children.set(key, child)
      }
      child.rows.push(row)
      cursor = child
    }
  }

  return root
}

function toRowNode<TRow>(draft: AxisDraft<TRow>, locale: string | undefined): BcPivotRowNode<TRow> {
  return {
    children: sortedChildren(draft, locale).map((child) => toRowNode(child, locale)),
    isTotal: draft.keyPath.length === 0,
    keyPath: draft.keyPath,
    level: draft.keyPath.length,
    rows: draft.rows,
    value: draft.value,
  }
}

function toColNode<TRow>(draft: AxisDraft<TRow>, locale: string | undefined): BcPivotColNode {
  return {
    children: sortedChildren(draft, locale).map((child) => toColNode(child, locale)),
    isTotal: draft.keyPath.length === 0,
    keyPath: draft.keyPath,
    level: draft.keyPath.length,
    value: draft.value,
  }
}

function sortedChildren<TRow>(
  draft: AxisDraft<TRow>,
  locale: string | undefined,
): readonly AxisDraft<TRow>[] {
  return [...draft.children.values()].sort((a, b) => comparePivotValues(a.value, b.value, locale))
}

function buildPivotCells<TRow>(
  rows: readonly TRow[],
  rowDimensions: readonly BcGridColumn<TRow, unknown>[],
  colDimensions: readonly BcGridColumn<TRow, unknown>[],
  values: readonly ResolvedPivotValue<TRow>[],
  state: BcPivotState,
  options: PivotOptions,
): readonly BcPivotCell[] {
  if (values.length === 0) return []

  const buckets = new Map<string, PivotCellAccumulator<TRow>>()
  const includeRowTotals = state.subtotals?.rows ?? true
  const includeColTotals = state.subtotals?.cols ?? true

  for (const row of rows) {
    const rowPath = rowDimensions.map((dimension) => getColumnValue(row, dimension))
    const colPath = colDimensions.map((dimension) => getColumnValue(row, dimension))
    const rowPaths = aggregatePaths(rowPath, includeRowTotals)
    const colPaths = aggregatePaths(colPath, includeColTotals)

    for (const rowKeyPath of rowPaths) {
      for (const colKeyPath of colPaths) {
        const bucket = getOrCreateBucket(buckets, rowKeyPath, colKeyPath, values)
        for (const value of bucket.values) {
          const rawValue = getColumnValue(row, value.definition.column)
          if (value.definition.aggregation.id === "count" || rawValue != null) {
            value.rowCount += 1
          }
          value.acc = value.definition.aggregation.step(
            value.acc,
            rawValue,
            row,
            value.definition.ctx,
          )
        }
      }
    }
  }

  return [...buckets.values()]
    .map((bucket) => finalizeCell(bucket))
    .sort((a, b) => compareCellPaths(a, b, options.locale))
}

function getOrCreateBucket<TRow>(
  buckets: Map<string, PivotCellAccumulator<TRow>>,
  rowKeyPath: readonly unknown[],
  colKeyPath: readonly unknown[],
  values: readonly ResolvedPivotValue<TRow>[],
): PivotCellAccumulator<TRow> {
  const cacheKey = pivotCellCacheKey(rowKeyPath, colKeyPath)
  const existing = buckets.get(cacheKey)
  if (existing) return existing

  const bucket: PivotCellAccumulator<TRow> = {
    colKeyPath,
    rowKeyPath,
    values: values.map((definition) => ({
      acc: definition.aggregation.init(definition.ctx),
      definition,
      rowCount: 0,
    })),
  }
  buckets.set(cacheKey, bucket)
  return bucket
}

function finalizeCell<TRow>(bucket: PivotCellAccumulator<TRow>): BcPivotCell {
  const results = bucket.values.map(({ acc, definition, rowCount }) => {
    const value = definition.aggregation.finalize(acc, definition.ctx)
    return {
      aggregation: definition.aggregation as Aggregation<unknown, unknown, unknown>,
      columnId: definition.ctx.columnId,
      rowCount,
      value,
    } satisfies AggregationResult
  })

  return {
    cacheKey: pivotCellCacheKey(bucket.rowKeyPath, bucket.colKeyPath),
    colKeyPath: bucket.colKeyPath,
    results,
    rowKeyPath: bucket.rowKeyPath,
  }
}

function aggregatePaths(path: readonly unknown[], includeTotals: boolean): readonly unknown[][] {
  if (path.length === 0) return [[]]
  if (!includeTotals) return [path.slice()]

  const paths: unknown[][] = [[]]
  for (let length = 1; length <= path.length; length += 1) {
    paths.push(path.slice(0, length))
  }
  return paths
}

function compareCellPaths(
  a: Pick<BcPivotCell, "colKeyPath" | "rowKeyPath">,
  b: Pick<BcPivotCell, "colKeyPath" | "rowKeyPath">,
  locale: string | undefined,
): number {
  return (
    comparePath(a.rowKeyPath, b.rowKeyPath, locale) ||
    comparePath(a.colKeyPath, b.colKeyPath, locale)
  )
}

function comparePath(
  a: readonly unknown[],
  b: readonly unknown[],
  locale: string | undefined,
): number {
  const limit = Math.min(a.length, b.length)
  for (let index = 0; index < limit; index += 1) {
    const compared = comparePivotValues(a[index], b[index], locale)
    if (compared !== 0) return compared
  }
  return a.length - b.length
}

function comparePivotValues(a: unknown, b: unknown, locale: string | undefined): number {
  if (a == null && b == null) return 0
  if (a == null) return -1
  if (b == null) return 1
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime()
  if (typeof a === "number" && typeof b === "number") return a - b
  return new Intl.Collator(locale).compare(String(a), String(b))
}

function pivotCellCacheKey(rowKeyPath: readonly unknown[], colKeyPath: readonly unknown[]): string {
  return `${pivotPathCacheKey(rowKeyPath)}|${pivotPathCacheKey(colKeyPath)}`
}

function pivotPathCacheKey(path: readonly unknown[]): string {
  return JSON.stringify(path.map((value) => stableValueKey(value)))
}

function stableValueKey(value: unknown): string {
  if (value instanceof Date) return JSON.stringify(["date", value.toISOString()])
  if (typeof value === "number") {
    if (Number.isNaN(value)) return JSON.stringify(["number", "NaN"])
    if (Object.is(value, -0)) return JSON.stringify(["number", "-0"])
  }
  if (typeof value === "bigint") return JSON.stringify(["bigint", value.toString()])
  if (typeof value === "symbol") return JSON.stringify(["symbol", String(value)])
  if (typeof value === "function") return JSON.stringify(["function", value.name])

  try {
    return JSON.stringify([typeof value, value])
  } catch {
    return JSON.stringify([typeof value, String(value)])
  }
}
