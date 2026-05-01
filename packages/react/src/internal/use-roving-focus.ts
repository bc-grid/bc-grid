import type { KeyboardEvent } from "react"
import { useCallback, useState } from "react"

/**
 * Shared roving-focus / active-descendant helper used by popup menus
 * (context menu, column chooser). Mirrors the WAI-ARIA Authoring
 * Practices for menu keyboard interaction and the Radix DropdownMenu
 * default behaviour:
 *
 *   - **ArrowDown / ArrowUp** cycle through enabled items (with
 *     wrap-around).
 *   - **Home / End** jump to the first / last enabled item.
 *   - **Disabled items are skipped** by every navigation key.
 *   - **Enter / Space** activate the focused item (caller decides
 *     what "activate" means).
 *   - **Type-ahead** matches the next enabled item whose label starts
 *     with the typed character. Optional — the hook only invokes it
 *     when `getItemLabel` is supplied.
 *   - **Escape is NOT handled here.** Popup dismiss owns that
 *     contract via `usePopupDismiss`. Keeping the two concerns
 *     separate means a popup can opt into roving focus without taking
 *     on the dismiss listener (or vice versa).
 *   - **No focus trap.** Tab and Shift-Tab pass through unchanged so
 *     keyboard users can leave the menu naturally.
 *
 * Pattern-agnostic: the hook tracks an `activeIndex` and supplies an
 * `onKeyDown` handler. Components decide whether to render the result
 * via `aria-activedescendant` (context menu — items have `tabIndex=-1`,
 * the menu root holds DOM focus) or via roving tabindex (column
 * chooser — each item carries `tabIndex={index === activeIndex ? 0 :
 * -1}` and the component focuses the active item when it changes).
 *
 * The pure helpers (`nextEnabledIndex`, `firstEnabledIndex`,
 * `lastEnabledIndex`, `nextMatchingIndex`, `decideRovingKey`) are
 * exported separately so the navigation rule can be unit-tested
 * without React or a live DOM.
 */
export interface UseRovingFocusOptions {
  /** Total number of items the user can navigate through. */
  itemCount: number
  /**
   * Predicate. Items for which this returns false are skipped by every
   * navigation key. Default: every index enabled.
   */
  isItemEnabled?: (index: number) => boolean
  /**
   * Initial active index when the hook first mounts. Default: the
   * first enabled index, or `-1` when no item is enabled.
   */
  initialIndex?: number
  /**
   * Loop ArrowDown past the last item back to the first (and vice
   * versa). Default: `true` (matches Radix DropdownMenu).
   */
  loop?: boolean
  /**
   * Optional label getter for type-ahead. When supplied, single-key
   * presses (no modifier) try to advance the active index to the
   * next enabled item whose label starts with the typed character.
   */
  getItemLabel?: (index: number) => string
}

export interface UseRovingFocusResult {
  activeIndex: number
  setActiveIndex: (index: number) => void
  /**
   * Keyboard handler. Returns `true` when the event was consumed (the
   * caller should NOT also handle it). Returns `false` for keys the
   * roving-focus contract doesn't claim (Tab, Shift-Tab, Escape, etc.).
   */
  onKeyDown: (event: KeyboardEvent<Element>) => boolean
}

export type RovingAction =
  | { kind: "move"; index: number }
  | { kind: "activate"; index: number }
  | { kind: "noop" }

const TRUE_ENABLED = (_index: number) => true

export function useRovingFocus(options: UseRovingFocusOptions): UseRovingFocusResult {
  const {
    itemCount,
    isItemEnabled = TRUE_ENABLED,
    initialIndex,
    loop = true,
    getItemLabel,
  } = options

  const [activeIndex, setActiveIndex] = useState<number>(() => {
    if (initialIndex !== undefined && initialIndex >= 0 && initialIndex < itemCount) {
      return initialIndex
    }
    return firstEnabledIndex(itemCount, isItemEnabled)
  })

  const onKeyDown = useCallback(
    (event: KeyboardEvent<Element>): boolean => {
      const action = decideRovingKey(event, {
        itemCount,
        activeIndex,
        isItemEnabled,
        loop,
        getItemLabel,
      })
      if (action.kind === "noop") return false
      if (action.kind === "move") {
        event.preventDefault()
        setActiveIndex(action.index)
        return true
      }
      // "activate" — caller chose the activation contract; we just
      // signal that the event is consumed. The caller can read
      // activeIndex via the result and dispatch onSelect.
      event.preventDefault()
      return true
    },
    [activeIndex, getItemLabel, isItemEnabled, itemCount, loop],
  )

  return { activeIndex, setActiveIndex, onKeyDown }
}

export interface DecideRovingKeyContext {
  itemCount: number
  activeIndex: number
  isItemEnabled: (index: number) => boolean
  loop: boolean
  getItemLabel?: ((index: number) => string) | undefined
}

