# Virtualizer Spike v2 — Report

**Status:** ✅ MEASURED PASS — perf bar met with pinned panes, ARIA, variable heights, and focus retention
**Owner:** c1 (Claude)
**Branch:** `agent/c1/virtualizer-spike-v2`
**PR:** #9
**Bars validated:** `design.md §3.2` smoke + nightly scroll-FPS bar

---

## Headline result

| Scenario | Median FPS (4 middle samples of 6s auto-scroll) | Bar | Verdict |
|---|---|---|---|
| 100k × 30, 2 pinned-L + 1 pinned-R, uniform 32px rows | **60** (samples: `[60, 60, 60, 60, 60, 60]`) | ≥58 | ✅ pass |
| 100k × 30, same pins, **variable row heights** (mixed 24 / 32 / 56px) | **61** (samples: `[61, 61, 60, 61, 60, 60]`) | ≥58 | ✅ pass |

Hardware: 2024 M-series Mac, headless Chromium 1217 via Playwright.

The numbers are stable — every 1-second sample of the 6-second auto-scroll lands in the 60–61 range, including the variable-height case which exercises the cumulative-offset cache rebuilds on a non-uniform dataset.

## What landed

The spike consists of three pieces:

### 1. `@bc-grid/virtualizer` — framework-agnostic windowing engine

- `Virtualizer` class (`packages/virtualizer/src/virtualizer.ts`):
  - Cumulative-offset cache (`O(N)` build, `O(log N)` lookup via binary search on the offsets array — see `binarySearchOffset`).
  - Variable row heights / col widths via sparse `Map<index, size>` overlays on a default — set sizes mark the cache dirty, lazy rebuild on next query.
  - Retained rows / cols (`retainRow`, `retainCol`) for focus + animation handoff per `accessibility-rfc §Virtualization Contract`.
  - Pinned regions (left, right, top, bottom) — pinned items always appear in `computeWindow()` output regardless of scroll position.
  - `scrollOffsetForRow / scrollOffsetForCol` with `start | center | end | nearest` align modes. **Always clamps to `[0, total - viewport]`** so callers can apply the result directly. Out-of-range indexes return the current scroll position unchanged.

- `DOMRenderer` class (`packages/virtualizer/src/dom-renderer.ts`):
  - Renders each row as `<div role="row" aria-rowindex="N+1">` (1-based per ARIA) inside `.bc-grid-canvas`.
  - Body cells use `position: absolute` with `left: <colOffset>`. Row containers use `transform: translate3d(0, <rowOffset>, 0)` for GPU compositing on vertical scroll.
  - **Pinned-left cells use `position: sticky; left: 0`** within the row. Because the row is `width: 100%` of the canvas (which is `totalWidth`), sticky cells stay glued to the scroller's left viewport edge during horizontal scroll.
  - **Pinned-right cells use `position: sticky` with `right: <totalWidth - col.left - col.width>px`**. Same mechanism, opposite edge. The CSS classes `.bc-grid-cell-pinned-left` / `.bc-grid-cell-pinned-right` carry the visual treatment (background, divider shadow).
  - Row + cell node recycling via free-lists. Cells removed from the window are parked off-canvas and reused on the next render.
  - Sets `aria-rowcount` and `aria-colcount` on the grid root.

- 22 unit tests (`packages/virtualizer/tests/virtualizer.test.ts`): geometry, windowing with overscan, scroll alignment in all modes, pinned regions, **scroll-offset clamping at every edge case** (negative-clamped to 0, over-max-clamped to `total - viewport`, out-of-range index returns current scroll, total < viewport returns 0). All pass.

### 2. `@bc-grid/app-benchmarks` — the spike harness

`apps/benchmarks/` — Vite-served HTML page that mounts `DOMRenderer` with configurable inputs:
- Rows / cols (default 100k × 30)
- Pinned-left / pinned-right column counts (defaults: 2 / 1)
- Variable-height toggle (deterministic non-uniform pattern: every 7th row = 56px, every 13th = 24px, others = 32px)
- Auto-scroll (FPS test): ping-pong scroll between top and bottom over 6s
- Manual scroll-to-end / scroll-to-middle

Keyboard-driven active-cell movement: ArrowUp/Down/Left/Right, PageUp/Down, Home/End. The harness:
1. Tracks an `activeRow` / `activeCol`.
2. Calls `virtualizer.retainRow(activeRow, true)` for the active row and releases the previous one — keeps the retention budget at 1, well within the 2-row budget from `accessibility-rfc`.
3. Calls `renderer.scrollToCell(activeRow, activeCol, "nearest")` so the active cell stays in view.
4. Re-applies an `is-active` class to the active cell on every render so the highlight survives recycling.

FPS sample buffer is exposed at `globalThis.__fps__` for headless test access. The page accepts `?autorun=fps` to start auto-scroll on first paint, signalling completion via `globalThis.__autoScrollDone__`.

### 3. Playwright tests — `apps/benchmarks/tests/fps.spec.ts`

Six tests, all running in Chromium via `playwright.config.ts` at the repo root:

