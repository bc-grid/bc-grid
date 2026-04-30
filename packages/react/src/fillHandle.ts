import type { BcRange, ColumnId, RowId } from "@bc-grid/core"
import type { ResolvedColumn, RowEntry } from "./gridInternals"
import { isDataRowEntry } from "./gridInternals"
import type { BuiltRangePaste, PreparedRangePaste, RangePasteTarget } from "./rangePaste"
import { prepareRangePaste } from "./rangePaste"

const DAY_MS = 24 * 60 * 60 * 1000

export type RangeFillDirection = "up" | "down" | "left" | "right"
export type RangeFillStrategy = "linear" | "copy"

export interface RangeIndexBounds {
  rowStart: number
  rowEnd: number
  colStart: number
  colEnd: number
  rowSpan: number
  colSpan: number
}

export interface RangeFillSource<TRow> {
  sourceRowIndex: number
  sourceColIndex: number
  rowId: RowId
  row: TRow
  columnId: ColumnId
  column: ResolvedColumn<TRow>
}

export interface BuiltRangeFill<TRow> extends BuiltRangePaste<TRow> {
  sourceRange: BcRange
  fillRange: BcRange
  direction: RangeFillDirection
  strategy: RangeFillStrategy
}

interface BuildRangeFillParams<TRow> {
  sourceRange: BcRange
  target: { rowId: RowId; columnId: ColumnId }
  columns: readonly ResolvedColumn<TRow>[]
  rowEntries: readonly RowEntry<TRow>[]
  rowIds: readonly RowId[]
  getSourceValue: (source: RangeFillSource<TRow>) => unknown
}

interface PrepareRangeFillParams<TRow> {
  fill: BuiltRangeFill<TRow>
  getPreviousValue: (target: RangePasteTarget<TRow>) => unknown
  isEditable?: (target: RangePasteTarget<TRow>) => boolean
  signal?: AbortSignal
}

interface FillPlan {
  direction: RangeFillDirection
  source: RangeIndexBounds
  target: RangeIndexBounds
  fill: RangeIndexBounds
}

type LaneSequence = NumericSequence | DateSequence | CopySequence

interface NumericSequence {
  kind: "numeric"
  first: number
  step: number
}

interface DateSequence {
  kind: "date"
  firstDay: number
  stepDays: number
}

interface CopySequence {
  kind: "copy"
  values: readonly string[]
}

export function resolveRangeIndexBounds<TRow>(
  range: BcRange,
  columns: readonly ResolvedColumn<TRow>[],
  rowIds: readonly RowId[],
): RangeIndexBounds | undefined {
  const startRow = rowIds.indexOf(range.start.rowId)
  const endRow = rowIds.indexOf(range.end.rowId)
  const startCol = columns.findIndex((column) => column.columnId === range.start.columnId)
  const endCol = columns.findIndex((column) => column.columnId === range.end.columnId)
  if (startRow < 0 || endRow < 0 || startCol < 0 || endCol < 0) return undefined

  const rowStart = Math.min(startRow, endRow)
  const rowEnd = Math.max(startRow, endRow)
  const colStart = Math.min(startCol, endCol)
  const colEnd = Math.max(startCol, endCol)
  return {
    rowStart,
    rowEnd,
    colStart,
    colEnd,
    rowSpan: rowEnd - rowStart + 1,
    colSpan: colEnd - colStart + 1,
  }
}

export function rangeSpansPinnedBoundary<TRow>(
  range: BcRange,
  columns: readonly ResolvedColumn<TRow>[],
  rowIds: readonly RowId[],
): boolean {
  const bounds = resolveRangeIndexBounds(range, columns, rowIds)
  if (!bounds) return true

  let pinnedRegion: "left" | "right" | "body" | undefined
  for (let col = bounds.colStart; col <= bounds.colEnd; col += 1) {
    const column = columns[col]
    const next = column?.pinned ?? "body"
    pinnedRegion ??= next
    if (pinnedRegion !== next) return true
  }
  return false
}

