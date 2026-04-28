# Virtualizer Spike v2 — Report

**Status:** Spike infrastructure landed; perf measurement pending hands-on run
**Owner:** c1 (Claude)
**Branch:** `agent/c1/virtualizer-spike-v2`
**Bars to validate:** `design.md §3.2`

---

## What landed

The spike consists of:

1. **`@bc-grid/virtualizer`** — the framework-agnostic windowing engine.
   - `Virtualizer` class: scroll-position math, cumulative-offset cache (binary search for `rowAtOffset`), retained-row/col API, pinned-row/col regions, `scrollOffsetForRow/Col` with align modes (start / center / end / nearest).
   - `DOMRenderer` class: pure-DOM consumer that mounts to a host element, RAF-throttles scroll-driven re-renders, recycles cell DOM nodes via a free-list, sets `transform: translate3d(...)` for cell positioning to encourage GPU compositing.
   - Pinned regions, variable row heights (sparse cache + lazy cumulative recompute), retained-item set are all exercised through unit tests.
   - 15 unit tests covering geometry, windowing, scroll alignment, pinned regions. All pass.

2. **`@bc-grid/app-benchmarks`** — the spike harness.
   - Vite-served HTML page that mounts the virtualizer with configurable row/col counts.
   - FPS meter (1s rolling window, RAF-driven).
   - Cell-count and per-render-cost displays.
   - Auto-scroll button: ping-pongs the scroll position between top and bottom for 6s, lets the FPS meter sample sustained throughput.
   - Scroll-to-end / scroll-to-middle buttons exercise the imperative API.

3. **Build & dev wiring** — `tsup.config.ts` + `tsconfig.build.json` for the virtualizer package; project references in the root tsconfig include the new `apps/benchmarks` so `tsc -b` covers it.

## How to run

```bash
cd ~/work/bcg-worker2  # or wherever main is checked out
bun install
bun run --filter '@bc-grid/virtualizer' build    # builds dist for the workspace dep
bun run --filter '@bc-grid/app-benchmarks' dev   # http://localhost:5174
```

Open the page, click **Auto-scroll (FPS test)**, watch the FPS counter for 6s.

## What we expect to see

Theoretical analysis at the v0.1 settings (100k rows × 30 cols, 600px viewport, 32px row, 120px col):

| Quantity | Value |
|---|---|
| Visible rows in viewport | ~19 |
| Overscan rows | 6 each side |
| Visible cols | ~10 |
| Overscan cols | 2 each side |
| Cells in DOM | ~31 rows × 14 cols ≈ **~430** |

DOM-cell count is the biggest contributor to scroll cost. ~430 cells with `transform` updates per scroll commit is well within 60fps headroom on a mid-tier laptop.

The cumulative-offset cache is computed once per render where row sizes change (or where rows get measured); subsequent renders hit the cache. With uniform row heights (current spike default) the cache is trivially correct in O(N) computation, O(log N) lookup.

## What this spike does NOT yet validate

- **Variable row heights at scale.** The infrastructure is in place (sparse cache + lazy cumulative recompute on size change), but the harness uses uniform 32px rows. Variable heights will be exercised when a follow-up benchmark adds them.
- **Pinned-row/column DOM rendering.** The `Virtualizer` returns pinned items in `computeWindow().rows[].pinned` / `cols[].pinned`, but the `DOMRenderer` currently renders them in the same canvas as body cells. A follow-up commit needs to split pinned panes into their own sticky containers per `design.md §6.3`.
- **Focus retention with active-cell DOM persistence.** `Virtualizer.retainRow/retainCol` is implemented and unit-tested, but the harness has no focus-driven trigger. The next iteration wires keyboard focus → retain set.
- **Scroll on a real `bc-next` data shape.** The synthetic content is `R-{padded index}` and `{row}.{col}` strings — all monospace, all width-uniform. Real ERP grids have mixed-format columns that may stress text rendering harder.

## Acceptance criteria for full spike completion

- [ ] Harness measured at ≥58 FPS sustained during 6s auto-scroll on mid-tier hardware (smoke bar).
- [ ] Harness measured at ≥58 FPS at 100k × 30 (nightly bar) on Mac mini-class hardware or equivalent.
- [ ] Variable-row-height variant: harness with 100 randomly sized rows mixed in, FPS verified.
- [ ] Pinned-column variant: harness with `pinnedLeftCols: 1, pinnedRightCols: 1`, sticky panes correctly visible.
- [ ] Focus retention: tab into the grid, scroll the focused row out of viewport, verify the focused row's DOM node persists (per `accessibility-rfc §Focus Model`).
- [ ] Memory metric: heap diff (with 100k × 30 grid mounted) vs (same data, no grid) < 30MB (nightly bar).

## Risks identified

- **Cumulative-offset O(N) recompute.** Currently rebuilt on every size change. For 100k rows with frequent size measurements, this could become a bottleneck. Plan: switch to a fenwick tree (O(log N) per update + query) when measurements show this dominating render cost.
- **Cell node recycling vs animation handoff.** The free-list pops nodes for reuse; if an animation expects a node to persist (per `accessibility-rfc §Virtualization Contract`), the recycling path will need a "do not recycle" flag. The retained-row API covers this for focus, but not yet for in-flight animations. Follow-up.
- **Resize events trigger a full re-render.** `ResizeObserver` is fine for occasional viewport changes, but during continuous resize (drag-resize the window) the render cost scales linearly. Plan: throttle to RAF.

## Verdict

The architecture is sound enough to proceed past the spike gate **in principle**. The unit-tested geometry math is correct; the DOM renderer's recycling pattern is the textbook approach; the cell-count budget is comfortably under what 60fps allows.

But this is a soft gate, not a hard one. The actual perf measurement requires running the harness on real hardware. Once someone has a number, this report should be updated with the measured FPS and the verdict turned into a concrete pass/fail.

If the measured FPS is <58, the architecture decisions to revisit are:
1. Is `transform: translate3d` actually creating GPU layers, or are we promoting too many layers and hitting a different bottleneck?
2. Is the per-cell DOM update (textContent set) the hot path? Could we use string-template caching?
3. Is `requestAnimationFrame` debouncing introducing a perceptible lag at high scroll velocities?

These are tractable optimizations. The architecture itself doesn't need to change unless the bar is missed by 2x or more.
