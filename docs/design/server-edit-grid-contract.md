# Server-Backed Edit Grid Contract

**Status:** v0.3 planning contract
**Last updated:** 2026-05-01
**Audience:** bc-grid consumers wiring business grids such as bsncraft customers

This document defines the supported pattern for editable grids whose rows are
owned by a server. It deliberately does not introduce a new adapter component:
the contract composes the existing `<BcServerGrid>`, edit overlay, server row
model cache, and consumer persistence callbacks.

## When to Use This Contract

Use `<BcServerGrid>` when the server owns sorting, filtering, searching,
pagination, row identity, and persistence. This is the expected shape for a
customers grid, invoices grid, ledger grid, or other business table where the
browser should not load the whole entity set before editing.

Use `<BcEditGrid>` when the app already owns an in-memory `data` array and can
mirror edits directly into local state. It remains useful for small local grids,
modal editors, and lookup-style screens. A server-backed customers grid should
not be converted into a lookup grid just to get editing.

## Query and Cache Contract

Server-backed edit grids start with the normal server row model loader:

```tsx
const apiRef = useRef<BcServerGridApi<Customer> | null>(null)

<BcServerGrid<Customer>
  apiRef={apiRef}
  rowModel="infinite"
  columns={columns}
  rowId={(row) => row.id}
  blockSize={100}
  loadBlock={loadCustomersBlock}
  onServerRowMutation={commitCustomerCell}
/>
```

`loadPage`, `loadBlock`, or `loadChildren` receives the full
`ServerViewState`: sort, filter, search, group-by, visible columns, locale, and
time zone. The server must treat that query as authoritative and return rows in
the requested order. Paged results return `totalRows`; infinite results return
`totalRows` or `hasMore`; tree results return child counts for the requested
parent. When the backing store has a revision or ETag, include it on the result
or row so edit commits can send a `baseRevision`.

Row identity is required. `rowId(row)` must resolve to the stable business row
ID, not the row index inside a page or block. If a create or merge causes the
server ID to change, the mutation result must map the old and new IDs with
`previousRowId` and `rowId`.

## Edit Commit Flow

The grid editing overlay is optimistic and cell-scoped:

1. The user commits a cell edit.
2. The overlay applies the value immediately.
3. `onCellEditCommit` fires with the row, row ID, column ID, previous value,
   next value, and source.
4. If the callback returns a promise, the cell remains pending until the promise
   settles.
5. Resolving the promise clears pending state. Rejecting rolls back the overlay
   to the previous value and surfaces the error through the edit error channel.

For server grids, `onServerRowMutation` receives a `ServerRowPatch` that
`<BcServerGrid>` created from the edit commit:

```ts
import type { BcServerEditMutationHandler } from "@bc-grid/react"

const commitCustomerCell: BcServerEditMutationHandler<Customer> = async ({ patch }) => {
  const response = await fetch(`/customers/${patch.rowId}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  })
  return response.json()
}
```

`changes` is keyed by `ColumnId`. Editable business columns should use the
convention `columnId === field` so the persistence layer can translate patches
without column-specific glue. Computed columns and display-only renderers should
not be editable. Use `createServerRowPatch` when the application needs to add a
base revision or provide its own mutation ID:

```tsx
<BcServerGrid<Customer>
  // ...
  createServerRowPatch={(event, patch) => ({
    ...patch,
    baseRevision: event.row.revision,
    mutationId: crypto.randomUUID(),
  })}
  onServerRowMutation={commitCustomerCell}
