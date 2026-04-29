# RFC: Server-Side Row Model (server-query-rfc)

**Status:** Draft for review
**Owner:** x1
**Reviewer:** fresh agent
**Blocks:** server-row-model implementation (Q4)
**Informs:** `api-rfc-v0` (server query types are public API)

---

For ERP-class workloads, server data is the real grid engine. The server-row-model contract determines row identity, sort/filter semantics, optimistic edits, selection across unloaded rows, filtered exports, lazy tree loading, cache invalidation, and accessibility indexes. This RFC defines that contract before implementation starts.

Implementation still lands in Q4. The public type names in this RFC are intended for `docs/api.md` unless `api-rfc-v0` lands first and deliberately renames them.

## Design Goals

- One typed query language across paged, infinite, and tree modes.
- Stable row identity across sort, filter, reload, edit, and cache eviction.
- Server-owned sort/filter/group semantics for unloaded data.
- Selection and export semantics that work when most matching rows are not in memory.
- Cache behavior that is predictable enough for ERP screens and testable in CI.
- A public contract that is not an AG Grid compatibility layer.

## Non-Goals

- Client-side aggregation of unloaded data.
- Offline-first queued writes.
- Streaming row updates in v1.0. The type shape is reserved, but implementation is deferred to Q7 / v1.3.
- Pivot server protocol. Q5 pivot RFC owns it.
- Reusing AG Grid request/response shapes. Public docs are reference material only.

## Source References

This RFC uses public documentation only:

- AG Grid SSRM configuration: https://www.ag-grid.com/react-data-grid/server-side-model-configuration/
- AG Grid SSRM datasource: https://www.ag-grid.com/angular-data-grid/server-side-model-datasource/
- AG Grid SSRM row grouping: https://www.ag-grid.com/javascript-data-grid/server-side-model-grouping/
- AG Grid infinite row model: https://www.ag-grid.com/javascript-data-grid/infinite-scrolling/
- TanStack Table manual server-side pagination: https://tanstack.dev/table/v8/docs/guide/pagination

Key borrowed lessons, not API shapes:

- Block caches need explicit block size and max-block settings.
- Server requests need a row range plus sort/filter/group metadata.
- Stable row IDs are mandatory for selection and refresh behavior.
- If a total row count is unknown, the UI must represent unknown totals explicitly.
- Manual server pagination in TanStack needs `manualPagination` plus a row/page count when known.

## Decision Summary

| Topic | Decision |
|---|---|
| Modes | `paged`, `infinite`, `tree` |
| Query naming | `ServerPagedQuery`, `ServerBlockQuery`, `ServerTreeQuery` |
| Shared query state | `ServerViewState` containing sort, filter, group, search, visible columns, locale, timezone |
| Row identity | `rowId(row)` is required for server grids; group IDs are derived from group path unless server supplies one |
| Block size | Fixed per grid instance; default 100; no adaptive block size in v1.0 |
| Cache eviction | LRU by block key; observable via optional events |
| Row count changes | Latest successful result for the current view wins; virtualizer resizes |
| Selection across unloaded rows | Include/exclude set with `mode: "explicit" | "all" | "filtered"` |
| Optimistic edits | Overlay pending patches by row ID; server canonical row wins on accept |
| Filtered export | Prefer server export handler; otherwise explicit `loadAllRows` with row limit |
| Streaming | Deferred to v1.3; event types reserved |

## Public Types

These are API-level names. The final API RFC may move type declarations into `@bc-grid/core`, but `@bc-grid/server-row-model` owns behavior.

```ts
export type RowId = string
export type ColumnId = string
export type ServerRowModelMode = "paged" | "infinite" | "tree"

export interface ServerSort {
  columnId: ColumnId
  direction: "asc" | "desc"
  nulls?: "first" | "last" | "server-default"
}

export type ServerFilter = ServerFilterGroup | ServerColumnFilter

export interface ServerFilterGroup {
  kind: "group"
  op: "and" | "or"
  filters: ServerFilter[]
}

export interface ServerColumnFilter {
  kind: "column"
  columnId: ColumnId
  type: "text" | "number" | "date" | "set" | "boolean" | "custom"
  op: string
  value?: unknown
  values?: unknown[]
}

export interface ServerGroup {
  columnId: ColumnId
  direction?: "asc" | "desc"
}

export interface ServerViewState {
  sort: ServerSort[]
  filter?: ServerFilter
  search?: string
  groupBy: ServerGroup[]
  visibleColumns: ColumnId[]
  locale?: string
  timeZone?: string
}

export interface ServerQueryBase {
  view: ServerViewState
  requestId: string
  viewKey?: string
}

export interface ServerLoadContext {
  signal: AbortSignal
}
```

