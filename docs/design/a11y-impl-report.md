# Accessibility implementation report

**Status:** in-progress; this document is updated by `wcag-code-pass` (this task) and finalised by `wcag-deep-pass`.
**Owner (current pass):** worker4 (Claude)
**Source contract:** `docs/design/accessibility-rfc.md`
**Related audits:** `docs/audit-c2-003.md`, `docs/audit-c2-004.md`

This report tracks the gap between the `accessibility-rfc` contract and the implementation as it stands on `origin/main`. It is the precursor deliverable to `wcag-deep-pass`, which runs the browser/manual screen-reader validation.

---

## Code-pass scope

This pass deliberately stays inside what unit tests or static code inspection can verify. It does **not** run:

- axe-core in a browser
- Playwright a11y assertions
- NVDA / JAWS / VoiceOver manual scripts
- forced-colors or reduced-motion rendering checks against an actual browser

Those land with `wcag-deep-pass`.

---

## Fixes landed in `wcag-code-pass`

### Localised filter strings (no hard-coded English in the engine layer)

`accessibility-rfc §Live Regions` mandates that "Live text is localized through the React layer; no hard-coded English inside engine packages." The filter row had three hard-coded strings that bypassed `BcGridMessages`:

- `placeholder="Filter"` on the inline text-filter input.
- `placeholder="Min"` / `placeholder="Max"` on number-range and number(`between`) filter inputs.
- `aria-label="Filter <column>"` constructed inline in `renderFilterCell` and the popup-variant call site.

Closed by adding four keys to `BcGridMessages`:

- `filterPlaceholder: string`
- `filterMinPlaceholder: string`
- `filterMaxPlaceholder: string`
- `filterAriaLabel: ({ columnLabel }) => string`

`renderFilterCell` and `FilterPopup` now thread the resolved `messages` through `FilterEditorBody` and the inner `NumberFilterControl` / `NumberRangeFilterControl`, so a consumer can localise every filter-cell affordance via the existing `messages` prop.

### `aria-sort` resolution as a pure helper

`accessibility-rfc §Semantic DOM Model` says: "Sortable headers set `aria-sort='ascending' | 'descending' | 'none' | 'other'` only on the active sorted header where applicable."

The mapping was inlined inside `renderHeaderCell`. Extracted as `ariaSortFor(direction, sortable)` exported from `headerCells.tsx` so the four cases (asc / desc / sortable-but-unsorted / not-sortable) are unit-tested without mounting React.

### Test coverage extension

- `packages/react/tests/ariaSort.test.ts` — exhaustive case table for `ariaSortFor`.
- `packages/react/tests/defaultMessages.test.ts` — asserts `defaultMessages` populates every filter / live-region key the React layer reads, with parameter substitution checks for the announce templates.
- `packages/theming/tests/theming.test.ts` extended with three new CSS-string assertion blocks that pin the theming layer's contract for the three required `@media` queries:
  - `prefers-reduced-motion: reduce` zeroes `transition-duration` / `animation-duration` / `scroll-behavior`.
  - `forced-colors: active` uses `Canvas` / `CanvasText` / `Highlight` / `HighlightText` and renders the active-cell focus indicator as a real `outline: 2px solid Highlight` (not a `box-shadow`).
  - `pointer: coarse` exposes a `--bc-grid-hit-target-min` of `44px` and applies it via `min-width` / `min-height` per `accessibility-rfc §Pointer and Touch Fallback`.

Total suite delta: +11 tests across 3 files. Suite at 431/431 green.

---

## Existing wiring already in place (verified during this pass)

For traceability — these already match `accessibility-rfc` and don't need changes here:

