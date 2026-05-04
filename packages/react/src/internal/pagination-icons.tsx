import {
  ChevronLeftIcon as LucideChevronLeftIcon,
  ChevronRightIcon as LucideChevronRightIcon,
  ChevronsLeftIcon as LucideChevronsLeftIcon,
  ChevronsRightIcon as LucideChevronsRightIcon,
} from "lucide-react"
import type { ReactNode } from "react"

/**
 * Pagination control glyphs backed by lucide-react. The exported
 * ReactNode constants preserve the existing internal callsite contract.
 */

export const ChevronLeftIcon: ReactNode = (
  <LucideChevronLeftIcon
    aria-hidden="true"
    className="bc-grid-pagination-icon"
    focusable="false"
    size={14}
    strokeWidth={2}
  />
)

export const ChevronRightIcon: ReactNode = (
  <LucideChevronRightIcon
    aria-hidden="true"
    className="bc-grid-pagination-icon"
    focusable="false"
    size={14}
    strokeWidth={2}
  />
)

export const ChevronLeftDoubleIcon: ReactNode = (
  <LucideChevronsLeftIcon
    aria-hidden="true"
    className="bc-grid-pagination-icon"
    focusable="false"
    size={14}
    strokeWidth={2}
  />
)

export const ChevronRightDoubleIcon: ReactNode = (
  <LucideChevronsRightIcon
    aria-hidden="true"
    className="bc-grid-pagination-icon"
    focusable="false"
    size={14}
    strokeWidth={2}
  />
)
