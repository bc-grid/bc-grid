# Worker3 v0.5 → v0.6 Editor + Validation Follow-ups

**Author:** worker3 (Claude in `~/work/bcg-worker3`)
**Date:** 2026-05-03
**Lane:** editor + keyboard/a11y + lookup UX (`packages/editors/`, the editor portal in `@bc-grid/react`, validation surface)
**Branch:** `agent/worker3/v05-editor-followups-planning-doc`
**Source audit:** `docs/coordination/audit-2026-05/worker3-findings.md` (#352)

This is a **read-only planning pass**, not implementation. Each item names the v0.6 task, where it manifests in code today, what's wrong, the suggested fix shape, and the affected packages. Items are ordered so the coordinator can copy them straight into the v0.6 backlog.

The v0.5 editor lane shipped what was on the audit's critical path: validation surface (#356), date/datetime/time `useLayoutEffect` race fix (#354) — both released in v0.4.0; `useBcGridState` (#359), `BcGridApi.startEdit/commitEdit/cancelEdit` (#361), shadcn Combobox migration for all three lookup editors (#364, #370, #372), the four hero spikes (#364, #367, #374, #375), and the four cheap P1 cleanups (#378 P1-W3-1, #381 P1-W3-3, #382 P1-W3-6, #385 P1-W3-7). Audit P0-1 (paste integration) was subsumed by worker2's #380. What follows are the editor-shaped items the audit flagged that a now-shipped v0.5 surface still doesn't address, plus two new items surfaced during the v0.5 implementation work.

## Status of #352 audit findings after v0.5

| #352 finding | Status after v0.5 | v0.6 task entry |
|---|---|---|
| **P0-1** validation message has no visible surface | Closed in v0.4.0 (#356). Visible popover anchored below the editor input. | — |
| **P0-2** Excel paste isn't wired | Closed in v0.5 (#380, worker2). Listener + `pasteTsv` + bulk-edit overlay binding. | — |
| **P0-3** date/datetime/time silently commit `undefined` on click-outside | Closed in v0.4.0 (#354). `useLayoutEffect` focusRef fix + cross-editor contract test. | — |
| **P0-4** lookup editors use native HTML, blocking Colour Selection | Closed in v0.5 (#364 select, #370 autocomplete, #372 multi-select). Combobox + SearchCombobox primitives, no Radix dep. | — |
| **P1-W3-1** Backspace/Delete don't clear cell | Closed in v0.5 (#378). `EditorActivationIntent.clear` + `editController.clearCell`. | — |
| **P1-W3-2** `prepareResult` mechanism wired but no editor uses it | Partial. Autocomplete consumes it (#370 — `initialOptions` on `SearchCombobox`); select + multi-select still don't. | **§3 below — `v06-prepareresult-preload-select-multi`** |
| **P1-W3-3** multi-cell row edits have no rollback | Closed in v0.5 (#381). `editController.discardRowEdits(rowId)` + BcEditGrid Discard action when `rowState.dirty`. | — |
| **P1-W3-4** validation visual passive — no transient flash, no status-bar slot for latest error | Still open. `bodyCells.tsx` paints `data-bc-grid-cell-state="error"` as a static stripe; no flash class, no status-bar segment. | **§1 below — `v06-validation-flash-and-status-segment`** |
| **P1-W3-5** number editor seed too tactical; no locale-aware parser ships | Still open. `packages/editors/src/number.tsx:54` is `SEED_ACCEPT = /^[\d.,\-]$/`; no `parseLocaleNumber` helper. | **§2 below — `v06-locale-aware-number-parser`** |
| **P1-W3-6** custom editors not INPUT/SELECT/TEXTAREA commit `undefined` on click-outside | Closed in v0.5 (#382). `BcCellEditor.getValue?(focusEl)` hook + recipe doc. | — |
| **P1-W3-7** no `aria-required` / `aria-readonly` / `aria-disabled` on editor inputs | Closed in v0.5 (#385). Threaded through `BcCellEditorProps`; all 9 built-ins stamp the attributes. | — |
| **P1-W3-8** editor visual contract split across cell, input, portal | Still open. Three CSS selectors render the same logical state. | **§4 below — `v06-editor-visual-contract-consolidation`** |

Two items new in v0.5 implementation work, not in #352:

| Surfaced during | v0.6 task entry |
|---|---|
| Multi-mode Combobox `Enter` toggles before commit, undoing the user's last pick (#372 e2e at `apps/examples/tests/editor-multi-select.pw.ts:111-114` works around it with `Tab`) | **§5 below — `v06-multi-combobox-enter-semantics`** |
| `clearCell` validation rejection has no visible feedback for sighted users (no editor portal mounted → no popover) (#378) | **§6 below — `v06-clear-rejection-visible-surface`** |

## v0.6 task proposals

### §1 — `v06-validation-flash-and-status-segment`

- **Where:** `packages/react/src/bodyCells.tsx:127-141` (rowState assembly + `cellEditState` resolution); `packages/theming/src/styles.css:1037-1048` (the `data-bc-grid-cell-state="error"` rule paints a static stripe — no animated flash); `packages/react/src/grid.tsx:1340-1360` (assertive announce wiring); `packages/react/src/types.ts:194` (`BcStatusBarSegment` built-ins are `total | filtered | selected | aggregations` — no `latestError` segment).
- **What's wrong:** Validation rejection paints a static `data-bc-grid-cell-state="error"` stripe on the cell. After multiple invalid commits — the typical sales-estimating Tab-driven entry rhythm with 80 line items — the red stripes stack visually identical. The user can't tell which cell was *just* rejected. The assertive live region announces the rejection to AT users (`grid.tsx:1356`); sighted users get no transient signal beyond the stripe colour.
- **Fix shape:**
  - Add a `data-state="error-flash"` (or `data-bc-grid-error-flash="true"`) attribute that bodyCells applies for ~600ms after a fresh validation rejection on that cell, then auto-clears via `setTimeout`. Theming pairs it with a CSS keyframe (saturate + pulse the stripe). The state attribute is the React-side trigger; the CSS animation is the visible surface.
  - Add a `latestError` built-in `BcStatusBarSegment` that renders the most recent validation error string with the cell coordinate ("Row 12 — Discount: must be ≤ 100"). Auto-clears after the next successful commit on the same cell or after a configurable timeout (default 8s).
  - The editing controller already exposes `announce({ kind: "validationError", column, error })` (`useEditingController.ts:71-90`). Mirror it into a `latestValidationError` ref + state so the status segment can read it and the cell can flash. No state machine change.
- **Affected:** `@bc-grid/react` — `useEditingController.ts` (latest-error tracking), `bodyCells.tsx` (flash attribute), `statusBar.tsx` + `types.ts` (`latestError` segment), `grid.tsx` (announce wiring already exists). `@bc-grid/theming` — flash CSS keyframe + `latestError` segment styling.
- **Risk note:** flash class auto-clearing must not fight a re-edit on the same cell — if the user fixes the value and commits cleanly, the flash should clear immediately (not wait for the timeout). Tie the clear to "next render where `editError` is undefined for this cell" rather than a hard `setTimeout`.

### §2 — `v06-locale-aware-number-parser`

- **Where:** `packages/editors/src/number.tsx:54` (`SEED_ACCEPT = /^[\d.,\-]$/` — accepts digits + `.,-` only); the file has no exported `parseLocaleNumber` / `parseMoney` helper. Sales-estimating spike (`apps/examples/src/sales-estimating.example.tsx:99-117`) hand-rolled `parseMoney` + `parsePercent` with `replace(/[^0-9.\-]/g, "")` and called out the gap as Finding #4. Audit `worker3-findings.md` P1-W3-5 explicitly flagged it.
- **What's wrong:** A `de-DE` user types `1,5` (meaning 1.5) into the number editor; the seed is accepted, but the column's consumer-supplied `valueParser` calls `Number("1,5")` → `NaN`. The `numberEditor` ships no locale-aware parser and no documented helper, so every multi-currency / international ERP grid reinvents the same regex strip. Worse: `+`, `e`/`E` (scientific), and parentheses for negatives are silently dropped.
- **Fix shape:**
  - Ship `numberEditor.parseLocaleNumber(value, locale)` as an exported helper in `@bc-grid/editors`. Implementation reads the locale's group + decimal separators via `Intl.NumberFormat(locale).formatToParts(12345.6)` once (cached per locale), then strips groups + normalises the decimal to `.` before `Number.parseFloat`.
  - Ship a separate `numberEditor.parseMoney(value, { locale, currency? })` that additionally strips currency symbols (via `Intl.NumberFormat(locale, { style: "currency", currency }).formatToParts(0)` for the symbol) and parenthesised-negative ("(1,234.56)" → `-1234.56`). Money is the dominant ERP shape so it gets a first-class helper rather than a recipe.
  - Document both as the recommended `column.valueParser` for international grids.
- **Affected:** `@bc-grid/editors` — `number.tsx` (new exports), `tests/number.test.ts` (locale + money round-trip cases). Apps: `apps/examples/src/sales-estimating.example.tsx` (drop the hand-rolled `parseMoney`/`parsePercent` once shipped — counts as the spike's headline LOC reduction). Docs: `apps/docs` — recipe page.
- **Risk note:** Latin-1 number locales (en, de, fr, es) cleanly invert via `Intl`. Right-to-left + Indic-digit locales (ar-SA, fa-IR) need additional digit-mapping. v0.6 should land Latin-1 first; non-Latin digits as a v0.7 follow-up if a consumer asks.

### §3 — `v06-prepareresult-preload-select-multi`

- **Where:** `packages/editors/src/internal/combobox-search.tsx:144-173` (autocomplete already consumes `initialOptions` from `prepareResult` — see `combobox-search.tsx:29-33` doc block + first-paint fetch skip at `:244-251`). `packages/editors/src/select.tsx` and `multiSelect.tsx` don't read `prepareResult` at all; they always synchronously resolve options from `column.options` at mount. The Combobox primitive (`packages/editors/src/internal/combobox.tsx`) doesn't accept `initialOptions`.
- **What's wrong:** ERP lookups against employees / customers / SKUs (1k-50k rows) frequently can't ship the full option list eagerly — the consumer wants to fetch via an async source. Autocomplete already supports this via `prepareResult`; select + multi-select don't. A consumer who wants "select editor with async-loaded options" today has to either (a) re-implement the editor with a custom `cellEditor`, or (b) use autocomplete with all the free-text passthrough complexity they don't need.
- **Fix shape:**
  - Add `initialOptions?: readonly EditorOption[]` to the Combobox primitive's `ComboboxBaseProps` (matching the `SearchCombobox` shape). When set, the primitive uses these instead of (or in addition to) the `options` prop on first render.
  - Wire `prepare?: (params) => Promise<{ initialOptions: EditorOption[] }>` on `selectEditor` and `multiSelectEditor` — same shape as the autocomplete prepare hook would have were it exposed (audit P1-W3-2 noted that `BcCellEditorPrepareParams` doesn't carry `column`, blocking the autocomplete prepare wiring; this fix needs the same prepare-params contract change first).
  - **Dependency:** `BcCellEditorPrepareParams` (`packages/react/src/types.ts:712-716`) needs `column` added so the prepare hook can read `column.options` (or `column.fetchOptions`). Today it has `{ row, rowId, columnId }` only. Additive type change. `useEditingController.ts:185` is the call site that needs to pass `column` through.
- **Affected:** `@bc-grid/react` — `types.ts` (`BcCellEditorPrepareParams.column`), `useEditingController.ts:185` (start-fn pass-through), `editorPortal.tsx` (forward `prepareResult` already happens). `@bc-grid/editors` — `internal/combobox.tsx` (initialOptions), `select.tsx` + `multiSelect.tsx` (prepare hooks).
- **Risk note:** `prepare` rejection currently sends the state machine back to Navigation. For a vendor-lookup grid that uses prepare to preload, a network failure would block edit entirely. Consider letting prepare resolve `undefined` (no preload, fall through to synchronous `column.options`) as a graceful degradation so the editor still mounts even when the preload fails. Open question — flag in the v0.6 task.

### §4 — `v06-editor-visual-contract-consolidation`

- **Where:** Three selectors render overlapping logical states:
  - `packages/theming/src/styles.css:1029-1034` — `.bc-grid-cell[aria-invalid="true"]` and `.bc-grid-cell[data-bc-grid-cell-state="error"]` paint the cell-level red stripe.
  - `packages/theming/src/styles.css:1126-1136` — `.bc-grid-editor-input[aria-invalid="true"]` and `.bc-grid-editor-input[data-bc-grid-editor-state="error"]` paint the editor input border.
  - `packages/theming/src/styles.css:1057` — `.bc-grid-editor-portal[data-bc-grid-editor-state="pending"]` paints the portal-level pending cursor.
  - `packages/react/src/bodyCells.tsx:155-161` resolves `cellEditState: "error" | "pending" | "dirty" | undefined` and stamps it as `data-bc-grid-cell-state`. The editor input + portal each compute their own `editorControlState` (`packages/editors/src/chrome.ts:7-17`).
- **What's wrong:** Every chrome change to the error / pending / dirty / focused-edit visuals touches three CSS rules in two locations and two TypeScript helpers in two packages. A consumer themeing for the BusinessCraft brand must override the same stripe colour in three places to keep them in sync. The error-state contract drifted between `aria-invalid` (the legitimate ARIA hook) and `data-bc-grid-cell-state="error"` (a bc-grid-private hook), and the CSS treats them as equivalent — but consumer overrides hitting only `aria-invalid` will miss the bc-grid-private path and vice versa.
- **Fix shape:**
  - Consolidate the four logical editor states (`idle`, `dirty`, `pending`, `error`) into a single CSS-variable-driven token system in `@bc-grid/theming`. Each state gets one selector (`[data-bc-grid-edit-state="..."]`) and one `--bc-grid-edit-state-color` token; the cell, input, and portal all read the same token. Drop the parallel `aria-invalid` styling — keep `aria-invalid` as the AT contract only.
  - Document the four states + the one selector + the four CSS variables (`--bc-grid-edit-state-error-stroke`, `--bc-grid-edit-state-pending-fg`, etc.) in `apps/docs` so consumers theme once.
  - Pin a coordination point: `bodyCells.tsx::cellEditState` is the single TypeScript resolver. The editor portal + editor inputs read from the same enum, never compute their own.
- **Affected:** `@bc-grid/theming` — full rewrite of the editor-state CSS section (~50 lines); `@bc-grid/react` — `bodyCells.tsx` cellEditState resolver becomes the only producer; editorPortal.tsx consumes it; `@bc-grid/editors/src/chrome.ts` `editorControlState` either inlines into the editor or is fed from the cell. Apps: `apps/docs` theming page.
- **Risk note:** This is a coordinated CSS + JSX change with consumer-visible class-name implications. v0.6 has a higher tolerance for this (still pre-v1 API freeze), but consumer overrides on `data-bc-grid-cell-state="error"` would break. Document the migration in a `BREAKING:` note + offer a back-compat alias attribute for one minor release.

### §5 — `v06-multi-combobox-enter-semantics`

- **Where:** `packages/editors/src/internal/combobox.tsx:273-282` (Enter handler in keyboard intercept). The current implementation calls `updateSelection(activeIndex)` on Enter regardless of mode. In multi mode, `updateSelection` toggles the selection (`combobox.tsx:222-241`) — so pressing Enter to commit the user's chip set actually toggles off the most-recently-active option *before* the editor portal wrapper sees the same Enter and runs commit. Workaround in the e2e: `apps/examples/tests/editor-multi-select.pw.ts:111-114` uses `Tab` to commit and notes the sharp edge in a comment.
- **What's wrong:** A multi-select user picks 3 chips with mouse / Space, then presses Enter to commit — the active option (most recently navigated, often the last chip the user picked) gets toggled off, and the commit fires with 2 chips instead of 3. Silent data loss for the headline gesture in chip-input UX.
- **Fix shape:** Split the Enter handler by mode:
  - Single mode: keep current behaviour (Enter picks the active option, then Enter bubbles to commit).
  - Multi mode: Enter does NOT toggle. It only bubbles up so the editor portal wrapper commits the current chip set. Space stays as the toggle gesture.
  - Add an e2e assertion in `editor-multi-select.pw.ts` that the commit value after Enter contains all the picked chips (not all-minus-the-active-one). Drop the Tab workaround comment.
- **Affected:** `@bc-grid/editors` — `internal/combobox.tsx:273-282` (a 5-line conditional). `apps/examples` — `tests/editor-multi-select.pw.ts` test cleanup. No type changes.
- **Risk note:** None — pure bug fix. The current behaviour is the surprising one; consumers shouldn't be relying on it.

### §6 — `v06-clear-rejection-visible-surface`

- **Where:** `packages/react/src/useEditingController.ts:404-503` (`clearCell` runs `column.valueParser("")` + `validate`, fires the assertive announce on rejection at `:466-471`, then returns silently — no editor portal mounts so the visible popover from #356 doesn't fire).
- **What's wrong:** A user presses Delete on a required cell (e.g. `qty`). The `valueParser` resolves empty → `null`; `column.validate(null)` returns `{ valid: false, error: "Required" }`; the assertive live region announces "Discount is required" to AT users. Sighted users see *nothing* — no popover (no editor mounted), no cell flash, no toast. The cell stays at its prior value but the user has no signal that their Delete was rejected. They might press Delete again and assume the keyboard isn't working.
- **Fix shape:** Pairs with §1's status-bar `latestError` segment + cell flash. Specifically:
  - The same `latestValidationError` ref / state §1 introduces should accept the rejection event from `clearCell` (it's already firing through the same `announce` hook with `kind: "validationError"`).
  - The cell flash from §1 fires on the cell that was the clear target — `clearCell` knows the `rowId` + `columnId` so it can call a helper like `flashCellError(rowId, columnId)` after announcing.
  - Optional: surface a transient toast (1.5s) at the bottom of the grid with the error string. Toast UI lives in `@bc-grid/theming` + `@bc-grid/react` and would become a new `BcGridProps.toastSlot?` prop.
- **Affected:** Same as §1 — they ship as one PR rather than separately. `useEditingController.ts:466-471` (`clearCell` validation rejection branch) just calls the §1 `flashCellError` + `latestValidationError` helpers; no new code paths.
- **Risk note:** Don't double-fire when the rejection cell is also the active editing cell (the existing visible popover would fire too). Suppress the flash + status-segment when `editState.mode === "editing"` and the rejection is on the same cell as `editState.cell`.

## Capacity-aware ordering

If v0.6 has bandwidth for two of these, do **§5** (multi-combobox Enter) and **§2** (locale-aware number parser) — both are bug-fix-shaped, low risk, and high consumer leverage. §5 closes a silent-data-loss path; §2 unblocks the international-ERP path that the synthesis flagged for v0.6 but no spike has hit yet.

If bandwidth for four, add **§1 + §6** (validation flash + status segment + clear-rejection feedback) — they ship as one coordinated PR, close two audit findings, and complete the validation-feedback story that started with #356. §1 is the bigger investment (CSS + new status segment + the latest-error tracking) but §6 is a free add once §1 lands.

§3 (prepareResult preload) and §4 (visual contract consolidation) are higher-effort and have dependency / breaking-change risk respectively. Land them after the lower-risk items if the v0.6 train still has room. §3 specifically depends on a `BcCellEditorPrepareParams.column` extension that's a small API change but should be ratified by the architect first.

## Open questions for the coordinator

1. **§4 visual contract consolidation** — is v0.6 the right time for a coordinated CSS + class-name change, or hold for v0.7+? My read is v0.6 (still pre-v1 freeze), with a one-release back-compat attribute alias.
2. **§3 prepare-on-failure semantics** — should a prepare rejection block the editor from mounting (current state-machine behaviour) or degrade gracefully to "mount with no preload"? Latter feels right for vendor-lookup ERPs on flaky networks; would need a state-machine tweak.
3. **§1 latest-error segment** — should the segment auto-clear on next successful commit (regardless of cell), on a timeout, or on next user gesture? My read is "next successful commit on any cell, or 8s timeout, whichever first."
4. **§6 toast slot** — is a toast UI in scope for v0.6 at all, or is it a v0.7+ chrome addition? §6 ships fine without a toast (the cell flash + status segment are enough); the toast is the "extra nice" surface.
