# Server Paged Cursor Pagination RFC

**Status:** Draft for ratification (autonomous merge authorised; this RFC documents design + open questions, it does not gate ship)
**Author:** worker1 (Claude)
**Reviewer:** maintainer (JohnC) + Claude coordinator
**Target release:** v0.6.0
**Implementation lane:** worker1 (single PR after RFC ratifies)
**Informed by:** `docs/coordination/handoff-worker1.md` v0.6 train (2026-05-03 refresh, "Next-after" task), `packages/core/src/index.ts:920-944` (existing offset paged contract), `packages/react/src/serverGrid.tsx` (paged orchestration), `packages/react/src/internal/useServerOrchestration.ts` (request-id flow + abort cascade), `docs/design/client-tree-rowmodel-rfc.md` (RFC pattern), `packages/server-row-model/src/index.ts` (model-layer cache + viewKey gate).

---

## 1. Problem statement

`<BcServerGrid rowModel="paged">` ships an offset-based loader contract:

```ts
export type LoadServerPage<TRow> = (
  query: ServerPagedQuery,    // { pageIndex, pageSize, view, requestId, viewKey, ... }
  context: ServerLoadContext, // { signal }
) => Promise<ServerPagedResult<TRow>>
//          { rows, totalRows, pageIndex, pageSize, viewKey?, revision? }
```

`pageIndex` + `pageSize` map cleanly to `LIMIT N OFFSET (pageIndex * N)` against a Postgres / MySQL / SQL Server backend. Two consumer-backend classes do NOT fit this shape:

1. **Cursor-native APIs** — Hasura keyset pagination (`where: { id: { _gt: $cursor } } limit: $pageSize`), GraphQL Relay-style (`first: N, after: $cursor` returning `{ edges, pageInfo: { endCursor, hasNextPage } }`), Algolia (`page: N` is the only "offset" but the page-token-style is the recommended path for large result sets), DynamoDB (`ExclusiveStartKey` / `LastEvaluatedKey`). The consumer's natural query shape is `{ cursor, pageSize } → { rows, nextCursor }` — pageIndex is meaningless because the API can't compute "page 47" without walking pages 0-46.

2. **Stable-scroll-while-data-inserts use cases** — when new rows insert into the result set faster than the user scrolls, offset pagination shows the same row twice (the row that was at position 50 is now at position 51 because a row was inserted; user scrolls past page boundary 50, sees that row again). Cursor pagination is invariant under inserts because the cursor anchors to row identity, not row position.