Notes:

- `ServerFilter` is a transport-safe AST, not a copy of any grid library filter model.
- `op` is intentionally a string so filter packages can register operations without changing the base protocol.
- `value` must be JSON-serializable unless the consumer and server agree otherwise.
- `Server*Query` objects must be JSON-serializable so consumers can POST them directly.
- `requestId` is generated by the grid and used for tracing and race handling.
- `viewKey` is an optional server-issued stable key for the current sort/filter/search/group view.
- If the server does not provide `viewKey`, the client computes a deterministic key from `ServerViewState`.
- `AbortSignal` is passed through `ServerLoadContext`, not embedded in the query.

## Mode 1: Server-Paged

Use for classic ERP pages where users expect page controls and total counts.

```ts
export interface ServerPagedQuery extends ServerQueryBase {
  mode: "paged"
  pageIndex: number
  pageSize: number
}

export interface ServerPagedResult<TRow> {
  rows: TRow[]
  totalRows: number
  pageIndex: number
  pageSize: number
  viewKey?: string
  revision?: string
}

export type LoadServerPage<TRow> = (
  query: ServerPagedQuery,
  context: ServerLoadContext,
) => Promise<ServerPagedResult<TRow>>
```

Rules:

- `pageIndex` is zero-based.
- `rows.length` may be less than `pageSize` only on the last page or after deletion.
- `totalRows` is required.
- The React adapter uses TanStack Table manual pagination for this mode.
- If a sort/filter/search change makes the current page empty, the React adapter resets `pageIndex` to `0` unless controlled props say otherwise.
- `aria-rowcount` is `totalRows + headerRows + footerRows`.

## Mode 2: Server-Infinite

Use for large flat datasets where users scroll continuously.

```ts
export interface ServerBlockQuery extends ServerQueryBase {
  mode: "infinite"
  blockStart: number
  blockSize: number
}

export interface ServerBlockResult<TRow> {
  rows: TRow[]
  blockStart: number
  blockSize: number
  totalRows?: number
  hasMore?: boolean
  viewKey?: string
  revision?: string
}

export type LoadServerBlock<TRow> = (
  query: ServerBlockQuery,
  context: ServerLoadContext,
) => Promise<ServerBlockResult<TRow>>
```

Rules:

- `blockStart` is zero-based and absolute within the current view.
- `blockSize` is fixed per grid instance. Default: 100. Adaptive block sizing is deferred because it complicates cache keys and repeatable perf tests.
- `rows.length` should equal `blockSize` except at the end of known data. Short blocks with `hasMore: true` are treated as protocol errors.
- If `totalRows` is known, set it. If unknown, omit it and set `hasMore`.
- `hasMore` is required when `totalRows` is omitted.
- Latest successful `totalRows` for a `viewKey` wins; the virtualizer resizes when it changes.
- If neither `totalRows` nor `hasMore` is returned, the state machine treats the block as failed with a protocol error.
- Infinite mode does not use TanStack pagination. TanStack owns sort/filter/selection state; `@bc-grid/server-row-model` owns block state.

Cache defaults:

```ts
export interface ServerBlockCacheOptions {
  blockSize: number // default 100
  maxBlocks: number // default 20
  blockLoadDebounceMs: number // default 80
  maxConcurrentRequests: number // default 2
  staleTimeMs: number // default 30_000
}
```

## Mode 3: Server-Tree

Use for hierarchical data and server-side grouping with lazy children.

