import { normaliseRange } from "@bc-grid/core"
import type {
  BcCellPosition,
  BcColumnFormat,
  BcNormalisedRange,
  BcRange,
  ColumnId,
  RowId,
} from "@bc-grid/core"
import { cellsToTsv } from "./rangeClipboard"
import type { BcFillSeries, BcFillSeriesSourceCell, BcFillSeriesTargetCell } from "./types"

type RangeFillColumnRef = {
  readonly columnId: ColumnId
  readonly fillSeries?: BcFillSeries
  readonly format?: BcColumnFormat
  readonly source?: {
    readonly fillSeries?: BcFillSeries
    readonly format?: BcColumnFormat
  }
}

export type RangeFillDirection = "up" | "down" | "left" | "right"

export interface RangeFillProjection {
  direction: RangeFillDirection
  sourceRange: BcRange
  targetRange: BcRange
  fillRange: BcRange
  sourceBounds: BcNormalisedRange
  fillBounds: BcNormalisedRange
  targetBounds: BcNormalisedRange
}

export interface ProjectRangeFillInput {
  sourceRange: BcRange
  target: BcCellPosition
  columns: readonly RangeFillColumnRef[]
  rowIds: readonly RowId[]
}

export interface BuildRangeFillTsvInput {
  projection: RangeFillProjection
  columns: readonly RangeFillColumnRef[]
  rowIds: readonly RowId[]
  getSourceValue: (position: BcCellPosition) => unknown
  locale?: string | undefined
}

export function projectRangeFill({
  sourceRange,
  target,
  columns,
  rowIds,
}: ProjectRangeFillInput): RangeFillProjection | null {
  const sourceBounds = normaliseRange(sourceRange, columns, rowIds)
  if (!sourceBounds) return null

  const targetRowIndex = rowIds.indexOf(target.rowId)
  const targetColumnIndex = columns.findIndex((column) => column.columnId === target.columnId)
  if (targetRowIndex < 0 || targetColumnIndex < 0) return null

  const direction = dominantFillDirection(sourceBounds, targetRowIndex, targetColumnIndex)
  if (!direction) return null

  const ranges = fillRangesForDirection(
    sourceBounds,
    direction,
    targetRowIndex,
    targetColumnIndex,
    columns,
    rowIds,
  )
  if (!ranges) return null

  const targetBounds = normaliseRange(ranges.targetRange, columns, rowIds)
  const fillBounds = normaliseRange(ranges.fillRange, columns, rowIds)
  if (!targetBounds || !fillBounds) return null

  return {
    direction,
    sourceRange,
    sourceBounds,
    targetRange: ranges.targetRange,
    targetBounds,
    fillRange: ranges.fillRange,
    fillBounds,
  }
}

export function buildRangeFillTsv({
  projection,
  columns,
  rowIds,
  getSourceValue,
  locale,
}: BuildRangeFillTsvInput): string {
  const rows: string[][] = []
  const { fillBounds, sourceBounds } = projection
  const linePlans =
    projection.direction === "up" || projection.direction === "down"
      ? buildVerticalLinePlans({ projection, columns, rowIds, getSourceValue, locale })
      : buildHorizontalLinePlans({ projection, columns, rowIds, getSourceValue, locale })

  for (let rowIndex = fillBounds.rowStart; rowIndex <= fillBounds.rowEnd; rowIndex += 1) {
    const row: string[] = []
    for (let colIndex = fillBounds.colStart; colIndex <= fillBounds.colEnd; colIndex += 1) {
      const lineKey =
        projection.direction === "up" || projection.direction === "down" ? colIndex : rowIndex
      const plan = linePlans.get(lineKey)
      if (!plan) {
        row.push("")
        continue
      }
      const step =
        projection.direction === "up" || projection.direction === "down"
          ? rowIndex - sourceBounds.rowStart
          : colIndex - sourceBounds.colStart
      const fillIndex =
        projection.direction === "up" || projection.direction === "down"
          ? rowIndex - fillBounds.rowStart
          : colIndex - fillBounds.colStart
      row.push(stringifyFillValue(plan.valueAt(step, fillIndex)))
    }
    rows.push(row)
  }

  return cellsToTsv(rows)
}

