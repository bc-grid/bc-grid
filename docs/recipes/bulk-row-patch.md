# Bulk Row Patch

`apiRef.current?.applyRowPatches([...])` is the atomic bulk-update primitive every CRUD-flavored grid wants — fill-down, "set status to Approved" on the selection, "shift due dates by 7 days," copy-from-template. It runs every column's `valueParser` + `validate` first, then either applies every cell in one render pass + fires one `onCellEditCommit` per cell with `source: "api"`, OR rejects the whole batch atomically with the list of failing cells.

The whole point: iterating `setRow` (or per-cell `commitEdit`) loses atomicity, fires N validates, N renders, and silently drops cells that fail validation. `applyRowPatches` pushes partial-failure handling into a single rejection envelope so the consumer can show one toast + the offending fields.

```ts
import { useBcGridApi } from "@bc-grid/react"
import type { BcRowPatch } from "@bc-grid/react"

const apiRef = useBcGridApi<OrderRow>()

const result = await apiRef.current?.applyRowPatches([
  { rowId: "ord-1", fields: { status: "approved" } },
  { rowId: "ord-2", fields: { status: "approved" } },
])

if (!result?.ok) {
  toast.error(`${result?.failures.length} rows could not be updated.`)
}
```

## Result Envelope

```ts
type BcRowPatchResult<TRow> =
  | { ok: true; applied: number; rowsAffected: number }
  | { ok: false; failures: readonly BcRowPatchFailure[] }

interface BcRowPatchFailure {
  rowId: RowId
  field: string
  columnId?: ColumnId
  code:
    | "row-not-found"
    | "column-not-found"
    | "cell-readonly"
    | "value-parser-error"
    | "validation-error"
  message: string
  rejectedValue?: unknown
}
```

`applied` is the cell count; `rowsAffected` is the unique-row count.

## Pattern 1 — Fill Down

Copy the active cell's value into the same column on every selected row. The classic spreadsheet gesture; in an ERP, this is "set status of selected to Approved."

```tsx
function FillDownButton({ apiRef }: { apiRef: RefObject<BcGridApi<OrderRow>> }) {
  return (
    <button
      onClick={async () => {
        const api = apiRef.current
        if (!api) return
        const active = api.getActiveCell()
        if (!active) return
        const value = api.getRowById(active.rowId)?.[active.columnId as keyof OrderRow]

        const selection = api.getSelection()
        const targetRowIds =
          selection.mode === "explicit" ? [...selection.rowIds] : []

        const result = await api.applyRowPatches(
          targetRowIds.map((rowId) => ({
            rowId,
            fields: { [active.columnId]: value } as Partial<OrderRow>,
          })),
        )

        if (!result.ok) {
          // result.failures lists the offending cells. Surface a toast
          // with the count, or a summary of the validation errors.
        }
      }}
    >
      Fill down
    </button>
  )
}
```

The atomic gate matters here: if even one selected row's `validate` rejects (e.g. fill-down "Approved" into a row whose business rule requires a manager note), nothing changes. The consumer surfaces the toast and the user fixes the offender.

## Pattern 2 — Set Field on Selection

"Mark all selected as Paid." Different field per cell, but same value across rows.

```tsx
async function markSelectionPaid(api: BcGridApi<InvoiceRow>) {
  const selection = api.getSelection()
  if (selection.mode !== "explicit") return

  const result = await api.applyRowPatches(
    [...selection.rowIds].map((rowId) => ({
      rowId,
      fields: { status: "paid", paidAt: new Date().toISOString() },
    })),
  )

  return result
}
```

`fields` is `Partial<TRow>` keyed by `column.field` — multiple fields per row patch in one call.

## Pattern 3 — Shift Dates

Per-row computed value: `row.dueDate = addDays(row.dueDate, 7)` for every selected row. The patch's `fields` value is computed from each row's current state.

```tsx
async function pushDueDates(api: BcGridApi<TaskRow>, days: number) {
  const selection = api.getSelection()
  if (selection.mode !== "explicit") return

  const patches: BcRowPatch<TaskRow>[] = []
  for (const rowId of selection.rowIds) {
    const row = api.getRowById(rowId)
    if (!row) continue
    patches.push({
      rowId,
      fields: { dueDate: addDaysIso(row.dueDate, days) },
    })
  }

  return api.applyRowPatches(patches)
}
```

If `validate` on `dueDate` rejects (e.g. shifted past the project end date), the failure envelope lists every offender so the consumer can either:
- Show a toast and let the user un-select the affected rows, OR
- Open a dialog with the offending dates and an inline retry.

## Server-Row Lifecycle

`<BcServerGrid>` consumers get the same primitive — each patched cell flows through the existing `onCellEditCommit` → `onServerRowMutation` lifecycle. Per-cell pending overlays render during the round-trip; on server resolve, the overlays clear in batch via the existing pruning path on the next `data` prop update.

```tsx
<BcServerGrid<OrderRow>
  rowModel="paged"
  loadPage={loadOrders}
  onCellEditCommit={async (event) => {
    // Each batched cell from applyRowPatches arrives here with
    // source: "api". Same handler as keyboard / paste commits.
    return mutateOrder(event.rowId, event.column.field, event.nextValue)
  }}
  apiRef={apiRef}
/>
```

If a server-side rejection comes back for any cell, only that cell rolls back (consistent with the existing per-cell async-settle behavior). The atomic gate is **client-side validate**; server-side rejection is handled per-cell because the server may legitimately accept some patches and reject others.

## When Not to Use

- **Single-cell edit from the editor.** That's `commitEdit()` or just letting the user press Enter — no need for the bulk envelope.
- **Server-only mutations with no validate / overlay.** Skip the grid entirely and call your mutation API directly; only use `applyRowPatches` when you want the optimistic overlay + the per-cell `onCellEditCommit` route.
- **Operations that must atomic-on-the-server.** `applyRowPatches` is client-atomic (validate-all-then-apply) but server commits go through `onCellEditCommit` per cell. If you need true server-side atomicity, batch your N `onCellEditCommit` calls into a single mutation in your handler — `event.source === "api"` lets you discriminate the bulk path.
