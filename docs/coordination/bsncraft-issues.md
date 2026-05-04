# bsncraft consumer issues — open as of `@bc-grid/react@0.6.0-alpha.2`

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

### ❌ 1. Pinned-right column renders on left

**Bsncraft repro:** `apps/web/components/edit-grid.tsx` adds `__bc_actions` column with `pinned: "right"`. Renders on the LEFT of the row (overlapping `__bc_detail`).

**Source notes:**
- `theming/dist/styles.css` has a comment block citing the bsncraft P0 and a stated fix: `.bc-grid-pinned-lane-right { grid-column: -2 / -1; }`. Fix shipped 0.6.0-alpha.1 but does not reach consumer-defined columns.
- `react/dist/index.js`: `virtualWindow.cols.filter((col) => col.pinned === "right")` is the gate. Auto-injected `__bc_actions` from `BcEditGrid` works; consumer-supplied `pinned: "right"` doesn't.

**Likely cause:** `pinned` value being lost between consumer column → `resolvedColumns` → `virtualWindow.cols`, OR `--bc-grid-columns` track count insufficient for `grid-column: -2 / -1`.

**Diagnostic:** at the right-lane render branch, log `virtualWindow.cols.map(c => ({ id: c.id, pinned: c.pinned }))` while bsncraft has `pinned: "right"` on a column. If the consumer column shows `pinned: undefined` here, the value is being stripped during column resolution.

---

### ❌ 2. Tree-mode group rows render as data rows

**Bsncraft repro:** `<BcServerGrid rowModel="tree">` with `loadChildren` returning `kind: "group"` rows. Group rows render with empty cells in body columns; only the group value shows in one column. No count, no full-width group header. Should route through `renderGroupRowCell` for ag-grid-style group rendering.

**Source notes:**
- `@bc-grid/server-row-model/dist/index.js` correctly preserves `kind` on TreeNodes (lines 917, 923, 944).
- `@bc-grid/react/dist/index.js` strips it:
  ```js
  flatNodes = useMemo(() => modelRef.current.flattenTreeSnapshot(tree, expansionState), ...);
  rows = flatNodes.map((node) => node.row);
  ```
  Only `node.row` (raw data) is forwarded. `kind`, `groupKey`, `level`, `childCount` discarded.
- Render-loop check at `index.js:10256` (`if (!isDataRowEntry(entry))` → `entry.kind === "data"`) then evaluates true for all entries.

**Fix:** map `flatNodes` to entry objects directly:
```js
rows = flatNodes.map((node) => ({
  kind: node.kind,
  rowId: node.rowId,
  level: node.level,
  label: deriveGroupLabel(node.groupKey),  // groupKey → "value (count)"
  row: node.row,
}));
```
Or store metadata on a sibling map keyed by `rowId` that the entry constructor consults.

---

### ❌ 3. Edit mode broken — input invisible, hotkeys leak, row data flashes

**Bsncraft repro:** `<BcServerGrid rowModel="paged">` with `cellEditor: textEditor` (popup: false, in-cell). Double-click on an editable cell:
- No visible input
- Adjacent rows' data flashes into the focused row briefly
- Global app hotkeys (`f`, `s`, `r` bound at bsncraft level) fire while user types — `isEditableKeyTarget` should gate them, so either focus isn't on input or input never mounted

**Source notes (no obvious cause):**
- `textEditor.popup` is `false` (`packages/editors/src/text.tsx`).
- `isCellEditable` correctly returns `true` when `cellEditor` is set (post-`9fd7c0c`).
- Default `editorActivation` is `"double-click"`.
- `renderInCellEditor` returns `<EditorMount mountStyle="in-cell">` when cell is active edit target.

**Possible causes to investigate:**
- `<BcServerGrid rowModel="paged">` not propagating edit state to inner `<BcGrid>` (different code path than `<BcEditGrid>`).
- `<EditorMount>` mounts but input doesn't gain focus — `focusRef` race.
- Edit mode entering then immediately exiting (causes the flash).
- Commit `cbb65fd feat(react): editor keyboard navigation polish` (in 0.5.0) touched activation — possible regression.

**Severity:** P0 — blocks bsncraft shipping in-grid editing on master tables.

---

## P1 — Visible polish bugs

### ❌ 4. Master row hover cascades into nested grid in detail panel

**Repro:** `<BcGrid renderDetailPanel>` containing a nested `<BcGrid>`. Cursor on master row → master row's `:hover` matches because cursor is on a descendant (the nested grid is inside the master row's DOM tree). `.bc-grid-row:hover .bc-grid-cell` then matches every descendant cell, including child grid cells. Whole nested grid gets the hover tint.

**Fix:** scope row-state CSS to non-nested cells. Either `.bc-grid-row:hover > .bc-grid-cell` (direct child) or `.bc-grid-row:hover .bc-grid-cell:not(.bc-grid .bc-grid-cell)` (not in nested grid).

---

### ❌ 5. `--bc-grid-row-hover` transparency leaks through pinned cell layering

Token: `--bc-grid-row-hover: color-mix(in srgb, var(--accent) 70%, transparent)` (~30% alpha).

