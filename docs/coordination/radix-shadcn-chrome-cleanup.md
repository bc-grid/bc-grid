# Radix / shadcn-first chrome cleanup

**Owner:** worker4 (Claude)
**Status:** in-flight; first slice in PR.
**Umbrella task:** `shadcn-chrome-polish-pass` (`docs/queue.md`).
**Spec:** `docs/design/chrome-rfc.md` for the surface inventory.

---

## Context

Five popup / menu surfaces ship today, each implementing its own click-outside, viewport-clamp, and focus management:

| Surface | File | Anchor shape | Viewport clamp | Focus | Outside-close |
|---|---|---|---|---|---|
| Filter popup | `packages/react/src/headerCells.tsx` (`FilterPopup`) | `DOMRect` | **missing** before this slice | autofocus on editor | pointerdown outside `[data-bc-grid-filter-popup]` / `[data-bc-grid-filter-button]` |
| Context menu | `packages/react/src/internal/context-menu.tsx` (`BcGridContextMenu`) | point `{ x, y }` | `clampContextMenu` (local) | menu root receives initial focus; `aria-activedescendant` for items | pointerdown outside menu root |
| Column chooser | `packages/react/src/columnVisibility.tsx` (`ColumnVisibilityMenu`) | point `{ x, y }` | computed inline in `grid.tsx` `openColumnMenu` | none — items focusable via Tab | pointerdown outside `.bc-grid-column-menu` / column-menu button |
| Tooltip | `packages/react/src/tooltip.tsx` | `DOMRect` | inline `clamp(rect.left, …)` | none (decorative) | mouseleave / blur |
| Sidebar | `packages/react/src/grid.tsx` (`<BcGridSidebar>`) | docked rail (no popup) | n/a | rail tabs use roving-tab-index pattern | Esc closes panel |

Common gaps before this slice:

- **Three independent viewport-clamp implementations** (`clampContextMenu`, `openColumnMenu`'s inline math, `tooltip`'s `clamp`).
- **`FilterPopup` had no clamp at all** — wide popups near the right edge clipped off-screen.
- **No Radix-style `data-side` / `data-align` placement attributes** on any popup root, so consumer CSS can't conditionally style based on resolved position the way it can for shadcn DropdownMenu / Popover.
- **No shared shape for "place me adjacent to a trigger, flip if no room"** — both column menu and filter popup hard-coded "below + start", which is wrong when the trigger is at the bottom of the viewport.

---

## Slice 1 (this PR)

Internal pure helper `computePopupPosition` (`packages/react/src/internal/popup-position.ts`) plus rewires of two surfaces.

### What ships

- **`computePopupPosition({ anchor, popup, viewport, side?, align?, sideOffset?, viewportMargin? })`** — Radix-Popper-style positioner. Pure function; no DOM, no React. Returns `{ x, y, side, align }` for inline `style` plus the resolved-side / resolved-align values for `data-*` attributes on the popup root.
  - **Point anchor** (`anchor.width === 0 && anchor.height === 0`): popup top-left lands at `(anchor.x, anchor.y)` clamped to viewport. Used by the right-click context menu.
  - **Rect anchor** (`anchor.width > 0 || anchor.height > 0`): popup placed adjacent to the trigger on the requested side, with start/center/end alignment along the perpendicular axis. Flips to the opposite side when the requested side doesn't fit. Used by the filter popup.
  - **Side flip rule:** if neither side fits (popup larger than the viewport on both axes), helper keeps the *requested* side and lets the perpendicular clamp catch what it can. Caller can detect this by comparing `result.side` against the requested value.
  - **Align clamp:** the perpendicular axis is always clamped to viewport, but the *requested* `align` is reported back unchanged so consumers can detect shifts via `data-align`.
  - **SSR-safe:** caller passes `viewport` explicitly, so `typeof window === "undefined"` doesn't error. Filter popup's wrapper supplies a synthetic viewport derived from anchor + popup size for SSR; the layout effect re-positions on hydration.

- **`FilterPopup`** now uses the shared helper. Renders `data-side` / `data-align` on the popup root. Fixes the missing viewport-clamp bug — wide popups near the right edge no longer clip off-screen.

- **Context-menu** `clampContextMenu` rewired to delegate to `computePopupPosition` (point-anchor mode). No behaviour change; just dedup. Adds `data-side="bottom"` / `data-align="start"` to the menu root for shadcn-CSS parity.

