/**
 * Type-contract assertions for the built-in editors (v0.6 §1
 * `v06-builtin-editors-generic-trow`, bsncraft P1 #13).
 *
 * Bsncraft consumer report: declaring a typed grid column with a
 * built-in editor was failing with TS2349 unless the consumer
 * inserted a cast (`textEditor as BcCellEditor<CustomerRow>`). With
 * 10+ master grids planned, that's 10+ identical casts.
 *
 * The fix lives in `packages/react/src/types.ts:494`:
 *
 *   cellEditor?: BcCellEditor<TRow, TValue> | BcCellEditor<unknown, TValue>
 *
 * The union arm widens TRow but NOT TValue. Built-in editors export
 * as `BcCellEditor<unknown, unknown>` — `unknown` is bivariant for
 * TValue (assignable to any TValue position because both
 * `initialValue: unknown` and `commit(value: unknown)` are widest),
 * so a column with `TValue: string` accepts an editor with
 * `TValue: unknown` via the union arm.
 *
 * This file pins the no-cast contract per built-in editor + per
 * common TValue at the TYPE level. It lives in `src/` (not
 * `tests/`) so `tsc -b` enforces the contract on every build —
 * if a regression in the union arm or the editor exports breaks
 * the assignment, the package fails to compile with a precise
 * error pointing here.
 *
 * No runtime behavior; the file's export is just `() => never` so
 * the bundler dead-code-eliminates it.
 */

import type { BcReactGridColumn } from "@bc-grid/react"
import { autocompleteEditor } from "./autocomplete"
import { checkboxEditor } from "./checkbox"
import { dateEditor } from "./date"
import { datetimeEditor } from "./datetime"
import { numberEditor } from "./number"
import { selectEditor } from "./select"
import { textEditor } from "./text"
import { timeEditor } from "./time"

interface ContractCustomerRow {
  id: string
  name: string
  status: string
  amount: number
  active: boolean
  lastInvoice: string
  meetingTime: string
  notes: string
  tags: readonly string[]
}

// `satisfies` enforces structural assignability without widening the
// declared type — a regression in the union arm or in any editor's
// export shape makes this fail at tsc -b time with a precise error.
//
// The full block is the actual contract. If you need to add a new
// built-in editor, append to this list with its commonly-paired
// TValue.

const _typeContractColumns = {
  text: {
    columnId: "name",
    field: "name",
    header: "Name",
    cellEditor: textEditor,
  } satisfies BcReactGridColumn<ContractCustomerRow, string>,

  number: {
    columnId: "amount",
    field: "amount",
    header: "Amount",
    cellEditor: numberEditor,
  } satisfies BcReactGridColumn<ContractCustomerRow, number>,

  date: {
    columnId: "lastInvoice",
    field: "lastInvoice",
    header: "Last invoice",
    cellEditor: dateEditor,
  } satisfies BcReactGridColumn<ContractCustomerRow, string>,

  datetime: {
    columnId: "meetingTime",
    field: "meetingTime",
    header: "Meeting",
    cellEditor: datetimeEditor,
  } satisfies BcReactGridColumn<ContractCustomerRow, string>,

  time: {
    columnId: "meetingTime",
    field: "meetingTime",
    header: "Time",
    cellEditor: timeEditor,
  } satisfies BcReactGridColumn<ContractCustomerRow, string>,

  checkbox: {
    columnId: "active",
    field: "active",
    header: "Active",
    cellEditor: checkboxEditor,
  } satisfies BcReactGridColumn<ContractCustomerRow, boolean>,

  select: {
    columnId: "status",
    field: "status",
    header: "Status",
    cellEditor: selectEditor,
    options: [
      { value: "open", label: "Open" },
      { value: "closed", label: "Closed" },
    ],
  } satisfies BcReactGridColumn<ContractCustomerRow, string>,

  // multiSelect is intentionally NOT in the contract pin: its TValue
  // is `readonly TValue[]` semantically, but `column.options` binds
  // option-value type directly to the column's TValue — the
  // mismatch is a pre-existing TValue ergonomics wart that's
  // unrelated to v0.6 §1 P1 #13. The cellEditor assignment itself
  // works (third arm in the union); the column.options shape is
  // what doesn't fit. Tracked for a follow-up.

  autocomplete: {
    columnId: "notes",
    field: "notes",
    header: "Notes",
    cellEditor: autocompleteEditor,
  } satisfies BcReactGridColumn<ContractCustomerRow, string>,
}

// Mark the contract as side-effect-free for the bundler. The whole
// file dead-code-eliminates in production builds.
export const __typeContractAnchor: () => never = () => {
  throw new Error(
    "__typeContractAnchor is a build-time type-contract anchor; do not call at runtime",
  )
}
// Reference the contract object so it doesn't get tree-shaken before
// tsc has a chance to type-check. The reference is inert at runtime.
void _typeContractColumns