export function buildLiteralRangeFillTsv(input: BuildRangeFillTsvInput): string {
  return buildRangeFillTsv({
    ...input,
    columns: input.columns.map((column) =>
      column.source
        ? {
            ...column,
            fillSeries: "literal" as const,
            source: { ...column.source, fillSeries: "literal" as const },
          }
        : { ...column, fillSeries: "literal" as const },
    ),
  })
}

function dominantFillDirection(
  source: BcNormalisedRange,
  targetRowIndex: number,
  targetColumnIndex: number,
): RangeFillDirection | null {
  const verticalDistance =
    targetRowIndex < source.rowStart
      ? source.rowStart - targetRowIndex
      : targetRowIndex > source.rowEnd
        ? targetRowIndex - source.rowEnd
        : 0
  const horizontalDistance =
    targetColumnIndex < source.colStart
      ? source.colStart - targetColumnIndex
      : targetColumnIndex > source.colEnd
        ? targetColumnIndex - source.colEnd
        : 0

  if (verticalDistance === 0 && horizontalDistance === 0) return null
  if (verticalDistance >= horizontalDistance && verticalDistance > 0) {
    return targetRowIndex < source.rowStart ? "up" : "down"
  }
  if (horizontalDistance > 0) return targetColumnIndex < source.colStart ? "left" : "right"
  return null
}

function fillRangesForDirection(
  source: BcNormalisedRange,
  direction: RangeFillDirection,
  targetRowIndex: number,
  targetColumnIndex: number,
  columns: readonly RangeFillColumnRef[],
  rowIds: readonly RowId[],
): { targetRange: BcRange; fillRange: BcRange } | null {
  if (direction === "down") {
    if (targetRowIndex <= source.rowEnd) return null
    return {
      targetRange: rangeFromBounds(
        source.rowStart,
        source.colStart,
        targetRowIndex,
        source.colEnd,
        columns,
        rowIds,
      ),
      fillRange: rangeFromBounds(
        source.rowEnd + 1,
        source.colStart,
        targetRowIndex,
        source.colEnd,
        columns,
        rowIds,
      ),
    }
  }
  if (direction === "up") {
    if (targetRowIndex >= source.rowStart) return null
    return {
      targetRange: rangeFromBounds(
        targetRowIndex,
        source.colStart,
        source.rowEnd,
        source.colEnd,
        columns,
        rowIds,
      ),
      fillRange: rangeFromBounds(
        targetRowIndex,
        source.colStart,
        source.rowStart - 1,
        source.colEnd,
        columns,
        rowIds,
      ),
    }
  }
  if (direction === "right") {
    if (targetColumnIndex <= source.colEnd) return null
    return {
      targetRange: rangeFromBounds(
        source.rowStart,
        source.colStart,
        source.rowEnd,
        targetColumnIndex,
        columns,
        rowIds,
      ),
      fillRange: rangeFromBounds(
        source.rowStart,
        source.colEnd + 1,
        source.rowEnd,
        targetColumnIndex,
        columns,
        rowIds,
      ),
    }
  }
  if (targetColumnIndex >= source.colStart) return null
  return {
    targetRange: rangeFromBounds(
      source.rowStart,
      targetColumnIndex,
      source.rowEnd,
      source.colEnd,
      columns,
      rowIds,
    ),
    fillRange: rangeFromBounds(
      source.rowStart,
      targetColumnIndex,
      source.rowEnd,
      source.colStart - 1,
      columns,
      rowIds,
    ),
  }
}

