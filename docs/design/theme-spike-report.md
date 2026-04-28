# Theme Spike — Report

**Status:** Ready for review
**Owner:** x1 (Codex)
**Branch:** `agent/x1/theme-spike`

---

## What Landed

- `@bc-grid/theming/styles.css` defines the Q1 CSS-variable contract from `design.md §8`: shadcn-aligned color tokens, grid chrome tokens, and compact / normal / comfortable density classes.
- `@bc-grid/theming` exports `bcGridPreset`, a Tailwind preset object that maps utility tokens to the same CSS variables without adding a Tailwind runtime dependency.
- `apps/examples` renders a static theme preview: light and dark token sets across all three density modes, using the package CSS classes directly.
- The package has a small unit test covering density exports and Tailwind token mapping.

## Contract

Consumers can import the CSS once:

```ts
import "@bc-grid/theming/styles.css"
```

The grid consumes shadcn-style app tokens when present:

```css
--background
--foreground
--border
--muted
--muted-foreground
--accent
```

Consumers can override `--bc-grid-*` variables directly for grid-specific chrome without changing the rest of the app theme.

## Deferred

- `theming-impl` should decide whether the final package copies CSS into `dist/` or keeps the source CSS export. The spike exports `src/styles.css` directly to avoid build-order races in workspace apps.
- Tailwind preset typing stays local to avoid adding Tailwind as a dependency. If consumers need first-class Tailwind types, add them as a dev-only type import during `theming-impl`.
- Visual regression coverage belongs with the production theming task, not the spike.

## Acceptance

- Light theme uses shadcn token fallbacks.
- Dark theme uses the same bc-grid CSS variables with different host tokens.
- Compact / normal / comfortable classes change row height, header height, cell padding, and font size without JS.
- The examples preview is static markup styled by CSS variables only.

