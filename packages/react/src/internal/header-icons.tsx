import { MoreVerticalIcon as LucideMoreVerticalIcon } from "lucide-react"
import type { ReactNode } from "react"

/**
 * Header chrome glyphs backed by lucide-react so the internal icon
 * surface matches the shadcn primitives used elsewhere in the grid.
 */

export const MoreVerticalIcon: ReactNode = (
  <LucideMoreVerticalIcon
    aria-hidden="true"
    className="bc-grid-header-menu-icon"
    focusable="false"
    size={14}
    strokeWidth={2}
  />
)
