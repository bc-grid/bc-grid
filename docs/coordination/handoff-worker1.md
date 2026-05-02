# Worker1 Handoff (Claude — server grid stability lane)

**Last updated:** 2026-05-02 by Claude coordinator
**Worktree:** `~/work/bcg-worker1`
**Branch convention:** `agent/worker1/<task-slug>`

## How to use this document

When the maintainer says **"review your handoff"**, read the **Active task** section below and proceed. This document is the source of truth for what worker1 should be doing right now. The Claude coordinator in `~/work/bc-grid` keeps it current.

---

## Active task — v0.5: `useServerPagedGrid` turnkey hook (updated 2026-05-02)

PR #353 (`rowProcessingMode`) is approved by coordinator and being merged this turn. Bundle baseline bump landed. **Start v0.5 work now** — synthesis at `docs/coordination/audit-2026-05/synthesis.md` ratified the v0.5 plan.

### Primary task — `useServerPagedGrid({ gridId, loadPage })`

Audit P0-6 / synthesis sprint plan. The single biggest API ergonomics win for the BusinessCraft ERP migration.

**Spec:**
```ts
export function useServerPagedGrid<TRow>(opts: {
  gridId: string
  loadPage: LoadServerPage<TRow>
  initial?: { sort?, filter?, search?, page?, pageSize? }
  debounceMs?: number  // default 200ms for filter/search
  rowId: (row: TRow) => RowId
}): {
  props: BcServerGridProps<TRow>      // spread-ready into <BcServerGrid>
  state: ServerPagedState<TRow>       // current sort/filter/page/loading
  actions: { reload, setPage, setPageSize, applyOptimisticEdit }
}
```

**The hook owns:**
- `requestId` flow (each loadPage call gets an incrementing id; only the latest result is applied)
- Stale-response rejection (responses for a superseded requestId drop silently)
- Debounce on filter/search changes (default 200ms; configurable via `debounceMs`)
- Page reset on filter / sort / search change (back to page 0)
- Optimistic edits in flight (consumer calls `actions.applyOptimisticEdit({ rowId, patch })`; hook tracks until next loadPage settles or rejects)
- Error surface (`state.error` carries last loadPage error; `actions.reload()` retries)
- AbortSignal threading (uses the existing `ServerLoadContext.signal`)

**Reference implementation:** `~/work/bsncraft/apps/web/components/server-edit-grid.tsx:74-163`. That's the 9-`useState` orchestration this hook subsumes. Read it first; the hook should make all of that disappear in the consumer.

**Tests:** unit-level for the orchestration (request-id supersedure, debounce timing, page reset semantics, optimistic edit lifecycle). Don't write Playwright — coordinator runs that.

**Branch:** `agent/worker1/v05-use-server-paged-grid`

### Follow-up tasks (after the hook PR is open)

1. **`apiRef.scrollToCell(rowId, colId, opts)`** for server-paged grids. Returns a Promise that resolves once the cell is loaded + visible (handles the "row not yet loaded" case via the hook's loadPage). Branch: `agent/worker1/v05-api-ref-scroll-to-cell`.
2. **Companion hooks** if scope permits: `useServerInfiniteGrid`, `useServerTreeGrid`. Defer to v0.6 if tight.
3. **Stretch: Generic `TRow` propagation** into `LoadServerPage<TRow>` query type so `query.sort` / `query.filter` are typed against column ids. Branch: `agent/worker1/v05-server-loader-generics`. Only ship if low risk.

### Coordinator answers / context

- **PR #353 status:** approved; coordinator merging this turn after baseline bump. You don't need to do anything for it. The `rowProcessingMode="manual"` you added is exactly what `useServerPagedGrid` will rely on internally — your prior PR set up the foundation for this hook.
- **Cross-worker contract for `apiRef`:** worker3 owns editor-side methods (`focusCell`, `startEdit`, `commitEdit`, `cancelEdit`, `getActiveCell`); you own server-side (`scrollToCell`); worker2 owns filter-side (`openFilter`, `closeFilter`). Coordinate via the public `BcGridApi` type — no shared internal state.

### Rules reminder

- Don't run Playwright / smoke-perf / perf / broad benchmarks.
- Open PR; do not merge your own.
- Update `docs/queue.md` `[draft]` → `[in-flight: worker1]` → `[review: worker1 #PR]` at state transitions.

---

## Standing lane scope

Server-backed grid stability and v0.4 server edit contracts. Specifically:

- `packages/server-row-model/`
- `packages/react/` server-grid bindings (server grid component, server row caching, optimistic edit flow)
- Perf posture (virtualizer steady-state under churn)

You do **NOT** own: editors, filters, aggregations, theming, chrome polish. Don't refactor adjacent code while you're here.

## Worker rules (recap — full rules in `docs/AGENTS.md`)

- Branch off `main`. Never commit to `main`.
- Branch name: `agent/worker1/<task-slug>`.
- Run `bun run type-check`, `bun run lint`, focused unit tests.
- Do **NOT** run Playwright, smoke-perf, perf, or broad benchmarks. Coordinator owns those.
- Open PR against `main`. Do not merge your own PR.
- Update `docs/queue.md` at state transitions.

## Recent activity baseline

- v0.3.0 shipped (88398c6).
- Server grid hardening already on main: PR #343 (paged edit contracts), PR #327 (flicker boundary), PR #344 (server row query contracts).
- v0.4 chrome polish from #349 is the current visible UI baseline.

## When you finish the active task

1. Push the findings doc as a PR (single doc, no source changes).
2. Comment on the PR tagging the coordinator.
3. Wait for the next handoff update before starting new work.
