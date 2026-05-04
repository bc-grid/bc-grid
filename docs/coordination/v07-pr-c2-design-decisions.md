# v0.7 PR-C2 design decisions — coordinator routing

**Status:** ratified by Claude coordinator 2026-05-04 PM. Worker3 implements per these decisions.
**Source:** `docs/coordination/v07-block-c-pr-c2-design-questions.md` (#524 worker3).

---

## Q1 → **Option B**: `focusRef` → CommandInput (visible)

Use the bsncraft `lookup-list.tsx` pattern verbatim:
- `<Popover.Trigger asChild>` wraps the cell trigger button.
- On open, `<Popover.Content>` renders `<Command>` with `<CommandInput>` at the top, `<CommandList>` below.
- `focusRef` points at the `<CommandInput>` so cmdk's keyboard handler runs natively (type-ahead, ArrowUp/Down on aria-activedescendant).

**Add the `getValue?` editor framework hook** (audit P1-W3-6 — already on the v1.x deferral list, pull it forward):

```ts
// in packages/react/src/types.ts BcCellEditor:
getValue?: (input: HTMLElement | null) => string | undefined
```

When the editor portal commits, it calls `editor.getValue?.(focusRef.current)` first; if the editor returns a value, use that. Otherwise fall back to the existing `readEditorInputValue` switch. For combobox editors, `getValue` walks from the focused `<CommandInput>` up to the popover root and reads `data-bcgrid-combobox-value` (a `data-*` attribute the editor stamps on the popover content as the user toggles items).

**Why B:**
- Matches the RFC-mandated shadcn-native architecture
- Matches bsncraft's existing `lookup-list.tsx` pattern (consistency across the ERP)
- Restores Question 1's tradeoff back into the framework where it belongs (a tiny `getValue?` hook is much smaller surface than rolling cmdk's keyboard nav by hand)

**UX implication:** consumers see a search input inside the popover. This is shadcn's standard Combobox UX and is an improvement, not a regression. For combobox editors with very few options (≤ 5), the search input is still useful (filters by typing) and not obtrusive.

---

## Q2 → **Worker3's proposed fix**: preserve #427 commit-on-Enter in multi mode

```tsx
<Command
  onKeyDown={(event) => {
    if (event.key === "Enter" && isMulti) {
      event.preventDefault()
      // bubbles to editor portal's handleKeyDown → commit
    }
  }}
>
```

This skips cmdk's item-select dispatch. Single mode keeps cmdk's default (Enter selects highlighted + commits via `onSelect`).

**Coordinator runs Playwright** at merge time to verify:
1. Multi-mode Enter does NOT toggle (matches #427 contract)
2. Multi-mode Enter DOES commit via the editor portal with the current toggled set
3. Single-mode Enter SELECTS + COMMITS (cmdk default, no override)

These are 3 of the 4 missing-Playwright items in #506. Add the test specs in this PR; coordinator runs them at merge.

---

## Q3 → **Each CommandItem renders an inline `<Checkbox>` in multi mode**

Adopt the shadcn-canonical multi pattern:
- Type into `<CommandInput>` to filter (Space goes to search as a literal character)
- Each `<CommandItem>` in multi mode renders a leading `<Checkbox>` from `packages/editors/src/shadcn/checkbox.tsx` (copy from `~/work/bsncraft/packages/ui/src/components/checkbox.tsx` if it's not already in `@bc-grid/editors/shadcn` via the worker2 PR-A1 + #503 chain — verify before copying)
- Click on `<CommandItem>` toggles via `onSelect` (which calls `updateSelection(idx)`)
- **Tab inside the popover cycles through CommandInput → checkbox 1 → checkbox 2 → ...** — preserves keyboard-only multi-select toggle
- **Space on a focused checkbox toggles** (Radix Checkbox handles this natively)
- Enter still commits (per Q2 fix)
- Escape cancels (existing behavior)

This restores the Space-toggle a11y for keyboard-only users, just shifted from "Space-on-active-item" (cmdk's aria-activedescendant) to "Space-on-focused-checkbox" (Tab-reachable element). Standard shadcn pattern.

**Implementation:**
```tsx
<CommandItem onSelect={() => updateSelection(idx)}>
  <Checkbox checked={isSelected(idx)} className="mr-2" />
  <span>{option.label}</span>
</CommandItem>
```

The `<Checkbox>` is decorative-functional: the Click on the CommandItem already toggles via `onSelect`, but having the Checkbox in the DOM gives Tab a focus stop + Space toggle inertia.

---

## What worker3 ships in PR-C2

1. Migrate `selectEditor` (single mode, simplest) to the new foundation:
   - `<Popover.Trigger asChild>` around the cell trigger button
   - `<CommandInput>` + `<CommandList>` of `<CommandItem>`s
   - `focusRef` → CommandInput
   - cmdk's Enter-toggles-and-commits is the default (no override needed)
   - `getValue?` hook reads selection via `data-bcgrid-combobox-value` on popover content

2. Migrate `multiSelectEditor`:
   - Same shape as single
   - Each `CommandItem` has a leading `<Checkbox>`
   - `onKeyDown` override on `<Command>` preventDefault's Enter (per Q2)
   - `onSelect` toggles via `updateSelection(idx)`

3. Migrate `autocompleteEditor`:
   - CommandInput is the natural fit (typed search is the primary gesture)
   - `onSelect` writes the selected option's value to the popover root via `data-bcgrid-combobox-value`
   - Free-text mode: when user types and presses Enter without highlighting an item, commit the typed text directly (cmdk's default doesn't fire onSelect if no item matches; capture this case in `onKeyDown`)

4. Add `getValue?` hook to `BcCellEditor` interface in `packages/react/src/types.ts`
5. Update `editorPortal.tsx` to call `getValue?` before falling through to the legacy `readEditorInputValue` switch
6. Delete `packages/editors/src/internal/combobox.tsx` + `combobox-search.tsx`
7. Add Playwright assertions per `docs/coordination/v07-block-c-test-inventory.md` — coordinator runs them
8. Move existing combobox markup tests to `packages/react/tests/dom/` with `@testing-library/react`

**Public API preserved verbatim.** `bun run api-surface` diff must show only the additive `getValue?` field on `BcCellEditor`.

**Bundle delta expected:** small negative (deletions of combobox.tsx + combobox-search.tsx > Radix Popover + cmdk usage size). Update `tools/bundle-size/src/manifest.ts` with the new baseline at PR end.

---

## If worker3 hits a follow-up question

Don't block on it for >30 min — implement the simplest answer that ships, file the alternative as a v0.7.x or v1.x follow-up. The goal is to land PR-C2 + PR-C3 + PR-D so v0.7 closes; UX micro-tuning is post-cut.
