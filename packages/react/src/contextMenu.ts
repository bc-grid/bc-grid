import { filterHasColumn } from "./filter"
import type {
  BcContextMenuBuiltinItem,
  BcContextMenuContext,
  BcContextMenuCustomItem,
  BcContextMenuItem,
  BcContextMenuItems,
  BcContextMenuSubmenuItem,
  BcContextMenuToggleItem,
} from "./types"

export const DEFAULT_CONTEXT_MENU_ITEMS: readonly BcContextMenuBuiltinItem[] = [
  // Clipboard — useful at every right-click point. `copy` adapts: it
  // uses the active range when one exists, otherwise the right-clicked
  // cell. `copy-row` covers the common bsncraft case ("copy this whole
  // line as TSV"). `copy-with-headers` joins clipboard headers for
  // paste-into-spreadsheet flows.
  "copy",
  "copy-row",
  "copy-with-headers",
  "separator",
  // Selection / range. Disabled-state predicates suppress the
  // affordance when there's nothing to clear.
  "clear-selection",
  "clear-range",
]

const builtInLabels: Partial<Record<BcContextMenuBuiltinItem, string>> = {
  copy: "Copy",
  "copy-cell": "Copy Cell",
  "copy-row": "Copy Row",
  "copy-with-headers": "Copy with Headers",
  "clear-selection": "Clear Selection",
  "clear-range": "Clear Range",
  "clear-all-filters": "Clear All Filters",
  "clear-column-filter": "Clear Filter",
  "pin-column-left": "Pin Left",
  "pin-column-right": "Pin Right",
  "unpin-column": "Unpin",
  "hide-column": "Hide Column",
  "show-all-columns": "Show All Columns",
  "autosize-column": "Autosize Column",
  "autosize-all-columns": "Autosize All Columns",
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
  return typeof item === "object" && item.kind !== "toggle" && item.kind !== "submenu"
}

export function isContextMenuToggleItem<TRow>(
  item: BcContextMenuItem<TRow>,
): item is BcContextMenuToggleItem<TRow> {
  return typeof item === "object" && item.kind === "toggle"
}

export function isContextMenuSubmenuItem<TRow>(
  item: BcContextMenuItem<TRow>,
): item is BcContextMenuSubmenuItem<TRow> {
  return typeof item === "object" && item.kind === "submenu"
}

export function isContextMenuObjectItem<TRow>(
  item: BcContextMenuItem<TRow>,
): item is
  | BcContextMenuCustomItem<TRow>
  | BcContextMenuToggleItem<TRow>
  | BcContextMenuSubmenuItem<TRow> {
  return typeof item === "object"
}

export function contextMenuItemKey<TRow>(item: BcContextMenuItem<TRow>, index: number): string {
  if (isContextMenuObjectItem(item)) return item.id
  if (isContextMenuSeparator(item)) return `separator-${index}`
  return item
}

export function contextMenuItemLabel<TRow>(item: BcContextMenuItem<TRow>): string {
  if (isContextMenuObjectItem(item)) return item.label
  return builtInLabels[item] ?? ""
}

export function contextMenuItemDisabled<TRow>(
  item: BcContextMenuItem<TRow>,
  context: BcContextMenuContext<TRow>,
): boolean {
  if (isContextMenuSeparator(item)) return true
  if (isContextMenuObjectItem(item)) {
    if (typeof item.disabled === "function" && item.disabled(context)) return true
    if (item.disabled === true) return true
    if (isContextMenuSubmenuItem(item))
      return resolveContextMenuSubmenuItems(item, context).length === 0
    return false
  }
  if (item === "copy" || item === "copy-with-headers") {
    return context.cell == null && context.api.getRangeSelection().ranges.length === 0
  }
  if (item === "copy-cell") {
    // `copy-cell` is the explicit single-cell variant — disabled when
    // the trigger has no cell context (e.g., Shift+F10 with no active
    // cell). The implicit-fallback `copy` item above accepts a range.
    return context.cell == null
  }
  if (item === "copy-row") {
    // `copy-row` needs a row, which the right-click trigger always has
    // when the user clicks on a data row. Header / filter-row clicks
    // surface a column without a row, so the cell context is the
    // accurate signal.
    return context.cell == null && context.row == null
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
  if (
    item === "pin-column-left" ||
    item === "pin-column-right" ||
    item === "unpin-column" ||
    item === "hide-column" ||
    item === "autosize-column"
  ) {
    return !columnCommandEnabled(item, context)
  }
  if (item === "show-all-columns") {
    // The bulk show-all command works on the grid's column state, not
    // the right-clicked column, so it doesn't need a column context.
    // Disabled when there's nothing to show — every column is already
    // visible.
    return context.api.getColumnState().every((entry) => entry.hidden !== true)
  }
  if (item === "autosize-all-columns") {
    // Same shape as show-all: column-state-driven, no column context
    // required. Disabled only when there are no visible columns to
    // measure (an edge case — the grid always has at least one).
    return context.api.getColumnState().every((entry) => entry.hidden === true)
  }
  return false
}

export function contextMenuItemChecked<TRow>(
  item: BcContextMenuItem<TRow>,
  context: BcContextMenuContext<TRow>,
): boolean {
  if (!isContextMenuToggleItem(item)) return false
  return typeof item.checked === "function" ? item.checked(context) : item.checked
}

export function resolveContextMenuSubmenuItems<TRow>(
  item: BcContextMenuSubmenuItem<TRow>,
  context: BcContextMenuContext<TRow>,
): readonly BcContextMenuItem<TRow>[] {
  const resolved = typeof item.items === "function" ? item.items(context) : item.items
  return resolved.filter(isContextMenuItem)
}

function columnCommandEnabled<TRow>(
  item: Extract<
    BcContextMenuBuiltinItem,
    "pin-column-left" | "pin-column-right" | "unpin-column" | "hide-column" | "autosize-column"
  >,
  context: BcContextMenuContext<TRow>,
): boolean {
  // All five column commands need a column-bound trigger context. Header
  // / cell / filter-row right-clicks supply `context.column`; Shift+F10
  // with no active cell does not.
  const targetColumnId = context.cell?.columnId ?? null
  if (!context.column || !targetColumnId) return false
  const columnState = context.api.getColumnState()
  const entry = columnState.find((row) => row.columnId === targetColumnId)
  const pinned = entry?.pinned ?? null
  if (item === "pin-column-left") return pinned !== "left"
  if (item === "pin-column-right") return pinned !== "right"
  if (item === "unpin-column") return pinned === "left" || pinned === "right"
  if (item === "hide-column") {
    if (entry?.hidden === true) return false
    // Refuse to hide the last visible column — the grid would become
    // useless and the user would have to re-show via the column chooser.
    // Mirrors the protection in ColumnVisibilityMenu.
    const visibleCount = columnState.filter((row) => row.hidden !== true).length
    return visibleCount > 1
  }
  // autosize-column: the column needs to be visible for the DOM measurement
  // to have anything to read, and not actively hidden by row state.
  return entry?.hidden !== true
}
