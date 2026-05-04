# Release Milestone Roadmap

Coordinator-owned checklist for moving from the current `0.1.x` alpha line toward `1.0.0`.

This document is a release gate, not a deadline. Do not rush work to satisfy a version number. If a milestone grows, split it and insert another `0.x.0` release. If the product is genuinely ready, it is acceptable to skip a numeric stop, for example `0.8.0` to `1.0.0`.

## Coordinator Rule

At the start of each coordination session:

1. Check this file, `docs/queue.md`, open PRs, and CI.
2. Keep each milestone checkbox honest as PRs merge.
3. When every item in the next milestone is complete and the release gates pass, tell the maintainer: `Milestone vX.Y.0 is ready; recommend bumping versions and publishing packages.`
4. Do not start a new feature train if the next milestone only needs review, merge, packaging, or consumer validation.

## Release Gates

Every milestone release candidate must satisfy these gates before the coordinator suggests a version bump:

- [ ] `main` is green in CI.
- [ ] Type-check, lint, unit tests, package builds, API-surface, bundle-size, and tarball-smoke pass.
- [ ] Coordinator-owned Playwright and smoke-perf checks pass, or failures are explicitly documented as non-blocking.
- [ ] `~/work/bsncraft` can install the candidate version and pass its type-check/build smoke for the grid surfaces it uses.
- [ ] Package metadata has no internal `@bc-grid/*` version skew or workspace leakage in published artifacts. Automated by `bun run release-preflight` (`tools/release-preflight`); the same script runs in `release.yml` before `bun publish` and fails when source / packed-tarball / release-tag are out of step.
- [ ] `docs/queue.md` reflects merged, deferred, or blocked work accurately.
- [ ] Known issues are documented with a severity call; no P0/P1 issue is open.

## v0.2.0 - Integration-Stable Alpha

Goal: make the published package line boring to consume in `bsncraft`.

> **Candidate snapshot (2026-05-01):** `coordinator/v020-release-prep` has all 11 publishable packages bumped to `0.2.0`. `RELEASE_TAG=v0.2.0 bun run release-preflight` reports source-version coherence, source-side `workspace:*` internal dependencies, coherent packed metadata, and tag/source match. Local gates pass: type-check, lint, unit tests, package builds, API-surface, bundle-size, tarball-smoke, and release-preflight. A detached `bsncraft` smoke using local `0.2.0` tarballs installs cleanly and passes `bun run check-types` after the wrapper widens `handleGridFilterChange` to accept the `null` filter state emitted when filters are cleared.
>
> **Released (2026-05-01):** tag `v0.2.0` published all 11 packages to GitHub Packages. Release workflow passed type-check, lint, unit tests, package builds, bundle-size, API-surface, release-preflight, tarball-smoke, and publish. Coordinator Playwright Chromium slice passed 141/141 before tagging. The remaining `bsncraft` work is consumer integration validation and wrapper cleanup on its own branch.

- [x] Published package metadata is coherent: all internal `@bc-grid/*` dependencies resolve to the same release line. Enforced by `bun run release-preflight` (source-version coherence + workspace:* policy in source + no workspace: leak in packed tarballs + tag/source match when running under a release tag).
- [x] Host apps do not need hidden CSS knowledge for core layout: fixed-height grids scroll vertically, header/body widths stay aligned, and resize affordances are visible.
- [x] Sorting, column resize, pinned columns, vertical scrolling, and basic filters are stable in fit-to-screen mode.
- [ ] `bsncraft` installs the candidate, passes `bun run check-types`, and can load representative grid pages without import/export errors. **Package-side result:** local tarball install passes after one consumer typing fix for nullable filter callbacks; unpatched `bsncraft` still needs that wrapper update.
- [x] Bundle budget remains under the current `100 KiB` gzip hard cap with the per-PR drift guard intact (`65.64 KiB` gzip on the v0.2.0 candidate).
- [x] README install guidance and package docs match the actual release process.

## v0.3.0 - Filtering, Search, and Persistence

Goal: complete the day-to-day data finding workflow.

- [ ] Text, number/range, date/range, boolean, set, and multi-value filters are implemented and covered.
- [ ] Popup filter variant and filters tool panel are merged, accessible, and documented.
- [ ] Filter state persists through URL and `localStorage` where configured.
- [ ] Search applies to the row model and highlights matches without breaking virtualization.
- [ ] Custom filter extension recipe is published in docs.
- [ ] `bsncraft` can exercise the common customer/vendor/invoice filter flows without local patches.

## v0.4.0 - Editing, Validation, and Server Edit Alpha