1. **Scroll FPS at 100k × 30 (with pinned cols) ≥ 58 median.** Headline.
2. **Variable-height mode FPS ≥ 58 median.** Validates that cumulative-offset rebuilds don't regress the bar.
3. **`aria-rowcount` + `aria-colcount` on grid root.** Per `accessibility-rfc §ARIA contract`.
4. **`aria-rowindex` + `aria-colindex` on rendered rows / cells.** Per same contract.
5. **Pinned-left cells stay visible after horizontal scroll.** Asserts the bounding box of a pinned-left cell shifts by < 5px after a 1500px horizontal scroll — i.e. the sticky positioning works.
6. **Focus retention.** Drives keyboard arrows to row 50, then scrolls the body 50,000px down (~1500 rows). Asserts that `.bc-grid-row[data-row-index="50"]` is still in the DOM and still carries the `.is-active` highlight.

Run with `bunx playwright test`. CI will pick this up once a workflow step is added (separate task).

## How to run locally

```bash
cd ~/work/bcg-worker2  # or wherever you've checked out the branch
bun install
bun run --filter '@bc-grid/virtualizer' build
bun run --filter '@bc-grid/app-benchmarks' dev   # http://localhost:5174
# In another terminal, the Playwright suite:
bunx playwright test
```

## Codex review (PR #9) — disposition

Codex's review flagged 3× P1 + 1× P2 against the original spike submission. All have been addressed in this revision:

| Finding | Status | What changed |
|---|---|---|
| **P1** — Spike claimed unblock-of-virtualizer-impl but acceptance items not validated | ✅ resolved | This report now records measured FPS for both uniform and variable-height runs, exercises pinned panes, and validates focus retention via Playwright. |
| **P1.2** — Pinned cols rendered in same canvas as body, would scroll out | ✅ resolved | `DOMRenderer` now uses `position: sticky` on pinned cells; pinned-left cells stay at the scroller's left edge under horizontal scroll (Playwright test 5 confirms). |
| **P1.3** — Missing `aria-rowindex` / `aria-colindex`, no row containers | ✅ resolved | Each row is now `<div role="row" aria-rowindex>`; each cell carries `aria-colindex`; grid root carries `aria-rowcount` + `aria-colcount` (Playwright tests 3 + 4 confirm). |
| **P2** — `scrollOffsetForRow/Col` could return negative or > max | ✅ resolved | Both methods now clamp to `[0, total - viewport]` and return the current scroll position for out-of-range indexes. New unit tests cover first-row / last-row / first-col / last-col with all align modes plus the total < viewport case. |

## What this spike does not validate

- **Memory bar (`< 30MB grid overhead`).** Out of scope for the smoke spike — the nightly bar measures heap diff with vs without grid mounted, and that needs a different harness (heap snapshots through CDP). Tracked as a follow-up under `nightly-perf-harness` (Q1 doc work, separate task).
- **Real bc-next data shape.** Synthetic `R-{padded index}` strings are width-uniform monospace; real ERP cells have mixed types and widths. The Q1 vertical slice (`q1-vertical-slice-demo`) is the right gate for this — the spike just proves the engine isn't the bottleneck.
- **Pinned-row rendering.** The `Virtualizer` engine returns pinned-top / pinned-bottom rows correctly, and unit tests cover them. The `DOMRenderer` doesn't yet split them into separate sticky regions — the spike scope was pinned columns only (per `queue.md` task spec). Pinned rows land with `virtualizer-impl`.
- **Browser breadth.** Tests run in Chromium only. Firefox + Safari smoke is a Q1 follow-up.

## Risks for `virtualizer-impl`

These survived from the original spike report and remain valid for the production implementation:

- **Cumulative-offset O(N) rebuilds.** Currently triggered by any size change. With frequent measurements (e.g., dynamic auto-row-height), this could dominate render cost. Plan: switch to a fenwick tree (O(log N) update + query) when measurements show this in the hot path. The variable-height Playwright test passes 60 FPS today, so the bar isn't urgent — but the algorithm is the obvious next optimization.
- **Sticky positioning composes with `transform` differently than absolute.** The sticky pinned cells lose the `translate3d` GPU-layer hint that body cells have. At the spike's pinned counts (2-3) this is invisible, but `virtualizer-impl` should benchmark grids with 5+ pinned cols to make sure sticky cells aren't a layer-promotion regression.
- **Cell node recycling vs animation handoff.** The free-list pops nodes for reuse; an in-flight animation expecting a stable node would break. The retained-row API covers focus today; animations need a parallel "in-flight" retention set in `virtualizer-impl`.
- **`ResizeObserver` triggers full re-render.** Continuous drag-resize would scale linearly with cell count. Throttle to RAF in production.

## Verdict

✅ **Architecture validated. Unblock `virtualizer-impl`.**

The smoke + variable-height + ARIA + pinned-pane + focus-retention contracts are all met under measurement, not analysis. The DOM-renderer pattern (rows-as-containers + sticky pinned cells + GPU-composited row transforms + cell free-list) is the right shape for the production virtualizer; `virtualizer-impl` is now scoped to hardening it (better cache structure, in-flight retention, browser-breadth, memory bar) rather than re-architecting it.
