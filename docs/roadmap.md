# bc-grid Roadmap — 2-Year Plan

**Goal:** by month 24, ship a 1.0 release that's a credible AG Grid Enterprise replacement for ~80-90% of ERP-class use cases.

This document is the rolling phase plan. Updated at end of each quarter with retrospective + next-quarter scope.

---

## Q1 — Foundation + Vertical Slice (months 1-3)

**Goal:** prove the architecture by running ONE real bc-next screen on bc-grid. Not "feature-complete read-only grid" — a hardened vertical slice.

### What's in Q1

- Typed columns (`BcGridColumn<T>`) + row identity (`rowId` callback)
- Virtualized body (rows + columns, variable sizes, animations integrated)
- Pinned columns (left + right)
- Keyboard focus model (cell-level, with WAI-ARIA grid pattern)
- Basic sort (single-column, with row animation on change)
- Theming (CSS variables + Tailwind preset, light/dark, density modes)
- CI/perf gates wired (smoke benchmarks on every PR)
- One bc-next screen (e.g. AR Customers list) running entirely on bc-grid

### What's NOT in Q1 (moved to Q2+)

- Filter / search / group-by / pagination (server or client)
- Column resize / reorder / visibility / state persistence
- Cell editing (Q2 deliverable)
- Range selection (Q3)
- Server-side row model (Q4 implementation; Q1 RFC only)

### Q1 Milestones

| Week | Milestone |
|---|---|
| 1 | M1.1 — `docs/design.md` revised post-review (done) |
| 1-2 | M1.2 — `repo-foundation` task: deps, tsconfigs, build, dist exports, lockfile, smoke CI |
| 1-3 | M1.3 — RFCs land: `api-rfc-v0`, `accessibility-rfc`, `server-query-rfc`, `ag-grid-poc-audit` |
| 3-5 | M1.4 — Spikes: `virtualizer-spike-v2` (with pinned cols, variable sizes, focus retention, scroll-to-cell), `animation-perf-spike`, `theme-spike` |
| 4-5 | M1.5 — `core-types` lands (the public types from `api-rfc-v0` made real) |
| 5-9 | M1.6 — Foundation impls: `virtualizer-impl`, `animations-impl`, `theming-impl` |
| 9-11 | M1.7 — `react-impl-v0` — minimal `<BcGrid>` integrating foundation |
| 10-11 | M1.8 — `q1-sort` + `q1-keyboard-focus` |
| 11-12 | M1.9 — `q1-vertical-slice-demo` — one bc-next screen rebuilt on bc-grid |
| 12 | M1.10 — Q1 retrospective + Q2 plan; `docs/api.md` v0.1 frozen |

### Deliverable

bc-grid v0.1 — alpha that runs one real bc-next screen end-to-end on the new architecture. Proves perf bars, accessibility model, theming, and the public API are sound.

### Quality bars (gates for advancing to Q2)

- All smoke perf bars in `design.md §3.2` met
- Test coverage gates met
- API surface frozen at v0.1, reviewed by architect + 2 fresh agents
- Accessibility RFC implemented (not just designed); a11y tests passing
- One bc-next screen demonstrably running on bc-grid

### Agent allocation

Up to 4 agents in Q1. The first 2 weeks are mostly serial (architect + RFC authors); spikes and infra can run in parallel from week 2; foundation impl + RFCs run in parallel from week 4. See `PARALLEL_WORK.md §3` Q1 split.

---

## Q2 — Editing + Read-Only Grid Features (months 4-6)

**Goal:** in-grid editing matching Excel feel + the read-only features deferred from Q1.

### Milestones

- M2.1 — Cell-edit lifecycle protocol (`docs/design/editing.md`) (week 1)
- M2.2 — Keyboard nav state machine (week 2-4)
- M2.3 — Editor framework in `@bc-grid/react` (week 3-4)
- M2.4 — Built-in editors (parallel): text, number, date, datetime, select, multi-select, autocomplete (weeks 5-8)
- M2.5 — Validation framework + dirty tracking (week 6-8)
- M2.6 — Server-commit hooks + optimistic UI patterns (week 8-9)
- M2.7 — `<BcEditGrid>` complete (week 9-10)
- M2.8 — Q2 read-only catch-up: filter, search, group-by, client + server pagination, column resize/reorder/visibility (parallel work, weeks 5-12)
- M2.9 — End-to-end edit tests in Playwright (week 10-12)

### Deliverable

bc-grid v0.2 — full edit grid + comprehensive read-only feature set. Replaces bc-next's edit-grid + server-edit-grid + data-table use cases.

---

## Q3 — Range Selection + Master-Detail (months 7-9)

**Goal:** Excel-feel achieved.

### Milestones

- M3.1 — Range selection model (`docs/design/range.md`) (week 1)
- M3.2 — Range selection state machine (week 2-4)
- M3.3 — Clipboard: copy (TSV, HTML), paste-from-Excel, paste-from-bc-grid round-trip (week 3-6)
- M3.4 — Fill handle + drag-extend (week 6-7)
- M3.5 — Visual selection layer (week 4-7)
- M3.6 — Master-detail rows (parallel from week 5) (week 5-9)
- M3.7 — Column groups (multi-row headers) (parallel from week 7) (week 7-9)

### Deliverable

bc-grid v0.3 — Excel-feel grid.

---

## Q4 — Server-Side Row Model + Tree (months 10-12)

