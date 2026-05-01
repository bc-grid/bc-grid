# Worker3 Findings — bc-grid Audit 2026-05

**Author:** worker3 (Claude)
**Lane:** `packages/editors/`, editor keyboard contract, validation surface, lookup/select/autocomplete UX, editor → row dirty contract
**Date:** 2026-05-02

## Executive summary

The editor lifecycle and state machine (`editingStateMachine.ts`, `useEditingController.ts`) are genuinely solid — async-validate cancellation, mutation-id supersedure, and overlay pruning are all done right. **What is missing is the visible surface a Windows-client estimator depends on**: validation messages are screen-reader-only, Excel paste is unwired despite the parse helpers existing, and the lookup editors are native `<select>` / `<datalist>` shells with no swatch, no inline loading, and no shadcn Combobox UI — directly contradicting `editing-rfc §editor-autocomplete`. Three of the seven built-ins also have a focus-handoff bug that breaks click-outside commit on date/datetime/time. **Today's editor surface is not a credible foundation for the Sales-Estimating or Colour-Selection hero use cases**; the gap is mostly visible-surface plumbing on top of correct internals.

## P0 findings

### Validation message has no visible surface

- **Where:** `packages/editors/src/text.tsx:115-119`, `number.tsx:120-124`, `select.tsx:122-126`, `autocomplete.tsx:219-223`, `multiSelect.tsx:118-122`, `checkbox.tsx:87-91`; cell side: `packages/react/src/bodyCells.tsx:248-252`; theming: `packages/theming/src/styles.css:1029-1034, 1121-1130`.
- **What:** the editor and the cell each render the validation `error` string into a `visuallyHidden` `<span>` referenced via `aria-describedby`. Sighted users get only a 3px red inset stripe on the cell's left edge plus a red border on the input. There is no inline message, no popover, no toast, no tooltip carrying the text. The string is literally invisible to anyone not on a screen reader.
- **Why it matters for the BusinessCraft ERP:** Sales-estimating with 80 line items: the user types `qty=0` on a "qty must be > 0" column, sees a red border, has no way to learn *why* it was rejected. They Tab anyway, hit a second invalid value, now two red stripes are stacked. After ten lines this is unreadable. NetSuite, Dynamics, Excel all surface the message in-cell or as a popover.
- **Recommendation:** render the active editor's error inside the editor portal as a shadcn Popover/Tooltip anchored to the cell (the portal already exists and `data-bc-grid-editor-portal` is recognised by click-outside). Pair with an inline below-cell message at minimum. The state machine already carries `error` through `editing` and `validating` modes — only the visual layer is missing.

### Excel paste is parsed but never wired

