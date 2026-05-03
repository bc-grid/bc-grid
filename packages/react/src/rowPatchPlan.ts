import type {
  BcRowPatch,
  BcRowPatchFailure,
  BcValidationResult,
  ColumnId,
  RowId,
} from "@bc-grid/core"
import { type ResolvedColumn, type RowEntry, isDataRowEntry } from "./gridInternals"
import type { BcReactGridColumn } from "./types"
import { getCellValue } from "./value"

/**
 * One cell-level commit derived from a `BcRowPatch`. Mirrors the
 * shape `commitFromRowPatchPlan` in `useEditingController.ts`
 * iterates over — same fields the paste pipeline's per-cell commit
 * carries (`rowId`, `row`, `columnId`, `column`, `previousValue`,
 * `nextValue`) so the editing controller's batched-commit path can
 * stay symmetric with the paste path.
 *
 * v0.6 §1 (`v06-bulk-row-patch-primitive`).
 */
export interface RowPatchCommit<TRow> {
  rowId: RowId
  row: TRow
  columnId: ColumnId
  column: BcReactGridColumn<TRow, unknown>
  previousValue: unknown
  nextValue: unknown
  /** Source field from `BcRowPatch.fields` — used in failure surfaces. */
  field: string
}

export interface RowPatchApplyPlan<TRow> {
  commits: RowPatchCommit<TRow>[]
  rowsAffected: number
}

export type RowPatchApplyResult<TRow> =
  | { ok: true; plan: RowPatchApplyPlan<TRow> }
  | { ok: false; failures: readonly BcRowPatchFailure[] }

export interface BuildRowPatchApplyPlanParams<TRow> {
  patches: readonly BcRowPatch<TRow>[]
  columns: readonly ResolvedColumn<TRow>[]
  rowEntries: readonly RowEntry<TRow>[]
  signal?: AbortSignal
}

/**
 * Validate-all-then-apply atomic builder for `applyRowPatches`. Walks
 * every patched cell, runs `column.editable` / `column.valueParser` /
 * `column.validate`, and either returns a single commit batch (every
 * cell passed) or the full list of failures (no commits).
 *
 * Atomicity is the whole point: every "fill down" / "shift dates" /
 * "set status to Approved" toolbar wants partial-failure handling
 * pushed into a single rejection envelope so the consumer renders
 * one toast + the offending fields. Per
 * `v06-bulk-row-patch-primitive` (handoff §HEADLINE).
 */
export async function buildRowPatchApplyPlan<TRow>(
  params: BuildRowPatchApplyPlanParams<TRow>,
): Promise<RowPatchApplyResult<TRow>> {
  const { patches, columns, rowEntries, signal } = params

  const rowEntryById = new Map<RowId, RowEntry<TRow>>()
  for (const entry of rowEntries) rowEntryById.set(entry.rowId, entry)

  const columnByField = new Map<string, ResolvedColumn<TRow>>()
  const columnByColumnId = new Map<ColumnId, ResolvedColumn<TRow>>()
  for (const column of columns) {
    columnByColumnId.set(column.columnId, column)
    const field = column.source.field
    if (field) columnByField.set(field, column)
  }

  const failures: BcRowPatchFailure[] = []
  const commits: RowPatchCommit<TRow>[] = []
  const affectedRowIds = new Set<RowId>()

  for (const patch of patches) {
    const rowEntry = rowEntryById.get(patch.rowId)
    if (!rowEntry || !isDataRowEntry(rowEntry)) {
      for (const field of Object.keys(patch.fields ?? {})) {
        failures.push({
          rowId: patch.rowId,
          field,
          code: "row-not-found",
          message: rowEntry
            ? "Patch target is a group row, not a data row."
            : "Patch target row is no longer available.",
          rejectedValue: (patch.fields as Record<string, unknown>)[field],
        })
      }
      continue
    }

    const fields = (patch.fields ?? {}) as Record<string, unknown>
    for (const [field, rawValue] of Object.entries(fields)) {
      const column = columnByField.get(field) ?? columnByColumnId.get(field)
      if (!column) {
        failures.push({
          rowId: patch.rowId,
          field,
          code: "column-not-found",
          message: `No column found for field "${field}".`,
          rejectedValue: rawValue,
        })
        continue
      }

      if (!isCellPatchEditable(column, rowEntry.row)) {
        failures.push({
          rowId: patch.rowId,
          field,
          columnId: column.columnId,
          code: "cell-readonly",
          message: "Patch target cell is read-only.",
          rejectedValue: rawValue,
        })
        continue
      }

      const parsed = parseColumnValue(rawValue, rowEntry.row, column)
      if (!parsed.ok) {
        failures.push({
          rowId: patch.rowId,
          field,
          columnId: column.columnId,
          code: "value-parser-error",
          message: parsed.error,
          rejectedValue: rawValue,
        })
        continue
      }

      const validation = await runColumnValidate(parsed.value, rowEntry.row, column, signal)
      if (signal?.aborted) {
        // Abort surfaces as a validation-error envelope so the consumer
        // sees a single uniform shape regardless of why the cell failed.
        failures.push({
          rowId: patch.rowId,
          field,
          columnId: column.columnId,
          code: "validation-error",
          message: "Bulk patch was aborted.",
          rejectedValue: rawValue,
        })
        continue
      }
      if (!validation.valid) {
        failures.push({
          rowId: patch.rowId,
          field,
          columnId: column.columnId,
          code: "validation-error",
          message: validation.error,
          rejectedValue: rawValue,
        })
        continue
      }

      const previousValue = getCellValue(rowEntry.row, column.source)
      commits.push({
        rowId: patch.rowId,
        row: rowEntry.row,
        columnId: column.columnId,
        column: column.source,
        previousValue,
        nextValue: parsed.value,
        field,
      })
      affectedRowIds.add(patch.rowId)
    }
  }

  if (failures.length > 0) return { ok: false, failures }
  return { ok: true, plan: { commits, rowsAffected: affectedRowIds.size } }
}

function isCellPatchEditable<TRow>(column: ResolvedColumn<TRow>, row: TRow): boolean {
  const editable = column.source.editable
  if (typeof editable === "function") return editable(row)
  if (typeof editable === "boolean") return editable
  // No explicit `editable`; presence of `cellEditor` opts the cell in,
  // matching the paste pipeline's contract (see
  // `rangeClipboard.isRangePasteCellEditable`).
  return column.source.cellEditor != null
}

function parseColumnValue<TRow>(
  value: unknown,
  row: TRow,
  column: ResolvedColumn<TRow>,
): { ok: true; value: unknown } | { ok: false; error: string } {
  // valueParser only runs on string inputs (mirrors editing-rfc
  // §valueParser placement). Non-string inputs pass through typed.
  const parser = column.source.valueParser
  if (!parser || typeof value !== "string") return { ok: true, value }
  try {
    return { ok: true, value: parser(value, row) }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Value parser rejected the patch value.",
    }
  }
}

async function runColumnValidate<TRow>(
  value: unknown,
  row: TRow,
  column: ResolvedColumn<TRow>,
  signal: AbortSignal | undefined,
): Promise<BcValidationResult> {
  if (!column.source.validate) return { valid: true }
  try {
    return await Promise.resolve(column.source.validate(value as never, row, signal))
  } catch (err) {
    return {
      valid: false,
      error: err instanceof Error ? err.message : "Validation failed.",
    }
  }
}
