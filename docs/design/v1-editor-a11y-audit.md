# v1.0 editor a11y audit

**Status:** code-pass complete; **date / datetime / time gap resolved** by `v07-editor-a11y-fix-date-aria-describedby`. Workers run unit-test + source review only — no NVDA/JAWS/VoiceOver scripts; those land in a `wcag-deep-pass` follow-up.
**Date:** 2026-05-04
**Owner:** worker3 (Claude — editor + keyboard/a11y + lookup UX lane)
**Source contract:** `docs/design/accessibility-rfc.md`, `docs/design/editing-rfc.md` §a11y for edit mode
**Handoff item:** `v07-editor-a11y-audit` (v1.0 prerequisite per `docs/coordination/handoff-worker3.md`).

This document walks every built-in editor against the WAI-ARIA Authoring Practices for grid editors. The four pillars per the handoff:

1. **Focus contract** — focus lands on the input on mount; focus returns to the cell on commit / cancel; no focus traps when navigating between editors via Tab.
2. **ARIA states** — `aria-required`, `aria-readonly`, `aria-disabled`, `aria-invalid`, `aria-describedby` (for validation messages) all stamped correctly per state.
3. **Screen-reader announcements** — committing announces the new value (polite); validation rejection announces the error (assertive); server-error rejection announces the error (assertive). Routed via `messages.editCommittedAnnounce` / `editValidationErrorAnnounce` / `editServerErrorAnnounce` through the grid's polite + assertive live regions.
4. **Keyboard contract per editor type** — Enter commits, Esc cancels, Tab/Shift+Tab navigate, F2 starts edit. Per-editor variation (autocomplete uses Enter to pick AND commit, multi-select uses Space to toggle, etc.).

The framework owns the lifecycle plumbing (focus handoff via `focusRef`, commit/cancel keyboard intent decoder at `editorKeyboard.ts`, live-region announcer at `grid.tsx:1867`). Each editor wires the ARIA + per-input keyboard semantics. The audit's job is to find the gap between the framework contract and each editor's wiring.

---

## Verdict matrix

| Editor | Focus contract | ARIA states | AT announcement | Keyboard contract | Verdict |
| --- | --- | --- | --- | --- | --- |
| **text** | ✅ | ✅ | ✅ | ✅ | **PASS** |
| **number** | ✅ | ✅ | ✅ | ✅ | **PASS** |
| **date** | ✅ | ✅ (fixed) | ✅ (fixed) | ✅ | **PASS** (fixed by `v07-editor-a11y-fix-date-aria-describedby`) |
| **datetime** | ✅ | ✅ (fixed) | ✅ (fixed) | ✅ | **PASS** (fixed by `v07-editor-a11y-fix-date-aria-describedby`) |
| **time** | ✅ | ✅ (fixed) | ✅ (fixed) | ✅ | **PASS** (fixed by `v07-editor-a11y-fix-date-aria-describedby`) |
| **select** | ✅ | ✅ | ✅ | ✅ | **PASS** |
| **multi-select** | ✅ | ✅ | ✅ | ✅ (Space toggle, Enter commit) | **PASS** |
| **autocomplete** | ✅ | ✅ (also `aria-busy` during fetch) | ✅ | ✅ (Enter picks + commits) | **PASS** |
| **checkbox** | ✅ | ✅ | ✅ | ✅ (Space toggle native) | **PASS** |

**All 9 PASS** after the date / datetime / time fix landed. The original gap (the same two ARIA wires skipped uniformly across the three) was mechanical; resolved by a single follow-up PR.

---

## Framework wiring (shared across editors)

The framework provides four plumbing points the editors lean on:

### Focus handoff

`focusRef` is handed to each editor via `BcCellEditorProps`. Each editor assigns its inner DOM input/button to `focusRef.current` inside a `useLayoutEffect` so the assignment lands BEFORE the framework's parent `useLayoutEffect` calls `focusRef.current?.focus()` (children fire first in React's commit phase). The pattern is identical across every built-in editor — see `text.tsx:141-150`, `number.tsx:226-235`, `date.tsx:130-139`, `datetime.tsx:130-139`, `time.tsx:107-116`, `checkbox.tsx:49-58`, `internal/combobox.tsx` (button-ref handoff), `internal/combobox-search.tsx` (input-ref handoff).

If a refactor moves the assignment into `useEffect`, the framework's mount-focus call sees `focusRef.current === null` and the input never receives DOM focus on real interaction. `focusRefContract.test.ts` pins the contract via source-shape regression guards.

### Keyboard intent decoder