Today, consumers in either bucket either:
- Translate `pageIndex` → cursor inside `loadPage` via a per-grid `Map<pageIndex, cursor>` they maintain by hand. Latency hit (an extra round-trip when the requested `pageIndex` isn't already in the map) and breaks under concurrent loaders since the map's cursor / pageIndex correspondence drifts.
- Wrap the grid with `rowProcessingMode: "manual"` + a custom toolbar that hides the grid's native paginator and rolls their own. Loses the chrome integration (saved-view pagination state, pagination context-menu submenu shipped in #420, prefetch-budget radio shipped in #428, all the Server submenu items currently keyed off `pageIndex` / `pageSize` semantics).

Neither workaround is acceptable for v0.6.0's "consumer-feedback absorption" theme. The right primitive is a **first-class cursor loader signature** that composes with the existing paged orchestration's cache + abort + viewKey machinery.

## 2. Scope and non-goals

**In scope (v0.6.0):**

- New loader signature `LoadServerPageCursor<TRow>` exported from `@bc-grid/core`. Receives `{ cursor: string | null, pageSize, view, signal, requestId, viewKey }`; returns `{ rows, nextCursor: string | null, prevCursor?: string | null, totalRows? }`.
- Discriminated dispatch on `BcServerPagedProps`: consumer supplies EITHER `loadPage` (existing offset path) OR `loadPageCursor` (new cursor path) — never both. See §4 for the discriminant decision.
- Internal pagination state machine carries `cursor: string | null` (current page) + `cursorStack: string[]` (history for prev) + `nextCursor: string | null` (returned by latest fetch). Replaces `pageIndex` for the cursor path; offset path unchanged.
- Cache keys cursor-based: `Map<cursor, ServerPagedResult>` instead of `Map<pageIndex, ServerPagedResult>`. Same LRU eviction, viewKey gate, request-id supersedure as the offset path.
- Recipe doc at `docs/recipes/cursor-pagination.md` covering Hasura keyset + Relay-style GraphQL + DynamoDB-style examples.
- `useServerPagedGrid` companion hook accepts `loadPageCursor` alternative; routes internally.
- Saved-view pagination state: cursor-mode grids persist `{ cursor: string | null, pageSize }` instead of `{ pageIndex, pageSize }`. Distinct discriminator on the persisted DTO so a saved view from a cursor grid doesn't reload into an offset grid as `pageIndex 0`.

**Out of scope (deferred):**

- **Bidirectional cursor (prev page in cursor mode).** Cursor APIs vary: Relay returns `startCursor` + `endCursor`; Hasura keyset typically doesn't return a "prev" cursor (the consumer would have to pass `where: { id: { _lt: $startCursor } }` themselves). v0.6 ships forward-only navigation + an in-memory `cursorStack` for "go back to a recently visited page". A real bidirectional contract (where the SERVER hands back `prevCursor`) is a v0.7 follow-up.
- **Mixed-mode grids** (toggle between offset and cursor at runtime). Out of scope; consumers pick one shape per grid instance.
- **`useServerInfiniteGrid` cursor variant.** Infinite scroll has different semantics — the cursor would be implicit (the last row's id, derived). v0.7 follow-up; explicit non-goal here.
- **`useServerTreeGrid` cursor variant.** Tree fetches are per-parent-rowId so cursor pagination there means cursor-per-parent which is a different shape. v0.7 follow-up.
- **`totalRows` requirement.** Cursor APIs frequently can't compute a total without a separate count query. The cursor result allows `totalRows` as optional. The grid's pagination chrome (`Page X of Y`) gracefully degrades to `Page X` when `totalRows` is undefined (mirrors the existing `infinite` behavior).

## 3. Public API surface

### 3.1 New types on `@bc-grid/core`

```ts
export interface ServerPagedCursorQuery extends ServerQueryBase {
  mode: "paged"
  /** Opaque cursor returned by a previous `loadPageCursor` call, or `null` for the first page. */
  cursor: string | null
  /** Requested page size for the current cursor window. */
  pageSize: number
  pivotState?: BcPivotState
}

export interface ServerPagedCursorResult<TRow> {
  /** Rows for the requested cursor window only, not the full result set. */
  rows: TRow[]
  /** Cursor to pass back for the NEXT page, or `null` when no more pages. */
  nextCursor: string | null
  /** Optional cursor for the PREVIOUS page (only set if the server supports bidirectional navigation; otherwise the orchestration uses its in-memory `cursorStack`). */
  prevCursor?: string | null
  /** Optional total row count. When omitted, chrome shows "Page X" not "Page X of Y". */
  totalRows?: number
  /** Page size used to produce rows (echo for diagnostics). */
  pageSize: number
  viewKey?: string
  revision?: string
}

export type LoadServerPageCursor<TRow> = (
  query: ServerPagedCursorQuery,
  context: ServerLoadContext,
) => Promise<ServerPagedCursorResult<TRow>>
```

### 3.2 `BcServerPagedProps` discrimination

The cleanest discrimination per §4 below is **two distinct props**, one of which must be set:

```ts
export interface BcServerPagedProps<TRow> extends BcServerGridPropsBase<TRow> {
  rowModel?: "paged"  // existing
  loadPage?: LoadServerPage<TRow>            // existing offset path
  loadPageCursor?: LoadServerPageCursor<TRow> // NEW cursor path
  // ... rest unchanged
}
```

Mount-time assertion: exactly one of `loadPage` / `loadPageCursor` must be set when `rowModel === "paged"` (or `rowModel` undefined and the heuristic resolves to paged). Dev-mode warning when neither is set or both are set; the grid stays in a no-rows state to avoid silent broken behaviour.

### 3.3 `useServerPagedGrid` companion hook

```ts
export function useServerPagedGrid<TRow>(opts: {
  gridId: string
  loadPage?: LoadServerPage<TRow>
  loadPageCursor?: LoadServerPageCursor<TRow>
  // ... rest unchanged
}): { props, state, actions }
```

Same discrimination: exactly one of `loadPage` / `loadPageCursor`. Returned `props` slot the right loader into `BcServerPagedProps`.

`state` shape gains:

```ts
interface ServerPagedState<TRow> {
  // existing: { rows, totalRows, loading, error, ... }
  // cursor-mode-only fields:
  cursor: string | null         // current cursor (null on first load)
  nextCursor: string | null     // returned by latest fetch
  cursorStack: readonly string[] // history for goPreviousPage()
  cursorMode: boolean           // true when loadPageCursor is set
}
```

`actions` shape gains: `goNextPage()` / `goPreviousPage()` (cursor-aware) — for offset mode they continue to dispatch `setPageIndex(±1)`.

### 3.4 `BcServerGridApi` additions

Existing: `getPageIndex()` / `setPageIndex()` / `getPageSize()` / `setPageSize()`.

New (cursor-mode only; throws in offset mode with a clear "this grid uses offset pagination — call setPageIndex" error):

```ts
interface BcServerGridApi {
  // existing methods
  getCursor(): string | null
  setCursor(cursor: string | null): void
  getNextCursor(): string | null
  goPreviousPage(): boolean  // true if a prev was available, false if at the start
}
```

`getPageIndex()` in cursor mode returns the index INTO `cursorStack` (so chrome can render "Page 3" as "you're on the 3rd cursor in the stack") rather than throwing — keeps the chrome decoupled from the loader shape.

## 4. Discrimination decision: union vs distinct prop

Two candidate shapes:

**Option A — single prop, discriminated union:**

```ts
loadPage: LoadServerPage<TRow> | { kind: "cursor", load: LoadServerPageCursor<TRow> }
```

**Option B — two distinct optional props (RECOMMENDED):**

```ts
loadPage?: LoadServerPage<TRow>
loadPageCursor?: LoadServerPageCursor<TRow>
```

### Comparison

| Dimension | Option A (union) | Option B (distinct) |
|---|---|---|
| Backwards compatibility | Breaks: existing consumers passing a function pass a `LoadServerPage`, but TS narrows `loadPage` to `(...) => Promise<...> \| { kind: "cursor", load: ... }`. Existing call sites get the function type for free. Likely OK for runtime but the API surface diff is large. | Additive: `loadPage` unchanged. `loadPageCursor` is new optional. Zero churn for offset consumers. |
| Mount-time validation | One required prop. Simpler "is it set" check. | Mount assertion needs to verify exactly-one-of. |
| TypeScript ergonomics | Discriminated union narrows nicely on the consumer side IF they spread inline. If they store the loader in a typed variable, narrowing is clunkier. | Two clean function types; consumer chooses the one matching their backend. No narrowing dance. |
| Saved-view persistence | The DTO needs to carry which path was used. With union, we need a separate `paginationKind` field. With distinct, the persisted DTO discriminates by which key is set. Either way, ~1 extra field. | (same) |
| `useServerPagedGrid` shape | Same union surface. | Same distinct surface. |
| api-surface diff | Larger (changes the `loadPage` type signature). Harder to review for breakage. | Smaller (one new optional prop). |
| Future direction (e.g. bi-directional cursor in v0.7) | Adds a 3rd union arm. | Adds a 3rd optional prop. Same churn. |

**Recommendation:** Option B. Additive over the existing surface, clean api-surface diff, no consumer-side narrowing required, mount-time validation cost is negligible. Matches the established pattern of `loadPage` / `loadBlock` / `loadChildren` being three distinct optional props on the polymorphic surface (RFC §4 of `v05-server-mode-switch`).

**Open question for ratification:** confirm Option B; if maintainer prefers Option A, this RFC needs a §13 entry pre-implementation.

## 5. Internal pagination state machine

Today's offset state in the React layer (`packages/react/src/serverGrid.tsx`):

```ts
interface ServerPagedState {
  pageIndex: number  // controlled or uncontrolled
  pageSize: number
  // ...
}
```

Cursor-mode state:

```ts
interface ServerPagedCursorState {
  cursor: string | null      // current page's cursor (null for first page)
  cursorStack: string[]      // history for goPreviousPage()
  nextCursor: string | null  // returned by latest fetch
  pageSize: number
  // ...
}
```

### Cursor advance flow

```
[mount]  cursor = null, cursorStack = []
         loadPageCursor({ cursor: null, pageSize: N }) → { rows, nextCursor: "abc..." }
         state = { cursor: null, cursorStack: [], nextCursor: "abc..." }

[next]   cursor = "abc...", cursorStack = [null]
         loadPageCursor({ cursor: "abc...", pageSize: N }) → { rows, nextCursor: "def..." }
         state = { cursor: "abc...", cursorStack: [null], nextCursor: "def..." }

[next]   cursor = "def...", cursorStack = [null, "abc..."]
         ...

[prev]   cursor = pop from cursorStack
         loadPageCursor({ cursor, pageSize: N }) → { rows, nextCursor: <currentCursor> }
         (refetches the previous page; no client-side caching of stale page rows because
          the server may have inserted/deleted rows since)

[view-change] cursor = null, cursorStack = [], nextCursor = null
              (filter / sort / pageSize / search reset to the first cursor)
```

### Server-supplied prevCursor (optional)

When the server returns `prevCursor` in `ServerPagedCursorResult`, the orchestration prefers it over `cursorStack.pop()` for `goPreviousPage()`. This lets the consumer override the in-memory stack when their backend has its own bidirectional cursor (Relay-style `pageInfo.startCursor`).

### Cache keys

```ts
type CursorCacheKey = `${viewKey}::${cursor ?? "__null__"}::${pageSize}`
```

Cache hits when cursor + viewKey + pageSize all match. View-change invalidation reuses the same cache-clear path as offset mode (`viewKey` change → drop all entries).

### Request-id supersedure

Unchanged from offset path — each `loadPageCursor` call gets a monotonic `requestId`, the orchestration's `abortExcept(requestId)` cancels prior in-flight requests, the result-merge gate at the React layer drops responses for stale `requestId`s. The cursor doesn't change this — request-id flow is orthogonal.

## 6. View-change reset semantics

When the user changes filter / sort / search / pageSize / groupBy:

- **Offset mode (existing):** `pageIndex` resets to `0`, viewKey changes, cache clears.
- **Cursor mode (new):** `cursor` resets to `null`, `cursorStack` clears, `nextCursor` clears, viewKey changes, cache clears.

Mirrors the offset reset shape; just operates on cursor state instead of pageIndex state. The view-change-debounce policy added in #444 (`viewChangeDebounceMs`) applies identically.

## 7. Pagination chrome integration

The grid's pagination footer/toolbar (`<BcPagination>` slot) reads:

| Field | Offset mode | Cursor mode |
|---|---|---|
| Current page label | `Page ${pageIndex + 1}` | `Page ${cursorStack.length + 1}` |
| Total page label | `of ${Math.ceil(totalRows / pageSize)}` (when totalRows known) | `of ${Math.ceil(totalRows / pageSize)}` (when totalRows known) OR omit |
| Prev button enabled | `pageIndex > 0` | `cursorStack.length > 0` OR `prevCursor != null` |
| Next button enabled | `pageIndex < Math.ceil(totalRows / pageSize) - 1` | `nextCursor != null` |
| Jump-to-page input | enabled (input → `setPageIndex`) | DISABLED (cursor mode can't jump arbitrarily; greyed out with tooltip "Cursor pagination — use Next/Previous") |

Chrome rendering stays decoupled from the loader shape via the `BcServerGridApi` getters listed in §3.4.

## 8. Saved-view persistence

`BcSavedView`'s pagination DTO (currently `{ pageIndex: number, pageSize: number }`) extends:

```ts
type BcSavedViewPagination =
  | { kind: "offset", pageIndex: number, pageSize: number }
  | { kind: "cursor", cursor: string | null, pageSize: number }
```

Offset mode persists `kind: "offset"` (default for backwards compatibility — savedViews without a `kind` field roll forward as offset). Cursor mode persists `kind: "cursor"` with the current cursor + stack.

**Cross-mode load:** if a saved view created in offset mode loads into a cursor-mode grid, the orchestration discards the persisted `pageIndex` and starts at `cursor: null` (fresh first page). Symmetric for the reverse direction. Logged as `console.info` so consumers can detect the mismatch during their saved-view migration.

## 9. Recipe doc shape

`docs/recipes/cursor-pagination.md` covers three patterns:

1. **Hasura keyset** — `where: { id: { _gt: $cursor } } limit: $pageSize order_by: { id: asc }`. Cursor = last row's `id`. `nextCursor: rows.length === pageSize ? rows[rows.length - 1].id : null`.
2. **GraphQL Relay-style** — query `connection(first: N, after: $cursor)` returns `{ edges, pageInfo: { endCursor, hasNextPage, startCursor } }`. `nextCursor: pageInfo.hasNextPage ? pageInfo.endCursor : null`. Optional `prevCursor: pageInfo.startCursor`.
3. **DynamoDB scan/query** — `ExclusiveStartKey: $cursor` returns `{ Items, LastEvaluatedKey }`. Cursor = JSON-stringified `LastEvaluatedKey`.

Each pattern: ~30 LOC consumer-side `loadPageCursor` implementation + the matching `<BcServerGrid>` mount + a note on how `view.filter` / `view.sort` map to the backend's filter/sort shape.

## 10. Test coverage

**Model layer (`packages/server-row-model/tests/`):**

- Cursor cache hit on (viewKey, cursor, pageSize) match.
- View-change invalidation drops cursor cache entries.
- Request-id supersedure: 5 `loadPageCursor` calls in flight, only the latest result lands.
- `nextCursor: null` triggers end-of-list state.
- Server-supplied `prevCursor` overrides `cursorStack.pop()`.

**React layer (`packages/react/tests/`):**

- Mount-time assertion: passing both `loadPage` + `loadPageCursor` warns + grid stays empty.
- Mount-time assertion: passing neither warns + grid stays empty.
- `useServerPagedGrid` cursor mode: `actions.goNextPage()` advances cursor; `actions.goPreviousPage()` pops.
- Pagination chrome: jump-to-page input disabled in cursor mode; Next/Prev buttons gated correctly.
- Saved-view roundtrip: cursor-mode view persists + restores the cursor + stack.
- Cross-mode saved-view load: offset view → cursor grid, cursor view → offset grid both degrade gracefully with console.info.

**Coverage target:** match the offset path's existing coverage gate per `design.md §14.1`.

## 11. Migration / rollout

- `loadPage` / offset path: zero breakage; existing consumers see no surface change.
- `loadPageCursor` is opt-in additive.
- `useServerPagedGrid` is opt-in additive.
- Saved-view DTO migration: `migrateSavedViewLayout` handles the unknown-`kind` case (defaults to offset).
- Recipe doc lands with the implementation PR.

## 12. Implementation plan

Single PR, ~1 day:

1. New types in `@bc-grid/core` (cursor query / result / loader).
2. Internal cursor state machine in `serverGrid.tsx` — adds parallel branch alongside the offset branch (no shared mutation; clean dispatch).
3. Cache key extension in `@bc-grid/server-row-model` — same LRU, viewKey gate, request-id supersedure machinery.
4. `useServerPagedGrid` cursor branch + `actions.goNextPage()` / `goPreviousPage()`.
5. `BcServerGridApi` cursor methods.
6. Pagination chrome wiring (Next/Prev gating, jump-to-page disable).
7. Saved-view DTO + `migrateSavedViewLayout`.
8. Tests per §10.
9. Recipe doc.
10. api-surface manifest updates for new exports.

Stacked nothing — branches off `main`. Independent of the in-flight client-tree-rowmodel phase 2 / 2.5 / 3 PRs.

## 13. Open questions

1. **Discrimination shape** (Option A vs Option B). RFC recommends B; maintainer to confirm.
2. **`prevCursor` from server vs in-memory stack** — when both exist, server-supplied wins. Confirm.
3. **`totalRows` optional in cursor mode** — graceful chrome degradation when undefined. Confirm the chrome behaviour ("Page 3" without "of N") matches consumer expectations vs always rendering "Page 3 of ?".
4. **Saved-view cross-mode load** — degrade silently to first page + `console.info`, OR throw a `BcServerGridError` so the consumer can show an explicit migration prompt? RFC defaults to silent + info-log, matching the offset path's behaviour for missing `pageIndex` in legacy saved views.
5. **`useServerInfiniteGrid` cursor variant** — explicitly out of scope here. Confirm it's a v0.7 follow-up not a v0.6 dependency.

## 14. Decision log

(empty — populated as questions in §13 ratify.)
