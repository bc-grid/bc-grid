import type { BcGridApi, BcRange, BcSelection, ColumnId, RowId } from "@bc-grid/core"
import type { CSSProperties, KeyboardEvent, ReactNode } from "react"
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react"
import { dispatchColumnCommand } from "../columnCommands"
import {
  contextMenuItemChecked,
  contextMenuItemDisabled,
  contextMenuItemKey,
  contextMenuItemLabel,
  isContextMenuSeparator,
  isContextMenuSubmenuItem,
  isContextMenuToggleItem,
  isCustomContextMenuItem,
  resolveContextMenuItems,
  resolveContextMenuSubmenuItems,
} from "../contextMenu"
import type { ResolvedColumn, RowEntry } from "../gridInternals"
import type { BcContextMenuContext, BcContextMenuItem, BcContextMenuItems } from "../types"
import { contextMenuBuiltinIcon } from "./context-menu-icons"
import { DisclosureChevron } from "./disclosure-icon"
import { BcGridMenuItem, BcGridMenuToggleItem } from "./menu-item"
import { usePopupDismiss } from "./popup-dismiss"
import { computePopupPosition } from "./popup-position"

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
  rowId?: RowId | undefined
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
    const entry = rowId != null ? rowsById.get(rowId) : undefined
    return {
      api,
      cell: rowId != null && columnId ? { rowId, columnId } : null,
      column: columnId
        ? (resolvedColumns.find((candidate) => candidate.columnId === columnId)?.source ?? null)
        : null,
      columnId,
      row: entry?.kind === "data" ? entry.row : null,
      rowId: entry?.kind === "data" ? entry.rowId : undefined,
      rowIndex: entry?.kind === "data" ? entry.index : undefined,
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

  // Shared dismiss-and-focus-return contract — Escape closes, outside
  // pointer-down closes (pointer events inside the menu root are
  // skipped via the popupRef containment check), focus returns to the
  // trigger element when the menu unmounts.
  usePopupDismiss({ open: true, onClose, popupRef: menuRef })

  if (items.length === 0) return null

  const activeItemId = activeIndex >= 0 ? `${menuId}-item-${activeIndex}` : undefined

  const activate = (item: BcContextMenuItem<TRow>) => {
    if (isContextMenuSeparator(item)) return
    if (contextMenuItemDisabled(item, context)) return
    if (isContextMenuSubmenuItem(item)) {
      return
    }
    if (isContextMenuToggleItem(item)) {
      item.onToggle(context, !contextMenuItemChecked(item, context))
    } else if (isCustomContextMenuItem(item)) {
      item.onSelect(context)
    } else if (item === "copy" || item === "copy-with-headers") {
      const activeRange = api.getRangeSelection().ranges.at(-1)
      const range =
        activeRange ?? (context.cell ? { start: context.cell, end: context.cell } : undefined)
      void copyRangeToClipboard(range, api, {
        includeHeaders: item === "copy-with-headers",
      }).catch(() => undefined)
    } else if (item === "copy-cell") {
      // Explicit single-cell variant: ignores any active range and
      // copies just the right-clicked cell. The disabled predicate
      // already guarded on `context.cell`, but re-check defensively
      // because activate() can fire after async predicate-state churn.
      if (context.cell) {
        const range = { start: context.cell, end: context.cell }
        void copyRangeToClipboard(range, api).catch(() => undefined)
      }
    } else if (item === "copy-row") {
      // Build a range that spans every visible column of the
      // right-clicked row, then dispatch through the existing
      // copy-range path. `resolvedColumns` is the post-state ordered
      // visible-column list, so the clipboard TSV matches the grid's
      // visible row order.
      if (context.cell && resolvedColumns.length > 0) {
        const firstColumnId = resolvedColumns[0]?.columnId
        const lastColumnId = resolvedColumns[resolvedColumns.length - 1]?.columnId
        if (firstColumnId && lastColumnId) {
          const range = {
            start: { rowId: context.cell.rowId, columnId: firstColumnId },
            end: { rowId: context.cell.rowId, columnId: lastColumnId },
          }
          void copyRangeToClipboard(range, api).catch(() => undefined)
        }
      }
    } else if (item === "clear-selection") {
      clearSelection()
    } else if (item === "clear-range") {
      api.clearRangeSelection()
    } else if (item === "clear-all-filters") {
      api.clearFilter()
    } else if (item === "clear-column-filter") {
      // Disabled-state predicate guards on `context.columnId` already, but
      // the dispatch path checks again because activate() runs after
      // the disabled predicate may have changed (e.g., a custom item
      // mutating filter state on the same click).
      if (context.columnId) api.clearFilter(context.columnId)
    } else if (
      item === "pin-column-left" ||
      item === "pin-column-right" ||
      item === "unpin-column" ||
      item === "hide-column" ||
      item === "autosize-column"
    ) {
      const targetColumnId = context.columnId
      if (targetColumnId) dispatchColumnCommand(api, item, targetColumnId)
    } else if (item === "show-all-columns") {
      // Bulk show: collapse every hidden flag to false in a single
      // setColumnState write so the grid renders once, not N times.
      const state = api.getColumnState()
      const next = state.map((entry) =>
        entry.hidden === true ? { ...entry, hidden: false } : entry,
      )
      api.setColumnState(next)
    } else if (item === "autosize-all-columns") {
      // Bulk autosize: loop the existing per-column API. Each call
      // measures + writes column state; multiple writes are acceptable
      // here because autoSizeColumn is rarely on the hot path.
      for (const entry of api.getColumnState()) {
        if (entry.hidden !== true) api.autoSizeColumn(entry.columnId)
      }
    }
    onClose()
  }

  const renderItem = (
    item: BcContextMenuItem<TRow>,
    index: number,
    keyPrefix = "",
    nested = false,
  ): ReactNode => {
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

    const key = `${keyPrefix}${contextMenuItemKey(item, index)}`
    const label = contextMenuItemLabel(item)
    const disabled = contextMenuItemDisabled(item, context)
    const active = !nested && activeIndex === index

    if (isContextMenuSubmenuItem(item)) {
      const subItems = resolveContextMenuSubmenuItems(item, context)
      return (
        <div className="bc-grid-context-menu-submenu" data-open={active || undefined} key={key}>
          <BcGridMenuItem
            active={active}
            aria-haspopup="menu"
            aria-expanded={active || undefined}
            disabled={disabled}
            id={nested ? undefined : `${menuId}-item-${index}`}
            label={label}
            leading={null}
            trailing={<DisclosureChevron className="bc-grid-context-menu-chevron" />}
            onClick={(event) => event.stopPropagation()}
            onActivate={() => activate(item)}
            onMouseEnter={() => {
              if (!nested) setActiveIndex(index)
            }}
          />
          <div className="bc-grid-context-menu-submenu-content" role="menu">
            {subItems.map((child, childIndex) => renderItem(child, childIndex, `${key}-`, true))}
          </div>
        </div>
      )
    }

    if (isContextMenuToggleItem(item)) {
      const selectionProps = item.selection ? { selection: item.selection } : {}
      return (
        <BcGridMenuToggleItem
          active={active}
          checked={contextMenuItemChecked(item, context)}
          disabled={disabled}
          id={nested ? undefined : `${menuId}-item-${index}`}
          key={key}
          label={label}
          {...selectionProps}
          onClick={(event) => event.stopPropagation()}
          onActivate={() => activate(item)}
          onMouseEnter={() => {
            if (!nested) setActiveIndex(index)
          }}
        />
      )
    }

    const icon = isCustomContextMenuItem(item) ? null : contextMenuBuiltinIcon(item)
    // Custom items can opt into shadcn's destructive treatment via
    // `variant: "destructive"`. The renderer emits the same
    // `data-variant` attribute shadcn DropdownMenu uses so consumer
    // CSS can target it identically. Built-in IDs don't have a
    // destructive flavour today (none of the bundled commands are
    // irreversible), so the attribute is omitted for them.
    const variant =
      isCustomContextMenuItem(item) && item.variant === "destructive" ? "destructive" : undefined
    return (
      <BcGridMenuItem
        active={active}
        disabled={disabled}
        data-variant={variant}
        id={nested ? undefined : `${menuId}-item-${index}`}
        key={key}
        label={label}
        leading={icon}
        onClick={(event) => event.stopPropagation()}
        onActivate={() => activate(item)}
        onMouseEnter={() => {
          if (!nested) setActiveIndex(index)
        }}
      />
    )
  }

  return (
    <div
      aria-activedescendant={activeItemId}
      aria-label="Context menu"
      className="bc-grid-context-menu"
      // Radix-style placement / state attributes for consumer CSS
      // hooks. The right-click context menu is point-anchored and
      // unmount-on-close, so these are constants — but they're set
      // so apps can target the popup exactly the same way they would
      // a Radix `[data-state="open"][data-side="bottom"]` rule.
      data-state="open"
      data-side="bottom"
      data-align="start"
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
      {items.map((item, index) => renderItem(item, index))}
    </div>
  )
}

export default BcGridContextMenu

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

function clampContextMenu(
  anchor: BcGridContextMenuAnchor,
  width: number,
  height: number,
): { x: number; y: number } {
  const margin = 8
  // Right-click context menu = point anchor — the click coordinate is
  // where the popup's top-left should land, viewport-clamped. Shared
  // helper enforces the same margin / clamp rule used by every popup.
  const viewportWidth = typeof window === "undefined" ? width + margin * 2 : window.innerWidth
  const viewportHeight = typeof window === "undefined" ? height + margin * 2 : window.innerHeight
  const position = computePopupPosition({
    anchor: { x: anchor.x, y: anchor.y },
    popup: { width, height },
    viewport: { width: viewportWidth, height: viewportHeight },
    viewportMargin: margin,
  })
  return { x: position.x, y: position.y }
}

function contextMenuStyle(position: BcGridContextMenuAnchor): CSSProperties {
  return {
    left: position.x,
    top: position.y,
  }
}
