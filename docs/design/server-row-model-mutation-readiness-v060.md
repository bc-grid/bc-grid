# Server Row Model Mutation Readiness for v0.6

**Status:** planning doc for v0.6 server-row-model readiness
**Scope:** server mutation contract, cache reconciliation, and `BcServerGrid`
composition
**Non-scope:** bsncraft application code, context menu, filters UI, package
release mechanics, browser/perf validation

## Goal

v0.6 should make server-backed editable ERP grids viable without each consumer
inventing its own cache and rollback rules. The target screen is a primary
business entity grid such as accounts-receivable customers: server-owned
sort/filter/page state, stable database row identity, in-cell edits, optimistic
feedback, and deterministic rollback or invalidation when the server responds.

This is not the lookup-grid pattern. Lookup grids are fixed-height modal
pickers over a narrow result set. A customers grid is a page-level server grid:
the server owns the query, row identity survives every reload, and edit commits
must reconcile with server canonical rows.

## Current Building Blocks

The core public contract already defines the required server mutation shapes:

```ts
interface ServerRowPatch {
  rowId: RowId
  changes: Record<ColumnId, unknown>
  baseRevision?: string
  mutationId: string
}

interface ServerMutationResult<TRow> {
  mutationId: string
  status: "accepted" | "rejected" | "conflict"
  row?: TRow
  previousRowId?: RowId
  rowId?: RowId
  revision?: string
  reason?: string
}
```

`@bc-grid/server-row-model` already has the engine-level mutation primitives:

- `queueMutation({ patch, rowId })`
- `settleMutation({ result, rowId })`
- `getState(...).pendingMutations`
- cache reconciliation across loaded and stale blocks

`<BcServerGrid>` already owns the active server view, cache invalidation, and
streaming `applyServerRowUpdate` path. v0.6 needs the edit commit bridge to make
those pieces feel like one workflow for React consumers.

## Optimistic Patch Flow

The optimistic path starts when the user commits an edit.

```ts
const patch: ServerRowPatch = {
  rowId: event.rowId,
  changes: { [event.columnId]: event.nextValue },
  baseRevision: event.row.revision,
  mutationId: crypto.randomUUID(),
}
```

Rules:

- `rowId` must come from the same stable `rowId(row)` function used by
  `BcServerGrid`.
- `changes` is keyed by `ColumnId`. Editable business columns should use
  `columnId === field` so the application can safely turn patches into server
  payloads.
- `baseRevision` is optional but strongly recommended for customers-style
  grids so the server can reject stale writes.
- `mutationId` is consumer-generated and must be unique for the grid session.

Engine behavior:

1. `queueMutation` captures the current canonical cached row if present.
2. The patch overlays every loaded or stale cached copy of that row.
3. Future page/block loads for the same row receive the pending patch overlay.
4. `pendingMutations` exposes the patch until it settles.

React readiness target:

`BcServerGrid` should compose the edit controller and server-row-model by
queuing the patch before or during the consumer save promise, then clearing it
through `settleMutation` when the server response arrives. The edit UI remains
responsible for dirty, pending, and cell error state; the server-row-model is
responsible for cached row data consistency.

## Stale Mutation Settle

Stale settles are normal in editable server grids. A user may commit multiple
edits to the same row before the first request returns, or an old response may
arrive after a newer edit has already changed the visible row.

Required behavior:

- Settling a mutation ID that is no longer pending is a no-op, not an error.
- If mutation A rejects while mutation B is still pending on the same row,
  rollback only A's changes and keep B's overlay applied.
- If mutation A accepts with a canonical row while mutation B is pending, use
  the accepted canonical row as the new base, then reapply B.
- If the server returns a conflict row, the server row wins as the canonical
  base. Remaining pending overlays still reapply on top of that base.

This is the key split between server-row-model and edit-controller state:
server-row-model reconciles cached row values by `mutationId`; the edit
controller guards visible cell state so a stale promise cannot clear the wrong
pending/error marker.

## Commit Settle Outcomes

### Accepted

Accepted responses should prefer the canonical server row:

```ts
const result: ServerMutationResult<CustomerRow> = {
  mutationId,
  status: "accepted",
  row: savedCustomer,
  rowId: savedCustomer.id,
  revision: savedCustomer.revision,
}
```

If `row` is omitted, the engine can synthesize a canonical row by applying the
patch to the captured base row. For business grids, returning `row` is safer
because the server may normalize names, compute display fields, update
revision, or change permission flags.

### Rejected

Rejected responses roll the cached row back to the canonical base, with any
newer pending patches reapplied:

```ts
const result: ServerMutationResult<CustomerRow> = {
  mutationId,
  status: "rejected",
  reason: "Customer code already exists",
}
```

The React edit path should surface `reason` on the edited cell or row. It
should not purge the whole view unless the error means the view itself is no
longer valid.

### Conflict

Conflict responses should include the server canonical row:

```ts
const result: ServerMutationResult<CustomerRow> = {
  mutationId,
  status: "conflict",
  row: serverCustomer,
  revision: serverCustomer.revision,
  reason: "Customer was changed by another user",
}
```

