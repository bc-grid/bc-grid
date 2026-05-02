# Worker3 Handoff (Claude — editor + keyboard/a11y + lookup UX lane)

**Last updated:** 2026-05-02 by Claude coordinator
**Worktree:** `~/work/bcg-worker3`
**Branch convention:** `agent/worker3/<task-slug>`

## How to use this document

When the maintainer says **"review your handoff"**, read the **Active task** section below and proceed. This document is the source of truth for what worker3 should be doing right now. The Claude coordinator in `~/work/bc-grid` keeps it current.

## Hard rule — workers do NOT run Playwright / e2e / smoke-perf / perf / broad benchmarks

This is binding (`docs/AGENTS.md §6`). Workers run focused unit tests + `bun run type-check` + `bun run lint` + the affected package's build. **Never** run `bun run test:e2e`, `bun run test:smoke-perf`, `bun run test:perf`, `bunx playwright`, or broad benchmark commands. The coordinator runs those during review/merge. If your change adds or modifies a `.pw.ts` file, note in the PR that it was not run locally — the coordinator will run it.

You implement code; the coordinator reviews and runs the slow gates.

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

### Active now → cheap P1 cleanups (paste-editor binding blocked on worker2's contract)

P0-4 and P0-9 hero spikes both fully closed. Paste-editor binding (your half of audit P0-1) waits for worker2 to define their `pasteTsv` API surface. While they work that, pick up the cheap P1 cleanups in your lane — these are real audit findings that ship as standalone improvements, no inter-worker contract needed.

**Pick the next one in this order; each is its own branch + PR:**

1. **`v05-backspace-delete-clear`** (audit P1-W3-1) — extend `EditorActivationIntent` with `{ type: "clear" }`. Excel-style semantics: Backspace clears + enters edit; Delete clears + stays in nav. The `editorKeyboard.ts` keymap is the entry point; you'll need to thread the new intent through the edit controller. **Effort: ~2 hours including tests.** Branch: `agent/worker3/v05-backspace-delete-clear`.

2. **`v05-discard-row-edits`** (audit P1-W3-3) — `editController.discardRowEdits(rowId)` for multi-cell row rollback. Surface as a button in `BcEditGrid`'s actions column when `rowState.isDirty`. **Effort: ~3 hours including tests + the action-column wiring.** Branch: `agent/worker3/v05-discard-row-edits`.

3. **`v05-custom-editor-getvalue-hook`** (audit P1-W3-6) — `BcCellEditor.getValue?: (focusEl) => unknown` hook. Today, custom editors that aren't `<input>` / `<select>` / `<textarea>` commit `undefined` on click-outside because `editorPortal.tsx`'s tag-dispatch helper doesn't know how to read them. The new optional override gets called first when present. **Effort: ~2 hours including a custom-editor recipe in docs.** Branch: `agent/worker3/v05-custom-editor-getvalue-hook`.

4. **`v05-editor-aria-states`** (audit P1-W3-7) — thread `required` / `readOnly` / `disabled` props through `BcCellEditorProps`; default editors set `aria-required` / `aria-readonly` / `aria-disabled` on inputs. **Effort: ~2 hours including tests.** Branch: `agent/worker3/v05-editor-aria-states`.

### When worker2's `pasteTsv` API surface lands → `v05-paste-editor-binding`

After worker2 ships the listener + API contract (their PR #v05-paste-listener), pick up your half of audit P0-1. The contract worker2 defines in `docs/api.md` will tell you the exact shape; expected:
- `editController.commitFromPasteApplyPlan(plan)` takes the apply-plan from `buildRangeTsvPasteApplyPlan`.
- Routes each commit through the existing edit controller so `valueParser` + `validate` + optimistic update + rollback all fire.
- Atomic: if any cell in the plan fails parse/validate, abort all writes and surface diagnostics.

**Branch (when you reach it):** `agent/worker3/v05-paste-editor-binding`. **Effort:** half day after contract is set.

This closes the LAST v0.5 P0 (P0-1).

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
9. **`v05-paste-editor-binding`** — your half of audit P0-1; waits on worker2's `pasteTsv` API contract.

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
