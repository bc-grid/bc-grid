# @bc-grid/animations

FLIP + slide + flash animation primitives for bc-grid. Built on the Web Animations API with a 100/200 budget (default/hard cap), `prefers-reduced-motion` support, and a `MotionPolicy` consumer override.

Pulled in transitively by `@bc-grid/react`. Direct install is rarely needed.

## What's inside

- `flip(target, options)` — FLIP animation primitive
- `slide(target, options)` — slide-in/out
- `flash(target, options)` — cell-flash for value changes
- `playFlip` / `readFlipRect` / `calculateFlipDelta` — lower-level FLIP utilities
- `prefersReducedMotion` / `resolveMotionPolicy` — motion-preference helpers
- `AnimationBudget` — global animation count limiter

See `docs/design/animation-perf-spike-report.md`.

## License

UNLICENSED — proprietary, see [LICENSE](../../LICENSE).