- **Roles.** `role="grid"` flips to `role="treegrid"` when `groupingActive || treeRowAria`. Header row uses `role="row"` inside `role="rowgroup"`. Header cells use `role="columnheader"`. Body cells use `role="gridcell"` (or `role="rowheader"` when `column.rowHeader === true`).
- **Counts.** `aria-rowcount` is the full semantic row count (data + header + filter + aggregation footer when present); `aria-colcount` is the visible column count after hidden columns are excluded.
- **Indices.** Every rendered row carries `aria-rowindex` 1-based in the full row model (with the header offset). Every rendered cell/header carries `aria-colindex` 1-based in the visible-column order.
- **Active descendant.** Grid root's `aria-activedescendant` points at the active cell DOM id while in navigation mode; suspended (set to `""`) during edit mode so AT doesn't try to point at a cell that's now hosting an `<input>`. The active cell is retained in the DOM by the virtualizer so `aria-activedescendant` always references a live element.
- **Selection.** Selected rows set `aria-selected`; disabled rows set `aria-disabled`. Selection and focus are visually distinct.
- **Tree mode.** Tree rows under `<BcServerGrid rowModel="tree">` set `aria-level` (1-based) plus `aria-posinset` / `aria-setsize` when the parent's children are loaded (`computeTreeRowAria`).
- **Editing.** Cell hosting an editor sets `aria-current="true"` on the underlying gridcell; editor input gets `aria-label` from `column.header` plus `aria-describedby` to a visually-hidden span keyed by `useId()` when validation rejects. Polite live region debounces 250ms; assertive does not.
- **Live regions.** Two regions adjacent to the grid root: `role="status" aria-live="polite" aria-atomic="true"` and `role="alert" aria-live="assertive" aria-atomic="true"`. `useLiveRegionAnnouncements` exposes both `announcePolite` and `announceAssertive`; sort / filter / selection commit / validation-error / server-error announcements all routed through the resolved `messages` templates.
- **Theming.** Three `@media` queries cover `prefers-reduced-motion`, `forced-colors`, and `pointer: coarse`.

---

## Remaining work (owned by `wcag-deep-pass`)

These items need a real browser or assistive tech and so are out of scope for this pass. Listed here so `wcag-deep-pass` has a starting checklist instead of starting cold.

### Browser / runtime checks

- [ ] axe-core scan across every demo in `apps/examples`. Q1 acceptance criterion line 469 of accessibility-rfc.
- [ ] Visual confirmation that `prefers-reduced-motion: reduce` actually disables the FLIP / slide / cell-flash animations end-to-end. The CSS contract is asserted; the JS animation budget needs runtime verification.
- [ ] Visual confirmation that `forced-colors: active` renders visible borders, focus rings, and selection highlights across Chromium / Firefox / WebKit. Some browsers honour `Highlight` differently in non-focused states.
- [ ] Coarse-pointer 44px hit-target check on a touch device (or simulator). The CSS rule applies; the test is whether the actually-rendered buttons inside `.bc-grid-cell` reach the threshold.

### Manual assistive-tech scripts

Per `accessibility-rfc §Test Plan`:

- [ ] macOS VoiceOver + Safari current.
- [ ] macOS VoiceOver + Chrome current.
- [ ] Windows NVDA + Firefox current.
- [ ] Windows NVDA + Chrome current.
- [ ] Windows JAWS + Chrome current.

For each, the canonical script (RFC §Test Plan/Manual): tab into grid, arrow-navigate, page-jump, sort, scroll-out + recover, pinned-column announce order, reduced motion, forced colors.

### Polite-region announce on role transition

`accessibility-rfc §grid vs treegrid`: "If the consumer switches from flat rows to grouping/tree at runtime, `@bc-grid/react` may change `role="grid"` to `role="treegrid"` and **must announce the mode change through the polite status region**."

Today the grid switches `role` (when `groupingActive` toggles, or when `treeRowAria` becomes available) but does not emit a polite announcement. Surface area:

- Add a new `BcGridMessages` template — e.g., `gridModeAnnounce({ mode: "grid" | "treegrid" })`.
- Wire a `useEffect` on the resolved role; fire `announcePolite(messages.gridModeAnnounce(...))` when it changes.

Folded into `wcag-deep-pass` since it's small and benefits from screen-reader verification.

