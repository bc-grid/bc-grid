import type { CSSProperties, KeyboardEvent, ReactNode } from "react"
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react"
import {
  contextMenuItemDestructive,
  contextMenuItemDisabled,
  contextMenuItemKey,
  contextMenuItemLabel,
  contextMenuItemShortcut,
  isContextMenuSeparator,
  isCustomContextMenuItem,
} from "../contextMenu"
import type { BcContextMenuContext, BcContextMenuItem } from "../types"

export interface BcGridContextMenuAnchor {
  x: number
  y: number
}

export interface BcGridContextMenuProps<TRow> {
  anchor: BcGridContextMenuAnchor
  context: BcContextMenuContext<TRow>
  items: readonly BcContextMenuItem<TRow>[]
  onClose: () => void
  onSelect: (item: BcContextMenuItem<TRow>, context: BcContextMenuContext<TRow>) => void
}

export function BcGridContextMenu<TRow>({
  anchor,
  context,
  items,
  onClose,
  onSelect,
}: BcGridContextMenuProps<TRow>): ReactNode {
  const menuId = useId()
  const menuRef = useRef<HTMLDivElement | null>(null)
  const focusableIndexes = useMemo(
    () =>
      items
        .map((item, index) => (isContextMenuSeparator(item) ? -1 : index))
        .filter((index) => index >= 0),
    [items],
  )
  const [activeIndex, setActiveIndex] = useState(() => focusableIndexes[0] ?? -1)
  const [position, setPosition] = useState(() => clampContextMenu(anchor, 240, 48))

  useEffect(() => {
    setActiveIndex(focusableIndexes[0] ?? -1)
  }, [focusableIndexes])

  useLayoutEffect(() => {
    menuRef.current?.focus({ preventScroll: true })
    const rect = menuRef.current?.getBoundingClientRect()
    setPosition(clampContextMenu(anchor, rect?.width ?? 240, rect?.height ?? 48))
  }, [anchor])

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (target instanceof Node && menuRef.current?.contains(target)) return
      onClose()
    }
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    document.addEventListener("pointerdown", handlePointerDown, true)
    document.addEventListener("keydown", handleKeyDown, true)
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true)
      document.removeEventListener("keydown", handleKeyDown, true)
    }
  }, [onClose])

  if (items.length === 0) return null

  const activeItemId = activeIndex >= 0 ? `${menuId}-item-${activeIndex}` : undefined

  const activate = (item: BcContextMenuItem<TRow>) => {
    if (isContextMenuSeparator(item)) return
    if (contextMenuItemDisabled(item, context)) return
    onSelect(item, context)
    onClose()
  }

  return (
    <div
      aria-activedescendant={activeItemId}
      aria-label="Context menu"
      className="bc-grid-context-menu"
      onContextMenu={(event) => event.preventDefault()}
      onKeyDown={(event) =>
        handleContextMenuKeyDown({
          event,
          activeIndex,
          focusableIndexes,
          items,
          setActiveIndex,
          activate,
          onClose,
        })
      }
      ref={menuRef}
      role="menu"
      style={contextMenuStyle(position)}
      tabIndex={-1}
    >
      {items.map((item, index) => {
        if (isContextMenuSeparator(item)) {
          return (
            <div
              aria-orientation="horizontal"
              className="bc-grid-context-menu-separator"
              key={contextMenuItemKey(item, index)}
              role="separator"
              tabIndex={-1}
            />
          )
        }

        const label = contextMenuItemLabel(item)
        const shortcut = contextMenuItemShortcut(item)
        const disabled = contextMenuItemDisabled(item, context)
        const active = activeIndex === index
        const Icon = isCustomContextMenuItem(item) ? item.icon : undefined
        const title =
          disabled && (item === "export-csv" || item === "export-xlsx") ? "Coming soon" : undefined
        return (
          <div
            aria-disabled={disabled || undefined}
            className="bc-grid-context-menu-item"
            data-active={active || undefined}
            data-destructive={contextMenuItemDestructive(item) || undefined}
            id={`${menuId}-item-${index}`}
            key={contextMenuItemKey(item, index)}
            onClick={(event) => {
              event.stopPropagation()
              activate(item)
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter" && event.key !== " ") return
              event.preventDefault()
              event.stopPropagation()
              activate(item)
            }}
            onMouseEnter={() => setActiveIndex(index)}
            role="menuitem"
            tabIndex={-1}
            title={title}
          >
            {Icon ? (
              <span aria-hidden="true" className="bc-grid-context-menu-icon">
                <Icon className="bc-grid-context-menu-icon-svg" />
              </span>
            ) : null}
            <span className="bc-grid-context-menu-label">{label}</span>
            {shortcut ? <span className="bc-grid-context-menu-shortcut">{shortcut}</span> : null}
          </div>
        )
      })}
    </div>
  )
}