function rangeFromBounds(
  rowStart: number,
  colStart: number,
  rowEnd: number,
  colEnd: number,
  columns: readonly RangeFillColumnRef[],
  rowIds: readonly RowId[],
): BcRange {
  const start = positionAt(rowStart, colStart, columns, rowIds)
  const end = positionAt(rowEnd, colEnd, columns, rowIds)
  if (!start || !end) {
    throw new Error("Range fill bounds are outside the current row/column model.")
  }
  return {
    start,
    end,
  }
}

function positionAt(
  rowIndex: number,
  colIndex: number,
  columns: readonly RangeFillColumnRef[],
  rowIds: readonly RowId[],
): BcCellPosition | null {
  const rowId = rowIds[rowIndex]
  const column = columns[colIndex]
  if (rowId == null || !column) return null
  return { rowId, columnId: column.columnId }
}

function stringifyFillValue(value: unknown): string {
  if (value == null) return ""
  if (value instanceof Date) return value.toISOString()
  return String(value)
}

interface LineSeriesPlan {
  valueAt: (step: number, fillIndex: number) => unknown
}

interface BuildLinePlansInput {
  projection: RangeFillProjection
  columns: readonly RangeFillColumnRef[]
  rowIds: readonly RowId[]
  getSourceValue: (position: BcCellPosition) => unknown
  locale?: string | undefined
}

function buildVerticalLinePlans({
  projection,
  columns,
  rowIds,
  getSourceValue,
  locale,
}: BuildLinePlansInput): Map<number, LineSeriesPlan> {
  const plans = new Map<number, LineSeriesPlan>()
  const { fillBounds, sourceBounds } = projection

  for (let colIndex = sourceBounds.colStart; colIndex <= sourceBounds.colEnd; colIndex += 1) {
    const sourceCells: BcFillSeriesSourceCell[] = []
    const fillCells: BcFillSeriesTargetCell[] = []

    for (let rowIndex = sourceBounds.rowStart; rowIndex <= sourceBounds.rowEnd; rowIndex += 1) {
      const position = positionAt(rowIndex, colIndex, columns, rowIds)
      if (!position) continue
      sourceCells.push({
        position,
        rowIndex,
        columnIndex: colIndex,
        value: getSourceValue(position),
      })
    }

    for (let rowIndex = fillBounds.rowStart; rowIndex <= fillBounds.rowEnd; rowIndex += 1) {
      const position = positionAt(rowIndex, colIndex, columns, rowIds)
      if (!position) continue
      fillCells.push({ position, rowIndex, columnIndex: colIndex })
    }

    plans.set(
      colIndex,
      createLineSeriesPlan(sourceCells, fillCells, columnFillSeries(columns[colIndex]), {
        locale,
        sourceColumn: columns[colIndex],
      }),
    )
  }

  return plans
}

function buildHorizontalLinePlans({
  projection,
  columns,
  rowIds,
  getSourceValue,
  locale,
}: BuildLinePlansInput): Map<number, LineSeriesPlan> {
  const plans = new Map<number, LineSeriesPlan>()
  const { fillBounds, sourceBounds } = projection

  for (let rowIndex = sourceBounds.rowStart; rowIndex <= sourceBounds.rowEnd; rowIndex += 1) {
    const sourceCells: BcFillSeriesSourceCell[] = []
    const fillCells: BcFillSeriesTargetCell[] = []

    for (let colIndex = sourceBounds.colStart; colIndex <= sourceBounds.colEnd; colIndex += 1) {
      const position = positionAt(rowIndex, colIndex, columns, rowIds)
      if (!position) continue
      sourceCells.push({
        position,
        rowIndex,
        columnIndex: colIndex,
        value: getSourceValue(position),
      })
    }

    for (let colIndex = fillBounds.colStart; colIndex <= fillBounds.colEnd; colIndex += 1) {
      const position = positionAt(rowIndex, colIndex, columns, rowIds)
      if (!position) continue
      fillCells.push({ position, rowIndex, columnIndex: colIndex })
    }

    plans.set(
      rowIndex,
      createLineSeriesPlan(
        sourceCells,
        fillCells,
        commonHorizontalFillSeries(columns, sourceBounds),
        {
          locale,
          sourceColumn: columns[sourceBounds.colStart],
        },
      ),
    )
  }

  return plans
}

