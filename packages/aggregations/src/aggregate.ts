import type { BcAggregation, BcAggregationResultDTO, BcGridColumn, ColumnId } from "@bc-grid/core"

export interface AggregationContext<TRow = unknown, TValue = unknown> {
  column: BcGridColumn<TRow, TValue>
  columnId: ColumnId
  locale?: string
}

export interface Aggregation<TRow = unknown, TValue = unknown, TResult = unknown, TAcc = unknown> {
  id: string
  init(ctx: AggregationContext<TRow, TValue>): TAcc
  step(acc: TAcc, value: TValue, row: TRow, ctx: AggregationContext<TRow, TValue>): TAcc
  merge(a: TAcc, b: TAcc, ctx: AggregationContext<TRow, TValue>): TAcc
  finalize(acc: TAcc, ctx: AggregationContext<TRow, TValue>): TResult
}

export interface AggregationResult<TResult = unknown> extends BcAggregationResultDTO<TResult> {
  aggregation: Aggregation<unknown, unknown, TResult>
}

export interface AggregateOptions {
  locale?: string
}

const aggregationDefinitions = new Map<string, Aggregation>()

export const aggregationRegistry = {
  register(definition: Aggregation): void {
    registerAggregation(definition)
  },
  get(id: string): Aggregation | undefined {
    return aggregationDefinitions.get(id)
  },
}

export function registerAggregation(definition: Aggregation): void {
  aggregationDefinitions.set(definition.id, definition)
}

export function sum<TRow = unknown>(): Aggregation<TRow, number, number, number> {
  return {
    id: "sum",
    init: () => 0,
    step: (acc, value) => {
      const number = finiteNumber(value)
      return number == null ? acc : acc + number
    },
    merge: (a, b) => a + b,
    finalize: (acc) => acc,
  }
}

export function count<TRow = unknown>(): Aggregation<TRow, unknown, number, number> {
  return {
    id: "count",
    init: () => 0,
    step: (acc) => acc + 1,
    merge: (a, b) => a + b,
    finalize: (acc) => acc,
  }
}

export function avg<TRow = unknown>(): Aggregation<
  TRow,
  number,
  number | null,
  { count: number; sum: number }
> {
  return {
    id: "avg",
    init: () => ({ count: 0, sum: 0 }),
    step: (acc, value) => {
      const number = finiteNumber(value)
      return number == null ? acc : { count: acc.count + 1, sum: acc.sum + number }
    },
    merge: (a, b) => ({ count: a.count + b.count, sum: a.sum + b.sum }),
    finalize: (acc) => (acc.count === 0 ? null : acc.sum / acc.count),
  }
}

export function min<TRow = unknown, TValue = number | string | Date>(): Aggregation<
  TRow,
  TValue,
  TValue | null,
  TValue | null
> {
  return {
    id: "min",
    init: () => null,
    step: (acc, value, _row, ctx) => {
      if (value == null) return acc
      return acc == null || compareAggregateValues(value, acc, ctx.locale) < 0 ? value : acc
    },
    merge: (a, b, ctx) => {
      if (a == null) return b
      if (b == null) return a
      return compareAggregateValues(a, b, ctx.locale) <= 0 ? a : b
    },
    finalize: (acc) => acc,
  }
}

export function max<TRow = unknown, TValue = number | string | Date>(): Aggregation<
  TRow,
  TValue,
  TValue | null,
  TValue | null
> {
  return {
    id: "max",
    init: () => null,
    step: (acc, value, _row, ctx) => {
      if (value == null) return acc
      return acc == null || compareAggregateValues(value, acc, ctx.locale) > 0 ? value : acc
    },
    merge: (a, b, ctx) => {
      if (a == null) return b
      if (b == null) return a
      return compareAggregateValues(a, b, ctx.locale) >= 0 ? a : b
    },
    finalize: (acc) => acc,
  }
}

export function aggregate<TRow, TValue, TResult, TAcc>(
  rows: readonly TRow[],
  column: BcGridColumn<TRow, TValue>,
  aggregation: Aggregation<TRow, TValue, TResult, TAcc>,
  options: AggregateOptions = {},
): AggregationResult<TResult> {
  const ctx = createAggregationContext(column, options)
  let acc = aggregation.init(ctx)
  let rowCount = 0

  for (const row of rows) {
    const value = getColumnValue(row, column)
    if (aggregation.id === "count" || value != null) rowCount += 1
    acc = aggregation.step(acc, value, row, ctx)
  }

  return {
    aggregation: aggregation as Aggregation<unknown, unknown, TResult>,
    columnId: ctx.columnId,
    rowCount,
    value: aggregation.finalize(acc, ctx),
  }
}

export function aggregateColumns<TRow>(
  rows: readonly TRow[],
  columns: readonly BcGridColumn<TRow>[],
  options: AggregateOptions = {},
): readonly AggregationResult[] {
  return columns.flatMap((column) => {
    const aggregation = resolveAggregationDefinition(column.aggregation)
    return aggregation ? [aggregate(rows, column, aggregation, options)] : []
  })
}

export function aggregateGroups<TRow>(
  groupedRows: ReadonlyMap<string, readonly TRow[]>,
  columns: readonly BcGridColumn<TRow>[],
  options: AggregateOptions = {},
): ReadonlyMap<string, readonly AggregationResult[]> {
  const results = new Map<string, readonly AggregationResult[]>()
  for (const [groupKey, rows] of groupedRows) {
    results.set(groupKey, aggregateColumns(rows, columns, options))
  }
  return results
}

export function resolveAggregationDefinition(
  definition: BcAggregation | undefined,
): Aggregation | null {
  if (!definition) return null
  if (definition.type === "custom" && definition.custom) {
    if (isAggregation(definition.custom)) return definition.custom
    if (typeof definition.custom === "function") return legacyToAggregation(definition.custom)
    return null
  }
  return aggregationRegistry.get(definition.type) ?? null
}

function legacyToAggregation(
  legacy: (rows: unknown[]) => unknown,
): Aggregation<unknown, unknown, unknown, unknown[]> {
  return {
    id: "custom-legacy",
    init: () => [] as unknown[],
    step: (acc, _value, row) => {
      acc.push(row)
      return acc
    },
    merge: (a, b) => [...a, ...b],
    finalize: (acc) => legacy(acc),
  }
}

function isAggregation(value: unknown): value is Aggregation {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "init" in value &&
    "step" in value &&
    "merge" in value &&
    "finalize" in value
  )
}

export function createAggregationContext<TRow, TValue>(
  column: BcGridColumn<TRow, TValue>,
  options: AggregateOptions,
): AggregationContext<TRow, TValue> {
  return {
    column,
    columnId: column.columnId ?? column.field ?? "unknown",
    ...(options.locale ? { locale: options.locale } : {}),
  }
}

export function getColumnValue<TRow, TValue>(
  row: TRow,
  column: BcGridColumn<TRow, TValue>,
): TValue {
  if (column.valueGetter) return column.valueGetter(row)
  if (column.field) return row[column.field] as TValue
  return undefined as TValue
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function compareAggregateValues(a: unknown, b: unknown, locale: string | undefined): number {
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime()
  if (typeof a === "number" && typeof b === "number") return a - b
  return new Intl.Collator(locale).compare(String(a), String(b))
}

for (const definition of [sum(), count(), avg(), min(), max()]) {
  registerAggregation(definition as unknown as Aggregation)
}
