# Layout Architecture Pass RFC

**Status:** Draft for consumer-testing feedback (autonomous merge authorised; this RFC documents design + open questions, it does not gate ship)
**Author:** coordinator (Claude)
**Reviewer:** maintainer (JohnC)
**Target release:** v0.6.0
**Implementation lanes:** worker1 (PR a — structural), worker2 (PR b — detail panel), worker3 (PR c — cleanup + editor portal)
**Informed by:** `docs/design.md §4.2 / §4.3` (virtualizer + render layer), `docs/design.md` decisions table 2026-04-29 (sticky positioning was always intended; "Pinned columns via `position: sticky`" at `:279`), commits `5341af3` (pinned-cell shading parity), `628949c` (DOM-rect editor positioning), `d7eddaf` (column-flex via `availableGridWidth` ResizeObserver), queue entry `v06-detail-panel-sticky-left` (`docs/queue.md:114`), `docs/design/in-cell-editor-mode-rfc.md`, `docs/design/server-mode-switch-rfc.md` (RFC tone references).

---

## 1. Problem statement

The 2026-05-03 bsncraft consumer review surfaced five layout memos. Four look like distinct bugs; one is queued. The maintainer's framing on the design call: "these might all be different symptoms of the same root — bc-grid's render layer using JS-driven coordinate calculations instead of native browser layout / sticky positioning. A coherent layout-architecture audit at v0.6 might close all of them." This RFC takes that framing and walks the codebase against it.

The five memos:

1. **Pinned-cell shading parity** — *shipped 5341af3*. Fix in `packages/theming/src/styles.css:846-908` layered an opaque `background-color: var(--bc-grid-pinned-bg)` base under `background-image: linear-gradient(<state-token>, <state-token>)` so pinned cells composite to byte-identical pixels with body across hover / focus / selected / active states.
2. **Sticky-left detail panel during horizontal scroll** — *queued v0.6 as `v06-detail-panel-sticky-left`* (`docs/queue.md:114`). Today the `<BcDetailPanelSlot>` mount at `grid.tsx:3121-3133` is positioned absolutely inside the canvas; horizontal master scroll drags it off-screen. Consumer wants `position: sticky; left: 0` + width measured against master `clientWidth`.
3. **Editor portal mispositioning when detail panels are expanded** — *band-aid shipped 628949c*. The fix at `grid.tsx:1673-1714` uses `getBoundingClientRect` instead of the virtualizer's cumulative offset math. Robust, but the `useMemo` carries `expansionState` as an invalidation-only dep (`grid.tsx:1713`, with the lint suppression at `:1672`). Every future positioning surface that shifts the editing cell must wire its own invalidation hint into this dep.
4. **Nested grid doesn't fill detail-panel width** — *shipped d7eddaf*. `column.flex` was a typed-but-dormant prop. Fix added a ResizeObserver-driven `availableGridWidth` state at `grid.tsx:381-395`, observed against `scrollerRef`, fed into `resolveColumns` at `grid.tsx:671-672` so flex columns can distribute spare space.
5. **Header lags body during fast horizontal scroll** — *open*. Body and header are separate scroll containers. `gridInternals.ts:785-806` defines `syncHeaderRowsScroll`, called from the body scroll handler at `grid.tsx:2207-2221`. Even with the `translate3d` GPU hint at `gridInternals.ts:771-773`, the header's `transform: translateX(-x)` is one render frame behind the body's native paint at fast trackpad input.

Three more JS-layout coordination sites that the maintainer's framing implicates:

- **`pinnedTransformValue`** (`gridInternals.ts:883-894`, used at `:651`): every pinned body cell receives a `translate3d(scrollLeft, 0, 0)` to counter the body's horizontal scroll. The browser's `position: sticky; left: 0` does this for free at the compositor level.
- **`pinnedLaneStyle`** (`gridInternals.ts:658-682`): pinned-lane wrappers hand-compute `left: Math.max(0, viewportWidth - width)` for right-pinned lanes. `position: sticky; right: 0` does this for free.
- **`headerScrollTransform`** (`gridInternals.ts:771-773`) + **`headerRowStyle`** (`:775-783`): every header row, group header row, and filter row receives the same JS-computed translate. Three separate stamps at `grid.tsx:2725, 2747, 2796`. Each one is a `data-bc-grid-scroll-sync="x"` site that `syncHeaderRowsScroll` re-stamps from the body's scroll handler.

