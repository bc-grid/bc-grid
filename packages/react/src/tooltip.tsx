import {
  type CSSProperties,
  Children,
  type HTMLAttributes,
  type ReactElement,
  cloneElement,
  isValidElement,
  useId,
  useRef,
  useState,
} from "react"
import { Tooltip, TooltipContent, TooltipTrigger } from "./shadcn/tooltip"

interface BcGridTooltipProps {
  children: ReactElement<HTMLAttributes<HTMLElement>>
  content: string | undefined
  id?: string
}

type TooltipTriggerProps = HTMLAttributes<HTMLElement> & {
  "data-bc-grid-tooltip-trigger"?: string
  ref?: (node: HTMLElement | null) => void
}

const TOOLTIP_COLLISION_PADDING = 8

export function BcGridTooltip({ children, content, id }: BcGridTooltipProps): ReactElement {
  const generatedId = useId()
  const tooltipId = id ?? `bc-grid-tooltip-${generatedId}`
  const triggerRef = useRef<HTMLElement | null>(null)
  const [open, setOpen] = useState(false)
  const [themeVars, setThemeVars] = useState<CSSProperties>({})
  const tooltip = typeof content === "string" ? content.trim() : undefined

  if (!tooltip) return children

  const onlyChild = Children.only(children)
  if (!isValidElement<HTMLAttributes<HTMLElement>>(onlyChild)) return children

  const childProps = onlyChild.props
  const existingDescribedBy = childProps["aria-describedby"]
  const describedBy = open
    ? [existingDescribedBy, tooltipId].filter(Boolean).join(" ")
    : existingDescribedBy

  const trigger = cloneElement(onlyChild as ReactElement<TooltipTriggerProps>, {
    "aria-describedby": describedBy,
    "data-bc-grid-tooltip-trigger": "true",
    ref(node: HTMLElement | null) {
      triggerRef.current = node
    },
  })
  const portalContainer = triggerRef.current?.closest<HTMLElement>(".bc-grid") ?? null

  return (
    <Tooltip
      delayDuration={0}
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) setThemeVars(readTooltipThemeVars(triggerRef.current))
      }}
    >
      <TooltipTrigger asChild>{trigger}</TooltipTrigger>
      <TooltipContent
        align="start"
        className="bc-grid-tooltip-content"
        collisionPadding={TOOLTIP_COLLISION_PADDING}
        container={portalContainer}
        hideArrow
        id={tooltipId}
        side="bottom"
        sideOffset={6}
        style={themeVars}
      >
        {tooltip}
      </TooltipContent>
    </Tooltip>
  )
}

function readTooltipThemeVars(trigger: HTMLElement | null): CSSProperties {
  const grid = trigger?.closest<HTMLElement>(".bc-grid")
  if (!grid) return {}

  const styles = getComputedStyle(grid)
  return {
    "--bc-grid-context-menu-bg": styles.getPropertyValue("--bc-grid-context-menu-bg").trim(),
    "--bc-grid-context-menu-fg": styles.getPropertyValue("--bc-grid-context-menu-fg").trim(),
    "--bc-grid-context-menu-border": styles
      .getPropertyValue("--bc-grid-context-menu-border")
      .trim(),
    "--bc-grid-radius": styles.getPropertyValue("--bc-grid-radius").trim(),
    "--bc-grid-motion-duration-fast": styles
      .getPropertyValue("--bc-grid-motion-duration-fast")
      .trim(),
    "--bc-grid-motion-ease-standard": styles
      .getPropertyValue("--bc-grid-motion-ease-standard")
      .trim(),
  } as CSSProperties
}