`packages/react/src/editorKeyboard.ts` is the single source of truth for activation + commit/cancel keys:

| Key | Mode | Intent |
| --- | --- | --- |
| `F2` | nav → edit | activation: `f2` (select-all on mount per editing-rfc) |
| `Enter` | nav → edit | activation: `enter` (select-all on mount) |
| `Enter` (in editor) | edit | commit, moveOnSettle: `down` (or `up` with Shift) |
| `Tab` (in editor) | edit | commit, moveOnSettle: `right` (or `left` with Shift) |
| `Escape` (in editor) | edit | cancel |
| `Backspace` / `Delete` (no modifiers) | nav | clear (Backspace also enters edit; Delete stays in nav per audit P1-W3-1) |
| Printable single char (no modifiers) | nav → edit | activation: `printable`, `seedKey` set |

Activation routing happens at `grid.tsx`; in-editor commit / cancel routing happens at `editorPortal.tsx:462`. Editors don't intercept these themselves — they delegate to the portal's keydown handler. Per-editor keys (Arrow-up/down inside select, Space toggle in multi-select) are handled at the editor level and don't conflict because the portal's intent decoder treats them as `ignore`.

### ARIA state propagation

Each editor receives `error`, `pending`, `required`, `readOnly`, `disabled` via `BcCellEditorProps` and stamps them as ARIA attributes on its input. The mapping is:

| Prop | Maps to | Notes |
| --- | --- | --- |
| `error: string \| undefined` | `aria-invalid={true}` + `aria-describedby={errorId}` | `errorId` is a `useId()` per editor instance pointing to a visually-hidden `<span>` with the error text. Pairs with the cell-level error span for AT redundancy. |
| `pending: boolean` | `aria-disabled={true}` (additive) + `disabled` (DOM) | Pending = in-flight async validation or commit. The DOM `disabled` blocks keystrokes; aria-disabled signals the state to AT in case the consumer's `inputComponent` doesn't honor `disabled`. |
| `required: boolean` | `aria-required={true}` | Audit P1-W3-7 (`#385`). |
| `readOnly: boolean` | `aria-readonly={true}` | Audit P1-W3-7. |
| `disabled: boolean` | `aria-disabled={true}` (additive to pending) | Audit P1-W3-7. Column-level disabled marker. |

### Live-region announcer

`grid.tsx:1867` wires the controller's `announce` callback into the grid's polite + assertive live regions:

- `committed` → `announcePolite(messages.editCommittedAnnounce({ columnLabel, rowLabel, formattedValue }))` — the new value reads after commit.
- `validationError` → `announceAssertive(messages.editValidationErrorAnnounce({ columnLabel, error }))` — interrupts AT speech on rejection.
- `serverError` → `announceAssertive(messages.editServerErrorAnnounce({ columnLabel, error }))` — same priority as validation rejection.

The polite region replays committed value; the assertive region pops in for errors. Sighted-user toast (via `validationToast` state) duplicates the assertive announce so non-AT users see the rejection too.

---

## Per-editor analysis

### `textEditor` — PASS

