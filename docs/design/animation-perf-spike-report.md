# Animation Perf Spike — Report

**Status:** Ready for review
**Owner:** x1 (Codex)
**Branch:** `agent/x1/animation-perf-spike`
**Bars to validate:** `design.md §7`

---

## What Landed

- `@bc-grid/animations` exports framework-free FLIP helpers:
  - `readFlipRect(element)`
  - `calculateFlipDelta(first, last)`
  - `createFlipKeyframes(delta)`
  - `playFlip(element, first, options)`
  - `prefersReducedMotion()`
- `apps/animation-benchmarks` renders 1,000 static ERP rows and reorders them by amount with FLIP + Web Animations.
- The benchmark has a manual button and an `?autorun=1` mode for headless Chrome measurement.
- Unit tests cover delta math, scale handling, keyframe generation, and no-op detection.

## How To Run

```bash
bun run --filter '@bc-grid/app-animation-benchmarks' dev
open http://127.0.0.1:5175
```

Click **Sort by amount**. The app captures row positions, applies the sorted order, inverts row transforms, and plays the transform animation back to zero using `element.animate()`.

Headless measurement uses the same page with `?autorun=1`; the app writes results to `window.__bcGridAnimationStats` after the animation finishes.

```bash
open http://127.0.0.1:5175/?autorun=1&budget=100
```

## Measurement

Local headless Chrome 148 against `apps/animation-benchmarks` on 2026-04-29:

| Scenario | FPS | Max frame | Slow frames | Layout | Duration | Result |
|---|---:|---:|---:|---:|---:|---|
| `?autorun=1&budget=100` | 60 | 18.5ms | 8 | 0.6ms | 319ms | Passes FPS bar, but still has a few slow frames |
| `?autorun=1&budget=200` | 57 | 18.6ms | 7 | 0.4ms | 334ms | Borderline miss |
| `?autorun=1` (1,000 animated rows) | 45 | 94.5ms | 9 | 0.5ms | 381ms | Fails |

Interpretation:

- Animating all 1,000 rows at once is not viable.
- The design.md in-flight animation budget is required, not optional.
- On this machine/browser, the practical default should start at 100 in-flight rows. The hard cap can remain <=200 only if the production implementation proves it in a trace.
- The reorder/layout step is cheap after retaining row DOM and moving rows via absolute `top` positions; the cost is in simultaneous Web Animations.

## Acceptance

- [x] 1,000-row benchmark app runs and records measured FPS.
- [x] Budgeted 100-row animation reaches >=58 FPS in the benchmark.
- [x] Slow frames above 16.7ms are recorded and reviewed.
- [ ] Full 1,000-row in-flight animation reaches >=58 FPS. It does not; production architecture must enforce an in-flight animation budget.
- [x] The implementation animates only `transform` and `opacity`.
- [x] Reduced motion can bypass animation through `playFlip(..., { reducedMotion: true })`.
- [x] No React dependency in `@bc-grid/animations`.

## Risks

- The spike retains row DOM and changes absolute `top` positions before playing FLIP transforms. Production needs to coordinate this with the virtualizer's retained-row handoff.
- The frame sampler measures `requestAnimationFrame` cadence while Web Animations runs on the compositor. It is useful as a smoke signal, not a substitute for a full Chrome trace.
- The benchmark exercises vertical reorder only. Column move/resize animations remain separate follow-up work.
