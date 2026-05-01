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

| Slice | Touches | Risk | Justification |
|---|---|---|---|
| 2: column-chooser positioning | `grid.tsx` `openColumnMenu` + `ColumnVisibilityMenu` | Low | Use `computePopupPosition` for the third surface; remove the third instance of inline clamp math. |
| 3: shared menu-item primitive | `internal/context-menu.tsx`, `columnVisibility.tsx` | Medium | Extract `<MenuItem>` / `<MenuCheckboxItem>` into `packages/react/src/internal/menu-item.tsx`. Standardises spacing, focus ring, disabled state across the two menus. Test impact: existing context-menu / column-chooser unit tests need to follow the new DOM. |
| 4: Radix-Popper trial | `packages/react/package.json`, `FilterPopup`, possibly `BcGridContextMenu` | Medium-High | Trial `@radix-ui/react-popper`. Compare bundle size + visual parity. Decision recorded in this doc. **Coordinator approval required** before adding the dep. |
| 5: shared focus-management hook | new `internal/use-popup-focus.ts` | Low | Encapsulate "autofocus on mount, return focus on close, swallow Tab inside" once at least three popups need it (filter popup, context menu, column chooser). |
| 6: Radix-Tooltip trial | `tooltip.tsx`, `package.json` | Medium | Replace the bespoke tooltip with `@radix-ui/react-tooltip` if bundle / SSR story checks out. Likely after slice 4. |
| 7: shared overlay primitive | new `internal/popup-shell.tsx` | Medium | Once all popups use the helper + matching focus, lift the box-shadow / radius / border / `data-state="open"` into a shared shell. Currently each popup re-declares these classes in `styles.css`. |

Slices 1–3 give the visible polish without a dependency change; 4–7 are the Radix-conversion track and need a coordinator-level dep decision.

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
