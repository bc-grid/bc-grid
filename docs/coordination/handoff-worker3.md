# Worker3 Handoff (Claude — editor + keyboard/a11y + lookup UX lane)

**Last updated:** 2026-05-02 by Claude coordinator
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

### Active now → `v06-in-cell-editor-mode` PR (a) — framework + flag + scroll-out + 4-editor migration (~8-10h)

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
