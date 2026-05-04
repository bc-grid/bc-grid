# v0.7 Block C — PR-C2 design questions

**Status:** prep work / coordinator routing input. PR-C1 (#520) is in flight; PR-C2 needs design decisions before worker3 can safely ship the migration.
**Date:** 2026-05-04 PM
**Owner:** worker3 (Claude — editor + keyboard/a11y + lookup UX lane)
**Surfaces:** `selectEditor`, `multiSelectEditor`, `autocompleteEditor` migration to the shadcn Combobox foundation from PR-C1.

While starting PR-C2 (`v07-radix-combobox-editors`) I hit three architectural questions that are above the worker rule's "implementation only — coordinator owns design" line. Documenting them so the coordinator can route the answer (either spec it for me, take PR-C2 themselves, or chunk PR-C2 into smaller steps).

---

## Question 1: Focus model — button vs CommandInput

**Background.** The legacy `internal/combobox.tsx` puts focus on the trigger `<button>` (assigned via `focusRef`). User presses Up/Down/Enter while focus is on the button; the combobox's own `onKeyDown` handler navigates. The framework's commit reads `__bcGridComboboxValue` from the button via `readEditorInputValue(focusRef.current)` (case `BUTTON` at `editorPortal.tsx:802`).

**The shadcn pattern (per bsncraft `lookup-list.tsx`).** A `<CommandInput>` lives inside the `Popover.Content`. On open, focus auto-moves to the `CommandInput`. cmdk's keyboard handler is on the `Command` root; it listens to events that bubble from the `CommandInput`. Type-ahead filters; Up/Down navigate via `aria-activedescendant`; Enter dispatches an item-select event.

**The conflict.**

- If `focusRef` → button: mount-focus + commit reads work, but cmdk's keyboard handler doesn't see events (focus is on the button, not on Command). Need a custom keyboard forwarding mechanism, OR write our own keydown on the button (defeats cmdk's purpose).
- If `focusRef` → CommandInput: cmdk's keyboard works natively, but `readEditorInputValue` would return `input.value` (the search string) instead of the typed combobox selection. Need a `getValue?` escape hatch (audit P1-W3-6) on each editor that climbs from the input back up to the button to read `__bcGridComboboxValue`.

**Decision needed.** Pick one of:

- **A**: `focusRef` → button. Roll our own keyboard nav (no cmdk benefit). Closest to legacy behavior.
- **B**: `focusRef` → CommandInput. Add `getValue?` hook on each combobox editor. Needs visible CommandInput inside the popover (UX change — adds a visible search input).
- **C**: `focusRef` → CommandInput, but the CommandInput is `visually-hidden` so users don't see it. Search/type-ahead still works via the input absorbing keystrokes. Subtle UX (no visible search).

I'd lean **B** (matches bsncraft's pattern + shadcn's official Combobox + restores the day-1 design the RFC mandates), but it's a visible UX change that the RFC doesn't explicitly bless or ban.

---

## Question 2: Multi-mode Enter contract preservation under cmdk (#427)

**Background.** PR #427 pinned the multi-mode contract: **Enter must NOT toggle the active option in multi mode.** Reason: silent data loss — user types a query, Enter highlights an option, Enter again toggles it without the user realizing. Space toggles in multi; Enter is reserved for the editor portal's commit path.

**cmdk's default Enter behavior.**

```js
case "Enter": {
  e.preventDefault();
  let i = M();  // get the active item
  if (i) {
    let l = new Event(Z);  // "cmdk-item-select"
    i.dispatchEvent(l);
  }
}
```

cmdk preventDefault's the Enter and dispatches `cmdk-item-select` on the active item, which fires the consumer's `onSelect`. In multi mode, my `onSelect` calls `updateSelection(idx)` which TOGGLES. **This re-introduces the silent-data-loss bug.**

**Fix.** Override cmdk's Enter handler in multi mode by passing `onKeyDown` to `Command`. cmdk runs consumer's `onKeyDown` first; if I `e.preventDefault()` on Enter, cmdk's switch is skipped. The Enter still bubbles to the editor portal's `handleKeyDown` → commit intent. Pseudocode:

```tsx
<Command
  onKeyDown={(e) => {
    if (e.key === "Enter" && isMulti) {
      e.preventDefault()  // skip cmdk's item-select dispatch
      // let it bubble to editor portal's commit handler
    }
  }}
>
```

**Decision needed.** This fix is mechanical but needs Playwright validation that:
1. Multi-mode Enter does NOT toggle (matches #427 contract)
2. Multi-mode Enter DOES commit via the editor portal (the value is the current toggled set)
3. Single-mode Enter SELECTS + COMMITS (cmdk's default behavior — no override)

These are 3 of the 4 missing-Playwright items in #506. Worker3 can write the specs but coordinator runs them. Confidence in correctness without local Playwright is medium-low.

---

## Question 3: Multi-mode Space toggle under CommandInput

**Background.** Legacy: Space toggles the active option in multi mode. Enter doesn't toggle (#427).

**Under cmdk's CommandInput pattern.** Space goes into the search input as a literal space character (CommandInput is `<input type="text">`). Toggle requires Space-on-the-active-option which cmdk doesn't natively support — it's not a Command palette gesture.

**Possible approaches:**
- **A**: Drop multi-mode Space toggle. Multi-mode users select via click only. Per the legacy code's source comment ("Space toggles in every mode") this would be a regression.
- **B**: Override cmdk's input keydown so Space on the input toggles the active option AND inserts a space in the search text. Gross dual-purpose.
- **C**: Don't put a CommandInput in multi mode. Use button trigger + cmdk for items only (back to Question 1's Option A: roll our own keyboard nav).
- **D**: Put a CommandInput but disable text-search in multi mode; map Space to toggle. Search disabled means CommandInput is just a focus target (visually-hidden). This is essentially Question 1's Option C plus Space-as-toggle.

**Decision needed.** Multi-mode UX is more complex than single-mode + autocomplete. May need its own design pass.

---

## What I shipped vs deferred

**Shipped:**
- **PR #520** (PR-C1, `v07-shadcn-combobox-foundation`) — adds `cmdk` + Radix primitives to `@bc-grid/editors`, copies `command.tsx` / `popover.tsx` / `dialog.tsx` / `utils.ts` into `packages/editors/src/shadcn/`, adds a thin `Combobox.tsx` wrapper exposing the legacy `Combobox` + `SearchCombobox` API. **Not yet wired to any editor.** PR-C1's wrapper made placeholder choices (focusRef → button, no CommandInput, cmdk for item rendering only) that don't actually work for keyboard navigation as written — the wrapper is a foundation skeleton, not a drop-in replacement.

**Deferred (PR-C2):**
- Editor source migration (swap each editor's body to import from `shadcn/Combobox`)
- Playwright assertions per the #506 inventory bar (multi-toggle, prepareresult preload, Enter contract #427, focus-return)
- Deletion of `internal/combobox.tsx` + `internal/combobox-search.tsx`

**Worker3 cannot safely complete PR-C2 without the Question 1, 2, 3 decisions above.** The migration is bigger than a "swap import paths" mechanical change because the keyboard model changes substantially when moving from in-house Combobox to cmdk + Radix Popover.

## Recommended path forward

Pick one:

1. **Coordinator drafts PR-C2 design.** Specify the focus model (button vs CommandInput), the multi-mode Space/Enter mapping, and whether a visible search input is acceptable UX. Worker3 implements per-spec.
2. **Coordinator splits PR-C2 into smaller steps.** E.g., PR-C2a: migrate `selectEditor` only (single mode is the cleanest fit for cmdk's default pattern). PR-C2b: migrate `multiSelectEditor` (needs Question 3 answered). PR-C2c: migrate `autocompleteEditor` (already input-driven; cleanest fit). PR-C2d: delete legacy.
3. **Coordinator takes PR-C2.** Write the migration directly given full context.

I'll stay in standby on the worker3 lane until the design is routed. If the answer is option 1 (specs me) I can ship within ~1-2 hours of the spec. If option 2 (split) I can ship the first slice (selectEditor + cleanest fit) in ~1 hour. Option 3 frees me to pick up PR-C3 (`v07-shadcn-editor-render-prop-slots`) once PR-C2 lands.

PR-C1's foundation (#520) doesn't need to be re-pushed regardless of which option is picked — it provides the dep + scaffold + a working skeleton. The wrapper itself may need refinement during PR-C2, but the deps + primitive copies are correct.