```ts
export interface ServerTreeQuery extends ServerQueryBase {
  mode: "tree"
  parentRowId: RowId | null
  groupPath: ServerGroupKey[]
  childStart: number
  childCount: number
}

export interface ServerGroupKey {
  columnId: ColumnId
  value: unknown
  rowId?: RowId
}

export interface ServerTreeRow<TRow> {
  data: TRow
  rowId?: RowId
  kind: "leaf" | "group"
  groupKey?: ServerGroupKey
  childCount?: number
  hasChildren?: boolean
}

export interface ServerTreeResult<TRow> {
  rows: ServerTreeRow<TRow>[]
  parentRowId: RowId | null
  groupPath: ServerGroupKey[]
  childStart: number
  childCount: number
  totalChildCount?: number
  viewKey?: string
  revision?: string
}

export type LoadServerTreeChildren<TRow> = (
  query: ServerTreeQuery,
  context: ServerLoadContext,
) => Promise<ServerTreeResult<TRow>>
```

Rules:

- `parentRowId: null` means root rows.
- `groupPath` is the semantic path from root to parent. It is stable across reloads for the same view.
- `childStart` is zero-based within the parent’s child list.
- `childCount` is fixed by the same block-size default unless configured.
- `totalChildCount` is required when known and omitted when unknown.
- Group rows must have stable IDs. If `rowId` is missing for a group row, bc-grid derives it as `group:${hash(viewKey, groupPath)}`.
- Leaf row IDs always come from the consumer's `rowId(row)` callback. `ServerTreeRow.rowId` is only for server-overridden group IDs.
- Expanded children remain cached on collapse until evicted by LRU. `evictOnCollapse` is deferred; explicit invalidation can drop a subtree.

Accessibility implications:

- Tree mode uses `role="treegrid"` per `accessibility-rfc`.
- The server row model must expose enough child counts for `aria-rowcount` and enough flattened indexes for `aria-rowindex`.
- When counts are unknown, the accessibility layer gets unknown totals but still gets absolute indexes for loaded rows.

## Row Identity

Server grids require stable row IDs.

```ts
export interface ServerRowIdentity<TRow> {
  rowId(row: TRow): RowId
  groupRowId?(group: ServerGroupKey, path: ServerGroupKey[]): RowId
}
```

Rules:

- `rowId(row)` is required for all server row models.
- IDs must be unique across the full dataset for the current entity type, not just the loaded block.
- IDs must not encode visible index, page index, or block index.
- IDs must survive sort, filter, grouping, reload, edit, and cache eviction.
- Database primary keys are preferred.
- Composite IDs are allowed but must be serialized as stable strings.
- If a server returns a row whose ID changed after an edit, the grid treats it as delete old + insert new unless the mutation result explicitly maps `previousRowId` to `rowId`.

Group identity:

- Group row IDs are part of the row model even if no backing database row exists.
- `viewKey` is required before deriving group IDs; the grid uses the server-provided `viewKey` or a client-derived key from `ServerViewState`.
- Default group ID: `group:${viewKey}:${pathHash}`.
- If the server provides a group row ID, it wins as long as it is stable.

## Selection Across Unloaded Rows

Selection must work when only a tiny fraction of rows are loaded.

```ts
export type ServerSelection =
  | {
      mode: "explicit"
      rowIds: ReadonlySet<RowId>
    }
  | {
      mode: "all"
      except: ReadonlySet<RowId>
    }
  | {
      mode: "filtered"
      view: ServerViewState
      viewKey?: string
      except: ReadonlySet<RowId>
    }

export interface ServerSelectionSnapshot {
  mode: "explicit" | "all" | "filtered"
  rowIds: RowId[]
  except: RowId[]
  view?: ServerViewState
  viewKey?: string
}
```

Rules:

- UI state may use `ReadonlySet<RowId>`.
- Public event payloads sent to server operations use `ServerSelectionSnapshot` arrays for serialization.
- `explicit` means only the listed IDs are selected.
- `all` means all rows in the underlying entity set except `except`.
- `filtered` means all rows matching the captured `view` / `viewKey` except `except`.
- If the view changes after a `filtered` select-all, the selection remains tied to the captured view and must be visually marked as such.
- Bulk edit/delete/export operations consume a snapshot, not live mutable selection state.
- If a selected row is evicted from cache, selection state is preserved by ID.

## Optimistic Edits and Rollback

Q2 owns editor UX, but the server row model owns cache consistency.

```ts
export interface ServerRowPatch {
  rowId: RowId
  changes: Record<ColumnId, unknown>
  baseRevision?: string
  mutationId: string
}

export interface ServerMutationResult<TRow> {
  mutationId: string
  status: "accepted" | "rejected" | "conflict"
  row?: TRow
  previousRowId?: RowId
  rowId?: RowId
  revision?: string
  reason?: string
}
```