/>
```

## Mutation Queue Semantics

The pure `@bc-grid/server-row-model` engine defines the cache behavior for
queued server edits:

- `queueMutation({ patch, rowId })` overlays the patch onto every loaded or
  stale cached copy of the row.
- Pending patches also apply to matching rows loaded after the mutation was
  queued.
- `settleMutation({ result, rowId })` removes the matching pending mutation by
  `mutationId`.
- Accepted results use the server canonical `row` when present. If the result
  omits `row`, the optimistic patch remains as the canonical visible value.
- Rejected results roll back to the captured canonical row while preserving any
  later pending patches for that row.
- Conflict results use the server canonical row when present and leave conflict
  UI decisions to the consumer.
- Late or duplicate settlements for unknown mutation IDs are ignored.
- Identity remaps replace cached rows at `previousRowId` with the canonical row
  at `rowId`.

The React `<BcServerGrid>` surface exposes two wiring levels:

- `onServerRowMutation` is the high-level edit adapter. It creates or accepts a
  patch, queues the optimistic server-row-model mutation, awaits persistence,
  settles the mutation result, and rejects the edit overlay for
  rejected/conflict results.
- `apiRef.current.queueServerRowMutation(patch)` and
  `apiRef.current.settleServerRowMutation(result)` are the low-level API for
  consumers that still want to drive the queue manually from `onCellEditCommit`.

## Consumer Responsibilities

A business app wiring a customers grid must provide:

- `rowId(row)`: stable server identity for every row.
- `columns`: editable columns with stable `columnId`s and `field`s for persisted
  properties.
- `loadPage`, `loadBlock`, or `loadChildren`: query handlers that honor
  server-side sort, filter, search, group, and abort signals.
- `apiRef`: access to `BcServerGridApi` for invalidation, refresh, and streaming
  row updates after mutations settle.
- `onServerRowMutation`: persistence callback that returns a
  `ServerMutationResult`. Use `createServerRowPatch` when mutation IDs or base
  revisions must come from the application.
- Error mapping: convert validation, permission, conflict, and transport errors
  into rejected edit promises with user-visible messages.

## Optimistic, Accepted, Rejected, and Conflict Results

For a normal accepted update where the row still belongs in the current view,
return an accepted `ServerMutationResult`. `<BcServerGrid>` settles the queued
mutation and applies the canonical row to loaded cache blocks:

```ts
return {
  mutationId: patch.mutationId,
  row: savedCustomer,
  status: "accepted",
}
```

Consumers using the low-level API manually perform the same settle step:

```ts
apiRef.current?.settleServerRowMutation(result)
```

If the changed field participates in the active sort, filter, search, or group
state, replace the visible row first when possible, then invalidate the affected
cache:

```ts
apiRef.current?.invalidateServerRows({ scope: "rows", rowIds: [patch.rowId] })
```

Use row invalidation when the row identity is known and the visible block can be
marked stale without clearing the whole view. Use view invalidation when the
server cannot determine local block membership cheaply, the edit may move the
row to a different page, or the mutation changes grouping membership:

```ts
apiRef.current?.invalidateServerRows({ scope: "view" })
```

For rejected results, return `status: "rejected"` from `onServerRowMutation` or
throw from the callback. `<BcServerGrid>` settles the mutation as rejected and
rejects the edit promise, so the editing overlay rolls back the cell. If the
server reports that the row has changed since the user began editing, invalidate
the row or the view so the next load displays current data.

For conflict results, prefer one of two explicit policies:

- Server wins: return a conflict result with the canonical row, invalidate if
  sort/filter/group membership may change, and let `<BcServerGrid>` reject the
  edit promise with a conflict message.
- User retries: reject the edit promise, keep no server row update, and show a
  product-specific conflict action outside the grid.

Stale settles are a consumer concern at the React layer. Track each in-flight
mutation by `mutationId` and ignore late responses whose mutation is no longer
current for the row/column. The server row model engine already treats unknown
mutation IDs as no-ops.

## Customers Grid Shape

A bsncraft-style customers grid should be wired as a server-owned business grid:

- `rowModel="infinite"` for scroll-first customer browsing, or `rowModel="paged"`
  for page-number workflows.
- `loadBlock` or `loadPage` posts `ServerViewState` to the customers query
  endpoint and receives customer DTOs plus total count or continuation metadata.
- `rowId={(customer) => customer.id}` uses the customer ID from the database.
- Edits call a mutation endpoint such as `PATCH /customers/:id` with
  `{ mutationId, baseRevision, changes }`.
- Accepted responses return the canonical customer row and revision.
- Rejections reject the edit promise so the overlay rolls back.
- Conflict responses either apply the canonical server row or trigger product
  conflict UI, then invalidate the row or view as needed.

This keeps bc-grid responsible for grid mechanics and keeps domain-specific
customer validation, authorization, conflict copy, and persistence inside the
consumer application.
