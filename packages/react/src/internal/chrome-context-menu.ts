import type { ColumnId } from "@bc-grid/core"
import type {
  BcContextMenuContext,
  BcContextMenuItem,
  BcContextMenuItems,
  BcEditGridInsertRowParams,
  BcEditGridRowActionParams,
  BcGridDensity,
} from "../types"

export interface BcGridChromeContextMenuRowActions<TRow> {
  canDelete?: ((row: TRow) => boolean) | undefined
  confirmDelete?:
    | ((params: BcEditGridRowActionParams<TRow>) => boolean | Promise<boolean>)
    | undefined
  onDelete?: ((row: TRow) => void) | undefined
  onDuplicateRow?: ((params: BcEditGridRowActionParams<TRow>) => void) | undefined
  onInsertRow?: ((params: BcEditGridInsertRowParams<TRow>) => void) | undefined
}

export interface BcGridChromeContextMenuOptions<TRow = unknown> {
  activeSidebarPanel: string | null
  activeFilterSummaryLocked: boolean
  activeFilterSummaryVisible: boolean
  density: BcGridDensity
  densityLocked: boolean
  filterRowLocked: boolean
  filterRowVisible: boolean
  groupBy: readonly ColumnId[]
  groupableColumnIds: readonly ColumnId[]
  rowActions?: BcGridChromeContextMenuRowActions<TRow> | undefined
  sidebarAvailable: boolean
  sidebarPanels: readonly { id: string; label: string }[]
  sidebarVisible: boolean
  statusBarVisible: boolean
  onActiveFilterSummaryVisibleChange: (next: boolean) => void
  onDensityChange: (next: BcGridDensity) => void
  onFilterRowVisibleChange: (next: boolean) => void
  onGroupByChange: (next: readonly ColumnId[]) => void
  onSidebarPanelChange: (panelId: string | null) => void
  onSidebarVisibleChange: (next: boolean) => void
  onStatusBarVisibleChange: (next: boolean) => void
}

const DENSITY_OPTIONS: readonly { id: BcGridDensity; label: string }[] = [
  { id: "compact", label: "Compact" },
  { id: "normal", label: "Normal" },
  { id: "comfortable", label: "Comfortable" },
]

export function buildGridChromeContextMenuItems<TRow>(
  options: BcGridChromeContextMenuOptions<TRow>,
): BcContextMenuItems<TRow> {
  return (context) => buildGridChromeContextMenuItemsForContext(context, options)
}

function buildGridChromeContextMenuItemsForContext<TRow>(
  context: BcContextMenuContext<TRow>,
  {
    activeFilterSummaryLocked,
    activeFilterSummaryVisible,
    activeSidebarPanel,
    density,
    densityLocked,
    filterRowLocked,
    filterRowVisible,
    groupBy,
    groupableColumnIds,
    onActiveFilterSummaryVisibleChange,
    onDensityChange,
    onFilterRowVisibleChange,
    onGroupByChange,
    onSidebarPanelChange,
    onSidebarVisibleChange,
    onStatusBarVisibleChange,
    rowActions,
    sidebarAvailable,
    sidebarPanels,
    sidebarVisible,
    statusBarVisible,
  }: BcGridChromeContextMenuOptions<TRow>,
): readonly BcContextMenuItem<TRow>[] {
  const hasFiltersPanel = sidebarPanels.some((panel) => panel.id === "filters")
  const headerColumnId = headerColumnIdForContext(context)
  const contextColumnId = columnIdForContext(context)
  const groupableColumnIdSet = new Set(groupableColumnIds)
  const canGroupHeaderColumn = headerColumnId != null && groupableColumnIdSet.has(headerColumnId)
  const filterItems: BcContextMenuItem<TRow>[] = [
    {
      kind: "item",
      id: "open-filters-panel",
      label: "Open Filters panel",
      disabled: !hasFiltersPanel,
      onSelect: () => onSidebarPanelChange("filters"),
    },
  ]
  const columnItems: readonly BcContextMenuItem<TRow>[] = [
    "pin-column-left",
    "pin-column-right",
    "unpin-column",
    "hide-column",
    "autosize-column",
    "separator",
    "show-all-columns",
    "autosize-all-columns",
    "clear-column-filter",
  ]
  const viewItems: BcContextMenuItem<TRow>[] = [
    {
      kind: "toggle",
      id: "show-filter-row",
      label: "Show filter row",
      checked: filterRowVisible,
      disabled: filterRowLocked,
      onToggle: (_ctx, next) => onFilterRowVisibleChange(next),
    },
    {
      kind: "toggle",
      id: "show-sidebar",
      label: "Show sidebar",
      checked: sidebarVisible,
      disabled: !sidebarAvailable,
      onToggle: (_ctx, next) => onSidebarVisibleChange(next),
    },
  ]

  if (sidebarVisible && sidebarPanels.length > 0) {
    viewItems.push({
      kind: "submenu",
      id: "sidebar-panel",
      label: "Sidebar panel",
      items: sidebarPanels.map((panel) => ({
        kind: "toggle",
        id: `sidebar-panel-${panel.id}`,
        label: panel.label,
        checked: activeSidebarPanel === panel.id,
        onToggle: (_ctx, next) => {
          onSidebarPanelChange(next || activeSidebarPanel !== panel.id ? panel.id : null)
        },
      })),
    })
  }

  viewItems.push({
    kind: "toggle",
    id: "show-status-bar",
    label: "Show status bar",
    checked: statusBarVisible,
    onToggle: (_ctx, next) => onStatusBarVisibleChange(next),
  })
  viewItems.push({
    kind: "toggle",
    id: "show-active-filters",
    label: "Show active filters",
    checked: activeFilterSummaryVisible,
    disabled: activeFilterSummaryLocked,
    onToggle: (_ctx, next) => onActiveFilterSummaryVisibleChange(next),
  })
  viewItems.push({
    kind: "submenu",
    id: "density",
    label: "Density",
    items: DENSITY_OPTIONS.map((option) => ({
      kind: "toggle",
      selection: "radio",
      id: `density-${option.id}`,
      label: option.label,
      checked: density === option.id,
      disabled: densityLocked,
      onToggle: (_ctx, next) => {
        if (next || density !== option.id) onDensityChange(option.id)
      },
    })),
  })

  const items: BcContextMenuItem<TRow>[] = [
    "copy",
    "copy-row",
    "copy-with-headers",
    "separator",
    "clear-all-filters",
  ]

  if (contextColumnId) {
    items.push({
      kind: "submenu",
      id: "column",
      label: "Column",
      items: columnItems,
    })
  }

  items.push(
    {
      kind: "submenu",
      id: "filter",
      label: "Filter",
      items: filterItems,
    },
    {
      kind: "submenu",
      id: "view",
      label: "View",
      items: viewItems,
    },
  )

  const rowItems = buildRowActionItems(context, rowActions)
  if (rowItems.length > 0) {
    items.push({
      kind: "submenu",
      id: "row",
      label: "Row",
      items: rowItems,
    })
  }

  if (headerColumnId && groupableColumnIds.length > 0) {
    items.push({
      kind: "submenu",
      id: "group",
      label: "Group",
      items: [
        {
          kind: "toggle",
          id: "group-by-column",
          label: "Group by this column",
          checked: groupBy.includes(headerColumnId),
          disabled: !canGroupHeaderColumn,
          onToggle: (_ctx, next) => {
            if (!canGroupHeaderColumn) return
            onGroupByChange(toggleGroupBy(groupBy, headerColumnId, next))
          },
        },
      ],
    })
  }

  items.push("separator", "clear-selection", "clear-range")
  return items
}