v0.6 default behavior should use the server row as the visible base and leave
custom conflict UI to the consumer.

## Invalidation After Commit

Not every accepted edit needs a full reload.

| Edit result | Recommended action |
|---|---|
| Field cannot affect current sort/filter/group membership | Settle mutation with canonical row only. |
| Field can affect current sort/filter/group membership | Settle mutation, then invalidate rows or the current view. |
| Edit changes totals, permissions, denormalized labels, or external joins | Settle mutation, then `invalidateServerRows({ scope: "rows", rowIds })` or `refreshServerRows()`. |
| Bulk import, remote rule recalculation, or server-side trigger changes many rows | Use `invalidateServerRows({ scope: "view" })` or `{ scope: "all" }`. |

Customers examples:

- Editing `phone` usually settles in place.
- Editing `name` may affect current sort and text filters, so invalidate the
  row or refresh the active view after settlement.
- Editing `active` may remove the row from an active-only customer view; settle
  first so the user sees the accepted change, then invalidate the view so the
  row can animate or disappear according to the current row-model behavior.

The order matters: settle first, then invalidate. If invalidation runs first,
the cache may drop the canonical base needed to resolve pending overlays.

## Rollback and Error State

Rollback has two layers:

1. **Cached data rollback**: server-row-model restores cached rows by mutation
   ID and row ID.
2. **UI state rollback**: the React edit controller clears pending state,
   restores focus semantics, and shows the cell or row error.

v0.6 should keep those layers coupled but not duplicated. The edit controller
should not maintain an independent server cache, and the server-row-model should
not own DOM focus, editor lifecycle, or validation messages.

Minimum user-visible behavior for customers grids:

- Pending edits are visible while save is in flight.
- Rejection restores the previous value and leaves an actionable error message.
- Conflict applies the server value and lets the app show an optional conflict
  notice.
- Offline or network failures do not erase already loaded rows.
- The server-row-model does not queue offline writes for replay.

## Row Identity Requirements

Server mutations only work if row identity is stable.

Use:

```tsx
rowId={(row) => row.id}
```

Do not use:

- page index
- array index
- sort position
- customer code or another editable business key

If a server save changes row identity, return `previousRowId` plus the new
`rowId` in `ServerMutationResult`. The model treats this as a canonical
identity transition. For customers-style screens, prefer immutable database IDs
and keep editable customer codes as ordinary fields.

## `BcServerGrid` Composition Target

The desired consumer shape is:

```tsx
<BcServerGrid<CustomerRow>
  rowModel="paged"
  rowId={(row) => row.id}
  columns={customerColumns}
  loadPage={loadCustomersPage}
  onCellEditCommit={saveCustomerCell}
/>
```

Inside the save handler, consumers should only translate the event into their
business API call. They should not manually patch every cached block.

Target v0.6 bridge:

1. Build `ServerRowPatch` from `BcCellEditCommitEvent`.
2. Queue the optimistic patch in the server-row-model.
3. Call the consumer persistence hook.
4. Convert the server response into `ServerMutationResult`.
5. Settle the mutation.
6. Invalidate rows/view if the changed column can affect server membership.
7. Reflect pending/error state through existing edit UI semantics.

Until that bridge is fully wired, consumers can still use `BcServerGrid` for
server-owned queries and use `applyServerRowUpdate` after a successful save, but
that is a reconciliation shortcut rather than the full mutation pipeline.

## bsncraft Customers Mapping

The bsncraft customers screen described in the handoff is the canonical use
case:

- `loadCustomerRows` should accept the canonical server query shape:
  page/pageSize, `view.sort`, `view.filter`, global search, and active-row
  flags.
- Customer column IDs should map to allow-listed server fields before SQL or
  ORM queries are built.
- Customer row ID should be the immutable database customer ID, not customer
  code.
- Editable customer fields should use `columnId === field` for direct patch
  creation.
- On save, the app should send `baseRevision` and return a canonical
  `CustomerRow` with a new `revision`.
- Edits to fields used in sort/filter should invalidate after settlement.
- Lookup dialogs should stay on the separate fixed-height lookup-grid pattern.

No bsncraft code belongs in this repo. The bc-grid responsibility is to make
that adapter small, typed, and hard to misuse.

## v0.6 Readiness Checklist

- [ ] `ServerRowPatch`, `ServerMutationResult`, and `ServerInvalidation` are
      documented as the mutation contract for server edit grids.
- [ ] `BcServerGrid` composition path is clear for edit commits.
- [ ] Optimistic patches overlay loaded and stale cached rows.
- [ ] Pending patches apply to rows loaded after the mutation was queued.
- [ ] Stale settles are no-ops when their mutation ID is no longer pending.
- [ ] Earlier rejected mutations roll back without erasing later pending
      overlays.
- [ ] Accepted/conflict results use server canonical rows.
- [ ] Invalidation guidance is explicit: settle first, invalidate second.
- [ ] Error state remains UI-owned, cache rollback remains engine-owned.
- [ ] Customers-style server grids are documented separately from lookup grids.

