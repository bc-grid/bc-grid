import type { ReactNode } from "react"

/**
 * Tool-panel chrome glyphs. Compact 14×14 SVGs in the same `Icon`
 * shape used by `context-menu-icons.tsx` / `header-icons.tsx` /
 * `pagination-icons.tsx`. Each icon is `aria-hidden` so it never
 * leaks into the accessible name of its surrounding button — the
 * button's own `aria-label` is the only AT-announced label.
 *
 * Strokes use `currentColor` so the glyph follows the button's text
 * colour. Light, dark, and forced-colors modes flow through the
 * existing token cascade with no per-mode override.
 */

const VIEWBOX = "0 0 16 16"
const SIZE = 14
const STROKE = 1.5

interface IconProps {
  children: ReactNode
}

function Icon({ children }: IconProps): ReactNode {
  return (
    <svg
      aria-hidden="true"
      className="bc-grid-panel-icon"
      fill="none"
      height={SIZE}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={STROKE}
      viewBox={VIEWBOX}
      width={SIZE}
    >
      {children}
    </svg>
  )
}

/**
 * Close / dismiss glyph. Used as the inline icon on the per-filter
 * "Remove this filter" button in `<BcFiltersToolPanel>`. Replaces the
 * historical literal `"x"` text node so the button reads as a real
 * icon-only IconButton (matches shadcn `<Button variant="ghost"
 * size="icon">` conventions).
 */
export const XIcon: ReactNode = (
  <Icon>
    <path d="M4 4l8 8" />
    <path d="M12 4l-8 8" />
  </Icon>
)

/**
 * Slash-circle glyph. Used as the empty-state graphic for the filters
 * tool panel — reads as "no filters applied" without a literal
 * sentence trailing the icon. The slash is a simple line + circle
 * stroke pair so the SVG renders crisply at 18×18 inside the empty
 * card.
 */
export const FilterEmptyIcon: ReactNode = (
  <svg
    aria-hidden="true"
    className="bc-grid-panel-icon bc-grid-filters-panel-empty-icon"
    fill="none"
    height={18}
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth={1.4}
    viewBox={VIEWBOX}
    width={18}
  >
    {/*
     * Funnel outline + diagonal slash. Mirrors the inline funnel glyph
     * used on the header trigger (`FunnelIcon` in `headerCells.tsx`)
     * so the empty state visually quotes the surface the panel
     * controls — but with a slash to read as "none active".
     */}
    <path d="M3 3h10l-3.5 5V13l-3-1V8L3 3Z" />
    <path d="M2 14 14 2" />
  </svg>
)