export function targetRangeForFillDrag<TRow>({
  sourceRange,
  target,
  columns,
  rowIds,
}: {
  sourceRange: BcRange
  target: { rowId: RowId; columnId: ColumnId }
  columns: readonly ResolvedColumn<TRow>[]
  rowIds: readonly RowId[]
}): BcRange | undefined {
  return buildFillPlan({ sourceRange, target, columns, rowIds })?.targetRange
}

export function buildRangeFill<TRow>({
  sourceRange,
  target,
  columns,
  rowEntries,
  rowIds,
  getSourceValue,
}: BuildRangeFillParams<TRow>): BuiltRangeFill<TRow> | undefined {
  const planResult = buildFillPlan({ sourceRange, target, columns, rowIds })
  if (!planResult) return undefined
  const { plan, targetRange, fillRange } = planResult

  const laneSequences = buildLaneSequences({
    plan,
    columns,
    rowEntries,
    getSourceValue,
  })
  if (laneSequences.length === 0) return undefined

  const targets: RangePasteTarget<TRow>[] = []
  const cells: string[][] = []
  let truncatedCount = 0
  let usedLinear = false

  for (let row = plan.fill.rowStart; row <= plan.fill.rowEnd; row += 1) {
    const matrixRow = row - plan.fill.rowStart
    cells[matrixRow] ??= []

    for (let col = plan.fill.colStart; col <= plan.fill.colEnd; col += 1) {
      const matrixCol = col - plan.fill.colStart
      const entry = rowEntries[row]
      const column = columns[col]
      if (!entry || !column || !isDataRowEntry(entry)) {
        cells[matrixRow][matrixCol] = ""
        truncatedCount += 1
        continue
      }

      const sequence = laneSequenceForTarget(plan, laneSequences, row, col)
      if (!sequence) {
        cells[matrixRow][matrixCol] = ""
        truncatedCount += 1
        continue
      }

      if (sequence.kind !== "copy") usedLinear = true
      const value = fillValueAt(sequence, sourceRelativeIndex(plan, row, col))
      cells[matrixRow][matrixCol] = value
      targets.push({
        pasteRowIndex: row - plan.target.rowStart,
        pasteColIndex: col - plan.target.colStart,
        rowId: entry.rowId,
        row: entry.row,
        columnId: column.columnId,
        column,
        value,
      })
    }
  }

  if (targets.length === 0) return undefined

  return {
    sourceRange,
    targetRange,
    fillRange,
    cells,
    targets,
    truncatedCount,
    direction: plan.direction,
    strategy: usedLinear ? "linear" : "copy",
  }
}

export function prepareRangeFill<TRow>({
  fill,
  getPreviousValue,
  isEditable,
  signal,
}: PrepareRangeFillParams<TRow>): Promise<PreparedRangePaste<TRow>> {
  return prepareRangePaste({
    paste: fill,
    getPreviousValue,
    ...(isEditable ? { isEditable } : {}),
    ...(signal ? { signal } : {}),
  })
}

