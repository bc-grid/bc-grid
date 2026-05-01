# @bc-grid/theming

shadcn-native theming layer for bc-grid. Ships:

1. A single CSS file (`@bc-grid/theming/styles.css`) consumers import once.
2. CSS-variable tokens that consumers can override.
3. Density helpers (`bcGridDensities`, `getBcGridDensityClass`, etc.) for swapping between `compact` / `normal` / `comfortable` row heights.
4. A Tailwind preset (`bcGridPreset`) for projects already using Tailwind + shadcn — extends Tailwind's theme with the bc-grid token namespace.

## Install

```bash
bun add @bc-grid/theming
```

## Use

```ts
import "@bc-grid/theming/styles.css"
```

That single import wires every `.bc-grid-*` class needed by `@bc-grid/react`. Drop it once at your app entry (typically `main.tsx` or a layout component).

## Theming model

bc-grid CSS variables are real CSS color values. They bridge the latest
shadcn / Tailwind v4 token names (which can be `oklch(...)` on v4) and fall
back to neutral defaults:

```css
.bc-grid {
  --bc-grid-bg:               var(--background,         hsl(0 0% 100%));
  --bc-grid-fg:               var(--foreground,         hsl(222 47% 11%));
  --bc-grid-card-bg:          var(--card,               var(--bc-grid-bg));
  --bc-grid-card-fg:          var(--card-foreground,    var(--bc-grid-fg));
  --bc-grid-border:           var(--border,             hsl(214 32% 91%));
  --bc-grid-input-border:     var(--input,              var(--bc-grid-border));
  --bc-grid-muted:            var(--muted,              hsl(210 40% 96%));
  --bc-grid-muted-fg:         var(--muted-foreground,   hsl(215 16% 47%));
  --bc-grid-row-hover:        color-mix(in srgb, var(--accent, hsl(210 40% 96%)) 70%, transparent);
  --bc-grid-row-selected:     var(--accent,             hsl(210 40% 96%));
  --bc-grid-row-selected-fg:  var(--accent-foreground,  var(--bc-grid-fg));
  --bc-grid-focus-ring:       var(--ring,               hsl(221 83% 53%));
  --bc-grid-invalid:          var(--destructive,        hsl(0 84% 60%));
  --bc-grid-accent:           var(--primary,            var(--bc-grid-focus-ring));
  --bc-grid-accent-fg:        var(--primary-foreground, hsl(0 0% 98%));
  --bc-grid-context-menu-bg:  var(--popover,            var(--bc-grid-bg));
  --bc-grid-context-menu-fg:  var(--popover-foreground, var(--bc-grid-fg));
  /* ... */
}
```

If your app already declares the current shadcn tokens on `:root`, bc-grid
inherits them and every chrome surface (context menu, column chooser, sidebar,
filter popup, master/detail panel, pagination) picks up the right colour
without any per-grid configuration. If not, the slate fallbacks render a
sensible neutral theme.

The bridge is set **once** at the grid root. Every chrome rule below consumes
the `--bc-grid-*` companion only — direct `var(--popover)` / `var(--accent)` /
`var(--card)` references are confined to the bridge block so apps can override
every grid surface from one place. To override per-grid, set the
`--bc-grid-*` variables on a parent of the grid root. Use complete CSS colours
such as `oklch(...)`, `hsl(...)`, hex, or named system colours.

Older Tailwind v3 / shadcn apps that still expose HSL channel tokens can
bridge explicitly by assigning bc-grid tokens to `hsl(var(--token))` in host
CSS — that pattern is no longer used inside this package.

## Tailwind preset (optional)

If you use Tailwind:

```ts
// tailwind.config.ts
import { bcGridPreset } from "@bc-grid/theming"

export default {
  presets: [bcGridPreset],
  // ...
}
```

This exposes the bc-grid token namespace as Tailwind utility classes.

## License

UNLICENSED — proprietary, see [LICENSE](../../LICENSE).
