import type { BcContextMenuItem, BcContextMenuItems } from "../types"

export interface BcGridChromeContextMenuOptions {
  activeSidebarPanel: string | null
  filterRowLocked: boolean
  filterRowVisible: boolean
  sidebarAvailable: boolean
  sidebarPanels: readonly { id: string; label: string }[]
  sidebarVisible: boolean
  statusBarVisible: boolean
  onFilterRowVisibleChange: (next: boolean) => void
  onSidebarPanelChange: (panelId: string | null) => void
  onSidebarVisibleChange: (next: boolean) => void
  onStatusBarVisibleChange: (next: boolean) => void
}

export function buildGridChromeContextMenuItems<TRow>({
  activeSidebarPanel,
  filterRowLocked,
  filterRowVisible,
  onFilterRowVisibleChange,
  onSidebarPanelChange,
  onSidebarVisibleChange,
  onStatusBarVisibleChange,
  sidebarAvailable,
  sidebarPanels,
  sidebarVisible,
  statusBarVisible,
}: BcGridChromeContextMenuOptions): BcContextMenuItems<TRow> {
  const hasFiltersPanel = sidebarPanels.some((panel) => panel.id === "filters")
  const filterItems: BcContextMenuItem<TRow>[] = [
    {
      kind: "item",
      id: "open-filters-panel",
      label: "Open Filters panel",
      disabled: !hasFiltersPanel,
      onSelect: () => onSidebarPanelChange("filters"),
    },
    "separator",
    "clear-column-filter",
    "clear-all-filters",
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

  return [
    "copy",
    "copy-row",
    "copy-with-headers",
    "separator",
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
    "separator",
    "clear-selection",
    "clear-range",
  ]
}
