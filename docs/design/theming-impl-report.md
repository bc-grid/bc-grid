# Theming Impl — Report

**Status:** Ready for review
**Owner:** x1 (Codex)
**Branch:** `agent/x1/theming-impl`

---

## What Landed

- `@bc-grid/theming` now exports typed density classes, theme classes, CSS variable names, and helper functions for density/theme overrides.
- `@bc-grid/theming/styles.css` is a production export copied into `dist/styles.css` during package build. The package no longer exports source CSS.
- The CSS contract now covers focus rings, selected rows/cells, dirty/invalid markers, coarse-pointer hit targets, `prefers-reduced-motion`, and forced-colors system colors.
- Light and dark theme classes are opt-in (`bc-grid-theme-light`, `bc-grid-theme-dark`) while the base `.bc-grid` still consumes app-level shadcn tokens by default.
- The examples app uses the production theme classes in its static preview.

## Public Surface

```ts
export {
  bcGridDensities,
  bcGridDensityClasses,
  bcGridThemeClasses,
  bcGridThemeVars,
  bcGridPreset,
  getBcGridDensityClass,
  getBcGridThemeClass,
  getBcGridDensityVars,
  createBcGridThemeVars,
}

export type {
  BcGridDensity,
  BcGridThemeMode,
  BcGridCssVar,
  BcGridCssVars,
}
```

Consumers import CSS once:

```ts
import "@bc-grid/theming/styles.css"
```

## Acceptance

- Light/dark and compact/normal/comfortable density modes are CSS-only.
- Tailwind preset maps to the same CSS variables used by the package CSS.
- Forced-colors mode uses system colors and real outlines.
- Reduced-motion mode disables transitions/animations within `.bc-grid`.
- Built CSS is exported from `dist`, matching package publishing expectations.