- **Tests:** 15 new in `popup-position.test.ts` covering point + rect anchors, edge clamping, side flipping, alignment, custom offsets, SSR-style viewports. 3 new SSR tests in `headerCells.test.tsx` asserting `FilterPopup` renders with the new `data-side` / `data-align` attributes and the `data-active` invariant.

### What this slice does NOT do

- **No Radix runtime dependency.** `@radix-ui/react-popper` is the obvious next step but adding it requires:
  - Updating `packages/react/package.json` peer-dep + dep tree.
  - Confirming the tree-shaking story (Radix's individual primitives are small but the popper is non-trivial).
  - Verifying the SSR / portal contract matches what `apps/examples` expects.
  - Auditing whether the existing inline `<div>`-and-portal-less placement breaks any existing Playwright spec.
  Coordinator should weigh this against the size budget. The pure helper is a forward-compatible scaffold — if Radix-Popper does land, this helper either wraps `Popper.Content`'s computed position or is replaced by it.
- **No column-chooser rewiring.** `grid.tsx` `openColumnMenu` does its own positioning and is bundled with state management. Slice 2 candidate.
- **No tooltip rewiring.** Tooltip clamp is one line; not worth touching until the Radix-Tooltip swap discussion.
- **No menu item primitive.** Context menu uses `<div role="menuitem">` and column chooser uses `<button role="menuitemcheckbox">`. Unifying them would need structural changes that aren't justified before the Radix conversation.
- **No focus-trap helper.** Existing focus management (autofocus on editor / menu root, return on Escape) is fine for the current surfaces. A shared focus-management hook makes sense once two more popups exist.

---

## Follow-up slices

| Slice | Status | Touches | Risk | Justification |
|---|---|---|---|---|
| 2: popup interaction contracts | **landed (PR #252)** | `internal/popup-dismiss.ts` (new) + `FilterPopup`, `BcGridContextMenu`, `ColumnVisibilityMenu`, `grid.tsx` | Low | Shared `usePopupDismiss` hook (Escape + outside-pointer + focus-return-to-trigger). Column chooser now uses `computePopupPosition` (the third inline-clamp site is gone). Every popup root now carries `data-state="open"` + `data-side` + `data-align`. Pure decision helpers (`shouldDismissOnOutsidePointer`, `shouldDismissOnKey`) unit-tested without a live DOM. |
| 5: keyboard-nav primitive | **landed (PR #261)** | new `internal/use-roving-focus.ts`; column chooser integration | Low | Shared roving-focus hook + pure helpers (`nextEnabledIndex` / `firstEnabledIndex` / `lastEnabledIndex` / `nextMatchingIndex` / `decideRovingKey`). Column chooser switched to roving tabindex per WAI-ARIA Authoring Practices. Escape stays out (popup-dismiss owns it); no focus trap. |
| 8 (was 4 of slice-2 audit): filter-popup chrome polish | **landed in this update** | `headerCells.tsx` + `theming/styles.css` + tests | Low | Trigger funnel button gets `data-state="open" \| "closed"` (Radix PopoverTrigger contract). Apply button focus ring inset to be visible against the accent bg. Clear button moves to a shadcn-ghost treatment (transparent border, hover bg). Filter popup root opts into a translate-only fade-in animation (gated by `prefers-reduced-motion`). Header padding rationalised; active-dot bumped to 8px with a token-driven inner ring. SSR markup contracts pinned in tests. |
| 9: sidebar/tool-panel chrome audit | review (PR #275) | `columnToolPanel.tsx`, `filterToolPanel.tsx`, `pivotToolPanel.tsx`, `theming/styles.css`, focused tests | Low | Sidebar already carries the docked-panel interaction contract (tablist, `data-state`, Escape close/focus return). This slice keeps panel behavior unchanged while tightening the visible rail, selected tab, shared panel header, empty states, disabled states, and form-control borders for dark-mode shadcn hosts. |
| 3: shared menu-item primitive | open | `internal/context-menu.tsx`, `columnVisibility.tsx` | Medium | Extract `<MenuItem>` / `<MenuCheckboxItem>` into `packages/react/src/internal/menu-item.tsx`. Standardises spacing, focus ring, disabled state across the two menus. Test impact: existing context-menu / column-chooser unit tests need to follow the new DOM. |
| 4: Radix-Popper trial | open | `packages/react/package.json`, `FilterPopup`, possibly `BcGridContextMenu` | Medium-High | Trial `@radix-ui/react-popper`. Compare bundle size + visual parity. Decision recorded in this doc. **Coordinator approval required** before adding the dep. |
| 6: Radix-Tooltip trial | open | `tooltip.tsx`, `package.json` | Medium | Replace the bespoke tooltip with `@radix-ui/react-tooltip` if bundle / SSR story checks out. Likely after slice 4. |
| 7: shared overlay primitive | open | new `internal/popup-shell.tsx` | Medium | Once all popups use the helper + matching focus, lift the box-shadow / radius / border / `data-state="open"` into a shared shell. Currently each popup re-declares these classes in `styles.css`. |

Slices 1–2, 5, and 8 give the visible polish + interaction contract without any dependency change; 3 is also dep-free; 4 / 6 / 7 are the Radix-conversion track and need a coordinator-level dep decision.

---

## Slice 9 — Sidebar/tool-panel chrome audit + surface polish (this PR)

A narrow audit pass over the docked sidebar shell and the merged columns / filters / pivot panels. This slice avoids state/keyboard behavior changes and keeps the existing column, filter, and pivot panel contracts intact.

### Audit notes

- **Surface / border layering:** the sidebar shell continues to bridge its panel background through `--bc-grid-card-bg` and separates the rail / panel with `--bc-grid-sidebar-border`. The rail now blends the card and muted tokens so it reads as attached chrome in dark mode instead of a prototype strip.
- **Spacing / radius:** built-in columns / filters / pivot panels now share a compact `.bc-grid-sidebar-panel-header` separator hook. Panel cards, dashed zones, and empty states stay dense and tokenized.
- **Focus-visible:** sidebar tabs now expose an explicit focus-visible ring instead of relying on hover styling. Panel container, panel buttons, and panel inputs keep their existing focus-visible hooks.
- **Selected tab / disabled states:** the active rail tab uses `--bc-grid-accent-soft` plus an inset accent marker, and disabled action buttons move to muted foreground / transparent background while keeping native disabled behavior.
- **Search/input controls:** columns search / pin select, filters panel inline editors, and pivot search / select controls consume `--bc-grid-input-border`, matching shadcn's distinction between `--input` and surrounding card/panel borders.

### What ships

- Shared panel header markup for the built-in columns / filters / pivot panels.
- Token-only CSS polish for rail buttons, selected tab state, header separators, cards/zones, empty states, disabled actions, and tool-panel form-control borders.
- Focused SSR markup tests plus theming contract tests for the new hooks.
- No panel state behavior changes, no pivot logic changes, no new runtime dependency, no Radix migration.

### Remaining follow-ups

- Evaluate whether the column and pivot drag handles should move from literal `::` text to an icon/visually-hidden label primitive. That is a markup/a11y follow-up and should not be mixed with this visual slice.
- Consider a shared internal tool-panel button/chip primitive after the context-menu item primitive settles; today the repeated CSS is explicit to keep this PR low-risk.

---

## Slice 2 — Popup interaction contracts (landed)

The four popup / menu surfaces now share a single interaction contract. The matrix below is updated relative to the original audit:

| Surface | data-state | data-side | data-align | shared dismiss | shared clamp | focus return | SSR safe |
|---|---|---|---|---|---|---|---|
| Filter popup | ✅ `open` | ✅ resolved | ✅ resolved | ✅ `usePopupDismiss` | ✅ `computePopupPosition` | ✅ to trigger | ✅ |
| Context menu | ✅ `open` | ✅ const | ✅ const | ✅ `usePopupDismiss` | ✅ `computePopupPosition` | ✅ to trigger | ✅ |
| Column chooser | ✅ `open` | ✅ const | ✅ const | ✅ `usePopupDismiss` | ✅ `computePopupPosition` | ✅ to trigger | ✅ |
| Tooltip | ✅ `open` (existing) | (transient) | (transient) | n/a (no dismiss path) | inline clamp (one line) | n/a (decorative) | ✅ |
| Sidebar | ✅ existing | n/a (docked) | n/a | inline Esc handler (different shape — docked panel, not popup) | n/a | ✅ existing | ✅ |

What this means for consumers:

- **`[data-bc-grid-filter-popup][data-state="open"]`** / **`.bc-grid-context-menu[data-state="open"]`** / **`.bc-grid-column-menu[data-state="open"]`** can be styled the same way they would a Radix `DropdownMenu.Content`, including consistent enter/exit animation hooks (`@starting-style` or `data-state` selectors).
- **Focus return** to the element that had focus when the popup opened is now automatic across all three popup surfaces. Apps that opened a popup via a keyboard shortcut don't need to remember the trigger and re-focus it on close.
- **Escape stops propagation** by default so a popup nested inside an Escape-aware sidebar panel doesn't double-dismiss (close the popup AND the panel on the same keystroke).
- **Single source of truth** for the dismiss decision: `shouldDismissOnOutsidePointer` and `shouldDismissOnKey` are pure functions exported alongside `usePopupDismiss` for unit testing without a live DOM.

---

## Slice 3.5 — Visual polish on the menu surfaces (this PR)

A targeted visual pass on the context menu + column-visibility menu chrome that lands in parallel with the open menu-item primitive (slice 3 / PR #259). Touches `packages/theming/src/styles.css`, `packages/react/src/internal/context-menu.tsx`, and `packages/react/src/types.ts` only — no new shared classes or runtime deps.

### What ships

- **Tighter row rhythm.** `min-height` 1.75 → 1.625 rem, padding 0 → 0.25 rem 0.5 rem, picking up shadcn DropdownMenu's `py-1.5 px-2` rhythm. Both the context menu and the column chooser now read at the same row height.
- **Smooth `transition-colors`.** Both row classes get a `transition: background-color, color` pair using `var(--bc-grid-motion-duration-fast)` and `var(--bc-grid-motion-ease-standard)` so hover / focus state changes don't snap-cut. The reduced-motion media query already in the stylesheet zeroes out the transition for users who prefer it.
- **Distinct keyboard-focus state.** Plain pointer hover keeps `var(--bc-grid-row-hover)` (the subtle accent-at-70 % token); keyboard `:focus-visible` and the menu's roving-focus `[data-active="true"]` row now use `var(--bc-grid-accent-soft)` (the tinted accent at 14 %). Result: a keyboard user navigating with arrow keys can see exactly where the focus ring is, distinct from a pointer hover that lights up a different row.
- **`pointer-events: none` on disabled rows.** Both the context-menu (`[aria-disabled="true"]`) and the column chooser (`:disabled`) now block click activation while the row is disabled. The previous opacity-only treatment let click events through, which the React handlers had to re-check.
- **Full-bleed separators.** `.bc-grid-context-menu-separator` switched from `margin: 0.25rem 0.25rem` to `margin: 0.25rem -0.25rem` so the 1 px line reaches the menu's outer edges (matches shadcn's `DropdownMenuSeparator -mx-1 my-1`). Reads as a divider between groups instead of a centred underline.
- **Min-width.** Both menus picked up explicit `min-width` (12 rem) so a one-item menu isn't visually squashed and the row text doesn't crowd against the radius.
- **Destructive variant — opt-in, shadcn-style.**
  - New `variant?: "default" | "destructive"` field on `BcContextMenuCustomItem`.
  - The renderer in `internal/context-menu.tsx` emits `data-variant="destructive"` on the row when the item opts in (omits the attribute otherwise — selectors target `[data-variant="destructive"]`, not the absence of `"default"`).
  - New CSS rule paints destructive rows: text uses `var(--bc-grid-invalid)`, hover / focus / `data-active` background uses `color-mix(in srgb, var(--bc-grid-invalid) 12%, transparent)`, and the leading icon picks up the destructive colour too.
  - Built-in IDs (copy / clear-range / pin / hide / autosize) are non-destructive by definition; none of them carry the variant.
- **Tokens-only.** Every modified rule references the existing `--bc-grid-*` tokens — no new direct `hsl(var(--…))` reads, no new shadcn-token bridge.

### What this slice does NOT do

- **No CSS class consolidation.** Both menu rows still use `.bc-grid-context-menu-item` / `.bc-grid-column-menu-item` rather than a shared `.bc-grid-menu-item` base. Slice 3 (PR #259, in review) introduces the shared class on the rendered DOM; once it lands, a follow-up CSS slice can collapse the duplicated rules into a single `.bc-grid-menu-item` entry. This slice intentionally avoids that to keep the visual diff small and easy to review.
- **No structural changes to the existing tests.** `tests/contextMenu.test.ts` and `tests/contextMenu.markup.test.tsx` got new tests appended for the destructive variant + the separator markup pin; existing tests are unchanged.
- **No new built-in destructive command.** The `variant` field is a consumer surface for custom items; the bundled built-ins remain non-destructive.

### Tests added

- `contextMenu.test.ts` — 3 new tests: `variant: "destructive"` accepted as a typed field, `variant: "default"` no-op, `variant` composes with `disabled`.
- `contextMenu.markup.test.tsx` — 5 new tests: destructive emits `data-variant`, default omits the attribute, "default" literal still omits, built-in items don't carry destructive, destructive composes with `data-active`. Plus a separator-markup pin so the visual slice doesn't accidentally drop the `role="separator"` / class / `aria-orientation` triple.

---

## Token / styling invariants this work preserves

- Every popup surface continues to consume `--bc-grid-context-menu-bg` / `--bc-grid-context-menu-fg` / `--bc-grid-context-menu-border` (already bridged to shadcn `--popover` / `--popover-foreground` / `--border` at the grid root).
- No direct `var(--popover, …)` / `var(--background, …)` references in chrome rules — the bridge stays at the grid root.
- The `data-side` / `data-align` attributes are CSS hooks **only**; no inline style depends on them. Apps can style `[data-bc-grid-filter-popup][data-side="top"] { … }` to draw an arrow on the bottom edge, but the default theming.css doesn't override anything based on these attributes yet.

---

## Validation expected by the coordinator

- Type-check + lint clean.
- Focused unit tests (`popup-position.test.ts`, `headerCells.test.tsx`).
- Full unit suite green.
- **Coordinator-owned:** Playwright runs covering filter-popup / context-menu (`apps/examples/tests/`) — to verify the new clamp doesn't shift any visible position in the existing flows.
- No bundle-size baseline shift — the helper is pure JS, no new dependencies.

---

## Slice 8 — Filter popup chrome polish (landed)

Polish pass on the filter popup chrome to align with the broader popup-interaction-contracts work and the Radix PopoverTrigger / Popover.Content visual conventions. **No new runtime dependencies; no React-side state changes.** All visual refinements live in `theming/styles.css` plus a single attribute on the trigger button.

### Trigger button

- **`data-state="open" | "closed"`** added to `.bc-grid-header-filter-button`. Mirrors the Radix PopoverTrigger contract so consumers can target the trigger with `[data-bc-grid-filter-button][data-state="open"] { … }` exactly the same way they would a Radix PopoverTrigger. Coexists with the existing `aria-haspopup` / `aria-expanded` / `aria-controls` linkage.
- Trigger renders a subtle `--bc-grid-accent-soft` background while the popup is open, so the visual link between trigger and popup is preserved without depending on hover / focus state.

### Popup root

- **Open animation**: opacity + translateY-only fade-in via `bc-grid-filter-popup-in` keyframes (no scale, to satisfy the existing "CSS motion avoids text scaling" theming invariant). `var(--bc-grid-motion-duration-fast)` + `var(--bc-grid-motion-ease-standard)` so it tracks the rest of the motion system.
- Reduced-motion override: `@media (prefers-reduced-motion: reduce)` disables the animation. Apps that ship a `data-state="closed"` exit transition can layer the matching keyframe; bc-grid is unmount-on-close, so only the open keyframe ships.

### Header

- Symmetric padding (`0.125rem 0.375rem`) — drops the previous one-off asymmetric block.
- Title gets tracker-style typography (`0.6875rem`, `letter-spacing: 0.04em`, uppercase, muted-fg) consistent with the column-chooser title.
- **Active-dot** bumped from 6px to 8px (clearly readable at glance), bg switched from `--bc-grid-focus-ring` (was visually conflated with keyboard focus) to `--bc-grid-accent`. A `box-shadow: 0 0 0 2px var(--bc-grid-accent-soft)` halo gives the dot a subtle ring on both light + dark themes without a hard-coded shadow colour.

### Footer buttons

- **Apply** keeps the primary-action treatment (`--bc-grid-accent` bg, `--bc-grid-accent-fg` text) shipped in slice 2's chrome cleanup. Focus-visible outline-offset moved from `1px` to `2px` so the ring is visible against the accent border.
- **Clear** moves to a shadcn-ghost treatment: transparent border on idle, `--bc-grid-row-hover` bg on hover, muted-fg text that brightens to default-fg on hover. Differentiates Clear (secondary, "clear my filter input") from Apply (primary, terminal) without resorting to a destructive colour.

### Tests pinned

- **`packages/react/tests/headerCells.test.tsx`** — 2 new: trigger emits `data-state="open" | "closed"`; `data-state` and `data-bc-grid-filter-button` coexist on the same button.
- **`packages/react/tests/filterPopup.test.tsx`** — 3 new: Apply class hooks survive (regression guard), Clear class hooks survive, active-dot class hook survives.
- **`packages/theming/tests/theming.test.ts`** — 3 new CSS contracts: filter-popup chrome (Apply primary tokens / Clear ghost / active-dot accent), trigger `[data-state="open"]` selector exists, open animation is translate-only + reduced-motion-gated.

### Out of scope

- No structural change to FilterPopup component. Existing tests for the dialog labelling, footer button labels, click-outside dismiss, and aria-controls linkage (PRs #252, #256) all carry over unchanged.
- No new runtime dependency.
- Reusing `usePopupDismiss` and `computePopupPosition` (already in place from slices 1–2). The roving-focus hook from slice 5 doesn't apply here since the popup contains form inputs, not a menu list.

---

## Slice 9 — Pagination + footer chrome polish (this PR)

Audit + safe slice on the pagination chrome and the previously-unstyled `.bc-grid-footer` wrapper. Rich-but-bounded scope: the buttons + select were tokens-only and density-aware before this slice but read like text-only browser-default controls in dense ERP grids. This slice promotes them to first-class shadcn IconButton + chevron-Select quality without changing pagination behaviour or pagination-semantics.

### Audit findings

| Surface | Status before this slice | Notes |
|---|---|---|
| `.bc-grid-pagination` container | tokens-only, flex space-between | ✅ shadcn-aligned |
| `.bc-grid-pagination-button` | text-only "First / Prev / Next / Last", min-height 2 rem | Read like browser-default controls. No `transition-colors`. No `pointer-events: none` on disabled. `:active` had no styling. |
| `.bc-grid-pagination-size select` | shared button base; `--bc-grid-input-border` for the input look | Native platform chevron varied across browsers; in dark mode some browsers (notably Safari) painted a dark-on-dark glyph. No appearance reset. |
| `.bc-grid-pagination-button:disabled` | opacity 0.5, `cursor: not-allowed` | Mismatched with shadcn DropdownMenu disabled (`cursor: default`) and the rest of the grid chrome. |
| `.bc-grid-footer` wrapper | **no CSS rule defined** | Grid renders `<div class="bc-grid-footer">` around the pager + any custom footer ReactNode but the class had no styling — a consumer-supplied footer butted against the last row with no separator. |
| `.bc-grid-statusbar` chrome | tokens-only, density-aware, forced-colors covered | ✅ shadcn-aligned |
| Forced-colors / coarse-pointer | `min-width` / `min-height: 44px` already covers pagination | ✅ |
| Reduced-motion | `*` rule zeroes `transition-duration` | ✅ existing rule covers any new transition the slice adds |

### What ships

`packages/react/src/internal/pagination-icons.tsx` (new; lucide-backed as of the v0.7 icon sweep) — four exported glyph nodes: `ChevronLeftDoubleIcon` (First), `ChevronLeftIcon` (Prev), `ChevronRightIcon` (Next), `ChevronRightDoubleIcon` (Last). The wrapper preserves the `bc-grid-pagination-icon` class, `aria-hidden="true"`, and `currentColor` stroke contract while sourcing the SVG paths from `lucide-react`.

`packages/react/src/pagination.tsx`:
- Replaces visible `"First" / "Prev" / "Next" / "Last"` button text with the four chevron glyphs. `aria-label` (already present) drives AT announcement; the buttons read as shadcn IconButton-style square controls.
- New `.bc-grid-pagination-size-control` `<span>` wrapper around the native `<select>` so the chevron `::after` pseudo can sit on the inside-right edge of the control.

`packages/theming/src/styles.css`:
- New `.bc-grid-footer` rule with `border-top: 1px solid var(--bc-grid-border)`, `background: var(--bc-grid-bg)`, `color: var(--bc-grid-fg)`, padding `0.5rem var(--bc-grid-cell-padding-x)`. Tokens-only — picks up dark mode + forced-colors via the existing token cascade with no new HC override.
- `.bc-grid-pagination-button` becomes a square `width: 2rem; min-height: 2rem; padding: 0; display: inline-flex; align-items: center; justify-content: center;` IconButton. Hover / `:active` / `:focus-visible` / `:disabled` states all keyed off `--bc-grid-*` tokens. New `:active` style uses `--bc-grid-accent-soft` for a more visible "pressed" affordance.
- `.bc-grid-pagination-button:disabled` swapped from `cursor: not-allowed` to `cursor: default` + `pointer-events: none` to match slice 3.5.
- `.bc-grid-pagination-button, .bc-grid-pagination-size select` shared rule gains a `transition: background-color, color, border-color, opacity` declaration using `--bc-grid-motion-duration-fast` / `--bc-grid-motion-ease-standard`. The existing reduced-motion `*` rule zeroes the transition.
- `.bc-grid-pagination-size select` gains `appearance: none` + `-webkit-appearance: none` + an explicit `color: var(--bc-grid-fg)` so option text reads correctly in dark mode.
- `.bc-grid-pagination-size-control::after` paints a custom 10 × 6 chevron via `mask-image` + `background: var(--bc-grid-muted-fg)`. Hover / focus-within on the wrapper brightens the chevron to `--bc-grid-fg`. `pointer-events: none` so clicks pass through to the underlying `<select>`. Forced-colors inherits via the existing `--bc-grid-muted-fg → CanvasText` mapping.
- `.bc-grid-pagination-size select:disabled` matches the button disabled treatment for consistency when a consumer wires `<select disabled>`.

### What this slice does NOT do

- **No JSX reshape beyond the icon swap + the new `.bc-grid-pagination-size-control` wrapper.** `BcGridPagination` keeps its public props, the page-size dropdown uses the native `<select>` (preserves platform UX: typeahead, OS-native scrim), the row-count summary keeps `aria-live="polite"`.
- **No behaviour change.** Disabled buttons were already non-actionable via the React `disabled={...}` prop — the `pointer-events: none` is purely a hover / cursor cleanup. Click handlers, page-clamping, server-paged manual mode, page-size routing all unchanged.
- **No pagination-semantics change.** "Rows X-Y of Z" formatting, manual / client modes, the `paginationMode="manual"` server-paged contract all stay the same.
- **No status-bar visual change** — the audit confirmed no shadcn-feel gap; the segment / aggregation tokens already track the cascade.
- **No new tokens.** Every new CSS reference uses existing `--bc-grid-*` tokens. The CSS-contract test `pagination button styling reads only bc-grid tokens (no direct shadcn-token reads)` enforces this — slicing the pagination block and asserting no `var(--background`, `var(--input`, `var(--ring`, `var(--accent`, `var(--popover`, `var(--foreground`, `var(--muted-foreground` direct reads.

### Tests pinned

`packages/react/tests/pagination.test.tsx` — three new describe blocks (12 tests, all pure SSR markup):

- **`BcGridPagination — CSS-contract markup hooks` (7 tests)** — `.bc-grid-pagination` + `aria-label="Pagination"`, child container classes, the new `.bc-grid-pagination-size-control` wrapper, `aria-live="polite"` on the summary, button class on every boundary, native `disabled` attribute emission, page-size `<option>` order + `selected`.
- **`BcGridPagination — icon-only navigation buttons` (4 tests)** — every button renders an SVG glyph (no visible text "First" / "Prev" / "Next" / "Last"); aria-label preservation; `aria-hidden="true"` on every glyph; `stroke="currentColor"` for the cross-mode adapt.
- **`BcGrid footer wrapper — CSS-contract markup hooks` (1 test)** — `<div class="bc-grid-footer">` rendered around the pager.

`packages/theming/tests/theming.test.ts` — six new CSS-contract tests pinning the rule-level invariants (footer rule contents, transition declaration shared between button and select, disabled treatment, `appearance: none` reset, chevron `::after` token + mask, no direct shadcn-token reads in the pagination block).

### Out of scope

- AG-Grid-style numbered page buttons. The pager renders the current page as text ("Page X of Y"); a numbered-button variant is a behaviour change that belongs in a separate task.
- BcStatusBar polish — the audit confirmed no shadcn-feel gap.
- A bundled icon registry. The four chevron glyph exports remain in `packages/react/src/internal/pagination-icons.tsx` as lucide-backed compatibility wrappers; consolidating into one `internal/icons.tsx` is a follow-up if the icon set grows.
