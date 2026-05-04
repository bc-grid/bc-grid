# Worker2 Handoff (Codex — filters + aggregations + chrome consistency lane)

**Last updated:** 2026-05-04 PM (post-#522 open) by worker2

## 🛑 STATUS: BLOCK B IN REVIEW — NO UNCLAIMED WORKER2 TASKS

**Block A foundation ✅ + PR-B1 (#510) ✅ + PR-B3 (#518) ✅ are merged.** v0.6.0-alpha.3 published. PR-B2 (#521) and PR-B4 (#522) are open for review. There are no new worker2 chrome assignments in this handoff unless review fixes come back or the coordinator adds new work.

If your handoff cache shows anything "Active now → PR-A1 / PR-B1 / PR-B3" — **`git pull origin main` and re-read this doc**. Verification: `git log origin/main --oneline | head -8` should show `release: v0.6.0-alpha.3` near the top, then your three already-merged PRs.

Already merged from your lane today:
- ✅ #501 + #503 PR-A1 (Radix deps + 13 shadcn primitives from `@bsn/ui`)
- ✅ #504 PR-A2 (happy-dom test infra)
- ✅ #510 PR-B1 (context-menu + header column-options → Radix; deleted `menu-item.tsx` + `context-menu-icons.tsx`; reduced `context-menu.tsx` 532→56 LOC)
- ✅ #513 follow-up (relative imports inside shadcn primitives)
- ✅ #518 PR-B3 (BcGridTooltip + filter popover → Radix; deleted `popup-position.ts` + `popup-dismiss.ts` + `use-roving-focus.ts`; net **-1,482 LOC**)

---

## 🚨 P0 ARCHITECTURE CORRECTION 2026-05-04 — chrome lane: hand-rolled → Radix/shadcn

**Read `docs/design/shadcn-radix-correction-rfc.md` first.** Maintainer audit found bc-grid drifted from the day-1 design — README + design.md said "shadcn/Radix from the ground up" but every chrome primitive was hand-rolled. You own the chrome lane of the correction (worker3 owns the editor lane in parallel; worker1 stays on server-grid). This is binding for v0.7.0 and supersedes everything else in your queue except #455 review duty.

**Stop merging any new chrome surface from your own queue (toolbar slot extensions, tool-panel additions, context-menu items) until the correction lands.** Anything in flight that adds new code under `packages/react/src/internal/*` builds further into the wrong direction.

### Block A — foundation ✅ COMPLETE 2026-05-04 PM

- ✅ PR-A1 (#501) — Radix runtime deps + initial scaffold
- ✅ PR-A1 resync (#503) — primitives re-sourced from `~/work/bsncraft/packages/ui/src/components/`, deps pinned to `@bsn/ui` versions
- ✅ PR-A2 (#504) — happy-dom + `@testing-library/react` test infra at `packages/react/tests/dom/`

### Block B — chrome migration ✅ COMPLETE (4/4 PRs merged)

- ✅ **PR-B1 #510** — context-menu + header column-options → Radix
- ✅ **PR-B3 #518** — tooltip + filter popover → Radix
- ✅ **PR-B2 #521** — sidebar tool-panel toggle row → Radix Tabs
- ✅ **PR-B4 #522** — header / pagination / panel / disclosure icons → lucide-react

**Worker2 v0.7 lane is DONE.** Block C is in flight (worker3 PR-C3 active); PR-D coordinator sweep follows. Pivoting your lane to bsncraft monorepo move prep below.

### Active now → `v1-bsncraft-monorepo-move-bc-grid-side-prep`

Maintainer signal: next phase after v0.7 closes is moving bc-grid into `~/work/bsncraft/packages/bc-grid/` as a workspace package. Your task: **pre-flight the bc-grid side** so the move runs clean. **Independent of PR-C3 / PR-D** — you can land this anytime.

Branch: `agent/worker2/v1-bsncraft-monorepo-move-bc-grid-side-prep`. Deliverables:

1. **Audit `packages/*/package.json` cross-package deps:** every internal `@bc-grid/*` dep should use `"workspace:*"` (verify no exceptions). `publishConfig.registry` will need a decision post-move (stay on GitHub Packages OR move to bsncraft's registry); flag for the move plan.
2. **Audit `repository.url` + `repository.directory`** in every `package.json` — these break post-move; sketch the find-replace pattern.
3. **Audit `tsconfig.build.json`** for any path assuming `~/work/bc-grid` as project root. Flag absolute paths.
4. **Audit `tools/api-surface/src/manifest.ts`** — verify paths are relative.
5. **Hardcoded-path sweep:** `git ls-files | xargs grep -l '/Users/johnc/work/bc-grid'` — flag any hits.
6. **Output:** `docs/coordination/bsncraft-monorepo-move-bc-grid-prep.md` with a checklist + ready/not-ready verdict per item. Coordinator folds findings into the actual move plan once v0.7 cuts.

### Hard rule: stay OFF `packages/*/src/internal/*` until v0.7 cuts

PR-D coordinator sweep may delete more files; new internal surface invalidates the sweep.

---

(Original PR-B1 spec preserved below for reference — DO NOT re-do this work, it's already merged.)

#### ✅ DONE — `v07-radix-context-menu` (PR-B1) — merged 2026-05-04 PM via #510

Branch: `agent/worker2/v07-radix-context-menu`. Per RFC §Block B PR-B1.

**Replaces** `packages/react/src/internal/context-menu.tsx` (532 LOC) + `menu-item.tsx` (175 LOC) + `chrome-context-menu.ts` (~200 LOC) + `disclosure-icon.tsx` + `context-menu-icons.tsx` with `@radix-ui/react-context-menu` (right-click) and `@radix-ui/react-dropdown-menu` (header column-options menu). Both Radix primitives are already installed via PR-A1 + #503; the corresponding source files live at `packages/react/src/shadcn/context-menu.tsx` + `dropdown-menu.tsx`.

**Migration pattern:**

1. Map existing `BcContextMenuItem` types onto Radix items:
   - `BcContextMenuBuiltinItem` → `<ContextMenu.Item>` / `<DropdownMenu.Item>`
   - `BcContextMenuToggleItem` → `<ContextMenu.CheckboxItem>` / `<DropdownMenu.CheckboxItem>` (use `checked` prop, fire `onCheckedChange`)
   - `BcContextMenuSubmenuItem` → `<ContextMenu.Sub>` + `<ContextMenu.SubTrigger>` + `<ContextMenu.SubContent>` — Radix handles submenu collision-flip via Floating UI, so delete the hand-rolled `useLayoutEffect` + `data-flip` attribute and the "submenu flips to LEFT" Playwright case in `apps/examples/tests/context-menu.pw.ts`
   - `BcContextMenuCustomItem` → `<ContextMenu.Item>` with the consumer's `render` output as children
   - `BcContextMenuSeparator` → `<ContextMenu.Separator>`
2. Right-click activation: wrap the grid viewport in `<ContextMenu.Root>` + `<ContextMenu.Trigger asChild>`. Replace the existing `internal/context-menu-layer.tsx` event handler.
3. Keyboard activation (Shift+F10): Radix ContextMenu listens natively when wrapped in the trigger.
4. Header column-options menu: replace the in-house menu trigger with `<DropdownMenu>` from `packages/react/src/shadcn/dropdown-menu.tsx`. The trigger button stays; only the surface changes.
5. Replace icons with `lucide-react` imports: `Check`, `ChevronRight`, `Filter`, `Pin`, `Eye`, `EyeOff`, `Maximize2`, etc. Match the icon set the existing `context-menu-icons.tsx` rendered.

**Deletions in this PR:**

- `packages/react/src/internal/context-menu.tsx` (532 LOC)
- `packages/react/src/internal/menu-item.tsx` (175 LOC)
- `packages/react/src/internal/chrome-context-menu.ts` (~200 LOC)
- `packages/react/src/internal/disclosure-icon.tsx` (~30 LOC)
- `packages/react/src/internal/context-menu-icons.tsx` (~120 LOC)
- `packages/react/src/internal/context-menu-layer.tsx` (~100 LOC)
- `popup-position.ts` / `popup-dismiss.ts` / `use-roving-focus.ts` — only delete here if NOTHING else still imports them. Otherwise, leave for PR-B3 to clean up after tooltip/popover migrate.

**Tests to migrate** (move to `packages/react/tests/dom/` with `@testing-library/react`):

- `packages/react/tests/contextMenu.markup.test.tsx`
- `packages/react/tests/contextMenu.test.ts` (interactive cases only; pure helpers stay)
- `packages/react/tests/chromeContextMenu.test.ts`
- `packages/react/tests/defaultContextMenuWiringEditor.test.ts`

**Playwright assertions to add BEFORE deleting in-house code:**

- Right-click on data row opens menu with `Copy` / `Copy Row` / `Copy with Headers` / `Clear Selection` / `Clear Range`
- Right-click on header opens column-options dropdown
- Shift+F10 keyboard activation
- Submenu opens on hover
- Submenu auto-flips when right edge would overflow viewport (Radix Floating UI — should JUST WORK; replaces the existing manual collision-flip case)
- Escape closes
- Outside-click closes
- Focus returns to trigger element on close

**Public API:** preserved verbatim. `bun run api-surface` diff must be empty.

**Bundle:** add `lucide-react` icons used. Remove the deleted in-house code. RFC TL;DR estimates ~5 KiB savings in this slice; update `tools/bundle-size/src/manifest.ts` to capture the delta.

#### In review → `v07-radix-tool-panels` (PR-B2 #521)

Replace tool-panel chrome (`columnVisibility.tsx`, `filterToolPanel.tsx`, `pivotToolPanel.tsx`) with Radix `Tabs` for the columns/filters/pivot toggle row. Each panel becomes `<Tabs.Content>`. Use Radix `Dialog` (configured as a `<Sheet>` via the existing `packages/react/src/shadcn/sheet.tsx`) if the panels slide in. Internal column visibility list uses Radix `Checkbox` from `shadcn/checkbox.tsx` + Radix RovingFocusGroup for keyboard nav. Public API for the columns/filters/pivot props preserved verbatim.

#### Done → `v07-radix-tooltip-popover` (PR-B3 #518)

Replace `packages/react/src/tooltip.tsx` (291 LOC) with `@radix-ui/react-tooltip` via `packages/react/src/shadcn/tooltip.tsx`. Replace header funnel filter popups (`packages/react/src/filter.ts` popup variant) with `@radix-ui/react-popover` via `packages/react/src/shadcn/popover.tsx`. Delete `popup-position.ts` (172 LOC), `popup-dismiss.ts`, `use-roving-focus.ts` (or whichever of these PR-B1 didn't already delete). Anywhere else that used these helpers, route through Radix.

#### In review → `v07-lucide-icon-sweep` (PR-B4 #522)

Replace `packages/react/src/internal/header-icons.tsx`, `pagination-icons.tsx`, `panel-icons.tsx`, and `disclosure-icon.tsx` with `lucide-react` imports. Match icon names against shadcn's conventions where possible (`ChevronUp` / `ChevronDown` for sort, `Filter` for filter, `Pin` for pinned column, etc.). Delete the hand-rolled SVG components. Update any consumer-facing icon docs.

### Constraints (binding per RFC §Migration constraints)

1. **No public API change.** Every PR runs `bun run api-surface` — diff must be empty.
2. **Playwright coverage added BEFORE deletion.** Each PR adds the assertion that proves Radix replacement works, then deletes the in-house code in the same PR.
3. **Bundle baseline.** PR-A1 establishes the new baseline including Radix install. Each B-PR may grow only when the corresponding deletion lands in the same PR.
4. **No new chrome features outside this RFC.** Toolbar slot extensions, tool-panel additions, context-menu items — all on hold until Block B+C complete.

The full RFC is `docs/design/shadcn-radix-correction-rfc.md`. Read it before starting PR-A1.

---

## ⚡ Fresh items added 2026-05-04 (post bsncraft-issues sweep)

The bsncraft-issues.md tasks assigned earlier today **all merged**: dev-mode error surface (#474), ServerMutationResult.row doc (#475), flex-resize fix (#476), dual-output RFC (#477), cellEditor union widen (#478), Option B P0 fix (#479), createTextEditor (#480), multi-cell delete (#471), paste-into-cell (#467), error boundary (#468), keyboard shortcuts (#464). All three workers' queues drained almost entirely.

Pickups remaining in this handoff are queued below. **Pull main and rebase any in-flight branches before continuing — main has moved a lot today.**

**Coordinator note:** worker3's caveat from the pinned-lane RFC verdict still needs verification — `<BcServerGrid rowModel="tree">` group rows under the new 3-track template (Option B). Queued as `v06-tree-mode-option-b-regression-test` on worker1 since group rows live in the server-tree path.

---


## ⏸ URGENT: review needed on pinned-lane positioning RFC

**Maintainer asked for a group decision** on the v0.6.0-alpha.1 pinned-right CSS architecture before coordinator picks a fix. Read `docs/coordination/pinned-lane-positioning-decision.md` and add your verdict at the bottom (~30 sec — pick option A/B/C/D/E + 2-4 lines on why for your lane). Coordinator merges + ships once all 3 workers have weighed in.

---

**Worktree:** `~/work/bcg-worker2`
**Branch convention:** `agent/worker2/<task-slug>`

## How to use this document

When the maintainer says **"review your handoff"**, read the **Active task** section below and proceed. This document is the source of truth for what worker2 should be doing right now. The Claude coordinator in `~/work/bc-grid` keeps it current.

## Hard rule — workers do NOT run Playwright / e2e / smoke-perf / perf / broad benchmarks

This is binding (`docs/AGENTS.md §6`). Workers run focused unit tests + `bun run type-check` + `bun run lint` + the affected package's build. **Never** run `bun run test:e2e`, `bun run test:smoke-perf`, `bun run test:perf`, `bunx playwright`, or broad benchmark commands. The coordinator runs those during review/merge. If your change adds or modifies a `.pw.ts` file, note in the PR that it was not run locally — the coordinator will run it.

You implement code; the coordinator reviews and runs the slow gates.

**Note on CI:** GitHub Actions automatically runs `smoke`, `e2e (Playwright)`, and `smoke perf (Chromium)` jobs on every PR. **Those CI jobs are not "you running tests"** — they are the coordinator's CI infrastructure verifying your work. Seeing `e2e (Playwright) ✓` in the PR's checks panel is expected and good. Don't disable them, don't try to mirror them locally. Your PR description should say something like "Per worker handoff, I did not run local Playwright/e2e or smoke-perf; coordinator CI owns those gates" so reviewers know the local gates you ran (type-check, lint, focused unit tests) and understand the CI Playwright result is the coordinator's verification, not yours. **The PR you wrote in #380 already followed this exactly — keep doing that.**

---

## Active task — v0.5 stretch + v0.6 prep (LAST v0.5 P0 just shipped — paste integration done in #380)

### What's already shipped from your lane

- ✅ **#351** worker2 audit findings doc
- ✅ **#355** filters panel active filter summary chip strip — went out in `v0.4.0`
- ✅ **#358** test-import lint rule (cleanup train task 1)
- ✅ **#362** optional `filter` / `onFilterChange` props (cleanup train task 2)
- ✅ **#369** `<BcGrid searchHotkey>` prop (cleanup train task 3)
- ✅ **#373** `<BcGrid fit>` prop (cleanup train task 4)
- ✅ **#377** `BcGridApi.openFilter` / `closeFilter` / `getActiveFilter` (audit P0-7 filter side — closes the apiRef trio fully)
- ✅ **#380** `BcGridApi.pasteTsv` + native paste-event listener + bulk edit overlay commit path (audit **P0-1 fully closed** — you also subsumed the editor-side binding worker3 was originally going to write)
- ✅ **#384** `BcColumnFilter` discriminated union (per-type narrowing for text/number/number-range/date/date-range/set/boolean/custom)
- ✅ **#393** v0.5 chrome+filter bundle-1 (active filter chip strip in toolbar + group selection algebra basic + filter operators blank/not-blank for every scalar type)
- ✅ **#419** `v05-default-context-menu-wiring` chrome slice — `Column` submenu + top-level `Clear all filters` + in-memory `BcUserSettings` fallback for View toggles
- ✅ **#423** `v06-saved-view-dto-recipe` — `BcSavedView` DTO + `createSavedView` / `applySavedViewLayout` / `migrateSavedViewLayout` helpers + consumer toolbar recipe at `docs/recipes/saved-views.md`
- ✅ **#429** `v06-erp-filter-operators` — text `not-equals` / `does-not-contain`, date relative tokens (today / this-week / last-N-days / this-month + fiscal-quarter / fiscal-year), `current-user` / `current-team` predicates with `BcFilterPredicateContext`. Merged fc804e2.

## v0.6 train — your queue (in priority order)

**0.5.0 GA shipped 2026-05-03.** v0.6 absorbs consumer feedback + spreadsheet flows + bulk operations + state-persistence. Target ship date: ~2026-05-10. v0.6.0-alpha.1 cut imminent.

You crushed the previous queue — **all 5 v0.6 chrome+filter items + the fill-handle headline merged**: #432 scroll-shadow overlay, #436 fill-handle (HEADLINE), #439 bulk-action toolbar, #441 saved-view storage recipe, #446 pinned totals row, #429 ERP filter operators. Updated queue below adds five fresh items targeted at consumer ergonomics + the spreadsheet polish that v0.6 still owes.

**bsncraft consumer issues triage 2026-05-04** (`docs/coordination/bsncraft-issues.md`): one item on this lane. Pulled forward into the queue.

### Active now → `v06-column-resize-clears-flex` (bsncraft P1 #11, ~half day)

Bsncraft consumer report: `BcGridColumn.flex?: number` works for initial sizing — Name + Address columns set `flex: 2` get 2× the auto-distributed width. **But user-driven resize doesn't stick** because `commitColumnWidth` in `react/dist/index.js:670-680` (`packages/react/src/columnResize.ts` in source) sets `width` in column-state but doesn't clear `flex`. Next render reads `state?.flex ?? column.flex` and re-applies flex distribution, snapping the resize back.

**Fix shape (smaller fix path from the bsncraft memo):**

1. **In `commitColumnWidth`**: when committing a width change for a column, ALSO emit `flex: undefined` (or `flex: null`, depending on how `setColumnState` distinguishes "unset" from "absent") in the same column-state update. The next `resolveColumns` pass then reads `state.flex === undefined` → falls through to `column.flex` → user could still see the original `flex` from the column definition... so we need `flex: null` to mean "explicitly cleared, ignore column.flex".

2. **In `resolveColumns`**: confirm `state.flex === null` is treated as "cleared" (matching the existing `state.pinned === null` semantics for unpinning). If the union doesn't permit null, widen it.

3. **Test coverage:** unit test in `packages/react/tests/columnResize.test.ts` (or wherever resize tests live) — column with `flex: 2`, simulate `commitColumnWidth(columnId, 200)`, verify post-state has `width: 200, flex: null`. Render once more, verify the column renders at 200px (no flex re-distribution).

4. **Recipe note** in `docs/api.md` `BcGridColumn.flex` doc: "Resizing a flex column converts it to fixed-width and clears `flex` from layout state. To revert, call `apiRef.resetColumnSizing(columnId)` (v0.7 follow-up)."

**Branch:** `agent/worker2/v06-column-resize-clears-flex`. **Effort:** ~half day. **bsncraft P1.**

### Next-after → `v06-fill-handle-series-detection` (~1 day)

Your fill-handle PR (#436) shipped literal-repeat semantics — the v0.6 RFC §6 deferred Excel-style series detection ("1, 2 → 3, 4, 5"; "Mon → Tue, Wed"; "Q1 → Q2, Q3, Q4") to a follow-up. Pull the follow-up forward into v0.6 since the fill handle is the spreadsheet headline and series detection is what makes it feel like Excel.

**Implementation:**

1. **Numeric series detection** — when the source range's values parse as numbers and form an arithmetic progression (delta is constant), extrapolate. Single source cell `5` → fills `5, 5, 5, ...` (literal). Two source cells `5, 7` → fills `5, 7, 9, 11, ...` (arithmetic). Three+ cells with a consistent delta → arithmetic; inconsistent delta → fall back to literal-repeat.

2. **Date series detection** — single source date cell → +1 day per fill cell. Two-cell range → infer increment (day / week / month / quarter / year) from the delta and continue.

3. **Weekday name detection** — single cell with `"Mon"` / `"Monday"` (locale-aware) → next weekday. Same for month names.

4. **Custom series via column hint** — `BcReactGridColumn.fillSeries?: "literal" | "linear" | "exponential" | "weekday" | "month" | (sourceCells, fillCells) => values[]` so consumers can override per-column.

5. **Test coverage:** unit tests for the detection algorithm covering all five cases + 1 Playwright spec extending `apps/examples/tests/range-fill-handle.pw.ts` with arithmetic + date + weekday cases.

**Branch:** `agent/worker2/v06-fill-handle-series-detection`. **Effort:** ~1 day.

### Next-after → `v06-erp-filter-operators-pass-2` (~half day)

Your #429 shipped the high-leverage ERP operators (relative dates, fiscal periods, current-user/team). Pass 2 closes the remaining gaps: text `regex` op (with safe-pattern compile + dev-mode warning on slow patterns), text `fuzzy` op (Levenshtein ≤ 2 by default), number `between` shortcut for inclusive/exclusive bounds, more relative date tokens (`mtd` = month-to-date, `qtd` = quarter-to-date, `ytd` = year-to-date, `last-fiscal-week`).

**Branch:** `agent/worker2/v06-erp-filter-operators-pass-2`. **Effort:** ~half day.

### Then-after → `v06-grouping-virtualized-group-rows` (~1 day)

Today group rows render outside the virtualizer's row index — they're injected as separate `RowEntry`s. With deep grouping (5 levels × 1k rows per leaf = 5k group rows + 1M leaf rows), the group-row count adds DOM weight. Virtualize them too: have the virtualizer treat group rows as first-class rows with their own height bucket; collapse/expand toggles update the bucket without re-flattening the entire row model.

This is performance work for the heaviest grouping case bsncraft will hit. Bench-driven — add a smoke-perf case at `apps/benchmarks/tests/perf.perf.pw.ts` measuring group-row insert/expand latency at 5×1k scale.

**Branch:** `agent/worker2/v06-grouping-virtualized-group-rows`. **Effort:** ~1 day.

### After-that → `v06-bulk-action-toolbar-undo` (~half day)

Followup to your #439 bulk-actions toolbar. Add an undo affordance — when a consumer-supplied bulk action commits, surface a 5-second toast with an "Undo" button. Composes with worker3's #437 `applyRowPatches` via the optional `inverse?: BcRowPatch[]` field on each patch (consumer pre-computes the inverse so undo is one-call).

**Implementation:**

1. **`BcGridProps.bulkActionUndoSlot?: ReactNode | (ctx: BcBulkActionUndoContext) => ReactNode`** — toast slot.
2. **`BcBulkActionUndoContext`** carries `{ undoableAction, undo(), dismiss() }`.
3. **Auto-dismiss** after 5s (configurable).
4. **Recipe** at `docs/recipes/bulk-actions-undo.md`.

**Branch:** `agent/worker2/v06-bulk-action-toolbar-undo`. **Effort:** ~half day.

### Last → `v06-saved-view-server-sync` (~half day)

Your #423 saved-view DTO + #441 storage recipe ship the consumer-owned local persistence story. v0.6 follow-up: server-sync recipe + DTO additions for multi-user saved views (`scope: "team" | "global"` already exists in the DTO; the missing piece is a sync-conflict resolution recipe).

**Implementation:**

1. **Recipe** at `docs/recipes/saved-view-server-sync.md` showing fetch-based sync with conflict detection (server `updatedAt` newer than client → reload; same → push).
2. **Optional helper:** `createServerSyncedSavedViewStore({ endpoint, gridId })` starter.
3. **Document the conflict shape** in `docs/api.md` so consumers understand the edge cases (concurrent edit → last-write-wins by default; consumer can override via `mergeStrategy`).

**Branch:** `agent/worker2/v06-saved-view-server-sync`. **Effort:** ~half day.

### Then-last → `v06-toolbar-render-prop` (~half day)

Bsncraft anticipated polish: today the grid's toolbar slot is `BcGridProps.toolbar?: ReactNode` — a single slot. Consumers building custom toolbar layouts (search input + group-by dropdown + saved-view picker + custom buttons) end up rendering their own toolbar OUTSIDE the grid because they can't position pieces relative to grid state. Add a render-prop so consumers get full control:

**Implementation:**

1. **Widen `toolbar` prop** to accept `ReactNode | (ctx: BcToolbarContext) => ReactNode`.
2. **`BcToolbarContext`** carries: `searchInput`, `groupByDropdown`, `savedViewPicker`, `densityPicker`, `clearFiltersButton`, `selectedRowCount`, `apiRef`. Each is a render-prop sub-slot consumers can compose freely.
3. **Default toolbar** preserved when prop is `undefined` (no behavior change for non-render-prop consumers).
4. **Recipe** at `docs/recipes/custom-toolbar.md` showing bsncraft-style ERP toolbar pattern with all sub-slots stitched into a custom layout.

**Branch:** `agent/worker2/v06-toolbar-render-prop`. **Effort:** ~half day.

### Final → `v06-quick-filter-input` (~half day)

Bsncraft anticipated polish: a "quick filter" input that filters across all searchable columns simultaneously, distinct from the per-column filter row. AG Grid + Excel both ship this; bc-grid's `searchHotkey` (#369) opens the consumer's external search input but doesn't surface a built-in one.

**Implementation:**

1. **`BcGridProps.quickFilter?: { enabled?: boolean; placeholder?: string; debounceMs?: number }`** — opt-in. When set, the toolbar surfaces a quick-filter input that drives the same `searchText` controlled state as the existing search infrastructure.
2. **Position** in the toolbar's render-prop sub-slots (composes with `v06-toolbar-render-prop` above): exposed as `ctx.quickFilterInput` so consumers can place it anywhere in their custom toolbar.
3. **Recipe** at `docs/recipes/quick-filter.md` showing the difference between per-column filters (precise, one column) vs quick-filter (broad, all columns) — pin the UX guidance for ERP screens.

**Branch:** `agent/worker2/v06-quick-filter-input`. **Effort:** ~half day.

### Previously active → `v06-fill-handle` (DONE — #436 merged bf10ea0, HEADLINE)
### Previously active → `v05-bsncraft-pinned-scroll-shadow-overlay` (DONE — #432 merged e73e271)
### Previously active → `v06-bulk-action-toolbar-primitive` (DONE — #439 merged e32f2fc)
### Previously active → `v06-saved-view-storage-recipe` (DONE — #441 merged 3db3cd2)
### Previously active → `v06-grouping-tristate-totals-row` (DONE — #446 merged 67b3c2f)
### Previously active → `v06-erp-filter-operators` (DONE — #429 merged fc804e2)

Pull a consumer-side companion to your #423 saved-view DTO PR — a recipe doc + minimal storage helpers showing how to wire a `localStorage` / `IndexedDB` / server-backed implementation behind the `BcSavedView` shape. Composes naturally with the toolbar recipe at `docs/recipes/saved-views.md`. Bsncraft will need this when they wire saved views into their AR Customers grid.

Implementation:

1. **Add `docs/recipes/saved-view-persistence.md`** showing three reference adapters:
   - `localStorage` (synchronous, single-tab) — simplest
   - `IndexedDB` via a tiny inline helper — async, multi-tab, larger payloads
   - Server-backed (`fetch`-based) — closes over the host's REST/GraphQL endpoint
2. **Document the URL boundary** — `urlStatePersistence` carries the current ad-hoc layout blob; saved views are persisted server-side or in `localStorage` keyed by `gridId`. The consumer's URL parameter (e.g. `?activeSavedViewId=`) sits next to the grid payload.
3. **Optional**: ship a tiny `createLocalStorageSavedViewStore({ gridId })` helper as a starter (still consumer-owned but skips boilerplate). Decide based on bundle cost — if it adds <250B gzip, ship; otherwise leave as recipe-only.

**Branch:** `agent/worker2/v06-saved-view-storage-recipe`. **Effort:** ~half day.

### After saved-view storage → continue down planning doc (§7+ of `worker2-grouping-and-filters.md`)

Your planning doc has additional grouping + filter items beyond §6. Pick the next at the top when you're ready.

Spec from your planning doc:

```ts
interface BcSavedView<TRow = unknown> {
  id: string
  name: string
  gridId: string
  version: number              // schema migration anchor
  layout: BcGridLayoutState     // nested, not duplicated
  scope: "user" | "team" | "global"
  ownerId?: string
  isDefault?: boolean
  isFavorite?: boolean
  createdAt?: string
  updatedAt?: string
  description?: string
}
```

Helpers:
- `createSavedView(opts: { gridId, name, layout, scope?, ... }): BcSavedView` — id generated, version pinned, timestamps set.
- `applySavedViewLayout(api: BcGridApi, view: BcSavedView): void` — applies the layout state (sort, filter, columnState, groupBy, etc.) to a live grid via apiRef.
- `migrateSavedViewLayout(view: BcSavedView): BcSavedView` — version-aware migration so older saved views remain consumable.

Toolbar recipe doc at `docs/recipes/saved-views.md` — covers the consumer UX pattern (list + load + save + delete) without bc-grid implementing the UI. Uses controlled `layoutState` + `onLayoutStateChange` + `urlStatePersistence` + host storage.

Decide whether URL state should carry only the current layout blob or also `activeSavedViewId`. Recommendation: just the blob; consumers who want the active ID round-tripped add it as their own URL param.

**Branch:** `agent/worker2/v06-saved-view-dto-recipe`. **Effort:** ~half day.

### After saved-view DTO → `v06-erp-filter-operators` (your planning doc §6, ~half day)

Pull §6 forward — ERP filter operators (audit P1-W2-4): `blank` / `not blank` for every scalar type (already shipped in #393), but the rest are missing — `not equals` for text/date, relative dates (today / this week / last N days / this month), fiscal-period buckets, current-user/team predicates, `does not contain`. Composes with the filter registry from #410 (operators land as registry entries with predicate + editor).

**Branch:** `agent/worker2/v06-erp-filter-operators`. **Effort:** ~half day.

### Previously active → `v05-default-context-menu-wiring` chrome slice (DONE — #419 in review)

### Old anchor: `v05-default-context-menu-wiring` — chrome slice (~1.5-2h)

**Layout pass PR (b) shipped as #416** (e25b2b1) — detail panel composes as `position: sticky; left: 0` with `width: var(--bc-grid-viewport-width)`; horizontal master scroll leaves the detail panel anchored to the visible viewport. Closes layout RFC §4 memo 2.

**Set filter option provider shipped as #413** (724a4af). **Filter registry shipped as #410** (ec6f6d5). Your v0.5 alpha.2 → GA work is structurally complete.

**New gap surfaced 2026-05-03 by bsncraft consumer screenshot:** `DEFAULT_CONTEXT_MENU_ITEMS` is unchanged from v0.4 — only `copy / copy-row / copy-with-headers / clear-selection / clear-range`. Chrome bundles 1+2 (#396 / #399) added the `BcContextMenuToggleItem` + `BcContextMenuSubmenuItem` primitives + new column-context built-ins (`pin-column-left/right`, `unpin-column`, `hide-column`, `show-all-columns`, `autosize-column`, `autosize-all-columns`, `clear-column-filter`, `clear-all-filters`) — but **none of them are in DEFAULT**. Bsncraft (correctly) didn't write a custom `contextMenuItems` prop, so they see only the v0.4 baseline.

The maintainer's vanilla+context-menu RFC (#392) intent — "vanilla grid by default + everything toggleable from right-click + consumer-supplied persistence API" — landed half. Workers built primitives + props; nothing wired the default menu.

**Your slice (chrome lane):** wire the column commands + view toggles into `DEFAULT_CONTEXT_MENU_ITEMS`. Specifically:

1. **Column-context items** (when right-click target has `context.column`): a `Column` submenu with `pin-column-left`, `pin-column-right`, `unpin-column`, `hide-column`, `autosize-column`, separator, `show-all-columns`, `autosize-all-columns`, `clear-column-filter`. Disabled-state predicates already exist in `contextMenu.ts:147-217`.

2. **View toggles** (always present): a `View` submenu with `Show filter row`, `Show sidebar`, `Show status bar`, `Density` (Compact / Normal / Comfortable radio), `Show active filters` (the chip-strip toggle). These need an in-memory `BcUserSettings` default when the consumer doesn't supply a `userSettings` prop. Use the existing `BcUserSettingsStore` shape from #396; add an internal `useDefaultUserSettings` fallback.

3. **Filter actions** (always present, top-level): `Clear all filters` action (existing built-in `clear-all-filters`).

worker1 + worker3 will pull their own slices (server-side toggles + editor toggles respectively) into their handoffs — your slice is the chrome+filter+column commands.

**Branch:** `agent/worker2/v05-default-context-menu-wiring-chrome`. **Effort:** ~1.5-2h.

### After context-menu wiring → `v06-saved-view-dto-recipe` (your planning doc §5, ~half day)

(Same as before — `BcSavedView` DTO + helpers + toolbar recipe doc.)

### Previously active → `v06-layout-architecture-pass` PR (b) (DONE — #416)

### Old anchor: `v06-layout-architecture-pass` PR (b) — detail panel sticky-left (~2-3h, NOW UNGATED — worker1's PR (a) shipped)

**Set filter option provider shipped as #413** (724a4af): `loadSetFilterOptions({ columnId, search, selectedValues, filterWithoutSelf, signal, limit, offset }) => Promise<{ options, totalCount?, selectedOptions?, hasMore? }>` shape per planning doc §4. Async option loading + abort-on-keystroke + selected-value preservation across searches + virtualized menu body for large option sets. Audit P1-W2-2 closed.

**Layout pass PR (a) shipped as #415** (760de4c) — single `.bc-grid-viewport` container with sticky-positioned headers + pinned cells. Your PR (b) is now unblocked: detail panel composes as `position: sticky; left: 0` with `width: var(--bc-grid-viewport-width)` set as a CSS custom property by `useViewportSync` (per layout RFC §4 memo 2 closure). Pinned-left disclosure column ▶ alignment is preserved because both anchor to `left: 0` in the viewport coordinate space.

Acceptance criteria from the original consumer thread (preserved):
- Horizontal scroll on master leaves the detail panel anchored to the visible viewport.
- Detail panel content keeps its own horizontal scroll if it overflows the viewport width.
- Vertical scroll on master scrolls the detail row off-screen as expected (no sticky-vertical).
- `detailPanelHeight` (and the row-fn variant) is still honored.
- Pinned-left disclosure column ▶ button still visually connects to the detail row's left edge.

**Branch:** `agent/worker2/v06-layout-architecture-pass-pr-b`. **Effort:** ~2-3h including a Playwright spec (coordinator runs the spec).

### After PR (b) → `v06-saved-view-dto-recipe` (your planning doc §5, ~half day)

Pull §5 forward from `docs/coordination/v05-audit-followups/worker2-grouping-and-filters.md` (audit P1-W2-3). Publish the canonical `BcSavedView` DTO + helpers (`createSavedView`, `applySavedViewLayout`, `migrateSavedViewLayout`) + a toolbar recipe doc. No runtime UI required — the DTO + helpers + recipe are the deliverable. Composes naturally with the filter-registry + set-filter-option-provider work since saved views serialize through the registry.

Spec details in your planning doc; recommend: nest `BcGridLayoutState` rather than duplicating fields, add a `version` field for schema migration, document the URL-state vs persistent-view boundary.

**Branch:** `agent/worker2/v06-saved-view-dto-recipe`. **Effort:** ~half day.

### Previously active → `v06-set-filter-option-provider` (DONE — #413)

### Old anchor: `v06-set-filter-option-provider` (your planning doc §4, ~half day)

### Previously active → `v06-filter-registry-implementation` (DONE — #410)

### Old anchor: `v06-filter-registry-implementation` (your planning doc §3, ~half day)

**Group-before-paginate shipped as #405** (e2c022c, your planning doc §1 — closes audit P0-8 grouping-page-window): the grouped row metadata now builds from the full filtered/sorted client row model, then pagination applies as a visible-leaf set so group counts and descendant ids reflect full data, not one page. Combined with row-actions menu (#404), chrome bundles 1+2 (#396 / #399), and chrome+filter bundle-1 (#393), your v0.5 lane is structurally complete.

**Note on `v06-detail-panel-sticky-left`:** the standalone task is **superseded** by the v0.6 layout architecture pass RFC at `docs/design/layout-architecture-pass-rfc.md` (delivered 2026-05-03; read §3, §4, §8 before your PR (b) work). The detail-sticky-left becomes PR (b) of that RFC, gated on worker1's PR (a) (single scroll container + sticky header/pinned). Don't ship the standalone version — it would conflict with the layout pass's structural rewrite. Coordinator will signal when worker1's PR (a) lands and you can pick up the layout-pass PR (b) as a clean compose-on-top.

In the meantime, pull §3 forward from `docs/coordination/v05-audit-followups/worker2-grouping-and-filters.md`. The audit's P1-W2-1 finding: `@bc-grid/filters` is a placeholder, custom filter definitions are advertised in the type but the registry, predicate dispatch, and editor lookup are all stubs. #384 made the built-in `BcColumnFilter` union safer; it didn't make the extension point real.

Your planning doc's spec is concrete (file:line citations at `packages/filters/src/index.ts:1`, `packages/react/src/filter.ts:334-362`, `packages/react/src/headerCells.tsx:1074-1220`, plus the registry RFC at `docs/design/filter-registry-rfc.md:188-206 / 423-436 / 459-467`). Implement:

1. **`@bc-grid/filters` package** — built-in filter definitions (text/number/date/set/boolean) as first-class registry entries, plus `matchesFilter` predicate dispatch and a `registerFilter` API.
2. **React adapter** — resolves a column's filter definition to (editor, parse/serialize, predicate) via the registry. Built-ins use the same registry path as registered filters.
3. **Failure mode** — unknown filter types fail loudly in development (console.error per the same dev-only pattern as the server-row-model validator surfacing) and produce a safe no-match in production rather than silently pretending to be text.

Tests: registry lookup, duplicate-registration detection, built-in parity (registered text filter behaves identically to today's hardcoded text filter), unknown-type behavior, custom editor rendering, controlled filter evaluation, URL/localStorage round-trips through the registry.

**Branch:** `agent/worker2/v06-filter-registry-implementation`. **Effort:** ~half day.

### After filter-registry → `v06-set-filter-option-provider` (your planning doc §4, ~half day)

Pull §4 forward — set filter scales to thousands of distinct values via an async option provider. Audit P1-W2-2 finding: the current set filter synchronously scans `data` and renders all options at menu-open, which doesn't scale to thousands of customers/vendors/items. No virtualization, no async search, no abort, no loading state.

Your planning doc's spec:

```ts
loadSetFilterOptions({
  columnId, search, selectedValues, filterWithoutSelf, signal, limit, offset,
}) => Promise<{
  options, totalCount?, selectedOptions?, hasMore?
}>
```

Plus a small-data sync adapter that preserves today's behavior for grids that don't supply the provider (so it's additive, not breaking).

Implementation:
- Virtualize the menu body for large option sets (reuse `@bc-grid/virtualizer` if the listbox shape fits).
- Server-backed search with abort-on-keystroke (mirror the autocomplete pattern from #370/#403).
- "Selected values hidden by current search" preserved as a distinct section in the menu so the user always sees what they've already selected.
- "Select all" semantics — clearly means "all currently loaded matching options" unless the provider declares it supports all-matching values.

Tests: 1k and 10k option fixtures, async race handling, selected-value preservation across searches, `not-in` / `blank` behavior, AbortSignal cancellation.

**Branch:** `agent/worker2/v06-set-filter-option-provider`. **Effort:** ~half day.

### After set-filter-option-provider → `v06-layout-architecture-pass` PR (b) — detail panel sticky-left (~2-3h, GATED on worker1's PR (a))

The standalone `v06-detail-panel-sticky-left` task is replaced by PR (b) of the v0.6 layout architecture pass (RFC drafting at `docs/design/layout-architecture-pass-rfc.md`). PR (a) — single scroll container + sticky header/pinned (worker1) — is the foundation. Once it merges, your PR (b) becomes a clean compose-on-top: detail panel wrapper sets `position: sticky; left: 0` inside the canvas with `width: 100%` of the viewport's `clientWidth` (no JS measurement — sticky positioning gives you that for free in the new architecture).

Acceptance criteria from the original consumer thread (preserved):

- Horizontal scroll on master leaves the detail panel anchored to the visible viewport.
- Detail panel content keeps its own horizontal scroll if it overflows the viewport width.
- Vertical scroll on master scrolls the detail row off-screen as expected (no sticky-vertical).
- `detailPanelHeight` (and the row-fn variant) is still honored.
- Pinned-left disclosure column ▶ button still visually connects to the detail row's left edge (composes naturally with PR (a)'s sticky-positioned pinned cells).

**Coordinator will signal when PR (a) lands.** Until then, do NOT branch on this — PR (a)'s architectural rewrite changes the detail panel mount path, and any work you do here would conflict.

**Branch (when ready):** `agent/worker2/v06-layout-architecture-pass-pr-b`. **Effort:** ~2-3h.

### Previously active → `v05-chrome-and-filter-bundle-1` (DONE — #393)

The 3 chrome/filter polish items from your own #388 doc landed (active filter chip strip in toolbar, group selection algebra basic, filter operators blank/not-blank for every scalar type).

**Items:**

1. **Active filter chip strip in toolbar** (audit P2 from #351) — today the active-filter summary lives only inside the Filters panel. Add a small always-visible chip strip suitable for status bars / toolbars; reuse `clearFilter(columnId)`. Each chip shows column header + condensed value + dismiss `×`. Goes into the existing `<BcStatusBar>` slot (or a new `BcGridProps.activeFilterSummary?: "status-bar" | "off"` toggle).

2. **Group selection algebra (basic)** (audit P1-W2-5 from #351 + #388 §2) — selecting a group row should select its visible descendants. Today click on a group row toggles expand only. Add a checkbox or modifier-click that selects the descendants. Scope: visible descendants (loaded rows on the current page). Full server-view group selection stays in v0.6.

3. **Filter operators: `blank` / `not blank`** (audit P1-W2-4 partial from #351 + #388 §6) — add `blank` and `not blank` to the operator list for `text`, `number`, `date`, `set`. The predicate side is trivial (`value == null || value === ""`); the editor side rendered as a no-input variant (just a 2-button toggle group). Don't bundle all the relative-date / fiscal-period operators here — those need the filter registry, which is v0.6.

**Branch:** `agent/worker2/v05-chrome-and-filter-bundle-1`. **Effort:** ~30-40 min for the bundle.

### Previously active → `v05-grouping-followups-planning-doc` (DONE)

Mirror worker1's #383 pattern: convert your audit findings (#351) — specifically the grouping + filter items — into concrete v0.6 task entries. Output: read-only doc at `docs/coordination/v05-audit-followups/worker2-grouping-and-filters.md`. No source changes. Pure planning pass while your lane is otherwise clean.

**Items to cover** (each as a v0.6 task proposal with file:line citations + fix shape + affected packages):

1. **Group-before-paginate + group subtotals** (audit P0-8, two-spike-confirmed in #367 + #374). The biggest worker2 v0.6 piece. Today `leafRowEntries` paginates BEFORE `buildGroupedRowModel`, so client grouping operates on a single page slice. Group rows render label + count only; `aggregateGroups` exists but isn't wired into group-row rendering. Decide the contract: client grids group BEFORE pagination (the right answer per synthesis), then wire group aggregation into group-row cells.

2. **Group selection algebra** (audit P1-W2-5). Selecting a group row should select its visible descendants (with extension paths for full server-view group selection in tree mode).

3. **Filter registry implementation** (audit P1-W2-1). `@bc-grid/filters` is currently empty; React exposes the contract but no registry exists. Implement registration → predicate dispatch → editor lookup. Closes the "custom filter" extensibility advertised in `api.md`.

4. **Set filter virtualization + async** (audit P1-W2-2). Today the set-filter menu eagerly scans all data and renders every option. Add an option-provider contract with counts, async search, virtualized list, and a "selected outside current search" preserved section.

5. **Saved-view DTO + recipe** (audit P1-W2-3). Bc-grid publishes the canonical `BcSavedView` DTO; consumers own the actual UX (per the synthesis answer to your audit open-question).

6. **ERP filter operator coverage** (audit P1-W2-4). Add: `blank` / `not blank` for every scalar type, `not equals` for text/date, relative dates (today / this week / last N days / this month), fiscal-period buckets, current user/team, `does not contain`. Land alongside #3 since the registry is the host.

7. **Active filter chip strip in toolbar** (audit P2). Today the active-filter summary lives only inside the Filters panel. Add a small always-visible chip strip suitable for status bars / toolbars.

8. **Range paste server-side support** (audit P2). Visible-window-only paste planning is good for v0.5; document the limit and propose a server-side paste-planning contract.

For each item: where it manifests, what's wrong, suggested fix shape (1-3 paragraphs), affected packages, dependency on other items, capacity-aware priority order. Mirror worker1's #383 exactly.

**Branch:** `agent/worker2/v05-grouping-followups-planning-doc`. **Effort:** ~half day.

### After this → bsncraft migration co-pilot (filter side)

When bsncraft drafts the customers migration, your role is filter-and-grouping expertise (similar to worker1's server-grid expertise). Walk through any rough edges they hit on filter/group surfaces; those become v0.6 inputs.

### Deferred — earlier `v05-filter-discriminated-union` content (DONE)

The stretch was shipped in #384:
   ```ts
   type BcColumnFilter =
     | { type: 'text'; caseSensitive?: boolean; regex?: boolean; variant?: 'popup' | 'inline' }
     | { type: 'number'; precision?: number; variant?: 'popup' | 'inline' }
     | { type: 'date'; granularity?: 'day' | 'month'; variant?: 'popup' | 'inline' }
     | { type: 'set'; options?: string[]; loadOptions?: () => Promise<string[]> };
   ```
   Public API change; coordinator runs API-surface diff at review. **Only ship if** it doesn't churn types under bsncraft mid-sprint. Branch: `agent/worker2/v05-filter-discriminated-union`.

### Cross-worker contract — Excel paste (split with worker3)

After your cleanup train, **pick up the Excel paste wiring** (audit P0-1 / synthesis sprint plan). This is the last unfinished v0.5 P0. worker3 has alternatives unblocked of paste (autocomplete Combobox, sales-estimating sans-paste, cheap P1s) so paste is not their critical path, but the integration is still a v0.5 release-gate item. Your half:

- Add `paste` event listener on the grid root (or a hidden input that owns the active cell's focus context).
- Expose a `pasteTsv({ range, tsv })` API on `BcGridApi`.
- Call into worker3's editor commit binding (worker3 owns `editController.commitFromPasteApplyPlan`).
- Use the existing `buildRangeTsvPasteApplyPlan` helper.

**Coordinate via the `pasteTsv` API surface** — define the contract in `docs/api.md` first (open a small RFC-style PR with just the API shape if it helps), then implement; worker3 implements the editor side against the same contract.

Branch (when you reach it): `agent/worker2/v05-paste-listener`.

### After v0.5 cleanup + paste

- **Stretch:** filter discriminated union (`v05-filter-discriminated-union` task 6 above).
- **v0.6 prep:** worker2 lane owns several v0.6 items per the audit synthesis: group-before-paginate + group subtotals (audit P0-8 — the biggest worker2 piece for v0.6), group selection algebra (P1-W2-5), filter registry implementation (P1-W2-1). Don't start v0.6 work until v0.5 ships, but it's queued for after.

### Rules reminder

- Don't run Playwright / smoke-perf / perf / broad benchmarks.
- Don't bump bundle baseline (coordinator owns it; baseline was just bumped to 71500 B for `@bc-grid/react` — you have headroom).
- Open PR; do not merge your own.
- Update `docs/queue.md` `[draft]` → `[in-flight: worker2]` → `[review: worker2 #PR]` at state transitions.

---

## Standing lane scope

Filters, aggregations, range/clipboard prep, and chrome consistency across panels/popups. Specifically:

- `packages/filters/`
- `packages/aggregations/`
- Range/clipboard helpers in `@bc-grid/react` (v0.5 prep, internal helpers only)
- Cross-package chrome consistency (filter popups, sidebar/tool panels, inline filter row, grouping affordances)

You do **NOT** own: server row model, editors, virtualizer internals. Don't refactor adjacent code.

## Worker rules (recap — full rules in `docs/AGENTS.md`)

- Branch off `main`. Never commit to `main`.
- Branch name: `agent/worker2/<task-slug>`.
- Run `bun run type-check`, `bun run lint`, focused unit tests.
- Do **NOT** run Playwright, smoke-perf, perf, or broad benchmarks. Coordinator owns those.
- Open PR against `main`. Do not merge your own PR.
- Update `docs/queue.md` at state transitions.
- No bundle baseline bumps without coordinator approval.

## Recent activity baseline

- v0.3.0 shipped (88398c6).
- Recent chrome polish on main: filter popup chrome (#305), sidebar rail/panel polish (#309), inline filter row (#308), header resize/menu states (#310), pinned column opaque surfaces (#307), filters tool panel (#303).
- v0.4 chrome polish from #349 is the current visible UI baseline.

## When you finish the active task

1. Push the findings doc as a PR (single doc, no source changes).
2. Comment on the PR tagging the coordinator.
3. Wait for the next handoff update before starting new work.
