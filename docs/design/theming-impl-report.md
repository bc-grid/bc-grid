# Theming Impl — Report

**Status:** Ready for review
**Owner:** x1 (Codex)
**Branch:** `agent/x1/theming-impl`

---

## What Landed

- `@bc-grid/theming` now exports typed density classes, CSS variable names, and helper functions for density/grid-token overrides.
- `@bc-grid/theming/styles.css` is a production export copied into `dist/styles.css` during package build. The package no longer exports source CSS.
- The CSS contract now covers focus rings, selected rows/cells, dirty/invalid markers, coarse-pointer hit targets, `prefers-reduced-motion`, and forced-colors system colors.
- The base `.bc-grid` consumes app-level shadcn tokens (`--background`, `--foreground`, `--border`, `--muted`, `--accent`, `--ring`) by default; bc-grid does not ship a separate theme mode.
- Element selectors follow the kebab-case convention from `design.md §13` (`.bc-grid-row`, `.bc-grid-cell`, `.bc-grid-status-*`) so the production theme CSS matches the virtualizer DOM.
- The examples app defines normal shadcn host tokens on `:root` / `.dark` and imports the production grid CSS once.

## Public Surface

```ts
export {
  bcGridDensities,
  bcGridDensityClasses,
  bcGridThemeVars,
  bcGridPreset,
  getBcGridDensityClass,
  getBcGridDensityVars,
  createBcGridThemeVars,
}

export type {
  BcGridDensity,
  BcGridCssVar,
  BcGridCssVars,
}
```

Consumers import CSS once:

```ts
import "@bc-grid/theming/styles.css"
```

## Acceptance

- Light/dark mode is owned by the host shadcn app; compact/normal/comfortable density modes are CSS-only.
- Tailwind preset maps to the same CSS variables used by the package CSS.
- Forced-colors mode uses system colors and real outlines.
- Reduced-motion mode disables transitions/animations within `.bc-grid`.
- Built CSS is exported from `dist`, matching package publishing expectations.
