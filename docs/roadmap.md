# bc-grid Roadmap — 2-Year Plan

**Goal:** by month 24, ship a 1.0 release that's a credible AG Grid Enterprise replacement for ~80-90% of ERP-class use cases.

This document is the rolling phase plan. Updated at end of each quarter with retrospective + next-quarter scope.

---

## Q1 — Foundation (months 1-3)

**Goal:** prove the architecture. No feature work until perf bars hit.

### Milestones

- M1.1 — `docs/design-v1.md` completed and reviewed (week 1)
- M1.2 — Virtualization perf spike: 100k rows × 30 cols at 60fps scroll (week 2-3)
- M1.3 — Animation perf spike: 1000-row sort transition at 60fps (week 3-4)
- M1.4 — CI infrastructure live: type-check, lint, test, perf benchmarks, API surface diff (week 2-4, parallel)
- M1.5 — Package skeletons (`core`, `virtualizer`, `animations`, `theming`, `react`) with empty exports (week 5)
- M1.6 — Foundation packages implemented to spec (week 5-10)
- M1.7 — Read-only `<BcGrid>` feature-complete (week 10-12): sort, filter, search, paginate (client+server), group-by, expand/collapse, column resize/reorder/pin/visibility, theming
- M1.8 — `docs/api.md` v0.1 frozen at end of Q1
- M1.9 — Q1 retrospective + Q2 plan (week 12)

### Deliverable

bc-grid v0.1 — credible read-only grid. Could replace bc-next's DataTable + read-only DataGrid use cases. Shadcn-styled. Published to private registry.

### Quality bars (gates for advancing to Q2)

- All bars in `design-v1.md §3.2` met
- Test coverage gates met
- API surface reviewed by architect + 2 fresh agents
- Documentation site at `apps/docs/` live with API reference

### Agent allocation

Maximum 4 agents. Architect-led, mostly serial. See `PARALLEL_WORK.md §3` Q1 split.

---

## Q2 — Editing + Cell Editors (months 4-6)

**Goal:** in-grid editing matching Excel feel.

### Milestones

- M2.1 — Cell-edit lifecycle protocol (`design/editing.md` reviewed) (week 1)
- M2.2 — Keyboard nav state machine (week 2-4)
- M2.3 — Editor framework (`react/editor.tsx`) (week 3-4)
- M2.4 — Built-in editors: text, number, date, datetime, select, multi-select, autocomplete (parallel work, weeks 5-8)
- M2.5 — Validation framework + dirty tracking (week 6-8)
- M2.6 — Server-commit hooks + optimistic UI patterns (week 8-9)
- M2.7 — `<BcEditGrid>` complete (week 9-10)
- M2.8 — End-to-end edit tests in Playwright (week 10-12)

### Deliverable

bc-grid v0.2 — full edit grid. Replaces bc-next's edit-grid + server-edit-grid use cases.

### Agent allocation

5 parallel agents. See `PARALLEL_WORK.md §3` Q2 split.

---

## Q3 — Range Selection + Clipboard + Master-Detail (months 7-9)

**Goal:** Excel-feel achieved.

### Milestones

- M3.1 — Range selection model (`design/range.md`) (week 1)
- M3.2 — Range selection state machine (week 2-4)
- M3.3 — Clipboard: copy (TSV, HTML), paste-from-Excel, paste-from-bc-grid round-trip (week 3-6)
- M3.4 — Fill handle + drag-extend (week 6-7)
- M3.5 — Visual selection layer (week 4-7)
- M3.6 — Master-detail rows (parallel from week 5) (week 5-9)
- M3.7 — Column groups (multi-row headers) (parallel from week 7) (week 7-9)

### Deliverable

bc-grid v0.3 — Excel-feel grid. The editing experience now matches AG Grid.

### Agent allocation

5 parallel agents. See `PARALLEL_WORK.md §3` Q3 split.

---

## Q4 — Server-Side Row Model + Tree (months 10-12)

**Goal:** AG Grid SSRM equivalent.

### Milestones

- M4.1 — Server row model design (`design/server-row-model.md`) (week 1)
- M4.2 — Server-paged mode (mostly hooks + adapter) (week 1-2)
- M4.3 — Infinite scroll mode: block fetcher, cache, LRU eviction (week 2-6)
- M4.4 — Server-tree mode: lazy children (week 5-9)
- M4.5 — Server-side sort/filter/group orchestration (week 6-10)
- M4.6 — Performance tuning under load (10k+ visible rows) (week 9-12)
- M4.7 — Documentation + migration guide for AG Grid SSRM users (week 11-12)

### Deliverable

**bc-grid v1.0-rc1.** End of Y1. Beta program starts. Internal dogfood (the new bc-next) cuts over.

### Agent allocation

