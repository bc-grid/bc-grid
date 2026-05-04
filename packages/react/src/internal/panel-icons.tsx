import { FilterXIcon as LucideFilterXIcon, XIcon as LucideXIcon } from "lucide-react"
import type { ReactNode } from "react"

/**
 * Tool-panel chrome glyphs backed by lucide-react. These remain
 * aria-hidden so surrounding icon buttons keep their aria-label as the
 * accessible name.
 */

export const XIcon: ReactNode = (
  <LucideXIcon
    aria-hidden="true"
    className="bc-grid-panel-icon"
    focusable="false"
    size={14}
    strokeWidth={2}
  />
)

export const FilterEmptyIcon: ReactNode = (
  <LucideFilterXIcon
    aria-hidden="true"
    className="bc-grid-panel-icon bc-grid-filters-panel-empty-icon"
    focusable="false"
    size={18}
    strokeWidth={2}
  />
)
