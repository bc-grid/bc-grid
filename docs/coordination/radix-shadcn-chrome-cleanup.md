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
| 2: popup interaction contracts | **landed in this update** | `internal/popup-dismiss.ts` (new) + `FilterPopup`, `BcGridContextMenu`, `ColumnVisibilityMenu`, `grid.tsx` | Low | Shared `usePopupDismiss` hook (Escape + outside-pointer + focus-return-to-trigger). Column chooser now uses `computePopupPosition` (the third inline-clamp site is gone). Every popup root now carries `data-state="open"` + `data-side` + `data-align`. Pure decision helpers (`shouldDismissOnOutsidePointer`, `shouldDismissOnKey`) unit-tested without a live DOM. |
| 3: shared menu-item primitive | open | `internal/context-menu.tsx`, `columnVisibility.tsx` | Medium | Extract `<MenuItem>` / `<MenuCheckboxItem>` into `packages/react/src/internal/menu-item.tsx`. Standardises spacing, focus ring, disabled state across the two menus. Test impact: existing context-menu / column-chooser unit tests need to follow the new DOM. |
| 4: Radix-Popper trial | open | `packages/react/package.json`, `FilterPopup`, possibly `BcGridContextMenu` | Medium-High | Trial `@radix-ui/react-popper`. Compare bundle size + visual parity. Decision recorded in this doc. **Coordinator approval required** before adding the dep. |
| 5: keyboard-nav primitive | open | new `internal/use-roving-focus.ts` | Low | Right now context-menu manages its own roving focus inline; column chooser relies on Tab. A shared roving-focus hook unifies both and matches the Radix DropdownMenu / DropdownMenuCheckboxItem keyboard contract (ArrowDown/Up cycle, Home/End, type-ahead). |
| 6: Radix-Tooltip trial | open | `tooltip.tsx`, `package.json` | Medium | Replace the bespoke tooltip with `@radix-ui/react-tooltip` if bundle / SSR story checks out. Likely after slice 4. |
| 7: shared overlay primitive | open | new `internal/popup-shell.tsx` | Medium | Once all popups use the helper + matching focus, lift the box-shadow / radius / border / `data-state="open"` into a shared shell. Currently each popup re-declares these classes in `styles.css`. |

Slices 1–2 give the visible polish + interaction contract without any dependency change; 3 is also dep-free; 4–7 are the Radix-conversion track and need a coordinator-level dep decision.

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

## Slice 9 — Popup focus integration follow-up (this update)

Audit + design note for the next implementation slice; ships one independent fix that doesn't depend on the shared roving-focus helper still in PR #261's review.

### Audit — focus contract per surface (post-#261, pre-this-update)

| Surface | Pattern | DOM-focus owner | Roving | Trap | Tab leaves cleanly | Notes |
|---|---|---|---|---|---|---|
| Context menu | aria-activedescendant | menu root (`tabIndex=-1`) | inline `nextFocusableIndex` / `nextTypeAheadIndex` (works) | no | yes | Ripe for refactor onto `useRovingFocus` once #261 lands. Keep the active-descendant flavour (do not flip to roving tabindex — would change AT semantics mid-pass). |
| Column chooser | roving tabindex | per-item button `tabIndex={isActive ? 0 : -1}` | `useRovingFocus` (ships in #261) | no | yes | Already covered by #261. |
| Filter popup | form-style | first editor field via `autoFocus` | n/a (not a menu) | no | yes | Apply / Clear stay tabbable; no inert / focus-trap markup. Locked in here. |
| Sidebar tablist | tablist | per-tab button | inline arrow handler (works) | no | **gap fixed in this update** | Was `tabIndex={0}` on every tab — Tab cycled through every tab in the rail before reaching the panel body. Per WAI-ARIA APG, only the active tab is in the Tab sequence; arrows move within the rail. |
| Sidebar panel body | tabpanel | panel root (`tabIndex=-1`) | n/a | no | yes | Programmatic focus on activate; standard. |
| Tooltip | decorative | n/a | n/a | n/a | n/a | No focus state. |

### What ships in this update

- **Sidebar tablist roving tabindex.** `tabIndex={selected ? 0 : -1}` on each tab button, with a fallback to the first tab when the rail is collapsed (no `aria-selected="true"` tab). Existing `handleTabKeyDown` + `nextSidebarTabIndex` arrow / Home / End handler is unchanged — only the markup contract tightens. Per WAI-ARIA APG for tabs.
- **`packages/react/tests/sidebar.markup.test.tsx`** — 6 SSR markup tests for the new contract: only the active tab is in the Tab sequence, the first tab is the fallback when the rail is collapsed, `aria-selected` / `data-state` track selection, panel body keeps `tabIndex=-1`, SSR-safe.
- **`packages/react/tests/contextMenu.markup.test.tsx`** — 2 lock-in tests for the existing aria-activedescendant pattern: menu root has `tabIndex=-1` + `aria-activedescendant`, every item carries `tabIndex=-1`. Regression net for the slice that swaps the inline keyboard handler for `useRovingFocus`.
- **`packages/react/tests/filterPopup.test.tsx`** — 3 focus-trap-absence tests: dialog root is not focusable, Apply / Clear footer buttons aren't `tabIndex=-1`, no `inert` on the popup or its descendants.

### What's intentionally NOT in this update

- **No wiring of the shared `useRovingFocus` helper.** The helper lives in PR #261 (still in coordinator review at the time of writing). Doing the wiring now would either duplicate the helper (will conflict at merge) or require branching off #261 (the brief explicitly said branch from main). Producing a design / test note + the sidebar fix is the safer follow-up.
- **No change to `BcGridContextMenu`'s inline keyboard handler.** That's the next slice's target — see below.
- **No tool-panel focus changes.** The Columns / Filters / Pivot tool panels render lists of form controls (checkboxes, drag handles, range inputs); Tab through is already the right pattern. They're not menus; roving-tabindex would be wrong there.
- **No Escape-handling change.** `usePopupDismiss` keeps full ownership (popup-interaction-contracts invariant from slice 2).

### Next implementation slice (slice 10 candidate)

Once #261 merges:

- Refactor `BcGridContextMenu`'s inline `handleContextMenuKeyDown` / `nextFocusableIndex` / `nextTypeAheadIndex` to call `useRovingFocus`. Keep aria-activedescendant rendering — the hook is pattern-agnostic.
- Tests: the lock-in tests added here (menu root `tabIndex=-1` + `aria-activedescendant`, items at `tabIndex=-1`) are the regression net the refactor must keep green.
- Removes ~80 lines of duplicated logic from `internal/context-menu.tsx` while preserving every existing keyboard contract (ArrowDown/Up cycling, Home/End, Enter/Space activation, type-ahead).