function handleContextMenuKeyDown<TRow>({
  event,
  activeIndex,
  focusableIndexes,
  items,
  setActiveIndex,
  activate,
  onClose,
}: {
  event: KeyboardEvent<HTMLDivElement>
  activeIndex: number
  focusableIndexes: readonly number[]
  items: readonly BcContextMenuItem<TRow>[]
  setActiveIndex: (index: number) => void
  activate: (item: BcContextMenuItem<TRow>) => void
  onClose: () => void
}) {
  if (event.key === "Escape") {
    event.preventDefault()
    onClose()
    return
  }
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault()
    setActiveIndex(nextFocusableIndex(focusableIndexes, activeIndex, event.key === "ArrowDown"))
    return
  }
  if (event.key === "Home") {
    event.preventDefault()
    setActiveIndex(focusableIndexes[0] ?? activeIndex)
    return
  }
  if (event.key === "End") {
    event.preventDefault()
    setActiveIndex(focusableIndexes[focusableIndexes.length - 1] ?? activeIndex)
    return
  }
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault()
    const item = items[activeIndex]
    if (item) activate(item)
    return
  }
  if (event.key.length === 1 && !event.altKey && !event.ctrlKey && !event.metaKey) {
    const next = nextTypeAheadIndex(items, focusableIndexes, activeIndex, event.key)
    if (next >= 0) {
      event.preventDefault()
      setActiveIndex(next)
    }
  }
}

function nextFocusableIndex(
  focusableIndexes: readonly number[],
  activeIndex: number,
  forward: boolean,
): number {
  if (focusableIndexes.length === 0) return -1
  const currentPosition = focusableIndexes.indexOf(activeIndex)
  if (currentPosition === -1) return focusableIndexes[0] ?? -1
  const offset = forward ? 1 : -1
  const nextPosition =
    (currentPosition + offset + focusableIndexes.length) % focusableIndexes.length
  return focusableIndexes[nextPosition] ?? -1
}

function nextTypeAheadIndex<TRow>(
  items: readonly BcContextMenuItem<TRow>[],
  focusableIndexes: readonly number[],
  activeIndex: number,
  key: string,
): number {
  const query = key.toLocaleLowerCase()
  if (!query) return -1
  const startPosition = Math.max(0, focusableIndexes.indexOf(activeIndex))
  for (let offset = 1; offset <= focusableIndexes.length; offset++) {
    const index = focusableIndexes[(startPosition + offset) % focusableIndexes.length]
    if (index == null) continue
    const item = items[index]
    if (!item) continue
    if (contextMenuItemLabel(item).toLocaleLowerCase().startsWith(query)) return index
  }
  return -1
}

function clampContextMenu(anchor: BcGridContextMenuAnchor, width: number, height: number) {
  const margin = 8
  const viewportWidth = typeof window === "undefined" ? width + margin * 2 : window.innerWidth
  const viewportHeight = typeof window === "undefined" ? height + margin * 2 : window.innerHeight
  const maxLeft = Math.max(margin, viewportWidth - width - margin)
  const maxTop = Math.max(margin, viewportHeight - height - margin)
  return {
    x: Math.min(Math.max(margin, anchor.x), maxLeft),
    y: Math.min(Math.max(margin, anchor.y), maxTop),
  }
}

function contextMenuStyle(position: BcGridContextMenuAnchor): CSSProperties {
  return {
    left: position.x,
    top: position.y,
  }
}
