# Worker3 Handoff (Claude — editor + keyboard/a11y + lookup UX lane)

**Last updated:** 2026-05-02 by Claude coordinator
**Worktree:** `~/work/bcg-worker3`
**Branch convention:** `agent/worker3/<task-slug>`

## How to use this document

When the maintainer says **"review your handoff"**, read the **Active task** section below and proceed. This document is the source of truth for what worker3 should be doing right now. The Claude coordinator in `~/work/bc-grid` keeps it current.

---

## Active task — v0.4 hotfix train (updated 2026-05-02)

Your audit findings PR (**#352**) merged. Two of your own P0 findings should land on the v0.4 train as priority work — **in this order**:

### Task 1 (URGENT, small PR) — Date / Datetime / Time editor focusRef fix

Your audit **P0 #4**. Silent data-loss path: clicking outside a date/datetime/time editor commits `undefined` because `focusRef.current` is `null` when the framework reads it. Sales-estimating and production-estimating users edit dates routinely; this is a regression hidden behind a passing-looking edit.

- **Fix per editor:** `packages/editors/src/{date,datetime,time}.tsx` — swap `useEffect` → `useLayoutEffect` for the `focusRef` assignment; add the `return () => null` cleanup pattern that `text.tsx:60-69` uses (and explicitly cites the bug fixed in PR #155).
- **Regression test:** drive focus-out on a `dateEditor`-bound cell, assert `commit` was called with the YYYY-MM-DD string (not `undefined`). Same shape for `datetime` and `time`.
- **Branch:** `agent/worker3/v04-date-editor-focus-fix`
- **Estimated:** ~1 hour with tests.

Open the PR; comment to tag the coordinator. Coordinator runs Playwright before merge.

### Task 2 (after Task 1 PR is open) — Visible validation surface

Your audit **P0 #1**. Today the validation message is screen-reader-only — sighted users only see a 3px red stripe and a red border. Sales-estimating with 80 line items: the user types `qty=0`, sees a red border, has no way to learn *why* it was rejected. After 10 lines, this is unreadable.

- Render the active editor's error inside the editor portal as a shadcn Popover/Tooltip anchored to the cell. The portal already exists and `data-bc-grid-editor-portal` is recognised by click-outside.
- Pair with an inline below-cell message at minimum (so the error is visible even when the popover is dismissed).
- The state machine already carries `error` through `editing` and `validating` modes (`editingStateMachine.ts`) — only the visual layer is missing.
- **Branch:** `agent/worker3/v04-validation-surface`
- **Estimated:** 2-4 hours including tests.

### Coordinator answers to your audit open-questions

1. **Lookup editors using native HTML — deliberate or slipped?** Treating it as slipped from the editing-rfc. The shadcn Combobox migration with swatch support is **v0.5 hero-spike work** (Colour Selection hero), not v0.4.
2. **Color swatch as `EditorOption.swatch` field or column-level `optionRenderer` hook?** Your read is right — option-level fields for the hero case (`swatch?: string`, `icon?: ReactNode`) plus a render hook for the escape hatch. v0.5 scope.
3. **Excel paste wiring — v0.5 scope or sitting between?** v0.5 scope. Worker2 will own the paste listener + `pasteTsv` API; you'll own the route-through-editorController binding. Synthesis doc will ratify.
4. **Should P0 #4 be a v0.4 hotfix?** **Yes** — that's Task 1 above.

### After v0.4 ships

This handoff will be updated with your v0.5 work (`useBcGridState` hook + `apiRef` editor methods + sales-estimating spike + colour-selection spike per `docs/coordination/v0.5-audit-refactor-plan.md`).

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