The thesis: today's render layer reimplements native browser layout primitives in JS. The header viewport is an `overflow: hidden` sibling of the body scroller (`grid.tsx:2713-2816` for the header, `:2818-2823` for the body). They are visually one surface that the user perceives as scrolling together; structurally they are two scroll containers tied together by a JS scroll handler that runs on every `onScroll`. Pinned cells inside the body scroll horizontally with the canvas, then JS counters that translation. Pinned-lane wrappers are CSS-`sticky` (`gridInternals.ts:666`) — but only because the lane is *inside* the canvas; the cells inside the lane still receive a JS counter-translate because the per-cell positioning was originally written before the lane was made sticky and was never collapsed.

The browser layout engine has three primitives that close all five memos:

- **Single scroll container** with `overflow: auto` instead of header-and-body-as-siblings-with-JS-sync. The viewport's native `scroll` event still feeds the virtualizer; nothing else needs to coordinate.
- **`position: sticky; top: 0`** for header rows. Compositor-level. No JS scroll handler. Survives fast-scroll input because there is no synchronization point that can drift.
- **`position: sticky; left: 0` / `right: 0`** for pinned cells. Same primitive; compositor pins them to the viewport's left/right edge while the canvas scrolls beneath.

The trade: virtualization still needs JS (which rows render is a function of scrollTop, not browser layout). But virtualization + sticky-positioned chrome is the modern grid pattern — MUI Data Grid v6 (2024 sticky-header rewrite, public docs and changelog), AG Grid since v28 (`position: sticky` for pinned rows/columns, public docs), Notion / Airtable / Linear's table views. bc-grid would join the modern grid architecture instead of carrying its own JS-driven scroll-sync legacy. The 2026-04-29 design.md decision row at `:537` already names `bc-grid-cell-pinned-left` / `-right` as the canonical pinned class, and design.md `:279` already says "Pinned columns via `position: sticky`". The render layer drifted from this intent during `react-impl-v0`; this RFC realigns it.

## 2. Scope and non-goals

**In scope (v0.6.0):**

- DOM rewrite: collapse the header viewport (`grid.tsx:2713-2816`) and the body scroller (`grid.tsx:2818-2823`) into a single `overflow: auto` viewport whose canvas contains all rows (header rows, body rows, detail panels).
- `position: sticky; top: 0` for the header rows. The three header rows (group, leaf, filter) and their cells live inside the same scroll container as the body and pin to the viewport top via CSS.
- `position: sticky; left: 0` / `right: 0` for left/right-pinned cells (and their header-row counterparts).
- Top-left intersection: when a pinned cell is in a sticky header row, both stickies compose. The cell pins to top-and-left without per-cell coordination — CSS handles the intersection. Z-index ordering (§5) is the only thing that needs care.
- `<BcDetailPanelSlot>` becomes `position: sticky; left: 0` with `width: 100%` of the canvas's visible viewport — composes with the body's sticky-top header automatically.
- Deletion of the JS scroll-sync code paths: `headerScrollTransform`, `pinnedTransformValue`, `headerViewportStyle`, `autoHeightHeaderViewportStyle`, `headerRowStyle`, `syncHeaderRowsScroll`, `pinnedLaneStyle`, the per-cell `transform` in `cellStyle` (`gridInternals.ts:651`), and the body scroll handler's `syncHeaderRowsScroll` call (`grid.tsx:2212-2217`). All are internal helpers, none are in the api-surface manifest (verified — `grep` against `tools/api-surface/src/manifest.ts` returns no hits).
- Deletion of the `availableGridWidth` ResizeObserver from `grid.tsx:381-395`. The viewport's `clientWidth` is the source of truth for flex column distribution, and the existing `useViewportSync` ResizeObserver (`gridInternals.ts:1247-1294`) already observes `scrollerRef` and reports `clientWidth` into `viewport.width`. Consolidate.
- Deletion of `expansionState` as an invalidation-only dep on `editorCellRect` (`grid.tsx:1713`). Sticky-positioned cells have a stable DOM position; the rect is correct without re-invalidation when detail panels above the editing row toggle.

**Out of scope:**

