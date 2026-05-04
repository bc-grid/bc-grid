"use client"

import * as DialogPrimitive from "@radix-ui/react-dialog"
import { XIcon } from "lucide-react"
import * as React from "react"

import { cn } from "@/shadcn/utils"

function Dialog({ ...props }: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({ ...props }: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({ ...props }: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({ ...props }: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/80",
        className,
      )}
      {...props}
    />
  )
}

// CSS selector matching elements that should appear in Tab order inside a
// dialog. Inputs/textareas/selects/buttons/anchors that aren't disabled and
// don't opt out with `tabindex="-1"`.
const DIALOG_TABBABLE_SELECTOR = [
  'input:not([disabled]):not([type="hidden"]):not([tabindex="-1"])',
  'textarea:not([disabled]):not([tabindex="-1"])',
  'select:not([disabled]):not([tabindex="-1"])',
  'button:not([disabled]):not([tabindex="-1"])',
  'a[href]:not([tabindex="-1"])',
  '[contenteditable="true"]:not([tabindex="-1"])',
  '[tabindex]:not([tabindex="-1"]):not([disabled])',
].join(", ")

function DialogContent({
  className,
  children,
  tabIndex,
  onKeyDown,
  onFocus,
  unstyled,
  hideClose,
  ...rest
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  /**
   * Skip the default scrollable inner wrapper (children render directly in
   * DialogContent). Use when the content manages its own layout + scroll
   * — e.g. the lookup picker, which is a fixed-height grid/list.
   */
  unstyled?: boolean
  /**
   * Hide the default close (X) button in the top-right corner. Use when the
   * content already has its own close affordance, or when the dialog is
   * meant to be dismissed by Esc / outside click only — e.g. the command
   * palette, which uses Esc / Cmd+K.
   */
  hideClose?: boolean
}) {
  const contentRef = React.useRef<HTMLDivElement | null>(null)

  // Chrome's "keyboard-focusable scrollers" heuristic can promote a
  // scrollable container into Tab order dynamically — e.g. when an error
  // message appears below a field, the dialog's content overflows, and the
  // outer or inner scroll container becomes focusable. Neither `tabIndex`
  // nor `overflow-hidden` on the outer reliably blocks this across browsers.
  //
  // Defense: intercept Tab at the dialog root. If the current focus is on
  // DialogContent itself (or our inner dialog-body wrapper), redirect Tab
  // to the first / last real focusable descendant so focus always lands on
  // a form field, never on the dialog chrome.
  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      onKeyDown?.(e)
      if (e.defaultPrevented) return
      if (e.key !== "Tab" || e.metaKey || e.ctrlKey || e.altKey) return
      const root = contentRef.current
      if (!root) return
      const active = document.activeElement as HTMLElement | null
      const isChromeLanded =
        active === root || (active instanceof HTMLElement && active.dataset.slot === "dialog-body")
      if (!isChromeLanded) return
      e.preventDefault()
      const candidates = Array.from(root.querySelectorAll<HTMLElement>(DIALOG_TABBABLE_SELECTOR))
      if (candidates.length === 0) return
      const target = e.shiftKey ? candidates[candidates.length - 1] : candidates[0]
      target?.focus()
      if (target instanceof HTMLInputElement) target.select?.()
    },
    [onKeyDown],
  )

  // When Chrome drops focus ON the dialog body element itself (e.g. on
  // initial render after content has grown), bounce to the first focusable.
  const handleFocus = React.useCallback(
    (e: React.FocusEvent<HTMLDivElement>) => {
      onFocus?.(e)
      if (e.defaultPrevented) return
      const root = contentRef.current
      if (!root) return
      const target = e.target as HTMLElement
      const isUnwanted = target === root || target.dataset.slot === "dialog-body"
      if (!isUnwanted) return
      const first = root.querySelector<HTMLElement>(DIALOG_TABBABLE_SELECTOR)
      if (first && first !== target) first.focus()
    },
    [onFocus],
  )

  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={contentRef}
        data-slot="dialog-content"
        tabIndex={tabIndex ?? -1}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
        className={cn(
          "bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed left-[50%] top-[50%] z-50 flex w-full max-w-lg max-h-[85vh] translate-x-[-50%] translate-y-[-50%] flex-col border shadow-lg duration-200 sm:rounded-lg overflow-hidden focus:outline-none",
          className,
        )}
        {...rest}
      >
        {unstyled ? (
          children
        ) : (
          <div
            data-slot="dialog-body"
            tabIndex={-1}
            className="flex flex-col gap-4 overflow-y-auto p-6 focus:outline-none focus-visible:outline-none"
          >
            {children}
          </div>
        )}
        {!hideClose && (
          <DialogPrimitive.Close className="ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute right-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:pointer-events-none">
            <XIcon className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col space-y-1.5 text-center sm:text-left", className)}
      {...props}
    />
  )
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)}
      {...props}
    />
  )
}

function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-lg font-semibold leading-none tracking-tight", className)}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}
