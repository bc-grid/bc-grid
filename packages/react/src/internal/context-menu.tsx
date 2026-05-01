import type { BcGridApi, BcRange, BcSelection, ColumnId, RowId } from "@bc-grid/core"
import type { CSSProperties, KeyboardEvent, ReactNode } from "react"
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react"
import {
  contextMenuItemDisabled,
  contextMenuItemKey,
  contextMenuItemLabel,
  isContextMenuSeparator,
  isCustomContextMenuItem,
  resolveContextMenuItems,
} from "../contextMenu"
import type { ResolvedColumn, RowEntry } from "../gridInternals"
import type { BcContextMenuContext, BcContextMenuItem, BcContextMenuItems } from "../types"
import { contextMenuBuiltinIcon } from "./context-menu-icons"

export interface BcGridContextMenuAnchor {
  x: number
  y: number
}

export interface BcGridContextMenuProps<TRow> {
  api: BcGridApi<TRow>
  anchor: BcGridContextMenuAnchor
  columnId?: ColumnId | undefined
  contextMenuItems?: BcContextMenuItems<TRow> | undefined
  copyRangeToClipboard: (
    requestedRange: BcRange | undefined,
    gridApi: BcGridApi<TRow>,
    options?: { includeHeaders?: boolean },
  ) => Promise<void>
  clearSelection: () => void
  onClose: () => void
  resolvedColumns: readonly ResolvedColumn<TRow>[]
  rowId: RowId
  rowsById: ReadonlyMap<RowId, RowEntry<TRow>>
  selection: BcSelection
}

export function BcGridContextMenu<TRow>({
  api,
  anchor,
  columnId,
  contextMenuItems,
  copyRangeToClipboard,
  clearSelection,
  onClose,
  resolvedColumns,
  rowId,
  rowsById,
  selection,
}: BcGridContextMenuProps<TRow>): ReactNode {
  const menuId = useId()
  const menuRef = useRef<HTMLDivElement | null>(null)
  const context = useMemo<BcContextMenuContext<TRow>>(() => {
    const entry = rowsById.get(rowId)
    return {
      api,
      cell: columnId ? { rowId, columnId } : null,
      column: columnId
        ? (resolvedColumns.find((candidate) => candidate.columnId === columnId)?.source ?? null)
        : null,
      row: entry?.kind === "data" ? entry.row : null,
      selection,
    }
  }, [api, columnId, resolvedColumns, rowId, rowsById, selection])
  const items = useMemo(
    () => resolveContextMenuItems(contextMenuItems, context),
    [context, contextMenuItems],
  )
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
    if (items.length === 0) onClose()
  }, [items.length, onClose])

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
    if (isCustomContextMenuItem(item)) {
      item.onSelect(context)
    } else if (item === "copy" || item === "copy-with-headers") {
      const activeRange = api.getRangeSelection().ranges.at(-1)
      const range =
        activeRange ?? (context.cell ? { start: context.cell, end: context.cell } : undefined)
      void copyRangeToClipboard(range, api, {
        includeHeaders: item === "copy-with-headers",
      }).catch(() => undefined)
    } else if (item === "clear-selection") {
      clearSelection()
    } else if (item === "clear-range") {
      api.clearRangeSelection()
    } else if (item === "clear-all-filters") {
      api.clearFilter()
    } else if (item === "clear-column-filter") {
      // Disabled-state predicate guards on `context.cell` already, but
      // the dispatch path checks again because activate() runs after
      // the disabled predicate may have changed (e.g., a custom item
      // mutating filter state on the same click).
      if (context.cell) api.clearFilter(context.cell.columnId)
    } else if (
      item === "pin-column-left" ||
      item === "pin-column-right" ||
      item === "unpin-column" ||
      item === "hide-column" ||
      item === "autosize-column"
    ) {
      const targetColumnId = context.cell?.columnId
      if (targetColumnId) dispatchColumnCommand(api, item, targetColumnId)
    }
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
        const disabled = contextMenuItemDisabled(item, context)
        const active = activeIndex === index
        const icon = isCustomContextMenuItem(item) ? null : contextMenuBuiltinIcon(item)
        return (
          <div
            aria-disabled={disabled || undefined}
            className="bc-grid-context-menu-item"
            data-active={active || undefined}
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
          >
            <span aria-hidden="true" className="bc-grid-context-menu-icon">
              {icon}
            </span>
            <span className="bc-grid-context-menu-label">{label}</span>
          </div>
        )
      })}
    </div>
  )
}

export default BcGridContextMenu

function dispatchColumnCommand<TRow>(
  api: BcGridApi<TRow>,
  command:
    | "pin-column-left"
    | "pin-column-right"
    | "unpin-column"
    | "hide-column"
    | "autosize-column",
  columnId: ColumnId,
): void {
  switch (command) {
    case "pin-column-left":
      api.setColumnPinned(columnId, "left")
      return
    case "pin-column-right":
      api.setColumnPinned(columnId, "right")
      return
    case "unpin-column":
      api.setColumnPinned(columnId, null)
      return
    case "hide-column":
      api.setColumnHidden(columnId, true)
      return
    case "autosize-column":
      api.autoSizeColumn(columnId)
      return
  }
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
