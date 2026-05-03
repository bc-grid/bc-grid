import { describe, expect, test } from "bun:test"
import type { BcRowPatch } from "@bc-grid/core"
import type { ResolvedColumn, RowEntry } from "../src/gridInternals"
import { buildRowPatchApplyPlan } from "../src/rowPatchPlan"
import type { BcReactGridColumn } from "../src/types"

interface OrderRow {
  id: string
  status: string
  qty: number
  notes: string
}

function makeColumn<TValue = unknown>(
  source: BcReactGridColumn<OrderRow, TValue>,
): ResolvedColumn<OrderRow> {
  return {
    align: "left",
    columnId: source.columnId,
    flex: undefined,
    left: 0,
    maxWidth: Number.POSITIVE_INFINITY,
    minWidth: 48,
    pinned: null,
    position: 0,
    source: source as BcReactGridColumn<OrderRow, unknown>,
    width: 120,
  }
}

function makeRowEntry(row: OrderRow, index: number): RowEntry<OrderRow> {
  return { kind: "data", row, rowId: row.id, index }
}

const rows: OrderRow[] = [
  { id: "r1", status: "open", qty: 5, notes: "first" },
  { id: "r2", status: "open", qty: 3, notes: "second" },
  { id: "r3", status: "closed", qty: 1, notes: "third" },
]

const baseRowEntries: RowEntry<OrderRow>[] = rows.map(makeRowEntry)

const baseColumns: ResolvedColumn<OrderRow>[] = [
  makeColumn<string>({
    columnId: "status",
    field: "status",
    header: "Status",
    editable: true,
  }),
  makeColumn<number>({
    columnId: "qty",
    field: "qty",
    header: "Qty",
    editable: true,
    valueParser: (input: string) => {
      const next = Number(input)
      if (Number.isNaN(next)) throw new Error("qty must be a number")
      return next
    },
    validate: (next: number) =>
      next >= 0 ? { valid: true } : { valid: false, error: "qty must be >= 0" },
  }),
  makeColumn<string>({
    columnId: "notes",
    field: "notes",
    header: "Notes",
    editable: false, // read-only — no cellEditor either
  }),
]

