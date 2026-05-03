# Bulk Actions

`bulkActions` renders a grid-owned action bar whenever at least one row is selected. The grid owns the selected-count label, clear-selection button, spacing, and theme treatment; the host owns the domain buttons.

Use this pattern for CRUD grids where users repeatedly select rows and run one command: "Mark selected paid", "Move selected documents", "Export selected", or "Assign selected to me".

```tsx
import { BcGrid, type BcBulkActionsContext, type RowId } from "@bc-grid/react"
```

## Slot Contract

```ts
interface BcBulkActionsContext {
  selectedRowIds: readonly RowId[]
  selectedRowCount: number
  clearSelection(): void
}
```

`selectedRowIds` resolves the current `BcSelection` against rows known to the client grid. For server-wide `all` or `filtered` bulk operations over unloaded rows, keep using the controlled `selection` snapshot and send that selection descriptor to the server.

## AR Aging

```tsx
function ARAgingGrid({ rows, columns, markPaid }: ARAgingGridProps) {
  return (
    <BcGrid
      gridId="ar-aging"
      columns={columns}
      data={rows}
      rowId={(row) => row.id}
      checkboxSelection
      bulkActions={(bulk) => (
        <>
          <button
            type="button"
            onClick={async () => {
              await markPaid(bulk.selectedRowIds)
              bulk.clearSelection()
            }}
          >
            Mark paid
          </button>
          <button type="button" onClick={() => exportInvoices(bulk.selectedRowIds)}>
            Export
          </button>
        </>
      )}
    />
  )
}
```

## Documents

```tsx
function DocumentsGrid({ rows, columns, moveToFolder, deleteDocuments }: DocumentsGridProps) {
  const renderBulkActions = (bulk: BcBulkActionsContext) => (
    <>
      <button type="button" onClick={() => downloadDocuments(bulk.selectedRowIds)}>
        Download
      </button>
      <button type="button" onClick={() => moveToFolder(bulk.selectedRowIds)}>
        Move to folder
      </button>
      <button
        type="button"
        onClick={async () => {
          await deleteDocuments(bulk.selectedRowIds)
          bulk.clearSelection()
        }}
      >
        Delete
      </button>
    </>
  )

  return (
    <BcGrid
      gridId="documents"
      columns={columns}
      data={rows}
      rowId={(row) => row.id}
      checkboxSelection
      bulkActions={renderBulkActions}
    />
  )
}
```

## Static Actions

When actions already close over controlled selection state, pass a React node. The bar still owns the selected-count label and clear-selection button.

```tsx
<BcGrid
  // ...
  bulkActions={
    <>
      <button type="button" onClick={archiveSelected}>
        Archive
      </button>
      <button type="button" onClick={assignSelected}>
        Assign
      </button>
    </>
  }
/>
```
