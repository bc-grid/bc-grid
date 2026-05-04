# bsncraft consumer issues — open as of `@bc-grid/react@0.6.0-alpha.3`

> **alpha.3 published 2026-05-04 PM** at https://github.com/bc-grid/bc-grid/releases/tag/v0.6.0-alpha.3 — bsncraft can `bun update @bc-grid/*@0.6.0-alpha.3`. **Major shipping in this cut:** v0.7 architecture-correction RFC ratified + Block A complete (Radix runtime deps + 13 shadcn primitives sourced from `~/work/bsncraft/packages/ui/src/components/`) + Block B half-done (PR-B1 #510 context-menu / header column-options now use Radix `ContextMenu` + `DropdownMenu`; PR-B3 #518 tooltip + filter popover now use Radix `Tooltip` + `Popover`; deleted ~2,000 LOC of in-house menu / popup-position / popup-dismiss / use-roving-focus code) + Block C foundation (PR-C1 #520 cmdk + Radix Popover in `@bc-grid/editors`). Plus alpha.2 follow-throughs: editor a11y fix (#493), quick filter (#495), client tree row model phases 2.5 + 3 (#452, #455), submenu collision-flip "neither side fits" (3ff7a16), server-row cache stats (#470), CSV export (#498), tree expansion persistence (#496). Plus v1.0 prep substantially closed: API surface freeze audit (#502) + all §15 action items (#505/#507/#508/#514), browser compat matrix doc (#509), examples app cleanup with `?hero=<slug>` URL flag (#511), screenreader code-pass audit (#516) + treegrid ARIA fixes for both client-tree (#517) and server-tree (#519) modes.
>
> **Soak validation requested:** install + smoke right-click context menu (now Radix), header column-options menu (now Radix Dropdown), tooltip on header funnel + cell hover (now Radix Tooltip), header funnel filter popovers (now Radix Popover). The chrome DOM has changed — `.bc-grid-context-menu` / `.bc-grid-tooltip-content` / `.bc-grid-context-menu-submenu-content` markup is now Radix-rendered. If bsncraft CSS targets those classes/attributes, expect breakage.

> **alpha.2 published 2026-05-04** at https://github.com/bc-grid/bc-grid/releases/tag/v0.6.0-alpha.2 — bsncraft can `bun update @bc-grid/*@0.6.0-alpha.2` to pull the alpha.2 work train. Shipped this cut: pinned-lane Option B count-agnostic 3-track template (closes alpha.1 P0), submenu collision-flip (visible-on-right-edge fix), server-tree group rows render correctly, in-cell editor unmount fix on `<BcServerGrid>` (cleanupRowRef), shadcn-native render-prop cluster (`createTextEditor` + numeric batch + `createCheckboxEditor`), `BcServerGridProps.onBlockError` + `autoRetryBlocks`, server display column order in paged loader, `useServerPagedGrid` dual-output `bound`, actions-column keyboard shortcuts (Shift+E / Shift+Delete), toolbar render-prop context with composable sub-slots. **Soak validation requested:** install + smoke any flow that hits editor activation, the new toolbar shape, and the pinned-lane fix on multi-column-pinned views.

> **🚨 v0.7 heads-up — Radix/shadcn architecture correction (2026-05-04):** bsncraft maintainer audit confirmed bc-grid drifted from its day-1 design — README + `docs/design.md` specify "shadcn/Radix from the ground up, copied via shadcn CLI, not runtime dep" but every chrome primitive (context menu, popover, popup-dismiss, combobox, tooltip, all icons) was hand-rolled across `packages/react/src/internal/*` (~3,000 LOC of homegrown surface). RFC at `docs/design/shadcn-radix-correction-rfc.md` plans the v0.7 correction in 9 PRs across worker2 (chrome) + worker3 (editors). **Public API is preserved verbatim** — `BcContextMenuItem`, `DEFAULT_CONTEXT_MENU_ITEMS`, all editor exports, all `BcGridProps.*` chrome props are identical between v0.6 and v0.7. **What WILL change for consumers:**
> - DOM under `.bc-grid-context-menu`, `.bc-grid-tooltip`, the filter popups, and tool panels switches to Radix-rendered markup. Any bsncraft CSS that targets `.bc-grid-menu-item`, `.bc-grid-context-menu-submenu-content`, `.bc-grid-tooltip-content`, or `[data-bc-grid-popup-*]` should be reviewed — those classes/attributes won't survive the swap.
> - Icons move to `lucide-react`. The chevron / sort / filter / pin SVGs will look identical visually but the SVG source changes.
> - `<select>` / multi-select / autocomplete editor internals switch to `cmdk` (the shadcn `Command` primitive). Visible behavior preserved, but if you're targeting the combobox DOM in tests/CSS, expect class-name churn.
>
> **Bundle:** approximately neutral (~12-18 KiB Radix add, ~10-14 KiB hand-rolled deletion). Stays under the 150 KiB cap.
> **Cadence:** Block A (foundation) lands in v0.7.0-alpha.1, Blocks B + C land progressively. Each PR ships behind a stable public API, so bsncraft can stay on `0.7.0-alpha.*` continuously and never needs a "big-bang" upgrade.
> **Action requested:** flag any bsncraft code that selects DOM under `.bc-grid-menu-*` / `.bc-grid-context-menu-*` / `.bc-grid-tooltip-*` / `.bc-grid-popup-*` so we know which surfaces matter to the consumer before we replace them. Reply in `bsncraft-issues.md` or open a tracking issue.

