# Server-Backed Editable Grid Pattern

This guide shows the intended v0.2 server-backed editable grid shape for
business entity screens: customers, suppliers, invoices, stock items, and other
primary list pages. It uses the public `BcServerGrid` APIs and avoids
application-specific code.

Use this pattern when the grid is the page's main data surface. Do not use it
for modal lookup grids; lookup grids usually want a fixed numeric height,
client-side rows already fetched by the dialog, and no server-owned sort/filter
state.

## Component Shape

```tsx
import { useCallback, useRef } from "react"
import type {
  BcCellEditCommitEvent,
  BcGridColumn,
  BcServerGridApi,
  LoadServerPage,
  ServerPagedQuery,
} from "@bc-grid/react"
import { BcServerGrid } from "@bc-grid/react"

interface CustomerRow {
  id: string
  customerCode: string
  name: string
  address: string | null
  phone: string | null
  active: boolean
  revision: string
}

const customerColumns: BcGridColumn<CustomerRow>[] = [
  {
    columnId: "customerCode",
    field: "customerCode",
    header: "Customer Code",
    width: 160,
    filter: { type: "text", variant: "popup" },
    editable: true,
  },
  {
    columnId: "name",
    field: "name",
    header: "Name",
    width: 280,
    filter: { type: "text", variant: "popup" },
    editable: true,
  },
  {
    columnId: "address",
    field: "address",
    header: "Address",
    width: 360,
    filter: { type: "text", variant: "popup" },
    editable: true,
  },
  {
    columnId: "phone",
    field: "phone",
    header: "Phone",
    width: 160,
    filter: { type: "text", variant: "popup" },
    editable: true,
  },
  {
    columnId: "active",
    field: "active",
    header: "Active",
    width: 120,
    filter: { type: "boolean", variant: "popup" },
  },
]

export function CustomersGrid() {
  const apiRef = useRef<BcServerGridApi<CustomerRow> | null>(null)

  const loadPage = useCallback<LoadServerPage<CustomerRow>>(async (query, ctx) => {
    const response = await fetch("/api/customers/grid", {
      method: "POST",
      signal: ctx.signal,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(toCustomersRequest(query)),
    })
    if (!response.ok) throw new Error("Failed to load customers")
    return response.json()
  }, [])

  const onCellEditCommit = useCallback(
    async (event: BcCellEditCommitEvent<CustomerRow>) => {
      const mutationId = crypto.randomUUID()
      const response = await fetch(`/api/customers/${event.rowId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mutationId,
          baseRevision: event.row.revision,
          changes: { [event.columnId]: event.nextValue },
        }),
      })

      if (!response.ok) {
        // Throwing rejects the grid commit promise. The edited cell rolls back
        // to the previous value and surfaces the error state.
        throw new Error("Failed to save customer")
      }

      const savedRow = (await response.json()) as CustomerRow

      // Fast path for edits that keep the row in the current view. If the
      // edited field can affect sort/filter membership, invalidate or reload
      // after applying the canonical server row.
      apiRef.current?.applyServerRowUpdate({
        type: "rowUpdated",
        rowId: event.rowId,
        row: savedRow,
        revision: savedRow.revision,
      })

      if (event.columnId === "customerCode" || event.columnId === "name") {
        apiRef.current?.invalidateServerRows({ scope: "rows", rowIds: [event.rowId] })
      }
    },
    [],
  )

  return (
    <BcServerGrid<CustomerRow>
      rowModel="paged"
      apiRef={apiRef}
      columns={customerColumns}
      rowId={(row) => row.id}
      pageSize={50}
      loadPage={loadPage}
      onCellEditCommit={onCellEditCommit}
      pagination
      statusBar={["total", "filtered", "selected"]}
      sidebar={["columns"]}
      height="auto"
      ariaLabel="Customers"
    />
  )
}
```

For a fit-to-screen page variant, pass a numeric `height` controlled by the
page shell. For a normal page-flow customers list, use `height="auto"` so the
document owns vertical scrolling. Keep modal lookup grids separate and
fixed-height.

## Query Shape

`loadPage` receives a `ServerPagedQuery`. Forward the shape to the app server
instead of inventing a second wrapper protocol.

```ts
function toCustomersRequest(query: ServerPagedQuery) {
  return {
    page: query.pageIndex + 1,
    pageSize: query.pageSize,
    sort: query.view.sort,
    filter: query.view.filter ?? null,
    search: query.view.search ?? "",
    visibleColumns: query.view.visibleColumns,
    viewKey: query.viewKey,
    requestId: query.requestId,
  }
}
```

Example filter payload for "active customers with Acme in the name":

```json
{
  "kind": "group",
  "op": "and",
  "filters": [
    {
      "kind": "column",
      "columnId": "name",
      "type": "text",
      "op": "contains",
      "value": "Acme"
    },
    {
      "kind": "column",
      "columnId": "active",
      "type": "boolean",
      "op": "is",
      "value": true
    }
  ]
}
```

The server should map `columnId` to an allow-listed SQL expression or ORM field.
Reject unknown column IDs. Do not splice `columnId`, `op`, or `value` directly
into SQL.

```ts
const customerFieldByColumnId = {
  customerCode: "customers.customer_code",
  name: "customers.name",
  address: "customers.address",
  phone: "customers.phone",
  active: "customers.active",
} as const
```

Sort rules should follow the same allow list. If a sort entry is unsupported,
return a 400 response or ignore it intentionally and log the mismatch; do not
fall back to client-side sorting of the loaded page.

## Row Identity

Use a stable database identity:

```tsx
rowId={(row) => row.id}
```

Do not use page index, array index, customer code, or any visible field that an
edit can change. Stable row IDs are required for selection, focus retention,
edit rollback, streaming row updates, and server cache invalidation. If a save
really changes the backing row identity, return the canonical row and either
reload the current view or use a mutation result that maps the previous ID to
the new ID once that mutation pipeline is exposed through the app adapter.

## Edit Commit Flow

The recommended business-screen flow is:

1. The editor commits a value.
2. `onCellEditCommit` receives `{ rowId, row, columnId, previousValue, nextValue }`.
3. The consumer sends a `PATCH` containing `mutationId`, `baseRevision`, and
   `changes: { [columnId]: nextValue }`.
4. The consumer returns the save promise from `onCellEditCommit`.
5. While the promise is pending, bc-grid keeps the cell in a pending edit state.
6. If the promise rejects, bc-grid rolls the cell back to `previousValue`.
7. If the promise resolves, the consumer reconciles with the canonical server
   row using `applyServerRowUpdate`, `invalidateServerRows`, or
   `refreshServerRows`.

Prefer `ColumnId === field` for editable data columns. That keeps the patch
shape direct and audit-friendly. Computed columns and action columns should not
be editable.

## Optimistic Versus Reload

Choose one of these per screen:

| Strategy | Use when | Consumer action |
|---|---|---|
| Reload after save | The edit can change sort/filter membership, totals, permissions, or derived columns. | Await save, then call `apiRef.current?.refreshServerRows()` or `invalidateServerRows({ scope: "rows", rowIds: [rowId] })`. |
| Visible optimistic reconcile | The edit is usually local to the visible row. | Await save, then call `applyServerRowUpdate({ type: "rowUpdated", rowId, row: savedRow })`. Invalidate if the changed field affects the current view. |

`applyServerRowUpdate` is not a persistence API. It only reconciles loaded or
cached rows after the application has accepted a server response or received a
trusted push event.

## Error Rollback Expectations

Reject the promise returned from `onCellEditCommit` when the save fails:

```ts
const onCellEditCommit = async (event: BcCellEditCommitEvent<CustomerRow>) => {
  const result = await saveCustomerPatch(event.rowId, {
    baseRevision: event.row.revision,
    changes: { [event.columnId]: event.nextValue },
  })

  if (result.status === "rejected") {
    throw new Error(result.reason ?? "Customer update rejected")
  }

  apiRef.current?.applyServerRowUpdate({
    type: "rowUpdated",
    rowId: event.rowId,
    row: result.row,
    revision: result.row.revision,
  })
}
```

Expected behavior:

- Validation errors should be returned before persistence where possible via
  `column.validate`.
- Server rejections throw from `onCellEditCommit`; the cell rolls back and
  keeps focus semantics intact.
- Conflicts should return a canonical row. Apply it, then optionally show
  consumer-owned conflict UI.
- Network failures should leave already loaded rows visible. The grid does not
  queue offline writes in v0.2.

## Customer Grid Checklist

- Use `BcServerGrid rowModel="paged"` for primary customer list pages.
- Use stable database IDs for `rowId`.
- Mark server-filterable columns with `filter` configs.
- Let `loadPage` receive the canonical `ServerPagedQuery`; translate it at the
  API boundary.
- Resetting or clearing filters should produce `onFilterChange(null, prev)` and
  a reload with `query.view.filter` omitted.
- Keep lookup grids fixed-height and separate from the server-backed customers
  grid wrapper.
- Prefer `height="auto"` for normal page-flow customer lists and numeric
  heights for fit-to-screen layouts.
