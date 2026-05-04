"use client"

import * as TooltipPrimitive from "@radix-ui/react-tooltip"
import type * as React from "react"

import { cn } from "@/shadcn/utils"

function TooltipProvider({
  delayDuration = 0,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delayDuration={delayDuration}
      {...props}
    />
  )
}

function Tooltip({
  delayDuration,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Root> & { delayDuration?: number }) {
  return (
    <TooltipProvider delayDuration={delayDuration ?? 0}>
      <TooltipPrimitive.Root data-slot="tooltip" {...props} />
    </TooltipProvider>
  )
}

function TooltipTrigger({ ...props }: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />
}

function TooltipContent({
  className,
  sideOffset = 0,
  hideArrow = false,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content> & { hideArrow?: boolean }) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        className={cn(
          "bg-foreground text-background animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 w-fit origin-(--radix-tooltip-content-transform-origin) rounded-md px-3 py-1.5 text-xs text-balance",
          className,
        )}
        {...props}
      >
        {children}
        {!hideArrow && <TooltipPrimitive.Arrow className="fill-foreground z-50" />}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  )
}

/**
 * TooltipShortcut — standard kbd badge for displaying a keyboard shortcut
 * inside a tooltip. Use this instead of raw <kbd> to keep styling consistent.
 *
 * @example
 * <TooltipContent>
 *   Toggle Sidebar <TooltipShortcut>⌘B</TooltipShortcut>
 * </TooltipContent>
 */
function TooltipShortcut({ className, children, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="tooltip-shortcut"
      className={cn(
        "inline-flex h-5 items-center gap-0.5 rounded border border-background/25 bg-background/15 px-1.5 font-mono text-[10px] font-medium",
        className,
      )}
      {...props}
    >
      {children}
    </kbd>
  )
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider, TooltipShortcut }
