# Worker1 Audit Brief — Server Grid + Perf Posture

**Auditor:** worker1 (Claude in `~/work/bcg-worker1`)
**Date assigned:** 2026-05-02
**Read first:** `docs/coordination/audit-2026-05/README.md` (rules, severity, output template)
**Output:** `docs/coordination/audit-2026-05/worker1-findings.md`
**Branch:** `agent/worker1/audit-2026-05`

## The question to answer

Would a 50,000-row paged ERP grid feel **boring/instant** under realistic churn (sort, filter, search, edit-commit-refetch, optimistic mutation, page jump, column resize while loading)?

If yes — say so and give the evidence. If no — name the specific code paths that introduce jank, jitter, stale data, or surprise.

## Lane scope (what to audit)

- `packages/server-row-model/` — entire package
- `packages/react/` — server-grid components and hooks (the server-grid binding — find it via the public exports of `@bc-grid/react`)
- `packages/virtualizer/` — *only* the integration surface used by the server grid. Not a full virtualizer review.
- Perf posture — render cost, render frequency, memo discipline, scroll/resize handler budgets in steady-state

## Specific things to look at

1. **Stale response handling.** When a sort changes mid-fetch, does the late response get applied (ghost data) or rejected? Trace the request-id flow.
2. **Page reset semantics.** When filter changes, does scroll reset to top? Does selection survive? Does focus survive?
3. **Optimistic mutations.** Edit commits → server roundtrip. What does the user see during the in-flight window? What happens on server reject? Is rollback animated or jarring?
4. **Visible-column query payloads.** Does the server query include only visible columns, all columns, or arbitrary columns? Is there a contract test?
5. **Page window / row cache eviction.** What's the cache strategy? When the user scrolls fast, are blocks evicted aggressively or hoarded?
6. **Refresh flicker.** PR #327 pinned a flicker boundary — is the boundary still tight, or has it drifted since v0.3.0?
7. **Error/retry surface.** What does the user see on network failure? Is it a banner, an inline state, or silent?
8. **Test depth.** Count contract tests vs unit tests. Where are the gaps? Specifically: is there a test for "sort changes during fetch"? "Edit commits during refetch"?
9. **Perf in steady state.** With a 50k-row dataset and active sort/filter, what's the render cost per scroll tick? Use the in-package benchmarks if any exist; otherwise reason from code (allocations per cell, memo deps, etc.).

## Comparison lens (public docs + behavior only)

- **AG Grid Server-Side Row Model** docs (public): [https://www.ag-grid.com/react-data-grid/server-side-model/](https://www.ag-grid.com/react-data-grid/server-side-model/) — what guarantees do they advertise around stale responses, partial loads, refresh?
- **NetSuite saved searches** — observable paging behavior, scroll back to top vs persistent position
- **Salesforce LWC `lightning-datatable`** with `loadMore` — public behavior around server pagination
- **Excel/Google Sheets** — gold standard for "feels instant" — what do they do that we don't?

## What to deliberately skip

- Filter popup UX (worker2)
- Editor keyboard / validation (worker3)
- Theming / chrome polish across the app (worker2 + coordinator)
- Public API ergonomics (coordinator)

## Output

Single file at `docs/coordination/audit-2026-05/worker1-findings.md`, following the template in `audit-2026-05/README.md`.

When the file exists with at least the executive summary + P0 + P1 sections, push the branch, open the PR, comment tagging the coordinator, then stop.
