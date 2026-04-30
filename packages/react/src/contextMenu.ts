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
  "export-csv",
  "export-xlsx",
]

const builtInLabels: Partial<Record<BcContextMenuBuiltinItem, string>> = {
  copy: "Copy",
  "copy-with-headers": "Copy with Headers",
  "export-csv": "Export CSV",
  "export-xlsx": "Export Excel",
}

const builtInShortcuts: Partial<Record<BcContextMenuBuiltinItem, string>> = {
  copy: "Ctrl+C",
  "copy-with-headers": "Ctrl+Shift+C",
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

export function contextMenuItemShortcut<TRow>(item: BcContextMenuItem<TRow>): string | undefined {
  if (isCustomContextMenuItem(item)) return item.shortcut
  return builtInShortcuts[item]
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
    return context.cell == null || context.row == null || context.column == null
  }
  return true
}

export function contextMenuItemDestructive<TRow>(item: BcContextMenuItem<TRow>): boolean {
  return isCustomContextMenuItem(item) && item.destructive === true
}
