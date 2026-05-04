import type { BcGridApi, BcRange, BcSelection, ColumnId, RowId } from "@bc-grid/core"
import { Columns3, Copy, Eye, EyeOff, MoveHorizontal, Pin, PinOff, Rows3 } from "lucide-react"
import type { ReactNode } from "react"
import { useEffect, useMemo } from "react"
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
import {
  CheckIcon,
  CircleIcon,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuItemIndicator,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "../shadcn/context-menu"
import type {
  BcContextMenuBuiltinItem,
  BcContextMenuContext,
  BcContextMenuItem,
  BcContextMenuItems,
} from "../types"

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
  onCloseAutoFocus?: ((event: Event) => void) | undefined
  resolvedColumns: readonly ResolvedColumn<TRow>[]
  rowId?: RowId | undefined
  rowsById: ReadonlyMap<RowId, RowEntry<TRow>>
  selection: BcSelection
}

export function BcGridContextMenu<TRow>({
  api,
  columnId,
  contextMenuItems,
  copyRangeToClipboard,
  clearSelection,
  onClose,
  onCloseAutoFocus,
  resolvedColumns,
  rowId,
  rowsById,
  selection,
}: BcGridContextMenuProps<TRow>): ReactNode {
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

  useEffect(() => {
    if (items.length === 0) onClose()
  }, [items.length, onClose])

  if (items.length === 0) return null

  const activate = (item: BcContextMenuItem<TRow>, checked?: boolean) => {
    if (isContextMenuSeparator(item)) return
    if (contextMenuItemDisabled(item, context)) return
    if (isContextMenuSubmenuItem(item)) return
    if (isContextMenuToggleItem(item)) {
      item.onToggle(context, checked ?? !contextMenuItemChecked(item, context))
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
      if (context.cell) {
        const range = { start: context.cell, end: context.cell }
        void copyRangeToClipboard(range, api).catch(() => undefined)
      }
    } else if (item === "copy-row") {
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
      const state = api.getColumnState()
      const next = state.map((entry) =>
        entry.hidden === true ? { ...entry, hidden: false } : entry,
      )
      api.setColumnState(next)
    } else if (item === "autosize-all-columns") {
      for (const entry of api.getColumnState()) {
        if (entry.hidden !== true) api.autoSizeColumn(entry.columnId)
      }
    }
  }

  const renderItem = (item: BcContextMenuItem<TRow>, index: number, keyPrefix = ""): ReactNode => {
    if (isContextMenuSeparator(item)) {
      return (
        <ContextMenuSeparator
          aria-orientation="horizontal"
          className="bc-grid-context-menu-separator"
          key={contextMenuItemKey(item, index)}
        />
      )
    }

    const key = `${keyPrefix}${contextMenuItemKey(item, index)}`
    const label = contextMenuItemLabel(item)
    const disabled = contextMenuItemDisabled(item, context)

    if (isContextMenuSubmenuItem(item)) {
      const subItems = resolveContextMenuSubmenuItems(item, context)
      return (
        <ContextMenuSub key={key}>
          <ContextMenuSubTrigger
            aria-disabled={disabled || undefined}
            className="bc-grid-menu-item bc-grid-context-menu-item"
            disabled={disabled}
          >
            <MenuIcon icon={null} />
            <span className="bc-grid-menu-item-label bc-grid-context-menu-label">{label}</span>
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="bc-grid-context-menu-submenu-content">
            {subItems.map((child, childIndex) => renderItem(child, childIndex, `${key}-`))}
          </ContextMenuSubContent>
        </ContextMenuSub>
      )
    }

    if (isContextMenuToggleItem(item)) {
      const checked = contextMenuItemChecked(item, context)
      if (item.selection === "radio") {
        return (
          <ContextMenuRadioGroup key={key} value={checked ? key : ""}>
            <ContextMenuRadioItem
              aria-disabled={disabled || undefined}
              className="bc-grid-menu-item bc-grid-context-menu-item"
              disabled={disabled}
              value={key}
              onSelect={() => activate(item, true)}
            >
              <MenuIcon
                icon={
                  <ContextMenuItemIndicator>
                    <CircleIcon className="bc-grid-context-menu-icon-svg" size={8} />
                  </ContextMenuItemIndicator>
                }
              />
              <span className="bc-grid-menu-item-label bc-grid-context-menu-label">{label}</span>
            </ContextMenuRadioItem>
          </ContextMenuRadioGroup>
        )
      }

      return (
        <ContextMenuCheckboxItem
          aria-disabled={disabled || undefined}
          checked={checked}
          className="bc-grid-menu-item bc-grid-context-menu-item"
          disabled={disabled}
          key={key}
          onCheckedChange={(next) => activate(item, next === true)}
        >
          <MenuIcon
            icon={
              <ContextMenuItemIndicator>
                <CheckIcon className="bc-grid-context-menu-icon-svg" size={14} />
              </ContextMenuItemIndicator>
            }
          />
          <span className="bc-grid-menu-item-label bc-grid-context-menu-label">{label}</span>
        </ContextMenuCheckboxItem>
      )
    }

    const icon = isCustomContextMenuItem(item) ? null : contextMenuBuiltinIcon(item)
    const variant =
      isCustomContextMenuItem(item) && item.variant === "destructive" ? "destructive" : undefined

    return (
      <ContextMenuItem
        aria-disabled={disabled || undefined}
        className="bc-grid-menu-item bc-grid-context-menu-item"
        data-variant={variant}
        disabled={disabled}
        key={key}
        onSelect={() => activate(item)}
      >
        <MenuIcon icon={icon} />
        <span className="bc-grid-menu-item-label bc-grid-context-menu-label">{label}</span>
      </ContextMenuItem>
    )
  }

  return (
    <ContextMenuContent
      aria-label="Context menu"
      className="bc-grid-context-menu"
      onCloseAutoFocus={onCloseAutoFocus}
    >
      {items.map((item, index) => renderItem(item, index))}
    </ContextMenuContent>
  )
}

export default BcGridContextMenu

function MenuIcon({ icon }: { icon: ReactNode }): ReactNode {
  return (
    <span aria-hidden="true" className="bc-grid-menu-item-leading bc-grid-context-menu-icon">
      {icon}
    </span>
  )
}

function contextMenuBuiltinIcon(item: BcContextMenuBuiltinItem): ReactNode | null {
  const iconProps = {
    "aria-hidden": true,
    className: "bc-grid-context-menu-icon-svg",
    size: 14,
    strokeWidth: 1.8,
  } as const
  switch (item) {
    case "copy":
    case "copy-cell":
    case "copy-with-headers":
      return <Copy {...iconProps} />
    case "copy-row":
      return <Rows3 {...iconProps} />
    case "pin-column-left":
    case "pin-column-right":
      return <Pin {...iconProps} />
    case "unpin-column":
      return <PinOff {...iconProps} />
    case "hide-column":
      return <EyeOff {...iconProps} />
    case "show-all-columns":
      return <Eye {...iconProps} />
    case "autosize-column":
      return <MoveHorizontal {...iconProps} />
    case "autosize-all-columns":
      return <Columns3 {...iconProps} />
    default:
      return null
  }
}
