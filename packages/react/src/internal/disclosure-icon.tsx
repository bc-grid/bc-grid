import type { ReactNode } from "react"

interface DisclosureChevronProps {
  /** CSS class used to drive the open / closed rotation transition. */
  className?: string
}

/**
 * Compact disclosure chevron used by master/detail row toggles and
 * group-row toggles. Inline SVG (12×12, currentColor stroke) so the
 * icon picks up the surrounding text colour and rotates as a vector
 * — never as a text glyph.
 *
 * The CSS rule on the consumer class (`.bc-grid-detail-toggle-icon`,
 * `.bc-grid-group-toggle-icon`) toggles the rotation when the parent
 * carries `aria-expanded="true"`. Rotation animates via the existing
 * `var(--bc-grid-motion-duration-fast)` / `--bc-grid-motion-ease-
 * standard` tokens; the entire animation runs on the SVG element only,
 * never on the surrounding label text.
 *
 * Per the master-detail motion contract documented in
 * `docs/api.md §5.4`: no scale, no font-size morph, no height /
 * max-height transitions on the disclosure path. Rotating an SVG
 * vector is fine; rotating a text glyph is not.
 */
export function DisclosureChevron({ className }: DisclosureChevronProps): ReactNode {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      height="12"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.75"
      viewBox="0 0 12 12"
      width="12"
    >
      <path d="M4.5 3 7.5 6 4.5 9" />
    </svg>
  )
}