### Per-cell `aria-readonly` in editable grids

`accessibility-rfc §Semantic DOM Model`: "Read-only cells do not set `aria-readonly`. Once editing exists, non-editable cells set `aria-readonly='true'` only **if editability varies within an editable grid**."

Today no body cell emits `aria-readonly`. The condition (some columns editable, others not) needs a small computation per cell:

- "Grid is editable" predicate: any column has `editable` set, or the host is `<BcEditGrid>`.
- "This cell is read-only" predicate: column.editable is unset / false / `(row) => false`.
- When both true → emit `aria-readonly="true"`.

Verifiable with a unit-test predicate; folded into `wcag-deep-pass` so the ARIA contract change can be confirmed against a real screen reader (NVDA in particular treats `aria-readonly` differently from `aria-disabled`).

### Operator-label localisation (filter selects)

The filter row's `<select>` operators (`Is` / `Before` / `After` / `Between` / `=` / `!=` / `<` / `<=` / `>` / `>=` / etc.) are hardcoded English strings inside `<option>` elements. Same gap as the filter placeholders that this pass closed. Punted because it's a wider surface (4 controls × 4-7 operators each) and worth folding into a dedicated i18n pass that also covers the boolean-filter `Any` / `Yes` / `No` strings and the action column's default labels.

### Sort-column non-color indicator

`accessibility-rfc §Forced Colors`: "Sort direction, validation errors, dirty state, and selection state must not rely on color alone. Pair color with icon, text, border style, or shape."

Sort direction already pairs with the ▲/▼ glyph rendered alongside the column header label. ✓ shape-based.

But the **active-sort column header background** has no non-color indicator — it just gets a class hook (`bc-grid-header-cell-sorted-asc` / `-desc`). If theming uses only background color to show the active sort, that's color-only. Verify in `wcag-deep-pass` rendering against forced-colors and add a border/underline if missing.

### Currency locale resolution (audit-c2-003 §L4)

`api.md §4.2` references `view.locale.currency` but `BcGridProps.locale` is a string. The default is `"USD"` regardless. Not strictly an a11y issue but folded here so the docs-vs-impl drift gets resolved together.

---

## Maintenance notes

When adding a new user-visible string anywhere in `@bc-grid/react`:

1. Add a key to `BcGridMessages` in `packages/react/src/types.ts`.
2. Add a default to `defaultMessages` in `packages/react/src/gridInternals.ts`.
3. Extend `packages/react/tests/defaultMessages.test.ts` with a substitution / non-empty assertion.
4. Thread it through to the consuming render function via a `messages` parameter — never inline an English string in the engine.

When adding a new ARIA attribute:

1. Prefer extracting the resolution as a pure helper (`ariaSortFor`-style) so the case table is unit-testable.
2. Add a unit test for every state the helper resolves.
3. Update `accessibility-rfc` if the attribute fills a new role / state contract.
4. Cross-link from this report so the next a11y pass has a starting list.

When adding a new `@media` rule to the theming layer:

1. Add a CSS-string assertion to `packages/theming/tests/theming.test.ts` so the contract pins the rule's required selectors and properties — drift surfaces in CI rather than at runtime.

---

## References

- `docs/design/accessibility-rfc.md` (binding contract)
- `docs/audit-c2-003.md` (production-readiness audit; M1, M5, M6 a11y-adjacent)
- `docs/audit-c2-004.md` (shadcn/accent audit; M-severity filter input + accent-colour gaps relate to forced-colors testing)
- `packages/react/src/headerCells.tsx` — `ariaSortFor`, `renderFilterCell`, `FilterEditorBody`, `FilterPopup`
- `packages/react/src/gridInternals.ts` — `defaultMessages`, `useLiveRegionAnnouncements`
- `packages/theming/src/styles.css` — three `@media` queries
- `packages/react/tests/ariaSort.test.ts` (new)
- `packages/react/tests/defaultMessages.test.ts` (new)
- `packages/theming/tests/theming.test.ts` (extended)
