# v0.3 Filter Persistence Contract — Audit

**Date:** 2026-05-01 (post-v0.2.0)
**Author:** worker4 (Claude)
**Doc type:** **planning / coordination — not an implementation task.**
**Audience:** coordinator triage when v0.3 planning starts; consumer-facing doc when the API page picks this up.

This audit pins what `packages/react/src/persistence.ts` actually persists, what it clears, what is intentionally asymmetric between the two backends (localStorage / URL), and what should NOT be overclaimed in `api.md` or the migration guide. It is the read-side companion to `2026-05-01-filtering.md` (PR #196 / worker2) and the v0.3 filtering / search / persistence planning stream.

The audit found no clearly isolated bugs. Findings ship as a documented contract + corner-case tests.

---

## 1. Scope

The two persistence backends in `@bc-grid/react`:

- **localStorage**, gated on `BcGridProps.gridId`. Keys follow `bc-grid:{gridId}:{state}` per `gridStorageKey`. Six state keys.
- **URL state**, gated on `BcGridProps.urlStatePersistence?: { searchParam: string }`. One JSON-encoded blob in the configured search param. Three state keys.

Out of scope:
- Server-row-model state-snapshots (`BcServerGridApi.getServerRowModelState()`); separate persistence layer.
- Search-text persistence — a v0.3 follow-up candidate; not implemented today.
- Edit-overlay persistence — overlay is by design ephemeral; the consumer's `data` prop is canonical.

## 2. What persists where (the contract)

### 2.1 Per-key matrix

| Key | localStorage (`PersistedGridState`) | URL (`UrlPersistedGridState`) | Why the asymmetry |
|---|---|---|---|
| `columnState` | ✓ | ✓ | Shared between both. Per-column visibility, position, width, pinning, **and per-entry `sortDirection` / `sortIndex`**. |
| `sort` | — | ✓ | URL-only. localStorage carries the same sort information *via* `columnState[i].sortDirection` / `sortIndex`. The URL writes a top-level `sort` array because URLs are user-shareable and a flat sort array is the human-readable shape. |
| `pageSize` | ✓ | — | Per-machine preference; not shareable. |
| `density` | ✓ | — | Per-machine preference; not shareable. |
| `groupBy` | ✓ | — | Currently per-machine; could expand to URL later. |
| `filter` | ✓ | ✓ | Filter is the most user-visible state; both backends carry it. URL takes precedence over localStorage on mount per the existing wiring in `grid.tsx`. |
| `sidebarPanel` | ✓ | — | Per-machine preference; not shareable. |
| `searchText` | — | — | **Not persisted by either backend today.** Tracked as a v0.3 follow-up candidate. |
| Edit overlay | — | — | Ephemeral by design; consumer's `data` prop is canonical (per editing-rfc §Row-model ownership). |

### 2.2 Storage-key convention

`gridStorageKey(gridId, state)` produces `bc-grid:{gridId}:{state}` and is exported. Stable; tests pin it.

### 2.3 URL search-param shape

One key (`urlStatePersistence.searchParam`), one JSON blob:

```
?grid={"columnState":[...],"sort":[...],"filter":{...}}
```

Each top-level field is optional. The writer drops the entire search param when **all three** are `undefined`; otherwise it writes the JSON-stringified state. **Empty arrays do NOT trigger a delete** — a `state: { columnState: [], sort: [] }` writes the param with both empty arrays. Intentional: empty arrays mean "no current state", which is distinct from "no preference" (the latter passes `undefined`).

### 2.4 Validation behaviour (read path)

Per-field, every persisted value runs through a parse helper that validates shape and **silently drops invalid entries**. The grid never throws or warns on malformed persisted state. The contract is "best-effort restore" — a corrupted blob from a previous bc-grid version, or hand-edited storage / URL, never breaks the grid.

Specifics:
- `parseColumnState`: each entry must have a non-empty string `columnId`. Other fields fall through to defaults if invalid; the entry survives as a partial. Test: `{ columnId: "x", pinned: "middle", width: -1 }` parses to `{ columnId: "x" }`.
- `parseSortState`: each entry must have non-empty `columnId` and `direction in {asc, desc}`. Invalid entries dropped from the array.
- `parseServerFilter`: walks the recursive group / column-filter tree. Invalid leaves are dropped; an empty group becomes `undefined` (so the parent group can drop it too).
- `parseFilterState` accepts every column-filter `type` enumerated in `isColumnFilterType` (text / number / number-range / date / date-range / set / boolean / custom).
- `parsePageSize`: positive integer.
- `parseDensity`: one of `"compact" | "normal" | "comfortable"`.
- `parseGroupBy`: every entry must be a string.
- `parseSidebarPanel`: `null` (closed) or non-empty string.

### 2.5 Write behaviour

- **`writePersistedGridState(gridId, state)`** writes every key in `PersistedGridState`. A field set to `undefined` removes its localStorage key (`storage.removeItem`). A field set to `null` writes the JSON-string `"null"`. The latter is intentional for `sidebarPanel`, which has the type `string | null | undefined`: `null` means "explicitly closed" and round-trips to `null` on read.
- **`writeUrlPersistedGridState(options, state)`** writes the JSON blob into `searchParam`. When `state.columnState`, `state.sort`, and `state.filter` are all `undefined` the search param is removed entirely (the URL is cleaned up). Other search params + the URL hash are preserved.
- **Both writers are wrapped in try/catch** and silently swallow storage / quota / security failures. A blocked storage backend (e.g., user has localStorage disabled) does not break the grid.
- **The consumer-facing hooks (`usePersistedGridStateWriter`, `useUrlPersistedGridStateWriter`) debounce writes by 500ms** (`GRID_STATE_WRITE_DEBOUNCE_MS`). Rapid state churn (e.g., a user dragging a column) collapses to a single trailing write.

### 2.6 Read precedence

The persistence layer itself has no precedence policy — it just reads from each backend. **`grid.tsx` chains the two on mount** via the `defaultFilterState` cascade:

```ts
props.defaultFilter ?? urlPersistedGridState.filter ?? persistedGridState.filter ?? null
```

Same pattern for `columnState` / `sort` / `density` / etc. **URL state always wins over localStorage on mount.** Documented in `docs/api.md §3.3` (the column-state persistence section); also applies to filter (since #193 rescue) but not yet explicitly written into `api.md` for the filter case.

## 3. What is NOT persisted (do not overclaim)

The following items have come up in conversations / docs as "should persist" but currently do not. Some are deliberate; some are gaps.

| Item | Status | Reason / pointer |
|---|---|---|
| `searchText` | Not persisted (gap) | Recommended as a `search-persistence` follow-up. Not implemented today. |
| Selection state (`BcSelection`) | Not persisted (deliberate) | Selection is ephemeral by intent; reloads start with the consumer's `defaultSelection` or empty. |
| Range selection (`BcRangeSelection`) | Not persisted (deliberate) | Same as above; range state is session-scoped. |
| Active cell | Not persisted (deliberate) | Focus / cursor position is per-tab. |
| Expansion state (group / detail) | Not persisted (deliberate) | Tracked via `BcGridProps.expansion`; per-mount restore is consumer-owned. |
| Edit overlay (pending edits) | Not persisted (deliberate) | Per editing-rfc §Row-model ownership: the consumer's `data` prop is canonical; pending edits are lost on reload. Consumers wanting per-tab edit drafts wire their own storage. |
| Pivot state | Not persisted (deferred) | Tracked in the pivot RFC; not in v0.3 scope. |
| Aggregation footer state | Not persisted (deliberate) | Stateless rerender from current rows / filters / aggregations. |

**Doc claim audit:**
- `api.md §3.3` ("Persistence") names `columnState`, `pageSize`, `density`, `groupBy`. Accurate at the time of writing. **Should be extended** to include `filter` (now persists per #193) and `sidebarPanel` (persists per the sidebar-impl PR). Not in this PR's scope per the brief; flagged for a follow-up docs task.
- `release-milestone-roadmap.md` v0.3 milestone gate: "Filter state persists through URL and `localStorage` where configured." Accurate.
- The migration guide (#108 in review) — has not been audited for persistence claims; defer to that PR's review.

## 4. Corner-case matrix

Behaviours that aren't bugs but are easy to misread. The matching tests in §5 pin each.

| Behaviour | localStorage | URL | Symmetric? |
|---|---|---|---|
| **Empty-storage read** returns six explicit-`undefined` keys | `{ columnState: undefined, ..., sidebarPanel: undefined }` | `{}` (URL reader returns `{}` when blob is missing) | **No.** localStorage reader always returns six keys; URL reader returns `{}` when no param. Intentional given the API shapes; consumers iterating with `Object.keys(...)` should be aware. |
| **Persisted `null` for `sidebarPanel`** | Writes JSON `"null"`; reads back as `null` | n/a (URL doesn't carry `sidebarPanel`) | n/a |
| **Persisted empty arrays** (`columnState: []`, `sort: []`, etc.) | Writes `"[]"`; reads back as `[]` | Writes the param with `[]`; reads back as `[]` | **Yes.** Both treat empty array as "explicit empty" rather than "no preference". |
| **Custom filter type (`type: "custom"`)** | Pass-through; `value` / `values` not validated | Pass-through; same | **Yes.** Consumer-owned; bc-grid won't break it but won't validate it either. |
| **Unicode / non-ASCII in filter values** | `JSON.stringify` handles encoding; round-trips | `URLSearchParams.set` URL-encodes; round-trips | **Yes.** |
| **Unsupported persisted column-filter `type`** | `parseFilterState` returns `undefined` → key reads as missing | Same | **Yes.** |
| **Hand-edited URL with `sort: [{ columnId: "x", direction: "sideways" }]`** | n/a | Invalid entry dropped; valid entries kept | n/a |
| **Throwing storage backend** (Safari private mode, blocked policy) | Read returns `{}`; write swallows exception | n/a (URL is via `history.replaceState`, also wrapped) | **Yes.** Both best-effort. |
| **`gridId` undefined** | Read returns `{}`; write is a no-op | n/a (URL gating is `urlStatePersistence?.searchParam`) | **Yes.** Both gate on their respective opt-in. |
| **Write debounce** (500ms) | Last-write-wins via `clearTimeout` | Same | **Yes.** Both use `GRID_STATE_WRITE_DEBOUNCE_MS`. |

## 5. Tests added in this PR

`packages/react/tests/persistence.test.ts` gains a new "filter persistence contract corners" describe block with eight focused round-trip / contract tests:

- **Custom filter through localStorage** — `type: "custom", op: "tags-any", values: ["finance", "audit"]` round-trips with `value` / `values` pass-through. Pins the consumer-owned validation contract from §2.4.
- **Custom filter through URL** — same shape, replayed via the URL writer / reader pair.
- **`sidebarPanel: null` round-trip** — explicitly-closed sidebar persists as JSON `"null"` and reads back as `null`. Pins the §2.5 write semantics distinguishing "explicitly closed" from "no preference".
- **Empty-storage read shape (localStorage)** — `readPersistedGridState(gridId, emptyStorage)` returns the six-key object with all `undefined` values; `Object.keys(state).length === 6`. Pins the §4 corner-case so consumers iterating with `Object.keys` are not surprised.
- **Empty URL read shape** — `readUrlPersistedGridState({searchParam}, locationWithoutParam)` returns `{}` (zero keys). Distinguishes from the localStorage shape above.
- **URL writer keeps the param when state has empty arrays** — `state: { columnState: [], sort: [] }` writes `?grid=...` rather than dropping. Pins the §2.3 "empty-array means explicit-empty" rule.
- **URL writer drops the param when every persisted field is undefined** — mirror of the above; documents the discriminator.
- **Unicode + special characters round-trip through both backends** — `"résumé / 顧客 / 🚀"` survives JSON-stringify + URL-encode through both writers / readers. Confidence-builder for international ERP data.

Other tests in the existing suite cover: default key convention, malformed-value rejection, group-filter with mixed valid / invalid leaves, URL-state writer preserving unrelated query / hash, throwing-storage best-effort.

## 6. Bugs / clearly isolated fixes

**None landed in this PR.** Three behaviours flagged during the audit looked bug-shaped at first read but resolved to "intentional but undocumented":

1. **`writeJson(value === null)` writes `"null"` rather than removing the key.** Initially looked like a bug (vs. `undefined` which removes) but is correct: `sidebarPanel: null` semantically means "explicitly closed", distinct from `undefined` ("no preference, fall back to default"). Round-trip preserves the distinction. Tests now pin it (§5).

2. **URL writer doesn't drop the search param for `state: { columnState: [] }`.** The condition is `columnState === undefined && sort === undefined && filter === undefined`. Empty arrays are treated as "explicit empty" — distinct from undefined. Tests now pin it (§5).

3. **`readPersistedGridState` returns six explicit-`undefined` keys when nothing is persisted.** Type-allowed (`?:` makes them optional in TS). Runtime-distinct from `{}`. Documentation gap rather than a bug; §4 + a test pin it.

If a future audit surfaces a real bug, file it as a focused queue task; the persistence layer is small and well-isolated, so isolated fixes are easy to scope.

## 7. v0.3 follow-ups (not this PR)

These are recommended follow-ups and are not closed by this audit:

- **`search-persistence`** (P1) — extend both backends to include `searchText`. Same precedence rules as filter.
- **`persistence-schema-version`** (P1) — version-stamp the persisted JSON; add a migration helper that reads the legacy unstamped shape and returns a stamped one. Pre-v0.4 hardening.
- **`api.md §3.3` update** (XS) — extend the persistence section to name `filter` and `sidebarPanel` alongside the existing four. Docs-only.

## 8. References

- `packages/react/src/persistence.ts` — implementation.
- `packages/react/tests/persistence.test.ts` — test fixture + corner cases.
- `packages/react/src/grid.tsx` — read-side wiring and the `defaultX ?? URL ?? localStorage ?? null` cascade.
- `docs/api.md §3.3` — declared persistence contract (currently out of date for `filter` / `sidebarPanel`; flagged in §3 for a docs follow-up).
- `docs/coordination/release-milestone-roadmap.md` — v0.3 milestone context for filtering / search / persistence follow-up tasks.
- `docs/audits/ag-grid-comparison/2026-05-01-filtering.md` (PR #196) — the AG Grid filter-side audit.

## 9. What this PR is NOT

- Not an implementation PR. Docs + tests only.
- Not an `api.md` update. The §3 doc-claim audit recommends extending `§3.3` to include `filter` and `sidebarPanel`, but doing it lives in a separate (XS) follow-up task per the brief's "do not touch release docs" boundary.
- Not a bug fix. The audit found three behaviours that looked bug-shaped but are intentional; tests in §5 pin the contract.
- Not a release call. v0.2.0 has shipped; v0.3 readiness is tracked through the roadmap and coordinator queue. This audit is one input among several.