function createLineSeriesPlan(
  sourceCells: readonly BcFillSeriesSourceCell[],
  fillCells: readonly BcFillSeriesTargetCell[],
  fillSeries: BcFillSeries | undefined,
  options: { locale?: string | undefined; sourceColumn?: RangeFillColumnRef | undefined },
): LineSeriesPlan {
  const sourceValues = sourceCells.map((cell) => cell.value)
  const literalPlan = createLiteralPlan(sourceValues)

  if (typeof fillSeries === "function") {
    try {
      const values = fillSeries(sourceCells, fillCells)
      return {
        valueAt(_step, fillIndex) {
          return values[fillIndex] ?? ""
        },
      }
    } catch {
      return literalPlan
    }
  }

  if (fillSeries === "literal") return literalPlan
  if (fillSeries === "linear") return createNumericLinearPlan(sourceValues, true) ?? literalPlan
  if (fillSeries === "exponential") return createNumericExponentialPlan(sourceValues) ?? literalPlan
  if (fillSeries === "weekday") {
    return createNamedCyclePlan(sourceValues, "weekday", options.locale) ?? literalPlan
  }
  if (fillSeries === "month") {
    return createNamedCyclePlan(sourceValues, "month", options.locale) ?? literalPlan
  }

  return (
    createDatePlan(sourceValues, options.sourceColumn) ??
    createNamedCyclePlan(sourceValues, "weekday", options.locale) ??
    createNamedCyclePlan(sourceValues, "month", options.locale) ??
    createQuarterPlan(sourceValues) ??
    createNumericLinearPlan(sourceValues, false) ??
    literalPlan
  )
}

function createLiteralPlan(sourceValues: readonly unknown[]): LineSeriesPlan {
  return {
    valueAt(step) {
      if (sourceValues.length === 0) return ""
      return sourceValues[positiveModulo(step, sourceValues.length)] ?? ""
    },
  }
}

function createNumericLinearPlan(
  sourceValues: readonly unknown[],
  allowSingleSourceIncrement: boolean,
): LineSeriesPlan | null {
  const points = sourceValues.map(parseNumericValue)
  if (points.some((point) => point == null)) return null
  const numbers = points as NumericPoint[]
  if (numbers.length === 0) return null
  if (numbers.length === 1 && !allowSingleSourceIncrement) return null
  const first = numbers[0]
  if (!first) return null

  const delta = numbers.length === 1 ? 1 : (numbers[1]?.value ?? Number.NaN) - first.value
  if (!Number.isFinite(delta)) return null
  for (let index = 2; index < numbers.length; index += 1) {
    const previous = numbers[index - 1]
    const current = numbers[index]
    if (!previous || !current) return null
    if (!nearlyEqual(current.value - previous.value, delta)) return null
  }

  const precision = Math.max(...numbers.map((point) => point.precision), decimalPrecision(delta))
  return {
    valueAt(step) {
      return formatNumericValue(first.value + delta * step, precision)
    },
  }
}

function createNumericExponentialPlan(sourceValues: readonly unknown[]): LineSeriesPlan | null {
  const points = sourceValues.map(parseNumericValue)
  if (points.some((point) => point == null)) return null
  const numbers = points as NumericPoint[]
  if (numbers.length < 2) return null
  const first = numbers[0]
  if (!first || first.value === 0) return null
  const ratio = (numbers[1]?.value ?? Number.NaN) / first.value
  if (!Number.isFinite(ratio) || ratio === 0) return null

  for (let index = 2; index < numbers.length; index += 1) {
    const previous = numbers[index - 1]
    const current = numbers[index]
    if (!previous || !current || previous.value === 0) return null
    if (!nearlyEqual(current.value / previous.value, ratio)) return null
  }

  const precision = Math.max(...numbers.map((point) => point.precision), decimalPrecision(ratio))
  return {
    valueAt(step) {
      return formatNumericValue(first.value * ratio ** step, precision)
    },
  }
}

