# Worker3 Handoff (Claude — editor + keyboard/a11y + lookup UX lane)

**Last updated:** 2026-05-02 by Claude coordinator
**Worktree:** `~/work/bcg-worker3`
**Branch convention:** `agent/worker3/<task-slug>`

## How to use this document

When the maintainer says **"review your handoff"**, read the **Active task** section below and proceed. This document is the source of truth for what worker3 should be doing right now. The Claude coordinator in `~/work/bc-grid` keeps it current.

---

## Active task — v0.5 work (updated 2026-05-02 — re-ping)

### What's already shipped from your lane

- ✅ **#352** worker3 audit findings doc
- ✅ **#354** date/datetime/time `useLayoutEffect` focusRef fix — went out in `v0.4.0`
- ✅ **#356** visible validation surface (popover under editor input) — went out in `v0.4.0`
- ✅ **#359** `useBcGridState` turnkey state hook + types (v0.5 task 1)
- ✅ **#361** `BcGridApi.startEdit/commitEdit/cancelEdit` + editor portal methods (v0.5 task 2)
- ✅ **#364** shadcn Combobox migration for `select.tsx` + `EditorOption.swatch`/`icon` fields + `colour-selection` hero spike (v0.5 P0-4 part 1)
- ❌ **#365** multi-select Combobox migration — **CLOSED, must be re-attempted.** The branch was based on a commit before #353 and #363 merged; rebasing was unsafe (the diff carried 500+ lines of unintended reverts, including the entire `useServerPagedGrid` hook and `rowProcessingMode` server-grid contract). Multi-select work itself is good — the Combobox `mode: "single" | "multi"` design and multiSelect.tsx migration are sound — but they need to land on a fresh branch from current `main`.
- 🟡 **#370** autocomplete Combobox migration + `internal/combobox-search.tsx` (v0.5 P0-4 leg 2 of 3) — in coordinator review

### Active now → `v05-combobox-multi-select-v2` (re-attempt on fresh main)

#370 (autocomplete) is in coordinator review and closes P0-4 leg 2 of 3. Pick up multi-select v2 now to close P0-4 leg 3.

**Branch from current `main`** (which has #364 + the merged #370 once it lands; if #370 hasn't merged yet, branch from #370's branch and the coordinator will sort merge order).

The Combobox `mode: "single" | "multi"` extension you designed in #365 is still the right shape:
- Extend `packages/editors/src/internal/combobox.tsx` with a `mode` prop
- `mode: "multi"` keeps the listbox open after each pick (consumer commits via Tab/Enter/Escape)
- `initialValue` is `readonly unknown[]` in multi-mode; `onSelect` fires with the next array
- `EditorOption.swatch` / `icon` continue to work (chip rendering of selected values uses the same fields)
- `multiSelect.tsx` migrates onto multi-mode Combobox; preserve chip rendering, removable chips, "select all" behavior

**Branch:** `agent/worker3/v05-combobox-multi-select-v2`. **Effort:** ~half day (you already designed this in #365; redoing on fresh main with the simpler design).

### After multi-select-v2 ships

- Migrate `packages/editors/src/autocomplete.tsx` to the `internal/combobox.tsx` shell. The base Combobox (#364) is your template; preserve autocomplete-specific behavior: free-text input, debounced async option loading, "no results" state, "still loading" state.
- **Wire `prepareResult` consumption** (audit P1-W3-2) — autocomplete is the natural place. The state machine carries `prepareResult` through `Preparing` → `Editing`; the hook should preload the first page of options via `editor.prepare()` and hand them to the Combobox so the dropdown paints with options on first frame instead of a blank "loading" state.
- Update `editorChrome.test.tsx` and any other affected tests to pin the new contract.
- Don't break the `EditorOption.swatch`/`icon` fields — they should keep working on autocomplete options too (a vendor lookup with avatar icons is the natural ERP pattern).

**Branch:** `agent/worker3/v05-combobox-autocomplete`. **Effort:** ~half day (multi-select #365 already proved out the chip/list pattern; autocomplete is mostly the prepareResult wiring + free-text input).

### v0.5 lane — remaining pipeline

1. ✅ **`v05-use-bc-grid-state`** — DONE (#359).
2. ✅ **`v05-api-ref-editor`** — DONE (#361).
3. ✅ **`v05-spike-colour-selection`** + select.tsx Combobox — DONE (#364).
4. ❌ **`v05-combobox-multi`** — closed (#365); re-attempted as task 5b below.
5. 🟡 **`v05-combobox-autocomplete`** — IN REVIEW (#370).
   **5b. 🟢 `v05-combobox-multi-select-v2` (ACTIVE)** — re-attempt of #365 on fresh main; closes P0-4 leg 3 (above).
6. **`v05-spike-sales-estimating` — Sales Estimating hero spike** (can ship without paste leg as "missing pattern" datapoint; or wait for worker2's paste PR)
   `apps/examples/src/sales-estimating.example.tsx`. Demonstrates: money column type with currency-aware formatting, dependent cells (`extPrice = qty * price * (1 - discount)` recomputes on commit), Excel paste fidelity for line-item entry. **Goal: <100 LOC consumer code.** Anything that pushes over → surface in the spike's PR description as a missing pattern.
   - Audit P0-9 / synthesis hero-spike track.
   - **Branch:** `agent/worker3/v05-spike-sales-estimating`. **Effort:** half day.
7. **`v05-paste-editor-binding` — Excel paste, your half (split with worker2)**
   Coordinate with worker2 on the `pasteTsv` API surface they're defining. Your job: implement `editController.commitFromPasteApplyPlan(plan)` that takes the apply-plan from `buildRangeTsvPasteApplyPlan` and routes each commit through the existing edit controller (so `valueParser` + `validate` + optimistic update + rollback all work). Atomic: if any cell fails validation, abort all writes and surface diagnostics.
   - **Wait for worker2's `pasteTsv` API contract before starting this.**
   - **Branch:** `agent/worker3/v05-paste-editor-binding`. **Effort:** half day after contract is set.

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
