import type { RefObject } from "react"
import { useEffect, useState } from "react"

/**
 * Shared dismiss-and-focus-return contract for popup / menu surfaces.
 *
 * Replaces the three near-identical inline effects in `FilterPopup`,
 * `BcGridContextMenu`, and `grid.tsx`'s column-chooser wiring with a
 * single hook. Mirrors Radix's `Popover.Content` / `DropdownMenu.Content`
 * semantics:
 *
 *   - **Escape closes.** Stops propagation by default so a parent
 *     sidebar panel (also Escape-aware) doesn't double-dismiss.
 *   - **Outside pointer-down closes.** Skips the popup itself and any
 *     consumer-supplied "ignore" selectors (typically the trigger
 *     button, so its own click toggles cleanly instead of fighting
 *     the open-then-close).
 *   - **Focus returns** to the element that had focus when the popup
 *     opened, after unmount. Mirrors shadcn defaults; consumers can
 *     opt out (e.g., for tooltips).
 *   - **SSR-safe.** No `document` reads at module scope; the hook
 *     guards every DOM access with `typeof document !== "undefined"`.
 *
 * The pure decision helpers (`shouldDismissOnOutsidePointer`,
 * `shouldDismissOnKey`) are exported so the dismiss rule can be
 * unit-tested without a live DOM.
 */
export interface UsePopupDismissOptions {
  /** While true, listeners are wired. Flip to false to detach without unmounting. */
  open: boolean
  /** Called when the popup should close (Escape or outside pointer-down). */
  onClose: () => void
  /** Ref to the popup root. Pointer events inside the root are ignored. */
  popupRef: RefObject<HTMLElement | null>
  /**
   * CSS selectors that should NOT trigger an outside-pointer dismiss.
   * Typically the trigger button — its own click would otherwise
   * close-then-reopen, producing a flicker.
   */
  ignoreSelectors?: readonly string[]
  /**
   * Restore focus to the element that had focus when the popup opened,
   * after unmount. Default: `true`. Disable for transient surfaces
   * (tooltips) where focus return would steal focus from the user.
   */
  restoreFocus?: boolean
  /**
   * Stop propagation of the Escape key event. Default: `true`. Avoids
   * a parent-level Escape listener (sidebar panel, modal, etc.) from
   * firing on the same keystroke.
   */
  stopEscapePropagation?: boolean
}

export function usePopupDismiss({
  open,
  onClose,
  popupRef,
  ignoreSelectors,
  restoreFocus = true,
  stopEscapePropagation = true,
}: UsePopupDismissOptions): void {
  // Capture the previously focused element on the first render of the
  // hook host. `useState`'s initializer runs synchronously during
  // render, before any `useLayoutEffect` (so before the popup auto-
  // focuses itself), and `document.activeElement` is the trigger that
  // fired the open. SSR returns null and we skip focus return.
  const [previousFocus] = useState<HTMLElement | null>(() => {
    if (typeof document === "undefined") return null
    const active = document.activeElement
    return active instanceof HTMLElement ? active : null
  })

  useEffect(() => {
    if (!open) return
    if (typeof document === "undefined") return

    const handleKey = (event: globalThis.KeyboardEvent) => {
      if (!shouldDismissOnKey(event)) return
      if (stopEscapePropagation) event.stopPropagation()
      onClose()
    }
    const handlePointer = (event: globalThis.PointerEvent) => {
      const popupRoot = popupRef.current ?? null
      if (shouldDismissOnOutsidePointer(event.target, popupRoot, ignoreSelectors ?? [])) {
        onClose()
      }
    }
    document.addEventListener("keydown", handleKey, true)
    document.addEventListener("pointerdown", handlePointer, true)
    return () => {
      document.removeEventListener("keydown", handleKey, true)
      document.removeEventListener("pointerdown", handlePointer, true)
      // Defer focus restoration to a microtask so any in-flight
      // pointerdown handler (which may itself call .focus()) finishes
      // first. Mirrors Radix's behaviour where focus returns after the
      // close transition resolves.
      if (restoreFocus && previousFocus && typeof previousFocus.focus === "function") {
        previousFocus.focus({ preventScroll: true })
      }
    }
    // The hook's contract says listeners reattach when `open` flips
    // (e.g., a controlled popup). `onClose` / `popupRef` / option
    // values are also tracked so callers can swap them; in practice
    // they're stable per popup instance.
  }, [open, onClose, popupRef, ignoreSelectors, restoreFocus, stopEscapePropagation, previousFocus])
}

/**
 * Decide whether an outside-pointer event should close the popup.
 * Pure: takes the event target, the popup root (or null), and the
 * ignore-selector list, returns `true` when the popup should close.
 *
 * Duck-typed on the target's `.closest()` and the popup root's
 * `.contains()` so tests can pass minimal mock objects without a live
 * DOM. The production `usePopupDismiss` listener feeds it real
 * `EventTarget` and `HTMLElement` values.
 */
export function shouldDismissOnOutsidePointer(
  target: EventTarget | null,
  popupRoot: { contains(node: Node): boolean } | null,
  ignoreSelectors: readonly string[],
): boolean {
  if (target == null) return false
  // Target must be element-like. If it isn't, defer to "no dismiss" —
  // a non-Element pointer target (e.g., a Window resize) shouldn't
  // close the popup.
  const closest = (target as { closest?: (selector: string) => unknown }).closest
  if (typeof closest !== "function") return false
  // Inside the popup → ignore.
  if (popupRoot?.contains(target as Node)) return false
  for (const selector of ignoreSelectors) {
    if (closest.call(target, selector)) return false
  }
  return true
}

/**
 * Decide whether a keydown should close the popup. Today: only
 * Escape — but exporting the predicate keeps the contract single-
 * sourced if a future slice wires keyboard menu navigation through
 * the same hook.
 */
export function shouldDismissOnKey(event: { key: string }): boolean {
  return event.key === "Escape"
}
