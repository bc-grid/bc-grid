# Server Paged Cursor Pagination IMPL Deferral

**Status:** DEFERRED to a focused single-session implementation. Documentation-only doc explaining why and how to unblock.

**Created:** 2026-05-04 by worker1 (Claude). Companion to:
- `docs/design/server-paged-cursor-pagination-rfc.md` (parent RFC #462, ratified)
- Worker1 v0.6 handoff "Then-after" pickup
- Precedent deferrals: `v05-server-loader-generics-deferral.md` (#376), `server-infinite-tree-dual-output-deferral.md` (#485), `body-cell-memoisation-deferral.md` (#486)

---

## What was deferred

The handoff queued `v06-server-paged-cursor-pagination` as IMPL after RFC #462 ratified. RFC §12 estimated single PR, ~1 day with 10 sub-items (types, internal cursor state machine, cache key extension, useServerPagedGrid cursor branch, BcServerGridApi cursor methods, pagination chrome, saved-view DTO, tests, recipe, api-surface).

In practice, the substantive lift is item 2 — the **internal cursor state machine in `usePagedServerState`**. That hook is ~400 LOC of dense React state coordination (request-id supersedure, AbortController cascade, debounce, optimistic-edit flow, mode-switch grace). Adding a parallel cursor branch means either:

1. **Duplicate the entire state machine** as a sibling `usePagedServerStateCursor` — ~400 LOC of mirror code that diverges immediately on every future change.
2. **Branch internally on cursor vs offset** — every state mutation site has to fork on which mode is active. Doubles the cyclomatic complexity of `usePagedServerState` for a feature that consumers opt into per-grid.
3. **Extract a shared orchestration primitive** — Option B from the dual-output RFC #477 §4. The same orchestration extraction blocked on the dual-output infinite/tree deferral (#485). Doing both extractions in one PR is the right architectural call but also doubles the deferred scope.

None of the three is a session-of-work kind of refactor. Per AGENTS.md "no half-finished implementations", shipping a partial cursor surface (types + prop only, with the loader never wired) would create a public API that consumers can adopt but doesn't work. That's worse than the deferral.

## Why deferred (vs the other open paths)

Three factors compound:

### 1. The state-machine extraction is gated on dual-output infinite/tree

The dual-output deferral (#485) recommends Option B — extract per-mode orchestration primitives. Cursor pagination wants the SAME orchestration extraction so the cursor variant can call into the shared primitive instead of duplicating ~400 LOC.

Doing cursor first, then dual-output extraction, means the cursor IMPL gets refactored a second time when the extraction lands. Doing the extraction first then cursor is the correct sequence — but the extraction is itself ~1.5-2 days per #485.

### 2. Saved-view DTO discrimination is cross-cutting

RFC §8 specifies the saved-view DTO becomes:

```ts
type BcSavedViewPagination =
  | { kind: "offset", pageIndex: number, pageSize: number }
  | { kind: "cursor", cursor: string | null, pageSize: number }
```

This requires:
- Adding the `kind` discriminator to the existing DTO (which today has no `kind` field).
- `migrateSavedViewLayout` handling for old views (default `kind: "offset"`).
- Persistence test coverage for the cross-mode load behavior (RFC §8: silently degrade with `console.info`).

The saved-view machinery ships as `@bc-grid/react`'s `migrateSavedViewLayout`. Touching it for cursor support means coordination with consumers who already persist saved views — small but non-trivial migration scope.

### 3. Pagination chrome wiring is per-mode

RFC §7 specifies:

| Field | Offset | Cursor |
|---|---|---|
| Jump-to-page input | enabled | DISABLED |
| Prev button gate | `pageIndex > 0` | `cursorStack.length > 0 \|\| prevCursor != null` |
| Next button gate | `pageIndex < totalPages - 1` | `nextCursor != null` |
| "Page X of Y" | always | only when `totalRows` known; fall back to "Page X" |

The chrome lives in the `<BcPagination>` component (separate from the state machine). Each chrome conditional is small but the surface change is non-trivial to test.

## What ships in v0.6.0

This deferral doc (commit-only). Cursor-pagination is unimplemented; consumers needing it stay on the offset `LoadServerPage<TRow>` path. The RFC #462 stays ratified — its surface design is correct and the IMPL plan is sound; the deferral is about implementation sequencing, not RFC scope.

## How to unblock

The recommended sequence is:

1. **First**: implement the dual-output orchestration extraction per #485. Lifts `usePagedServerState` / `useInfiniteServerState` / `useTreeServerState` from `serverGrid.tsx` into `internal/useServerOrchestration.ts` (already exists for shared primitives) as named exports `usePagedOrchestration` / etc. The signature change is mechanical; behavior change is zero for existing consumers.

2. **Then**: cursor-pagination IMPL becomes a parallel branch INSIDE `usePagedOrchestration`. The state mutation sites fork on `cursor !== undefined` (cursor mode) vs `pageIndex !== undefined` (offset mode). Code reuse for request-id supersedure / abort / debounce / optimistic edits / mode-switch grace.

3. **Finally**: chrome + saved-view DTO + recipe land in the same PR (or as small follow-ups). These are independent of the state-machine extraction.

Combined estimated effort: ~3-4 days for steps 1+2, plus ~half-day for step 3.

## Alternative: ship cursor without dual-output extraction

If timing pressure makes the extraction infeasible, an acceptable alternative is to duplicate the state machine (Option 1 from §1 above) ONCE, accepting the ~400 LOC drift cost. Future maintenance gets a sticky note: "if you change `usePagedServerState`, mirror in `usePagedServerStateCursor`."

This is genuinely worse than the extraction but ships the cursor surface. The decision is sequencing risk vs technical debt.

## Open questions

1. **Sequencing call**: extraction-first vs duplicate-state-machine-first? The dual-output RFC #477 + cursor RFC #462 both want the extraction; doing it once for both is cleaner.

2. **Marker dedup (RFC #477 §5) sequencing**: the marker-prop dedup is independent of cursor IMPL but coupled with the dual-output IMPL. Recommend: marker dedup is a separate PR after both extraction + cursor land.

3. **`useServerPagedGrid` cursor branch**: when does this land? RFC §3.3 says the hook gains a `loadPageCursor?` option. Most sensible sequencing: after the `<BcServerGrid>` cursor branch ships, mirror in the hook in a small follow-up.

## Decision log

(empty — populated when the implementation PR opens.)
