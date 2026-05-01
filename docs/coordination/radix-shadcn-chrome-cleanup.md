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
| 3: shared menu-item primitive | open | `internal/context-menu.tsx`, `columnVisibility.tsx` | Medium | Extract `<MenuItem>` / `<MenuCheckboxItem>` into `packages/react/src/internal/menu-item.tsx`. Standardises spacing, focus ring, disabled state across the two menus. Test impact: existing context-menu / column-chooser unit tests need to follow the new DOM. |
| 4: Radix-Popper trial | open | `packages/react/package.json`, `FilterPopup`, possibly `BcGridContextMenu` | Medium-High | Trial `@radix-ui/react-popper`. Compare bundle size + visual parity. Decision recorded in this doc. **Coordinator approval required** before adding the dep. |
| 6: Radix-Tooltip trial | open | `tooltip.tsx`, `package.json` | Medium | Replace the bespoke tooltip with `@radix-ui/react-tooltip` if bundle / SSR story checks out. Likely after slice 4. |
| 7: shared overlay primitive | open | new `internal/popup-shell.tsx` | Medium | Once all popups use the helper + matching focus, lift the box-shadow / radius / border / `data-state="open"` into a shared shell. Currently each popup re-declares these classes in `styles.css`. |

Slices 1–2, 5, and 8 give the visible polish + interaction contract without any dependency change; 3 is also dep-free; 4 / 6 / 7 are the Radix-conversion track and need a coordinator-level dep decision.

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
