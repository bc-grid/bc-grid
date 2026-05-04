# Worker3 Handoff (Claude — editor + keyboard/a11y + lookup UX lane)

**Last updated:** 2026-05-04 PM (post-v0.6.0-alpha.3 cut, PR-C1 #520 merged) by Claude coordinator

## 🛑 STATUS: PR-C1 ✅ MERGED — PR-C2 IS YOUR ACTIVE TASK

**PR-C1 #520 merged.** The shadcn Combobox foundation is on `main` at `packages/editors/src/shadcn/`. cmdk + Radix Popover are installed in `@bc-grid/editors`. **You are not blocked.** Your active task is **PR-C2** — migrate the three combobox-driven editors to use the new foundation.

If your handoff cache shows anything "Active now → PR-A1 / PR-C1" — **`git pull origin main` and re-read this doc.** Verification: `git log origin/main --oneline | head -8` should show `release: v0.6.0-alpha.3` near the top, then your already-merged PRs.

Already merged from your lane today:
- ✅ #493 editor a11y fix (date / datetime / time aria-describedby + visually-hidden error span)
- ✅ #494 queue cleanup (5 stale `[ready]` items → `[done]`)
- ✅ #506 Block C test inventory doc (PR-C2 pre-flight checklist)
- ✅ #520 PR-C1 (shadcn Combobox foundation: cmdk + Radix Popover deps + `command.tsx` / `popover.tsx` / `dialog.tsx` / `utils.ts` primitives in `packages/editors/src/shadcn/`)
- 🚪 #497, #500 closed correctly when the RFC landed (deferred to PR-C3)

---

## 🚨 P0 ARCHITECTURE CORRECTION 2026-05-04 — editor lane: hand-rolled → shadcn

**Read `docs/design/shadcn-radix-correction-rfc.md` first.** Maintainer audit found bc-grid drifted from the day-1 design — README + design.md said "shadcn/Radix from the ground up" but every chrome primitive was hand-rolled. You own the editor lane of the correction (worker2 owns the chrome lane in parallel; worker1 stays on server-grid). This is binding for v0.7.0 and supersedes everything else in your queue except the in-flight a11y / keyboard polish that's already merged.

**Stop merging any new editor primitive surface from your own queue (new combobox modes, new editor variants) until the correction lands.** Anything in flight that adds new code under `packages/editors/src/internal/*` builds further into the wrong direction.

### Block C — editor migration: 1 of 3 PRs done

- ✅ **PR-C1 #520 merged** — cmdk + Radix Popover in `@bc-grid/editors`; `command.tsx` / `popover.tsx` / `dialog.tsx` / `utils.ts` primitives in `packages/editors/src/shadcn/` (sourced from `packages/react/src/shadcn/` which adapts `@bsn/ui`)

#### Active now → `v07-radix-combobox-editors` (PR-C2)

Branch: `agent/worker3/v07-radix-combobox-editors`. Per RFC §Block C PR-C2 + your test inventory at `docs/coordination/v07-block-c-test-inventory.md` (#506).

**Migrate three editors to the cmdk foundation:**

1. **`selectEditor`** — drop `packages/editors/src/internal/combobox.tsx` (select-mode); rebuild on `packages/editors/src/shadcn/command.tsx` + `popover.tsx`. Trigger button stays consistent with the `<BcGridMenuItem>`-style chrome from PR-B1; on open, render `<Command>` with the option list.
2. **`multiSelectEditor`** — same as select but `<CommandItem>` items toggle a `Set<TValue>`; trailing checkmark glyph from `lucide-react` `Check` for selected items.
3. **`autocompleteEditor`** — drop `packages/editors/src/internal/combobox-search.tsx`; rebuild on `<Command>` with `CommandInput` for typeahead. Honor the existing async-option-loading contract + `prepareResult` preload pattern from #427 / #435.

**Constraints (binding per RFC):**

- Public exports preserved verbatim — `selectEditor`, `multiSelectEditor`, `autocompleteEditor`, plus the v0.6 factory exports `createSelectEditor` / `createMultiSelectEditor` / `createAutocompleteEditor`. `bun run api-surface` diff must be empty.
- Delete `packages/editors/src/internal/combobox.tsx` and `combobox-search.tsx` in this PR. Their tests at `packages/editors/tests/combobox*.test.ts` / `combobox-search*.test.ts` either delete (if behavior is now covered by cmdk) or migrate to `packages/react/tests/dom/` with `@testing-library/react`.

**Playwright assertions to add BEFORE deletion** (per `docs/coordination/v07-block-c-test-inventory.md`):

- select-edit happy path: open → click option → commit → cell shows new value
- multi-select toggle: open → click two options → close → cell shows multi-value
- autocomplete typeahead: type query → result list filters → click → commit
- prepareresult preload: open editor with prepareResult → option list pre-populated
- Enter contract pinned per #427: Enter inside cmdk does NOT bubble to the grid editor's commit handler
- focus return after commit: editor unmounts, cell receives focus

**The 3 currently-`test.skip` Playwright tests** (`editor-select.pw.ts:132`, `editor-multi-select.pw.ts:187`, no autocomplete equivalent) need to pass — that's the deletion gate.

#### Next-after → `v07-shadcn-editor-render-prop-slots` (PR-C3)

Per RFC §Block C PR-C3 — wire the deferred slots from #489 / #497 / #500 closures.

- `createSelectEditor({ triggerComponent, optionItemComponent })`, `createMultiSelectEditor({ triggerComponent, optionItemComponent })`, `createAutocompleteEditor({ inputComponent, optionItemComponent })`. Factory pattern matches #480 / #488 / #489.
- The slot wiring is straightforward now that cmdk is the foundation: `triggerComponent` swaps the `<PopoverTrigger>` button; `optionItemComponent` swaps the `<CommandItem>` row renderer. Default behavior preserved when slots are unset.
- Update `docs/recipes/shadcn-editors.md` — move the "What's NOT covered (yet)" section to "covered" with code samples.

When PR-C2 + PR-C3 land, your Block C editor lane is **complete** and the v0.7 architecture correction is 8/9 done (PR-D coordinator sweep is the last piece).

### Constraints (binding per RFC §Migration constraints)

1. **No public API change.** Every PR runs `bun run api-surface` — diff must be empty.
2. **Playwright coverage added BEFORE deletion.** Each PR adds the assertion that proves the shadcn replacement works, then deletes the in-house code in the same PR.
3. **Bundle baseline.** Worker2's PR-A1 establishes the post-install baseline. Each C-PR may grow only when the corresponding deletion lands in the same PR.
4. **No new editor variants outside this RFC.** New editor types or new combobox modes wait until Block C completes.

The full RFC is `docs/design/shadcn-radix-correction-rfc.md`. Read it before starting PR-C1.

---

## ⚡ Fresh items added 2026-05-04 (post bsncraft-issues sweep)

The bsncraft-issues.md tasks assigned earlier today **all merged**: dev-mode error surface (#474), ServerMutationResult.row doc (#475), flex-resize fix (#476), dual-output RFC (#477), cellEditor union widen (#478), Option B P0 fix (#479), createTextEditor (#480), multi-cell delete (#471), paste-into-cell (#467), error boundary (#468), keyboard shortcuts (#464). All three workers' queues drained almost entirely.

Pickups remaining in this handoff are queued below. **Pull main and rebase any in-flight branches before continuing — main has moved a lot today.**

**Coordinator note:** worker3's caveat from the pinned-lane RFC verdict still needs verification — `<BcServerGrid rowModel="tree">` group rows under the new 3-track template (Option B). Queued as `v06-tree-mode-option-b-regression-test` on worker1 since group rows live in the server-tree path.

---


## ⏸ URGENT: review needed on pinned-lane positioning RFC

**Maintainer asked for a group decision** on the v0.6.0-alpha.1 pinned-right CSS architecture before coordinator picks a fix. Read `docs/coordination/pinned-lane-positioning-decision.md` and add your verdict at the bottom (~30 sec — pick option A/B/C/D/E + 2-4 lines on why for your lane). Coordinator merges + ships once all 3 workers have weighed in.

---

**Worktree:** `~/work/bcg-worker3`
**Branch convention:** `agent/worker3/<task-slug>`

## How to use this document

When the maintainer says **"review your handoff"**, read the **Active task** section below and proceed. This document is the source of truth for what worker3 should be doing right now. The Claude coordinator in `~/work/bc-grid` keeps it current.

## Hard rule — workers do NOT run Playwright / e2e / smoke-perf / perf / broad benchmarks

This is binding (`docs/AGENTS.md §6`). Workers run focused unit tests + `bun run type-check` + `bun run lint` + the affected package's build. **Never** run `bun run test:e2e`, `bun run test:smoke-perf`, `bun run test:perf`, `bunx playwright`, or broad benchmark commands. The coordinator runs those during review/merge. If your change adds or modifies a `.pw.ts` file, note in the PR that it was not run locally — the coordinator will run it.

You implement code; the coordinator reviews and runs the slow gates.

**Note on CI:** GitHub Actions automatically runs `smoke`, `e2e (Playwright)`, and `smoke perf (Chromium)` jobs on every PR. Those CI jobs are not "you running tests" — they are the coordinator's CI infrastructure verifying your work. Seeing `e2e (Playwright) ✓` in the PR's checks panel is expected and good. PR descriptions should explicitly state which gates you ran locally so reviewers don't conflate your local runs with CI's automatic ones.

---

## Active task — v0.5 work (updated 2026-05-02 — re-ping)

### What's already shipped from your lane

- ✅ **#352** worker3 audit findings doc
- ✅ **#354** date/datetime/time `useLayoutEffect` focusRef fix — went out in `v0.4.0`
- ✅ **#356** visible validation surface (popover under editor input) — went out in `v0.4.0`
- ✅ **#359** `useBcGridState` turnkey state hook + types (v0.5 task 1)
- ✅ **#361** `BcGridApi.startEdit/commitEdit/cancelEdit` + editor portal methods (v0.5 task 2)
- ✅ **#364** shadcn Combobox migration for `select.tsx` + `EditorOption.swatch`/`icon` fields + `colour-selection` hero spike (v0.5 P0-4 part 1)
- ❌ **#365** multi-select Combobox migration — closed (branch carried unintended reverts). Re-attempted as #372.
- ✅ **#370** autocomplete Combobox migration + `internal/combobox-search.tsx` (v0.5 P0-4 leg 2 of 3)
- ✅ **#372** multi-select Combobox v2 (v0.5 P0-4 leg 3 of 3 — **closes audit P0-4 entirely**)
- ✅ **#375** sales-estimating hero spike — closes audit **P0-9 hero set entirely** (all 4 spikes shipped: colour, doc-mgmt, production-estimating, sales-estimating)
- ✅ **#378** Backspace/Delete clear semantics (audit P1-W3-1)
- ✅ **#381** `editController.discardRowEdits` + `BcEditGrid` Discard action (audit P1-W3-3) — coordinator merge-resolved a test-file conflict from #378
- ✅ **#382** `BcCellEditor.getValue?` hook for custom editors (audit P1-W3-6) + custom-editor recipe doc
- ✅ **#385** `aria-required` / `aria-readonly` / `aria-disabled` on built-in editors (audit P1-W3-7) — closes the cheap-P1 train
- ✅ **#390** v0.5 editor-bundle-1 (locale parser + multi-Enter fix + clear-rejection toast)
- ✅ **#414** `v06-in-cell-editor-mode-pr-c` — popup categorisation for select/multi/autocomplete (framework migration closed)
- ✅ **#421** `v05-default-context-menu-wiring` editor + row-action slice — `Editor` submenu (edit mode / show validation / show keyboard hints / activation / blur / esc-discards-row) + row actions + dismiss-latest-error
- ✅ **#424** `v06-editor-visual-contract-consolidation` — `data-bc-grid-edit-state` canonical attribute + six `--bc-grid-edit-state-*` tokens + dual-attribute helper for one-release migration
- ✅ **#426** + **#430** `v05-bsncraft-row-state-cascade-scoping` — RFC documenting the bug + recommending approach B (`:not()` selector guard) + 16 selectors swept + 17 source-shape regression guards. Closes bsncraft 2026-05-03 P0 #2. Merged 3d4f603 + 5cbb214.
- ✅ **#427** `v06-multi-combobox-enter-semantics` — pinned the multi-mode Enter contract with 4 source-shape regression guards (implementation already shipped in #390). Merged 7bc55e5.
- ✅ **#431** `v06-editor-keyboard-navigation-polish` — `nextEditableCellAfterEdit` helper skips non-editable cells + disabled rows during Tab/Shift+Tab. 13 new behavioural tests. Merged cbb65fd.
- ✅ **#435** `v06-prepareresult-preload-select-multi` — async-loaded options on select + multi-select via `column.fetchOptions`.
- ✅ **#437** `v06-bulk-row-patch-primitive` — `apiRef.applyRowPatches([...])` atomic bulk update. Two-spike-confirmed.
- ✅ **#440** `v06-row-drag-drop-hooks` — `onRowDragOver` / `onRowDrop` callbacks + auto-scroll. Two-spike-confirmed.
- ✅ **#442** `v06-bcselection-narrowing` — `isExplicitSelection` / `isAllSelection` / `isFilteredSelection` + `forEachSelectedRowId`. Two-spike-confirmed.

## v0.6 train — your queue (in priority order)

**0.5.0 GA shipped 2026-05-03.** v0.6 absorbs consumer feedback + adds spreadsheet flows + bulk operations + state-persistence. Target ship date: ~2026-05-10. **v0.6.0-alpha.1 cut imminent.**

You've shipped 5 v0.6 PRs in this cycle (the bulk-row-patch headline + drag-drop + bcselection narrowing + prepareresult preload). Updated queue below adds three v0.6.0-alpha.1 critical items + two follow-ons.

### Active now → `v06-scroll-state-controlled-prop` (NEW from maintainer 2026-05-03; ~half day, **alpha.1 critical**)

Maintainer ask 2026-05-03: "would it be possible for a consumer to maintain the state of bc-grid, such as where it is scrolled at, and what child panels are open, so when they click back onto a page containing a bc-grid, it looks exactly the same as when navigating away?"

Most state IS already controllable (`expansion` + `onExpansionChange`, `selection` + `onSelectionChange`, `layoutState` + `onLayoutStateChange`, `rangeSelection` + `onRangeSelectionChange`). **Scroll position is the gap** — `scrollOffset` is internal-only state at `grid.tsx:461`.

**Implementation:**

1. **`BcGridApi.getScrollOffset(): { top: number; left: number }`** — getter exposing the internal `scrollOffsetRef.current`. Forwarded through `BcServerGridApi` too.

2. **`BcGridProps.initialScrollOffset?: { top: number; left: number }`** — one-time restore at mount (matches the existing `initialLayout` pattern). Sets the viewport's `scrollTop` / `scrollLeft` after mount.

3. **`BcGridProps.onScrollChange?: (next: { top: number; left: number }) => void`** — debounced callback (~100ms via `useDebounce`) so consumer can persist without firing on every scroll tick. Pin the debounce interval as a constant; future tuning becomes a deliberate change.

4. **Recipe doc** at `docs/recipes/grid-state-persistence.md` — pulls together the FULL state-restore pattern (layoutState, expansion, selection, rangeSelection, scrollOffset) so consumers see the complete picture in one place. Per the maintainer's "the grid can look the same as when the user left it" goal.

5. **Test coverage** — unit tests for the debounce + getter + initialScrollOffset; Playwright spec at `apps/examples/tests/scroll-state-restore.pw.ts` showing scroll → unmount → remount → scroll position restored.

**Branch:** `agent/worker3/v06-scroll-state-controlled-prop`. **Effort:** ~half day. **alpha.1 critical** — pairs with the recipe doc to close the "all available state persistable" story.

### Next-after → `v06-server-grid-actions-column` (HEADLINE, ~1-2 days, bsncraft P1)

**This is your second v0.6 headline.** Bsncraft 2026-05-03 P1: the actions-column abstraction (`onEdit`, `onDelete`, `extraActions`, `hideActions`, `canEdit`, `canDelete`, `confirmDelete`, `editLabel`, `deleteLabel`, `DeleteIcon`, `onDiscardRowEdits`) ONLY exists on `BcEditGridProps`. None of these props are on `BcServerPagedProps`, `BcServerInfiniteProps`, or `BcServerTreeProps`. Consumers with server-paged/tree grids — most ERP master tables — have to hand-roll the column instead of getting the first-class one. Bsncraft alone has ~150 LOC reimplementing `createActionsColumn` for their ServerEditGrid wrapper.

The recommended fix per the bsncraft memo is **Option A: add the prop set to all `BcServer*Props` types and have `<BcServerGrid>` auto-inject `__bc_actions` the same way `<BcEditGrid>` does.**

**Implementation:**

1. **Lift `createActionsColumn` from `editGrid.tsx` to a shared module** (suggest `packages/react/src/actionsColumn.ts`) so both `<BcEditGrid>` and `<BcServerGrid>` can call it.

2. **Add the actions-column prop set to `BcServerPagedProps`, `BcServerInfiniteProps`, `BcServerTreeProps`**. Mirror the BcEditGrid shape exactly: `onEdit`, `onDelete`, `extraActions`, `hideActions`, `canEdit`, `canDelete`, `confirmDelete`, `editLabel`, `deleteLabel`, `DeleteIcon`, `onDiscardRowEdits`.

3. **Auto-inject `__bc_actions` in `<BcServerGrid>` when any actions prop is set** — same gate as `<BcEditGrid>` line 39 (`hasActions = Boolean(onEdit || onDelete || onDiscardRowEdits || extraActions)`). Inject after the consumer's columns array, before the synthetic columns prepended by `<BcGrid>`.

4. **Update `docs/api.md`** to document the new prop set on each server grid type. Cross-reference the existing `<BcEditGrid>` actions section.

5. **Recipe doc** at `docs/recipes/server-grid-actions.md` covering the migration story for consumers (e.g. bsncraft) currently hand-rolling. Include a before-after diff showing the LOC savings.

6. **Test coverage:** unit tests + 1 Playwright spec under `apps/examples/tests/server-grid-actions.pw.ts`. Confirm the actions column appears on `<BcServerGrid rowModel="paged">` with the standard edit/delete affordances.

**Branch:** `agent/worker3/v06-server-grid-actions-column`. **Effort:** ~1-2 days. **bsncraft consumer P1** — closing this lets bsncraft delete their entire `apps/web/components/edit-grid.tsx` wrapper (~150 LOC).

**bsncraft consumer issues triage 2026-05-04** (`docs/coordination/bsncraft-issues.md`): two items on this lane. Pulled forward into the queue.

## ⚡ Fresh items added 2026-05-04 (round 2)

You shipped: builtin-editors-generic-trow (#478), createTextEditor inputComponent slot (#480), multi-cell range delete (#471), paste-into-cell detection (#467), editing-state controlled prop (#482). Queue thinned. Five new items below — most pull through your shadcn-native-editors thread (#480 only shipped text; 7 more editors to migrate to the inputComponent shape) plus a v1.0 a11y audit prep.

### Active now → `v06-shadcn-native-editors-numeric-batch` (~1 day)

Per-editor migration to the `inputComponent` render-prop pattern that #480 established for text. Continue with the **numeric-input cluster** — `numberEditor`, `dateEditor`, `datetimeEditor`, `timeEditor`. All take string/number values, all use a single `<input>` shell, all benefit from the same render-prop slot.

**Implementation per editor (4 editors, ~15 min each + 30 min for tests):**

1. Add `inputComponent?: ComponentType<{ ref, value, onChange, onKeyDown, ... }>` to the editor's factory signature. Mirror the shape from `createTextEditor`.
2. Default to the existing built-in `<input>` rendering (zero behavior change for consumers who don't set `inputComponent`).
3. Pin each editor's input-component contract with a unit test in `packages/editors/tests/<editor>InputComponent.test.tsx`.
4. **Recipe extension** in `docs/recipes/shadcn-editors.md` showing the wiring for each (number → shadcn `Input` with type="number", date → shadcn `Input type="date"`, etc.).

**Branch:** `agent/worker3/v06-shadcn-native-editors-numeric-batch`. **Effort:** ~1 day.

### Next-after → `v06-shadcn-native-editors-select-batch` (~1 day)

The other half of the matrix: the **option-list cluster** — `selectEditor`, `multiSelectEditor`, `autocompleteEditor`, `checkboxEditor`. Different ergonomics (option dropdowns, popover triggers, checkbox toggles); needs separate primitives:

- `selectEditor` / `multiSelectEditor` / `autocompleteEditor`: render-prop `triggerComponent?: ComponentType<{ open, value, label }>` for the cell-level trigger button + `optionItemComponent?: ComponentType<{ option, isActive, isSelected }>` for individual options. Consumer wires shadcn `Button` + `CommandItem`.
- `checkboxEditor`: render-prop `checkboxComponent?: ComponentType<{ ref, checked, onCheckedChange }>` — consumer wires shadcn `Checkbox`.

**Recipe extension** + per-editor unit tests + 1 Playwright spec showing async-loaded options paint with shadcn primitives.

**Branch:** `agent/worker3/v06-shadcn-native-editors-select-batch`. **Effort:** ~1 day.

### Then-after → `v06-editor-async-validation` IMPLEMENTATION (~1 day, was queued earlier)

Already in your queue but worth re-anchoring. Widen `BcValidationResult` to support `Promise<{valid, error}>`. Pass an `AbortSignal` so superseded validations abort. Surface `data-bc-grid-edit-state="pending"` during the fetch. Recipe at `docs/recipes/async-validation.md`.

**Branch:** `agent/worker3/v06-editor-async-validation`. **Effort:** ~1 day.

### After-that → `v07-editor-a11y-audit` (~1 day, **v1.0 prep**)

Walk every editor (text/number/date/datetime/time/select/multi-select/autocomplete/checkbox) against the WAI-ARIA Authoring Practices for grid editors. Verify:

1. **Focus contract** — focus lands on input on mount; focus returns to cell on commit/cancel; no focus traps when navigating between editors via Tab.
2. **ARIA states** — `aria-required`, `aria-readonly`, `aria-disabled`, `aria-invalid`, `aria-describedby` (for validation messages) all stamped correctly per state.
3. **Screen-reader announcements** — committing a value announces the new value; rejection announces the error; the live region (`statusBar`'s `latestError` segment from #407) reads in the right order.
4. **Keyboard contract per editor type** — Enter commits; Esc cancels; Tab/Shift+Tab navigate; F2 toggles between display/edit on read-only cells. Document any per-editor variation (autocomplete uses Enter to pick AND commit, etc.).

Output: `docs/design/v1-editor-a11y-audit.md` with one row per editor + verdict per row + linked PR for any fixes.

**Branch:** `agent/worker3/v07-editor-a11y-audit`. **Effort:** ~1 day. **v1.0 prerequisite.**

### Last → `v07-editor-perf-large-option-lists` (~half day, **v1.0 prep**)

Autocomplete + multi-select with 500+ options today renders all options in the dropdown. At 5k+ options (vendor lookup, employee directory) the open-popover frame stalls. Verify behavior at 5k options + add a virtualization strategy if dropped frames > 0:

1. Bench at `apps/benchmarks/tests/perf.perf.pw.ts`: open multi-select with 5k options, measure frame time + first-paint.
2. If > 16ms: virtualize the option list using the existing `@bc-grid/virtualizer` package (yes, the grid's own virtualizer can drive a flat list). Keep the option-list height bounded (max 320px); render only ~20 options.
3. Document the threshold in `docs/api.md` editor section: "for option lists > 200, use `column.fetchOptions` async loader (paginated server-side)."

**Branch:** `agent/worker3/v07-editor-perf-large-option-lists`. **Effort:** ~half day.

### Then-last → `v06-cell-renderer-error-boundary` (~half day, production safety)

Bsncraft anticipated polish: today if a consumer's `cellRenderer` throws (e.g. expects `row.amount` to be a number but the row has `null`, calls `.toLocaleString()`), the entire grid unmounts. One bad row tanks the whole screen. Production grids need a per-cell safety net.

**Implementation:**

1. **Wrap each cell's renderer in a React error boundary.** When a cell renderer throws, log to `console.error` with `[bc-grid] cellRenderer threw on rowId=<x> columnId=<y>: <error>`, then fall back to rendering `formattedValue` (the column's `formatCellValue` output) instead of the custom renderer.
2. **Optional consumer hook**: `BcGridProps.onCellRendererError?: (params: { rowId, columnId, error }) => void` so consumers can pipe errors to their own error tracking.
3. **Test coverage:** unit test where `cellRenderer` throws — verify grid stays mounted, errored cell renders fallback, sibling cells render normally.

**Branch:** `agent/worker3/v06-cell-renderer-error-boundary`. **Effort:** ~half day.

### Final → `v06-keyboard-shortcuts-help-overlay` (~half day, discoverability)

Bsncraft anticipated polish: bc-grid has 20+ keyboard shortcuts (Tab navigation, Enter to commit, F2 to edit, Ctrl+C/Ctrl+V, Shift+F10 for context menu, Shift+E/Shift+Delete for actions row from #464, Cmd+Z for cell undo from #454, etc.). Sighted-keyboard users currently have no way to discover them. Excel ships F1; AG Grid ships a "?" overlay; ERPs need this for power users.

**Implementation:**

1. **`BcGridProps.keyboardShortcutsHelp?: boolean | (ctx: BcKeyboardShortcutsContext) => ReactNode`** — opt-in. When `true`, pressing `?` (or Shift+F1) opens a modal listing all bc-grid keyboard shortcuts with descriptions. Consumer can pass a render-prop to extend with their own shortcuts.
2. **Built-in list** structured by category: Navigation (Tab, Arrow keys, Home/End, Page Up/Down, Ctrl+Home/End), Editing (F2, Enter, Esc, Cmd+Z), Selection (Space, Shift+Click, Ctrl+A), Actions (Shift+E, Shift+Delete, context menu), Clipboard (Cmd+C/V).
3. **Localization-friendly** — labels go through the `messages` prop infrastructure, so consumers can translate the modal content.
4. **Recipe** at `docs/recipes/keyboard-shortcuts-help.md` showing how a consumer extends with their own shortcuts (e.g. bsncraft's `f`/`s`/`r` global navigation).

**Branch:** `agent/worker3/v06-keyboard-shortcuts-help-overlay`. **Effort:** ~half day.

### Then-active → `v06-builtin-editors-generic-trow` (bsncraft P1 #13, ~half day)

Bsncraft consumer report: `@bc-grid/editors` exports built-in editors typed as `BcCellEditor<unknown, unknown>`. Every column declaration in a typed grid triggers TS2349 and requires a cast: `const text = textEditor as BcCellEditor<CustomerRow>`. Bsncraft has 10+ master grids planned; that's 10+ identical casts.

**Implementation options:**

1. **Make built-in editor factories generic over `TRow` / `TValue`.** `textEditor<TRow>()` returns `BcCellEditor<TRow, string>`. Consumers call `textEditor<CustomerRow>()` to get the right type. **But** that breaks ergonomics — every column declaration becomes `cellEditor: textEditor<CustomerRow>()` instead of `cellEditor: textEditor`.

2. **Make the `Component` prop's `TRow` parameter contravariant** (or use a wider type that accepts any TRow as a subtype). The editor doesn't ACTUALLY need `TRow` typed at the editor object level — only at the `Component` props passed at mount time. So `textEditor: BcCellEditor<unknown, string>` could be widened to be assignable to `BcCellEditor<CustomerRow, string>` via structural subtyping. The audit's prior deferral noted the TS variance trap here — this task is to find the structural shape that lets the existing exports flow into typed columns without a cast.

3. **Emit a TS function-overload signature pair**: `textEditor` is BOTH a `BcCellEditor<unknown, string>` (current, for untyped use) AND assignable to `BcCellEditor<TRow, string>` for any TRow. Use intersection types or const generics to make it work.

Recommend approach 2 (structural widening). Try `BcCellEditor<TRow, TValue>` shape: which fields use TRow contravariantly? Likely the Component's row prop. If we narrow it to `Component: ComponentType<{ row: unknown }>` instead of `ComponentType<{ row: TRow }>`, it's assignable everywhere. Worker3 lane owns the editor types so you have the context.

**Test coverage:** add a typecheck assertion in `packages/editors/tests/typing.test.ts` (create if missing): `const col: BcReactGridColumn<CustomerRow> = { ..., cellEditor: textEditor }` — should compile without cast.

**Branch:** `agent/worker3/v06-builtin-editors-generic-trow`. **Effort:** ~half day. **bsncraft P1.**

### Next-after → `v06-shadcn-native-editors` (bsncraft P2 #17, ~1-2 days, possible v0.7 split)

Bsncraft consumer report: `textEditor` / `selectEditor` / etc. render `<input>` / `<select>` with default browser styling. Visually inconsistent with shadcn-native host apps. For a grid that's "the main way users edit data" (bsncraft framing), this matters.

**Implementation options:**

1. **Companion `@bc-grid/editors-shadcn` package** — imports host shadcn primitives, exports `textEditorShadcn` / `selectEditorShadcn` / etc. with the same `BcCellEditor` contract. Consumer picks one or the other. **Cost:** new package + monorepo plumbing + one-more-thing-to-publish.

2. **Render-prop hook** — `textEditor` accepts an optional `inputComponent` prop that overrides the default `<input>`. Consumer passes their shadcn `<Input>`. bc-grid keeps the lifecycle (focus, commit, validate). **Cleaner; no new package; preserves the simple default for non-shadcn consumers.**

3. **Default-styled inputs** — change the built-in editors to use shadcn classnames + tokens so they look right out of the box. Lowest-friction but most invasive (changes default rendering for every consumer).

Recommend approach 2 (render-prop). Lowest invasion + composable + zero new package.

**Implementation:**

1. Add `inputComponent?: ComponentType<{ ref, value, onChange, onKeyDown, ... }>` to `textEditor`'s factory signature. Default: built-in `<input>`. Override: consumer's shadcn `<Input>`.
2. Same shape for `numberEditor` / `dateEditor` / `selectEditor`. Each editor's `inputComponent` accepts the props it needs.
3. **Recipe** at `docs/recipes/shadcn-editors.md` showing how to wire shadcn `<Input>` / `<Select>` into the grid editors.

**Branch:** `agent/worker3/v06-shadcn-native-editors`. **Effort:** ~1-2 days. **bsncraft P2** — large split candidate for v0.7 if v0.6 GA timeline tightens.

### Then-after → `v06-editor-async-validation` (~1 day)

Today's `column.validate(value, params): BcValidationResult` is synchronous. Many ERP scenarios need async validation: "is this customer code already taken in our DB?", "does this email match a known account?", "is this SKU still active?". These run against a server endpoint with `AbortSignal` semantics matching the loader contract.

**Implementation:**

1. **Widen `BcValidationResult` to support promises.** Today `validate` returns `{ valid: boolean; error?: string }`. New union: also accept `Promise<{ valid: boolean; error?: string }>` with an in-flight indicator. The editor mount surfaces `pending` state during the fetch.
2. **`AbortSignal` on validate** — pass the editor's lifecycle signal so a superseded validation aborts. Match the existing prepare-result preload pattern.
3. **Visual state** — `data-bc-grid-edit-state="pending"` already exists from #424; reuse it for in-flight async validation.
4. **Recipe** at `docs/recipes/async-validation.md` — Hasura unique-check + REST `/exists` patterns.

**Branch:** `agent/worker3/v06-editor-async-validation`. **Effort:** ~1 day.

### After-that → `v06-server-grid-actions-keyboard` (~half day)

Followup to #453 server-grid actions column. Today the actions column buttons (Edit / Delete / extras) are reachable via mouse + Tab focus, but the **discovery** isn't great — sighted-keyboard users don't know the actions column exists until they Tab to it. Add a keyboard shortcut: `Shift+E` on a row triggers the column's `onEdit`; `Shift+Delete` triggers `onDelete` with the consumer's `confirmDelete` gate. Both gated on the actions column being present.

**Branch:** `agent/worker3/v06-server-grid-actions-keyboard`. **Effort:** ~half day.

### Then-next → `v06-editor-paste-into-cell-detection` (~half day)

When user pastes text into an editing cell, the input today accepts the text as a string. For numeric / date editors, format-detect the pasted content and convert (e.g. paste `"$1,234.56"` into a number cell → set 1234.56; paste `"2026-05-03"` into a date cell → ISO date). Falls through to the column's `valueParser` if defined; otherwise uses the editor's built-in parser. Pin the contract with unit tests covering currency / percentage / scientific-notation / locale-aware decimals.

**Branch:** `agent/worker3/v06-editor-paste-into-cell-detection`. **Effort:** ~half day.

### After-that → `v06-editor-multi-cell-delete-confirm` (~half day)

When `Delete` is pressed on a range selection (multiple cells highlighted), today the cells clear silently. Excel/Google Sheets show a "Clear contents" confirmation when the range > 1 cell as a guard against accidental wipes. Add an opt-in `confirmRangeDelete?: boolean | (range: BcRange) => Promise<boolean>` prop. Default `false` (preserve existing behavior); when `true`, surfaces the consumer's confirm dialog. Recipe at `docs/recipes/range-delete-confirm.md`.

**Branch:** `agent/worker3/v06-editor-multi-cell-delete-confirm`. **Effort:** ~half day.

### Last → `v06-editing-state-controlled-prop` (~half day)

Companion to `v06-scroll-state-controlled-prop` (#450). Surface the editor controller's `editState.cell` as a controlled prop so consumers can persist + restore "which cell was being edited when user navigated away." Add `BcGridProps.editingCell?: BcCellPosition | null` controlled + `onEditingCellChange?: (next) => void` callback. Pairs with the state-persistence recipe to close the "all available state" story end-to-end.

**Branch:** `agent/worker3/v06-editing-state-controlled-prop`. **Effort:** ~half day.

### Previously active → `v06-editor-cell-undo-redo` (DONE — #454 merged in this session)
### Previously active → `v06-editor-focus-retention-on-rerender` (DONE — #457 merged in this session)
### Previously active → `v06-server-grid-actions-column` (DONE — #453 HEADLINE, bsncraft P1, ~150 LOC saving for bsncraft)
### Previously active → `v06-scroll-state-controlled-prop` (DONE — #450 alpha.1 critical, full state-persistence story now possible)
### Previously active → `v06-editor-tab-wraparound-polish` (DONE — #448 merged bca5714)

### Previously active → `v06-editor-keyboard-navigation-polish` (DONE — #431 merged cbb65fd)

### Previously active → `v06-editor-visual-contract-consolidation` (DONE — #424 merged 21b86e5)

### Old anchor: `v05-default-context-menu-wiring` — editor + row-action slice (~1.5-2h)

**Layout pass PR (c) shipped as #418** (41ec5e0) — `availableGridWidth` ResizeObserver removed (consolidated onto `viewport.width`); `editorCellRect` simplified (no more `expansionState` invalidation dep + lint suppression); design.md §4.2 / §4.3 + §13 decisions table updated. Closes layout RFC §4 memos 3 + 4.

**In-cell editor RFC fully shipped** across PRs a/b/c (#408 / #412 / #414).

**New gap surfaced 2026-05-03 by bsncraft consumer screenshot:** `DEFAULT_CONTEXT_MENU_ITEMS` doesn't include any of the new toggles your lane shipped. The toggle PROPS (`editingEnabled`, `showValidationMessages`, `showEditorKeyboardHints`, `editorActivation`, `editorBlurAction`, `escDiscardsRow`) all work, but bsncraft can't reach them via right-click. Worker2's #404 row-actions also exist as built-ins but aren't in DEFAULT.

**Your slice (editor + row-action lane):** wire the editor + row-action items into the default context menu.

1. **Editor toggle submenu** (always present, when `<BcEditGrid>` is the active grid OR `editingEnabled !== false`): an `Editor` submenu with `Edit mode` (toggle reading `editingEnabled`), `Show validation messages` (reading `showValidationMessages`), `Show keyboard hints` (reading `showEditorKeyboardHints`), separator, `Activation` submenu (Single click / Double click / F2 only — radio reading `editorActivation`), `On blur` submenu (Commit / Reject / Ignore — radio reading `editorBlurAction`), `Esc reverts row` (toggle reading `escDiscardsRow`).

2. **Row-action items** (when right-click target has `context.row` AND grid is `<BcEditGrid>`): top-level items `Insert row above`, `Insert row below`, `Duplicate row`, separator, `Delete row` (with the existing `confirmDelete` gate from #404). These are already built-ins from worker2's PR — your slice is wiring them into the default with the row-context guard.

3. **Validation actions** (top-level when there's a latest validation error from #407 in the status-bar slot): `Dismiss latest error` action.

worker1 (server toggles) + worker2 (column / view / filter) will own their own slices.

**Branch:** `agent/worker3/v05-default-context-menu-wiring-editor`. **Effort:** ~1.5-2h.

### After context-menu wiring → `v06-editor-visual-contract-consolidation` (planning doc §4, ~half day)

(Same as before.)

### Previously active → `v06-layout-architecture-pass` PR (c) (DONE — #418)

### Old anchor: `v06-layout-architecture-pass` PR (c) — cleanup + editor portal simplification (~4-6h, NOW UNGATED — worker1's PR (a) shipped)

**In-cell editor PR (c) shipped as #414** (68a84e4) — selectEditor / multiSelectEditor / autocompleteEditor pinned with `popup: true`; categorisation regression guards in place. **In-cell editor RFC fully implemented** across PRs a/b/c (#408 / #412 / #414).

**Layout pass PR (a) shipped as #415** (760de4c) — single `.bc-grid-viewport` container with sticky-positioned headers + pinned cells; ~250 LOC of JS scroll-sync deleted. Your PR (c) is now unblocked.

PR (c) closes the layout RFC: delete the `availableGridWidth` ResizeObserver from `grid.tsx:381-395` (consolidate flex source-of-truth onto `viewport.width` from `useViewportSync`); simplify `editorCellRect` (remove the `expansionState` invalidation-only dep at `grid.tsx:1713` and the lint suppression at `:1672`); update `docs/design.md §4.2 / §4.3` to describe the new render graph + add a row to the §13 decisions table. Closes layout RFC §4 memos 3 (editor portal mispositioning band-aid → structural) and 4 (flex distribution single source of truth).

**Branch:** `agent/worker3/v06-layout-architecture-pass-pr-c`. **Effort:** ~4-6h.

### After layout PR (c) → `v06-editor-visual-contract-consolidation` (planning doc §4, ~half day)

Pull §4 forward from `docs/coordination/v05-audit-followups/worker3-editors-and-validation.md`. Cell-state styling lives in two places (`data-bc-grid-cell-state="error"` on the cell + `.bc-grid-validation-popover` chrome) — different visual contracts; consumer overrides must touch both. Consolidate into one cell-state contract with the popover composing on top. Pair the migration note with the layout pass's `.bc-grid-scroller` → `.bc-grid-viewport` rename note in `docs/migration/v0.6.md`.

**Branch:** `agent/worker3/v06-editor-visual-contract-consolidation`. **Effort:** ~half day.

### After visual-contract consolidation → bsncraft migration co-pilot (editor side, consumer-paced)

When bsncraft's customers grid migration draft surfaces editor-side rough edges, your role is editor + lookup expertise. Until then, if you want to keep momentum, pull a v0.7 follow-up from the in-cell editor RFC's open questions (e.g. Radix-backed hybrid date/datetime picker if cross-browser variance bites, `popup: "auto"` mode for select editors, `BcEditorOverlay.Anchor` primitive).

### Previously active → `v06-in-cell-editor-mode` PR (c) (DONE — #414)

68a84e4: selectEditor / multiSelectEditor / autocompleteEditor categorised as popup; in-cell editor RFC fully implemented.

### Old anchor: `v06-in-cell-editor-mode` PR (c) — verify popup editors (~3-4h)

**PR (a) shipped as #408** (51dd7c2 — framework + popup flag + scroll-out semantics + text/number/checkbox/time migration). **PR (b) shipped as #412** (edee30a — date/datetime hybrid annotations: in-cell mount with OS-chrome popovers, JSDoc `Mount mode: in-cell` markers + `popup intentionally unset` export-site comments). **#407 validation-flash-and-status-segment** (f12c270, audit P1-W3-4) also landed: `data-bc-grid-error-flash="true"` 600ms keyframe pulse + `latestError` status-bar segment + 8s decay.

PR (c) closes the in-cell editor RFC: set `popup: true` on selectEditor / multiSelectEditor / autocompleteEditor and verify they continue to mount via the existing `<EditorPortal>` overlay path. Should be near-zero code change since the portal path already works for them — the test surface is the categorisation regression guard (each built-in editor's expected popup mode pinned in `inCellEditorMode.test.ts`) plus 1 Playwright spec covering the select-editor happy path with a detail panel above (verifies the listbox dropdown still overflows the cell box and click-outside on a dropdown option commits without firing the click-outside-cancel path).

**Branch:** `agent/worker3/v06-in-cell-editor-mode-pr-c`. **Effort:** ~3-4h.

### After PR (c) → `v06-layout-architecture-pass` PR (c) — cleanup (~4-6h, GATED on worker1's PR (a))

(Same as before — gated on worker1's layout PR (a). Coordinator will signal when ready.)

### After layout PR (c) → `v06-editor-visual-contract-consolidation` (your planning doc §4, ~half day)

Pull §4 forward from `docs/coordination/v05-audit-followups/worker3-editors-and-validation.md` once the layout pass clears. The audit item (P1-W3 visual surface drift): cell-state styling lives in two places — `data-bc-grid-cell-state="error"` on the cell + the validation popover's `.bc-grid-validation-popover` chrome. Different visual contracts between them; consumer overrides must touch both. Consolidate into one cell-state contract with the popover composing on top.

The planning doc flagged this as breaking-change risk because consumer overrides on `data-bc-grid-cell-state="error"` would break. The original recommendation was to land it in v0.6 with a one-release back-compat alias attribute. With the layout pass already establishing v0.6 as the chrome-rewrite release line, this composes naturally — pair the migration note with the layout pass's `.bc-grid-scroller` → `.bc-grid-viewport` rename note in `docs/migration/v0.6.md`.

**Branch:** `agent/worker3/v06-editor-visual-contract-consolidation`. **Effort:** ~half day.

### Previously active → `v06-in-cell-editor-mode` PR (a) (DONE — #408)

51dd7c2: framework + popup flag + scroll-out semantics + 4-editor migration.

### Previously active → `v06-in-cell-editor-mode` PR (b) (DONE — #412)

edee30a: date/datetime hybrid annotations (in-cell with OS-chrome popovers).

### Previously active → `v05-validation-flash-and-status-segment` (DONE — #407)

f12c270: 600ms cell-flash on validation rejection + 8s status-bar `latestError` segment. Audit P1-W3-4. Pulled forward from worker3-editors-and-validation.md §1.

### Old anchor: `v06-in-cell-editor-mode` PR (a) — framework + flag + scroll-out + 4-editor migration (~8-10h)

**Editor-portal polish bundle-1 (#398, 3a12ffe), result-aware onCellEditCommit (#401, d173ff4), and prepareResult preload (#403, 348ffdc) all shipped.** Your v0.5 lane is structurally complete — all editor-side audit findings closed, both bsncraft editing-pass paper-cuts shipped, autocomplete paints with options on first frame.

The next active task is the v0.6 in-cell editor mode RFC. **Read `docs/design/in-cell-editor-mode-rfc.md` end-to-end before you start** — the categorisation table in §4 + the scroll-out semantics in §5 are the load-bearing sections.

PR (a) scope per RFC §7:

- New `popup?: boolean` field on `BcCellEditor` (default `false`).
- `EditorMount` lifted to a public-internal component with `mountStyle: "in-cell" | "popup"` branch — in-cell drops the absolute-positioning wrapper, popup keeps it.
- `<EditorPortal>` shrinks to popup-mode only (returns `null` when active editor is in-cell).
- `editorCellRect` `useMemo` short-circuits to `null` for in-cell mode — saves the DOM lookup + `expansionState` invalidation for the common case.
- `BcGridProps.editScrollOutAction?: "commit" | "cancel" | "preserve"` (default `"commit"`) governs in-cell editor unmount when row scrolls out of virtualizer's render window.
- Migrate `textEditor` / `numberEditor` / `checkboxEditor` / `timeEditor` to in-cell mode (default flag carries them automatically; tests pin the contract).

**Branch:** `agent/worker3/v06-in-cell-editor-mode-pr-a`. **Effort:** ~8-10h.

### After PR (a) → `v06-in-cell-editor-mode` PR (b) — date/datetime hybrid (~3-4h)

Annotate dateEditor / datetimeEditor as in-cell. Native `<input type="date">` / `<input type="datetime-local">` stay (their popovers are OS-chrome, not React DOM, so no `data-bc-grid-editor-portal` wiring needed for v0.6.0). Cross-browser validation Chromium / Firefox / Safari. One Playwright spec.

**Branch:** `agent/worker3/v06-in-cell-editor-mode-pr-b`. **Effort:** ~3-4h.

### After PR (b) → `v06-in-cell-editor-mode` PR (c) — verify popup editors (~3-4h)

Set `popup: true` on selectEditor / multiSelectEditor / autocompleteEditor. Should be near-zero code change since today's portal path already works for them. One Playwright spec for the select case happy-path with detail panel above.

**Branch:** `agent/worker3/v06-in-cell-editor-mode-pr-c`. **Effort:** ~3-4h.

### After in-cell editor PRs → `v06-layout-architecture-pass` PR (c) — cleanup + editor portal simplification (~4-6h, GATED on worker1's PR (a))

Layout architecture pass RFC at `docs/design/layout-architecture-pass-rfc.md` — your PR (c) is the cleanup leg. Closes the band-aid `availableGridWidth` ResizeObserver from `d7eddaf` (`grid.tsx:381-395`) by consolidating onto `viewport.width` from the existing `useViewportSync`. Simplifies `editorCellRect` (`grid.tsx:1673-1714`) by dropping the `expansionState` invalidation-only dep + the lint suppression at `:1672` — sticky-positioned cells have stable DOM positions, so the rect is correct without re-invalidation when detail panels above the editing row toggle.

Also updates `docs/design.md §4.2 / §4.3` to describe the new render graph + adds a row to the design.md decisions table. Closes memos 3 (editor portal) and 4 (flex distribution) per the RFC §4 table.

**Coordinator will signal when worker1's PR (a) lands.** Until then, do NOT branch on this — PR (a)'s rewrite changes the render graph that PR (c) cleans up against.

**Branch (when ready):** `agent/worker3/v06-layout-architecture-pass-pr-c`. **Effort:** ~4-6h.

### Previously active → `v05-prepare-result-preload` (DONE — #403)

Autocomplete editor preloads the first page of options via `editor.prepare()` so the dropdown paints with options on first frame. Small `BcCellEditorPrepareParams.column` extension. Graceful prepare-rejection (fall through to synchronous `column.options` instead of bouncing to Navigation). Merged 348ffdc.

### Previously active → `v05-on-cell-edit-commit-result-aware` (DONE — #401)

Pull the v0.6 §3 task forward from `docs/coordination/v05-audit-followups/worker3-editors-and-validation.md`: autocomplete editor preloads the first page of options via `editor.prepare()` so the dropdown paints with options on first frame instead of a blank "Loading…" state. Small `BcCellEditorPrepareParams` extension (add `column: BcColumn` so prepare callbacks can branch on column metadata) — flag the API change in the PR description so coordinator catches it during the api-surface diff review.

Graceful-degradation note from the planning doc: if `prepare` rejects, fall through to the synchronous `column.options` path so the editor still mounts even when preload fails (don't push the state machine back to Navigation on prepare-rejection).

**Branch:** `agent/worker3/v05-prepare-result-preload`. **Effort:** ~half day (includes a custom-editor recipe doc update + tests).

### Previously active → `v05-editor-bundle-1` (DONE — #390)

The 3 editor polish items from your own #387 doc landed (locale-aware number parser §2, multi-mode Combobox `Enter` semantics fix §5, clear-rejection feedback for sighted users via status-bar slot §6).

### Previously active → `v05-editor-followups-planning-doc` (DONE)

Mirror worker1's #383 + worker2's grouping-followups pattern: convert your audit findings (#352) — the editor-lane items not yet shipped — into concrete v0.6 task entries. Output: read-only doc at `docs/coordination/v05-audit-followups/worker3-editors-and-validation.md`. No source changes; pure planning while your lane is otherwise clean.

**Items to cover** (each as a v0.6 task proposal with file:line citations + fix shape + affected packages):

1. **Validation visual flash + status-bar slot for latest error** (audit P1-W3-4). Today validation rejection paints a static red border that all looks the same after multiple invalid commits — no signal of which cell was just rejected. Pair the existing assertive announce with a transient pulse on the cell (`data-state="error-flash"` for ~600ms) and a status-bar segment showing the latest error string with cell coordinate ("Row 12 — Discount: must be ≤ 100"). Pairs with audit P1-W3 status-bar slot.

2. **Locale-aware number parser** (audit P1-W3-5). Ship `numberEditor.parseLocaleNumber(value, locale)` helper using `Intl.NumberFormat`'s decimal separator. Document as the recommended `column.valueParser` for international ERP grids; `1,5` should parse as `1.5` for `de-DE`.

3. **`prepareResult` preload across all lookup editors** (audit P1-W3-2). Currently autocomplete consumes `prepareResult` (#370 partial); the same preload pattern should work for select + multi-select. The state machine carries `prepareResult` through `Preparing → Editing`; just needs each editor to read it before falling through to `fetchOptions`.

4. **Editor visual contract consolidation** (audit P1-W3-8). Error / pending / dirty / focused-edit visuals are split across the cell, the input, and the editor portal — three different selectors render the same logical state. Consolidate into a single CSS-variable-driven token system; document the four states and the one selector each.

5. **Multi-mode Combobox `Enter` semantics fix** (surfaced fixing `editor-multi-select.pw.ts` at `a57a33f` / `8af914e`). `Enter` currently routes through `updateSelection` (toggling the active option) before bubbling to commit — undoing the user's last pick. In multi mode `Enter` should ONLY bubble to commit; `Space` stays as the toggle gesture. Test currently uses `Tab` as a workaround.

6. **Clear-rejection feedback for sighted users** (surfaced in worker3 #378). When `clearCell` runs `column.validate("")` and validate rejects, no editor portal is mounted so the visible validation popover (#356) doesn't fire. Sighted users see nothing; AT users hear the assertive announce. Add a transient toast / status-bar slot. Pairs with item 1.

For each item: where it manifests, what's wrong, suggested fix shape (1-3 paragraphs), affected packages, dependency on other items, capacity-aware priority order. Mirror worker1's #383 exactly.

**Branch:** `agent/worker3/v05-editor-followups-planning-doc`. **Effort:** ~half day.

### After this → bsncraft migration co-pilot (editor side)

When bsncraft drafts the customers migration, your role is editor + lookup expertise. Walk through any rough edges they hit on the editor surface (especially Combobox migration, paste binding, validation surface); those become v0.6 inputs.

### Deferred — earlier cheap P1 list (all DONE)

P0-4 and P0-9 hero spikes both fully closed. Paste-editor binding (your half of audit P0-1) waits for worker2 to define their `pasteTsv` API surface. While they work that, pick up the cheap P1 cleanups in your lane — these are real audit findings that ship as standalone improvements, no inter-worker contract needed.

**Pick the next one in this order; each is its own branch + PR:**

1. **`v05-backspace-delete-clear`** (audit P1-W3-1) — extend `EditorActivationIntent` with `{ type: "clear" }`. Excel-style semantics: Backspace clears + enters edit; Delete clears + stays in nav. The `editorKeyboard.ts` keymap is the entry point; you'll need to thread the new intent through the edit controller. **Effort: ~2 hours including tests.** Branch: `agent/worker3/v05-backspace-delete-clear`.

2. **`v05-discard-row-edits`** (audit P1-W3-3) — `editController.discardRowEdits(rowId)` for multi-cell row rollback. Surface as a button in `BcEditGrid`'s actions column when `rowState.isDirty`. **Effort: ~3 hours including tests + the action-column wiring.** Branch: `agent/worker3/v05-discard-row-edits`.

3. **`v05-custom-editor-getvalue-hook`** (audit P1-W3-6) — `BcCellEditor.getValue?: (focusEl) => unknown` hook. Today, custom editors that aren't `<input>` / `<select>` / `<textarea>` commit `undefined` on click-outside because `editorPortal.tsx`'s tag-dispatch helper doesn't know how to read them. The new optional override gets called first when present. **Effort: ~2 hours including a custom-editor recipe in docs.** Branch: `agent/worker3/v05-custom-editor-getvalue-hook`.

4. **`v05-editor-aria-states`** (audit P1-W3-7) — thread `required` / `readOnly` / `disabled` props through `BcCellEditorProps`; default editors set `aria-required` / `aria-readonly` / `aria-disabled` on inputs. **Effort: ~2 hours including tests.** Branch: `agent/worker3/v05-editor-aria-states`.

### Paste-editor-binding subsumed by worker2's #380

Worker2's #380 (`pasteTsv`) wired the paste listener directly through `useEditingController`'s bulk-edit overlay commit path — including the editor-side binding that was originally going to be your `commitFromPasteApplyPlan` half. Net result: **v0.5 P0-1 (paste integration) is fully closed in #380**, and the `v05-paste-editor-binding` task you had queued is no longer needed (it was subsumed).

If worker2's wiring needs an editor-side polish PR (e.g. validation rejection feedback during paste, paste-specific commit announcements), that becomes a v0.6 follow-up rather than a v0.5 task.

### v0.5 lane — remaining pipeline

- Migrate `packages/editors/src/autocomplete.tsx` to the `internal/combobox.tsx` shell. The base Combobox (#364) is your template; preserve autocomplete-specific behavior: free-text input, debounced async option loading, "no results" state, "still loading" state.
- **Wire `prepareResult` consumption** (audit P1-W3-2) — autocomplete is the natural place. The state machine carries `prepareResult` through `Preparing` → `Editing`; the hook should preload the first page of options via `editor.prepare()` and hand them to the Combobox so the dropdown paints with options on first frame instead of a blank "loading" state.
- Update `editorChrome.test.tsx` and any other affected tests to pin the new contract.
- Don't break the `EditorOption.swatch`/`icon` fields — they should keep working on autocomplete options too (a vendor lookup with avatar icons is the natural ERP pattern).

**Branch:** `agent/worker3/v05-combobox-autocomplete`. **Effort:** ~half day (multi-select #365 already proved out the chip/list pattern; autocomplete is mostly the prepareResult wiring + free-text input).

### v0.5 lane — remaining pipeline

1. ✅ **`v05-use-bc-grid-state`** — DONE (#359).
2. ✅ **`v05-api-ref-editor`** — DONE (#361).
3. ✅ **`v05-spike-colour-selection`** + select.tsx Combobox — DONE (#364).
4. ❌ **`v05-combobox-multi`** — closed (#365); re-done as #372.
5. ✅ **`v05-combobox-autocomplete`** — DONE (#370).
6. ✅ **`v05-combobox-multi-select-v2`** — DONE (#372). P0-4 fully closed.
7. ✅ **`v05-spike-sales-estimating`** — DONE (#375). P0-9 hero set entirely closed (4 of 4 spikes).
8. **🟢 Active P1 cleanups** — see "Active now" above (Backspace/Delete clear, discardRowEdits, getValue hook, ARIA states).
9. ✅ **`v05-paste-editor-binding`** — subsumed by worker2's #380 (worker2 wired the editor-side commit path inline through `useEditingController`'s bulk-edit overlay; closes audit P0-1 fully).

### Cheap P1s to fold in opportunistically

Each cheap; pick whichever is touched naturally during the v0.5 work above:

- **Backspace/Delete clear** (P1-W3-1) — extend `EditorActivationIntent` with `{ type: "clear" }`. Excel-style: Backspace clears + enters edit; Delete clears + stays in nav.
- **`editController.discardRowEdits(rowId)`** (P1-W3-3) — multi-cell row rollback. Surface in `BcEditGrid` action column.
- **Custom editor `getValue?` hook** (P1-W3-6) — fixes `undefined` commit on click-outside for non-INPUT/SELECT/TEXTAREA editors.
- **`aria-required` / `aria-readonly` / `aria-disabled` on editor inputs** (P1-W3-7) — thread through `BcCellEditorProps`; default editors honor them.

### Cross-worker contract notes

- **`apiRef` boundary:** you own `focusCell`/`startEdit`/`commitEdit`/`cancelEdit`/`getActiveCell`. Worker1 owns `scrollToCell`. Worker2 owns `openFilter`/`closeFilter`. Coordinate via the `BcGridApi` type.
- **Paste:** wait for worker2's `pasteTsv` contract before starting your editor binding.
- **Rebase discipline (lesson from #365):** when starting a new branch, rebase from current `origin/main` first. PRs in this sprint land every 30–60 minutes; a branch that's >2 hours behind risks carrying unintended reverts of intermediate PRs when it merges. If your local branch is more than 2–3 commits behind main, rebase before continuing or open a fresh branch.

### Rules reminder

- Don't run Playwright / smoke-perf / perf / broad benchmarks.
- Open PR; do not merge your own.
- Update `docs/queue.md` `[draft]` → `[in-flight: worker3]` → `[review: worker3 #PR]` at state transitions.

---

## Standing lane scope

Editor validation, keyboard/a11y contracts, and lookup/select/autocomplete UX. Specifically:

- `packages/editors/`
- Editor keyboard contract: F2, printable seed, Enter, Shift+Enter, Tab, Shift+Tab, Escape, click-outside
- Validation surface (portal-level messages, pending/error/disabled/focus visual state)
- Lookup/select/autocomplete: typed values, async option behavior, color-swatch capability

You do **NOT** own: server row model, filters, aggregations, theming. Don't refactor adjacent code.

## Worker rules (recap — full rules in `docs/AGENTS.md`)

- Branch off `main`. Never commit to `main`.
- Branch name: `agent/worker3/<task-slug>`.
- Run `bun run type-check`, `bun run lint`, focused unit tests.
- Do **NOT** run Playwright, smoke-perf, perf, or broad benchmarks. Coordinator owns those.
- Open PR against `main`. Do not merge your own PR.
- Update `docs/queue.md` at state transitions.

## Recent activity baseline

- v0.3.0 shipped (88398c6).
- Recent editor work on main: lookup editor recipes (#346), lookup editor contracts (#340), range paste helper planning (#331), TSV parse diagnostics (#339).
- v0.4 chrome polish from #349 is the current visible UI baseline.

## When you finish the active task

1. Push the findings doc as a PR (single doc, no source changes).
2. Comment on the PR tagging the coordinator.
3. Wait for the next handoff update before starting new work.