- Virtualizer changes. The `Virtualizer` class (`packages/virtualizer/src/virtualizer.ts`) keeps its existing API: `setScrollTop` / `setScrollLeft` / `setViewport` / `computeWindow` / `colWidth` / `rowOffset` / `colOffset`. Only the React adapter changes how it observes scroll position (the existing body `onScroll` handler at `grid.tsx:2207-2221` still feeds `setScrollTop` / `setScrollLeft`; only the `syncHeaderRowsScroll` call inside it goes away).
- Editing controller, editor protocol, `EditorPortal` mount semantics. The in-cell editor mode RFC (`docs/design/in-cell-editor-mode-rfc.md`) composes with this RFC naturally — when an editor is in-cell, it inherits the cell's sticky position automatically (no portal coordinate math).
- Pivot / aggregation rendering. Aggregation footer row at `grid.tsx:3177` keeps its current shape (it would benefit from being a `position: sticky; bottom: 0` row inside the viewport; tracking as a v0.7 follow-up).
- Per-cell DOM API changes. `data-bc-grid-cell-state`, `data-bc-grid-active-cell`, `data-column-id`, the cell `id` / `aria-*` shape — all unchanged.
- The `data-bc-grid-scroll-sync="x"` attribute (`grid.tsx:2723, 2745, 2794`). Removed at the same time as the JS scroll-sync code; no consumer reaches for it (it is an internal selector for `syncHeaderRowsScroll`).
- Public API surface. `<BcGrid>`, `<BcServerGrid>`, all props, `apiRef`, exported components — all unchanged. CSS class names on chrome surfaces are preserved (consumer overrides keep working).

## 3. Architectural shape

Today's render graph (simplified to the layout-relevant structure):

```
<BcGrid> (rootStyle, position: relative)
  └── .bc-grid-toolbar
  └── .bc-grid-main
      └── .bc-grid-table
          ├── .bc-grid-header-viewport (overflow: hidden, position: relative)
          │   ├── .bc-grid-header-group-row × N (translate3d JS-driven)
          │   ├── .bc-grid-header (leaf row, translate3d JS-driven)
          │   │   └── header cells (pinned: extra translate3d counter)
          │   └── .bc-grid-filter-row (translate3d JS-driven)
          │
          └── .bc-grid-scroller (overflow: auto, owns body scroll)
              └── .bc-grid-canvas (position: relative, total dimensions)
                  ├── body rows (position: absolute, top: virtualizer offset)
                  │   ├── .bc-grid-pinned-lane-left (sticky-left wrapper)
                  │   │   └── pinned-left cells (translate3d JS counter)
                  │   ├── center cells (position: absolute)
                  │   └── .bc-grid-pinned-lane-right (sticky-left wrapper)
                  │       └── pinned-right cells (translate3d JS counter)
                  ├── detail panels (absolute-positioned)
                  └── range overlay
              └── <EditorPortal> (sibling of canvas, absolute-positioned via editorCellRect)
```

The two boxed scroll surfaces (`.bc-grid-header-viewport` and `.bc-grid-scroller`) are the structural problem. The body scroller's `onScroll` calls `virtualizer.setScrollLeft` / `setScrollTop` (correct) and then `syncHeaderRowsScroll` to push the body's `scrollLeft` into header rows' `transform: translateX` and into pinned cells' counter-`translate3d` (the JS-layout coordination the RFC deletes).

Proposed for v0.6:

```
<BcGrid> (rootStyle, position: relative)
  └── .bc-grid-toolbar
  └── .bc-grid-viewport (overflow: auto, owns ALL scroll)         ← single scroll container
      └── .bc-grid-canvas (position: relative, total dimensions)
          ├── header rows                                          ← position: sticky; top: 0
          │   ├── .bc-grid-header-group-row × N
          │   ├── .bc-grid-header (leaf row)
          │   └── .bc-grid-filter-row
          │   (cells in pinned columns are                         ← position: sticky; left: 0 / right: 0
          │    BOTH sticky-top AND sticky-left; CSS               ← intersection: z-index higher than either axis
          │    composes the intersection automatically)
          ├── body rows (position: absolute, top: virtualizer offset)
          │   └── cells (pinned: position: sticky; left/right: 0)  ← compositor pins; no JS
          ├── detail panels (sticky: left: 0; width: 100% of canvas)
          ├── range overlay
          └── aggregation footer row (sticky: bottom: 0 — v0.7 follow-up)
      └── <EditorPortal> (still sibling; popup-mode editors only after in-cell RFC lands)
```

