import { filterHasColumn } from "./filter"
import type {
  BcContextMenuBuiltinItem,
  BcContextMenuContext,
  BcContextMenuCustomItem,
  BcContextMenuItem,
  BcContextMenuItems,
} from "./types"

export const DEFAULT_CONTEXT_MENU_ITEMS: readonly BcContextMenuBuiltinItem[] = [
  "copy",
  "copy-with-headers",
  "separator",
  "clear-selection",
  "clear-range",
]

const builtInLabels: Partial<Record<BcContextMenuBuiltinItem, string>> = {
  copy: "Copy",
  "copy-with-headers": "Copy with Headers",
  "clear-selection": "Clear Selection",
  "clear-range": "Clear Range",
  "clear-all-filters": "Clear All Filters",
  "clear-column-filter": "Clear Filter",
}

export function resolveContextMenuItems<TRow>(
  items: BcContextMenuItems<TRow> | undefined,
  context: BcContextMenuContext<TRow>,
): readonly BcContextMenuItem<TRow>[] {
  const resolved =
    typeof items === "function" ? items(context) : (items ?? DEFAULT_CONTEXT_MENU_ITEMS)
  return resolved.filter(isContextMenuItem)
}

function isContextMenuItem<TRow>(
  item: BcContextMenuItem<TRow> | false | null | undefined,
): item is BcContextMenuItem<TRow> {
  return item != null && item !== false
}

export function isContextMenuSeparator<TRow>(item: BcContextMenuItem<TRow>): item is "separator" {
  return item === "separator"
}

export function isCustomContextMenuItem<TRow>(
  item: BcContextMenuItem<TRow>,
): item is BcContextMenuCustomItem<TRow> {
  return typeof item === "object"
}

export function contextMenuItemKey<TRow>(item: BcContextMenuItem<TRow>, index: number): string {
  if (isCustomContextMenuItem(item)) return item.id
  if (isContextMenuSeparator(item)) return `separator-${index}`
  return item
}

export function contextMenuItemLabel<TRow>(item: BcContextMenuItem<TRow>): string {
  if (isCustomContextMenuItem(item)) return item.label
  return builtInLabels[item] ?? ""
}

export function contextMenuItemDisabled<TRow>(
  item: BcContextMenuItem<TRow>,
  context: BcContextMenuContext<TRow>,
): boolean {
  if (isContextMenuSeparator(item)) return true
  if (isCustomContextMenuItem(item)) {
    if (typeof item.disabled === "function") return item.disabled(context)
    return item.disabled === true
  }
  if (item === "copy" || item === "copy-with-headers") {
    return context.cell == null && context.api.getRangeSelection().ranges.length === 0
  }
  if (item === "clear-range") return context.api.getRangeSelection().ranges.length === 0
  if (item === "clear-selection") {
    return context.selection.mode === "explicit" && context.selection.rowIds.size === 0
  }
  if (item === "clear-all-filters") {
    // Disabled when no filter is active. Reads current filter via the
    // BcGridApi.getFilter() method added alongside this built-in.
    return context.api.getFilter() == null
  }
  if (item === "clear-column-filter") {
    // Disabled when there's no right-click cell context (the user
    // triggered the menu via Shift+F10 with no active cell, say) OR
    // when the active cell's column has no filter entry to clear.
    if (!context.cell) return true
    return !filterHasColumn(context.api.getFilter(), context.cell.columnId)
  }
  return false
}