`changes` is keyed by `ColumnId`. Editable columns should use the convention `ColumnId === field` so persistence code can map patches back to business fields. Computed/display-only columns are not editable and should not appear in `changes`.

State rules:

1. User commits an edit.
2. React layer creates a `ServerRowPatch` with a unique `mutationId`.
3. Server row model overlays the patch onto every cached copy of the row and marks the row pending.
4. Consumer persistence runs.
5. If accepted, server canonical `row` replaces the cached row. Server value wins if it differs from the optimistic value.
6. If rejected, the overlay rolls back and the React layer receives a rejected mutation event.
7. If conflict, the server canonical row wins by default and the React layer receives a conflict event. Custom conflict UI is deferred.

Sort/filter impact:

- Pending edits do not reorder rows or remove rows from filters immediately.
- On accepted mutation, if the changed fields affect current sort/filter/group, invalidate affected blocks or subtree after replacing the visible row.
- If the row no longer belongs in the current view, animate it out after the server accepts.
- On rejected mutation, restore the original row without invalidating the whole view.

Concurrency:

- Mutations are ordered per row by `mutationId` creation time.
- If mutation B is sent after mutation A for the same row, B's optimistic overlay composes over A.
- If A rejects after B accepted, only A's changes roll back; the row is then reconciled against the latest server canonical row.

## Cache Model

```ts
export type ServerBlockKey = string

export interface ServerCacheBlock<TRow> {
  key: ServerBlockKey
  viewKey: string
  start: number
  size: number
  rows: TRow[]
  state: "queued" | "fetching" | "loaded" | "stale" | "error" | "evicted"
  loadedAt?: number
  error?: unknown
  revision?: string
}
```

Block key:

- Paged: `paged:${viewKey}:page:${pageIndex}:size:${pageSize}`
- Infinite: `infinite:${viewKey}:start:${blockStart}:size:${blockSize}`
- Tree: `tree:${viewKey}:parent:${parentRowId ?? "root"}:start:${childStart}:size:${childCount}`

LRU policy:

- Default `maxBlocks = 20`.
- Loaded blocks are LRU-evicted when over budget.
- Fetching blocks are not evicted.
- Active/focused rows retained for accessibility do not pin an entire block forever; the row may be retained separately as a tiny focus-retention record.
- Eviction is observable through `onServerRowModelEvent` for diagnostics and dev tools.
- Eviction is not an application error.

Debounce and concurrency:

- Default block-load debounce: 80ms.
- Default max concurrent requests: 2.
- Multiple requests for the same block key dedupe to one promise.
- Loader functions receive `AbortSignal` through `ServerLoadContext`.
- When a view changes, in-flight requests for the old view are aborted where possible and ignored if they still resolve.

## Cache Invalidation

```ts
export type ServerInvalidation =
  | { scope: "all" }
  | { scope: "view"; viewKey?: string }
  | { scope: "blocks"; blockKeys: ServerBlockKey[] }
  | { scope: "rows"; rowIds: RowId[] }
  | { scope: "tree"; parentRowId: RowId | null; recursive?: boolean }
```

Rules:

- Sort/filter/search/group change creates a new `viewKey` and clears the active cache for the old view unless `keepPreviousViewCache` is enabled.
- Explicit `invalidate({ scope: "all" })` clears every cache and active count.
- Row invalidation marks any block containing the row stale and refetches visible stale blocks.
- Block invalidation refetches the block if visible or retained.
- Tree invalidation refetches a parent’s loaded child blocks; `recursive` also invalidates descendants.
- Edit accept affecting a row replaces that row immediately, then invalidates affected blocks when sort/filter/group membership may have changed.
- Total row count changes from a successful response update the active view metadata and resize the virtualizer.

Resolved question: cache eviction is observable. It emits events for instrumentation but does not require consumer action.

## Error and Offline Behavior

Network behavior:

- Failed block requests mark the block `error`.
- Already loaded blocks remain visible even if later requests fail.
- New unloaded ranges show loading/error rows owned by React.
- The grid does not queue fetches for automatic offline replay in v1.0.
- Manual retry is exposed through `api.refreshServerRows()` or row/block retry UI.