Goal: make editable ERP grids viable.

> **Released (2026-05-02):** tag `v0.4.0` published all 11 packages to GitHub Packages (release workflow run `25239702075`). First publish attempt failed at release-preflight check 3 because `bun install` after the version-bump commit short-circuited and left `bun.lock` workspace pins on `0.3.0`; fix in `fcff970` regenerated `bun.lock`, the broken tag was deleted (never published), and `v0.4.0` was re-tagged at the fix commit. Local gates green pre-publish: type-check, lint, unit tests, package builds, API-surface, bundle-size (`@bc-grid/react` baseline reset to 71500 B post-#353), tarball-smoke, release-preflight, bsncraft `check-types`, Playwright (`test:e2e` over spike-chromium + examples-chromium). Coordinator validated published `0.4.0` packages install + type-check from `~/work/bsncraft` (`@bc-grid/react@0.4.0` + `@bc-grid/theming@0.4.0` smoke, then reverted to leave bsncraft's `bcg-migration` branch undisturbed for their own bump cycle). Audit synthesis at `docs/coordination/audit-2026-05/synthesis.md` drove two v0.4 P0 hotfixes (#354 date-editor focus fix, #356 visible validation surface). Other audit P0s scoped to v0.5 per the synthesis sprint plan; do not gate v0.4.
>
> **Alpha focus:** see `docs/coordination/v0.4-alpha-plan.md`. `v0.4-alpha` proved the editing contract and server-backed edit contract before broad spreadsheet workflows. User-facing clipboard paste and fill handle remain `v0.6.0` gates (renumbered from `v0.5.0` after the 2026-05-02 audit-refactor pivot).

- [x] `BcEditGrid` commit lifecycle is complete: prepare, validate, commit, optimistic update, rollback, and stale mutation handling. (Hardened across the v0.4 train; editor state machine pinned by audit.)
- [x] Built-in editors are complete enough for ERP data entry: text, number, date, datetime, time, select, multi-select, autocomplete, and boolean/checkbox. (date/datetime/time silent-commit bug closed in #354.)
- [x] Lookup/select/autocomplete editors have clear typed-value, async-options, pending, and error contracts. (#340 + #346; shadcn Combobox migration deferred to v0.5 Colour Selection hero spike.)
- [x] Dirty, pending, and error states render clearly and announce correctly. (#356 added the visible validation popover — sighted users can now see *why* a cell rejected.)
- [x] Keyboard editing flows are covered: Enter, F2, Escape, Tab, Shift+Tab, click-outside, and portal-aware interactions. (Backspace/Delete clear deferred to v0.5 per audit P1-W3-1.)
- [x] Server-backed edit grids have documented and tested semantics for paged rows, total rows, sort/filter/search refetch, pending optimistic mutations, rollback, and stale responses. (#343, #344, #353 `rowProcessingMode`, server-grid-flicker.md.)
- [x] Custom editor recipe is documented and uses the same contract as built-in editors. (Custom-editor `getValue?` hook deferred to v0.5 per audit P1-W3-6.)
- [x] Examples app exposes editing and grouping clearly enough that the maintainer can find and test the features without hidden knowledge. (#341, #346, #348.)
- [x] `bsncraft` can wire at least one realistic editable server-backed grid without forking bc-grid. (Customers grid; AR data grids; bsncraft type-check passes against current main.)

## v0.5.0 - Audit-Driven Ergonomics Refactor

Goal: every CRUD grid in the BusinessCraft ERP becomes ~30 lines of consumer code instead of ~200, and each of the four hero use cases (sales estimating, production estimating, colour selection, document management) renders cleanly in <100 LOC of consumer code as a spike grid.

> **Alpha released (2026-05-03):** tag `v0.5.0-alpha.1` published all 11 packages to GitHub Packages (release workflow run `25263638850`). All audit P0 items closed except the bsncraft customers migration (in-flight, bsncraft team drafting). All coordinator gates green at the alpha-1 cut: type-check, lint, 1262/0 unit tests, build, api-surface, bundle-size (91.12 KiB / 100 KiB hard cap), tarball-smoke, release-preflight, 142/142 Playwright e2e, 3/3 smoke-perf (1 deferred-skip).

> **Alpha.2 released (2026-05-03):** tag `v0.5.0-alpha.2` published all 11 packages to GitHub Packages (release workflow run `25269910620`). All coordinator gates green at the alpha-2 cut: type-check, lint, 1447/0 unit tests across 99 files, build, api-surface (9 enforced + 2 planned), bundle-size (99.11 KiB / 100 KiB hard cap; baseline reset to 90562 bytes), tarball-smoke, release-preflight (4/4 checks). bsncraft can now consume `@bc-grid/*@0.5.0-alpha.2` from the registry. **Alpha.2 work train (post-alpha.1):** chrome bundles 1+2 (#396/#399 worker2), row-action context menu (#404 worker2), group-before-paginate (#405 worker2), mode-switch RFC stages 1-3.2 (#397/#400/#402/#406 worker1 — additive apiRef → props collapse → runtime polymorphism → pending-mutation grace + sync loading frame), editor-toggle props (#395 worker3), editor-portal polish bundle-1 (#398 worker3 — editorActivation / editorBlurAction / escDiscardsRow), result-aware `onCellEditCommit` (#401 worker3), autocomplete prepareResult preload (#403 worker3), bsncraft paper-cut fixes (cellEditor-union widening + ServerMutationResult JSDoc 0906467, pinned-cell shading parity 5341af3, DOM-rect editor positioning 628949c, column.flex distribution d7eddaf), and conditional row tinting (`rowClassName` + `rowStyle` 359cf51).

> **Alpha.3 cut (2026-05-03):** version bumped 0.5.0-alpha.2 → 0.5.0-alpha.3 across all 11 packages; bun.lock refreshed; bundle baseline reset 90562 → 92544 bytes (88.44 KiB → 90.38 KiB) for `@bc-grid/react` to capture alpha.3 work train. **Alpha.3 work train (post-alpha.2):** mode-switch RFC stage 3.3 + polymorphic `useServerGrid` (#417, #409 worker1 — closes the mode-switch RFC entirely); layout architecture pass (#415 worker1 / #416 worker2 / #418 worker3 — single `.bc-grid-viewport` container + sticky-positioned headers + pinned cells + detail-panel sticky-left + `editorCellRect` simplification + `availableGridWidth` ResizeObserver removal); in-cell editor mode RFC (#408, #412 worker3 — framework + popup flag + scroll-out semantics + text/number/checkbox/time/date/datetime migration); validation flash + status-bar segment (#407 worker3); default chrome context menu wired (#419 worker2 chrome / #420 worker1 server / #421 worker3 editor — `Server` / `Column` / `View` / `Editor` submenus + row actions + dismiss-latest-error + in-memory `BcUserSettings` fallback); editor visual contract consolidation (#424 worker3 — canonical `data-bc-grid-edit-state` attribute + six tokens + dual-attribute helper for one-release migration); saved-view DTO + helpers (#423 worker2 — `BcSavedView` + `createSavedView` / `applySavedViewLayout` / `migrateSavedViewLayout` + recipe); v0.6 server-perf §5 LRU eviction unit tests + smoke-perf bench (#422 worker1); bsncraft alpha.2 P0 #1/#3 + P1 #10 fixes (#425 coordinator — opaque `--bc-grid-row-hover` token + `editable` defaults to `cellEditor != null`). All coordinator gates green at the alpha.3 cut: type-check, lint, 1651/0 unit tests across 110 files, build, api-surface, bundle-size (101.05 KiB / 150 KiB hard cap; baseline reset to 92544 bytes), tarball-smoke, release-preflight (4/4 checks).

> **GA cut (2026-05-03):** version bumped 0.5.0-alpha.3 → 0.5.0 across all 11 packages; bun.lock refreshed; bundle baseline reset 92544 → 93725 bytes (90.38 KiB → 91.53 KiB) for `@bc-grid/react` to capture the post-alpha.3 work train. **Pivot:** strategic call to ship 0.5.0 GA now (not alpha.4) and absorb remaining bsncraft consumer feedback into v0.6 — feedback loops can span major versions when the cadence is fast enough. Target 1.0 in a week. **0.5.0 GA work train (post-alpha.3):** prefetch-budget tuning + Server submenu Prefetch ahead radio (#428 worker1 — `BcUserSettings.prefetchAhead`, `BcGridApi.getPrefetchAhead/setPrefetchAhead`, mode-conditional submenu); ERP filter operators (#429 worker2 — text `not-equals` / `does-not-contain`, date relative tokens incl. fiscal-quarter / fiscal-year, `current-user` / `current-team` predicates with `BcFilterPredicateContext`); row-state cascade scoping (#426 RFC + #430 impl, worker3 — `:not()` selector guards on 16 selectors so master row hover doesn't bleed into nested grid cells; closes bsncraft P0 #2); editor keyboard navigation polish (#431 worker3 — `nextEditableCellAfterEdit` helper skips non-editable cells + disabled rows during Tab/Shift+Tab); multi-mode Combobox Enter contract pinned (#427 worker3 — 4 source-shape regression guards). Release workflow updated to auto-create GitHub Release entries on every tag push (`gh release create --generate-notes`); historical v0.1.0-alpha.1 → v0.5.0-alpha.3 tags backfilled as Release entries so the cadence is visible at github.com/bc-grid/bc-grid/releases. All coordinator gates green at the GA cut: type-check, lint, 1705/0 unit tests across 111 files, build, api-surface, bundle-size (102.20 KiB / 150 KiB hard cap), tarball-smoke, release-preflight (4/4 checks).

> **v0.6.0-alpha.1 cut (2026-05-04):** version bumped 0.5.0 → 0.6.0-alpha.1 across all 11 packages; bun.lock refreshed; bundle baseline reset 91.53 KiB → 103.68 KiB for `@bc-grid/react` (core 2.07 → 2.23 KiB) to capture the v0.6 work train. **0.6.0-alpha.1 work train (post-0.5.0 GA):** three v0.6 headlines shipped — client tree row model phases 1+2 (#447 worker1 — `BcGridProps.treeData` + `getRowParentId` + outline column + sort/filter through tree + aggregations integration; closes the AG-Grid-parity gap for client-side parent/child data), fill handle (#436 worker2 — drag-to-fill on active range with literal-repeat + #456 series detection for arithmetic / date / weekday / month series), bulk row patch primitive (#437 worker3 — `BcGridApi.applyRowPatches([...])` atomic bulk update); state-persistence story (#450 worker3 — `BcGridProps.initialScrollOffset` + `onScrollChange` + `BcGridApi.getScrollOffset`; pairs with the existing controlled `expansion` / `selection` / `layoutState` for full grid-state-restore), server-grid actions column (#453 worker3 — auto-injected `__bc_actions` on `<BcServerGrid>` matching `<BcEditGrid>`; closes bsncraft P1 architectural ask, ~150 LOC saving for bsncraft alone); supporting work (#439 bulk-action toolbar slot, #446 pinned totals row, #441 saved-view storage recipe, #448 editor tab wraparound, #442 BcSelection narrowing helpers, #435 prepareresult preload select+multi, #454 per-cell undo/redo, #440 row drag-drop hooks, #457 editor focus-retention pin); server-perf hardening (#428 prefetch budget radio, #433 stale-flood test, #434 stale-viewKey gate, #444 view-change reset policy, #445 optimistic rollback vs invalidate); bsncraft 0.5.0 GA P0 patches (#443 pinned-right column overlap + header z-index, #451 in-cell editor unmount on `<BcServerGrid>` server fetch). All coordinator gates green at the alpha.1 cut: type-check, lint, 1911/0 unit tests across 125 files, build, api-surface, bundle-size (114.51 KiB / 150 KiB hard cap), tarball-smoke, release-preflight (4/4 checks).

> **v0.6.0-alpha.2 cut (2026-05-04):** version bumped 0.6.0-alpha.1 → 0.6.0-alpha.2 across all 11 packages; bun.lock regenerated. Bundle baselines reset for `@bc-grid/react` (103.68 → 109.52 KiB) and `@bc-grid/core` (2.23 KiB → 0.35 KiB; tree-shake gain after server-block error types moved to type-only exports — runtime helper `resolveBlockRetryDecision` lives in `@bc-grid/react`). **0.6.0-alpha.2 work train (post-alpha.1):** bsncraft P0/P1 fixes — pinned-lane Option B count-agnostic 3-track template (#479 coordinator, RFC ratified by all 3 workers), submenu collision-flip when right edge overflows viewport (#469 coordinator), server-tree group rows render correctly (#465 coordinator — `serverRowEntryOverrides` map preserves group metadata stripped by flat-node mapping), in-cell editor unmount fix on `<BcServerGrid>` server fetch (#451 coordinator — cleanupRowRef pattern decouples useLayoutEffect deps from re-render churn); shadcn-native editor render-prop cluster — `createTextEditor` + `inputComponent` slot (#480), numeric batch (#488 — `createNumberEditor` / `createDateEditor` / `createDatetimeEditor` / `createTimeEditor` sharing `EditorInputSlotProps`), `createCheckboxEditor` + `checkboxComponent` (#489 first slice of select-batch); server-grid affordances — `BcServerGridProps.onBlockError` + `autoRetryBlocks` with default 3-attempt 1s/2s/4s backoff + `resolveBlockRetryDecision` helper (#491 worker1), server display column order threaded through paged path (#487 worker1 — `ServerViewState.displayColumnOrder` + `resolveServerDisplayColumns` helper), `useServerPagedGrid` dual-output `bound` for `<BcGrid>` consumers (#484 worker1); UX polish — actions-column keyboard shortcuts Shift+E / Shift+Delete / Shift+Backspace (#464 worker3), toolbar render-prop context with composable sub-slots (#492 worker2 — `BcToolbarContext` exposing api/setters + pre-built searchInput/groupByDropdown/densityPicker/clearFiltersButton/savedViewPicker), tree-mode Option B regression guard (#481 coordinator); v1.0 prep — editor a11y audit doc with 6/9 pass + 3 mechanical-fix gap on date/datetime/time aria-describedby (#490 worker1), deferral docs for infinite/tree dual-output IMPL (#485) + body-cell memoisation perf experiment (#486). All coordinator gates green at the alpha.2 cut: type-check, lint, 2112/0 unit tests across 140 files, build, api-surface (10 enforced + 1 planned), bundle-size (118.47 KiB / 150 KiB hard cap), tarball-smoke (11/11 packages install + type-check from tarballs), release-preflight (3/3 checks). Worker1 has 3 stacked PRs awaiting rebase (#470 cache stats, #452 client tree phase 2.5, #455 client tree phase 3) — flagged as top priority in handoff for next merge train; alpha.2 cut without them since the headline tree row model phases 1+2 already shipped in alpha.1 and these are enhancements.

> **v0.6.0-alpha.3 cut (2026-05-04):** version bumped 0.6.0-alpha.2 → 0.6.0-alpha.3 across all 11 packages; bun.lock regenerated. Bundle baseline shrunk slightly for `@bc-grid/react` (109.52 → 112.34 KiB at the new baseline reset point — net of Radix runtime add and ~2,400 LOC in-house deletion across PR-B1 + PR-B3). **Alpha.3 work train (post-alpha.2):** v1.0 architecture-correction RFC ratified at `docs/design/shadcn-radix-correction-rfc.md` (894f53f, binding for v0.7) — every chrome primitive sources from `~/work/bsncraft/packages/ui/src/components/` so the eventual bsncraft monorepo merge is a path-rename. **v0.7 Block A complete:** PR-A1 #501 + resync #503 (Radix runtime deps + 13 shadcn primitives copied from `@bsn/ui`) + PR-A2 #504 (happy-dom + `@testing-library/react` test infra). **v0.7 Block B partially complete:** PR-B1 #510 (replaced context-menu + header column-options with Radix `ContextMenu` / `DropdownMenu`; deleted `menu-item.tsx` + `context-menu-icons.tsx`; reduced `context-menu.tsx` from 532 → ~56 LOC) + PR-B3 #518 (replaced `BcGridTooltip` with shadcn Radix Tooltip + header funnel filter popovers with shadcn Radix Popover; deleted `popup-position.ts` + `popup-dismiss.ts` + `use-roving-focus.ts`; -1,482 LOC net). **v0.7 Block C partially complete:** PR-C1 #520 (cmdk + Radix Popover deps in `@bc-grid/editors` + `command.tsx` / `popover.tsx` / `dialog.tsx` primitives copied from `@bc-grid/react/shadcn`; foundation for PR-C2 editor migration). **Alpha.3 alpha.2-train follow-throughs merged:** editor a11y fix (#493 — date / datetime / time aria-describedby + visually-hidden error span; closes the 3-editor gap from #490 audit), quick filter toolbar input (#495 worker2 — opt-in `quickFilter` prop + `ctx.quickFilterInput` toolbar slot), client tree row model phase 2.5 (#452 worker1 — per-subtree sort + parent-row aggregations) + phase 3 (#455 worker1 — cycle detection + keepAncestors + outline keyboard nav), submenu collision-flip "neither side fits" enhancement (3ff7a16 coordinator — flips to less-worse side instead of staying offscreen) + Playwright regression guard, server-row cache stats (#470 worker1 — `BcServerGridApi.getCacheStats()` + `BcServerCacheStats` interface), server-grid CSV export (#498 worker1 — `getExportPlan` + `streamServerGridToCsv`), server tree expansion persistence (#496 worker1 — `BcServerGridProps.preserveExpansionOnViewChange`), v07 cursor-pagination IMPL deferral doc (#499). **v1.0 freeze prep merged:** API surface freeze audit (#502 worker1 — 430 exports walked, 86% LOCK), API surface §15 closed entirely across slices 1-4 (#505 cross-package symmetry + server-row-model planned→enforced + 1 deprecation comment, #507 INTERNALIZE `serverRowEntryOverrides`, #508 RENAME `Use*BoundProps` → `Use*ServerProps`, #514 OPEN QUESTIONs compiled into audit §16.1 + tracking issue #512 for maintainer pass), browser compat matrix doc (#509 — single-table v0.10 RC gate doc), examples app cleanup (#511 — `?hero=<slug>` URL flag + landing card surfaces all four hero spike grids), screenreader code-pass audit (#516 — 12 surfaces matrix, 10 PASS + 2 GAPs flagged) + treegrid ARIA fixes for both client-tree (#517) and server-tree (#519) modes (closes both audit GAPs). All coordinator gates green at the alpha.3 cut: type-check, lint, 2069/0 unit tests across 138 files, build, api-surface (11 enforced + 0 planned), bundle-size (121.29 KiB / 150 KiB hard cap; baseline reset to 115016 bytes ≈ 112.34 KiB), tarball-smoke (11/11 packages install + type-check from tarballs), release-preflight (3/3 checks), smoke-perf 3/3 (1 skipped pending Track 1 editing). bsncraft soak validation requested on alpha.3 to gate alpha.4 vs roll-to-GA. **Open v0.7 work** (worker2 + worker3 lanes, ~5 PRs): PR-B2 (tool panels → Radix Tabs + Sheet), PR-B4 (lucide icon sweep on header / pagination / panel icons), PR-C2 (migrate `selectEditor` / `multiSelectEditor` / `autocompleteEditor` to shadcn Combobox foundation; deletes `combobox.tsx` + `combobox-search.tsx`), PR-C3 (wire deferred `triggerComponent` / `optionItemComponent` render-prop slots), PR-D (coordinator sweep + design-doc update).

> **v0.6.0 GA cut (2026-05-04 PM):** version bumped 0.6.0-alpha.3 → 0.6.0 across all 11 packages; bun.lock regenerated. **Last release from this standalone repo before the bsncraft monorepo move.** Bundle baseline unchanged at 112.35 KiB (`@bc-grid/react`) — net of all v0.7 architecture-correction work. **v0.6.0 GA train (post-alpha.3):** the entire v0.7 shadcn/Radix architecture-correction landed in a single train across 10 PRs, public API preserved verbatim — Block A foundation (deps + 13 shadcn primitives sourced from `~/work/bsncraft/packages/ui/src/components/` + happy-dom test infra: #501 + #503 + #504), Block B chrome (#510 context-menu + header DropdownMenu via Radix; #518 BcGridTooltip + filter popover via Radix; #521 sidebar tool panels via Radix Tabs; #522 lucide icon sweep), Block C editors (#520 cmdk + Radix Popover foundation; #527 select / multi-select / autocomplete editor migration to cmdk; #528 deferred `triggerComponent` / `optionItemComponent` / `inputComponent` slots merged via coordinator-side rebase as 92c1de4), PR-D coordinator sweep (README + status.md updated to reflect actual Radix-backed implementation). Plus `v07-pr-c2-design-decisions.md` doc capturing the 3 ratified Q1+Q2+Q3 architectural calls (focusRef → CommandInput, multi-mode Enter override preserves #427, inline shadcn Checkbox in multi-mode CommandItem). All coordinator gates green at the GA cut: type-check, lint, 2087/0 unit tests across 141 files + 29/0 happy-dom DOM tests, build, api-surface (11 enforced + 0 planned), bundle-size (121.30 KiB / 150 KiB hard cap), tarball-smoke (11/11 packages install + type-check from tarballs), release-preflight (3/3 checks), smoke-perf 3/3 (1 skipped pending Track 1 editing). **Next phase:** bc-grid moves into `~/work/bsncraft/packages/bc-grid/` as a workspace package per `docs/coordination/shadcn-radix-correction-rfc.md` end-state. Workers 1+2 are shipping `bsncraft-monorepo-move-bc-grid-prep.md` (audit) + `bsncraft-monorepo-move-runbook.md` (executable plan) for that transition. v0.6.0 is the last published artifact from this standalone repo.

> **v0.6.0-alpha.2+ candidates (in worker queues):**
> - **Worker1**: client tree phase 2.5 (#452 awaiting rebase), phase 3 (#455 stacked on #452), `v06-server-paged-cursor-pagination`, `v06-server-grid-error-boundary`, `v06-server-row-cache-stats`, `v06-server-paged-skeleton-rows`.
> - **Worker2**: `v06-erp-filter-operators-pass-2` (regex/fuzzy + MTD/QTD/YTD), `v06-grouping-virtualized-group-rows`, `v06-bulk-action-toolbar-undo`, `v06-saved-view-server-sync`.
> - **Worker3**: `v06-editor-async-validation` active (Promise-based `validate` + AbortSignal), `v06-server-grid-actions-keyboard`, `v06-editor-paste-into-cell-detection`, `v06-editor-multi-cell-delete-confirm`, `v06-editing-state-controlled-prop` (closes the state-persistence story end-to-end).
> - **Original v0.6 plan (Range, Clipboard, Spreadsheet Flows):** preserved below; mostly absorbed by the fill-handle + bulk-row-patch + state-persistence headlines above.

> **1.0 prerequisites (target ~2026-05-10):**
> - bsncraft consumer migration completes (≥ -100 LOC wrapper code per the 0.5 milestone gate)
> - Range state machine merged + clipboard copy emits TSV/HTML for rectangular ranges
> - All bsncraft 16-issue feedback items resolved or formally deferred
> - Public API frozen (no breaking changes through 1.x)
> - Performance budgets pinned + verified across the four hero use cases

> **Pivot context (2026-05-02):** the original `v0.5.0` plan (Range, Clipboard, Spreadsheet Flows) is bumped to `v0.6.0`. This milestone replaces it as a response to the bc-grid audit at `docs/coordination/audit-2026-05/`. The audit found exceptional engineering discipline (zero `any` across 11 packages, clean DAG, type-check green) but a severe API ergonomics gap: every consumer grid wires ~30 controlled-state props plus a hand-rolled server pagination state machine, and `apiRef` is missing imperative methods that ERP UX patterns need. bsncraft already carries 2,142 LOC of wrapper code across 5 wrappers, and zero of the four hero use cases are built yet — fixing ergonomics now (before the migration scales) is dramatically cheaper than retrofitting later. **Detailed scope:** `docs/coordination/v0.5-audit-refactor-plan.md`.

- [x] `useBcGridState({ persistTo, columns, server? })` turnkey hook (#359 worker3).
- [x] `useServerPagedGrid({ gridId, loadPage })` + companions: `useServerInfiniteGrid` (#368) and `useServerTreeGrid` (#371). Shared orchestration extracted to `internal/useServerOrchestration.ts`. (#363/#368/#371 worker1.)
- [x] `BcGridApi` expanded: editor side (`startEdit`/`commitEdit`/`cancelEdit` #361 worker3), server side (`scrollToCell` #366 worker1), filter side (`openFilter`/`closeFilter`/`getActiveFilter` #377 worker2). Documented in `api.md`.
- [x] Four hero-use-case spike grids landed in `apps/examples/`: colour-selection (#364 worker3), document-management (#367 coordinator), production-estimating (#374 coordinator), sales-estimating (#375 worker3). All four ship missing-pattern findings that feed v0.6 backlog.
- [x] Cheap cleanups: test-import lint rule (#358), optional `filter` props (#362), `searchHotkey` prop (#369), `fit` prop (#373). All worker2.
- [ ] **`bsncraft` migrates at least one CRUD grid** to the new turnkey hooks and the diff is at least -100 LOC of wrapper code. **In progress** — bsncraft team drafting the customers migration to `<BcServerGrid rowModel="paged">` per the 2026-05-03 architecture review (their `ServerEditGrid` wrapper duplicates ~325 LOC of `useServerPagedGrid` orchestration; replaces with thin adapter). Coordinator pairs on review.
- [ ] **Excel paste integration (audit P0-1)** — the LAST P0 still open. worker2 owns the paste listener + `pasteTsv` API; worker3 owns the editor-side `commitFromPasteApplyPlan` binding. Active.
- [x] Audit synthesis at `docs/coordination/audit-2026-05/synthesis.md` published (ranked P0/P1/P2 + author tags + sprint plan).
- [x] Coordinator chrome polish from bsncraft v0.4 review: pinned row-state CSS tokens aligned with body composites + decorative master-detail header chevron removed (#7800361).

## v0.6.0 - Range, Clipboard, and Spreadsheet Flows

Goal: make spreadsheet-style work practical.

- [ ] Range state machine is merged in core and React can render active ranges through virtualization.
- [ ] Clipboard copy emits TSV and HTML for rectangular ranges.
- [ ] Clipboard paste from Excel/Sheets parses TSV, applies value parsers and validators, and rolls back atomically on failure.
- [ ] Fill handle supports copy and simple linear fill where safe.
- [ ] Keyboard range extension and clear/select-all behavior match the range RFC.
- [ ] Visual range overlays, active cell, selection, and editing states do not fight each other.

## v0.7.0 - Server Row Model and Live Data

Goal: support large ERP datasets without loading everything into the browser.

- [ ] Paged, infinite, and tree row models are complete with request dedupe, abort handling, retry, cache eviction, and invalidation.
- [ ] Mutation pipeline reconciles optimistic local rows with server results.
- [ ] Streaming row updates can add, update, remove, and invalidate rows without corrupting row identity.
- [ ] Server row model exposes usable state snapshots for persistence, restore, export, and selection.
- [ ] Server-mode performance tuning has a baseline and no obvious cache/fetch regressions.
- [ ] `bsncraft` has at least one server-backed grid path validated against the candidate package.

## v0.8.0 - Aggregation, Pivot, and Export

Goal: cover analytical and reporting workflows.

- [ ] Aggregation engine and React adapter are merged and documented.
- [ ] Pivot engine, pivot tool panel, and pivoted row/column rendering are merged.
- [ ] Footer/status aggregation display works with current filters, grouping, and selection.
- [ ] CSV, XLSX, PDF, and server-mode export flows are available and documented.
- [ ] Exported values respect value getters, formatters, hidden columns, and selected/range scopes as documented.
- [ ] Pivot/export interactions have focused tests for the public behavior, not only helper functions.

## v0.9.0 - Chrome and Productivity Surface

Goal: make the grid feel like a full product surface, not just a table.

- [ ] Status bar, sidebar shell, columns panel, filters panel, pivot panel, and context menu are merged and accessible.
- [ ] Client pagination UI is merged and composes with filtering/searching.
- [ ] Examples app demonstrates the main productivity workflows without hidden flags.
- [ ] Migration guide from AG Grid is current and honest about gaps.
- [ ] Bundle-size and smoke-perf baselines are refreshed after the major productivity features land.

Charts peer-dep integration is post-1.0 and should not gate v0.x or v1.0 milestones.

## v0.10.0 - Release Candidate Hardening

Goal: stop adding broad surface area and remove release risk.

This milestone is optional. If v0.9.0 already satisfies the GA gate, the coordinator may recommend going directly to `1.0.0`.

- [ ] WCAG deep pass is complete and issues are either fixed or explicitly deferred below P1.
- [ ] Clean-room AG Grid comparison audits cover the major v1.0 surfaces in `docs/coordination/ag-grid-clean-room-audit-plan.md`.
- [ ] Browser compatibility matrix is complete for Chromium, Firefox, WebKit/Safari, and Edge.
- [ ] Mobile/touch fallback is complete enough for coarse-pointer users: 44px targets, double-tap edit, long-press context menu, and range handles.
- [ ] Screenreader spot-checks cover pinned columns, row/col counts, treegrid/group rows, editing announcements, and status regions.
- [ ] Nightly and smoke performance baselines are healthy.
- [ ] Public API surface is reviewed as the likely `1.0.0` contract.
- [ ] Docs, examples, package READMEs, and migration guide have no known stale sections.

## v1.0.0 - GA

Goal: ship the first stable major version for ERP workloads.

- [ ] All release gates pass.
- [ ] The maintainer explicitly signs off that no remaining gap blocks GA.
- [ ] `bsncraft` is using the candidate package without local patches for its representative grid, edit-grid, lookup-grid, and data-table surfaces.
- [ ] No P0/P1 bugs are open; P2s are either fixed or documented as post-1.0 backlog.
- [ ] Public API surface is locked for semver stability.
- [ ] Performance and bundle-size numbers are recorded in the release notes.
- [ ] Known non-goals are documented: RTL, spreadsheet formulas, bug-for-bug AG Grid parity, and any other deferred scope.
- [ ] Coordinator recommends `1.0.0`, then follows the release workflow and verifies the published package install.

## Release Action Checklist

When a milestone is ready:

1. Announce the recommendation to the maintainer before changing versions.
2. Follow `docs/design/publish-rfc.md` and the current release workflow.
3. Use the repo's fixed-version package policy: all published `@bc-grid/*` packages move together.
4. Run the full release gate locally or in CI.
5. Tag with the chosen semver, for example `v0.3.0` or `v1.0.0`.
6. Watch the publish workflow finish.
7. Install the published version into `~/work/bsncraft`, refresh the lockfile, and run consumer validation.
8. Update this file and `docs/queue.md` with the release result and the next milestone focus.
