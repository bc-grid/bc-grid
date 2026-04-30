import type { BcRange, BcValidationResult, ColumnId, RowId } from "@bc-grid/core"
import type { RowEntry } from "./gridInternals"
import { type ResolvedColumn, isDataRowEntry } from "./gridInternals"
import { parseTsv } from "./rangeClipboard"

export interface RangePasteTarget<TRow> {
  pasteRowIndex: number
  pasteColIndex: number
  rowId: RowId
  row: TRow
  columnId: ColumnId
  column: ResolvedColumn<TRow>
  value: string
}

export interface BuiltRangePaste<TRow> {
  targetRange: BcRange
  cells: readonly (readonly string[])[]
  targets: readonly RangePasteTarget<TRow>[]
  truncatedCount: number
}

export interface PreparedRangePasteCell<TRow> extends RangePasteTarget<TRow> {
  nextValue: unknown
  previousValue: unknown
}

export interface PreparedRangePaste<TRow> {
  cells: readonly PreparedRangePasteCell<TRow>[]
  validationErrors: Record<string, string>
}

interface BuildRangePasteParams<TRow> {
  anchor: { rowId: RowId; columnId: ColumnId }
  cells: readonly (readonly string[])[]
  columns: readonly ResolvedColumn<TRow>[]
  rowEntries: readonly RowEntry<TRow>[]
  rowIds: readonly RowId[]
}

interface PrepareRangePasteParams<TRow> {
  paste: BuiltRangePaste<TRow>
  getPreviousValue: (target: RangePasteTarget<TRow>) => unknown
  isEditable?: (target: RangePasteTarget<TRow>) => boolean
  signal?: AbortSignal
}

export async function readClipboardTsv(): Promise<string> {
  const clipboard = globalThis.navigator?.clipboard
  if (!clipboard || typeof clipboard.readText !== "function") {
    throw new Error("Clipboard read is not available")
  }
  return clipboard.readText()
}

export function parseClipboardTsv(tsv: string): string[][] {
  return parseTsv(tsv)
}

export function buildRangePaste<TRow>({
  anchor,
  cells,
  columns,
  rowEntries,
  rowIds,
}: BuildRangePasteParams<TRow>): BuiltRangePaste<TRow> | undefined {
  const anchorRow = rowIds.indexOf(anchor.rowId)
  const anchorCol = columns.findIndex((column) => column.columnId === anchor.columnId)
  if (anchorRow < 0 || anchorCol < 0) return undefined

  const targets: RangePasteTarget<TRow>[] = []
  let truncatedCount = 0

  for (let pasteRowIndex = 0; pasteRowIndex < cells.length; pasteRowIndex += 1) {
    const row = cells[pasteRowIndex] ?? []
    for (let pasteColIndex = 0; pasteColIndex < row.length; pasteColIndex += 1) {
      const entry = rowEntries[anchorRow + pasteRowIndex]
      const column = columns[anchorCol + pasteColIndex]
      if (!entry || !column || !isDataRowEntry(entry)) {
        truncatedCount += 1
        continue
      }

      targets.push({
        pasteRowIndex,
        pasteColIndex,
        rowId: entry.rowId,
        row: entry.row,
        columnId: column.columnId,
        column,
        value: row[pasteColIndex] ?? "",
      })
    }
  }

  if (targets.length === 0) return undefined
  const last = targets[targets.length - 1]
  if (!last) return undefined

  return {
    targetRange: {
      start: {
        rowId: targets[0]?.rowId ?? anchor.rowId,
        columnId: targets[0]?.columnId ?? anchor.columnId,
      },
      end: { rowId: last.rowId, columnId: last.columnId },
    },
    cells,
    targets,
    truncatedCount,
  }
}

export async function prepareRangePaste<TRow>({
  paste,
  getPreviousValue,
  isEditable,
  signal,
}: PrepareRangePasteParams<TRow>): Promise<PreparedRangePaste<TRow>> {
  const validationErrors: Record<string, string> = {}
  const prepared: PreparedRangePasteCell<TRow>[] = []

  for (const target of paste.targets) {
    const key = pasteErrorKey(target)
    if (isEditable && !isEditable(target)) {
      validationErrors[key] = "Cell is read-only."
      continue
    }

    const parsed = parsePastedValue(target)
    if (!parsed.valid) {
      validationErrors[key] = parsed.error
      continue
    }

    const validation = await validatePastedValue(target, parsed.value, signal)
    if (!validation.valid) {
      validationErrors[key] = validation.error
      continue
    }

    prepared.push({
      ...target,
      nextValue: parsed.value,
      previousValue: getPreviousValue(target),
    })
  }

  return {
    cells: Object.keys(validationErrors).length === 0 ? prepared : [],
    validationErrors,
  }
}

function parsePastedValue<TRow>(
  target: RangePasteTarget<TRow>,
): { valid: true; value: unknown } | { valid: false; error: string } {
  const parser = target.column.source.valueParser
  if (!parser) return { valid: true, value: target.value }
  try {
    return { valid: true, value: parser(target.value, target.row) }
  } catch (err) {
    return {
      valid: false,
      error: err instanceof Error ? err.message : "Pasted value could not be parsed.",
    }
  }
}

async function validatePastedValue<TRow>(
  target: RangePasteTarget<TRow>,
  value: unknown,
  signal: AbortSignal | undefined,
): Promise<BcValidationResult> {
  const validator = target.column.source.validate
  if (!validator) return { valid: true }
  try {
    return await Promise.resolve(validator(value as never, target.row, signal))
  } catch (err) {
    return {
      valid: false,
      error: err instanceof Error ? err.message : "Validation failed.",
    }
  }
}

function pasteErrorKey<TRow>(target: RangePasteTarget<TRow>): string {
  return `${target.pasteRowIndex}:${target.pasteColIndex}`
}
