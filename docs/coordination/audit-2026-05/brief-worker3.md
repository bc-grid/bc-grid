# Worker3 Audit Brief — Editors + Keyboard/A11y + Lookup UX

**Auditor:** worker3 (Claude in `~/work/bcg-worker3`)
**Date assigned:** 2026-05-02
**Read first:** `docs/coordination/audit-2026-05/README.md` (rules, severity, output template)
**Output:** `docs/coordination/audit-2026-05/worker3-findings.md`
**Branch:** `agent/worker3/audit-2026-05`

## The question to answer

Can a **windows-client user** moving into the BusinessCraft browser app feel *more* productive on inline edit, **not less**?

Specifically — would they feel at home, or would small frictions (a 50ms input lag, a missing keystroke, an invisible validation error) accumulate into "the new system is slower"? In a sales-estimating workflow with 80 line items and Tab-driven entry, every micro-friction multiplies.

## Lane scope (what to audit)

- `packages/editors/` — entire package
- Editor keyboard contract: F2, printable seed, Enter, Shift+Enter, Tab, Shift+Tab, Escape, click-outside, paste-into-edit
- Validation surface (where does the message appear, is it accessible, does it survive scroll, does it block commit)
- Lookup/select/autocomplete — typed values, async option behavior, color-swatch capability, debounce, loading state, "no results", "still loading"
- Editor commit flow — when commit fires, what happens to row data, dirty state, and downstream cells

## Specific things to look at

1. **Keyboard contract end-to-end.** Walk every editor type. F2 enters edit. Printable seed enters edit *and* writes the character. Enter commits + moves down. Tab commits + moves right. Shift+Tab commits + moves left. Escape rolls back. Click outside commits. Are all of these implemented? Tested? Consistent across editor types?
2. **Focus handoff timing.** When the editor mounts, how long until the input is focused? Is there a `useLayoutEffect` to avoid a flash? Use the dev tools mental model — is there a paint frame where the user sees a blurred input?
3. **Excel-paste fidelity.** Multi-cell TSV paste. PR #339 added TSV parse diagnostics — is the diagnostic visible to the user, or buried in console? PR #331 added planning helpers — is the plan-then-apply flow tested against realistic spreadsheet paste shapes (mixed types, trailing newlines, quoted cells with embedded tabs)?
4. **Validation surface.** When a value fails validation: Where does the message appear (inline below cell, portal popover, sidebar)? Is it `role="alert"`? Does it survive scroll? Does it block Tab progression or just visually warn?
5. **Pending / error / disabled visual state.** Is there a consistent visual contract across editors? Spinner? Disabled gray? Error red? Or is each editor styled ad-hoc?
6. **Lookup editor depth.** PR #346 added recipes, #340 added contracts. Audit: typed values (the user types "ACM", we show "Acme Corp"). Async options (debounce, race). No-results state. "Still loading" state. Color swatch — can a column render a 16×16 colored chip beside the option label? If not, what's the gap?
7. **Editor → row data dirty contract.** After commit, is the row marked dirty? Is dirty state per-cell or per-row? Does Escape on a multi-cell-edited row roll back the whole row or just the active cell?
8. **A11y.** `aria-invalid` on errored inputs. `aria-describedby` linking to the validation message. Live region announcements on commit / rollback.

## Hero use case scoring

Score the editor surface against these two specifically:

- **Sales estimating** (numeric edit, Tab progression, Excel paste, dependent cells). Imagine a user entering 80 line items: qty, price, discount %, extended price (computed). Walk that scenario in your head against the current code. Where does it break?
- **Colour selection** (visual lookup with swatches, searchable async). A user picks a finish: "Antique Walnut" (with a brown swatch). They type "ant" — does the dropdown filter? Does the swatch render? If they choose by keyboard (arrows + Enter), is it indistinguishable from mouse?

## Comparison lens (public behavior only)

- **NetSuite inline edit on transaction lines** — F2 / Tab / Enter behavior, validation surface, keyboard rhythm
- **Dynamics 365 editable grid** in model-driven apps — lookup editor with quick-create
- **Excel** — gold standard for F2/Enter/Tab/Escape semantics. If we deviate, we should have a reason.
- **Notion databases** — relation/lookup ergonomics, "create new option" inline
- **Airtable** — multi-select with chip rendering, color swatch in select options

## What to deliberately skip

- Server row model + perf (worker1)
- Filter popup / aggregations (worker2)
- Public API ergonomics (coordinator)
- Theme tokens (worker2 + coordinator)

## Output

Single file at `docs/coordination/audit-2026-05/worker3-findings.md`, following the template in `audit-2026-05/README.md`.

When the file exists with at least the executive summary + P0 + P1 sections, push the branch, open the PR, comment tagging the coordinator, then stop.
