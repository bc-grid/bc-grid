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

bc-grid CSS variables are real CSS color values. They fall back to the latest
shadcn token names, which can be OKLCH in Tailwind v4, and then to neutral
defaults:

```css
.bc-grid {
  --bc-grid-bg: var(--background, hsl(0 0% 100%));
  --bc-grid-fg: var(--foreground, hsl(222 47% 11%));
  --bc-grid-row-hover: color-mix(
    in srgb,
    var(--accent, hsl(210 40% 96%)) 70%,
    transparent
  );
  /* ... */
}
```

If your app already declares current shadcn tokens on `:root`, bc-grid inherits
them. If not, the fallbacks render a sensible neutral theme.

To override per-grid, set the `--bc-grid-*` variables on a parent of the grid
root. Use complete CSS colors such as `oklch(...)`, `hsl(...)`, hex, or named
system colors. Older Tailwind v3/shadcn apps that still expose HSL channel
tokens can bridge explicitly by assigning bc-grid tokens to `hsl(var(--token))`
in host CSS.

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