5 parallel agents. See `PARALLEL_WORK.md §3` Q4 split.

---

## Q5 — Aggregations + Pivots (months 13-15)

**Goal:** numeric reporting features.

### Milestones

- M5.1 — Aggregation framework (week 1-2)
- M5.2 — Built-in aggregations: sum, count, avg, min, max, custom (week 2-4 parallel)
- M5.3 — Pivot table architecture (`design/pivots.md`) (week 1-3)
- M5.4 — Pivot UI: drag-to-pivot, row-groups + col-groups + values (week 4-12)
- M5.5 — Aggregation visualisation in non-pivot grouped mode (week 6-9)

### Deliverable

bc-grid v1.1 — pivot tables.

---

## Q6 — Filters + Toolbars + Exports (months 16-18)

**Goal:** advanced filter UIs and data export.

### Milestones

- M6.1 — Filter framework (week 1-2)
- M6.2 — Built-in filters: set, multi, date-range, number-range, text, custom (parallel weeks 2-7)
- M6.3 — Filter persistence (URL state, localStorage) (week 5-7)
- M6.4 — Status bar + footer aggregations (week 4-6 parallel)
- M6.5 — Sidebar (column tool panel) (week 6-9)
- M6.6 — Context menu (week 4-6)
- M6.7 — CSV export (week 4)
- M6.8 — Excel export (via ExcelJS) (week 5-7)
- M6.9 — PDF export (via jsPDF or react-pdf) (week 7-9)

### Deliverable

bc-grid v1.2 — advanced filters + exports + chrome.

---

## Q7 — Polish + Animations + a11y (months 19-21)

**Goal:** the polish that separates a 1.0 from a 0.9.

### Milestones

- M7.1 — Animation polish: every transition reviewed and tuned (week 1-6)
- M7.2 — Accessibility audit (WCAG 2.1 AA): every interaction keyboard-navigable, full ARIA, screen-reader testing (week 2-8)
- M7.3 — Streaming row updates (server pushes new rows mid-session, animated insertion) (week 4-8)
- M7.4 — Performance tuning pass (perf budget tight) (week 6-12)
- M7.5 — Browser compat: full matrix passes (week 8-10)
- M7.6 — Mobile/touch fallback (week 9-12)

### Deliverable

bc-grid v1.3 — polished and accessible.

---

## Q8 — Beta + 1.0 launch (months 22-24)

**Goal:** ship 1.0.

### Milestones

- M8.1 — Beta cohort onboarded (5-10 customers) (week 1-2)
- M8.2 — Beta feedback loop: weekly issues triage, bi-weekly releases (weeks 1-10)
- M8.3 — Migration guides finalized (from AG Grid Community/Enterprise, ReactDataGrid, MaterialReactTable) (week 4-8)
- M8.4 — Documentation site polished (apps/docs deployed) (week 4-10)
- M8.5 — Pricing/licence model decision (week 8-11) [JohnC]
- M8.6 — 1.0 launch (week 12)

### Deliverable

**bc-grid 1.0.** Public release. Deployed to bc-grid.dev (or chosen domain). Public registry publish (npm or private).

---

## Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Virtualization spike misses 60fps target | Medium | High | Q1 spike happens BEFORE feature work; if it misses, we redesign the architecture, not the code |
| TanStack Table v9 breaking change | Low | Medium | Adapter layer; lock to v8 |
| Animation system can't hit 60fps for complex transitions | Medium | High | Animation spike in Q1; if Web Animations API can't, evaluate Motion One or canvas-based |
| Public API needs breaking change post-Q1 | Medium | Medium | API spec frozen end of Q1; breaking changes require version bump + migration guide |
| Beta cohort doesn't materialise | Medium | Medium | Internal dogfood (bc-next) is the primary user; external beta is a bonus |
| Agent coordination breaks down | Low | High | Worktree scheme + queue.md + strict module boundaries; warning signs in `PARALLEL_WORK.md §8` |
| Multi-account agent infrastructure has cost overrun | Low | Low | Track agent-hours per task; review monthly |
| Charts integration becomes a blocker | Low | Low | Charts are out of scope for 1.0; defer to 1.x |
| AG Grid changes their licence to disadvantage open competitors | N/A | Low | We're not bound by their licence; our adoption is independent |

---

## Definition of Done — 1.0

- All Q1-Q8 milestones complete
- All performance bars met (and CI-enforced)
- 90% test coverage on `core`, 85% on engine packages, 75% on `react`, 70% on feature packages
- WCAG 2.1 AA accessibility passes
- 5+ beta customers in production
- Migration guides from AG Grid (Community + Enterprise) tested by 2+ users
- Documentation site publicly accessible
- Licence model finalized
- Public registry publish
- Launch announcement
