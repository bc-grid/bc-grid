import type { ReactNode } from "react"
import type { BcContextMenuBuiltinItem } from "../types"

const VIEWBOX = "0 0 16 16"
const SIZE = 14
const STROKE = 1.4

interface IconProps {
  children: ReactNode
}

function Icon({ children }: IconProps): ReactNode {
  return (
    <svg
      aria-hidden="true"
      className="bc-grid-context-menu-icon-svg"
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

const PinLeftIcon = (
  <Icon>
    {/* Pin head + stem oriented to the left edge */}
    <path d="M9 3 4 8l5 5" />
    <path d="M4 8h9" />
    <path d="M11 3v10" />
  </Icon>
)

const PinRightIcon = (
  <Icon>
    {/* Mirror of pin-left */}
    <path d="M7 3l5 5-5 5" />
    <path d="M3 8h9" />
    <path d="M5 3v10" />
  </Icon>
)

const UnpinIcon = (
  <Icon>
    {/* Pin shape with diagonal slash through it */}
    <path d="M6 3h4l1 4-2 2v3l-2 1V9L5 7l1-4Z" />
    <path d="M2 14 14 2" />
  </Icon>
)

const HideColumnIcon = (
  <Icon>
    {/* Eye with slash — "hide" */}
    <path d="M2 8s2.5-4 6-4 6 4 6 4-2.5 4-6 4-6-4-6-4Z" />
    <circle cx="8" cy="8" r="1.6" />
    <path d="M2.5 13.5 13.5 2.5" />
  </Icon>
)

const AutosizeIcon = (
  <Icon>
    {/* Two arrows pointing outward — fit-content */}
    <path d="M5 5 2 8l3 3" />
    <path d="M11 5l3 3-3 3" />
    <path d="M2 8h12" />
  </Icon>
)

const AutosizeAllIcon = (
  <Icon>
    {/* Two stacked autosize bars — multi-column fit */}
    <path d="M4 4 2 6l2 2" />
    <path d="M12 4l2 2-2 2" />
    <path d="M2 6h12" />
    <path d="M4 10l-2 2 2 2" />
    <path d="M12 10l2 2-2 2" />
    <path d="M2 12h12" />
  </Icon>
)

const ShowAllColumnsIcon = (
  <Icon>
    {/* Eye glyph (counterpart to HideColumnIcon's slashed eye) */}
    <path d="M2 8s2.5-4 6-4 6 4 6 4-2.5 4-6 4-6-4-6-4Z" />
    <circle cx="8" cy="8" r="1.6" />
  </Icon>
)

const CopyCellIcon = (
  <Icon>
    {/* Single-rectangle copy-of glyph for the explicit single-cell variant */}
    <rect x="3" y="5" width="9" height="9" rx="1.4" />
    <path d="M5 3h7a1 1 0 0 1 1 1v7" />
  </Icon>
)

const CopyRowIcon = (
  <Icon>
    {/* Row-shaped copy glyph: a wide stripe + a row "ditto" mark */}
    <rect x="2" y="4" width="12" height="3" rx="1" />
    <rect x="2" y="9" width="12" height="3" rx="1" />
    <path d="M3 4v8" />
  </Icon>
)

export function contextMenuBuiltinIcon(item: BcContextMenuBuiltinItem): ReactNode | null {
  switch (item) {
    case "copy-cell":
      return CopyCellIcon
    case "copy-row":
      return CopyRowIcon
    case "pin-column-left":
      return PinLeftIcon
    case "pin-column-right":
      return PinRightIcon
    case "unpin-column":
      return UnpinIcon
    case "hide-column":
      return HideColumnIcon
    case "show-all-columns":
      return ShowAllColumnsIcon
    case "autosize-column":
      return AutosizeIcon
    case "autosize-all-columns":
      return AutosizeAllIcon
    default:
      return null
  }
}
