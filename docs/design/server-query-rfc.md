# RFC: Server-side row model (server-query-rfc)

**Status:** Not started
**Owner:** TBD (claim from `docs/queue.md`)
**Reviewer:** fresh agent
**Blocks:** server-row-model implementation (Q4)
**Informs:** api-rfc-v0 (server query types are part of public API)

---

For ERP-class workloads, the server-row-model is the hardest API decision in the project. It informs:

- Row identity (how the grid recognises the same row across loads)
- Optimistic edits (commit locally, server confirms)
- Selection across unloaded rows (user selects "all", we don't have all rows in memory)
- Filtered exports ("export current view" needs the server's filter state, not a client snapshot)
- Cache invalidation (when does a block need refetching?)
- Partial reloads (one block changed; don't refetch everything)
- Group expansion (lazy-load children on demand)

This RFC defines the contract before implementation begins. Implementation is Q4; design is Q1 so dependent decisions (api-rfc-v0, virtualizer-impl) can rely on it.

## Three modes

### Mode 1: Server-paged

Pagination + sort + filter on server. Client sees one page at a time.

```ts
interface ServerPagedQuery {
  page: number
  pageSize: number
  sort?: ServerSort[]
  filter?: ServerFilter
}

interface ServerPagedResult<T> {
  rows: T[]
  totalRows: number
}
```

Simple. TanStack `manualPagination + manualSorting + manualFiltering` handles state; we wire the fetcher.

### Mode 2: Server-infinite (block-cached)

Infinite scroll. Rows fetched in blocks. Blocks cached; LRU eviction when memory budget exceeded. Virtualiser renders from cache.

```ts
interface ServerBlockQuery {
  blockStart: number
  blockSize: number
  sort?: ServerSort[]
  filter?: ServerFilter
}

interface ServerBlockResult<T> {
  rows: T[]
  totalRowsHint?: number   // server may know; may not
  hasMore?: boolean        // for unbounded data
}
```

Cache:
- LRU
- Configurable max blocks (default: 20 → ~2000 rows × bytes-per-row)
- Eviction emits event so consumers can react (e.g., re-fetch if user scrolls back)

### Mode 3: Server-tree (lazy children)

Tree data with on-demand children. Expanding a parent fetches children; collapsing optionally evicts.

```ts
interface ServerTreeQuery {
  groupKeys: unknown[]    // path to the parent (empty = root)
  blockStart: number
  blockSize: number
  sort?: ServerSort[]
  filter?: ServerFilter
}

interface ServerTreeResult<T> {
  rows: Array<{
    data: T
    isGroup: boolean
    childCount?: number   // hint for "row has children"
  }>
  totalChildCount: number
}
```

## Cross-cutting concerns

### Row identity

- `rowId(row)` returns a stable string ID.
- For server data, server-side ID column is canonical.
- IDs are referenced across blocks (selection state stored as ID list, not row pointers).
- Optimistic-edit identity: after committing an edit, the row's ID stays; data updates in place.

### Selection across unloaded rows

- Selection state is `Set<RowId>` — works for any row, loaded or not.
- "Select all" sets a `selectAllMode` flag + an exclusion set: `{ mode: "all" | "filtered", except: Set<RowId> }`.
- Server-side operations (export, bulk-edit) consume this state and translate to "select all matching filter X except IDs Y."

### Optimistic edits

- Client commits edit → row state updates locally → server fetch fires.
- If server rejects: rollback + show error.
- If server accepts but returns different value: server value wins (race-loser revert).
- Spec the rollback / revert semantics in detail.

### Cache invalidation

- Block evicted on LRU pressure.
- Block invalidated explicitly: `api.invalidateBlocks(rowIds | "all")`.
- Block invalidated on filter/sort change (full cache clear).
- Block invalidated on edit commit affecting that row (partial: replace row in block).

### Filtered export

- "Export current view" calls `loadAllRows(query)` with current sort/filter — separate from grid's block fetcher.
- Or: server returns a `viewKey` representing the current filter/sort, which the export consumes.
- Spec the contract.

### Streaming row updates

- Server pushes events: row added, row updated, row removed.
- Block cache updated; virtualiser re-renders affected rows.
- Spec the event shape.

## Open questions

- Block size: fixed (e.g. 100) or adaptive (start small, grow as user scrolls)?
- Should cache eviction be observable to consumers (event), or invisible?
- How do we handle a server returning a different `totalRowsHint` than before? Resize the virtualiser? Or trust first?
- For tree mode: do we cache collapsed-children data, or evict on collapse?
- What's the behaviour when network is offline? Cached blocks visible; new fetches queued? Or hard fail?
- Streaming: do we support it in v1.0, or defer to 1.x?

## Implementation sketch (informational — Q4 work)

State machine:
- `idle` → `fetching` → `loaded | error`
- Per-block state, indexed by block start.
- Top-level state: which blocks are loaded, which are evicted, which are fetching.
- Fetcher contract: `(query) => Promise<ServerBlockResult<T>>` (consumer-provided).

The state machine is in `@bc-grid/server-row-model` (engine, no React). React adapter (`useServerRowModel`) lives in `@bc-grid/react`.

## Test plan

- Unit: state machine transitions, cache LRU eviction, optimistic edit rollback.
- Integration: a mock server that returns canned blocks; verify the React adapter wires correctly.
- E2E: Playwright with a real Express server returning paged data.