- **Focus:** `text.tsx:141-150` hands `inputRef` to `focusRef` in `useLayoutEffect`. `text.tsx:155-166` does select-all on mount (F2/Enter activation) or caret-at-end (printable seed). Returns to cell on commit/cancel via the editor portal's cleanup (framework-owned).
- **ARIA:** all five states (`aria-invalid` / `aria-label` / `aria-describedby` / `aria-required` / `aria-readonly` / `aria-disabled`) stamped at `text.tsx:196-201`. `aria-label` falls back to `column.field ?? column.columnId` if `column.header` isn't a string. `aria-describedby` points to a `useId()`-backed visually-hidden error span at `text.tsx:209-213`.
- **AT announcement:** committed value reads via the polite live region; validation errors via the assertive region (framework-owned).
- **Keyboard:** Enter commits / Tab navigates / Esc cancels (framework-owned via portal's intent decoder). Within the editor, the input is uncontrolled so all printable input flows directly to `<input>`.

### `numberEditor` — PASS

- **Focus:** `number.tsx:226-235` mirrors text. Select-all / caret-at-end at `number.tsx:238-247`.
- **ARIA:** all five states stamped at `number.tsx:295-301`. `aria-label` falls back same as text. `aria-describedby` → `useId()` error span at `number.tsx:310-313`.
- **AT announcement:** same framework wiring as text. The seed predicate `acceptNumericSeed` silently drops non-numeric activation seeds — no AT announcement for the drop, but that's the right tradeoff (a stray letter would otherwise pre-seed garbage AT would announce).
- **Keyboard:** Enter / Tab / Esc framework-owned. `inputMode="decimal"` triggers numeric keyboard on touch devices. Paste-into-cell detection (`onPaste`) normalises currency / parens-negative without breaking AT semantics — the input value updates in place; the next AT focus pass reads the new value.

### `dateEditor` / `datetimeEditor` / `timeEditor` — PASS (fixed by `v07-editor-a11y-fix-date-aria-describedby`)

**Original gap (kept for posterity):** All three editors stamped 4 of 5 ARIA states but skipped `aria-label` and `aria-describedby`:

```tsx
// date.tsx:187-204 — current
const inputProps: DateEditorInputProps = {
  ref: inputRef,
  className: editorInputClassName,
  type: "date",
  defaultValue: seeded,
  disabled: pending,
  "aria-invalid": error ? true : undefined,
  "aria-required": required ? true : undefined,
  "aria-readonly": readOnly ? true : undefined,
  "aria-disabled": disabled || pending ? true : undefined,
  // MISSING: "aria-label", "aria-describedby"
  ...
}
```

```tsx
// text.tsx:190-205 — for comparison
const inputProps: TextEditorInputProps = {
  ...
  "aria-invalid": error ? true : undefined,
  "aria-label": accessibleName || undefined,
  "aria-describedby": error ? errorId : undefined,
  "aria-required": required ? true : undefined,
  ...
}
```

**Consequences:**

1. **No accessible name:** AT announces "edit date" without the column name. A user who tabs into the date editor for the "Due Date" column hears just "edit text" (browser fallback) instead of "Due Date, edit date". Especially confusing in dense ERP grids with multiple date columns per row (created / modified / due / scheduled).
2. **Validation error not linked to the input:** when `column.validate` returns `{ valid: false, error: "..." }`, the assertive live region announces the error (framework-owned), but the input itself doesn't expose `aria-describedby` pointing to the error text. AT users navigating back to the input after the announcement re-reads only the input's name + state, not the error context. The cell-level error span the framework renders helps, but the input-level `aria-describedby` is the WAI-ARIA contract for "this input has an error".
3. **No visually-hidden error span:** date/datetime/time don't render the `<span id={errorId} style={visuallyHiddenStyle}>{error}</span>` that text/number/checkbox render. So even if `aria-describedby` were stamped, there'd be no target text to read.

**Why the gap exists:** these editors were written before `useId()` + `editorAccessibleName(column, ...)` became the standard pattern (`#385` audit P1-W3-7). The audit at the time stamped `aria-required` / `aria-readonly` / `aria-disabled` uniformly across all editors but didn't backfill the older `aria-label` / `aria-describedby` wiring.

**Fix scope:** mechanical — copy the pattern from `text.tsx` / `number.tsx`. ~5 lines per editor (declare `errorId = useId()`; compute `accessibleName = editorAccessibleName(column, "Date value" / "Datetime value" / "Time value")`; add the two missing aria attrs to `inputProps`; render the error span). Three editors × ~5 lines = ~15 LOC + one new test file pinning the wiring.

**Resolved by:** `v07-editor-a11y-fix-date-aria-describedby`. Source-shape regression guards live at `packages/editors/tests/dateAriaDescribedby.test.ts` (21 tests across the three editors pinning errorId / accessibleName / aria-label / aria-describedby / visually-hidden error span / fragment-wrapped return shape).

### `selectEditor` — PASS

- **Focus:** `internal/combobox.tsx` hands the trigger `<button>` to `focusRef`. The dropdown listbox uses `aria-activedescendant` to track the active option without moving DOM focus — the trigger button stays focused throughout, matching the WAI-ARIA Authoring Practices listbox-with-trigger pattern.
- **ARIA:** trigger has `role="combobox"` (implicit via `aria-haspopup="listbox"` + `aria-expanded`), plus `aria-controls={listboxId}` when open, `aria-activedescendant` for the current option, `aria-multiselectable` (true for multi mode, undefined for single). Listbox has `role="listbox"`. Each option has `role="option"`, `aria-selected`, swatch / icon are `aria-hidden` so they don't pollute the announcement. `aria-required` / `aria-readonly` / `aria-disabled` / `aria-invalid` / `aria-label` / `aria-describedby` all stamped on the trigger.
- **AT announcement:** committed value via polite region. Selecting an option announces the option label (the active descendant changes, AT reads). Multi-select chip changes do NOT announce on every toggle — that would be noisy; the polite-region commit announce at the end captures the final array.
- **Keyboard:** ArrowUp/Down navigates options, Home/End jumps, Enter / Space picks (single mode auto-commits via portal; multi mode toggles without committing per `#427` Enter semantics RFC). Esc closes the dropdown without committing (framework cancel).

### `multiSelectEditor` — PASS

Same as `selectEditor` — both use the shared `Combobox` primitive. The mode flag (`mode="multi"`) flips:

- Auto-commit-on-pick → toggle-on-pick.
- Single-pick `aria-multiselectable={undefined}` → `aria-multiselectable="true"`.
- Single label render → chip-strip render with one `<span>` per selected option.
- Enter semantics: in multi mode, Enter does NOT toggle the active option (that would surprise users). Space toggles instead. Pinned by `#427` regression guards.

### `autocompleteEditor` — PASS

- **Focus:** `internal/combobox-search.tsx` hands the search `<input>` to `focusRef`. Same pattern as text, but with an `aria-busy={loading || pending}` add for async state.
- **ARIA:** `role="combobox"` on the input, `aria-haspopup="listbox"`, `aria-expanded`, `aria-controls`, `aria-activedescendant`, `aria-busy` while options are loading. `aria-describedby` points to BOTH the error span AND a status region (`statusId`) for the "Loading…" / "No matches" / "N options available" announcements.
- **AT announcement:** same polite commit + assertive error pattern. The status region ("3 options available", "Loading…", "No matches for 'foo'") fires as the user types — uses `aria-live="polite"` semantics built into the live region helpers.
- **Keyboard:** typing fetches (debounced 200ms with AbortController race handling). ArrowUp/Down navigates loaded options. Enter picks the active option AND commits in one gesture (the input's value becomes the option label, then the portal's Enter intent fires commit). Esc cancels.

### `checkboxEditor` — PASS

- **Focus:** `checkbox.tsx:49-58` hands the inner `<input type="checkbox">` to `focusRef`. The shell `<span>` doesn't take focus — only the input does.
- **ARIA:** all five states stamped on the inner input; the shell additionally carries `aria-disabled` / `aria-invalid` so click-outside detection (via `data-bc-grid-editor-input` on the shell) reads the right state. `aria-label` / `aria-describedby` (errorId) wired correctly.
- **AT announcement:** Space toggles via native checkbox semantics — AT announces the new state ("checked" / "not checked") immediately. Commit fires when the user navigates away (Tab / click-outside / portal cleanup) — the polite live region reads the committed value.
- **Keyboard:** Space toggles (native). Enter commits via the portal's intent decoder (the editor's onKeyDown bubbles up). Esc cancels. Tab navigates. The native checkbox keyboard contract is a strict superset of what the framework needs.