/**
 * Pure event → action mapper. Returns the next active index for nav
 * keys, an `"activate"` signal for Enter / Space, or `"noop"` for keys
 * outside the roving-focus contract (Escape, Tab, Shift-Tab, all
 * modifier-bearing keys).
 *
 * Doesn't read or mutate React state; the React hook does that. This
 * separation lets tests drive the decision rule without rendering
 * anything.
 */
export function decideRovingKey(
  event: { key: string; altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean },
  ctx: DecideRovingKeyContext,
): RovingAction {
  const { itemCount, activeIndex, isItemEnabled, loop, getItemLabel } = ctx
  if (itemCount <= 0) return { kind: "noop" }
  if (event.key === "ArrowDown") {
    const next = nextEnabledIndex(itemCount, activeIndex, "next", isItemEnabled, loop)
    return next === activeIndex ? { kind: "noop" } : { kind: "move", index: next }
  }
  if (event.key === "ArrowUp") {
    const next = nextEnabledIndex(itemCount, activeIndex, "prev", isItemEnabled, loop)
    return next === activeIndex ? { kind: "noop" } : { kind: "move", index: next }
  }
  if (event.key === "Home") {
    const next = firstEnabledIndex(itemCount, isItemEnabled)
    return next === activeIndex || next < 0 ? { kind: "noop" } : { kind: "move", index: next }
  }
  if (event.key === "End") {
    const next = lastEnabledIndex(itemCount, isItemEnabled)
    return next === activeIndex || next < 0 ? { kind: "noop" } : { kind: "move", index: next }
  }
  if (event.key === "Enter" || event.key === " ") {
    if (activeIndex < 0 || activeIndex >= itemCount) return { kind: "noop" }
    if (!isItemEnabled(activeIndex)) return { kind: "noop" }
    return { kind: "activate", index: activeIndex }
  }
  if (getItemLabel && event.key.length === 1 && !event.altKey && !event.ctrlKey && !event.metaKey) {
    const next = nextMatchingIndex(itemCount, activeIndex, event.key, getItemLabel, isItemEnabled)
    if (next < 0 || next === activeIndex) return { kind: "noop" }
    return { kind: "move", index: next }
  }
  return { kind: "noop" }
}

/**
 * Index of the next enabled item from `fromIndex` in `direction`.
 * When `loop` is true, wraps around; when false, stops at the end of
 * the list. Returns `fromIndex` if no other enabled item is reachable.
 */
export function nextEnabledIndex(
  itemCount: number,
  fromIndex: number,
  direction: "next" | "prev",
  isItemEnabled: (index: number) => boolean = TRUE_ENABLED,
  loop = true,
): number {
  if (itemCount <= 0) return -1
  const offset = direction === "next" ? 1 : -1
  // Clamp `fromIndex` so we always start the search from a valid slot.
  let cursor = clampToRange(fromIndex, itemCount)
  for (let step = 0; step < itemCount; step++) {
    cursor += offset
    if (loop) {
      cursor = ((cursor % itemCount) + itemCount) % itemCount
    } else if (cursor < 0 || cursor >= itemCount) {
      return clampToRange(fromIndex, itemCount)
    }
    if (isItemEnabled(cursor)) return cursor
  }
  // No other enabled item — keep where we are if it's enabled, else
  // signal "no enabled items at all".
  return isItemEnabled(clampToRange(fromIndex, itemCount)) ? clampToRange(fromIndex, itemCount) : -1
}

/**
 * First enabled index, or -1 if every item is disabled. Cheaper than
 * `nextEnabledIndex(..., "next")` because it doesn't loop.
 */
export function firstEnabledIndex(
  itemCount: number,
  isItemEnabled: (index: number) => boolean = TRUE_ENABLED,
): number {
  for (let i = 0; i < itemCount; i++) {
    if (isItemEnabled(i)) return i
  }
  return -1
}

/** Last enabled index, or -1 if every item is disabled. */
export function lastEnabledIndex(
  itemCount: number,
  isItemEnabled: (index: number) => boolean = TRUE_ENABLED,
): number {
  for (let i = itemCount - 1; i >= 0; i--) {
    if (isItemEnabled(i)) return i
  }
  return -1
}

/**
 * Type-ahead: starting just past `fromIndex`, find the next enabled
 * item whose label starts with `query` (case-insensitive). Loops
 * around to before `fromIndex` if needed. Returns -1 when no item
 * matches.
 */
export function nextMatchingIndex(
  itemCount: number,
  fromIndex: number,
  query: string,
  getItemLabel: (index: number) => string,
  isItemEnabled: (index: number) => boolean = TRUE_ENABLED,
): number {
  if (itemCount <= 0 || query.length === 0) return -1
  const needle = query.toLocaleLowerCase()
  const start = clampToRange(fromIndex, itemCount)
  for (let step = 1; step <= itemCount; step++) {
    const index = (start + step) % itemCount
    if (!isItemEnabled(index)) continue
    if (getItemLabel(index).toLocaleLowerCase().startsWith(needle)) return index
  }
  return -1
}

function clampToRange(value: number, itemCount: number): number {
  if (value < 0) return 0
  if (value >= itemCount) return itemCount - 1
  return value
}
