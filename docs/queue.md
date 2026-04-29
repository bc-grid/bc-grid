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

### Phase 5.5 — Q1.5 Hardening (parallel with Phase 6, in flight)

**Critical-path note:** `grid-tsx-file-split` (#50, merged 2026-04-29 12:03 UTC) was the single blocker for Phase 6 React-layer work. **Cleared.** Phase 5.5 + Phase 6 implementation tasks now run fully in parallel; RFC drafting (Phase 6 design docs) was already running in parallel from day one.

- `[done: c1 #50]` **grid-tsx-file-split** — split `packages/react/src/grid.tsx` (1876 lines) into 6 files: `grid.tsx` (697, orchestrator), `editGrid.tsx` (141), `serverGrid.tsx` (159), `headerCells.tsx` (224), `bodyCells.tsx` (125), `gridInternals.ts` (763, defaults + types + hooks + utilities + styles). Public API surface unchanged; manifest unchanged. Hooks extracted: `useLiveRegionAnnouncements`, `useViewportSync`, `useColumnResize`, `useFlipOnSort`. **Critical Phase A blocker — cleared.** **Effort**: M (delivered).
- `[done: x1 #59]` **bundle-size-ci-gate** — add a CI step that runs after build and asserts `core+virtualizer+animations+react` < 60KB gzipped per `design.md §3.2 smoke`. Use `tools/api-surface` plumbing pattern: a small Node script that reads each package's `dist/index.js`, gzips, sums, compares against a manifest budget. Fail PR on regression > 5%. **Branch**: `agent/x1/bundle-size-ci-gate`. **Effort**: S.
- `[review: x1 #62]` **smoke-perf-ci** — extend `nightly-perf-harness` (PR #38) to a smoke variant that runs on every PR: cold-mount 1k×10 < 200ms, sort 10k < 50ms, scroll FPS 10k×20 ≥ 58 sustained 1s, edit-cell-paint < 16ms (last is reserved Q2; skip until editing lands). Single-browser (Chromium); fast (under 30s). New `bun run test:smoke-perf` script + CI step. **Effort**: M.
- `[done: c2 #78]` **multi-column-sort-ui** — `BcGridSort[]` shape already supports it (`api.md §3.2`). Add Shift+click on header to append; Ctrl/Cmd+click to remove a sort. Show the sort order index next to the direction indicator. Live region announcement updates per `accessibility-rfc §Live Regions`. (Originally c1 #56; salvaged onto current main as #78.) **Effort**: XS.
- `[done: x1 #69]` **tooltip-rendering** — `BcGridColumn.tooltip` typed in `api.md §1.1` but not wired. Render via shadcn `Tooltip` primitive on hover/focus; respects `prefers-reduced-motion` for transition. **Branch**: `agent/x1/tooltip-rendering`. **Effort**: S.
- `[done: x1 #73]` **localstorage-gridid-persistence** — `api.md §3.3` declares `gridId` triggers automatic `localStorage` persistence of `columnState`, `pageSize`, `density`, `groupBy`. Currently typed but no read/write happens. Implement read on mount, write on state change (debounced ≥ 500ms). Storage key convention: `bc-grid:{gridId}:{state}`. **Effort**: S.
- `[done: x2 #64]` **search-highlighting** — `BcCellRendererParams.searchText` exists; default cell renderer should highlight matched substrings (case-insensitive). Wrap matched runs in `<mark>` with `data-bc-grid-search-match`. **Branch**: `agent/x2/search-highlighting`. **Effort**: S.
- `[done: c2 #79]` **selection-checkbox-column** — opt-in pinned-left checkbox column toggled by `<BcGrid checkboxSelection>` prop. Header checkbox toggles all-on-page; row checkboxes toggle single. Lives alongside the existing click-to-select gestures (no conflict). (Originally c1 #58; salvaged onto current main as #79.) **Effort**: S.
- `[ready]` **aria-disabled-rows** — `accessibility-rfc §VirtualRowA11yMeta.disabled` flag plus a `BcGridProps.rowIsDisabled` predicate; disabled rows: `aria-disabled="true"`, `.bc-grid-row-disabled`, ignored by selection gestures, focusable but no edit/sort actions. **Effort**: XS.
- `[done: x2 #71]` **row-select-keyboard** — Space toggles selection on the focused row (`Space` is unreserved per `accessibility-rfc §Selection Extension Points`; only `Shift+Space` and `Ctrl+Space` are Q3-reserved). Keyboard parity with the mouse gestures from #37. **Branch**: `agent/x2/row-select-keyboard`. **Effort**: S.
- `[ready]` **number-filter-ui** — operators: `=`, `!=`, `<`, `<=`, `>`, `>=`, `between`. Inline UI per the existing text-filter pattern. Q2-reserved → pulled forward. **Effort**: S.
- `[ready]` **date-filter-ui** — operators: `is`, `before`, `after`, `between`. Use shadcn date picker primitive. Q2-reserved → pulled forward. **Effort**: S.
- `[blocked: depends on filter-registry-rfc]` **set-filter-ui** — multi-select dropdown of distinct values from the column. Lazy-loaded (computed on first open from current row model). Q2-reserved → pulled forward. **Effort**: M.
- `[ready]` **boolean-filter-ui** — three-state: any / yes / no. Q2-reserved → pulled forward. **Effort**: XS.

**Phase 5.5 health metrics (not blocking gates beyond `grid-tsx-file-split`):** `grid.tsx` split → unblocks parallel Phase 6 React-layer work. Smoke perf + bundle size CI → keeps quality bars enforced on every Phase 6 PR. Q1 vertical-slice gate **already cleared as of PR #42** (AR Customers ledger in `apps/examples`); a real bc-next integration cutover is a separate post-1.0 follow-up. Tooltip / persistence / filter-UI items are independent and land any time.

### Phase 6 — v1.0 Parity Sprint (Phase B feature tracks)

8 tracks. **Tracks land RFC-by-RFC; impl tasks listed inline below.** Each impl task is sized so a single agent owns one PR; cross-task work claims the next available `[ready]` task per AGENTS.md §5. Convention: when claiming, edit `[ready]` → `[in-flight: <agent>]` in the same commit that creates the branch; transition to `[review: <agent> #N]` when the PR opens; `[done: <agent> #N]` when it merges.

**RFC scaffolding for v1 parity sprint: COMPLETE.** All 7 tracks have design docs filed.
- `[done: c2 #45]` editing-rfc (Track 1)
- `[done: c2 #46]` chrome-rfc (Track 5)
- `[done: c2 #48]` filter-registry-rfc (Track 6)
- `[done: c2 #49]` range-rfc (Track 2)
- `[done: c2 #51]` aggregation-rfc (Track 4 first half)
- `[done: c2 #52]` pivot-rfc (Track 4 second half)
- `[done: c2 #53]` charts-rfc (Track 7)

Track 3 (server-row-model) reuses `server-query-rfc` (PR #2, merged) and needs no new RFC.

**Track parallelism map.** After each track's RFC merges, all impl tasks in that track run **fully in parallel** unless explicitly marked `[blocked: …]`. Cross-track parallelism is unconstrained — different files, different packages.

#### Track 0 — Read-Only Catch-Up (Q2 features that don't depend on editing)

These tasks are pure `@bc-grid/react` UI on top of existing state shapes. **No RFC needed** — `api.md §1.1` and `§3.2` already declare the supporting types. Anyone can claim these immediately after `grid-tsx-file-split`. Suggested owner: c1 or whoever is between bigger pieces.

- `[ready]` **column-reorder** — drag a column header to reorder. State already supported via `BcColumnStateEntry.position` (`api.md §3.2`). UI: pointer-driven drag with a drop-indicator line; keyboard alternative via column tool panel (Track 5). Honour controlled/uncontrolled `columnState` from `api.md §3.1`. **Effort**: M.
- `[ready]` **column-visibility-ui** — show/hide affordance per column. State already supported via `BcColumnStateEntry.hidden`. UI: header-cell context-menu item OR via the Columns tool panel in Track 5. (Header context-menu lands here; tool panel lands in `tool-panel-columns`.) **Effort**: S.
- `[ready]` **column-state-url-persistence** — encode `columnState` (visibility, order, width, sort) into URL search params for shareable links. Pairs with `localstorage-gridid-persistence` (Phase 5.5). Consumer opts in via `BcGridProps.urlStatePersistence?: { searchParam: string }`. **Effort**: S.
- `[ready]` **search-complete** — apply `searchText` as a row filter (case-insensitive substring across `valueFormatter` results for searchable columns per `api.md §4.3`). Pairs with `search-highlighting` (Phase 5.5) which renders the `<mark>` in cells. **Effort**: S.
- `[ready]` **group-by-client** — client-side row grouping by one or more columns. Group rows render as a header row with expand/collapse chevron + count. Tree-mode rendering uses `aria-level` + `role="treegrid"` per `accessibility-rfc §grid vs treegrid`. State via `BcGridProps.groupBy` (already declared). **Effort**: M.
- `[ready]` **pagination-client-ui** — client-side pager controls (first / prev / next / last + page-size dropdown). State already supported via `BcGridProps.page`/`pageSize`/`onPaginationChange`. Renders in `BcGridProps.footer` slot by default; consumer can opt out. **Effort**: S.

#### Track 1 — Editing (Q2 editing surface)

Spec: `docs/design/editing-rfc.md` (PR #45).

- `[done: c2 #45]` **editing-rfc** — design doc; covers lifecycle, keyboard, validation, dirty tracking, server commit, 7 built-in editor specs. **Editor framework + 8 editors + validation + dirty tracking + bc-edit-grid-complete now claimable.**
- `[ready]` **editor-framework** — `BcCellEditor` lifecycle + state machine + validation pipeline + DOM focus shift + live region announcements (extend `useLiveRegionAnnouncements` to return `announceAssertive` — currently only polite, see audit-c2-002 §F1). Single owner. **Effort**: M. **Unblocked: editing-rfc merged in #45.**
- `[blocked: depends on editor-framework]` **editor-text** — text input editor. shadcn `Input` primitive. Honours `seedKey`, `pointerHint`. **Effort**: S.
- `[blocked: depends on editor-framework]` **editor-number** — numeric input with locale-aware decimal separator. shadcn `Input` + `inputMode="decimal"`. **Effort**: S.
- `[blocked: depends on editor-framework]` **editor-date** — shadcn date-picker primitive + ISO 8601 commit. **Effort**: M.
- `[blocked: depends on editor-date]` **editor-datetime** — composes `editor-date` + time picker; ISO 8601 commit. **Effort**: M.
- `[blocked: depends on editor-framework]` **editor-time** — `<input type="time" />` styled with shadcn `Input`; 24h commit. **Effort**: S.
- `[blocked: depends on editor-framework]` **editor-select** — shadcn `Select`; reads `column.options` (additive prop). Type-to-narrow via `seedKey`. **Effort**: M.
- `[blocked: depends on editor-select]` **editor-multi-select** — shadcn multi-select; chip input + dropdown. **Effort**: M.
- `[blocked: depends on editor-framework]` **editor-autocomplete** — shadcn `Combobox`; async via `column.fetchOptions(query, signal)`. Debounced 200ms. **Effort**: M.
- `[blocked: depends on editor-framework]` **validation-framework** — sync + async validators with `AbortSignal` race semantics; reuses existing `BcValidationResult` from `api.md §1.2`. Can run **concurrently** with `editor-text`. **Effort**: S.
- `[blocked: depends on validation-framework]` **dirty-tracking** — `BcEditState` map + visual states (`data-bc-grid-cell-state`); cell renderer params extension (`pending`, `editError`, `isDirty`). **Effort**: S.
- `[blocked: depends on all 7 editors + validation-framework + dirty-tracking]` **bc-edit-grid-complete** — `<BcEditGrid>` Q2 fold-in: `onCellEditCommit` post-commit event with optimistic + rollback; integration with the action column from Q1. **Effort**: M.
- `[blocked: depends on bc-edit-grid-complete]` **editor-custom-recipe** — docs page in `apps/docs` with a worked custom-editor example (e.g., colour picker). **Effort**: S.

#### Track 2 — Range + master-detail (Q3 surface)

Spec pending: `docs/design/range-rfc.md` (c2 to author).

- `[done: c2 #49]` **range-rfc** — design doc covering range model, anchor/extend semantics, multi-range, clipboard contract, fill handle. **Effort**: 1 day.
- `[blocked: depends on range-rfc]` **range-state-machine** — `BcRange` (already declared `api.md §reserved Q3`) state in `core/range.ts`; anchor + extend + multi-range. **Effort**: M.
- `[blocked: depends on range-state-machine]` **visual-selection-layer** — absolute-positioned overlay rendering range rectangles; works through virtualization. **Effort**: M.
- `[blocked: depends on range-state-machine]` **clipboard-copy-tsv-html** — Ctrl/Cmd+C serializes range to TSV (text/plain) + HTML (text/html) on the clipboard. **Effort**: S.
- `[blocked: depends on clipboard-copy-tsv-html]` **clipboard-paste-from-excel** — Ctrl/Cmd+V parses clipboard TSV; applies cell-by-cell with per-column `valueParser` + `validate`; atomic apply (all-or-rollback). **Effort**: M.
- `[blocked: depends on clipboard-paste-from-excel]` **fill-handle** — drag-square at bottom-right of active range; drag to extend; release to fill (linear / copy / smart-fill). **Effort**: M.
- `[ready]` **master-detail** — expandable row that mounts a consumer-supplied detail component below the row. State via `expansion: ReadonlySet<RowId>` (already declared). `aria-level` + `role="treegrid"` when active. Independent of range work; can run in parallel. **Effort**: M.
- `[ready]` **column-groups-multi-row-headers** — multi-row column headers (e.g., parent header "Q1 Sales" with children "Jan / Feb / Mar"). Surface: `BcReactGridColumn.children?: BcReactGridColumn[]` (additive). Renders header rows for each level with `aria-colspan`. Independent; can run in parallel. **Effort**: M.
- `[ready]` **sticky-header-polish** — refine the existing pinned-top header to maintain scroll-shadow + correct z-index against pinned-left/-right corners. Independent; can run in parallel. **Effort**: S.

#### Track 3 — Server row model (Q4 surface)

Spec already exists: `docs/design/server-query-rfc.md` (PR #2). No new RFC needed.

- `[done: x2 #60]` **server-paged-impl** — `BcServerGrid rowModel="paged"` with the `LoadServerPage` contract. AbortSignal handling, request dedup. **Branch**: `agent/x2/server-paged-impl`. **Effort**: M.
- `[blocked: depends on server-paged-impl]` **infinite-mode-block-cache** — `rowModel="infinite"`: `ServerBlockCache` with LRU eviction; `LoadServerBlock` integration; viewport-driven block fetching with prefetch ahead. **Effort**: L (3-5 hours).
- `[blocked: depends on infinite-mode-block-cache]` **server-tree-mode** — `rowModel="tree"`: lazy children fetching via `LoadServerTreeChildren`; expand/collapse triggers fetch; `ServerTreeRow` rendering. **Effort**: L.
- `[blocked: depends on server-paged-impl]` **mutation-pipeline** — `ServerRowPatch` apply path; optimistic UI with `pendingMutations` map; `ServerMutationResult` settle handling. Integrates with Track 1's `bc-edit-grid-complete`. **Effort**: M.
- `[blocked: depends on server-paged-impl]` **invalidation-impl** — `ServerInvalidation` scopes (all / view / blocks / rows / tree). Refetch + cache eviction logic. **Effort**: M.
- `[blocked: depends on infinite-mode-block-cache + mutation-pipeline]` **server-row-model-perf-tuning** — measure block fetch latency, debounce settings, cache hit rate at 100k+ rows. Add to nightly perf harness. **Effort**: M.

#### Track 4 — Aggregations + Pivots (Q5 pulled forward)

Specs: `docs/design/aggregation-rfc.md` (PR #51) + `pivot-rfc.md` (PR #52).

- `[done: c2 #51]` **aggregation-rfc** — engine contract for `@bc-grid/aggregations` + React adapter. **Effort**: 1 day.
- `[blocked: depends on aggregation-rfc]` **aggregation-engine** — `@bc-grid/aggregations` package (currently stub). `sum`, `count`, `avg`, `min`, `max`, `registerAggregation`. Pure functions; no DOM. Per `design.md §4.2`. **Effort**: M.
- `[blocked: depends on aggregation-engine]` **aggregation-react-adapter** — footer aggregation row + group-row aggregation rendering in `@bc-grid/react`. Wires `column.aggregation` (already declared `api.md §1.1`) to the engine. **Effort**: M.
- `[done: c2 #52]` **pivot-rfc** — engine vs React split; drag-to-pivot UI; row/col/values dimensions; treegrid output. **Effort**: 1 day.
- `[blocked: depends on pivot-rfc + aggregation-engine]` **pivot-engine** — engine layer in `@bc-grid/aggregations` (or a separate `@bc-grid/pivots` if the RFC decides to split). Computes pivot table from rows + dimensions. **Effort**: L.
- `[blocked: depends on pivot-engine]` **pivot-ui-drag-zones** — Pivot tool panel in the sidebar (Track 5) with row/col/values drop zones. **Effort**: M.
- `[blocked: depends on pivot-engine]` **pivot-row-col-groups** — render the pivoted output: row-group axis, col-group axis, value cells. **Effort**: M.

#### Track 5 — Chrome (Q6 pulled forward)

Spec: `docs/design/chrome-rfc.md` (PR #46).

- `[done: c2 #46]` **chrome-rfc** — design doc; covers status-bar / sidebar tablist / context-menu.
- `[blocked: depends on chrome-rfc]` **status-bar-impl** — `BcGridProps.statusBar` slot + 4 built-in segments (total / filtered / selected / aggregations). `role="status"` with debounced polite announcements. **Effort**: M.
- `[blocked: depends on chrome-rfc]` **sidebar-impl** — right-edge collapsible icon rail + tablist semantics (no focus trap; standard Tab/Shift+Tab cycles panel controls); Esc closes the panel and returns focus to the icon. **Effort**: M.
- `[blocked: depends on sidebar-impl]` **tool-panel-columns** — Columns tool panel inside sidebar: search, drag-to-reorder (keyboard accessible), visibility checkbox, pin dropdown, group-by drop zone. **Effort**: M.
- `[blocked: depends on sidebar-impl + filter-registry-rfc]` **tool-panel-filters** — Filters tool panel: list active filters with inline-editable variants (text/number/date/set/boolean from Track 6). Clear-all button. **Effort**: M.
- `[blocked: depends on chrome-rfc]` **context-menu-impl** — shadcn `ContextMenu` primitive; right-click + long-press (500ms coarse pointer) + Shift+F10. 4 built-in items + custom factory function. **Effort**: M.
- `[blocked: depends on aggregation-engine + status-bar-impl]` **footer-aggregations** — wire the `aggregations` status-bar segment to the aggregation-engine output. **Effort**: S.

#### Track 6 — Filters + Export (Q6 pulled forward)

Spec pending: `docs/design/filter-registry-rfc.md` (c2 to author).

- `[done: c2 #48]` **filter-registry-rfc** — extension protocol; `BcFilterDefinition` / `BcReactFilterDefinition`; persistence shape; 7 built-in filter specs. **Effort**: 1 day.
- `[blocked: depends on filter-registry-rfc]` **filter-set-impl** — multi-select dropdown of distinct values. Lazy-loaded on first open. **Effort**: M.
- `[blocked: depends on filter-registry-rfc]` **filter-multi-impl** — same as set but for multi-select columns (already-array values). **Effort**: M.
- `[blocked: depends on filter-registry-rfc]` **filter-date-range-impl** — between two dates; uses shadcn date-picker. **Effort**: M.
- `[blocked: depends on filter-registry-rfc]` **filter-number-range-impl** — between two numbers. **Effort**: S.
- `[blocked: depends on filter-registry-rfc]` **filter-text-impl-extend** — extend the existing inline text filter with operators (contains / starts-with / ends-with / equals / regex toggle / case-sensitivity toggle). **Effort**: S.
- `[blocked: depends on filter-registry-rfc]` **filter-custom-extension-example** — recipe in `apps/docs` showing how to register a custom filter type. **Effort**: S.
- `[blocked: depends on filter-registry-rfc]` **filter-persistence** — URL state + `localStorage` backends for filter state. Pairs with the column-state persistence work in Track 0. **Effort**: S.
- `[done: x2 #72]` **export-csv-impl** — `@bc-grid/export.toCsv(rows, columns)` per `api.md §9`. No external deps; pure serializer. **Branch**: `agent/x2/export-csv-impl`. **Effort**: S.
- `[done: x2 #75]` **export-xlsx-impl** — peer-dep on **ExcelJS** (confirmed in coordination plan). `toExcel(rows, columns)`. **Branch**: `agent/x2/export-xlsx-impl`. **Effort**: M.
- `[in-flight: x2]` **export-pdf-impl** — peer-dep on **jsPDF** (confirmed in coordination plan; alternative `react-pdf` if jsPDF doesn't fit; first PR picks the winner). `toPdf(rows, columns)`. **Branch**: `agent/x2/export-pdf-impl`. **Effort**: M.
- `[ready]` **export-server-mode** — wire `ServerExportQuery` (already declared in core) to a server-mode export flow: blob / url / job response handling. **Effort**: S.

#### Track 7 — Polish + Charts (NEW) + Mobile (Q7 pulled forward + new)

Spec pending: `docs/design/charts-rfc.md` (c2 to author; user confirmed peer-dep approach with **recharts** as default).

- `[done: c2 #53]` **charts-rfc** — **NEW track**; peer-dep architecture (consumer brings library); recharts as the documented default; adapter shape; 3 worked examples in apps/docs. **Effort**: 1 day.
- `[blocked: depends on charts-rfc]` **charts-peer-dep-integration** — adapter package (`@bc-grid/charts` or in-react module — RFC decides); `<BcGridChart>` slot or hook; consumer-supplied chart component. **Effort**: M.
- `[ready]` **streaming-row-updates** — server pushes new rows mid-session via `ServerRowUpdate` types (already in core); animated insertion via FLIP. Consumer subscribes via a hook. **Effort**: M.
- `[ready]` **mobile-touch-fallback** — `accessibility-rfc §Pointer and Touch Fallback`: 44px hit targets in coarse-pointer mode; double-tap to edit; long-press 500ms for context menu; pointer selection handles 44px. **Effort**: M.
- `[ready]` **wcag-deep-pass** — full axe-core audit on every demo + manual NVDA / JAWS / VoiceOver runs; fix any findings. Generates a `docs/design/a11y-impl-report.md`. **Effort**: M.
- `[ready]` **animation-polish** — review every transition (sort / filter / expand / collapse / insert / remove / cell-flash); tune to 60fps; document the motion system. **Effort**: M.
- `[ready]` **browser-compat-matrix** — full Chromium / FF / WebKit / Safari / Edge pass on the AR Customers demo + standalone tests. Document any known issues. **Effort**: S.
- `[ready]` **migration-guide** — from AG Grid Community + Enterprise to bc-grid; documented patterns; side-by-side examples; no codemod (out-of-scope). Lives in `apps/docs`. **Effort**: M.

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
