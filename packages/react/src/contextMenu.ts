import type { BcServerGridApi, ServerRowModelMode } from "@bc-grid/core"
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

export const DEFAULT_CONTEXT_MENU_ITEMS: readonly BcContextMenuItem<unknown>[] = [
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
  // Server submenu — only renders for `<BcServerGrid>` mounts (probed
  // at runtime via `getActiveRowModelMode`). Items inside gate further
  // on the resolved active mode so each mode surfaces only the actions
  // that make sense for it.
  {
    kind: "submenu",
    id: "server",
    label: "Server",
    items: (ctx) => buildServerSubmenuItems(ctx),
  },
]

const PREFETCH_AHEAD_DEFAULT = 1
const PREFETCH_AHEAD_OPTIONS: readonly { value: number; label: string }[] = [
  { value: 0, label: "0 (off)" },
  { value: 1, label: "1 (default)" },
  { value: 2, label: "2 blocks" },
  { value: 3, label: "3 blocks" },
]

function buildServerSubmenuItems<TRow>(
  ctx: BcContextMenuContext<TRow>,
): readonly BcContextMenuItem<TRow>[] {
  const serverApi = asServerApi(ctx.api)
  if (!serverApi) return []
  const mode = serverApi.getActiveRowModelMode()
  const items: BcContextMenuItem<TRow>[] = []

  if (mode === "paged") {
    items.push({
      kind: "toggle",
      id: "server-show-pagination",
      label: "Show pagination",
      checked: (c) => c.api.getVisibleSetting("pagination") !== false,
      onToggle: (c, next) => c.api.setVisibleSetting("pagination", next),
    })
  }

  if (mode === "tree") {
    if (items.length > 0) items.push("separator")
    items.push(
      {
        kind: "item",
        id: "server-expand-all",
        label: "Expand all groups",
        onSelect: (c) => c.api.expandAll(),
      },
      {
        kind: "item",
        id: "server-collapse-all",
        label: "Collapse all groups",
        onSelect: (c) => c.api.collapseAll(),
      },
    )
  }

  if (mode === "infinite") {
    if (items.length > 0) items.push("separator")
    items.push({
      kind: "submenu",
      id: "server-prefetch-ahead",
      label: "Prefetch ahead",
      items: PREFETCH_AHEAD_OPTIONS.map(
        (option): BcContextMenuItem<TRow> => ({
          kind: "toggle",
          selection: "radio",
          id: `server-prefetch-ahead-${option.value}`,
          label: option.label,
          checked: (c) => resolveActivePrefetchAhead(c) === option.value,
          onToggle: (c) => {
            c.api.setPrefetchAhead(option.value)
          },
        }),
      ),
    })
  }

  return items
}

function resolveActivePrefetchAhead<TRow>(ctx: BcContextMenuContext<TRow>): number {
  const stored = ctx.api.getPrefetchAhead()
  if (typeof stored === "number" && Number.isFinite(stored)) {
    return Math.max(0, Math.floor(stored))
  }
  return PREFETCH_AHEAD_DEFAULT
}

function asServerApi<TRow>(api: BcContextMenuContext<TRow>["api"]): BcServerGridApi<TRow> | null {
  // Runtime probe: BcServerGridApi extends BcGridApi with
  // `getActiveRowModelMode`. The default context menu doesn't know
  // ahead of time whether the host mounted `<BcGrid>` or
  // `<BcServerGrid>`, so we check at item-build time.
  if (typeof (api as Partial<BcServerGridApi<TRow>>).getActiveRowModelMode === "function") {
    return api as BcServerGridApi<TRow>
  }
  return null
}

// Re-exported for unit testability — lets tests assert the returned
// items shape against a stub api without spinning up a full grid.
export function _resolveServerSubmenuItems<TRow>(
  ctx: BcContextMenuContext<TRow>,
): readonly BcContextMenuItem<TRow>[] {
  return buildServerSubmenuItems(ctx)
}

// Re-exported for unit testability — lets tests assert mode resolution
// independently of the React render path.
export function _resolveServerActiveMode<TRow>(
  ctx: BcContextMenuContext<TRow>,
): ServerRowModelMode | null {
  const serverApi = asServerApi(ctx.api)
  return serverApi ? serverApi.getActiveRowModelMode() : null
}

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
  // DEFAULT_CONTEXT_MENU_ITEMS is typed against `unknown` because it's a
  // module-scope constant that has to outlive any single grid's TRow.
  // The cast here is safe: the items inside use `(c: BcContextMenuContext<TRow>)`
  // shape only via the submenu's `items` builder, which receives the
  // typed context at call time.
  const resolved =
    typeof items === "function"
      ? items(context)
      : (items ?? (DEFAULT_CONTEXT_MENU_ITEMS as readonly BcContextMenuItem<TRow>[]))
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
    if (!context.columnId) return true
    return !filterHasColumn(context.api.getFilter(), context.columnId)
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
  const targetColumnId = context.columnId ?? null
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
