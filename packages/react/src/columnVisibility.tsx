import type { ColumnId } from "@bc-grid/core"
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react"
import { BcGridMenuCheckItem } from "./internal/menu-item"
import { usePopupDismiss } from "./internal/popup-dismiss"
import { computePopupPosition } from "./internal/popup-position"
import { useRovingFocus } from "./internal/use-roving-focus"

export interface ColumnVisibilityItem {
  columnId: ColumnId
  hideDisabled: boolean
  hidden: boolean
  label: string
}

export interface ColumnVisibilityMenuAnchor {
  x: number
  y: number
}

export interface ColumnVisibilityMenuProps {
  anchor: ColumnVisibilityMenuAnchor
  items: readonly ColumnVisibilityItem[]
  onClose: () => void
  onToggle: (columnId: ColumnId, hidden: boolean) => void
}

/** Pre-measurement estimate, refined to the rendered DOM after first paint. */
const COLUMN_MENU_ESTIMATED_SIZE = { width: 240, height: 240 }
const COLUMN_MENU_VIEWPORT_MARGIN = 8

/**
 * Selectors that should NOT trigger an outside-pointer dismiss. The
 * trigger button (`[data-bc-grid-column-menu-button]`) is excluded so
 * its own click toggles cleanly instead of fighting an open-then-close
 * race.
 */
const COLUMN_MENU_IGNORE_SELECTORS = ['[data-bc-grid-column-menu-button="true"]'] as const

export function ColumnVisibilityMenu({
  anchor,
  items,
  onClose,
  onToggle,
}: ColumnVisibilityMenuProps): ReactNode {
  const menuRef = useRef<HTMLDivElement | null>(null)
  // Roving-focus contract per WAI-ARIA Authoring Practices for menus
  // and the Radix DropdownMenu default. ArrowDown / ArrowUp cycle
  // enabled items, Home / End jump, disabled (`hideDisabled`) items
  // are skipped, type-ahead matches the next item whose label starts
  // with the typed character. Escape stays owned by `usePopupDismiss`.
  // No focus trap — Tab / Shift-Tab pass through.
  const {
    activeIndex,
    setActiveIndex,
    onKeyDown: onRovingKeyDown,
  } = useRovingFocus({
    itemCount: items.length,
    isItemEnabled: (index) => items[index]?.hideDisabled !== true,
    getItemLabel: (index) => items[index]?.label ?? "",
  })
  // Refs to each item button so we can move DOM focus to the active
  // item when the user presses an arrow / Home / End. `useRef` array
  // patterned after Radix — the ref callback writes the slot and
  // unmounts clear it.
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])
  useEffect(() => {
    itemRefs.current = itemRefs.current.slice(0, items.length)
  }, [items.length])
  // Track whether the user moved active via keyboard, so we don't
  // steal DOM focus on the initial render (the trigger click sets
  // active to the first item but focus should stay on the trigger
  // until the user actually navigates with the keyboard).
  const movedByKeyboardRef = useRef(false)
  useEffect(() => {
    if (!movedByKeyboardRef.current) return
    movedByKeyboardRef.current = false
    if (activeIndex < 0) return
    itemRefs.current[activeIndex]?.focus({ preventScroll: true })
  }, [activeIndex])
  // Place the menu using the shared Radix-Popper-style positioner. The
  // anchor is a point (the trigger button's bottom-left in viewport
  // coordinates); the menu is point-anchored just like the right-click
  // context menu, so side/align are constant for now. Slice 3 candidate:
  // pass the trigger DOMRect through so the menu can use rect-anchor
  // placement and flip when the trigger is near the bottom edge.
  const [position, setPosition] = useState(() =>
    computeColumnMenuPosition(anchor, COLUMN_MENU_ESTIMATED_SIZE),
  )
  useLayoutEffect(() => {
    const node = menuRef.current
    if (!node) return
    const rect = node.getBoundingClientRect()
    setPosition(
      computeColumnMenuPosition(anchor, {
        width: rect.width || COLUMN_MENU_ESTIMATED_SIZE.width,
        height: rect.height || COLUMN_MENU_ESTIMATED_SIZE.height,
      }),
    )
  }, [anchor])
  // Shared dismiss-and-focus-return contract — Escape closes, outside
  // pointer-down closes (skipping the trigger button so its own click
  // toggles cleanly), focus returns to the trigger when the menu
  // unmounts. Replaces the inline effect that lived in grid.tsx.
  usePopupDismiss({
    open: true,
    onClose,
    popupRef: menuRef,
    ignoreSelectors: COLUMN_MENU_IGNORE_SELECTORS,
  })

  if (items.length === 0) return null

  return (
    <div
      aria-label="Column visibility"
      className="bc-grid-column-menu"
      // Radix popper conventions; see the FilterPopup root for the
      // shared rationale. Point-anchored + unmount-on-close → side /
      // state are constant for now.
      data-state="open"
      data-side={position.side}
      data-align={position.align}
      ref={menuRef}
      role="menu"
      style={{ left: position.x, top: position.y }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="bc-grid-column-menu-title">Columns</div>
      <div
        className="bc-grid-column-menu-list"
        onKeyDown={(event) => {
          if (onRovingKeyDown(event)) {
            // Move-actions need the focus follow-up (the effect above
            // shifts DOM focus). Mark that the user is keyboard-driving
            // so the next active-index change focuses the button.
            movedByKeyboardRef.current = true
            // Activation maps to a click on the active item's button —
            // cleaner than duplicating the toggle logic here.
            if (event.key === "Enter" || event.key === " ") {
              const button = itemRefs.current[activeIndex]
              button?.click()
            }
          }
        }}
      >
        {items.map((item, index) => {
          const checked = !item.hidden
          const label = `${checked ? "Hide" : "Show"} ${item.label}`
          const isActive = index === activeIndex
          return (
            <BcGridMenuCheckItem
              aria-label={label}
              checked={checked}
              data-column-id={item.columnId}
              disabled={item.hideDisabled}
              key={item.columnId}
              label={item.label}
              onClick={(event) => {
                event.stopPropagation()
                setActiveIndex(index)
                onToggle(item.columnId, checked)
              }}
              onFocus={() => setActiveIndex(index)}
              ref={(node) => {
                itemRefs.current[index] = node
              }}
              // Roving tabindex: only the active item is in the Tab
              // sequence. Tab from the trigger lands on the active
              // item; Tab again leaves the menu. Mirrors Radix
              // DropdownMenu / WAI-ARIA Authoring Practices for menus.
              tabIndex={isActive ? 0 : -1}
            />
          )
        })}
      </div>
    </div>
  )
}

function computeColumnMenuPosition(
  anchor: ColumnVisibilityMenuAnchor,
  popup: { width: number; height: number },
) {
  const viewport =
    typeof window === "undefined"
      ? {
          width: anchor.x + popup.width + COLUMN_MENU_VIEWPORT_MARGIN * 4,
          height: anchor.y + popup.height + COLUMN_MENU_VIEWPORT_MARGIN * 4,
        }
      : { width: window.innerWidth, height: window.innerHeight }
  return computePopupPosition({
    anchor: { x: anchor.x, y: anchor.y },
    popup,
    viewport,
    viewportMargin: COLUMN_MENU_VIEWPORT_MARGIN,
  })
}