interface NumericPoint {
  value: number
  precision: number
}

function parseNumericValue(value: unknown): NumericPoint | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? { value, precision: decimalPrecision(value) } : null
  }
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (trimmed.length === 0) return null
  const normalized = trimmed.replace(/,/g, "")
  if (!/^[+-]?(?:(?:\d+\.?\d*)|(?:\.\d+))(?:e[+-]?\d+)?$/i.test(normalized)) return null
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? { value: parsed, precision: decimalPrecision(normalized) } : null
}

function createDatePlan(
  sourceValues: readonly unknown[],
  sourceColumn: RangeFillColumnRef | undefined,
): LineSeriesPlan | null {
  const allowDateTimeString = isDateFillColumn(sourceColumn)
  const points = sourceValues.map((value) => parseDateValue(value, allowDateTimeString))
  if (points.some((point) => point == null)) return null
  const dates = points as DatePoint[]
  if (dates.length === 0) return null

  const increment =
    dates.length === 1 ? { unit: "day" as const, amount: 1 } : inferDateIncrement(dates)
  if (!increment || increment.amount === 0) return null

  for (let index = 1; index < dates.length; index += 1) {
    const expected = addDateStep(dates[index - 1] as DatePoint, increment, 1)
    if (!datePointEquals(expected, dates[index] as DatePoint)) return null
  }

  return {
    valueAt(step) {
      return formatDatePoint(addDateStep(dates[0] as DatePoint, increment, step))
    },
  }
}

type DateIncrement =
  | { unit: "day"; amount: number }
  | { unit: "week"; amount: number }
  | { unit: "month"; amount: number }
  | { unit: "quarter"; amount: number }
  | { unit: "year"; amount: number }

interface DatePoint {
  year: number
  month: number
  day: number
}

function parseDateValue(value: unknown, allowDateTimeString: boolean): DatePoint | null {
  if (value instanceof Date) {
    if (!Number.isFinite(value.valueOf())) return null
    return {
      year: value.getUTCFullYear(),
      month: value.getUTCMonth(),
      day: value.getUTCDate(),
    }
  }
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed)
  const dateTimeMatch = allowDateTimeString
    ? /^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)$/.exec(trimmed)
    : null
  const match = dateOnlyMatch ?? dateTimeMatch
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2]) - 1
  const day = Number(match[3])
  const point = { year, month, day }
  return datePointEquals(point, fromUtcMs(Date.UTC(year, month, day))) ? point : null
}

function inferDateIncrement(dates: readonly DatePoint[]): DateIncrement | null {
  const first = dates[0]
  const second = dates[1]
  if (!first || !second) return null

  const monthDelta = (second.year - first.year) * 12 + (second.month - first.month)
  if (monthDelta !== 0 && datePointEquals(addMonths(first, monthDelta), second)) {
    if (monthDelta % 12 === 0) return { unit: "year", amount: monthDelta / 12 }
    if (monthDelta % 3 === 0) return { unit: "quarter", amount: monthDelta / 3 }
    return { unit: "month", amount: monthDelta }
  }

  const dayDelta = (toUtcMs(second) - toUtcMs(first)) / DAY_MS
  if (!Number.isInteger(dayDelta)) return null
  if (dayDelta !== 0 && dayDelta % 7 === 0) return { unit: "week", amount: dayDelta / 7 }
  return { unit: "day", amount: dayDelta }
}