---

## Cross-editor consistency check

### Live-region message keys

All editors route through the same three message keys (`editCommittedAnnounce`, `editValidationErrorAnnounce`, `editServerErrorAnnounce`). Localization is centralized in `BcGridMessages` so consumers can override per-language without touching editor source. The columnLabel resolver picks `column.header` if it's a string, falls back to `column.columnId ?? "this cell"` — same fallback pattern as `editorAccessibleName` so the announce label matches the input's `aria-label` exactly.

### Focus return after commit / cancel

Framework-owned. The editor portal's `useLayoutEffect` cleanup at `editorPortal.tsx:286-410` calls `focusActiveCell()` after commit / cancel so DOM focus returns to the cell. No editor needs to wire this itself. Tested via `editorPortal.focusReturn.test.ts` (source-shape regression guards) + Playwright spec at `apps/examples/tests/editor-focus-return.pw.ts` (coordinator-run).

### No focus traps

Editors don't trap Tab. The portal's keydown handler intercepts Tab (`getEditorEditModeKeyboardIntent`) and routes through commit + move-to-next-cell. This means consumer's `inputComponent` doesn't need to handle Tab itself — even a buggy custom `<Input>` that calls `event.preventDefault()` on Tab would still trip the portal's parent listener.

The combobox internal closes the dropdown on Tab and falls through to portal's commit handler. The autocomplete equivalent does the same. Multi-select Tab commits the current array selection; per `#431` the next-editable-cell helper skips read-only / disabled cells.

### Backspace / Delete clear semantics

Per `#378` audit P1-W3-1: Backspace clears + enters edit mode (so user can immediately type a replacement); Delete clears and stays in nav mode (the "I want it empty, period" gesture). Modifier keys (Cmd+Backspace / Ctrl+Delete) disqualify — those are OS-level "delete word/line" gestures that shouldn't clear cells.