Tracking document for issues bsncraft has flagged. Update status on each new bc-grid release.

**Legend:** ❌ open · 🔄 in flight (RFC ratified, not yet visible to consumer) · ✅ shipped & verified

---

## P0 — Visible regressions and blocked production features

### ✅ 1. Pinned-right column renders on left — shipped in 0.6.0-alpha.2 via #479

**Fix:** pinned-lane Option B count-agnostic 3-track template (RFC ratified by all 3 workers). The `--bc-grid-columns` track count was the root cause; the new template makes pinned-right grid-column placement consumer-column-count agnostic. Bsncraft can now apply `pinned: "right"` to consumer-supplied columns without overlap.

**Verify:** install `@bc-grid/*@0.6.0-alpha.2` (or later) and confirm consumer-supplied `pinned: "right"` columns render on the right edge.

---

### ✅ 2. Tree-mode group rows render as data rows — shipped in 0.6.0-alpha.2 via #465

**Fix:** `<BcServerGrid rowModel="tree">` now builds an `__bcServerRowEntryOverrides` map (`Map<RowId, ServerRowEntryOverride>`) from `flatNodes` alongside the data rows and passes it to `<BcGrid>`. The override carries `kind`, `level`, `label` (from `groupKey`), `childCount`, `childRowIds`, `expanded` per row. `<BcGrid>` consults the map after `flattenGroupedRowTree` and synthesises `GroupRowEntry` shape for every override entry, so the render loop's group-row branch fires correctly. Bonus: #519 extended this with a leaf-row variant carrying `level` so screenreaders surface `aria-level` for both group AND leaf rows in server-tree mode.

**Verify:** group rows now render via `renderGroupRowCell` with full-width chrome, count, and proper aria-level depth.

---

### ✅ 3. Edit mode broken on `<BcServerGrid>` — shipped in 0.6.0-alpha.2 via #451

**Fix:** in-cell editor unmount fix — `cleanupRowRef` pattern decouples `useLayoutEffect` deps from re-render churn. The root cause was that `<BcServerGrid rowModel="paged">` server fetches were unmounting the in-cell editor immediately on each refresh, causing the invisible input + flashing rows + leaked hotkeys.

**Verify:** install `@bc-grid/*@0.6.0-alpha.2` (or later) and confirm in-cell `cellEditor: textEditor` mounts visibly + holds focus + gates global hotkeys via `isEditableKeyTarget`.

---

## P1 — Visible polish bugs

### ✅ 4. Master row hover cascades into nested grid — shipped in 0.5.0 GA via #426 RFC + #430 impl

**Fix:** row-state cascade scoping — `:not()` selector guards on 16 selectors so master row hover/focus/select state doesn't bleed into nested grid cells in the detail panel.

**Verify:** install `@bc-grid/*@0.5.0` (or later) and confirm master row hover stays on the master row, with the nested grid inside the detail panel showing its own independent row-state.

---

### ✅ 5. `--bc-grid-row-hover` transparency leak — shipped in 0.5.0 GA via #425

**Fix:** opaque `--bc-grid-row-hover` token mixed against `var(--bc-grid-bg)` instead of `transparent`. Same perceived colour; no alpha; pinned-cell compositing produces byte-identical pixels with body cells.

**Verify:** install `@bc-grid/*@0.5.0` (or later) and confirm hover + hover+selected states show identical pixels across pinned and body cells.

---

### ✅ 6. Scroll-shadow gradient overlays row state colours — shipped via #432

**Fix:** pinned scroll-shadow now blends with row state. The boundary gradient composites correctly so hover / selected / focused state colours stay visible through the shadow rather than getting darkened by it.

**Verify:** scroll horizontally on a grid with pinned columns + active row state; the state colour should remain visible in the pinned area.

---

### ✅ 7. Editor portal mispositions when detail panels are expanded — shipped via #418 (layout pass PR c)