function addDateStep(point: DatePoint, increment: DateIncrement, step: number): DatePoint {
  if (increment.unit === "day") return fromUtcMs(toUtcMs(point) + increment.amount * step * DAY_MS)
  if (increment.unit === "week") {
    return fromUtcMs(toUtcMs(point) + increment.amount * step * 7 * DAY_MS)
  }
  if (increment.unit === "month") return addMonths(point, increment.amount * step)
  if (increment.unit === "quarter") return addMonths(point, increment.amount * step * 3)
  return addMonths(point, increment.amount * step * 12)
}

function addMonths(point: DatePoint, amount: number): DatePoint {
  const targetMonthIndex = point.month + amount
  const year = point.year + Math.floor(targetMonthIndex / 12)
  const month = positiveModulo(targetMonthIndex, 12)
  const day = Math.min(point.day, daysInMonth(year, month))
  return { year, month, day }
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
}

function toUtcMs(point: DatePoint): number {
  return Date.UTC(point.year, point.month, point.day)
}

function fromUtcMs(ms: number): DatePoint {
  const date = new Date(ms)
  return { year: date.getUTCFullYear(), month: date.getUTCMonth(), day: date.getUTCDate() }
}

function datePointEquals(a: DatePoint, b: DatePoint): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day
}

function formatDatePoint(point: DatePoint): string {
  return `${String(point.year).padStart(4, "0")}-${String(point.month + 1).padStart(
    2,
    "0",
  )}-${String(point.day).padStart(2, "0")}`
}

function createNamedCyclePlan(
  sourceValues: readonly unknown[],
  kind: "weekday" | "month",
  locale: string | undefined,
): LineSeriesPlan | null {
  const names = buildNameCycle(kind, locale)
  const points = sourceValues.map((value) => parseNamedCycleValue(value, names, locale))
  if (points.some((point) => point == null)) return null
  const parsed = points as NamedCyclePoint[]
  if (parsed.length === 0) return null
  const first = parsed[0]
  if (!first) return null

  const delta =
    parsed.length === 1
      ? 1
      : cycleDelta(first.index, parsed[1]?.index ?? Number.NaN, names.values.length)
  if (!Number.isFinite(delta) || delta === 0) return null

  for (let index = 2; index < parsed.length; index += 1) {
    const previous = parsed[index - 1]
    const current = parsed[index]
    if (!previous || !current) return null
    if (positiveModulo(previous.index + delta, names.values.length) !== current.index) return null
  }

  const style = first.style
  return {
    valueAt(step) {
      const value = names.values[positiveModulo(first.index + delta * step, names.values.length)]
      return value?.[style] ?? ""
    },
  }
}

type NamedCycleStyle = "short" | "long"

interface NamedCyclePoint {
  index: number
  style: NamedCycleStyle
}

interface NamedCycle {
  values: readonly { short: string; long: string }[]
  lookup: ReadonlyMap<string, NamedCyclePoint>
}

function buildNameCycle(kind: "weekday" | "month", locale: string | undefined): NamedCycle {
  const values =
    kind === "weekday"
      ? Array.from({ length: 7 }, (_, index) => {
          const date = new Date(Date.UTC(2024, 0, 7 + index))
          return {
            short: new Intl.DateTimeFormat(locale, {
              weekday: "short",
              timeZone: "UTC",
            }).format(date),
            long: new Intl.DateTimeFormat(locale, {
              weekday: "long",
              timeZone: "UTC",
            }).format(date),
          }
        })
      : Array.from({ length: 12 }, (_, index) => {
          const date = new Date(Date.UTC(2024, index, 1))
          return {
            short: new Intl.DateTimeFormat(locale, {
              month: "short",
              timeZone: "UTC",
            }).format(date),
            long: new Intl.DateTimeFormat(locale, {
              month: "long",
              timeZone: "UTC",
            }).format(date),
          }
        })

  const lookup = new Map<string, NamedCyclePoint>()
  for (const [index, value] of values.entries()) {
    lookup.set(normaliseSeriesName(value.short, locale), { index, style: "short" })
    lookup.set(normaliseSeriesName(value.long, locale), { index, style: "long" })
  }
  return { values, lookup }
}