The clear path runs `column.validate` so a cleared value can be rejected; rejection routes through the same assertive live region as edit validation errors. No editor wires anything for this — the grid handles it before the editor even mounts.

---

## Gaps + follow-ups

### `v07-editor-a11y-fix-date-aria-describedby` ✅ SHIPPED

Backfilled `aria-label` + `aria-describedby` (with visually-hidden error span) on `dateEditor`, `datetimeEditor`, `timeEditor`. Mirror of the pattern from `text.tsx` / `number.tsx` / `checkbox.tsx`. Original spec preserved below for reference.

**Implementation per editor (3 editors, ~10 min each + 30 min for tests):**

1. Add `import { useId, useLayoutEffect, useRef } from "react"` (datetime / time only — date already has useLayoutEffect).
2. Add `import { editorAccessibleName, visuallyHiddenStyle } from "./chrome"` (already imported in some).
3. Inside the body component:
   ```tsx
   const errorId = useId()
   const accessibleName = editorAccessibleName(column, "Date value")  // or "Datetime value" / "Time value"
   ```
4. Add to `inputProps`:
   ```tsx
   "aria-label": accessibleName || undefined,
   "aria-describedby": error ? errorId : undefined,
   ```
5. Wrap the return in `<>` and render the visually-hidden error span:
   ```tsx
   {error ? <span id={errorId} style={visuallyHiddenStyle}>{error}</span> : null}
   ```
6. Add a unit test under `packages/editors/tests/dateAriaDescribedby.test.ts` (or per-editor) pinning the source-shape: `aria-label` resolves from `editorAccessibleName`; `aria-describedby` points to the error span when error is truthy; the span is rendered with `visuallyHiddenStyle`.

**Branch:** `agent/worker3/v07-editor-a11y-fix-date-aria-describedby`. **Effort:** ~half day. **v1.0 prerequisite** — closes the audit gap.

### Deferred to `wcag-deep-pass`

Items that need browser / AT manual verification (Playwright + NVDA / JAWS / VoiceOver scripts) — workers can't run these locally per the 3-worker sprint rule:

1. **AT actual announcement order on commit:** the polite live region debounces; in fast Tab-driven entry the next cell's mount may interrupt the prior commit's announcement. Need to verify across NVDA + JAWS + VoiceOver that the announcement queue stays coherent.
2. **Date picker AT semantics across browsers:** `<input type="date">` opens an OS-chrome calendar that's unreachable to React's listener tree. AT behaviour inside the picker varies (Safari announces dates via VoiceOver; Chrome's Linux build doesn't). The `dateEditor` defers to native; consumers needing a uniform AT contract across browsers should compose a custom editor.
3. **Combobox listbox virtualization for large option lists:** `v07-editor-perf-large-option-lists` (queued separately) bench-tests 5k+ options. The a11y angle is whether `aria-activedescendant` keeps working when only ~20 of 5000 options are rendered — listbox-with-virtualization needs `aria-setsize` + `aria-posinset` per rendered option. Defer to that perf task.
4. **Forced-colors mode editor chrome:** `accessibility-rfc §Visual` mandates Windows High Contrast support. The editor chrome (input border, error glow, focus ring) needs verification under `forced-colors: active`.

### Out of scope

- **`tri-state checkbox`** — `checkbox.tsx:31-33` JSDoc says "Tri-state is intentionally not enabled in this slice; it needs explicit cycle semantics and `indeterminate` DOM-state handling before becoming a stable public option." A11y audit unchanged from the binary case until tri-state lands.
- **`<select multiple>` native fallback** — v0.5 PR #372 replaced the native `<select multiple>` with the Combobox primitive. The audit covers the new path; consumers preferring native (mobile picker affordance, very long option lists with browser virtualization) should file an issue per the multiSelect JSDoc.

---

## Verdict summary

- **All 9 editors pass cleanly** at the code-pass level: text, number, date, datetime, time, select, multi-select, autocomplete, checkbox.
- The original date / datetime / time gap (`aria-label` + `aria-describedby` + visually-hidden error span) was resolved by the same-PR follow-up.
- **Framework wiring (focus handoff, keyboard intent decoder, live-region announcer) is consistent and correctly stitched** across every editor.
- **Deeper AT verification (NVDA / JAWS / VoiceOver actual announcements + forced-colors)** deferred to `wcag-deep-pass` per the 3-worker sprint rule.

Every built-in editor meets the WAI-ARIA Authoring Practices grid editor contract for v1.0 at the code-pass level. `wcag-deep-pass` (browser + AT manual verification) is the remaining v1.0 prerequisite on this lane.