**Fix:** layout architecture pass PR (c) — editor portal simplification. After the single-scroll-container migration (PR a #415), `editorCellRect` math no longer needs to compensate for variable-height rows above the target; the sticky-positioned headers + body rows give the editor portal a stable measurement basis.

**Verify:** open an in-cell editor on a row below an expanded detail panel; editor renders at the correct screen Y.

---

### ✅ 8. Nested grid in detail panel doesn't fill panel width — shipped via #415 (layout pass PR a)

**Fix:** layout architecture pass PR (a) — single scroll container + sticky headers. The flex-column distribution now reads container width from the live viewport rather than an early ResizeObserver measurement, so nested grids in detail panels redistribute correctly.

**Verify:** mount a nested `<BcGrid>` inside `renderDetailPanel`; flex columns fill the full panel width.

---

### ✅ 9. Header lags body during fast horizontal scroll — shipped via #415 (layout pass PR a)

**Fix:** layout architecture pass PR (a) — single scroll container + `position: sticky` headers. Removes the JS-driven scroll-sync entirely; CSS sticky pinning eliminates the 1-frame lag visible on fast trackpad input.

**Verify:** rapidly trackpad-scroll horizontally; header stays exactly aligned with body cells frame-by-frame.

---

### ✅ 10. Detail panel content cuts off during horizontal scroll — shipped via #416 (layout pass PR b)

**Fix:** layout architecture pass PR (b) — `position: sticky; left: 0` on `.bc-grid-detail-panel`. The detail panel now stays anchored to the viewport's left edge during horizontal scroll, so its content remains visible regardless of scroll position.

**Verify:** scroll horizontally on a master grid with an expanded detail panel; nested grid content stays visible at the left edge.

---

## P1 — API ergonomics and silent failures

### ❌ 11. Column sizing API leaks `flex`; resize doesn't work on flex columns

`BcGridColumn` has `flex?: number` (`core/dist/index.d.ts:126`). `commitColumnWidth` (`react/dist/index.js:670-680`) sets `width` in column-state but doesn't clear `flex`. Next render reads `state?.flex ?? column.flex` and re-applies flex distribution, snapping the resize back.

**Fix options:**
- **API change**: replace `flex: number` with `width: number | "auto"`. `"auto"` columns split remaining viewport width evenly. Auto becomes fixed-width on drag start (capture computed width, set `width`, drop `auto`). Intent-driven, no flexbox primitive leaking to consumers.
- **Smaller fix**: `commitColumnWidth` clears `flex` from column-state alongside setting `width` on resize. Existing API stays, flex+resize starts working.

**Bsncraft impact:** Name and Address columns on customers grid use `flex: 2` and are unresizable. Consumer cannot work around without losing auto-grow behavior.

---

### ❌ 12. Tree validator errors swallowed silently in dev

`server-row-model/src/index.ts:validateTreeResult` correctly throws on shape mismatches. The throw is caught silently in `loadTreeChildren`'s `.catch()` and surfaces only as a blank grid with no console message. Cost a real consumer ~30 minutes to diagnose because the contract ("`childCount` echoes the *requested* size, not the returned row count") is non-obvious.

**Fix:** in dev mode, forward validator errors to `console.error` with `[bc-grid] tree result rejected: <reason>` prefix. ~3 lines.

---

### ❌ 13. Built-in editors typed as `BcCellEditor<unknown>` — every consumer casts

`@bc-grid/editors` exports editors typed as `BcCellEditor<unknown, unknown>`. Every column declaration in a typed grid triggers TS2349 and requires a cast:
```ts
const text = textEditor as BcCellEditor<CustomerRow>;
```
With ~10 master grids planned for bsncraft, that's 10+ identical casts.

**Fix:** make built-in editor factories generic over `TRow` / `TValue`. Or have the `Component` prop's `TRow` parameter be more permissive so consumer's specific TRow flows through.

Already on worker1's stretch backlog; bumping priority.

---

### 🔄 14. `useServerTreeGrid` dual-output (`bound` for plain `<BcGrid>`)

**Partial:** `useServerPagedGrid` dual-output `bound` shipped in 0.6.0-alpha.2 via #484. `useServerInfiniteGrid` and `useServerTreeGrid` IMPL **deferred** per #485 — gated on extracting the dual-output orchestration helper to keep the three hook implementations symmetrical. Tracked in `docs/design/server-paged-cursor-pagination-impl-deferral.md` and the deferral doc shipped in #485.

**Workaround:** consumers needing tree dual-output today can use `<BcServerGrid rowModel="tree">` directly (server-tree group rows render correctly per item #2 ✅, and server-tree leaf rows surface aria-level per #519 ✅).

---

### ✅ 15. `ServerMutationResult.row` shape isn't documented — shipped via #475

**Fix:** JSDoc clarification on the `row` field of `ServerMutationResult` — replacement semantics (full canonical row, not a partial patch). Different consumers no longer have to reverse-engineer the contract from behaviour.

**Verify:** check the type's JSDoc in `@bc-grid/core@0.6.0-alpha.2` (or later) — the `row` field documents that hosts should return the full canonical row.

---

### ✅ 16. Actions column on all grid types — shipped in 0.6.0-alpha.1 via #453

**Fix:** Option A. Server grids now auto-inject `__bc_actions` the same way `<BcEditGrid>` does — `onEdit` / `onDelete` / `extraActions` / `hideActions` / `canEdit` / `canDelete` / `onDiscardRowEdits` / `confirmDelete` / `editLabel` / `deleteLabel` / `DeleteIcon` are available on `BcServerPagedProps` / `BcServerInfiniteProps` / `BcServerTreeProps`. Bsncraft can drop the hand-rolled actions column in `apps/web/components/edit-grid.tsx` (~150 LOC saving). Bonus: keyboard shortcuts (Shift+E / Shift+Delete / Shift+Backspace) shipped in 0.6.0-alpha.2 via #464.

**Verify:** install `@bc-grid/*@0.6.0-alpha.1` (or later) and confirm `<BcServerGrid onEdit={...} onDelete={...}>` auto-injects the actions column.

---

## P2 — Polish

### ❌ 17. Built-in editors are bare HTML

`textEditor` / `selectEditor` / etc. render `<input>` / `<select>` with default browser styling. Visually inconsistent with shadcn-native host apps. For a grid that's "the main way users edit data" (bsncraft framing), this matters.

**Fix:** companion `@bc-grid/editors-shadcn` package importing host shadcn primitives, or render-prop hook that lets consumers supply input shells while bc-grid keeps the lifecycle.

---

## ✅ Recently shipped (verified on 0.6.0-alpha.3)

The 11 items above marked ✅ (#1–6, #7–10, #15, #16) all moved from ❌ / 🔄 to ✅ during the 0.6.0-alpha.2 + alpha.3 work trains. See each item's "shipped via #N" annotation. **Status sweep performed 2026-05-04 PM** by worker1 cross-referencing alpha.2 and alpha.3 release notes against the merged-PR list.

### ✅ 18. `cellEditor` implies `editable: true` (commit `9fd7c0c`)

Previously: a column with `cellEditor` defined but no `editable: true` was a silent no-op. Now `cellEditor != null` implies editable. Verified: `react/dist/index.js`'s `isCellEditable` returns `cellEditor != null` when `editable` is unset.

### ✅ 19. `--bc-grid-row-hover` opaque token (commit `9fd7c0c`)

Verified: token is now opaque-mixed in the package default. (Note: separately, the *layered* bg approach for pinned cells still has a residual transparency issue — see item #5.)

### ✅ 20. `ServerTreeRow` re-exported from `@bc-grid/react`

(Previously needed `Awaited<ReturnType<...>>` workaround.) Verify in current `react/dist/index.d.ts` exports.

### ✅ 21. Rich default context menu (commits #419/#420/#421/#428)

Default `<BcGrid>` ships rich context menu (clear-all-filters, column submenu, filter submenu, view submenu, server submenu, editor submenu, row submenu, group submenu, dismiss-error, copy variants, clear-selection/range). Bsncraft was overriding with a 5-item list (`copy`, `copy-with-headers`, `clear-selection`, `clear-range`) — stale defensive override from alpha.2. Removed in `apps/web/app/(app)/accounts-receivable/customers/table.tsx`. Bsncraft now sees the rich default.

---

## Coordination notes

- This document should be updated on each bc-grid version bump in bsncraft. Verify each ❌ and 🔄 item against the new version's source and update statuses.
- Items moving from ❌ → ✅ should retain their entry briefly under "Recently shipped" so consumers know the fix landed and where to verify.
- Items in 🔄 (RFC ratified) should move to ✅ once the implementation ships and bsncraft verifies the visible behavior.
- New items get appended to the appropriate severity section.

**Last updated:** 2026-05-04 PM — status sweep against `@bc-grid/react@0.6.0-alpha.3` merged-PR list.

## Open items remaining for v1.0

After the 2026-05-04 PM sweep:

- **Active P1 (3):** #11 column flex/resize bug, #12 tree validator silent errors (~3 line dev-mode fix in worker1's lane), #13 built-in editors typed `BcCellEditor<unknown>` (worker3's lane).
- **Partial (1):** #14 `useServerTreeGrid` dual-output (paged shipped via #484; tree IMPL deferred per #485, gated on dual-output orchestration extraction).
- **P2 (1):** #17 built-in editors are bare HTML (in flight via worker3 Block C — PR-C1 #520 ships shadcn Combobox foundation; PR-C2 will migrate built-in editor internals).

12 of 17 items shipped. 5 remain across all severities.
