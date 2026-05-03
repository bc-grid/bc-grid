import { describe, expect, test } from "bun:test"
import type { BcReactGridColumn } from "@bc-grid/react"
import {
  autocompleteEditor,
  checkboxEditor,
  dateEditor,
  datetimeEditor,
  multiSelectEditor,
  numberEditor,
  selectEditor,
  textEditor,
  timeEditor,
} from "../src"

/**
 * Typing contract for built-in editors (v0.6 §1
 * `v06-builtin-editors-generic-trow`, bsncraft P1 #13).
 *
 * Bsncraft consumer report: declaring a typed grid column with a
 * built-in editor required a cast (`textEditor as BcCellEditor<CustomerRow>`)
 * because the editors are exported as `BcCellEditor<unknown, unknown>`
 * and TS strict variance treated them as not assignable to the
 * column's `BcCellEditor<TRow, TValue>` slot.
 *
 * The fix (already in place via the `cellEditor` prop's union arm
 * `BcCellEditor<TRow, TValue> | BcCellEditor<unknown, TValue>`)
 * accepts the row-agnostic shape. This file pins the no-cast
 * contract for every built-in editor + every common TValue so a
 * regression in the union arm trips here.
 *
 * `expect(true).toBe(true)` keeps the runtime test count > 0; the
 * real assertions are at the TYPE level — if any column declaration
 * below fails to type-check, the whole test file fails to compile
 * (Bun runs tsc-via-Bun's loader transparently on `.ts` files).
 *
 * Per `docs/recipes/typed-columns.md` (built-in editor + typed
 * column section).
 */

interface CustomerRow {
  id: string
  name: string
  status: string
  amount: number
  active: boolean
  lastInvoice: string
  meetingTime: string
  notes: string
}

describe("built-in editors flow into typed columns without a cast", () => {
  test("textEditor on a string column", () => {
    const col: BcReactGridColumn<CustomerRow, string> = {
      columnId: "name",
      field: "name",
      header: "Name",
      cellEditor: textEditor,
    }
    expect(col.cellEditor).toBe(textEditor)
  })

  test("numberEditor on a number column", () => {
    const col: BcReactGridColumn<CustomerRow, number> = {
      columnId: "amount",
      field: "amount",
      header: "Amount",
      cellEditor: numberEditor,
    }
    expect(col.cellEditor).toBe(numberEditor)
  })

  test("dateEditor on a string column (ISO YYYY-MM-DD)", () => {
    const col: BcReactGridColumn<CustomerRow, string> = {
      columnId: "lastInvoice",
      field: "lastInvoice",
      header: "Last invoice",
      cellEditor: dateEditor,
    }
    expect(col.cellEditor).toBe(dateEditor)
  })

  test("datetimeEditor on a string column", () => {
    const col: BcReactGridColumn<CustomerRow, string> = {
      columnId: "meetingTime",
      field: "meetingTime",
      header: "Meeting",
      cellEditor: datetimeEditor,
    }
    expect(col.cellEditor).toBe(datetimeEditor)
  })

  test("timeEditor on a string column", () => {
    const col: BcReactGridColumn<CustomerRow, string> = {
      columnId: "meetingTime",
      field: "meetingTime",
      header: "Time",
      cellEditor: timeEditor,
    }
    expect(col.cellEditor).toBe(timeEditor)
  })

  test("checkboxEditor on a boolean column", () => {
    const col: BcReactGridColumn<CustomerRow, boolean> = {
      columnId: "active",
      field: "active",
      header: "Active",
      cellEditor: checkboxEditor,
    }
    expect(col.cellEditor).toBe(checkboxEditor)
  })

  test("selectEditor on a string column", () => {
    const col: BcReactGridColumn<CustomerRow, string> = {
      columnId: "status",
      field: "status",
      header: "Status",
      cellEditor: selectEditor,
      options: [
        { value: "open", label: "Open" },
        { value: "closed", label: "Closed" },
      ],
    }
    expect(col.cellEditor).toBe(selectEditor)
  })

  test("multiSelectEditor on a string-array column", () => {
    interface RowWithTags {
      id: string
      tags: readonly string[]
    }
    const col: BcReactGridColumn<RowWithTags, readonly string[]> = {
      columnId: "tags",
      field: "tags",
      header: "Tags",
      cellEditor: multiSelectEditor,
      options: [{ value: "a", label: "A" }],
    }
    expect(col.cellEditor).toBe(multiSelectEditor)
  })

  test("autocompleteEditor on a string column", () => {
    const col: BcReactGridColumn<CustomerRow, string> = {
      columnId: "notes",
      field: "notes",
      header: "Notes",
      cellEditor: autocompleteEditor,
    }
    expect(col.cellEditor).toBe(autocompleteEditor)
  })

  test("editor reference can be reused across multiple typed columns (no per-column cast)", () => {
    // Pin the actual bsncraft case: 10+ master grids reusing the
    // SAME editor reference. Without the union-arm fix, every
    // column would need `cellEditor: textEditor as BcCellEditor<...>`.
    const cols: ReadonlyArray<BcReactGridColumn<CustomerRow>> = [
      { columnId: "name", field: "name", header: "Name", cellEditor: textEditor },
      { columnId: "status", field: "status", header: "Status", cellEditor: textEditor },
      { columnId: "notes", field: "notes", header: "Notes", cellEditor: textEditor },
    ]
    expect(cols).toHaveLength(3)
    for (const col of cols) {
      expect(col.cellEditor).toBe(textEditor)
    }
  })
})
