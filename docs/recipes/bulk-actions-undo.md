# Bulk Actions Undo

Use `bulkActions` with `showUndo` when a host-owned action can compute its own inverse patches. The grid renders a transient undo toast for 5 seconds by default; clicking Undo calls `api.applyRowPatches(inversePatches)` so parser, validation, overlay, and `onCellEditCommit` semantics stay the same as the original bulk edit.

```tsx
import {
  BcGrid,
  useBcGridApi,
  type BcBulkActionsContext,
  type BcGridColumn,
  type BcRowPatch,
} from "@bc-grid/react"

interface InvoiceRow {
  id: string
  status: "open" | "paid"
}

function InvoiceGrid({ rows, columns }: {
  rows: readonly InvoiceRow[]
  columns: readonly BcGridColumn<InvoiceRow>[]
}) {
  const apiRef = useBcGridApi<InvoiceRow>()
  const rowsById = new Map(rows.map((row) => [row.id, row]))

  const renderBulkActions = (bulk: BcBulkActionsContext<InvoiceRow>) => (
    <button
      type="button"
      onClick={async () => {
        const patches: BcRowPatch<InvoiceRow>[] = bulk.selectedRowIds.flatMap((rowId) => {
          const row = rowsById.get(String(rowId))
          if (!row) return []
          return [{
            rowId,
            fields: { status: "paid" },
            inverse: [{ rowId, fields: { status: row.status } }],
          }]
        })

        const result = await apiRef.current?.applyRowPatches(patches)
        if (!result?.ok) return

        bulk.showUndo({
          label: `Marked ${result.rowsAffected} invoices paid`,
          inversePatches: patches.flatMap((patch) => patch.inverse ?? []),
        })
        bulk.clearSelection()
      }}
    >
      Mark paid
    </button>
  )

  return (
    <BcGrid
      apiRef={apiRef}
      gridId="invoices"
      columns={columns}
      data={rows}
      rowId={(row) => row.id}
      checkboxSelection
      bulkActions={renderBulkActions}
    />
  )
}
```

## Custom Toast

Use `bulkActionUndoSlot` when the host needs product-specific copy or button styling. The slot receives the same `undo()` and `dismiss()` functions as the built-in toast.

```tsx
<BcGrid
  // ...
  bulkActionUndoTimeoutMs={8000}
  bulkActionUndoSlot={(undo) => (
    <>
      <span>{undo.undoableAction.label}</span>
      <button type="button" onClick={() => void undo.undo()}>
        Undo change
      </button>
      <button type="button" onClick={undo.dismiss}>
        Dismiss
      </button>
    </>
  )}
/>
```

Pass `bulkActionUndoTimeoutMs={0}` when the toast should stay visible until the user clicks Undo or dismiss.
