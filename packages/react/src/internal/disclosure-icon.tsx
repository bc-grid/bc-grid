import { ChevronRightIcon as LucideChevronRightIcon } from "lucide-react"
import type { ReactNode } from "react"

interface DisclosureChevronProps {
  /** CSS class used to drive the open / closed rotation transition. */
  className?: string
}

/**
 * Compact lucide disclosure chevron used by master/detail, tree, and
 * group-row toggles. The surrounding CSS rotates the SVG vector only,
 * never text or row content.
 */
export function DisclosureChevron({ className }: DisclosureChevronProps): ReactNode {
  return (
    <LucideChevronRightIcon
      absoluteStrokeWidth
      aria-hidden="true"
      className={className}
      focusable="false"
      size={12}
      strokeWidth={1.75}
    />
  )
}