function buildFillPlan<TRow>({
  sourceRange,
  target,
  columns,
  rowIds,
}: {
  sourceRange: BcRange
  target: { rowId: RowId; columnId: ColumnId }
  columns: readonly ResolvedColumn<TRow>[]
  rowIds: readonly RowId[]
}): { plan: FillPlan; targetRange: BcRange; fillRange: BcRange } | undefined {
  const source = resolveRangeIndexBounds(sourceRange, columns, rowIds)
  if (!source) return undefined

  const targetRow = rowIds.indexOf(target.rowId)
  const targetCol = columns.findIndex((column) => column.columnId === target.columnId)
  if (targetRow < 0 || targetCol < 0) return undefined

  const rowDelta =
    targetRow < source.rowStart
      ? targetRow - source.rowStart
      : targetRow > source.rowEnd
        ? targetRow - source.rowEnd
        : 0
  const colDelta =
    targetCol < source.colStart
      ? targetCol - source.colStart
      : targetCol > source.colEnd
        ? targetCol - source.colEnd
        : 0

  if (rowDelta === 0 && colDelta === 0) return undefined

  const useVertical = Math.abs(rowDelta) >= Math.abs(colDelta)
  const direction: RangeFillDirection = useVertical
    ? rowDelta < 0
      ? "up"
      : "down"
    : colDelta < 0
      ? "left"
      : "right"

  const targetBounds =
    direction === "up"
      ? bounds(targetRow, source.rowEnd, source.colStart, source.colEnd)
      : direction === "down"
        ? bounds(source.rowStart, targetRow, source.colStart, source.colEnd)
        : direction === "left"
          ? bounds(source.rowStart, source.rowEnd, targetCol, source.colEnd)
          : bounds(source.rowStart, source.rowEnd, source.colStart, targetCol)

  const fill =
    direction === "up"
      ? bounds(targetRow, source.rowStart - 1, source.colStart, source.colEnd)
      : direction === "down"
        ? bounds(source.rowEnd + 1, targetRow, source.colStart, source.colEnd)
        : direction === "left"
          ? bounds(source.rowStart, source.rowEnd, targetCol, source.colStart - 1)
          : bounds(source.rowStart, source.rowEnd, source.colEnd + 1, targetCol)

  const targetRange = rangeFromBounds(targetBounds, columns, rowIds)
  const fillRange = rangeFromBounds(fill, columns, rowIds)
  if (!targetRange || !fillRange) return undefined

  return {
    plan: { direction, source, target: targetBounds, fill },
    targetRange,
    fillRange,
  }
}

function buildLaneSequences<TRow>({
  plan,
  columns,
  rowEntries,
  getSourceValue,
}: {
  plan: FillPlan
  columns: readonly ResolvedColumn<TRow>[]
  rowEntries: readonly RowEntry<TRow>[]
  getSourceValue: (source: RangeFillSource<TRow>) => unknown
}): readonly LaneSequence[] {
  const lanes: LaneSequence[] = []
  if (plan.direction === "up" || plan.direction === "down") {
    for (let col = plan.source.colStart; col <= plan.source.colEnd; col += 1) {
      lanes.push(detectSequence(readSourceLane(plan, columns, rowEntries, getSourceValue, col)))
    }
    return lanes
  }

  for (let row = plan.source.rowStart; row <= plan.source.rowEnd; row += 1) {
    lanes.push(detectSequence(readSourceLane(plan, columns, rowEntries, getSourceValue, row)))
  }
  return lanes
}

function readSourceLane<TRow>(
  plan: FillPlan,
  columns: readonly ResolvedColumn<TRow>[],
  rowEntries: readonly RowEntry<TRow>[],
  getSourceValue: (source: RangeFillSource<TRow>) => unknown,
  laneIndex: number,
): readonly string[] {
  const values: string[] = []
  if (plan.direction === "up" || plan.direction === "down") {
    const column = columns[laneIndex]
    if (!column) return values
    for (let row = plan.source.rowStart; row <= plan.source.rowEnd; row += 1) {
      const entry = rowEntries[row]
      if (!entry || !isDataRowEntry(entry)) continue
      values.push(
        serialiseFillSourceValue(
          getSourceValue({
            sourceRowIndex: row - plan.source.rowStart,
            sourceColIndex: laneIndex - plan.source.colStart,
            rowId: entry.rowId,
            row: entry.row,
            columnId: column.columnId,
            column,
          }),
        ),
      )
    }
    return values
  }

  const entry = rowEntries[laneIndex]
  if (!entry || !isDataRowEntry(entry)) return values
  for (let col = plan.source.colStart; col <= plan.source.colEnd; col += 1) {
    const column = columns[col]
    if (!column) continue
    values.push(
      serialiseFillSourceValue(
        getSourceValue({
          sourceRowIndex: laneIndex - plan.source.rowStart,
          sourceColIndex: col - plan.source.colStart,
          rowId: entry.rowId,
          row: entry.row,
          columnId: column.columnId,
          column,
        }),
      ),
    )
  }
  return values
}