The single viewport handles BOTH horizontal and vertical scroll. Native sticky positioning handles header-stays-pinned-on-vertical-scroll AND pinned-columns-stay-pinned-on-horizontal-scroll AND detail-panel-stays-pinned-on-horizontal-scroll, all without any JS scroll handler. The body scroll handler's only remaining responsibility is to feed the virtualizer:

```ts
const handleScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
  const target = event.currentTarget
  virtualizer.setScrollTop(target.scrollTop)
  virtualizer.setScrollLeft(target.scrollLeft)
  updateScrollOffset({ top: target.scrollTop, left: target.scrollLeft })
}, [updateScrollOffset, virtualizer])
```

That is the entire `handleScroll` post-RFC. Compare to today's at `grid.tsx:2207-2221` — the `syncHeaderRowsScroll(rootRef.current, target.scrollLeft, virtualWindow.totalWidth, viewport.width)` call goes away, with all of its dependencies (`viewport.width`, `virtualWindow.totalWidth`).

Files that get rewritten:

- **`packages/react/src/grid.tsx`** — collapse `.bc-grid-header-viewport` + `.bc-grid-scroller` into `.bc-grid-viewport`. The header rows move *into* the canvas as sticky-top siblings of the body rows. Three `headerRowStyle(..., scrollOffset.left)` call sites (`:2725, 2747, 2796`) drop the `scrollOffset.left` arg; the rows use plain dimensional styles. The `pinnedLaneStyle` call sites at `:3019` and `:3085` keep the lane wrappers but the wrappers' job shrinks to grouping cells (the lane no longer needs to be sticky because the cells inside it are sticky individually — and the lane wrapper itself, being inside an absolute-positioned row, doesn't compose well with per-cell sticky). Recommend: drop the lane wrappers entirely; render pinned cells as siblings of center cells inside the row, each with its own sticky positioning. Net code: ~150 LOC removed, ~80 LOC added.
- **`packages/react/src/gridInternals.ts`** — delete `headerScrollTransform` (`:771-773`), `headerRowStyle` (`:775-783`) becomes a no-op (cell row keeps width / minWidth / position only), `syncHeaderRowsScroll` (`:785-806`), `headerViewportStyle` + `autoHeightHeaderViewportStyle` (`:757-769`), `pinnedLaneStyle` (`:658-682`), `pinnedTransformValue` (`:883-894`), and the `transform` line inside `cellStyle` (`:651`). Roughly 200 LOC of internal helpers + ~5 export lines removed. `scrollerStyle` (`:808-828`) gets renamed to `viewportStyle` and absorbs the page-flow vs. fixed-height branches it already handles.
- **`packages/theming/src/styles.css`** — adds `position: sticky; top: 0` rules to the three header row selectors (`.bc-grid-header`, `.bc-grid-header-group-row`, `.bc-grid-filter-row`) and `position: sticky; left: 0` / `right: 0` rules on `.bc-grid-cell-pinned-left` / `-right`. The existing pinned-cell shading at `:846-908` (background-color base + linear-gradient overlay) is preserved unchanged — sticky positioning is orthogonal to background composition. Adds a `z-index` cascade for the top-left intersection cells (§5).
- **`packages/react/src/headerCells.tsx`** — `scrollLeft`, `totalWidth`, `viewportWidth` props on `renderHeaderCell` / `renderColumnGroupHeaderCell` / `renderFilterCell` become unused. They drop from the call sites in `grid.tsx`; the receiving functions stop threading them into `cellStyle`. ~50 LOC simplification.
- **`packages/react/src/bodyCells.tsx`** — `scrollLeft`, `totalWidth`, `viewportWidth` props on `renderBodyCell` (`bodyCells.tsx:202`) become unused for non-range affordances. The `lanePinned` branch at `:206-207` collapses (no more lane wrapper). `cellStyle` receives `pinned` directly and the cell's own CSS class (`bc-grid-cell-pinned-left` / `-right`) applies the sticky positioning. ~30 LOC simplification.
- **`packages/virtualizer/src/virtualizer.ts`** — unchanged. `setScrollLeft` (`:229`) and `setScrollTop` (`:225`) keep their signatures; the React adapter still calls them from the body scroll handler. The virtualizer's window calculation (`computeWindow` at `:373-509`) is independent of where the rows end up in the DOM — it only cares about scroll position and viewport dimensions, both of which it already receives.

