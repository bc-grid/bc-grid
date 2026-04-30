# Animations Impl — Report

**Status:** Ready for review
**Owner:** x1 (Codex)
**Branch:** `agent/x1/animations-impl`

---

## What Landed

- `@bc-grid/animations` now exposes the public v0.1 animation surface from `docs/api.md`: `flip`, `flash`, `slide`, and `AnimationBudget`.
- The default in-flight budget is 100 animations, with a hard cap of 200 unless callers deliberately construct a lower cap. This implements the #13 decision log update from `design.md`.
- Reduced motion is respected by default through `resolveMotionPolicy()` / `prefersReducedMotion()`, and every primitive can be forced to `"normal"` or `"reduced"`.
- FLIP remains framework-free and uses only DOM APIs plus Web Animations. No React or animation library dependency was added.
- The root build script is package-first so apps do not race package `dist` outputs in clean CI runs.

## Public Surface

```ts
export {
  AnimationBudget,
  flip,
  flash,
  slide,
  playFlip,
  readFlipRect,
  calculateFlipDelta,
  createFlipKeyframes,
  createFlashKeyframes,
  createSlideKeyframes,
  shouldAnimateDelta,
  prefersReducedMotion,
  resolveMotionPolicy,
}
```

Key constants:

- `DEFAULT_ANIMATION_MAX_IN_FLIGHT = 100`
- `HARD_ANIMATION_MAX_IN_FLIGHT = 200`

## Acceptance

- Budget overflow skips new animations rather than starting unbounded Web Animations.
- Budget counters release when animations finish or reject.
- Reduced motion returns no animations.
- `flip`, `flash`, and `slide` animate only `transform` and/or `opacity`.
- Unit tests cover FLIP math, keyframes, budget clamping/release, reduced motion, and primitive budget behavior.

## Post-Alpha.2 Motion Policy

The v1 grid motion system keeps every runtime animation on compositor-friendly properties:
`transform` for row movement, group/detail disclosure icons, and slide-in row entrances; `opacity`
for cell flash, row entrance fade, tooltips, and pinned-edge shadows. Sidebar open/close no longer
animates width because it is a layout property.

React row motion is split by trigger:

- Sort captures visible row rects before state commit and plays FLIP after the sorted render.
- Filter, group expand/collapse, detail expand/collapse, row insert, and row remove animate surviving
  visible rows from their previous rects to their new rects. Newly visible rows slide/fade in. Rows
  removed by filtering/collapse leave immediately because virtualization has already released their
  DOM nodes; the survivor FLIP keeps the transition readable without retaining arbitrary exits.
- Cell flash uses the same `AnimationBudget` path as row motion, so rapid edit commits cannot start
  unbounded Web Animations.

`prefers-reduced-motion: reduce` disables package primitives through `resolveMotionPolicy()` and
disables CSS animation/transition durations through the theme media query. Explicit
`motionPolicy: "normal"` remains available for controlled benchmarks and tests only.
