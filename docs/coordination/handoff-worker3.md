# Worker3 Handoff (Claude — editor + keyboard/a11y + lookup UX lane)

**Last updated:** 2026-05-02 by Claude coordinator
**Worktree:** `~/work/bcg-worker3`
**Branch convention:** `agent/worker3/<task-slug>`

## How to use this document

When the maintainer says **"review your handoff"**, read the **Active task** section below and proceed. This document is the source of truth for what worker3 should be doing right now. The Claude coordinator in `~/work/bc-grid` keeps it current.

---

## Active task — Continue Task 2, then v0.5 (updated 2026-05-02)

PR #354 (date/datetime/time `useLayoutEffect` fix — your audit P0 #4) is being merged by coordinator this turn. **Continue with Task 2 (visible validation surface)** as already in flight, then pivot to v0.5 work below.

### Currently in flight — Task 2: Visible validation surface

Your audit **P0 #1** / synthesis P0-2. Sighted users currently see only a 3px red stripe and a red border; the validation message is screen-reader-only. Sales-estimating with 80 line items: the user types `qty=0`, sees a red border, has no way to learn *why* it was rejected.

- Render the active editor's error inside the editor portal as a shadcn Popover/Tooltip anchored to the cell. The portal already exists and `data-bc-grid-editor-portal` is recognised by click-outside.
- Pair with an inline below-cell message at minimum.
- The state machine already carries `error` through `editing` and `validating` modes — only the visual layer is missing.
- **Branch:** `agent/worker3/v04-validation-surface`
- **Estimated:** 2-4 hours including tests.

When the PR is open, comment to tag the coordinator. **Then start v0.5 work below in parallel** while coordinator reviews — you don't need to wait.

### v0.5 work — pick up after Task 2 PR is open

Synthesis at `docs/coordination/audit-2026-05/synthesis.md` ratified your v0.5 lane. Order:

1. **`v05-use-bc-grid-state` — `useBcGridState({ persistTo, columns, server? })`**
   Turnkey state hook owning the ~30 controlled-state pairs (sort, filter, search, selection, expansion, grouping, pagination, columnVisibility, columnOrder, columnWidths). Persists to `localStorage` keyed by `gridId` if `persistTo: 'local:gridId'`.
   ```ts
   const { props, state, dispatch } = useBcGridState({
     persistTo: 'local:customers',
     columns,
     server: false,  // true reserves space for useServerPagedGrid integration
   });
   return <BcGrid {...props} columns={columns} rows={rows} />;
   ```
   - Existing controlled-prop API stays for advanced consumers.
   - Audit P0-5 / synthesis sprint plan.
   - **Branch:** `agent/worker3/v05-use-bc-grid-state`. **Effort:** 1 day.

2. **`v05-api-ref-editor` — `BcGridApi` editor methods**
   Add `focusCell(rowId, colId)`, `startEdit(rowId, colId, { seedKey? })`, `commitEdit()`, `cancelEdit()`, `getActiveCell()` to the public `BcGridApi`. Coordinate with worker1 on `scrollToCell` boundary (worker1 owns server-side scroll; you own focus + edit lifecycle on visible cells).
   - Audit P0-7 / synthesis sprint plan.
   - **Branch:** `agent/worker3/v05-api-ref-editor`. **Effort:** half day.

3. **`v05-spike-sales-estimating` — Sales Estimating hero spike**
   `apps/examples/src/sales-estimating.example.tsx`. Demonstrates: money column type with currency-aware formatting, dependent cells (`extPrice = qty * price * (1 - discount)` recomputes on commit), Excel paste fidelity for line-item entry. **Goal: <100 LOC consumer code.** Anything that pushes over → surface in the spike's PR description as a missing pattern.
   - Audit P0-9 / synthesis hero-spike track.
   - Uses `useBcGridState` (task 1) + worker2's paste integration (task 5).
   - **Branch:** `agent/worker3/v05-spike-sales-estimating`. **Effort:** half day.

4. **`v05-spike-colour-selection` — Colour Selection hero spike**
   `apps/examples/src/colour-selection.example.tsx`. Demonstrates: shadcn-Combobox-anchored lookup with 16×16 colored swatch chips beside option labels, recently-used section, "create new colour" inline. **Goal: <100 LOC consumer code.**
   - **Includes the shadcn Combobox migration for the lookup editors** (audit P0-4 / synthesis P0-4) — replace native `<select>` / `<datalist>` shells in `packages/editors/src/{select,multiSelect,autocomplete}.tsx` with shadcn Popover-anchored Combobox/Listbox. Extend `EditorOption` with `swatch?: string` (CSS color) and `icon?: ReactNode` per the synthesis answer to your open-question #2.
   - **Branch:** `agent/worker3/v05-spike-colour-selection`. **Effort:** 1-1.5 days (Combobox migration is the bulk).

5. **`v05-paste-editor-binding` — Excel paste, your half (split with worker2)**
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
