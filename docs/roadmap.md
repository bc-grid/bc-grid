# bc-grid Roadmap — 2-Week Sprint to v1.0

**Goal (revised 2026-04-29, updated for 5 workers on 2026-04-30):** ship a 1.0 release with **functional parity with AG Grid Enterprise for ERP workloads** over a **2-week parallel sprint with 5 worker agents plus a Codex coordinator**, leveraging the agent velocity demonstrated on day 0.

> **Status — 2026-05-01:** original 2-year quarterly cadence below was compressed to a 2-week calendar after the day-0 vertical-slice gate (PR #42) demonstrated ~10-20% of the original 2-year scope shipped in a single day. Q5-Q7 ERP grid feature scope is pulled forward into the same sprint as Q2-Q4. Charts are not part of v1.0 and remain post-1.0. Current execution uses 5 clean worker worktrees (`worker1`-`worker5`) plus Codex in `~/work/bc-grid` as coordinator / PR reviewer / merge integrator / Playwright owner. **Active orchestration plan: `docs/coordination/v1-parity-sprint.md`** — read it before claiming Phase 6 work. **Alpha gate plan: `docs/coordination/v0.1-alpha-release-plan.md`**. The scope+timeline pivot is recorded in `design.md §13`.

The Q1-Q8 phase NAMES below are preserved as feature buckets / acceptance-criteria inventory. The **calendar** is rewritten in days. Many quarters now run in parallel (multiple tracks at once) per `coordination/v1-parity-sprint.md`'s 7-track structure.

---

## Q1 — Foundation + Vertical Slice (Day 0, DONE)

**Goal:** prove the architecture by running ONE real bc-next-shaped screen on bc-grid. Not "feature-complete read-only grid" — a hardened vertical slice.

### What landed

- Typed columns (`BcGridColumn<T>`) + row identity (`rowId` callback) ✓ #14
- Virtualized body (rows + columns, variable sizes, animations integrated) ✓ #20-#26 (six PRs)
- Pinned columns (left + right + top + bottom corners) ✓ #24, #33
- Keyboard focus model (cell-level, WAI-ARIA grid pattern) ✓ #28
- Single-column sort + FLIP animation ✓ #27
- Theming (CSS variables + Tailwind preset, light/dark, density modes) ✓ #15
- CI/perf gates wired (smoke + nightly benchmarks) ✓ #34, #38
- AR Customers ledger (5000 rows, full ERP shape) running entirely on bc-grid ✓ #42
- Live region announcements per `accessibility-rfc §Live Regions` ✓ #41
- Filter cell role corrected to `gridcell` per WAI-ARIA grid pattern ✓ #39
- API surface diff CI gate ✓ #34
- Q1 API reference docs page ✓ #35

### What's NOT in Q1 (moved to Q2-Q7 — see compressed calendar below)

- Multi-column sort UI / column reorder / visibility / state persistence
- Cell editing (Q2)
- Range selection (Q3)
- Server-side row model implementation (Q4 — RFC done in Q1)
- Aggregations + pivots (Q5)
- Filter framework + chrome + export (Q6)
- Streaming + mobile + WCAG deep-pass (Q7)

### Q1 Milestones (delivered Day 0)

| Original Week | Milestone | Status |
|---|---|---|
| 1 | M1.1 `docs/design.md` post-review | done |
| 1-2 | M1.2 `repo-foundation` | done (af249af) |
| 1-3 | M1.3 RFCs: api-rfc-v0, accessibility-rfc, server-query-rfc, ag-grid-poc-audit | done #1, #2, #3, #5 |
| 3-5 | M1.4 Spikes: virtualizer-spike-v2, animation-perf-spike, theme-spike | done #9, #10, #11 |
| 4-5 | M1.5 `core-types` | done #14 |
| 5-9 | M1.6 Foundation impls: virtualizer-impl, animations-impl, theming-impl | done #20-#24 + #15 + #16 |
| 9-11 | M1.7 `react-impl-v0` | done #25 |
| 10-11 | M1.8 `q1-sort` + `q1-keyboard-focus` | done #27, #28 |
| 11-12 | M1.9 `q1-vertical-slice-demo` | done #42 |
| 12 | M1.10 Q1 retrospective + Q2 plan; api.md v0.1 frozen | done (audit-c2-001 + sprint pivot) |

### Q1 Deliverable

bc-grid v0.1 — alpha that runs a real ERP-shaped screen end-to-end. Architecture proven on day 0. Perf bars met (60fps × 100k rows nightly). Accessibility model implemented + tested. Public API frozen.

### Quality bars (Q1 → Q2 gate — all met)

- Smoke perf bars in `design.md §3.2` met ✓
- API surface frozen at v0.1, audited (`audit-c2-001`) ✓
- Accessibility RFC implemented + e2e tested ✓
- AR Customers ledger demonstrably running ✓ (substitutes for "real bc-next screen"; bc-next-cutover task tracked separately)

### Agent allocation

Up to 4 agents on day 0. Mostly serial (architect + RFC authors first), then parallel (spikes, foundation impls, React grid). See `PARALLEL_WORK.md §3` Q1 split.

---

## Q2 — Editing + Read-Only Grid Features (Days 1-3)

**Goal:** in-grid editing matching Excel feel + the read-only features deferred from Q1.

### Milestones

- M2.1 — Cell-edit lifecycle protocol (`docs/design/editing-rfc.md`) — done #45 (day 0)
- M2.2 — Keyboard nav state machine (day 1)
- M2.3 — Editor framework in `@bc-grid/react` (day 1)
- M2.4 — Built-in editors (parallel): text, number, date, datetime, time, select, multi-select, autocomplete (days 1-2)
- M2.5 — Validation framework + dirty tracking (days 1-2)
- M2.6 — Server-commit hooks + optimistic UI (day 2)
- M2.7 — `<BcEditGrid>` complete (day 3)
- M2.8 — Q2 read-only catch-up: filter UIs (number/date/set/boolean), search, group-by, client + server pagination, column reorder/visibility/state persistence (parallel days 1-3)
- M2.9 — End-to-end edit tests in Playwright (day 3)

### Deliverable

bc-grid v0.2-internal — full edit grid + comprehensive read-only feature set. Replaces bc-next's edit-grid + server-edit-grid + data-table use cases.

---

## Q3 — Range Selection + Master-Detail (Days 4-6)

**Goal:** Excel-feel achieved.

### Milestones

- M3.1 — Range selection model (`docs/design/range-rfc.md`) — done #49 (day 0)
- M3.2 — Range state machine (day 4)
- M3.3 — Clipboard: copy (TSV, HTML, JSON), paste-from-Excel, lossless bc-grid round-trip (days 4-5)
- M3.4 — Fill handle + drag-extend (day 5)
- M3.5 — Visual selection layer (days 4-5)
- M3.6 — Master-detail rows (parallel, day 4-6)
- M3.7 — Column groups (multi-row headers) (parallel, day 5-6)

### Deliverable

bc-grid v0.3-internal — Excel-feel grid.

---

## Q4 — Server-Side Row Model + Tree (Days 5-8, parallel with Q3 latter half)

**Goal:** AG Grid SSRM equivalent. (Design landed Day 0 via `server-query-rfc`; implementation here.)

### Milestones

- M4.1 — Server-paged mode (in flight day 0 as #60; lands day 5)
- M4.2 — Infinite scroll mode: block fetcher, cache, LRU eviction (days 5-7)
- M4.3 — Server-tree mode: lazy children (days 6-8)
- M4.4 — Server-side sort/filter/group orchestration (days 6-8)
- M4.5 — Performance tuning under load (10k+ visible rows) (day 8)
- M4.6 — Documentation + migration guide for AG Grid SSRM users (day 8)

### Deliverable

**bc-grid v1.0-rc1.** End of Day 8. Beta program prep starts.

---

## Q5 — Aggregations + Pivots (Days 8-9)

### Milestones

- M5.1 — Aggregation framework (`@bc-grid/aggregations` engine) — RFC done #51 (day 0); impl day 8
- M5.2 — Built-in aggregations: sum, count, avg, min, max, custom (parallel within day 8)
- M5.3 — Pivot architecture — RFC done #52 (day 0); impl day 8-9
- M5.4 — Pivot UI: drag-to-pivot, row/col/values dimensions (day 9)
- M5.5 — Aggregation visualisation in non-pivot grouped mode (day 9)

bc-grid v1.0-rc2.

---

## Q6 — Filters + Toolbars + Exports (Days 9-11)

### Milestones

- M6.1 — Filter framework (`@bc-grid/filters` engine) — RFC done #48 (day 0); impl day 9
- M6.2 — Built-in filters: set (multi-select), date-range, number-range, text-extend, custom (parallel days 9-10)
- M6.3 — Filter persistence (URL state, localStorage) (day 10)
- M6.4 — Status bar + footer aggregations — RFC done #46 (day 0); impl day 10
- M6.5 — Sidebar (column tool panel + filter tool panel + pivot tool panel) (day 10-11)
- M6.6 — Context menu (day 10)
- M6.7 — CSV export (`@bc-grid/export`) (day 9)
- M6.8 — Excel export (via ExcelJS peer-dep) (days 10-11)
- M6.9 — PDF export (via jsPDF peer-dep) (days 10-11)

bc-grid v1.0-rc3.

---

## Q7 — Polish + Mobile + a11y deep-pass (Days 11-13)

### Milestones

- M7.1 — Animation polish: every transition reviewed and tuned (days 11-12)
- M7.2 — Accessibility deep-pass: full WCAG 2.1 AA audit + manual NVDA/JAWS/VoiceOver (days 11-13)
- M7.3 — Streaming row updates (`ServerRowUpdate` event handling + animated insertion via FLIP) (days 11-12)
- M7.4 — Performance tuning pass (days 12-13)
- M7.5 — Browser compat: full matrix passes (day 12)
- M7.6 — Mobile/touch fallback per `accessibility-rfc §Pointer and Touch Fallback` (days 12-13)
- M7.7 — Migration guide from AG Grid Community + Enterprise (day 13)

bc-grid v1.0-rc4 (final).

---

## Q8 — Beta + 1.0 launch (Days 13-14)

### Milestones

- M8.1 — Internal dogfood: bc-next-cutover (one real bc-next screen migrated to bc-grid) (day 13)
- M8.2 — Beta cohort onboarded (5-10 friendlies if external; otherwise internal-only beta) (day 13-14)
- M8.3 — Migration guides finalised (from AG Grid Community/Enterprise, ReactDataGrid, MaterialReactTable) (day 13)
- M8.4 — Documentation site polished (`apps/docs` deployed) (day 13)
- M8.5 — Pricing/licence model decision (day 14) [JohnC]
- M8.6 — 1.0 launch (day 14)

**bc-grid 1.0.**

---

## Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Virtualization spike misses 60fps target | Closed (proved on day 0 — 60fps × 100k×30 in nightly perf) | — | n/a |
| TanStack Table v9 breaking change | Low | Medium | Adapter layer; lock to v8 |
| Animation system can't hit 60fps for complex transitions | Closed (FLIP via Web Animations confirmed on day 0) | — | n/a |
| Accessibility model wrong | Closed (a11y RFC + impl + e2e tests on day 0) | — | n/a |
| Server-row-model contract wrong | Low | High | server-query RFC reviewed day 0; #60 paged impl in flight day 0 validates the wire shape early |
| Public API needs breaking change post-v0.1-alpha | Medium | Medium | API surface frozen via `tools/api-surface`; changes require manifest update + architect review |
| **Sprint compresses too far; quality slips on edge cases** | **Medium** | **Medium** | **Re-audit per ~10 merged PRs (audit-c2-NNN cadence); H/M findings block tag; L findings tolerable + documented** |
| Phase A merge conflicts cascade through Phase 6 React-layer work | Closed (#50 grid-tsx-file-split landed day 0) | — | n/a |
| 4 agents not enough; 8-agent provisioning fails to scale linearly | Medium | Low | Plan assumes 4 max-tier; agents can fan out further if needed |
| Beta cohort doesn't materialise | Low | Low | Internal dogfood (bc-next-cutover) is primary user; external beta is bonus |
| Agent coordination breaks down | Low | High | Worktree scheme + queue.md + strict module boundaries; warning signs in `PARALLEL_WORK.md §8` |
| Multi-account agent infrastructure cost overrun | Low | Low | Track agent-hours per task; sprint compresses cost overall |
| Bug-for-bug edge-case parity gap surfaces post-launch | High | Medium | Documented as continuous post-1.0 backlog; not a 1.0 gate |

---

## Definition of Done — 1.0

- All Q1-Q8 milestones complete
- All performance bars met (and CI-enforced) — both smoke and nightly
- 90% test coverage on `core`, 85% on engine packages, 75% on `react`, 70% on feature packages (per `design.md §14.1`)
- WCAG 2.1 AA accessibility passes (axe-core + manual NVDA/JAWS/VoiceOver)
- All H + M severity findings from audit-c2-NNN passes closed at tag time
- Internal dogfood (bc-next-cutover) running on bc-grid in production
- 5+ beta customers in production (target; soft gate — if external beta doesn't materialise, internal counts)
- Migration guides from AG Grid (Community + Enterprise) tested by 2+ users
- Documentation site publicly accessible
- Licence model finalised
- Public registry publish (or deferred per JohnC)
- Launch announcement

---

## How this roadmap stays current

- Each merged PR may close a milestone — the milestone's status updates in this file.
- New audit passes (`audit-c2-NNN.md`) may surface findings that adjust the risk register.
- Sprint-end retrospective rewrites the calendar based on what actually shipped vs estimated.
- The original 2-year quarterly cadence is preserved in this doc's git history; the active calendar above is the operational truth.

> See `docs/coordination/v1-parity-sprint.md` for the 7-track parallel-orchestration view of the same sprint.
> See `docs/coordination/v0.1-alpha-release-plan.md` for the v0.1-alpha gate (subset of v1.0; honest-surface release ahead of full parity).
