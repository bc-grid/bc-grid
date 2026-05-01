import type { ReactNode } from "react"

/**
 * Header chrome glyphs. Compact 14×14 SVGs in the same `Icon` helper
 * shape used by `context-menu-icons.tsx` and `pagination-icons.tsx`.
 * Each icon is `aria-hidden` so it doesn't contribute to its
 * surrounding button's accessible name — `aria-label` on the button
 * still drives AT announcement.
 *
 * The strokes use `currentColor` so the glyph colour follows the
 * button's text colour, which the theme sets via
 * `--bc-grid-header-fg` / `--bc-grid-fg`. Light, dark, and
 * forced-colors modes all flow through the existing token cascade
 * with no per-mode override.
 */

const VIEWBOX = "0 0 16 16"
const SIZE = 14

interface IconProps {
  children: ReactNode
}

function Icon({ children }: IconProps): ReactNode {
  return (
    <svg
      aria-hidden="true"
      className="bc-grid-header-menu-icon"
      fill="currentColor"
      height={SIZE}
      stroke="none"
      viewBox={VIEWBOX}
      width={SIZE}
    >
      {children}
    </svg>
  )
}

/**
 * Vertical "more" indicator — three stacked dots. Standard shadcn /
 * Radix DropdownMenu trigger glyph for column-options surfaces.
 * Replaces the historical CSS `::before` radial-gradient stack so
 * the affordance survives consumer CSS overrides and renders
 * crisply on every pixel ratio.
 */
export const MoreVerticalIcon: ReactNode = (
  <Icon>
    <circle cx="8" cy="3.5" r="1.4" />
    <circle cx="8" cy="8" r="1.4" />
    <circle cx="8" cy="12.5" r="1.4" />
  </Icon>
)
