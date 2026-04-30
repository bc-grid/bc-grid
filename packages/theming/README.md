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

bc-grid CSS variables fall back to shadcn token names with hard-coded defaults:

```css
.bc-grid {
  --bc-grid-bg: hsl(var(--background, 0 0% 100%));
  --bc-grid-fg: hsl(var(--foreground, 222 47% 11%));
  --bc-grid-row-hover: hsl(var(--accent, 210 40% 96%) / 0.7);
  --bc-grid-accent: hsl(var(--primary, 221 83% 53%));
  --bc-grid-accent-fg: hsl(var(--primary-foreground, 0 0% 98%));
  --bc-grid-accent-soft: hsl(var(--primary, 221 83% 53%) / 0.12);
  /* ... */
}
```

If your app already declares shadcn tokens on `:root` (the standard shadcn setup), bc-grid inherits them. If not, the fallbacks render a sensible neutral theme. `--accent` remains the subtle row-hover tint; `--primary` feeds the visible bc-grid brand accent used by selected-row strips, sorted headers, focused filters, loading spinners, and edit action hover states.

To override per-grid, set the variables on a parent of the grid root.

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