function parseNamedCycleValue(
  value: unknown,
  names: NamedCycle,
  locale: string | undefined,
): NamedCyclePoint | null {
  if (typeof value !== "string") return null
  return names.lookup.get(normaliseSeriesName(value, locale)) ?? null
}

function createQuarterPlan(sourceValues: readonly unknown[]): LineSeriesPlan | null {
  const points = sourceValues.map(parseQuarterValue)
  if (points.some((point) => point == null)) return null
  const quarters = points as QuarterPoint[]
  if (quarters.length === 0) return null
  const first = quarters[0]
  if (!first) return null
  const delta =
    quarters.length === 1 ? 1 : cycleDelta(first.index, quarters[1]?.index ?? Number.NaN, 4)
  if (!Number.isFinite(delta) || delta === 0) return null

  for (let index = 2; index < quarters.length; index += 1) {
    const previous = quarters[index - 1]
    const current = quarters[index]
    if (!previous || !current) return null
    if (positiveModulo(previous.index + delta, 4) !== current.index) return null
  }

  const prefix = first.prefix
  return {
    valueAt(step) {
      return `${prefix}${positiveModulo(first.index + delta * step, 4) + 1}`
    },
  }
}

interface QuarterPoint {
  index: number
  prefix: "Q" | "q"
}

function parseQuarterValue(value: unknown): QuarterPoint | null {
  if (typeof value !== "string") return null
  const match = /^(Q|q)([1-4])$/.exec(value.trim())
  if (!match) return null
  return { prefix: match[1] as "Q" | "q", index: Number(match[2]) - 1 }
}

function columnFillSeries(column: RangeFillColumnRef | undefined): BcFillSeries | undefined {
  return column?.source?.fillSeries ?? column?.fillSeries
}

function columnFormat(column: RangeFillColumnRef | undefined): BcColumnFormat | undefined {
  return column?.source?.format ?? column?.format
}

function isDateFillColumn(column: RangeFillColumnRef | undefined): boolean {
  const format = columnFormat(column)
  return format === "date" || (typeof format === "object" && format.type === "date")
}

function commonHorizontalFillSeries(
  columns: readonly RangeFillColumnRef[],
  sourceBounds: BcNormalisedRange,
): BcFillSeries | undefined {
  let common = columnFillSeries(columns[sourceBounds.colStart])
  for (let colIndex = sourceBounds.colStart + 1; colIndex <= sourceBounds.colEnd; colIndex += 1) {
    if (columnFillSeries(columns[colIndex]) !== common) {
      common = undefined
      break
    }
  }
  return common
}

function normaliseSeriesName(value: string, locale: string | undefined): string {
  return value.trim().replace(/\.$/, "").toLocaleLowerCase(locale)
}

function cycleDelta(first: number, second: number, size: number): number {
  const forward = positiveModulo(second - first, size)
  if (forward <= size / 2) return forward
  return forward - size
}

function positiveModulo(value: number, size: number): number {
  return ((value % size) + size) % size
}

function nearlyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < 1e-9
}

function decimalPrecision(value: number | string): number {
  const text = String(value).toLowerCase()
  const [mantissa, exponentText] = text.split("e")
  const exponent = exponentText ? Number(exponentText) : 0
  const decimal = mantissa?.split(".")[1]?.length ?? 0
  return Math.max(0, decimal - exponent)
}

function formatNumericValue(value: number, precision: number): string {
  const rounded = precision > 0 ? Number(value.toFixed(Math.min(precision, 12))) : Math.round(value)
  if (precision <= 0) return String(rounded)
  return rounded.toFixed(Math.min(precision, 12)).replace(/\.?0+$/, "")
}

const DAY_MS = 24 * 60 * 60 * 1000