function detectSequence(values: readonly string[]): LaneSequence {
  const sample = values.slice(0, Math.min(3, values.length))
  if (sample.length >= 2) {
    const numeric = sample.map(parseNumericFillValue)
    if (numeric.every((value) => value != null) && isArithmeticProgression(numeric)) {
      return {
        kind: "numeric",
        first: numeric[0] ?? 0,
        step: (numeric[1] ?? 0) - (numeric[0] ?? 0),
      }
    }

    const dates = sample.map(parseDateFillValue)
    if (dates.every((value) => value != null) && isArithmeticProgression(dates)) {
      return { kind: "date", firstDay: dates[0] ?? 0, stepDays: (dates[1] ?? 0) - (dates[0] ?? 0) }
    }
  }

  return { kind: "copy", values: values.length > 0 ? values : [""] }
}

function laneSequenceForTarget(
  plan: FillPlan,
  sequences: readonly LaneSequence[],
  row: number,
  col: number,
): LaneSequence | undefined {
  if (plan.direction === "up" || plan.direction === "down") {
    return sequences[col - plan.source.colStart]
  }
  return sequences[row - plan.source.rowStart]
}

function sourceRelativeIndex(plan: FillPlan, row: number, col: number): number {
  if (plan.direction === "up" || plan.direction === "down") {
    return row - plan.source.rowStart
  }
  return col - plan.source.colStart
}

function fillValueAt(sequence: LaneSequence, relativeIndex: number): string {
  if (sequence.kind === "numeric") {
    return String(sequence.first + sequence.step * relativeIndex)
  }
  if (sequence.kind === "date") {
    return formatDateDay(sequence.firstDay + sequence.stepDays * relativeIndex)
  }
  return sequence.values[positiveModulo(relativeIndex, sequence.values.length)] ?? ""
}

function parseNumericFillValue(value: string): number | undefined {
  const trimmed = value.trim()
  if (trimmed === "") return undefined
  const numeric = Number(trimmed)
  return Number.isFinite(numeric) ? numeric : undefined
}

function parseDateFillValue(value: string): number | undefined {
  const trimmed = value.trim()
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed)
  if (iso) {
    const year = Number(iso[1])
    const month = Number(iso[2])
    const day = Number(iso[3])
    const time = Date.UTC(year, month - 1, day)
    if (!Number.isFinite(time)) return undefined
    return Math.floor(time / DAY_MS)
  }

  const parsed = Date.parse(trimmed)
  if (!Number.isFinite(parsed)) return undefined
  return Math.floor(parsed / DAY_MS)
}

function isArithmeticProgression(values: readonly (number | undefined)[]): boolean {
  if (values.length < 2) return false
  const first = values[0]
  const second = values[1]
  if (first == null || second == null) return false
  const step = second - first
  for (let index = 2; index < values.length; index += 1) {
    const value = values[index]
    const previous = values[index - 1]
    if (value == null || previous == null) return false
    if (Math.abs(value - previous - step) > 1e-9) return false
  }
  return true
}

function serialiseFillSourceValue(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return formatDateDay(
      Math.floor(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()) / DAY_MS),
    )
  }
  if (value == null) return ""
  return String(value)
}

function formatDateDay(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10)
}

function positiveModulo(value: number, modulus: number): number {
  if (modulus <= 0) return 0
  return ((value % modulus) + modulus) % modulus
}

function bounds(
  rowStart: number,
  rowEnd: number,
  colStart: number,
  colEnd: number,
): RangeIndexBounds {
  return {
    rowStart,
    rowEnd,
    colStart,
    colEnd,
    rowSpan: rowEnd - rowStart + 1,
    colSpan: colEnd - colStart + 1,
  }
}

function rangeFromBounds<TRow>(
  range: RangeIndexBounds,
  columns: readonly ResolvedColumn<TRow>[],
  rowIds: readonly RowId[],
): BcRange | undefined {
  const startColumn = columns[range.colStart]
  const endColumn = columns[range.colEnd]
  const startRow = rowIds[range.rowStart]
  const endRow = rowIds[range.rowEnd]
  if (!startColumn || !endColumn || !startRow || !endRow) return undefined
  return {
    start: { rowId: startRow, columnId: startColumn.columnId },
    end: { rowId: endRow, columnId: endColumn.columnId },
  }
}
