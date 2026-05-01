import type { ReactNode } from "react"

/**
 * Pagination control glyphs. Compact 14×14 SVGs in the same `Icon`
 * helper shape used by `context-menu-icons.tsx`. Each icon is
 * `aria-hidden` so it doesn't contribute to the button's accessible
 * name — `aria-label="First page"` (etc.) on the button still drives
 * AT announcement.
 *
 * The strokes use `currentColor` so the glyph colour follows the
 * button's text colour, which the theme sets via
 * `--bc-grid-pagination-button-fg` / `--bc-grid-fg`. That keeps the
 * glyphs visible across light + dark + forced-colors modes without
 * any per-mode override.
 */

const VIEWBOX = "0 0 16 16"
const SIZE = 14
const STROKE = 1.6

interface IconProps {
  children: ReactNode
}

function Icon({ children }: IconProps): ReactNode {
  return (
    <svg
      aria-hidden="true"
      className="bc-grid-pagination-icon"
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

/** Single chevron pointing left — "previous page". */
export const ChevronLeftIcon: ReactNode = (
  <Icon>
    <path d="M10 3 5 8l5 5" />
  </Icon>
)

/** Single chevron pointing right — "next page". */
export const ChevronRightIcon: ReactNode = (
  <Icon>
    <path d="M6 3l5 5-5 5" />
  </Icon>
)

/** Double chevron pointing left — "first page". */
export const ChevronLeftDoubleIcon: ReactNode = (
  <Icon>
    <path d="M8 3 3 8l5 5" />
    <path d="M13 3 8 8l5 5" />
  </Icon>
)

/** Double chevron pointing right — "last page". */
export const ChevronRightDoubleIcon: ReactNode = (
  <Icon>
    <path d="M3 3l5 5-5 5" />
    <path d="M8 3l5 5-5 5" />
  </Icon>
)