## 4. Closes which memos

| Memo | Status before RFC | How RFC closes it |
|---|---|---|
| 1. Pinned-cell shading parity | Shipped 5341af3 | Preserved unchanged. The layering pattern (background-color base + linear-gradient state overlay) lives on the cell selector at `theming/src/styles.css:857-908` and applies regardless of whether the cell uses `position: sticky` or `position: absolute` + `transform`. Sticky positioning is orthogonal to background composition. The state-tint test from the 5341af3 PR should pass unchanged. |
| 2. Sticky-left detail panel | Queued (`docs/queue.md:114`) | Closed structurally. Detail panel's wrapper sets `position: sticky; left: 0` inside the canvas; width is the visible canvas width via `width: 100%` on the sticky wrapper inside the row (the row itself spans `totalWidth`, so a child `width: 100%` doesn't help — the sticky wrapper instead uses `width: var(--bc-grid-viewport-width)` set as a CSS custom property by the `useViewportSync` observer, no per-detail-panel JS measurement). Pinned-left disclosure column ▶ alignment is preserved because both the disclosure cell and the detail panel anchor to `left: 0` in the viewport coordinate space. |
| 3. Editor portal mispositioning | Band-aid shipped 628949c | Closed structurally. With the in-cell editor mode RFC landing first (§8 — sequencing recommendation), the editor IS the cell — sticky-positioned with the cell, no portal coordinate math. For popup-mode editors (the in-cell RFC's opt-in for select / autocomplete / multi-select), the portal still uses `getBoundingClientRect` on the now-stably-positioned cell, which is robust because the cell's DOM position is determined by browser layout (sticky composition), not by `expansionState`-invalidated `useMemo` math. The `expansionState` dep on `editorCellRect` (`grid.tsx:1713`) drops; the lint suppression at `:1672` drops. |
| 4. Nested grid flex distribution | Shipped d7eddaf | Simplified. The flex algorithm in `resolveColumns` stays. The `availableGridWidth` state + ResizeObserver in `grid.tsx:381-395` becomes redundant — the single viewport's `clientWidth` IS the available width, observed by the existing `useViewportSync` ResizeObserver (`gridInternals.ts:1281-1285`). The `viewport.width` value (`gridInternals.ts:1268-1273`) feeds `resolveColumns` directly. Net: one ResizeObserver instead of two; one source of truth for viewport width; the `useMemo` at `grid.tsx:670-672` swaps `availableGridWidth` for `viewport.width`. |
| 5. Header horizontal scroll lag | Open | Closed structurally. No more JS scroll sync. Sticky-positioned headers are compositor-aligned with body cells in the same scroll container — header cannot lag because there is no synchronization point that can drift. Fast-scroll input paints header and body in lockstep at the compositor level. |

## 5. Z-index cascade for the sticky intersection

The four sticky surfaces stack in a defined order. Today's z-index map (`gridInternals.ts:654, 668, 757-769`) is:

- pinned cell body: 2 (`cellStyle :654`)
- pinned-lane wrapper: 3 (`pinnedLaneStyle :668`)
- header viewport: 3 (`headerViewportStyle :761`)
- auto-height header viewport: 4 (`autoHeightHeaderViewportStyle :768`)
- center cell body: 1 (`cellStyle :654`)
- range overlay: above cells (`bodyCells.tsx:350-364` and `BcRangeOverlay`)

Post-RFC z-index map, applied at the cell selector level via the theming CSS:

- center body cell: 1
- pinned body cell (left or right): 2 — sticky in the X axis only
- center header cell: 3 — sticky in the Y axis only
- pinned header cell (top-left / top-right intersection): 4 — sticky in BOTH axes; must paint above either single-axis sticky
- range overlay: 5 (unchanged relative ordering)
- detail panel sticky wrapper: 2 (same plane as pinned body cells; the detail panel does not need to paint above pinned cells)
- editor portal (popup mode): 6 (unchanged)
- toast / column menu / context menu: existing values; no change

The intersection rule is the only sharp edge: a top-left pinned header cell needs `z-index: 4`, not `2 + 3 = 5`. CSS doesn't add z-indices; the cell carries one literal value. The `.bc-grid-header .bc-grid-cell-pinned-left` selector already exists (`theming/src/styles.css:866`) and is the natural site for the intersection's z-index. Add a CSS rule:

```css
.bc-grid-header .bc-grid-cell-pinned-left,
.bc-grid-header .bc-grid-cell-pinned-right,
.bc-grid-header-group-row .bc-grid-cell-pinned-left,
.bc-grid-header-group-row .bc-grid-cell-pinned-right,
.bc-grid-filter-row .bc-grid-cell-pinned-left,
.bc-grid-filter-row .bc-grid-cell-pinned-right {
  position: sticky;
  z-index: 4;
}
```

## 6. Public API delta

Diff against `docs/api.md`. **Empty.** The RFC is a render-layer rewrite; no public surface changes.

Two specific internal-export deletions (none in `tools/api-surface/src/manifest.ts`):

- `headerScrollTransform`, `headerViewportStyle`, `autoHeightHeaderViewportStyle`, `headerRowStyle`, `syncHeaderRowsScroll`, `pinnedTransformValue`, `pinnedLaneStyle` from `gridInternals.ts` exports. They are framework internals exported for cross-module use within `@bc-grid/react`, not part of the public package surface.
- The `availableGridWidth` state from `grid.tsx:381-395`. Internal; never exposed.

CSS class names on chrome surfaces are preserved: `.bc-grid-header`, `.bc-grid-header-group-row`, `.bc-grid-filter-row`, `.bc-grid-row`, `.bc-grid-cell`, `.bc-grid-cell-pinned-left`, `.bc-grid-cell-pinned-right`, `.bc-grid-canvas`. Consumer style overrides keep working. Two new internal-purpose names (`.bc-grid-viewport` replaces `.bc-grid-scroller`; the legacy name kept as an alias on the same element for one release to absorb consumer overrides) — covered in §10 open question 2.

## 7. Performance

Sticky positioning is GPU-accelerated at the compositor level on Chromium, Firefox, and Safari. Removing JS scroll sync should *improve* horizontal scroll perf, not regress it. The fast-horizontal-scroll case (memo 5) is the obvious win — no per-frame JS work to push `transform: translateX` into header rows and counter-`translate3d` into pinned cells.

**Per-frame work removed during horizontal scroll:**

- One `syncHeaderRowsScroll` call: ~3 `querySelectorAll` calls (header rows + pinned-left header cells + pinned-right header cells) and N `style.transform = ...` writes per match.
- Header-row React renders: today's `headerRowStyle(..., scrollOffset.left)` re-runs every render because `scrollOffset.left` changes. With `position: sticky`, the row's style is constant.
- Per-pinned-cell React renders: `cellStyle({ ..., scrollLeft: scrollOffset.left, ... })` recomputes the `transform` value every render. With `position: sticky`, the cell's style is constant.

**Per-frame work removed during vertical scroll:** the `autoHeightHeaderViewportStyle` already uses `position: sticky` (`gridInternals.ts:766-768`) for auto-height grids, so the existing benchmark already measures the sticky path for that case. Fixed-height grids switch from `overflow: hidden` + JS coordination to `position: sticky` — the win is measurable but smaller (the body scroll's `onScroll` fires either way; what changes is what the handler does inside).

**Bundle size:** net negative. The seven internal helpers above sum to ~250 LOC; the new CSS rules add ~30 LOC; the JSX simplification trims ~100 LOC across `grid.tsx` / `headerCells.tsx` / `bodyCells.tsx`. Net: ~250 LOC of JS removed (gzipped impact small, but real).

**Smoke perf bar:** `apps/benchmarks/tests/perf.perf.pw.ts` exists for fixed-height grids. The horizontal-scroll case should land or improve. Recommend adding a new bench case alongside the rewrite: sustained 200px/frame horizontal scroll for 1 second, measure paint cadence and GC pauses. Bar: zero dropped frames at 60Hz on the perf-spike rig.

## 8. PR sequencing

Single coordinated PR is too risky given the cross-file blast radius. Three-PR split, sequenced linearly (b depends on a; c depends on a + b):

**(a) Structural DOM rewrite + sticky positioning (worker1).**

Single viewport, sticky-top headers, sticky-left/right pinned cells, top-left intersection z-index, deletion of `syncHeaderRowsScroll` + `headerScrollTransform` + `pinnedTransformValue` + `headerViewportStyle` + `autoHeightHeaderViewportStyle` + `pinnedLaneStyle` + the per-cell `transform` from `cellStyle`. The pinned-cell shading layering (`5341af3`) continues to work. Virtualization continues to work — the body scroll handler still feeds `setScrollLeft` / `setScrollTop` into the virtualizer, the virtualizer's `computeWindow` still drives which rows + cols render. Closes memo 5 (header lag) and memo 1 (pinned shading composition stays correct under new layout). ~600-900 LOC. The load-bearing PR.

worker1 is the right owner — they hold the most React layout context from the server-mode-switch RFC and the broadest Read access across `grid.tsx`. Coordinator is an alternate if worker1 is on a server-lane PR at the time.

**(b) Detail panel sticky-left (worker2).**

Once the viewport is single, the detail panel composes via `position: sticky; left: 0` with width tied to viewport `clientWidth`. Replaces the queued `v06-detail-panel-sticky-left` work (`docs/queue.md:114`); that queue entry's ~10-20 LOC consumer estimate becomes ~100-150 LOC because the implementation lands as a structural CSS change instead of a `position: sticky` veneer over the existing absolute-positioned slot. Closes memo 2. ~100-150 LOC. ~2-3 hours.

worker2 is the right owner — already queued for the consumer-flagged detail panel work; the chrome lane is theirs.

**(c) Cleanup + editor portal simplification + flex source-of-truth consolidation (worker3).**

Delete `availableGridWidth` from `grid.tsx:381-395`; consolidate flex source-of-truth onto `viewport.width` from `useViewportSync`. Simplify `editorCellRect` (`grid.tsx:1673-1714`): remove the `expansionState` dep, remove the lint suppression at `:1672`. Verify the popup-mode `EditorPortal` (post-in-cell-RFC scope) anchors correctly. Update `docs/design.md §4.2 / §4.3` to describe the new render graph; add a row to the design.md decisions table. Closes memo 3 (editor portal still uses DOM rect but the rect is now stable because cells are stably positioned) and memo 4 (flex distribution via single source of truth). ~200-300 LOC. ~4-6 hours.

worker3 is the right owner — the editor portal lives in their lane (in-cell editor RFC is theirs); the simplification fits naturally with the in-cell editor migration.

Total ~900-1350 LOC across three PRs. ~18-25 hours across three workers.

## 9. Test plan

Unit + Playwright. Workers write specs; coordinator runs Playwright at merge per `docs/AGENTS.md §6`.

**Unit tests (each PR ships with):**

- `gridInternals.test.ts` — assert that the deleted helpers are deleted (a regression guard against accidental reintroduction). Trivial; one assertion per export.
- `cellStyle` — assert no `transform` field in the returned style when `pinned: "left"` / `"right"`. Today's tests pass `pinned`; update them to assert sticky-classname presence on the cell instead.
- `useViewportSync` — assert that `viewport.width` updates when the underlying scroller's `clientWidth` changes (existing test; ensure it still holds with the renamed `.bc-grid-viewport`).

**Playwright specs (one happy-path per memo, plus the intersection guard):**

- `tests/horizontal-scroll-alignment.pw.ts` (memo 5, new) — fast horizontal scroll input via `wheel` events at 200px/frame for 1s, screenshot the header strip and assert column edges align with body cell edges to within 1px on every frame sampled at 60Hz.
- `tests/vertical-scroll-header-pinning.pw.ts` (existing, should pass unchanged) — vertical scroll, assert header row stays fixed at `top: 0` of the viewport.
- `tests/pinned-column-shading.pw.ts` (existing from `5341af3`) — pinned cell hover / focused / selected / active states composite to byte-identical pixels with body. Should pass unchanged.
- `tests/detail-panel-sticky-left.pw.ts` (memo 2, new) — horizontal master scroll, assert detail panel stays anchored at `left: 0` of the viewport, content width unchanged. Acceptance criteria from `docs/queue.md:114`.
- `tests/editor-portal-with-detail-panels.pw.ts` (memo 3, existing or tightened) — expand detail panels above the editing row, assert the editor stays positioned over its cell. Should pass unchanged or tighter.
- `tests/flex-column-distribution.pw.ts` (memo 4, existing from `d7eddaf`) — nested grid in a detail panel fills the panel width via flex columns. Should pass unchanged.
- `tests/forced-colors-pinned.pw.ts` (existing) — forced-colors mode pinned column rendering keeps the existing fallbacks (`Canvas` / `Highlight` / `HighlightText`).
- `tests/sticky-intersection-z-index.pw.ts` (new) — both vertical and horizontal scroll active, assert the top-left pinned header cell paints above either single-axis sticky (visual: take a screenshot at the intersection corner; assert the pinned-header cell's text is fully readable, no center cell or pinned body cell visible behind it).

**Visual regression baselines.** 1-2 Playwright screenshot baselines for the chrome layout (header + first three rows + pinned column + a detail panel) to catch unintended pixel-level drift. Coordinator updates baselines at merge.

**Perf:** the new horizontal-scroll bench case from §7. Coordinator runs at merge of PR (a).

## 10. Open questions for consumer-testing feedback loop

1. **Hard-delete vs. one-release deprecation.** `headerScrollTransform`, `pinnedTransformValue`, `headerViewportStyle`, `pinnedLaneStyle` are not in the api-surface manifest, so no public consumer should depend on them. Recommendation: hard-delete; consumers who reach for internals are off-contract and absorb the churn. Open: any internal bsncraft import to verify? (Quick `grep` on the consumer side at merge.)
2. **Class-name alias `.bc-grid-scroller` → `.bc-grid-viewport`.** The class is documented in the existing theming overrides surface. Recommendation: keep `.bc-grid-scroller` as an alias on the same element for v0.6 only, drop in v0.7. The class is purely a styling hook — the structural element is the same `<div ref={scrollerRef}>`.
3. **Forced-colors mode interaction with `position: sticky`.** No known browser bug; sticky positioning is rendering-engine-level and forced-colors is paint-level, so they compose. Recommend a Playwright spec under forced-colors anyway (the spec from §9 covers this).
4. **iOS Safari sticky positioning bugs.** The notorious `<thead>` sticky bug doesn't apply — bc-grid uses `<div>` chrome. The other historical Safari sticky bug (sticky elements inside scrolling containers with `transform` on an ancestor breaking) needs a verification pass: the `rootStyle` (`gridInternals.ts:684-704`) sets `position: relative` on the root; no ancestor transform in the bc-grid tree. Consumer apps that wrap the grid in a transformed ancestor (CSS animations, drawer slide-ins) may see issues — recommend documenting this caveat in the migration notes.
5. **Legacy mode toggle for one release.** Whether to keep the JS scroll-sync code paths behind a `legacy: true` opt-in for one release in case a consumer's chrome customization depends on the JS-driven coordinate hooks. Recommendation: NO. Clean delete. Consumers who want pixel-tracked scroll position can subscribe to the viewport's `scroll` event directly via the existing `apiRef` (or a new `onViewportScroll` prop if a consumer asks; v0.7 follow-up if needed).
6. **Sequencing with the in-cell editor mode RFC.** Layout RFC PR (a) lands first so the in-cell editor inherits a stable cell-positioning foundation. The in-cell RFC's PR (a) builds on top of this RFC's PR (a). Both can land in v0.6.0; the dependency is one-way. Recommendation: this RFC's PR (a) → this RFC's PR (b) → in-cell RFC's PR (a) (which can run in parallel with this RFC's PR (c)) → this RFC's PR (c) → in-cell RFC's PRs (b) + (c).
7. **Aggregation footer row sticky-bottom.** Out of scope for this RFC but a natural follow-up. The footer row at `grid.tsx:3177` becomes a `position: sticky; bottom: 0` row inside the same viewport. Track as v0.7 queue entry.

## 11. Estimated scope

| PR | LOC | Effort | Owner |
|---|---|---|---|
| (a) Structural DOM rewrite + sticky positioning | ~600-900 | 12-16h | worker1 |
| (b) Detail panel sticky-left | ~100-150 | ~2-3h | worker2 (replaces queued `v06-detail-panel-sticky-left`) |
| (c) Cleanup + editor portal simplification + flex consolidation + design.md | ~200-300 | ~4-6h | worker3 |

Total ~900-1350 LOC across three PRs, ~18-25 hours across three workers, well-sequenced. Each PR is independently reviewable.

---

**This RFC documents the design and the open questions for the consumer-testing feedback loop. Implementation may proceed under the maintainer's autonomous-decisions authorisation; the RFC's job is to record the shape so worker1 / worker2 / worker3 + bsncraft can validate against it.**