**Goal:** AG Grid SSRM equivalent. (Design landed in Q1 via `server-query-rfc`; implementation here.)

### Milestones

- M4.1 — Server-paged mode (mostly hooks + adapter implementing the RFC) (week 1-2)
- M4.2 — Infinite scroll mode: block fetcher, cache, LRU eviction (week 2-6)
- M4.3 — Server-tree mode: lazy children (week 5-9)
- M4.4 — Server-side sort/filter/group orchestration (week 6-10)
- M4.5 — Performance tuning under load (10k+ visible rows) (week 9-12)
- M4.6 — Documentation + migration guide for AG Grid SSRM users (week 11-12)

### Deliverable

**bc-grid v1.0-rc1.** End of Y1. Beta program starts. Internal dogfood (the new bc-next) cuts over.

---

## Q5 — Aggregations + Pivots (months 13-15)

### Milestones

- M5.1 — Aggregation framework (`@bc-grid/aggregations` engine) (week 1-2)
- M5.2 — Built-in aggregations: sum, count, avg, min, max, custom (week 2-4 parallel)
- M5.3 — Pivot architecture (`docs/design/pivots.md`) — engine vs React split decided here (week 1-3)
- M5.4 — Pivot UI: drag-to-pivot, row-groups + col-groups + values (week 4-12)
- M5.5 — Aggregation visualisation in non-pivot grouped mode (week 6-9)

bc-grid v1.1.

---

## Q6 — Filters + Toolbars + Exports (months 16-18)

### Milestones

- M6.1 — Filter framework (`@bc-grid/filters` engine) (week 1-2)
- M6.2 — Built-in filters: set, multi, date-range, number-range, text, custom (parallel weeks 2-7)
- M6.3 — Filter persistence (URL state, localStorage) (week 5-7)
- M6.4 — Status bar + footer aggregations (week 4-6 parallel)
- M6.5 — Sidebar (column tool panel) (week 6-9)
- M6.6 — Context menu (week 4-6)
- M6.7 — CSV export (`@bc-grid/export`) (week 4)
- M6.8 — Excel export (via ExcelJS) (week 5-7)
- M6.9 — PDF export (via jsPDF or react-pdf) (week 7-9)

bc-grid v1.2.

---

## Q7 — Polish + Animations + a11y deep-pass (months 19-21)

### Milestones

- M7.1 — Animation polish: every transition reviewed and tuned (week 1-6)
- M7.2 — Accessibility deep-pass: full WCAG 2.1 AA audit, screen-reader testing (the foundational a11y work happens in Q1 — this is the polish pass) (week 2-8)
- M7.3 — Streaming row updates (server pushes new rows mid-session, animated insertion) (week 4-8)
- M7.4 — Performance tuning pass (perf budget tight) (week 6-12)
- M7.5 — Browser compat: full matrix passes (week 8-10)
- M7.6 — Mobile/touch fallback (week 9-12)

bc-grid v1.3.

---

## Q8 — Beta + 1.0 launch (months 22-24)

### Milestones

- M8.1 — Beta cohort onboarded (5-10 customers) (week 1-2)
- M8.2 — Beta feedback loop: weekly issues triage, bi-weekly releases (weeks 1-10)
- M8.3 — Migration guides finalized (from AG Grid Community/Enterprise, ReactDataGrid, MaterialReactTable) (week 4-8)
- M8.4 — Documentation site polished (apps/docs deployed) (week 4-10)
- M8.5 — Pricing/licence model decision (week 8-11) [JohnC]
- M8.6 — 1.0 launch (week 12)

**bc-grid 1.0.**

---

## Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Virtualization spike misses 60fps target | Medium | High | Q1 spike happens BEFORE feature work; if it misses, we redesign the architecture |
| TanStack Table v9 breaking change | Low | Medium | Adapter layer; lock to v8 |
| Animation system can't hit 60fps for complex transitions | Medium | High | Animation spike in Q1; if Web Animations API can't, evaluate Motion One or canvas-based |
| Accessibility model wrong | Low | High | a11y RFC happens in Q1 BEFORE virtualizer-impl; reviewed by fresh agent |
| Server-row-model contract wrong | Medium | High | Server-query RFC in Q1 (not Q4 with implementation); reviewed by fresh agent |
| Public API needs breaking change post-Q1 | Medium | Medium | API spec frozen end of Q1; breaking changes require version bump + migration guide |
| Beta cohort doesn't materialise | Medium | Medium | Internal dogfood (new bc-next) is the primary user; external beta is a bonus |
| Agent coordination breaks down | Low | High | Worktree scheme + queue.md + strict module boundaries; warning signs in `PARALLEL_WORK.md §8` |
| Multi-account agent infrastructure has cost overrun | Low | Low | Track agent-hours per task; review monthly |
| Charts integration becomes a blocker | Low | Low | Charts are out of scope for 1.0; defer to 1.x |

---

## Definition of Done — 1.0

- All Q1-Q8 milestones complete
- All performance bars met (and CI-enforced) — both smoke and nightly
- 90% test coverage on `core`, 85% on engine packages, 75% on `react`, 70% on feature packages
- WCAG 2.1 AA accessibility passes
- 5+ beta customers in production
- Migration guides from AG Grid (Community + Enterprise) tested by 2+ users
- Documentation site publicly accessible
- Licence model finalised
- Public registry publish
- Launch announcement
