# v1 Parity Sprint — orchestration plan

**Owner:** c2 (auditor + coordinator)
**Decision date:** 2026-04-29
**Authorising:** JohnC
**Supersedes (timeline only):** `docs/roadmap.md` Q5-Q8 — feature scope from those quarters is pulled forward into this sprint; the original quarter-by-quarter calendar is replaced by the parallel-track plan below.
**Does NOT supersede:** `docs/AGENTS.md` golden rules, `docs/design.md` architectural decisions (§13), `docs/api.md` v0.1 surface, `docs/PARALLEL_WORK.md` worktree scheme. All still binding.

---

## Decision

**Old goal:** AG Grid Enterprise replacement for ~80-90% of ERP use cases over a 2-year, 8-quarter timeline.

**New goal:** Functional parity with AG Grid Enterprise for ERP workloads over a **2-week parallel sprint with 4 max-tier agents**, leveraging best-of-class agent velocity demonstrated on day 0 (Q1 vertical-slice gate cleared via #42).

### Why this is plausible

On day 0 (~5 hours of focused work), **13 substantive PRs** landed at sustained quality (q1-pinned-cols, api-surface-diff, docs-q1-content, row-selection, nightly-perf-harness, filter-cell-role fix, live-regions, audit, etc.) — sustained ~2 PRs/hour with three implementer agents + one auditor. That pace ships ~10-20% of the original 2-year scope on day 0.

**At 4 max-tier parallel agents × ~10 hours/day × 14 days, the budget is ~560 agent-hours.** The remaining v1.0 scope (Tracks 1-7) is roughly 50-80 impl PRs of 1-3 hours each plus integration / e2e / perf hardening — a comfortable fit if the RFCs land cleanly and the queue stays parallel-safe. Bug-for-bug parity with AG Grid's 7+ years of polish remains a post-sprint backlog.

**Target:** v1.0-rc1 by day 12; v1.0 tag by day 14.

---

## What's added vs the previous mission

### Genuinely new

- **Charts integration** (was explicit non-goal in `design.md §2`; revived as Track 7 with a peer-dep architecture — no library bundled)

### Pulled forward from Q5-Q7

- Aggregation framework + UI (was Q5)
- Pivots (was Q5)
- Status bar, sidebar/tool panels, context menu (was Q6)
- CSV/XLSX/PDF export (was Q6)
- Streaming row updates (was Q7)
- Mobile/touch fallback (was Q7)
- WCAG 2.1 AA deep pass (was Q7)
- Multi-column sort UI (was implicit; never explicitly scoped)

### Pulled forward / kept from Q2-Q4

- In-grid editing + 7 built-in editors + validation framework (Q2)
- Q2 read-only catch-up: filter UIs, search, group-by, pagination, column reorder/visibility/state (Q2)
- Range selection + clipboard + fill handle + master-detail + column groups (Q3)
- Server row model: paged + infinite + tree + mutation + invalidation (Q4)

---

## What stays binding

- Engine vs React split (`design.md §4.1`)
- No AG Grid source code (`AGENTS.md §3.2`)
- TypeScript strict, no `any` outside the TanStack adapter (`AGENTS.md §3.5`)
- Public API frozen at v0.1 (`api.md`); manifest in `tools/api-surface/src/manifest.ts` is the binding contract
- Kebab-case CSS, JS-driven pinned cells, Fenwick offsets, in-flight retention, `aria-activedescendant` focus model, single-tab-stop (`design.md §13`)
- Perf bars from `design.md §3.2` (smoke + nightly)
- WCAG 2.1 AA target; `accessibility-rfc` ARIA contracts
- AGENTS.md branch claim + queue protocol; `[ready]` → `[in-flight: <agent>]` → `[review: <agent> #N]` → `[done: <agent> #N]`
- No autonomous merges to `main` (`AGENTS.md §3.7`)
- One owner per task; if two agents claim the same task, second backs off (`AGENTS.md §3.8`)
- Coverage gates per `design.md §14.1`

---

## What's NOT in this sprint (post-1.0 backlog)

- Right-to-left languages (`design.md §2` non-goal; needs separate engine work)
- Spreadsheet-class formula editing (deferred indefinitely; bc-grid is a data grid, not a spreadsheet)
- Bug-for-bug AG Grid edge-case parity (we ship feature parity, not test-suite parity)
- Mobile-first (touch fallback yes, mobile-first interaction redesign no)
- Charts authoring UI (just rendering — peer-dep integration in Track 7)
- AG Grid Community/Enterprise migration tooling (v1.x deliverable; the migration guide is in this sprint, the codemod is not)

---

## Phase A — Q1.5 hardening (parallel-safe with Phase B once `grid-tsx-file-split` lands)

**Critical-path rule:** `grid-tsx-file-split` is the **single true blocker** for Phase B implementation work that touches `packages/react/src/grid.tsx`. One agent owns it; everyone else avoids that file until it merges. Once split, Phase A + Phase B implementation tasks run **fully in parallel**.

**RFC drafting is unconditional.** c2 (RFC author) and any reviewers can draft / review / iterate on Phase B RFCs (`editing-rfc`, `range-rfc`, etc.) at any time, regardless of Phase A status. RFCs are doc-only and don't touch `grid.tsx`. This is by design — the long pole on Track 1 is the editor framework, which can't start until both `grid-tsx-file-split` AND `editing-rfc` land. Get both in flight ASAP.

**Implementation tasks** in Phase B (e.g., `editor-framework`, `server-paged-impl`, `status-bar-impl`, `tool-panel-columns`) are claimable only after their explicit `[blocked: …]` deps clear. The `[ready]` tag in `docs/queue.md` is the source of truth.

Phase A tasks list (see `docs/queue.md` Phase 5.5 for status entries):

| Task | Effort | Dependencies | Why |
|---|---|---|---|
| `grid-tsx-file-split` | M | none — first | Unblocks parallel work on the React layer |
| `q1-vertical-slice-demo` | M | none — already `[ready]` | Q1 architecture-soundness gate (`docs/queue.md §Phase 5`) |
| `screenreader-spot-check` | S/engine | none — already `[ready]` | Q1 acceptance criterion (`accessibility-rfc §Acceptance Criteria`) |
| `bundle-size-ci-gate` | S | none | `design.md §3.2` smoke bar — currently unenforced |
| `smoke-perf-ci` | M | bundle-size-ci-gate ideally | Cold mount, sort 10k, scroll 10k — currently uncovered |
| `multi-column-sort-ui` | XS | grid-tsx-file-split | Sort state shape already supports it (`api.md §3.2`); just header UI |
| `tooltip-rendering` | S | grid-tsx-file-split | `BcGridColumn.tooltip` typed in api.md, not wired |
| `localstorage-gridid-persistence` | S | none | `api.md §3.3` declares it; not implemented |
| `search-highlighting` | S | grid-tsx-file-split | `BcCellRendererParams.searchText` exists; no default highlight render |
| `selection-checkbox-column` | S | grid-tsx-file-split | UX nicety; pairs with row-selection (#37) |
| `aria-disabled-rows` | XS | grid-tsx-file-split | `accessibility-rfc §VirtualRowA11yMeta.disabled` flag |
| `row-select-keyboard` | S | grid-tsx-file-split | Space to toggle focused row (non-Q3-reserved) |
| `number-filter-ui` | S | grid-tsx-file-split | Q2-reserved → pulled forward; cheap |
| `date-filter-ui` | S | grid-tsx-file-split | Q2-reserved → pulled forward |
| `set-filter-ui` | M | filter-registry-rfc | Multi-select; pulls from distinct values |
| `boolean-filter-ui` | XS | grid-tsx-file-split | Q2-reserved → pulled forward |

**Phase A health metrics (not blocking gates beyond `grid-tsx-file-split`):**
- `grid.tsx` split into ≤6 files of ≤400 lines each → unblocks parallel Phase B work on the React layer (binding).
- CI runs smoke perf + bundle size on every PR → keeps quality bars enforced as Phase B lands (strongly recommended; catches regressions early).
- Q1 vertical-slice gate is **already cleared** as of PR #42 (AR Customers ledger, 5000 rows, full ERP shape, in `apps/examples`). A real bc-next integration cutover is a separate follow-up task (`bc-next-cutover`, post-1.0 by default), not a Phase A gate.
- Tooltip / persistence / filter-UI items are independent and can land any time.

---

## Phase B — Seven parallel feature tracks

Each track has one suggested owner; agents are free to swap based on availability. Tracks are scoped so within-track work is mostly serial (RFC → framework → leaves) and across-track work is mostly parallel.

### Track 1 — Editing (Q2 surface)
**Suggested owner:** c1
**Critical path:** editing-rfc → editor-framework → 7 editors in parallel → validation → bc-edit-grid-complete
**Tasks:**
- `editing-rfc` (RFC; c2 to author)
- `editor-framework` (impl; consumes the RFC)
- `editor-text`, `editor-number`, `editor-date`, `editor-datetime`, `editor-time`, `editor-select`, `editor-multi-select`, `editor-autocomplete` (parallel after framework lands)
- `validation-framework`
- `dirty-tracking` (per-row pending/error UI)
- `bc-edit-grid-complete` (composes all of the above)

### Track 2 — Range selection + master-detail + column groups (Q3 surface)
**Suggested owner:** c1 or x1 after Track 1's framework lands
**Critical path:** range-rfc → range-state-machine → visual-selection-layer → clipboard → fill-handle
**Tasks:**
- `range-rfc` (RFC; c2 to author)
- `range-state-machine`
- `visual-selection-layer` (absolute-positioned overlay)
- `clipboard-copy-tsv-html`
- `clipboard-paste-from-excel` (with per-cell validation, atomic apply)
- `fill-handle` (drag-extend; linear/copy/smart-fill)
- `master-detail` (parallel)
- `column-groups-multi-row-headers` (parallel)
- `sticky-header-polish` (parallel)

### Track 3 — Server row model (Q4 surface)
**Suggested owner:** x2
**Critical path:** server-paged-impl → infinite-mode-block-cache → server-tree-mode → mutation/invalidation
**Tasks:**
- `server-paged-impl` (`server-query-rfc` already designed; this is the implementation)
- `infinite-mode-block-cache` (LRU eviction, `ServerCacheBlock` lifecycle)
- `server-tree-mode` (lazy children)
- `mutation-pipeline` (`ServerRowPatch` apply, optimistic UI)
- `invalidation-impl` (`ServerInvalidation` scopes)
- `server-row-model-perf-tuning` (10k+ visible rows)

### Track 4 — Aggregations + Pivots (Q5 surface, pulled forward)
**Suggested owner:** x2 (after Track 3) or a fresh agent
**Critical path:** aggregation-rfc → aggregation-engine → pivot-rfc → pivot-engine → pivot-ui
**Tasks:**
- `aggregation-rfc` (RFC; c2 to author)
- `aggregation-engine` (`@bc-grid/aggregations` — sum/count/avg/min/max + custom factory)
- `aggregation-react-adapter` (footer + group-row aggregation rendering)
- `pivot-rfc` (RFC; c2 to author after aggregation-rfc)
- `pivot-engine` (engine layer, computes pivot table from rows + dimensions)
- `pivot-ui-drag-zones` (row-groups, col-groups, values dimension boxes)
- `pivot-row-col-groups` (rendering pivoted output)

### Track 5 — Chrome (Q6 surface, pulled forward)
**Suggested owner:** x3 (composition-heavy work; fits docs/example agent)
**Critical path:** chrome-rfc → status-bar + sidebar + context-menu (parallel after RFC)
**Tasks:**
- `chrome-rfc` (RFC; c2 to author — covers status-bar, sidebar, context-menu slot patterns)
- `status-bar-impl` (footer slot with built-in: row count, selected count, aggregation row)
- `sidebar-impl` (right-edge collapsible panel + tool panel framework)
- `tool-panel-columns` (drag-to-reorder, show/hide, group-by drop zone)
- `tool-panel-filters` (live filter editing across all columns)
- `context-menu-impl` (right-click; extension via consumer-supplied items)

### Track 6 — Filters + Export (Q6 surface, pulled forward)
**Suggested owner:** x1 (already on infra/perf patterns)
**Critical path:** filter-registry-rfc → filter UIs in parallel; export tasks fully parallel
**Tasks:**
- `filter-registry-rfc` (RFC; c2 to author — extends `BcFilterDefinition`/`BcReactFilterDefinition`)
- `filter-set-impl`, `filter-multi-impl`, `filter-date-range-impl`, `filter-number-range-impl` (parallel)
- `filter-text-impl-extend` (case-sensitivity, regex toggle, contains/starts/ends/equals operators)
- `filter-custom-extension-example` (recipe doc + tests)
- `filter-persistence` (URL state + localStorage backends)
- `export-csv-impl` (`@bc-grid/export` is currently a stub; add `toCsv`)
- `export-xlsx-impl` (peer-dep on ExcelJS — confirm before bundling)
- `export-pdf-impl` (peer-dep on jsPDF or react-pdf — confirm)
- `export-server-mode` (`ServerExportQuery` → server emits blob/url/job)

### Track 7 — Polish + Charts (NEW) + Mobile (Q7 surface)
**Suggested owner:** x1 (after Track 6 export work) or a rotating reviewer
**Critical path:** charts-rfc → charts-peer-dep-integration; rest fully parallel
**Tasks:**
- `charts-rfc` (RFC; c2 to author — peer-dep evaluation: recharts vs echarts vs visx)
- `charts-peer-dep-integration` (no library bundled; consumer brings their own)
- `streaming-row-updates` (server pushes new rows mid-session; animated insertion via FLIP)
- `mobile-touch-fallback` (44px hit targets, double-tap-to-edit, long-press context menu)
- `wcag-deep-pass` (axe-core full audit on every demo; manual NVDA/JAWS/VoiceOver runs)
- `animation-polish` (every transition reviewed and tuned; 60fps confirmed)
- `browser-compat-matrix` (full Chromium/FF/WebKit/Safari/Edge pass)
- `migration-guide` (from AG Grid Community + Enterprise; documented patterns, no codemod)

---

## Cross-cutting concerns (continuous, not per-track)

- **Reviews** — every PR gets a non-author review. c2 is default reviewer; agents rotate as backup. Self-merge prohibited per `AGENTS.md §3.7`.
- **Smoke perf on every PR** — once `smoke-perf-ci` lands in Phase A, every PR runs cold-mount/sort-10k/scroll-10k locally + in CI.
- **Bundle size budget** — `core+virtualizer+animations+react` < 60KB gzipped per `design.md §3.2`. Once `bundle-size-ci-gate` lands, drift fails the build.
- **API surface manifest** — every public-export change bumps `tools/api-surface/src/manifest.ts` in the same PR. Already enforced.
- **Decision log discipline** — every cross-cutting decision gets a `design.md §13` entry in the PR that introduces it, not after the fact.
- **`docs/queue.md` hygiene** — claim transitions: `[ready]` → `[in-flight: <agent>]` (when branch created) → `[review: <agent> #N]` (when PR opened) → `[done: <agent> #N]` (when merged). Each transition lands in a commit on the branch making the change. c2 audits drift in periodic queue-sync PRs.
- **Audit cadence** — c2 runs an end-to-end audit every ~10 merged PRs (`docs/audit-c2-NNN.md`). Rolling.

---

## Suggested initial agent assignments

| Agent | Worktree | First task | Track |
|---|---|---|---|
| c1 | `bcg-worker2` | `grid-tsx-file-split` (Phase A blocker) → `q1-vertical-slice-demo` → Track 1 (editing) | 1 |
| x1 | `bcg-worker1` | `bundle-size-ci-gate` → `smoke-perf-ci` → Track 6 (filters/export) → Track 7 polish | 6 + 7 |
| x2 | `bcg-worker3` | `screenreader-spot-check` (S; warm up) → Track 3 (server-row-model) → Track 4 (aggregations + pivots) | 3 + 4 |
| x3 | (TBD) | Track 5 (chrome — status-bar, sidebar, context-menu) → migration-guide | 5 |
| c2 | `bcg-worker4` | RFC authoring (this PR queues 6 RFCs); review every incoming PR; integration testing | coordinator |

Agents free to swap. `docs/queue.md` is the source of truth.

---

## Quality bars (gates for v1.0-RC)

Same as `docs/roadmap.md §Definition of Done` plus:

- All Phase A items merged
- All seven Phase B tracks have their critical-path RFC + framework + at least one consumer task merged
- Smoke perf bars met on every per-PR run for 5+ consecutive merges
- Bundle size budget < 60KB gzipped on every per-PR run
- `q1-vertical-slice-demo` cleared via the AR Customers ledger demo in `apps/examples` (PR #42); a `bc-next-cutover` follow-up replaces this gate post-1.0
- `audit-c2-NNN.md` clean of severity-H findings; severity-M findings have follow-up PRs filed

---

## Risk register (additions to `roadmap.md §Risk register`)

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `grid.tsx` merge conflicts cascade | High | High | `grid-tsx-file-split` is Phase A's first task; one agent owns it; everyone else waits |
| Charts library choice locks us in | Medium | Medium | Peer-dep approach decoupled by an adapter layer; consumer brings their own; we ship 2-3 worked examples |
| Pivot UI complexity blows scope | High | Medium | RFC scoped tightly; v1 ships drag-to-pivot + values+rows+cols; advanced (totals, sub-totals, format) follow-up |
| Server-row-model perf under load | Medium | High | `server-row-model-perf-tuning` task explicitly scoped; uses `nightly-perf-harness` pattern |
| WCAG audit reveals systemic issues | Low | High | Foundation already covers single-tab-stop + `aria-activedescendant` + live regions; deep-pass should be polish |
| Editor framework rework after first 2-3 editors | Medium | Medium | RFC reviewed by 2 agents before framework PR; first 2 editors in same PR train as framework |

---

## How this doc gets updated

- Authored by c2 in PR #43 (this PR).
- Edits land via PRs; c2 reviews coordination changes.
- Per-track milestones added inline as they ship — at each track's "framework lands" moment.
- Audit findings get linked here under the relevant track.
- Sprint-end retrospective amends this doc with what worked / didn't.
