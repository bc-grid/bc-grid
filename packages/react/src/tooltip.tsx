import {
  type CSSProperties,
  Children,
  type FocusEvent,
  type HTMLAttributes,
  type PointerEvent,
  type ReactElement,
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react"
import { createPortal } from "react-dom"

interface BcGridTooltipProps {
  children: ReactElement<HTMLAttributes<HTMLElement>>
  content: string | undefined
  id?: string
}

interface TooltipPosition {
  left: number
  top: number
}

type TooltipTriggerProps = HTMLAttributes<HTMLElement> & {
  "data-bc-grid-tooltip-trigger"?: string
  ref?: (node: HTMLElement | null) => void
}

export function BcGridTooltip({ children, content, id }: BcGridTooltipProps): ReactElement {
  const generatedId = useId()
  const tooltipId = id ?? `bc-grid-tooltip-${generatedId}`
  const triggerRef = useRef<HTMLElement | null>(null)
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [position, setPosition] = useState<TooltipPosition>({ left: 0, top: 0 })
  const [themeVars, setThemeVars] = useState<CSSProperties>({})
  const tooltip = typeof content === "string" ? content.trim() : undefined

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current
    if (!trigger) return
    setThemeVars(readTooltipThemeVars(trigger))
    const rect = trigger.getBoundingClientRect()
    setPosition({
      left: clamp(rect.left, 8, window.innerWidth - 8),
      top: rect.bottom + 6,
    })
  }, [])

  useEffect(() => {
    setMounted(true)
  }, [])

  useLayoutEffect(() => {
    if (!open) return
    updatePosition()
  }, [open, updatePosition])

  useEffect(() => {
    if (!open) return
    window.addEventListener("resize", updatePosition)
    window.addEventListener("scroll", updatePosition, true)
    return () => {
      window.removeEventListener("resize", updatePosition)
      window.removeEventListener("scroll", updatePosition, true)
    }
  }, [open, updatePosition])

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
    onBlur(event: FocusEvent<HTMLElement>) {
      childProps.onBlur?.(event)
      if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
      setOpen(false)
    },
    onFocus(event: FocusEvent<HTMLElement>) {
      childProps.onFocus?.(event)
      setOpen(true)
    },
    onPointerEnter(event: PointerEvent<HTMLElement>) {
      childProps.onPointerEnter?.(event)
      setOpen(true)
    },
    onPointerLeave(event: PointerEvent<HTMLElement>) {
      childProps.onPointerLeave?.(event)
      setOpen(false)
    },
    ref(node: HTMLElement | null) {
      triggerRef.current = node
    },
  })

  return (
    <>
      {trigger}
      {mounted && open
        ? createPortal(
            <div
              className="bc-grid-tooltip-content"
              data-state="open"
              id={tooltipId}
              role="tooltip"
              style={{ ...themeVars, ...position }}
            >
              {tooltip}
            </div>,
            document.body,
          )
        : null}
    </>
  )
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function readTooltipThemeVars(trigger: HTMLElement): CSSProperties {
  const grid = trigger.closest<HTMLElement>(".bc-grid")
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
