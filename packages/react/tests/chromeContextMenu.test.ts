import { describe, expect, test } from "bun:test"
import { contextMenuItemKey } from "../src/contextMenu"
import { buildGridChromeContextMenuItems } from "../src/internal/chrome-context-menu"
import type { BcContextMenuItem, BcContextMenuSubmenuItem } from "../src/types"

interface Row {
  id: string
}

function itemIds(items: readonly BcContextMenuItem<Row>[]): string[] {
  return items.map((item, index) => contextMenuItemKey(item, index))
}

function submenu(
  items: readonly BcContextMenuItem<Row>[],
  id: string,
): BcContextMenuSubmenuItem<Row> {
  const item = items.find((candidate) => typeof candidate === "object" && candidate.id === id)
  if (!item || typeof item !== "object" || item.kind !== "submenu") {
    throw new Error(`submenu ${id} not found`)
  }
  return item
}

describe("buildGridChromeContextMenuItems", () => {
  test("adds Filter and View submenus around the existing default actions", () => {
    const items = buildGridChromeContextMenuItems<Row>({
      activeSidebarPanel: "columns",
      filterRowLocked: false,
      filterRowVisible: true,
      sidebarAvailable: true,
      sidebarPanels: [
        { id: "columns", label: "Columns" },
        { id: "filters", label: "Filters" },
      ],
      sidebarVisible: true,
      statusBarVisible: true,
      onFilterRowVisibleChange: () => {},
      onSidebarPanelChange: () => {},
      onSidebarVisibleChange: () => {},
      onStatusBarVisibleChange: () => {},
    }) as readonly BcContextMenuItem<Row>[]

    expect(itemIds(items)).toEqual([
      "copy",
      "copy-row",
      "copy-with-headers",
      "separator-3",
      "filter",
      "view",
      "separator-6",
      "clear-selection",
      "clear-range",
    ])
  })

  test("View submenu exposes filter row, sidebar, sidebar panel, and status bar toggles", () => {
    const items = buildGridChromeContextMenuItems<Row>({
      activeSidebarPanel: "filters",
      filterRowLocked: true,
      filterRowVisible: false,
      sidebarAvailable: true,
      sidebarPanels: [
        { id: "columns", label: "Columns" },
        { id: "filters", label: "Filters" },
        { id: "pivot", label: "Pivot" },
      ],
      sidebarVisible: true,
      statusBarVisible: false,
      onFilterRowVisibleChange: () => {},
      onSidebarPanelChange: () => {},
      onSidebarVisibleChange: () => {},
      onStatusBarVisibleChange: () => {},
    }) as readonly BcContextMenuItem<Row>[]
    const viewItems = submenu(items, "view").items as readonly BcContextMenuItem<Row>[]

    expect(itemIds(viewItems)).toEqual([
      "show-filter-row",
      "show-sidebar",
      "sidebar-panel",
      "show-status-bar",
    ])
    expect(viewItems[0]).toMatchObject({
      kind: "toggle",
      checked: false,
      disabled: true,
    })
    expect(viewItems[1]).toMatchObject({ kind: "toggle", checked: true })
    expect(viewItems[3]).toMatchObject({ kind: "toggle", checked: false })

    const panelItems = submenu(viewItems, "sidebar-panel")
      .items as readonly BcContextMenuItem<Row>[]
    expect(itemIds(panelItems)).toEqual([
      "sidebar-panel-columns",
      "sidebar-panel-filters",
      "sidebar-panel-pivot",
    ])
    expect(panelItems[1]).toMatchObject({ kind: "toggle", checked: true })
  })

  test("Filter submenu opens the Filters panel through the supplied callback", () => {
    let panel: string | null = null
    const items = buildGridChromeContextMenuItems<Row>({
      activeSidebarPanel: null,
      filterRowLocked: false,
      filterRowVisible: false,
      sidebarAvailable: true,
      sidebarPanels: [{ id: "filters", label: "Filters" }],
      sidebarVisible: false,
      statusBarVisible: true,
      onFilterRowVisibleChange: () => {},
      onSidebarPanelChange: (next) => {
        panel = next
      },
      onSidebarVisibleChange: () => {},
      onStatusBarVisibleChange: () => {},
    }) as readonly BcContextMenuItem<Row>[]
    const filterItems = submenu(items, "filter").items as readonly BcContextMenuItem<Row>[]
    const openFilters = filterItems[0]

    if (!openFilters || typeof openFilters !== "object" || openFilters.kind !== "item") {
      throw new Error("open filters action not found")
    }
    openFilters.onSelect({} as Parameters<typeof openFilters.onSelect>[0])

    expect(panel).toBe("filters")
  })
})