Offline policy:

- If `navigator.onLine === false` or fetch rejects with a network error, cached rows remain stale-visible.
- Pending optimistic edits remain pending/error per the persistence layer. The server row model does not queue writes.
- The React layer announces load failures through the accessibility alert region.

## Filtered Export and Bulk Operations

Exporting a server view must not silently export only loaded rows.

```ts
export interface ServerExportQuery {
  view: ServerViewState
  viewKey?: string
  selection?: ServerSelectionSnapshot
  columns: ColumnId[]
  format: "csv" | "xlsx" | "pdf"
  maxRows?: number
}

export interface ServerExportResult {
  kind: "blob" | "url" | "job"
  blob?: Blob
  url?: string
  jobId?: string
}
```

Contract:

- For server grids, "export current view" uses server semantics, not the loaded cache.
- Preferred path: consumer supplies `exportRows(query): Promise<ServerExportResult>`.
- Fallback path: consumer supplies `loadAllRows(query)` and bc-grid serializes through `@bc-grid/export`.
- Fallback path requires an explicit `maxRows`; default maximum is 50,000 rows.
- Consumers may override `maxRows` per grid, but any view that can exceed 50,000 rows should prefer the server-side `exportRows` path.
- If the current view exceeds `maxRows`, the React layer prompts the user or fails with a clear message.
- Selection-aware exports pass `ServerSelectionSnapshot`.
- `viewKey` may be used by the server as an opaque handle for a previously computed filter/sort view. The client must still include the full `view` for auditability and fallback.

Bulk edit/delete:

- Use the same `ServerSelectionSnapshot` shape.
- The grid does not assume loaded row count equals affected row count.
- Server responses should include affected count and optional failed row IDs.

## Streaming Row Updates

Streaming implementation is deferred to Q7 / v1.3, but reserve the event shape now so the cache model does not block it.

Product checkpoint: if bc-next needs real-time audit/status updates before v1.0, keep the type shape below but ship manual invalidation first. Do not add a subscription API to the v1.0 public surface without a separate RFC.

```ts
export type ServerRowUpdate<TRow> =
  | { type: "rowAdded"; row: TRow; indexHint?: number; viewKey?: string; revision?: string }
  | { type: "rowUpdated"; rowId: RowId; row: TRow; revision?: string }
  | { type: "rowRemoved"; rowId: RowId; revision?: string }
  | { type: "viewInvalidated"; viewKey?: string; reason?: string }
```

v1.0 behavior:

- No built-in subscription API.
- Consumers may manually call invalidation APIs when server push events arrive.
- The reserved type may appear in docs as future-facing but should not be required by Q4 implementation.

## State Machine

The engine package owns a deterministic state machine.

```ts
export interface ServerRowModelState<TRow> {
  mode: ServerRowModelMode
  view: ServerViewState
  viewKey: string
  rowCount: number | "unknown"
  blocks: Map<ServerBlockKey, ServerCacheBlock<TRow>>
  pendingMutations: Map<string, ServerRowPatch>
  selection: ServerSelection
}

export type ServerRowModelEvent<TRow> =
  | { type: "viewChanged"; viewKey: string; view: ServerViewState }
  | { type: "blockQueued"; blockKey: ServerBlockKey }
  | { type: "blockFetching"; blockKey: ServerBlockKey; requestId: string }
  | { type: "blockLoaded"; blockKey: ServerBlockKey; rowCount: number | "unknown" }
  | { type: "blockError"; blockKey: ServerBlockKey; error: unknown }
  | { type: "blockEvicted"; blockKey: ServerBlockKey; reason: "lru" | "invalidate" }
  | { type: "rowsInvalidated"; rowIds: RowId[] }
  | { type: "mutationQueued"; mutationId: string; rowId: RowId }
  | { type: "mutationSettled"; result: ServerMutationResult<TRow> }
```

Per-block transitions:

```text
empty -> queued -> fetching -> loaded
                      |          |
                      v          v
                    error      stale -> queued
                      |
                      v
                    queued

loaded -> evicted
stale -> evicted
error -> evicted
```

View transitions:

```text
idle -> loading-initial -> ready
                 |          |
                 v          v
               error      refreshing -> ready | error
```

Race policy:

- Every request carries `requestId` and `viewKey`.
- A response whose `viewKey` is no longer active is ignored unless it is being stored in a retained previous-view cache.
- A later successful response for the same block key replaces an earlier response.
- Failed stale responses do not overwrite loaded current data.

## React Adapter Contract

The React adapter in `@bc-grid/react` owns:

- Mapping controlled sort/filter/search/group state into `ServerViewState`.
- Choosing mode-specific loader props.
- Integrating TanStack manual pagination for paged mode.
- Passing row count and absolute indexes to the virtualizer and accessibility layer.
- Displaying loading/error rows.
- Surfacing events through `onServerRowModelEvent`.
- Exposing imperative APIs:

```ts
export interface BcServerGridApi {
  refreshServerRows(opts?: { purge?: boolean }): void
  invalidateServerRows(invalidation: ServerInvalidation): void
  retryServerBlock(blockKey: ServerBlockKey): void
  getServerRowModelState(): ServerRowModelState<unknown>
}
```

The engine package does not import React or TanStack.

## Consumer API Sketch

```tsx
<BcServerGrid<Customer>
  rowModel="infinite"
  columns={columns}
  rowId={(row) => row.id}
  blockSize={100}
  maxCachedBlocks={20}
  loadBlock={async (query, context) => {
    const response = await fetch("/api/customers/blocks", {
      method: "POST",
      body: JSON.stringify(query),
      signal: context.signal,
    })
    return response.json()
  }}
/>
```

Paged:

```tsx
<BcServerGrid<Customer>
  rowModel="paged"
  columns={columns}
  rowId={(row) => row.id}
  pageSize={50}
  loadPage={loadCustomersPage}
/>
```

Tree:

```tsx
<BcServerGrid<AccountNode>
  rowModel="tree"
  columns={columns}
  rowId={(row) => row.id}
  loadChildren={loadAccountChildren}
/>
```

## Resolved Open Questions

### Fixed or adaptive block size?

Fixed for v1.0. Default 100. Adaptive block sizes are deferred because fixed sizes make cache keys stable, simplify tests, and reduce server variability.

### Is cache eviction observable?

Yes. It emits `blockEvicted` events for diagnostics and dev tools. Consumers are not expected to refetch manually; the row model refetches if the user returns to an evicted range.

### What if `totalRows` changes?

Latest successful result for the active `viewKey` wins. The row model updates `rowCount`, the virtualizer resizes, and the accessibility layer updates `aria-rowcount`. If the active row index is now out of range, focus moves to the nearest valid row.

### Cache collapsed tree children or evict on collapse?

Cache collapsed children under the same LRU policy. Collapse does not evict by default. Explicit tree invalidation can purge a subtree.

### Offline behavior?

Cached blocks remain visible as stale data. New unloaded fetches fail visibly and can be retried. Writes are not queued by the server row model.

### Streaming in v1.0?

Deferred. Reserve `ServerRowUpdate` types, but v1.0 uses manual invalidation/refresh unless a product review promotes real-time updates before the v1.0 API freeze.

## Test Plan

Unit tests in `@bc-grid/server-row-model`:

- Query key generation.
- Block lifecycle transitions.
- Request deduplication and race handling.
- LRU eviction.
- Total row count changes.
- Filter/sort view changes.
- Tree child cache and collapse behavior.
- Row selection snapshots.
- Optimistic edit accept/reject/conflict.
- Invalidation by row, block, view, tree, and all.

Integration tests:

- React adapter with mock paged loader.
- React adapter with mock infinite loader and virtualizer.
- Tree expansion with lazy children.
- Error row rendering and retry.
- Accessibility row counts/indexes using server metadata.

E2E tests:

- Playwright test server returning deterministic blocks.
- Scroll through 10k rows with LRU eviction.
- Sort/filter invalidates old view and loads a new view.
- Select-all filtered export sends `ServerSelectionSnapshot`.
- Edit commit updates cache and handles server rejection.

## Review Checklist

- Can `api-rfc-v0` copy these type names without ambiguity?
- Does every mode have a clear query/result pair?
- Does selection work without loaded rows?
- Does export avoid the loaded-rows-only trap?
- Are row IDs stable enough for sort/filter/reload/edit?
- Is cache behavior deterministic enough to test?
- Does this impose any React dependency on `@bc-grid/server-row-model`?