The alpha.2 layered-bg fix produces byte-identical pixels for opaque tokens, but `--bc-grid-row-hover` carries alpha. Body cells composite over the row's underlying bg (same color → invisible). Pinned cells composite over `--bc-grid-pinned-bg` (different color → visible 3-4% shade difference in hover and selected+hover states).

**Fix:** make the token opaque: `color-mix(in srgb, var(--accent) 70%, var(--bc-grid-bg))`. Same perceived color, no alpha.

---

### ❌ 6. Scroll-shadow gradient overlays row state colors

`.bc-grid-cell-pinned-left-edge::after` and `.bc-grid-cell-pinned-right-edge::before` paint `linear-gradient(... var(--bc-grid-pinned-boundary), transparent)` when grid is horizontally scrolled. Sits on top of the row's bg color, creating perceived darkness in the pinned area regardless of state-color match.

**Fix:** scroll-shadow should respond to scroll motion / cursor proximity, or paint *outside* the pinned cell so it doesn't overlay state colors.

---

### 🔄 7. Editor portal mispositions when detail panels are expanded

`editorCellRect` math uses `defaultRowHeight` and doesn't account for variable-height detail panel rows above the target. Editor portal renders at wrong screen Y.

**Status:** in v0.6 layout-architecture-pass RFC. Verify shipped status when 0.6.0 GA cuts.

---

### 🔄 8. Nested grid in detail panel doesn't fill panel width

Flex columns don't redistribute when the grid is mounted inside a detail panel — column-flex math gets an early/initial measurement, not actual container width. Hover bg paints only to last column edge, leaving empty space.

**Status:** in v0.6 RFC.

---

### 🔄 9. Header lags body during fast horizontal scroll

JS-driven scroll-sync between separate scroll containers produces 1-frame lag visible on fast trackpad input.

**Status:** in v0.6 RFC — fix is single scroll container with `position: sticky` headers.

---

### 🔄 10. Detail panel content cuts off during horizontal scroll

Detail panel inside master scroll viewport scrolls horizontally with master; nested grid's content has finite width, panel's right edge shows empty space when scrolled.

**Status:** in v0.6 RFC — sticky-left detail panel.

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

### ❌ 14. `useServerTreeGrid` only emits `BcServerTreeProps` (no plain `<BcGrid>` binding)

Hook output is `Omit<BcServerTreeProps<TRow>, "columns">`. Consumers wrapping a plain `<BcGrid>` with their own row-source plumbing can't use the hook without switching to `<BcServerGrid rowModel="tree">`. Same gap as `useServerPagedGrid` and `useServerInfiniteGrid`.

**Fix:** dual output — `bound` for plain `<BcGrid>` (data array + controlled callbacks), `serverProps` for `<BcServerGrid>`. Coordinator already estimated ~1 day during the v0.5-alpha.1 review.

---

### ❌ 15. `ServerMutationResult.row` shape isn't documented

After accepted mutations, host returns `{ status: "accepted", row: <something> }`. Multiple plausible shapes (full canonical row vs partial patch vs only changed fields populated) all pass the validator and bc-grid merges. Different consumers will land on different conventions.

**Fix:** doc clarification on the type — full canonical row, replacement semantics. ~1 line of JSDoc.

---

### ❌ 16. Actions column should be available on all grid types, not just `<BcEditGrid>`

`onEdit` / `onDelete` / `extraActions` / `hideActions` / `canEdit` / `canDelete` / `onDiscardRowEdits` / `confirmDelete` / `editLabel` / `deleteLabel` / `DeleteIcon` are only on `BcEditGridProps`. None of these props are on `BcServerPagedProps` / `BcServerInfiniteProps` / `BcServerTreeProps`.

Consumers using server data sources (every ERP master table) have to hand-roll an actions column. bsncraft does this in `apps/web/components/edit-grid.tsx` — duplicates `createActionsColumn` logic.

**Fix options:**
- **A. Add the prop set to all `BcServer*Props` types** and have `<BcServerGrid>` auto-inject `__bc_actions` the same way `<BcEditGrid>` does. Most discoverable for consumers.
- **B. Extract `createActionsColumn` into a hook** (`useActionsColumn`) that any consumer can apply to any grid. More flexible.

**A is the more architectural answer.** Server grids and edit grids both have rows that benefit from edit/delete actions; the actions column is conceptually a feature of the grid, not a feature consumers should hand-apply.

---

## P2 — Polish

### ❌ 17. Built-in editors are bare HTML

`textEditor` / `selectEditor` / etc. render `<input>` / `<select>` with default browser styling. Visually inconsistent with shadcn-native host apps. For a grid that's "the main way users edit data" (bsncraft framing), this matters.

**Fix:** companion `@bc-grid/editors-shadcn` package importing host shadcn primitives, or render-prop hook that lets consumers supply input shells while bc-grid keeps the lifecycle.

---

## ✅ Recently shipped (verified on 0.6.0-alpha.1)

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

**Last updated:** 2026-05-04 (verified against `@bc-grid/react@0.6.0-alpha.1`)
