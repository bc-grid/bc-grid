# Work Queue

The single source of truth for "what's available to be picked up." Read `AGENTS.md §5` for how to claim work.

> **Active sprint — 2026-04-29:** `docs/coordination/v1-parity-sprint.md` is the orchestration plan. Phase A (Q1.5 hardening) tasks live below in `### Phase 5.5 — Q1.5 Hardening`. Phase B feature tracks live below in `### Phase 6 — v1.0 Parity Sprint` and land alongside their RFCs as those PRs ship. Read the sprint plan before claiming any Phase B work.
>
> **⭐ Demo-critical (week 2 — bsncraft funding demo on 2026-05-30):** the consumer migration from AG Grid → bc-grid in `~/work/bsncraft` is live but four AG-Grid-feel features are still missing. Agents please prioritise these, marked ⭐ in the queue:
>
> - `filter-popup-variant` — header-icon → Popover (consume existing filter editors)
> - `filter-set-impl` — multi-select distinct values (operators: in / not-in / blank)
> - `group-by-client` — runtime row grouping with expand/collapse + count
> - `range-state-machine` + `visual-selection-layer` + `clipboard-copy-tsv-html` — the Track 2 stack, all three need to land for AG-Grid-style range copy to work
>
> Cut a release after each demo-critical PR merges; bsncraft pulls the new version + a follow-up updates wrappers. Coordinator: Codex in `~/work/bc-grid` (auditor / merge integrator / Playwright owner).
>
> **5-worker launch plan (2026-04-30):** all workers start clean from parking branches. `worker1` = Codex, `worker2` = Claude, `worker3` = Codex, `worker4` = Claude, `worker5` = Codex. Codex in `~/work/bc-grid` coordinates PR review, merge, releases, and Playwright. Preferred first claims: `worker1/range-state-machine`, `worker2/filter-set-impl`, `worker3/group-by-client`, `worker4/editor-framework`, `worker5/sidebar-impl`. These are not pre-claimed; each worker must still edit this queue from `[ready]` to `[in-flight: workerN]` before coding. If a preferred task is already claimed, choose the next highest-priority `[ready]` task from `docs/coordination/five-worker-v1-execution-plan.md`.

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
- `[review: x1 #62]` **smoke-perf-ci** — extend `nightly-perf-harness` (PR #38) to a smoke variant that runs on every PR: cold-mount 1k×10 < 200ms, sort 10k < 50ms, scroll FPS 10k×20 ≥ 58 sustained 1s, edit-cell-paint < 16ms (last is reserved Q2; skip until editing lands). Single-browser (Chromium); fast (under 30s). New `bun run test:smoke-perf` script + CI step. **Branch**: `agent/x1/smoke-perf-ci`. **Effort**: M.
- `[done: c2 #78]` **multi-column-sort-ui** — `BcGridSort[]` shape already supports it (`api.md §3.2`). Add Shift+click on header to append; Ctrl/Cmd+click to remove a sort. Show the sort order index next to the direction indicator. Live region announcement updates per `accessibility-rfc §Live Regions`. (Originally c1 #56; salvaged onto current main as #78.) **Effort**: XS.
- `[done: x1 #69]` **tooltip-rendering** — `BcGridColumn.tooltip` typed in `api.md §1.1` but not wired. Render via shadcn `Tooltip` primitive on hover/focus; respects `prefers-reduced-motion` for transition. **Branch**: `agent/x1/tooltip-rendering`. **Effort**: S.
- `[done: x1 #73]` **localstorage-gridid-persistence** — `api.md §3.3` declares `gridId` triggers automatic `localStorage` persistence of `columnState`, `pageSize`, `density`, `groupBy`. Currently typed but no read/write happens. Implement read on mount, write on state change (debounced ≥ 500ms). Storage key convention: `bc-grid:{gridId}:{state}`. **Effort**: S.
- `[done: x2 #64]` **search-highlighting** — `BcCellRendererParams.searchText` exists; default cell renderer should highlight matched substrings (case-insensitive). Wrap matched runs in `<mark>` with `data-bc-grid-search-match`. **Branch**: `agent/x2/search-highlighting`. **Effort**: S.
- `[done: c2 #79]` **selection-checkbox-column** — opt-in pinned-left checkbox column toggled by `<BcGrid checkboxSelection>` prop. Header checkbox toggles all-on-page; row checkboxes toggle single. Lives alongside the existing click-to-select gestures (no conflict). (Originally c1 #58; salvaged onto current main as #79.) **Effort**: S.
- `[review: x1 #94]` **aria-disabled-rows** — `accessibility-rfc §VirtualRowA11yMeta.disabled` flag plus a `BcGridProps.rowIsDisabled` predicate; disabled rows: `aria-disabled="true"`, `.bc-grid-row-disabled`, ignored by selection gestures, focusable but no edit/sort actions. **Effort**: XS.
- `[done: x2 #71]` **row-select-keyboard** — Space toggles selection on the focused row (`Space` is unreserved per `accessibility-rfc §Selection Extension Points`; only `Shift+Space` and `Ctrl+Space` are Q3-reserved). Keyboard parity with the mouse gestures from #37. **Branch**: `agent/x2/row-select-keyboard`. **Effort**: S.
- `[done: worker1 #202]` **resize-affordance-polish** — v0.2 polish: always-visible, theme-token header resize affordance for resizable columns while preserving the existing resize hit area and pointer behavior. **Branch**: `agent/worker1/resize-affordance-polish`. **Effort**: XS.
- `[review: worker1 #267]` **column-resize-affordance-v030** — v0.3 sizing polish: keep column resize handles discoverable before hover without colliding with sorting/menu/filter controls, pinned-column separators, grouped headers, compact density, dark mode, or forced-colors themes. Preserve existing resize hit area and pointer behavior. **Branch**: `agent/worker1/column-resize-affordance-v030`. **Effort**: XS.
- `[review: worker1 #233]` **tailwind-v4-token-compat** ⭐ — package-side Tailwind v4 / latest shadcn token cleanup. bc-grid currently assumes Tailwind v3-style HSL channel tokens in several shipped CSS/inline-style surfaces (`hsl(var(--background))`, `hsl(var(--border))`, `hsl(var(--ring))`), which breaks hosts that use Tailwind v4 / shadcn OKLCH color tokens. Add a small, documented bc-grid token bridge in `@bc-grid/theming` so consumers can set real CSS colors (`oklch(...)`, `hsl(...)`, hex, etc.) without local app workarounds; migrate React/editor inline styles to `--bc-grid-*` variables instead of direct shadcn token reads; update docs/tests/examples. Do not add runtime Radix/shadcn dependencies. **Preferred owner: worker1.** **Effort**: S.
- `[review: x1 #109]` **number-filter-ui** — operators: `=`, `!=`, `<`, `<=`, `>`, `>=`, `between`. Inline UI per the existing text-filter pattern. Q2-reserved → pulled forward. **Effort**: S.
- `[done: x1 #116]` **date-filter-ui** — operators: `is`, `before`, `after`, `between`. Use shadcn date picker primitive. Q2-reserved → pulled forward. **Effort**: S.
- `[review: worker2 #248]` **set-filter-ui** — multi-select dropdown of distinct values from the column. Lazy-loaded (computed on first open from current row model). Q2-reserved → pulled forward. **Effort**: M.
- `[review: x1 #91]` **boolean-filter-ui** — three-state: any / yes / no. Q2-reserved → pulled forward. **Effort**: XS.

**Phase 5.5 health metrics (not blocking gates beyond `grid-tsx-file-split`):** `grid.tsx` split → unblocks parallel Phase 6 React-layer work. Smoke perf + bundle size CI → keeps quality bars enforced on every Phase 6 PR. Q1 vertical-slice gate **already cleared as of PR #42** (AR Customers ledger in `apps/examples`); a real bc-next integration cutover is a separate post-1.0 follow-up. Tooltip / persistence / filter-UI items are independent and land any time.

### Phase 5.6 — Publishing (private GitHub Packages)

Spec: `docs/design/publish-rfc.md`. Distribution channel pinned: GitHub Packages, private repo, Classic PAT for consumer reads. 8 tasks; can run in parallel except where ordering is noted.

- `[done: c2 #100]` **publish-config-pass-1** — dropped `private: true`, set version `0.1.0-alpha.1`, added `publishConfig`/`repository`/`homepage`/`bugs`/`license`/`author` across all 11 `packages/*/package.json`. Dropped unused `@tanstack/react-table` peerDep from `@bc-grid/react`. **Effort**: S.
- `[done: c2 #100]` **license-file** — root `LICENSE` file with `UNLICENSED` proprietary text. (Bundled into publish-config-pass-1.) **Effort**: XS.
- `[done: c2 #103]` **package-readmes** — 11 per-package `README.md` files. Full READMEs for `@bc-grid/react` / `theming` / `export`; concise stubs for engine packages; placeholder stubs for the 4 empty namespace-locked packages. **Effort**: S.
- `[done: c2 #102]` **changesets-setup** — installed `@changesets/cli` (^2.31.0), `bun run changeset init`, configured fixed-version mode (all 11 packages bump together), `access: "restricted"`. Added root scripts: `changeset`, `changeset:version`, `publish:packages`. **Effort**: S.
- `[done: c2 #104]` **release-workflow** — `.github/workflows/release.yml` triggered by `v*` tag push; runs full quality gate (type-check + lint + test + build + bundle-size + api-surface + tarball-smoke) then `bun publish` per package. Uses GitHub Actions' built-in `GITHUB_TOKEN` (write:packages). **Effort**: S.
- `[done: c2 #104]` **consumer-install-doc** — README "Install (from private GitHub Packages)" section + `.npmrc.example` template + step-by-step Classic PAT creation guide. **Effort**: S.
- `[done: c2 #106]` **tarball-smoke-test** — `tools/tarball-smoke` package + `bun run tarball-smoke` script. Packs each package, installs into a clean tmp consumer with `overrides` forcing transitive `@bc-grid/*` references to the tarballs, runs `tsc --noEmit` against a strict bundler-resolution tsconfig. Catches missing exports / workspace:* leaks / broken type declarations. Wired into `release.yml` as a pre-publish gate. **Effort**: M.
- `[blocked: needs maintainer to create Classic PAT + push v0.1.0-alpha.1 tag]` **first-release** — cut tag `v0.1.0-alpha.1`, verify the workflow publishes successfully, install from a fresh consumer to smoke-test the auth path. Manual one-time bootstrap. **Effort**: S.

### Phase 6 — v1.0 Parity Sprint (Phase B feature tracks)

8 tracks. **Tracks land RFC-by-RFC; impl tasks listed inline below.** Each impl task is sized so a single agent owns one PR; cross-task work claims the next available `[ready]` task per AGENTS.md §5. Convention: when claiming, edit `[ready]` → `[in-flight: <agent>]` in the same commit that creates the branch; transition to `[review: <agent> #N]` when the PR opens; `[done: <agent> #N]` when it merges.

**RFC scaffolding for v1 parity sprint: COMPLETE.** All 7 tracks have design docs filed.
- `[done: c2 #45]` editing-rfc (Track 1)
- `[done: c2 #46]` chrome-rfc (Track 5)
- `[done: c2 #48]` filter-registry-rfc (Track 6)
- `[done: c2 #49]` range-rfc (Track 2)
- `[done: c2 #51]` aggregation-rfc (Track 4 first half)
- `[done: c2 #52]` pivot-rfc (Track 4 second half)
- `charts-rfc` exists as a post-1.0 planning draft; charts implementation is not part of the v1.0 queue.

Track 3 (server-row-model) reuses `server-query-rfc` (PR #2, merged) and needs no new RFC.

**Track parallelism map.** After each track's RFC merges, all impl tasks in that track run **fully in parallel** unless explicitly marked `[blocked: …]`. Cross-track parallelism is unconstrained — different files, different packages.

#### Track 0 — Read-Only Catch-Up (Q2 features that don't depend on editing)

These tasks are pure `@bc-grid/react` UI on top of existing state shapes. **No RFC needed** — `api.md §1.1` and `§3.2` already declare the supporting types. Anyone can claim these immediately after `grid-tsx-file-split`. Suggested owner: c1 or whoever is between bigger pieces.

- `[done: c1 #136]` **column-reorder** — drag a column header to reorder. State already supported via `BcColumnStateEntry.position` (`api.md §3.2`). UI: pointer-driven drag with a drop-indicator line; keyboard alternative via column tool panel (Track 5). Honour controlled/uncontrolled `columnState` from `api.md §3.1`. **Effort**: M.
- `[done: x1 #122]` **column-visibility-ui** — show/hide affordance per column. State already supported via `BcColumnStateEntry.hidden`. UI: header-cell context-menu item OR via the Columns tool panel in Track 5. (Header context-menu lands here; tool panel lands in `tool-panel-columns`.) **Effort**: S.
- `[review: x1 #97]` **column-state-url-persistence** — encode `columnState` (visibility, order, width, sort) into URL search params for shareable links. Pairs with `localstorage-gridid-persistence` (Phase 5.5). Consumer opts in via `BcGridProps.urlStatePersistence?: { searchParam: string }`. **Effort**: S.
- `[review: x1 #98]` **search-complete** — apply `searchText` as a row filter (case-insensitive substring across `valueFormatter` results for searchable columns per `api.md §4.3`). Pairs with `search-highlighting` (Phase 5.5) which renders the `<mark>` in cells. **Effort**: S.
- `[done: worker5 #227]` **global-search-discovery-docs** — clarify host-owned global search wiring in `docs/api.md`, `packages/react/README.md`, and the examples toolbar so consumers can discover `searchText` without assuming a non-existent `onSearchTextChange` adapter. **Effort**: XS.
- `[review: worker3 #147]` **group-by-client** — client-side row grouping by one or more columns. Group rows render as a header row with expand/collapse chevron + count. Tree-mode rendering uses `aria-level` + `role="treegrid"` per `accessibility-rfc §grid vs treegrid`. State via `BcGridProps.groupBy` (already declared). **Effort**: M.
- `[review: worker2 #182]` **pagination-client-ui** — client-side pager controls (first / prev / next / last + page-size dropdown). State already supported via `BcGridProps.page`/`pageSize`/`onPaginationChange`. Renders in `BcGridProps.footer` slot by default; consumer can opt out. Salvage of closed PR #105: pager UI + slicing already in main; this restart aligns the auto-enable threshold behaviour with `api.md` §5.1's `pagination={true}        // false to disable; default true if data > pageSize threshold` contract. **Effort**: S.
- `[review: worker1 #254]` **layout-persistence-api-v030** — add a consumer-owned JSON-safe layout state contract for restoring column order/width/pinning/visibility, sort/filter/search, grouping, density, sidebar panel, and public pagination state without coupling the grid to localStorage. **Branch**: `agent/worker1/layout-persistence-api-v030`. **Effort**: S.

#### Track 1 — Editing (Q2 editing surface)

Spec: `docs/design/editing-rfc.md` (PR #45).

- `[done: c2 #45]` **editing-rfc** — design doc; covers lifecycle, keyboard, validation, dirty tracking, server commit, 7 built-in editor specs. **Editor framework + 8 editors + validation + dirty tracking + bc-edit-grid-complete now claimable.**
- `[done: worker4 #148]` **editor-framework** — `BcCellEditor` lifecycle + state machine + validation pipeline + DOM focus shift. **Note:** assertive live region plumbing (audit-c2-002 §F1) already landed; this task closes the remaining RFC gaps — `editor.prepare()` wiring, async-validate signal in `column.validate`, portal-aware click-outside, `aria-activedescendant` suspension during edit, `aria-current` / `aria-describedby` on the editing cell, polite-region 250ms debounce, Tab/Shift+Tab wrap at last/first cell. Single owner. **Effort**: M. **Unblocked: editing-rfc merged in #45.**
- `[done: worker4 #155]` **editor-text** — text input editor. Native `<input type="text">` (deviation from RFC's shadcn `Input`, matching the salvage-via-#135 decision for `editor-select`). Honours `seedKey`, `pointerHint`. The `textEditor` factory landed via integrator #112; this PR closes RFC-fidelity gaps (focusRef timing, AT name on input, aria-describedby for errors) and unit-tests the seed-value path. **Effort**: S.
- `[review: worker4 #158]` **editor-number** — numeric input with locale-aware decimal separator. Native `<input inputMode="decimal">` (deviation from RFC's shadcn `Input`, matching the salvage decisions for `editor-select` / `editor-text`). The `numberEditor` factory landed via integrator #112; this PR closes RFC-fidelity gaps mirroring the editor-text hardening (focusRef timing, AT name on input, aria-describedby for errors) and unit-tests the numeric seed-accept filter. The typed-commit deviation (v0.1 commits string + valueParser instead of producing `number` directly) remains documented in code; a follow-up task is needed to extend `BcCellEditorProps.commit` so editors own typed commits with their own `moveOnSettle`. **Effort**: S.
- `[review: worker4 #181]` **editor-typed-commit** — Track 1 follow-up. Extend `BcCellEditorProps.commit` to accept an optional `{ moveOnSettle }` so numeric / date / select-style editors that internally parse to typed values can call `commit(typedValue, { moveOnSettle: "right" })` cleanly without hijacking the framework's wrapper key handler. Adds `BcEditMove` as a public type re-export. Backward-compatible — existing editors that call `commit(value)` keep `"down"` semantics. Unblocks the typed-commit follow-up flagged in #158. **Effort**: S.
- `[done: c1 #121]` **editor-date** — shadcn date-picker primitive + ISO 8601 commit. **Effort**: M.
- `[done: c1 #126]` **editor-datetime** — composes `editor-date` + time picker; ISO 8601 commit. **Effort**: M.
- `[done: c1 #120]` **editor-time** — `<input type="time" />` styled with shadcn `Input`; 24h commit. **Effort**: S.
- `[done: c1 #127 (salvaged via #135)]` **editor-select** — native `<select>` (not shadcn); reads `column.options` (additive prop). Type-to-narrow via `seedKey`. **Effort**: M.
- `[done: c1 #138]` **editor-multi-select** — native `<select multiple>` (not shadcn); reuses `column.options`. Returns `readonly TValue[]`. **Effort**: M.
- `[done: c1 #143]` **editor-autocomplete** — native `<input list>` + `<datalist>` (not shadcn); async via `column.fetchOptions(query, signal)`. Debounced 200ms. AbortSignal races superseded fetches. **Effort**: M.
- `[done: c1 #88 (folded into editor-framework)]` **validation-framework** — sync + async validators with `AbortSignal` race semantics; `useEditingController` already exposes the full pipeline. **Effort**: S.
- `[done: c1 #128 (salvaged via #135)]` **dirty-tracking** — `BcEditState` map + visual states (`data-bc-grid-cell-state`); cell renderer params extension (`pending`, `editError`, `isDirty`). **Effort**: S.
- `[done: worker4 #166]` **bc-edit-grid-complete** — `<BcEditGrid>` Q2 fold-in: `onCellEditCommit` post-commit event with optimistic + rollback; integration with the action column from Q1. The optimistic-commit / rollback skeleton landed in #148; this PR closes the remaining RFC-level gaps audited against `editing-rfc` §Server commit + §Concurrency: per-commit `mutationId` stamping, stale-mutation guard so a re-edit during a pending Promise can't be rolled back by the older settle, overlay cleanup when consumer's `data` prop catches up to the patch, real commit-source attribution, and Delete-action disabling while a row has pending edits. **Effort**: M.
- `[review: worker3 #274]` **editor-keyboard-contract-v040** — focused React/editor controller tests for 0.4 keyboard lifecycle: F2, printable seed, Enter / Shift+Enter, Tab / Shift+Tab, Escape cancel, pending async commit, and validation rejection. Branch: `agent/worker3/editor-keyboard-contract-v040`. **Effort**: S.
- `[review: worker4 #168]` **editor-custom-recipe** — docs page in `apps/docs` with a worked custom-editor example (e.g., colour picker). Walks the `BcCellEditor` factory contract, focusRef-in-useLayoutEffect, seedKey, prepareResult, AT name + aria-describedby, portal-marker requirement, and `column.cellEditor` wiring. **Effort**: S.

#### Track 2 — Range + master-detail (Q3 surface)

Spec pending: `docs/design/range-rfc.md` (c2 to author).

- `[done: c2 #49]` **range-rfc** — design doc covering range model, anchor/extend semantics, multi-range, clipboard contract, fill handle. **Effort**: 1 day.
- `[review: worker1 #146]` **range-state-machine** — `BcRange` (already declared `api.md §reserved Q3`) state in `core/range.ts`; anchor + extend + multi-range. **Effort**: M.
- `[review: worker1 #263]` **visual-selection-layer** — v0.3 active range overlay polish: absolute-positioned range rectangles through virtualization and pinned columns; no fill handle. **Branch**: `agent/worker1/range-overlay-polish-v030`. **Effort**: M.
- `[review: worker1 #162]` **clipboard-copy-tsv-html** — Ctrl/Cmd+C serializes range to TSV (text/plain) + HTML (text/html) on the clipboard. **Effort**: S.
- `[review: worker1 #279]` **range-tsv-paste-parser-v040** — internal range TSV paste parser/planner helpers: spreadsheet quoted-cell handling plus anchor-to-visible-row/column planning with skipped/out-of-bounds metadata. **Branch**: `agent/worker1/range-tsv-paste-parser-v040`. **Effort**: XS.
- `[blocked: depends on clipboard-copy-tsv-html]` **clipboard-paste-from-excel** — Ctrl/Cmd+V parses clipboard TSV; applies cell-by-cell with per-column `valueParser` + `validate`; atomic apply (all-or-rollback). **Effort**: M.
- `[blocked: depends on clipboard-paste-from-excel]` **fill-handle** — drag-square at bottom-right of active range; drag to extend; release to fill (linear / copy / smart-fill). **Effort**: M.
- `[review: worker1 #216]` **range-interaction-hardening-v030** — v0.3 focused hardening for range/grid interaction edge cases: clear/reset on row/column model changes, keyboard bounds, empty selections, and invalid copy behavior. Avoids overlay #212 and fill-handle #207 code paths. **Branch**: `agent/worker1/range-interaction-hardening-v030`. **Effort**: S.
- `[done: c1 #140]` **master-detail** — expandable row that mounts a consumer-supplied detail component below the row. State via `expansion: ReadonlySet<RowId>` (already declared). `aria-level` + `role="treegrid"` when active. Independent of range work; can run in parallel. **Effort**: M.
- `[done: worker5 #232]` **master-detail-panel-polish** ⭐ — v0.3 UI polish for master/detail. Make the built-in detail row surface look intentional in shadcn/Tailwind v4 hosts: compact spacing, sane border/background layering, empty/loading/error affordance classes, nested-grid spacing, no text scaling or crude row morphs, and examples/docs showing customer contacts as a child grid/panel. Keep the detail API additive; coordinator owns Playwright visual verification. **Preferred owner: worker5.** **Effort**: S.
- `[review: worker5 #253]` **master-detail-hardening-v030** — v0.3 behavior/a11y hardening for master/detail: stable expansion state, ARIA labels/relationships, focus behavior, safe no-scale reveal, reduced-motion contract, and consumer child-grid guidance. **Effort**: S.
- `[review: worker5 #265]` **master-detail-production-polish-v030** — production polish for master/detail expansion states: instant row layout, no text scaling or row height morphing, safe detail-content reveal only, reduced-motion contract, and compact async child-state guidance. **Effort**: S.
- `[review: worker1 #238]` **column-groups-multi-row-headers** — multi-row column headers (e.g., parent header "Q1 Sales" with children "Jan / Feb / Mar"). Surface: `BcReactGridColumn.children?: BcReactGridColumn[]` (additive). Renders header rows for each level with `aria-colspan`. Independent; can run in parallel. **Effort**: M.
- `[review: x1 #110]` **sticky-header-polish** — refine the existing pinned-top header to maintain scroll-shadow + correct z-index against pinned-left/-right corners. Independent; can run in parallel. **Effort**: S.

#### Track 3 — Server row model (Q4 surface)

Spec already exists: `docs/design/server-query-rfc.md` (PR #2). No new RFC needed.

- `[done: x2 #60]` **server-paged-impl** — `BcServerGrid rowModel="paged"` with the `LoadServerPage` contract. AbortSignal handling, request dedup. **Branch**: `agent/x2/server-paged-impl`. **Effort**: M.
- `[review: worker3 #249]` **server-paged-integration-tests-v030** — v0.3 hardening for `BcServerGrid rowModel="paged"` integration: non-Playwright tests pin server `totalRows` pagination, no double-slicing of current page rows, and page reset semantics for server query state changes. **Branch**: `agent/worker3/server-paged-integration-tests-v030`. **Effort**: S.
- `[review: worker3 #250]` **server-grid-request-semantics-v030** — harden server-backed request semantics for sort/filter/search/group/visible columns, pagination, refresh/invalidate sequencing, stale response ordering, and diagnostics snapshots. **Branch**: `agent/worker3/server-grid-request-semantics-v030`. **Effort**: S.
- `[review: worker3 #280]` **server-paged-contract-hardening-v040** — harden `BcServerGrid rowModel="paged"` contract tests for server total rows, query-driven page reset, stale response ordering, visible-column requests, and no client double-slicing. Branch: `agent/worker3/server-paged-contract-hardening-v040`. **Effort**: S.
- `[done: x2 #85]` **infinite-mode-block-cache** — `rowModel="infinite"`: `ServerBlockCache` with LRU eviction; `LoadServerBlock` integration; viewport-driven block fetching with prefetch ahead. **Branch**: `agent/x2/infinite-mode-block-cache`. **Effort**: L (3-5 hours).
- `[review: x2 #90]` **server-tree-mode** — `rowModel="tree"`: lazy children fetching via `LoadServerTreeChildren`; expand/collapse triggers fetch; `ServerTreeRow` rendering. **Branch**: `agent/x2/server-tree-mode`. **Effort**: L.
- `[review: worker3 #180]` **mutation-pipeline** — `ServerRowPatch` apply path; optimistic UI with `pendingMutations` map; `ServerMutationResult` settle handling. Integrates with Track 1's `bc-edit-grid-complete`. **Branch**: `agent/worker3/mutation-pipeline`. **Effort**: M.
- `[done: worker3 #230]` **server-edit-mutation-api** — add high-level `BcServerGrid` edit commit adapter (`onServerRowMutation` + `createServerRowPatch`) and low-level `BcServerGridApi.queueServerRowMutation` / `settleServerRowMutation` methods; update server edit contract docs and API surface. **Effort**: S.
- `[review: worker3 #235]` **server-edit-grid-ux-example** ⭐ — v0.3 consumer-grade server edit example + contract hardening. Add/upgrade an examples/docs page that uses `BcServerGrid` with `onServerRowMutation`, visible optimistic pending/error/conflict states, refresh/invalidation affordances, controlled sort/filter/search/page wiring, and a small editable customer-style data set. Add focused tests for any helper contracts exposed while wiring the example. This is the bc-grid side of making bsncraft customers a real server edit grid. **Preferred owner: worker3.** **Effort**: M.
- `[review: worker3 #260]` **server-edit-semantics-v040** — 0.4 planning pass for server-backed editable grids: focused tests/docs for `BcServerGrid` edit commit semantics, optimistic mutation queue behavior, rollback/error expectations, and consumer-owned reload/validation policy. **Branch**: `agent/worker3/server-edit-semantics-v040`. **Effort**: XS.
- `[done: worker3 #183]` **invalidation-impl** — `ServerInvalidation` scopes (all / view / blocks / rows / tree). Refetch + cache eviction logic. **Branch**: `agent/worker3/invalidation-impl`. **Effort**: M.
- `[review: x2 #96]` **server-row-model-perf-tuning** — measure block fetch latency, debounce settings, cache hit rate at 100k+ rows. Add to nightly perf harness. **Branch**: `agent/x2/server-row-model-perf-tuning`. **Effort**: M.

#### Track 4 — Aggregations + Pivots (Q5 pulled forward)

Specs: `docs/design/aggregation-rfc.md` (PR #51) + `pivot-rfc.md` (PR #52).

- `[done: c2 #51]` **aggregation-rfc** — engine contract for `@bc-grid/aggregations` + React adapter. **Effort**: 1 day.
- `[done: integrator #112]` **aggregation-engine** — `@bc-grid/aggregations` package (currently stub). `sum`, `count`, `avg`, `min`, `max`, `registerAggregation`. Pure functions; no DOM. Per `design.md §4.2`. **Branch**: `agent/x2/aggregation-engine`. **Effort**: M.
- `[done: x2 #117]` **aggregation-react-adapter** — footer aggregation row + group-row aggregation rendering in `@bc-grid/react`. Wires `column.aggregation` (already declared `api.md §1.1`) to the engine. **Effort**: M.
- `[done: c2 #52]` **pivot-rfc** — engine vs React split; drag-to-pivot UI; row/col/values dimensions; treegrid output. **Effort**: 1 day.
- `[done: x2 #118]` **pivot-engine** — engine layer in `@bc-grid/aggregations` (or a separate `@bc-grid/pivots` if the RFC decides to split). Computes pivot table from rows + dimensions. **Effort**: L.
- `[review: worker5 #240]` **pivot-ui-drag-zones** — Pivot tool panel in the sidebar (Track 5) with row/col/values drop zones. **Effort**: M.
- `[review: worker1 #258]` **pivot-state-gridid-persistence-v030** — persist the public `pivotState` in `gridId` localStorage alongside grouping/sidebar state so saved pivot panel choices survive reloads. **Branch**: `agent/worker1/pivot-state-gridid-persistence-v030`. **Effort**: XS.
- `[ready]` **pivot-row-col-groups** — render the pivoted output: row-group axis, col-group axis, value cells. **Effort**: M.

#### Track 5 — Chrome (Q6 pulled forward)

Spec: `docs/design/chrome-rfc.md` (PR #46).

- `[done: c2 #46]` **chrome-rfc** — design doc; covers status-bar / sidebar tablist / context-menu.
- `[done: worker2 #151]` **status-bar-impl** — `BcGridProps.statusBar` slot + 4 built-in segments (total / filtered / selected / aggregations). `role="status"` with debounced polite announcements. **Effort**: M.
- `[done: worker5 #150]` **sidebar-impl** — right-edge collapsible icon rail + tablist semantics (no focus trap; standard Tab/Shift+Tab cycles panel controls); Esc closes the panel and returns focus to the icon. **Effort**: M.
- `[blocked: coordinator - umbrella; claim scoped v0.3 UI polish tasks below]` **shadcn-chrome-polish-pass** ⭐ — make visible grid chrome meet shadcn/Radix-quality UI standards instead of just consuming tokens. Audit and polish the column chooser, context menu, sidebar/tool panels, filter popup, pagination/footer controls, and master/detail disclosure chrome against current shadcn spacing, radius, border, focus-visible, menu item, destructive/disabled, overlay, and dark-mode conventions. Replace oversized/hacky panels and text buttons with compact, predictable internal primitives; keep no-runtime-dependency unless explicitly justified, but match shadcn visual/interaction behavior. Include docs/examples updates and focused unit tests for state/keyboard behavior; coordinator owns Playwright visual verification. **Preferred owner: worker2 or worker4.** **Effort**: M.
- `[review: worker4 #247]` **radix-shadcn-chrome-cleanup-slice-1** — first scoped slice of the chrome polish umbrella. Audit doc in `docs/coordination/radix-shadcn-chrome-cleanup.md` plus an internal pure helper `computePopupPosition` (Radix-Popper-style flip + clamp + `data-side` / `data-align`) used by the filter popup and context menu. Removes duplicated viewport-clamp math at three sites and fixes the FilterPopup viewport-overflow bug. No new runtime deps; pure-function math + matching JSDOM SSR tests. Documents what's left for follow-up slices (shared menu item primitive, focus-management hook, optional Radix-Popper swap). **Effort**: S.
- `[review: worker4 #252]` **popup-interaction-contracts** — second slice of the chrome polish umbrella. Normalizes interaction contracts across the four popup surfaces (filter popup, context menu, column-chooser menu, sidebar) to match Radix/shadcn conventions: `data-state="open"` on every popup root, `data-side` / `data-align` on the column-chooser (was missing), shared `usePopupDismiss` hook for Escape + outside-click + focus-return-to-trigger, and lifts the column-chooser's clamp math out of `grid.tsx` into the shared `computePopupPosition` (the third inline-clamp site). No new runtime deps; pure-helper tests for the dismiss decision logic + SSR markup contracts for the new attributes. Updates `docs/coordination/radix-shadcn-chrome-cleanup.md`. **Effort**: M.
- `[review: worker4 #268]` **filter-popup-chrome-polish** — fourth slice of the chrome polish umbrella; follows worker2's #231 with interaction-contract integration. Trigger funnel button gets `data-state="open" | "closed"` for shadcn / Radix CSS hooks (mirrors the popup root). Apply button focus-visible ring shifted to `outline-offset: 2px` so it's visible against the accent bg. Clear button moves to a shadcn-ghost treatment (no border, light hover bg). Filter popup root opts into the same fade-in animation pattern the tooltip uses (gated by `prefers-reduced-motion`). Header padding rationalised, active-dot bumped to 8px with a token-driven inner ring. SSR markup contracts for the new attributes. No new runtime deps. **Effort**: S.
- `[review: worker4 #261]` **popup-roving-focus** — third slice of the chrome polish umbrella. Adds `internal/use-roving-focus.ts` (pure helpers `nextEnabledIndex` / `firstEnabledIndex` / `lastEnabledIndex` / `nextMatchingIndex` / `decideRovingKey` + `useRovingFocus` React hook) for ArrowDown / Up / Home / End / Enter / Space / type-ahead with disabled-skip, no focus trap, no Escape (popup-dismiss owns that). Wires the column chooser with roving tabindex per WAI-ARIA Authoring Practices for menus. 31 SSR-safe pure-helper tests + 3 markup-contract tests for the column chooser's tabindex roving. **Effort**: S.
- `[review: worker4 #281]` **context-menu-column-commands-v040** — fortifies the column-context built-ins (pin-column-left / right / unpin / hide-column / autosize-column) that already shipped via #234. The user-facing surface is on main; the missing piece is the dispatch-path test coverage. Extracts `dispatchColumnCommand` from `internal/context-menu.tsx` to a separate module so each command's BcGridApi side-effect can be unit-tested without a live DOM, and adds an SSR markup test rendering the menu with column commands to confirm `BcGridMenuItem` integration (icon, label, aria-disabled). No new runtime deps; no new public API; no broad rewrite. **Effort**: S.
- `[review: worker4 #234]` **context-menu-column-commands-slice** ⭐ — next context-menu command-map implementation slice. Add shadcn-quality column command items with real API backing where needed: pin left/right/unpin, hide column, autosize column, and a compact column-menu/chooser visual treatment that does not look like a prototype. Keep commands opt-in or behind the existing context-menu factory contract if default churn is risky. Add focused helper/API tests and docs. **Preferred owner: worker4.** **Effort**: M.
- `[review: worker5 #160]` **tool-panel-columns** — Columns tool panel inside sidebar: search, drag-to-reorder (keyboard accessible), visibility checkbox, pin dropdown, group-by drop zone. **Effort**: M.
- `[done: worker5 #204]` **tool-panel-filters** — Filters tool panel: list active filters with inline-editable variants (text/number/date/set/boolean from Track 6). Clear-all button. **Effort**: M.
- `[done: worker3 #157]` **context-menu-impl** — lightweight grid context menu; right-click + long-press (500ms coarse pointer) + Shift+F10. Minimal copy/clear built-ins + custom factory function. **Effort**: M.
- `[done: worker4 #220]` **context-menu-command-map** — design doc + pure-helper test pass mapping the v0.3 context-menu surface against the current built-ins (copy / copy-with-headers / clear-selection / clear-range) and `BcGridApi` commands. Output: `docs/design/context-menu-command-map.md` covering expected menu groups (clipboard / range / filter / column / row / export), API additions required (`getFilter`, `clearFilter(columnId?)`, `setColumnPinned`, `setColumnHidden`, `autoSizeColumn`), and built-in ID extensions (`clear-all-filters`, `pin-left` / `pin-right` / `unpin`, `hide-column`, `autosize-column`, `export-csv` / `export-xlsx` per chrome-rfc). Defers the implementation PR; this PR is **docs + tests only.** Adds edge-case tests for separator handling, key uniqueness, null/false filtering. **Effort**: S.
- `[done: worker4 #229]` **context-menu-command-impl-slice-1** — first implementation slice of the command map. Adds `BcGridApi.getFilter()` + `BcGridApi.clearFilter(columnId?)` (additive), the pure helper `removeColumnFromFilter` in `packages/react/src/filter.ts`, two new built-in IDs `clear-all-filters` + `clear-column-filter`, label / disabled-state / dispatch wiring. Per the brief: keeps `DEFAULT_CONTEXT_MENU_ITEMS` untouched (consumers opt in). Updates `docs/api.md`. Tests cover the new API methods, the pure helper, and the built-in resolver/disabled paths. **Effort**: S.
- `[review: worker2 #255]` **context-menu-clipboard-and-bulk-commands** — third context-menu command-map slice. Adds clipboard + row + bulk-column built-in IDs that don't need new `BcGridApi` methods (reuses existing `copyRange`, `setColumnState`, `autoSizeColumn`): `copy-cell`, `copy-row`, `show-all-columns`, `autosize-all-columns`. Promotes a richer `DEFAULT_CONTEXT_MENU_ITEMS` so bsncraft-style consumers get a useful menu without custom wiring. Disabled-state predicates + per-item icons + tests + docs note. Does NOT duplicate worker4's #234 column-commands slice (those land separately) or the set-filter polish in #248. **Effort**: S.
- `[review: worker2 #266]` **shadcn-menu-visual-polish-v030** — visual polish pass on the context menu + column-visibility menu chrome to match shadcn DropdownMenu conventions. Tighter rows + transition-colors, distinct keyboard-focus state via `--bc-grid-accent-soft`, full-bleed separators, `pointer-events: none` on disabled rows, and an opt-in `[data-variant="destructive"]` rule for custom destructive items (paired with a `variant?: "destructive"` field on `BcContextMenuCustomItem`). Tokens-only — no new direct shadcn-token reads. Companion to worker2's open #259 menu-item primitive (lands cleanly with or without it). Updates `docs/coordination/radix-shadcn-chrome-cleanup.md`. **Effort**: S.
- `[review: worker2 #278]` **pagination-footer-shadcn-polish-v040** — pagination + footer chrome polish to first-class shadcn IconButton + chevron-select quality. Replaces the text-only "First / Prev / Next / Last" buttons with square 2 rem icon-only buttons (chevron-left / right + double-chevron-left / right glyphs in a new `internal/pagination-icons.tsx`) keyed off `aria-label` for AT users. Adds a custom CSS chevron on the page-size `<select>` via `appearance: none` + `mask-image` + `currentColor` so the dropdown affordance reads cleanly across light / dark / forced-colors without a per-mode override. Adds the previously-missing `.bc-grid-footer` rule, `transition-colors` on the buttons + select, and a `cursor: default` + `pointer-events: none` disabled treatment matching slice 3.5. Tokens-only — no direct shadcn-token reads added (theming-test pin enforces this). Render-tests pin the icon SVG + aria-label preservation; CSS-contract tests pin the chevron rule, the disabled treatment, and the no-direct-token-read invariant. Updates `docs/coordination/radix-shadcn-chrome-cleanup.md`. **Effort**: S.
- `[done: worker2 #154]` **footer-aggregations** — wire the `aggregations` status-bar segment to the aggregation-engine output. **Effort**: S.

#### Track 6 — Filters + Export (Q6 pulled forward)

Spec pending: `docs/design/filter-registry-rfc.md` (c2 to author).

- `[done: c2 #48]` **filter-registry-rfc** — extension protocol; `BcFilterDefinition` / `BcReactFilterDefinition`; persistence shape; 7 built-in filter specs. **Effort**: 1 day.
- `[done: c1 #145]` **filter-popup-variant** ⭐ — When `column.filter.variant === "popup"`, render a header-icon (funnel) that opens a shadcn `Popover` with the existing text/number/date/boolean filter editor inside, instead of the inline-row input. Active state: solid/blue funnel + underline on the header, cleared by an `×` in the popover footer. The inline row collapses for that column when popup is active; if every column is popup-variant the row disappears entirely. AG-Grid-feel. Reuses existing filter editors — no logic duplication. **Demo-critical** (week 2). **Effort**: M.
- `[review: worker1 #156]` **filter-set-impl** ⭐ — multi-select dropdown of distinct values. Lazy-loaded on first open. **Demo-critical** (week 2). **Effort**: M.
- `[review: worker1 #175]` **filter-multi-impl** — same as set but for multi-select columns (already-array values). **Effort**: M.
- `[review: worker2 #164]` **filter-date-range-impl** — between two dates; uses shadcn date-picker. **Effort**: M.
- `[review: worker2 #159]` **filter-number-range-impl** — between two numbers. **Effort**: S.
- `[review: worker2 #237]` **filter-text-impl-extend** — extend the existing inline text filter with operators (contains / starts-with / ends-with / equals / regex toggle / case-sensitivity toggle). **Effort**: S.
- `[done: worker2 #231]` **filter-popup-shadcn-polish** ⭐ — v0.3 polish for filter popup controls and active-filter affordances. Make text/number/date/set/boolean filter popup surfaces compact and shadcn-consistent: trigger icon, popover sizing, footer buttons, clear/apply affordances, focus-visible, disabled states, dark mode, and active indicators. Reuse existing filter logic; no Playwright. **Preferred owner: worker2.** **Effort**: M.
- `[review: worker1 #177]` **filter-custom-extension-example** — recipe in `apps/docs` showing how to register a custom filter type. **Effort**: S.
- `[review: worker4 #193 rescue, supersedes #178]` **filter-persistence** — URL state + `localStorage` backends for filter state. Pairs with the column-state persistence work in Track 0. **Branch**: `agent/worker4/filter-persistence-rescue` (supersedes #178 / `agent/worker1/filter-persistence`, which was diverging from main). **Effort**: S.
- `[done: worker2 #228]` **filter-state-followups** — document filter/sidebarPanel persistence semantics and pin the `showFilterRow` contract with focused tests so hidden filter rows do not imply cleared filter state. **Effort**: XS.
- `[done: x2 #72]` **export-csv-impl** — `@bc-grid/export.toCsv(rows, columns)` per `api.md §9`. No external deps; pure serializer. **Branch**: `agent/x2/export-csv-impl`. **Effort**: S.
- `[done: x2 #75]` **export-xlsx-impl** — peer-dep on **ExcelJS** (confirmed in coordination plan). `toExcel(rows, columns)`. **Branch**: `agent/x2/export-xlsx-impl`. **Effort**: M.
- `[review: x2 #77]` **export-pdf-impl** — peer-dep on **jsPDF** (confirmed in coordination plan; alternative `react-pdf` if jsPDF doesn't fit; first PR picks the winner). `toPdf(rows, columns)`. **Branch**: `agent/x2/export-pdf-impl`. **Effort**: M.
- `[review: x1 #111]` **export-server-mode** — wire `ServerExportQuery` (already declared in core) to a server-mode export flow: blob / url / job response handling. **Effort**: S.

#### Track 7 — Polish + Mobile (Q7 pulled forward)

Charts are post-1.0. `docs/design/charts-rfc.md` is retained as a future peer-dep adapter design draft, not a v1.0 blocker.

- `[deferred: post-1.0]` **charts-rfc** — peer-dep architecture (consumer brings library); recharts as a documented default; adapter shape; worked examples in apps/docs. Design draft only until post-1.0.
- `[deferred: post-1.0]` **charts-peer-dep-integration** — adapter package/module; hook/helper-based chart data; consumer-supplied chart component. Not a v1.0 task.
- `[review: worker3 #188]` **streaming-row-updates** — server pushes new rows mid-session via `ServerRowUpdate` types (already in core); animated insertion via FLIP. Consumer subscribes via a hook. **Effort**: M.
- `[review: worker4 #236]` **mobile-touch-fallback** — `accessibility-rfc §Pointer and Touch Fallback`: 44px hit targets in coarse-pointer mode; double-tap to edit; long-press 500ms for context menu; pointer selection handles 44px. **Effort**: M.
- `[review: worker4 #191]` **wcag-code-pass** — code-only precursor to `wcag-deep-pass`. Walks `accessibility-rfc` + `audit-c2-003` + `audit-c2-004` for low-risk static a11y issues that are verifiable by unit tests or code inspection (no Playwright / no axe browser scan / no manual AT runs). Fixes localized hardcoded a11y strings, extracts pure helpers for ARIA computations, and asserts the theming CSS contract for `prefers-reduced-motion` / `forced-colors` / `pointer: coarse`. Authors `docs/design/a11y-impl-report.md` with a checklist of fixes + remaining browser/manual validation owned by `wcag-deep-pass`. **Effort**: S.
- `[ready]` **wcag-deep-pass** — full axe-core audit on every demo + manual NVDA / JAWS / VoiceOver runs; fix any findings. Generates a `docs/design/a11y-impl-report.md`. **Effort**: M.
- `[review: worker5 #190]` **animation-polish** — review every transition (sort / filter / expand / collapse / insert / remove / cell-flash); tune to 60fps; document the motion system. **Effort**: M.
- `[review: worker5 #246]` **motion-polish-no-scale-v030** — v0.3 follow-up to remove text-scaling / row-morph motion from expand, collapse, detail, row update, and flash transitions; document the no-scale motion rule. **Effort**: S.
- `[ready]` **browser-compat-matrix** — full Chromium / FF / WebKit / Safari / Edge pass on the AR Customers demo + standalone tests. Document any known issues. **Effort**: S.
- `[review: x1 #108]` **migration-guide** — from AG Grid Community + Enterprise to bc-grid; documented patterns; side-by-side examples; no codemod (out-of-scope). Lives in `apps/docs`. **Effort**: M.
- `[review: worker4 #225]` **filter-persistence-contract-audit** — audit `packages/react/src/persistence.ts` against what consumers expect: what persists where (localStorage vs URL), what clears, what is intentionally asymmetric, and what should not be overclaimed. Output: `docs/coordination/v030-filter-persistence-contract.md` with a contract table + corner-case matrix; extends `packages/react/tests/persistence.test.ts` with focused round-trip tests for the corners that the existing suite misses (custom filter pass-through, `sidebarPanel: null`, URL-only `sort` asymmetry, empty-storage read shape, URL state with empty arrays). **Docs + tests only — no code changes; no clearly isolated bugs found during audit.** **Effort**: XS.

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