- **Where:** `packages/react/src/rangeClipboard.ts:419` (`buildRangeTsvPastePlan`), `:489` (`buildRangeTsvPasteApplyPlan`); `packages/react/src/grid.tsx:134-138` imports only the copy helpers; `grep onPaste packages/react/src/` returns no results.
- **What:** the TSV parser, paste-plan builder, and full apply-plan helper exist with diagnostics, overflow handling, valueParser+validate integration, and unit-test coverage in `packages/react/tests/rangeClipboard.test.ts`. Nothing in the React package binds them to a `paste` event. There is no `onPaste` listener on the grid root, no command-Cmd+V intercept, no consumer-facing prop. A user who copies a column from Excel and Cmd+Vs into bc-grid gets the browser's default behaviour (nothing happens; the active cell is a `<div>`).
- **Why it matters for the BusinessCraft ERP:** Sales-estimating's hero gesture is "paste 80 quantities from Excel into the qty column." Today bc-grid cannot do it. The diagnostics and apply plan are the hard part and they're done; the missing piece is a 30-line wiring layer.
- **Recommendation:** wire `paste` on the grid root (or a hidden input that owns the active cell's focus context) → `buildRangeTsvPasteApplyPlan({ range: activeRange, tsv, columns, rowEntries, rowIds, signal })` → for each commit, route through `editController.commit`. Surface skipped/overflow cells via the existing announce hook + a transient status-bar message. Coordinator: confirm whether this is v0.5 scope per handoff doc — if so, no action; if it slipped, this is a P0.

### Lookup editors cannot show color swatches and rely on native `<select>` / `<datalist>` instead of shadcn Combobox

- **Where:** `packages/editors/src/select.tsx:113-120` (native `<option>{label}`), `multiSelect.tsx:109-117` (same), `autocomplete.tsx:206-215` (`<datalist>` + `<option>` only); RFC: `docs/design/editing-rfc.md:592-598` ("Component: shadcn `Combobox` primitive").
- **What:** all three lookup editors render plain DOM `<option>` children. `<option>` cannot contain HTML — no swatch chip, no icon, no two-line metadata. `<datalist>` is also famously inconsistent across browsers (Safari announces the value not the label; Firefox shows the label only when distinct from value; mobile renders as a plain keyboard suggestion strip). The editing-rfc explicitly designated `editor-autocomplete` as a shadcn `Combobox` and `editor-select` / `editor-multi-select` as shadcn select primitives with portal markers; that work was scoped but not landed.
- **Why it matters for the BusinessCraft ERP:** "Colour selections" is one of the four hero use cases — Antique Walnut next to a brown chip, the user types "ant", filters to brown chips, picks by keyboard. Today the only path is `column.cellEditor` with a fully custom Combobox. The framework doesn't ship the foundation. Same applies to status pills, employee avatars, brand-color tags — anywhere "lookup with visual" is the right answer.
- **Recommendation:** replace the three editors' UI shells with shadcn Popover-anchored Combobox/Listbox primitives. Extend `EditorOption` (`packages/editors/src/chrome.ts:30-34`) with optional `icon?: ReactNode` and `swatch?: string` (CSS color) fields. The data plumbing (typed values via `bcGridSelectOptionValuesKey` in `editorPortal.tsx:419-423`) already supports this — it's a pure-render swap.

### Date / datetime / time editors break click-outside commit

- **Where:** `packages/editors/src/date.tsx:40-44`, `datetime.tsx:45-49`, `time.tsx:33-37` use `useEffect` for the `focusRef` assignment. Compare `text.tsx:60-69`, `number.tsx:71-80`, `select.tsx:56-65` which use `useLayoutEffect` and explicitly cite the bug fixed in PR #155 (referenced in `number.tsx:67-70`).
- **What:** the framework's `EditorMount` runs its mount effect (`editorPortal.tsx:172-186`) that calls `focusRef.current?.focus()` and then dispatches `mounted`. That `useLayoutEffect` runs *after* the editor's own `useLayoutEffect` callbacks and *before* anyone's `useEffect`. The text/number/select editors assign `focusRef.current` in `useLayoutEffect`, so it lands first; the date/datetime/time editors assign in `useEffect`, so when the framework's commit-phase effect runs, `focusRef.current === null`. The editor's own `useLayoutEffect` separately calls `inputRef.current?.focus()`, so the input does receive DOM focus — but `focusRef.current` stays null. Two downstream consequences: (1) `editorPortal.tsx:228` reads `readEditorInputValue(focusRef.current)` on click-outside — that returns `undefined`, and the cell commits `undefined`. (2) `editorPortal.tsx:248` reads it on Tab/Enter intercept — same `undefined` commit. Cleanup also doesn't null the ref.
- **Why it matters for the BusinessCraft ERP:** Production-estimating involves scheduled-PO dates and datetimes. The user picks a date in the popover, clicks a different cell — the date picker disappears and the cell commits `undefined`. The user thinks the date saved; on next refresh it's empty. This is a silent data-loss path on the most common pointer gesture.
- **Recommendation:** swap `useEffect` → `useLayoutEffect` in all three editors and add the `return () => null` cleanup pattern that `text.tsx:64-68` uses. Add a regression test that drives focus-out on a `dateEditor`-bound cell and asserts `commit` was called with the YYYY-MM-DD string, not `undefined`.

## P1 findings

### Backspace and Delete don't activate edit mode and don't clear the cell

- **Where:** `packages/react/src/editorKeyboard.ts:21-50` recognises only F2, Enter, and printable single-character keys (`isPrintableEditSeed`).
- **What:** in nav mode, pressing Backspace or Delete is a no-op. Excel and every comparable spreadsheet (Google Sheets, NetSuite line edit, Airtable, Notion) treat Backspace and Delete as "clear cell" — Backspace also enters edit mode with empty content; Delete clears without entering edit.
- **Why it matters for the BusinessCraft ERP:** estimator clears the discount column — Delete does nothing. They have to F2-then-select-all-then-Backspace-then-Tab. Four keystrokes for one Excel keystroke. Multiplied by 80 lines this is the kind of friction that becomes "the new system is slower."
- **Recommendation:** extend `EditorActivationIntent` with `{ type: "clear" }` for Backspace and Delete; route through `editController.commit` with the column's empty value (`null` for typed columns; empty string for text/number which then go through valueParser). For Backspace, also activate edit mode (Excel: Backspace clears AND enters edit; Delete clears AND stays in nav).

### `prepareResult` is forwarded but no built-in editor consumes it

- **Where:** state machine carries it (`editingStateMachine.ts:69, 183`); portal forwards it (`editorPortal.tsx:293`); none of `select.tsx`, `autocomplete.tsx`, `multiSelect.tsx` reads `prepareResult` from props.
- **What:** the editing-rfc has a `Preparing` state for editors that need async work before mounting (e.g., autocomplete preloading the first page of options). The mechanism is fully wired through the state machine but no editor uses it. `autocompleteEditor` re-issues its `fetchOptions(initialQuery)` on every mount (`autocomplete.tsx:160-171`).
- **Why it matters for the BusinessCraft ERP:** ERP lookups against employees / customers / SKUs run 1k-50k rows; a 200ms blank-popover-during-fetch on every cell entry is exactly the friction that adds up. Preloading via `editor.prepare()` gives a first-paint dropdown.
- **Recommendation:** wire `prepareResult` through the lookup editors when shadcn Combobox lands. Add a recipe in `apps/docs/` showing a customer-lookup editor that returns a small initial cache from `prepare`, updates async on input.

### Multi-cell row edits have no rollback

- **Where:** `packages/react/src/useEditingController.ts:199-207` (`cancel`), state machine has no row-edit-transaction concept.
- **What:** Tab progression edits cells one by one, each writing an entry to `overlayRef`. Pressing Escape during the 5th edit only cancels that 5th — the prior 4 stay dirty in the overlay. There is no `discardRowEdits(rowId)` API and no UI affordance for it.
- **Why it matters for the BusinessCraft ERP:** estimator changes their mind on a line item after editing four columns — they want to revert the row. Excel's row-revert pattern (Esc-Esc) doesn't exist here, and `BcEditGrid`'s action column has no "discard row edits" button.
- **Recommendation:** add `editController.discardRowEdits(rowId)` that walks the overlay and edit-entries, drops non-pending entries, leaves pending entries alone (server commit may still succeed). Surface in `BcEditGrid` action column when `rowState.isDirty` is true.

### Validation announcement is assertive but visual signal stays passive

- **Where:** `packages/react/src/grid.tsx:1170-1174` (assertive announce); `packages/theming/src/styles.css:1029-1034` (red stripe, no transient).
- **What:** AT users hear the validation error immediately (assertive live region). Sighted users see a static red border that matches the cell's "dirty + error" state. After multiple invalid commits the red borders all look the same and there's no flag indicating *which* failure was the most recent.
- **Why it matters for the BusinessCraft ERP:** during a Tab-driven entry rhythm, the user often Tabs past the failed cell. They need to look back: "which cell was just rejected?" The visual answer is "any of these four red ones."
- **Recommendation:** pair the assertive announce with a transient pulse on the cell (shadcn `data-state="error-flash"` for ~600ms after a fresh validation failure) and a status-bar slot rendering the *latest* error string with the cell coordinate ("Row 12 — Discount: must be ≤ 100").

### Number editor's seed accepts only a tactical character class

- **Where:** `packages/editors/src/number.tsx:54` (`SEED_ACCEPT = /^[\d.,\-]$/`).
- **What:** `+` is rejected (uncommon but valid in some accounting contexts); `e`/`E` for scientific is rejected (unlikely in estimating but matters for engineering). More importantly, no default locale-aware `valueParser` ships with the editor — a `de-DE` user typing `1,5` seeds `"1,5"` into the input, then `valueParser` (consumer-supplied) has to know to swap `,`→`.` before `Number()`. Without that, `1,5` parses to `NaN` and the cell rejects via `Number.isNaN` validators.
- **Why it matters for the BusinessCraft ERP:** BusinessCraft has European customers. The default behaviour should be "the number the user typed in their locale parses correctly."
- **Recommendation:** ship a `numberEditor.parseLocaleNumber(value, locale)` helper in `@bc-grid/editors` and document its use as the recommended `column.valueParser`. Cite `Intl.NumberFormat`'s decimal separator for the active locale.

### Custom editors that aren't INPUT/SELECT/TEXTAREA commit `undefined` on click-outside

- **Where:** `packages/react/src/editorPortal.tsx:386-417` (`readEditorInputValue` dispatches on tagName).
- **What:** the click-outside path in `editorPortal.tsx:228` reads `readEditorInputValue(focusRef.current)`. The function only handles `INPUT` (text/checkbox), `TEXTAREA`, and `SELECT`. A custom editor that exposes a `<button role="combobox">` or any other tagName — exactly what the editing-rfc envisages for `column.cellEditor` — returns `undefined` on click-outside. The user picks a value, clicks away, and the cell commits `undefined`.
- **Why it matters for the BusinessCraft ERP:** the entire premise of `column.cellEditor` is that ERP teams build custom lookups (CRM customer pickers, SKU finders with filters). Today every one of them must work around the click-outside bug.
- **Recommendation:** add an optional `getValue?: (focusEl: HTMLElement | null) => unknown` to `BcCellEditor`; if present, click-outside and Tab/Enter use it; if absent, fall back to the tag-dispatch helper. Document the contract in the custom-editor recipe.

### No `aria-required` / `aria-readonly` / `aria-disabled` on editor inputs

- **Where:** every built-in editor (`text.tsx`, `number.tsx`, etc.) only sets `aria-invalid`, `aria-label`, `aria-describedby`.
- **What:** column-level `required` / `readOnly` / a row-disabled flag don't propagate to the editor input as ARIA. Sighted users see disabled styling for `pending`, but AT announces "edit text" with no required-ness or readonly-ness context.
- **Why it matters for the BusinessCraft ERP:** ERP forms are full of required-field markers; if AT loses that, the screen is harder to fill.
- **Recommendation:** thread `required` / `readOnly` props through `BcCellEditorProps`, default editors honor them as `aria-required` / `aria-readonly` and apply matching visual treatment.

### Built-in editor visual contract is split across the cell, the input, and the editor portal

- **Where:** error styling is on the cell (`bodyCells.tsx:248`), the input (`text.tsx:113`), and the portal (`editorPortal.tsx:279`); `pending` only on the input + portal; `dirty` only on the cell.
- **What:** there is no single source of truth for "this cell is currently in error / pending / dirty / focused-edit." Three different selectors render the same logical state. A theme override that wants to change the error stripe touches three rules.
- **Why it matters for the BusinessCraft ERP:** when the consumer themes bc-grid for the BusinessCraft brand, they hit three places to change the error visual. The audit-2026-05 chrome lane already calls out theming consistency; this is the editor-side instance.
- **Recommendation:** consolidate the editor visual contract into a single CSS-variable-driven token system. Document the four states (idle / dirty / pending / error) and the one selector each.

## P2 findings

### `aria-controls` on autocomplete points at the datalist id

- **Where:** `packages/editors/src/autocomplete.tsx:195`.
- **What:** `<datalist>` is bound via `list=`, not `aria-controls`. The current `aria-controls={datalistId}` doesn't break anything but is the wrong attribute for the relationship; AT may double-announce.
- **Recommendation:** drop `aria-controls`; keep `list=`. Becomes moot when shadcn Combobox replaces the shell.

### Editor portal `z-index: 5` can sit below shadcn-portaled tooltips and menus

- **Where:** `packages/react/src/editorPortal.tsx:313`.
- **What:** if a column has a tooltip / popover whose portal renders at `z-index: 50` (shadcn default), the editor wrapper sits below.
- **Recommendation:** introduce a CSS variable `--bc-grid-editor-z` and bump default to `~40`; document layering against chrome elements.

### No keyboard convention for "open the dropdown" on select / autocomplete

- **What:** native `<select>` opens on Alt+Down on most platforms. `<datalist>` has no convention. Once shadcn primitives replace these, Alt+Down should be the explicit "open popover" gesture for keyboard-only workflows; today there's nothing to bind to.
- **Recommendation:** specify Alt+Down → open popover; ArrowDown when popover open → next option; Enter → commit. Land alongside the shadcn migration in P0 #3.

### `findOptionIndexBySeed` is case-folded but starts-with only

- **Where:** `packages/editors/src/chrome.ts:95-106`.
- **What:** seeded select picks first match where label or value starts-with the seed. Excel/Sheets do prefix match too, but ERP users sometimes expect substring or word-start. Probably correct as-is for v0.4; flag for review when shadcn Combobox lands and the option-filter UX is up for revision anyway.

### Editor accessible name falls back to `column.field` which may be a tech identifier

- **Where:** `packages/editors/src/chrome.ts:19-28`, called from every editor's `accessibleName`.
- **What:** when `column.header` is not a plain string (e.g., it's a render function returning JSX), AT announces the field name like `"customer_id"` instead of "Customer".
- **Recommendation:** require an `aria-label` or `headerText` field at the column level when `header` is a render function; warn at dev-time if missing.

## What's already strong

- **`editingStateMachine.ts` is a textbook pure reducer.** Eight states, every transition tested in isolation, async-cancel semantics handled by the controller around the machine. The `mutationId` superseded-settle guard (`useEditingController.ts:296, 340-356`) is exactly right — it correctly drops a stale rollback when the user has typed a newer value. Don't touch this.
- **`pruneOverlayPatches` is idempotent and minimal.** Walks the overlay, drops only entries that match canonical row state, preserves pending+error. The right shape, the right ordering.
- **AbortController-based async-validate cancellation (`useEditingController.ts:243-275`) is correct.** Race-safe across superseded commits.
- **Live-region announce wiring** (`grid.tsx:1159-1175`) splits politely on commit and assertively on validation/server errors — this is the right contract; only the visible signal is missing.
- **The TSV parser** (`packages/react/src/rangeClipboard.ts:259-417`) is solid: explicit diagnostic codes, ragged-row detection, quoted-cell handling, max-cell limit. Once paste is wired (P0 #2) the foundation is ready.
- **focusRef contract for text / number / select / multi-select / autocomplete / checkbox** is correct (`useLayoutEffect` with cleanup) and the `text.tsx:55-69` comment documents *why*. Cargo-cult-proof.

## Open questions for the coordinator

1. The editing-rfc explicitly specifies shadcn Combobox / Select primitives for `editor-autocomplete`, `editor-select`, `editor-multi-select` (rfc lines 568-598). The shipped code uses native HTML controls. Is this a deliberate v0.1 tactical choice (native controls = no animation, no portal, lowest blast radius) or did the shadcn migration silently slip? The handoff doc lists "lookup/select/autocomplete typed values and async option behavior are documented and tested" as a worker3 v0.4 outcome — this audit reads that scope as "the shells need to land, not just contracts."
2. Worker3's lane mentions "color-swatch capability" but `EditorOption` (chrome.ts:30-34) carries only `value` and `label`. Should the swatch capability live as a `EditorOption.icon` / `.swatch` field, or as a column-level `optionRenderer(option) => ReactNode` hook? My read is option-level fields for the hero case (color list with hex chip) plus a render hook for the escape hatch.
3. The handoff puts paste / range work in v0.5. The TSV parser + plan helper both exist on `main` already. Is the wiring step (`onPaste` listener → `buildRangeTsvPasteApplyPlan` → `editController.commit`) part of v0.5 or is it sitting between scopes? If v0.5: ignore P0 #2 above. If it slipped: it should be re-flagged.
4. Should P0 #4 (date/datetime/time `useLayoutEffect` fix) be merged as a hotfix on the v0.4 train? It's a one-line fix per editor and a silent-data-loss bug; the test surface is small.