describe("buildRowPatchApplyPlan — atomic validate-then-apply (v0.6 §1)", () => {
  test("happy path: every cell passes; commits land in option order", async () => {
    const patches: BcRowPatch<OrderRow>[] = [
      { rowId: "r1", fields: { status: "closed" } },
      { rowId: "r2", fields: { status: "closed", qty: 7 } },
    ]

    const result = await buildRowPatchApplyPlan({
      patches,
      columns: baseColumns,
      rowEntries: baseRowEntries,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.plan.commits).toHaveLength(3)
    expect(result.plan.rowsAffected).toBe(2)

    const commitMap = new Map(
      result.plan.commits.map((c) => [`${c.rowId}:${c.columnId}`, c.nextValue]),
    )
    expect(commitMap.get("r1:status")).toBe("closed")
    expect(commitMap.get("r2:status")).toBe("closed")
    // qty came in as a number so valueParser is bypassed (mirrors
    // editing-rfc §valueParser placement: parser runs on string input
    // only). Typed value flows straight through.
    expect(commitMap.get("r2:qty")).toBe(7)
  })

  test("string input runs through valueParser before validate", async () => {
    const result = await buildRowPatchApplyPlan({
      patches: [{ rowId: "r1", fields: { qty: "12" as unknown as number } }],
      columns: baseColumns,
      rowEntries: baseRowEntries,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.plan.commits[0]?.nextValue).toBe(12)
  })

  test("validate failure surfaces as one validation-error failure with no commits", async () => {
    const result = await buildRowPatchApplyPlan({
      patches: [
        { rowId: "r1", fields: { qty: 5 } },
        { rowId: "r2", fields: { qty: -1 } },
      ],
      columns: baseColumns,
      rowEntries: baseRowEntries,
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.failures).toHaveLength(1)
    expect(result.failures[0]).toMatchObject({
      rowId: "r2",
      field: "qty",
      columnId: "qty",
      code: "validation-error",
      message: "qty must be >= 0",
      rejectedValue: -1,
    })
  })

  test("ATOMIC: any single failure aborts the whole batch — no commits leak", async () => {
    // The whole point of the headline primitive: if patch B fails
    // validate, patches A and C must NOT be applied either. The
    // result envelope is `{ ok: false, failures }`; the consumer
    // re-runs after fixing B's value.
    let validateCalls = 0
    const tracedColumns: ResolvedColumn<OrderRow>[] = [
      ...baseColumns.slice(0, 1),
      makeColumn<number>({
        columnId: "qty",
        field: "qty",
        header: "Qty",
        editable: true,
        validate: (next: number) => {
          validateCalls++
          return next >= 0 ? { valid: true } : { valid: false, error: "no negatives" }
        },
      }),
      ...baseColumns.slice(2),
    ]

    const result = await buildRowPatchApplyPlan({
      patches: [
        { rowId: "r1", fields: { qty: 1 } },
        { rowId: "r2", fields: { qty: -5 } },
        { rowId: "r3", fields: { qty: 9 } },
      ],
      columns: tracedColumns,
      rowEntries: baseRowEntries,
    })

    // All three rows ran through validate (no short-circuit) so the
    // failure envelope can list every offender at once. The consumer
    // gets a complete picture with one round-trip.
    expect(validateCalls).toBe(3)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.failures).toHaveLength(1)
    expect(result.failures[0]?.rowId).toBe("r2")
  })

  test("collects every failure across the batch (no short-circuit on first failure)", async () => {
    const result = await buildRowPatchApplyPlan({
      patches: [
        { rowId: "r1", fields: { qty: -1 } },
        { rowId: "r2", fields: { qty: -2 } },
        { rowId: "r3", fields: { qty: -3 } },
      ],
      columns: baseColumns,
      rowEntries: baseRowEntries,
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.failures.map((f) => f.rowId)).toEqual(["r1", "r2", "r3"])
  })

  test("unknown rowId surfaces as row-not-found per offending field", async () => {
    const result = await buildRowPatchApplyPlan({
      patches: [{ rowId: "missing", fields: { status: "closed", qty: 5 } }],
      columns: baseColumns,
      rowEntries: baseRowEntries,
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.failures).toHaveLength(2)
    expect(result.failures.every((f) => f.code === "row-not-found")).toBe(true)
  })

  test("unknown field surfaces as column-not-found", async () => {
    const result = await buildRowPatchApplyPlan({
      patches: [
        {
          rowId: "r1",
          fields: { mystery: "x" } as unknown as Partial<OrderRow>,
        },
      ],
      columns: baseColumns,
      rowEntries: baseRowEntries,
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.failures[0]).toMatchObject({
      rowId: "r1",
      field: "mystery",
      code: "column-not-found",
    })
  })

  test("read-only column (editable: false, no cellEditor) is rejected as cell-readonly", async () => {
    // `notes` column has `editable: false` — applyRowPatches refuses
    // even though the consumer might be tempted to bulk-set it.
    const result = await buildRowPatchApplyPlan({
      patches: [{ rowId: "r1", fields: { notes: "bulk note" } }],
      columns: baseColumns,
      rowEntries: baseRowEntries,
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.failures[0]).toMatchObject({
      rowId: "r1",
      field: "notes",
      columnId: "notes",
      code: "cell-readonly",
    })
  })

  test("editable as a row-fn returning false also rejects the cell", async () => {
    const rowFnColumns: ResolvedColumn<OrderRow>[] = [
      makeColumn<string>({
        columnId: "status",
        field: "status",
        header: "Status",
        editable: (row) => row.status !== "closed",
      }),
    ]

    const result = await buildRowPatchApplyPlan({
      patches: [{ rowId: "r3", fields: { status: "open" } }],
      columns: rowFnColumns,
      rowEntries: baseRowEntries,
    })

    // r3.status === "closed" so the row-fn returns false → cell-readonly.
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.failures[0]?.code).toBe("cell-readonly")
  })

  test("valueParser throw surfaces as value-parser-error with the throw message", async () => {
    const result = await buildRowPatchApplyPlan({
      patches: [{ rowId: "r1", fields: { qty: "not-a-number" as unknown as number } }],
      columns: baseColumns,
      rowEntries: baseRowEntries,
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.failures[0]).toMatchObject({
      rowId: "r1",
      field: "qty",
      code: "value-parser-error",
      message: "qty must be a number",
    })
  })

  test("AbortSignal already aborted: validation result is ignored, abort surfaces as a failure", async () => {
    const controller = new AbortController()
    controller.abort()

    const result = await buildRowPatchApplyPlan({
      patches: [{ rowId: "r1", fields: { qty: 5 } }],
      columns: baseColumns,
      rowEntries: baseRowEntries,
      signal: controller.signal,
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.failures[0]?.code).toBe("validation-error")
    expect(result.failures[0]?.message).toMatch(/aborted/i)
  })

  test("patch can target a column by columnId fallback when field is missing", async () => {
    // Edge case: a column without a `field` (e.g. computed-only) can
    // still be patched by passing the columnId as the key. Mirrors
    // how the paste pipeline resolves columns by columnId, not field.
    const computedColumns: ResolvedColumn<OrderRow>[] = [
      makeColumn<string>({
        columnId: "status",
        // no field — computed column
        header: "Status",
        editable: true,
        valueGetter: (row) => row.status,
      }),
    ]

    const result = await buildRowPatchApplyPlan({
      patches: [{ rowId: "r1", fields: { status: "closed" } as Partial<OrderRow> }],
      columns: computedColumns,
      rowEntries: baseRowEntries,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.plan.commits[0]?.columnId).toBe("status")
  })

  test("group rows are not patchable — surfaces as row-not-found", async () => {
    const groupEntry: RowEntry<OrderRow> = {
      kind: "group",
      rowId: "group-1",
      index: 0,
      level: 0,
      label: "Open",
      childCount: 2,
      childRowIds: ["r1", "r2"],
      expanded: true,
    }

    const result = await buildRowPatchApplyPlan({
      patches: [{ rowId: "group-1", fields: { status: "closed" } }],
      columns: baseColumns,
      rowEntries: [groupEntry, ...baseRowEntries],
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.failures[0]?.code).toBe("row-not-found")
    expect(result.failures[0]?.message).toMatch(/group row/i)
  })

  test("rowsAffected counts unique rows even with multi-field patches per row", async () => {
    const result = await buildRowPatchApplyPlan({
      patches: [{ rowId: "r1", fields: { status: "closed", qty: 9 } }],
      columns: baseColumns,
      rowEntries: baseRowEntries,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.plan.commits).toHaveLength(2)
    expect(result.plan.rowsAffected).toBe(1)
  })

  test("previousValue is captured from the canonical row before any commit", async () => {
    // Pin previousValue source — the editing controller's rollback
    // path uses this when a server reject lands. If it was wrong, an
    // async rollback would restore the wrong value silently. The
    // value comes from `getCellValue(row, column)` on the snapshot
    // we received in `rowEntries`, NOT the patch's nextValue.
    const result = await buildRowPatchApplyPlan({
      patches: [{ rowId: "r1", fields: { qty: 99 } }],
      columns: baseColumns,
      rowEntries: baseRowEntries,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.plan.commits[0]?.previousValue).toBe(5)
    expect(result.plan.commits[0]?.nextValue).toBe(99)
  })
})
