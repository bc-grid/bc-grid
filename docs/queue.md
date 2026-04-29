# Work Queue

The single source of truth for "what's available to be picked up." Read `AGENTS.md §5` for how to claim work.

> **Active sprint — 2026-04-29:** `docs/coordination/v1-parity-sprint.md` is the orchestration plan. Phase A (Q1.5 hardening) tasks live below in `### Phase 5.5 — Q1.5 Hardening`. Phase B feature tracks live below in `### Phase 6 — v1.0 Parity Sprint` and land alongside their RFCs as those PRs ship. Read the sprint plan before claiming any Phase B work.

**Status legend:**
- `[ready]` — task spec written, no blockers, claim by editing this file + branching
- `[in-flight: <agent>]` — claimed; agent's branch open (set in same commit as branch creation per AGENTS.md §5)
- `[review: <agent> #PR]` — PR open, waiting on review (transition when PR opened)
- `[done: <agent> #PR]` — merged
- `[blocked: <agent> - <reason>]` — paused, waiting on something

**Update protocol:** edit this file via PR (or via the integrator's worktree if no integrator online). Always include task slug + assigned agent + PR or branch reference. Transition tags (`in-flight` → `review` → `done`) at the moment of state change, not in batches.

---

## Q1 — Foundation + Vertical Slice

### Phase 1 — Get the repo right (week 1, blocks everything)

- `[done]` **design** — write `docs/design.md` and revise post-Codex-review. **Architect**. Done.
- `[done: architect af249af]` **repo-foundation** — wire the repo to actually run. Add root devDeps (typescript, tsup or unbuild, vitest, biome or eslint), per-package `tsconfig.json` extending the base, project references for `tsc -b`, build scripts producing `dist/` with proper `exports` map per package, commit `bun.lock` (remove from `.gitignore`), CI smoke workflow (`.github/workflows/ci.yml`: type-check, lint, test on every PR). End state: `bun install && bun run type-check && bun run build && bun test` all green from a clean clone. **Effort**: 1-2 days.
- `[done: c1 #5]` **api-rfc-v0** — write the real public API spec to `docs/api.md`: `BcGridColumn<T>` (every property), row identity rules (`rowId` callback, server-row-id semantics), controlled/uncontrolled state pairs (sort, filter, expansion, selection, columns), event names + payload shapes (`onSortChanged`, `onFilterChanged`, `onCellEditCommit`, etc.), value pipeline (getter / formatter / parser / comparator), editor contract, server query objects (`ServerQuery`, `ServerBlockResult`, `ServerTreeQuery`), public export list per package. Spec only — no implementation. **Effort**: 3-5 days.

### Phase 2 — RFCs (weeks 1-3, parallel after Phase 1)

- `[done: x1 #1]` **accessibility-rfc** — write `docs/design/accessibility-rfc.md`: role choice (`grid` vs `treegrid`), `aria-rowcount` semantics (total dataset vs visible), `aria-rowindex` on partial sets, focus retention across virtualisation (when focused row scrolls out of viewport), pinned rows/cols + ARIA announce order, keyboard nav per WAI-ARIA grid pattern. Reviewer: fresh agent. Blocks: `virtualizer-impl`, `react-impl-v0`. **Effort**: 3-4 days.
- `[done: x1 #2]` **server-query-rfc** — write `docs/design/server-query-rfc.md`: typed query/filter/sort/group/load protocol. Block fetching, cache, eviction, optimistic edits, partial reloads, selection across unloaded rows, export-of-server-data semantics. Implementation lands Q4; this is the contract. Reviewer: fresh agent. **Effort**: 3-5 days.
- `[done: c1 #3]` **ag-grid-poc-audit** — list every AG Grid feature actually used in the bc-next POC. Walk every `data-grid.tsx` / `edit-grid.tsx` / `server-edit-grid.tsx` consumer; enumerate every prop / callback / column property / API call. Output: a feature inventory in `docs/design/ag-grid-poc-audit.md` so bc-grid doesn't become a generic AG Grid clone — it's targeted at exactly what bc-next needs. **Effort**: 1-2 days.

### Phase 3 — Spikes (weeks 3-5, after RFCs reviewed)

- `[done: c1 #9]` **virtualizer-spike-v2** — minimal virtualizer that scrolls 100k rows × 30 cols at 60fps. Pinned columns, variable row heights, focus retention with a max 2-row retention budget, scroll-to-cell API, active-cell visibility query, `aria-rowindex` / `aria-rowcount` per the a11y RFC. Pure DOM. NVDA + VoiceOver spot-check deferred to `screenreader-spot-check` task below. **Branch**: `agent/c1/virtualizer-spike-v2` (merged). **Effort**: 1-2 weeks.
- `[done: x1 #11]` **animation-perf-spike** — 1000 rows; click sort; rows animate to new positions at 60fps via FLIP + Web Animations. Output: working spike + perf report. **Branch**: `agent/x1/animation-perf-spike`. **Effort**: 1 week.
- `[done: x1 #10]` **theme-spike** — CSS variables + Tailwind preset. Render a static grid in light + dark + 3 density modes. No JS. **Effort**: 2-3 days.

### Phase 4 — Foundation impls (weeks 5-9)

- `[done: x1 #14]` **core-types** — write all public types in `@bc-grid/core` from `api.md`. **Effort**: 4-5 days.
- `[done: c1 #20+#21+#22+#23+#24+#26]` **virtualizer-impl** — production virtualizer based on the spike. Plan in `docs/design/virtualizer-impl-plan.md`; impl report in `docs/design/virtualizer-impl-report.md`. Six PRs: surface alignment (#20), Fenwick tree (#21), in-flight retention (#22), RO RAF throttling (#23), pinned-row support (#24), impl report (#26). 96 unit + 35 e2e tests. **Effort**: 2-3 weeks (delivered).
- `[done: x1 #16]` **animations-impl** — production animation system based on the spike. **Branch**: `agent/x1/animations-impl`. **Effort**: 1-2 weeks.
- `[done: x1 #15]` **theming-impl** — production theming layer. Class-name convention aligned to kebab-case per `design.md §13` (#18). **Branch**: `agent/x1/theming-impl`. **Effort**: 3-5 days.

### Phase 5 — Vertical slice (weeks 9-12)

- `[done: x1 #25]` **react-impl-v0** — `<BcGrid>` scaffold in `@bc-grid/react`. Read-only, no features. **Effort**: 1 week (delivered).
- `[done: c1 #27]` **q1-sort** — single-column sort + FLIP animation. **Effort**: 2-3 days (delivered).
- `[done: c1 #28]` **q1-keyboard-focus** — full WAI-ARIA keyboard matrix per accessibility-rfc §Keyboard Model. Arrows, Home/End, Ctrl+Home/Ctrl+End, PageUp/PageDown, Ctrl+Arrow extremes. Q3-reserved keys (Shift+Arrow, Ctrl+A) swallow without moving. Q2-reserved keys (F2, Enter, Escape) noop so the editor protocol can hook them later. **Effort**: 3-4 days (delivered).
- `[done: c1 #33]` **q1-pinned-cols** — pin classes on React-rendered cells, scroll-shadow indicators, multi-app Playwright (5 new tests × 3 browsers = 15 e2e cases). **Effort**: 2-3 days (delivered).
- `[done: c1 #31]` **column-resize** — drag the right edge of a column header to resize. **Effort**: 1 day (delivered).
- `[done: c1 #32]` **column-filter** — per-column inline text-filter row. **Effort**: 1-2 days (delivered).
- `[done: c1 #37]` **row-selection** — plain click selects single row, Ctrl/Cmd-click toggles, Shift-click range. Pure selection algebra in `packages/react/src/selection.ts` (selectOnly, toggleRow, selectRange, isRowSelected, selectionSize). Anchor for Shift held in a ref. Visual via `aria-selected` + `.bc-grid-row-selected` class. Playwright tests for all three click modes + ARIA. **Branch**: `agent/c1/row-selection`. **Effort**: 1 day.
- `[done: x3 #42]` **q1-vertical-slice-demo** — rebuilt the AR Customers ledger (5000 rows, full ERP shape) entirely on bc-grid. **Q1 architecture-soundness gate cleared 2026-04-29.** **Branch**: `agent/x3/q1-vertical-slice-demo`. **Effort**: 3-5 days (delivered).

### Documentation & examples (parallel throughout Q1)

- `[done: x1 #6]` **docs-app-skeleton** — `apps/docs/` Astro or Next.js site. Just the shell, navigation, syntax highlighting. **Effort**: 2-3 days.
- `[done: x1 #4]` **examples-app-skeleton** — `apps/examples/` Vite app. Renders example components live. **Effort**: 2 days.
- `[done: x1 #29]` **examples-demo** — mount the real React `<BcGrid>` in `apps/examples` with deterministic ERP-shaped data, production theme CSS, host-app shadcn light/dark tokens, density controls, pinned columns, custom cell renderer, and an imperative API exercise. **Effort**: half day (delivered).
- `[done: x3 #35]` **docs-q1-content** — write API reference for v0.1: every public type, every prop, every event. (react-impl-v0 unblocker resolved by #25.) **Branch**: `agent/x3/docs-q1-content`. **Effort**: 1 week.

### Phase 5.5 — Q1.5 Hardening (parallel-safe with Phase 6 once `grid-tsx-file-split` lands)

**Critical-path note:** `grid-tsx-file-split` is the **single true blocker** for Phase 6 React-layer work. One agent owns it; everyone else avoids `packages/react/src/grid.tsx` until it merges. Once split, Phase 5.5 + Phase 6 tasks run **fully in parallel**. RFC drafting (Phase 6 design docs) is unconditional and runs in parallel with Phase 5.5 from day one.

- `[ready]` **grid-tsx-file-split** — split `packages/react/src/grid.tsx` (1739 lines) into ≤6 files of ≤400 lines each. Suggested split: `grid.tsx` (top-level component + state), `header.tsx` (header row + filter row + sort indicator), `body.tsx` (virtualized body + row + cell renderers), `pinned.tsx` (pinned-cell positioning helpers), `selection.tsx` (already exists, may absorb selection-anchor ref), `effects.tsx` (FLIP, scroll-shadow, ResizeObserver). Public API surface unchanged; manifest unchanged. **Critical Phase A blocker** — single owner. **Effort**: M (3-4 hours focused).
- `[ready]` **bundle-size-ci-gate** — add a CI step that runs after build and asserts `core+virtualizer+animations+react` < 60KB gzipped per `design.md §3.2 smoke`. Use `tools/api-surface` plumbing pattern: a small Node script that reads each package's `dist/index.js`, gzips, sums, compares against a manifest budget. Fail PR on regression > 5%. **Effort**: S.
- `[ready]` **smoke-perf-ci** — extend `nightly-perf-harness` (PR #38) to a smoke variant that runs on every PR: cold-mount 1k×10 < 200ms, sort 10k < 50ms, scroll FPS 10k×20 ≥ 58 sustained 1s, edit-cell-paint < 16ms (last is reserved Q2; skip until editing lands). Single-browser (Chromium); fast (under 30s). New `bun run test:smoke-perf` script + CI step. **Effort**: M.
- `[ready]` **multi-column-sort-ui** — `BcGridSort[]` shape already supports it (`api.md §3.2`). Add Shift+click on header to append; Ctrl/Cmd+click to remove a sort. Show the sort order index next to the direction indicator. Live region announcement updates per `accessibility-rfc §Live Regions`. **Effort**: XS.
- `[ready]` **tooltip-rendering** — `BcGridColumn.tooltip` typed in `api.md §1.1` but not wired. Render via shadcn `Tooltip` primitive on hover/focus; respects `prefers-reduced-motion` for transition. **Effort**: S.
- `[ready]` **localstorage-gridid-persistence** — `api.md §3.3` declares `gridId` triggers automatic `localStorage` persistence of `columnState`, `pageSize`, `density`, `groupBy`. Currently typed but no read/write happens. Implement read on mount, write on state change (debounced ≥ 500ms). Storage key convention: `bc-grid:{gridId}:{state}`. **Effort**: S.
- `[ready]` **search-highlighting** — `BcCellRendererParams.searchText` exists; default cell renderer should highlight matched substrings (case-insensitive). Wrap matched runs in `<mark>` with `data-bc-grid-search-match`. **Effort**: S.
- `[ready]` **selection-checkbox-column** — opt-in pinned-left checkbox column toggled by `<BcGrid checkboxSelection>` prop. Header checkbox toggles all-on-page; row checkboxes toggle single. Lives alongside the existing click-to-select gestures (no conflict). **Effort**: S.
- `[ready]` **aria-disabled-rows** — `accessibility-rfc §VirtualRowA11yMeta.disabled` flag plus a `BcGridProps.rowIsDisabled` predicate; disabled rows: `aria-disabled="true"`, `.bc-grid-row-disabled`, ignored by selection gestures, focusable but no edit/sort actions. **Effort**: XS.
- `[ready]` **row-select-keyboard** — Space toggles selection on the focused row (`Space` is unreserved per `accessibility-rfc §Selection Extension Points`; only `Shift+Space` and `Ctrl+Space` are Q3-reserved). Keyboard parity with the mouse gestures from #37. **Effort**: S.
- `[ready]` **number-filter-ui** — operators: `=`, `!=`, `<`, `<=`, `>`, `>=`, `between`. Inline UI per the existing text-filter pattern. Q2-reserved → pulled forward. **Effort**: S.
- `[ready]` **date-filter-ui** — operators: `is`, `before`, `after`, `between`. Use shadcn date picker primitive. Q2-reserved → pulled forward. **Effort**: S.
- `[blocked: depends on filter-registry-rfc]` **set-filter-ui** — multi-select dropdown of distinct values from the column. Lazy-loaded (computed on first open from current row model). Q2-reserved → pulled forward. **Effort**: M.
- `[ready]` **boolean-filter-ui** — three-state: any / yes / no. Q2-reserved → pulled forward. **Effort**: XS.

**Phase 5.5 health metrics (not blocking gates beyond `grid-tsx-file-split`):** `grid.tsx` split → unblocks parallel Phase 6 React-layer work. Smoke perf + bundle size CI → keeps quality bars enforced on every Phase 6 PR. Q1 vertical-slice gate **already cleared as of PR #42** (AR Customers ledger in `apps/examples`); a real bc-next integration cutover is a separate post-1.0 follow-up. Tooltip / persistence / filter-UI items are independent and land any time.

### Phase 6 — v1.0 Parity Sprint (Phase B feature tracks)

Tracks land RFC-by-RFC and feature-by-feature. Each track's tasks live next to the RFC PR that introduces them. The RFC PR itself adds the track's task entries here; this section currently lists the upcoming RFCs that c2 is authoring. As each RFC merges, expect 5-15 new task entries in the corresponding sub-section.

#### Track 1 — Editing (Q2 surface)
- `[ready]` **editing-rfc** — owned by c2; design doc covering cell-edit lifecycle, keyboard state machine, editor framework contract, validation, dirty tracking, optimistic UI patterns. Lands as a doc-only PR; track 1 implementation tasks land in subsequent PRs that cite this RFC. **Effort**: 1 day.

#### Track 2 — Range + master-detail (Q3 surface)
- `[ready]` **range-rfc** — owned by c2; design doc covering range model, anchor/extend semantics, multi-range, clipboard contract, fill handle. **Effort**: 1 day.

#### Track 3 — Server row model (Q4 surface)
The `server-query-rfc` (PR #2) already designed this surface. Track 3 implementation tasks land as their PRs ship; no new RFC needed. First implementation task ready to claim:
- `[ready]` **server-paged-impl** — implement `BcServerGrid rowModel="paged"` with the `LoadServerPage` contract from `server-query-rfc`. **Effort**: M.

#### Track 4 — Aggregations + Pivots (Q5 pulled forward)
- `[ready]` **aggregation-rfc** — owned by c2; engine contract for `@bc-grid/aggregations` (sum/count/avg/min/max + custom factory) and the React adapter (footer + group-row aggregation rendering). **Effort**: 1 day.
- `[blocked: depends on aggregation-rfc]` **pivot-rfc** — owned by c2; engine vs React split for pivot table; drag-to-pivot UI; row-groups + col-groups + values dimensions. **Effort**: 1 day.

#### Track 5 — Chrome (Q6 pulled forward)
- `[ready]` **chrome-rfc** — owned by c2; status-bar slot + sidebar (tool panels) framework + context-menu extension protocol. **Effort**: 1 day.

#### Track 6 — Filters + Export (Q6 pulled forward)
- `[ready]` **filter-registry-rfc** — owned by c2; extension protocol for `BcFilterDefinition` / `BcReactFilterDefinition`; consumer-defined filter types; persistence shape. **Effort**: 1 day.
- `[ready]` **export-csv-impl** — `@bc-grid/export` is currently a stub (planned package). Add `toCsv(rows, columns)` per `api.md §9`. **Effort**: S.
- `[ready]` **export-xlsx-impl** — peer-dep on ExcelJS; `toExcel(rows, columns)`. Confirm peer-dep choice with architect before bundling. **Effort**: M.
- `[ready]` **export-pdf-impl** — peer-dep on jsPDF or react-pdf; `toPdf(rows, columns)`. Confirm peer-dep choice with architect. **Effort**: M.

#### Track 7 — Polish + Charts (NEW) + Mobile (Q7 pulled forward + new)
- `[ready]` **charts-rfc** — owned by c2; **NEW track** (was non-goal in `design.md §2`). Peer-dep architecture: consumer brings the chart library (recharts/echarts/visx/apex evaluated in the RFC); we ship adapter + 2-3 worked examples. **Effort**: 1 day.
- `[ready]` **streaming-row-updates** — server pushes new rows mid-session via the `ServerRowUpdate` types already declared in `core` (PR #2 / `server-query-rfc`). Animated insertion via FLIP. **Effort**: M.
- `[ready]` **mobile-touch-fallback** — `accessibility-rfc §Pointer and Touch Fallback`: 44px hit targets, double-tap-to-edit, long-press context menu (500ms threshold), pointer selection handles 44px. **Effort**: M.
- `[ready]` **wcag-deep-pass** — full axe-core audit on every demo; manual NVDA/JAWS/VoiceOver runs; fix any findings. **Effort**: M.
- `[ready]` **migration-guide** — from AG Grid Community + Enterprise to bc-grid; documented patterns, side-by-side examples; no codemod (out of scope). **Effort**: M.

### Quality + infra (parallel throughout Q1)

- `[ready]` **screenreader-spot-check** — run the NVDA + VoiceOver pinned-column DOM-order methodology from `docs/design/virtualizer-spike-v2-report.md` against the merged spike. Validates that pinned cells + body cells announce in column-index order, that ARIA rowcount/colcount semantics match the dataset, and that no spurious "leaving / entering" events appear at pinned↔body transitions. Deferred from `virtualizer-spike-v2` (PR #9) at merge time because it requires Windows + macOS hardware. If a divergence surfaces, file as a virtualizer-impl follow-up rather than blocking unrelated work. **Effort**: half day per engine.
- `[done: x1 #38]` **nightly-perf-harness** — measure `design.md §3.2` nightly bars on stable hardware: scroll FPS at 100k × 30 (≥58 sustained over 2s), grid-overhead memory (< 30MB above raw dataset, heap diff via CDP `HeapProfiler.takeHeapSnapshot`), filter / sort latency. Runs via Playwright + dedicated workflow (not the per-PR e2e job) so CI variance doesn't gate. Median of 3 runs. **Effort**: 2-3 days.
- `[done: x1 #34]` **api-surface-diff** — `tools/api-surface/` walks every package's built `dist/index.d.ts` + `dist/index.js` (TypeScript compiler API), diffs against a per-package manifest of expected exports. Two modes: `enforced` (drift fails the build) and `planned` (manifest documents intent for packages still being filled in). CI step in smoke job. **Branch**: `agent/x1/api-surface-diff`. **Effort**: 1-2 days.

---

## Q2 — Editing + Q1 read-only catch-up (queued)

(populated end of Q1)

---

## Q3 — Range selection + master-detail (queued)

(populated end of Q2)

---

## Q4 — Server-side row model (queued)

(populated end of Q3)

---

## Conventions

- Tasks are sized: small (< 3 days), medium (3-7 days), large (1-2 weeks). Larger than 2 weeks → split.
- Every task has an effort estimate. If the agent thinks it'll be more, file a comment on the task before claiming.
- Tasks cite which design docs they implement (`design.md`, `design/X.md`).
- Cross-package coordination: tasks that touch >1 package require architect approval before claiming.