function columnIdForContext<TRow>(context: BcContextMenuContext<TRow>): ColumnId | undefined {
  return context.column && context.columnId ? context.columnId : undefined
}

function headerColumnIdForContext<TRow>(context: BcContextMenuContext<TRow>): ColumnId | undefined {
  if (context.row != null || context.cell != null) return undefined
  return context.columnId
}

function buildRowActionItems<TRow>(
  context: BcContextMenuContext<TRow>,
  rowActions: BcGridChromeContextMenuRowActions<TRow> | undefined,
): readonly BcContextMenuItem<TRow>[] {
  if (!rowActions || context.row == null || context.rowId == null || context.rowIndex == null) {
    return []
  }

  const params: BcEditGridRowActionParams<TRow> = {
    row: context.row,
    rowId: context.rowId,
    rowIndex: context.rowIndex,
  }
  const items: BcContextMenuItem<TRow>[] = []

  if (rowActions.onInsertRow) {
    items.push(
      {
        kind: "item",
        id: "insert-row-above",
        label: "Insert row above",
        onSelect: () =>
          rowActions.onInsertRow?.({
            ...params,
            at: params.rowIndex,
            placement: "above",
          }),
      },
      {
        kind: "item",
        id: "insert-row-below",
        label: "Insert row below",
        onSelect: () =>
          rowActions.onInsertRow?.({
            ...params,
            at: params.rowIndex + 1,
            placement: "below",
          }),
      },
    )
  }

  if (rowActions.onDuplicateRow) {
    items.push({
      kind: "item",
      id: "duplicate-row",
      label: "Duplicate row",
      onSelect: () => rowActions.onDuplicateRow?.(params),
    })
  }

  if (rowActions.onDelete) {
    if (items.length > 0) items.push("separator")
    items.push({
      kind: "item",
      id: "delete-row",
      label: "Delete row",
      variant: "destructive",
      disabled: rowActions.canDelete ? !rowActions.canDelete(params.row) : false,
      onSelect: () => {
        void runDeleteRowAction(rowActions, params)
      },
    })
  }

  return items
}

async function runDeleteRowAction<TRow>(
  rowActions: BcGridChromeContextMenuRowActions<TRow>,
  params: BcEditGridRowActionParams<TRow>,
): Promise<void> {
  const confirmed = await rowActions.confirmDelete?.(params)
  if (confirmed === false) return
  rowActions.onDelete?.(params.row)
}

function toggleGroupBy(
  groupBy: readonly ColumnId[],
  columnId: ColumnId,
  next: boolean,
): readonly ColumnId[] {
  if (next) {
    if (groupBy.includes(columnId)) return groupBy
    return [...groupBy, columnId]
  }
  return groupBy.filter((candidate) => candidate !== columnId)
}
