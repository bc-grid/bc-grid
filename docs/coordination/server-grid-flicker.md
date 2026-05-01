# Server Grid Flicker Boundary

## Problem

`BcServerGrid` already keeps the last accepted server rows while a new
sort/filter/search/page request is loading. The server-row-model request view is
also correct: sort, filter, search, group, visible columns, and pagination are
sent to the server as `query.view`.

The remaining flicker happens after `BcServerGrid` hands those stable rows to
`<BcGrid>`. The inner grid currently has one state channel for both chrome and
row processing:

- `sort` drives header state and also client-side row sorting.
- `filter` drives filter chrome and also client-side filtering.
- `searchText` drives search highlighting and also client-side filtering.
- `groupBy` drives grouping chrome and also client-side grouping.

That means a server sort/filter/search change can briefly client-process the old
accepted page before the server response arrives. Freezing or clearing those
props in `serverGrid.tsx` would avoid the row transform, but it would also make
header sort state, sort cycling, filter inputs, search highlighting, and
grouping chrome drift from the server query state.

## Required Shared API

Add a row-processing mode to `<BcGrid>` so server-backed grids can keep chrome
state controlled while treating incoming rows as already processed:

```ts
export interface BcGridProps<TRow> {
  /**
   * Controls whether `<BcGrid>` applies client-side row transforms to `data`.
   *
   * "client" is the default. "manual" means the host/server owns row order and
   * membership, so the grid must not client-sort, client-filter, client-search,
   * or client-group rows.
   */
  rowProcessingMode?: "client" | "manual"
}
```

Expected behavior:

- Default remains `"client"` for `<BcGrid>` and `<BcEditGrid>`.
- `<BcServerGrid>` always passes `rowProcessingMode="manual"` after spreading
  consumer props.
- Manual mode preserves display/control state for header sort indicators,
  filter editors, search highlighting, grouping controls, callbacks, and API
  state.
- Manual mode renders `data` in the order provided and skips client-side sort,
  filter, search, and grouping transforms.
- Manual mode should also disable row FLIP/enter animations for server-backed
  refreshes. Server responses may replace row identity/order in ways that are
  not safe for client row-motion assumptions.
- `paginationMode="manual"` remains separate. It prevents client-side page
  slicing only; it does not prevent local sort/filter/search/group transforms.

## Safe Test Coverage Added

`packages/react/tests/serverGridPaged.test.ts` now pins the server-row-model
boundary: a pending server-owned sort/filter/search request keeps the last
accepted page rows stable until the next server result resolves, while the
pending request carries the new `query.view`.

The end-to-end assertion that `<BcServerGrid>` can pass active sort/filter/search
chrome state to `<BcGrid>` without local row transforms should be added with the
shared `rowProcessingMode="manual"` implementation.
