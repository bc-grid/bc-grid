import { describe, expect, test } from "bun:test"
import type { BcGridApi, BcSelection, ColumnId } from "@bc-grid/core"
import { contextMenuItemKey, resolveContextMenuItems } from "../src/contextMenu"
import {
  type BcGridChromeContextMenuOptions,
  buildGridChromeContextMenuItems,
} from "../src/internal/chrome-context-menu"
import type {
  BcContextMenuContext,
  BcContextMenuItem,
  BcContextMenuSubmenuItem,
  BcGridDensity,
  BcReactGridColumn,
} from "../src/types"

interface Row {
  id: string
}

const emptySelection: BcSelection = { mode: "explicit", rowIds: new Set() }
const emptyApi = {
  getRangeSelection: () => ({ ranges: [], anchor: null }),
  getFilter: () => null,
  getColumnState: () => [],
} as unknown as BcGridApi<Row>
const statusColumn = {
  columnId: "status",
  field: "id",
  header: "Status",
  groupable: true,
} as BcReactGridColumn<Row>

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

function toggle(
  items: readonly BcContextMenuItem<Row>[],
  id: string,
): Extract<BcContextMenuItem<Row>, { kind: "toggle" }> {
  const item = items.find((candidate) => typeof candidate === "object" && candidate.id === id)
  if (!item || typeof item !== "object" || item.kind !== "toggle") {
    throw new Error(`toggle ${id} not found`)
  }
  return item
}

function makeContext(
  overrides: Partial<BcContextMenuContext<Row>> = {},
): BcContextMenuContext<Row> {
  return {
    api: emptyApi,
    cell: null,
    column: null,
    row: null,
    selection: emptySelection,
    ...overrides,
  }
}

function headerContext(columnId: ColumnId = "status"): BcContextMenuContext<Row> {
  return makeContext({ column: statusColumn, columnId })
}

function options(
  overrides: Partial<BcGridChromeContextMenuOptions> = {},
): BcGridChromeContextMenuOptions {
  return {
    activeFilterSummaryLocked: false,
    activeFilterSummaryVisible: true,
    activeSidebarPanel: "columns",
    density: "normal",
    densityLocked: false,
    filterRowLocked: false,
    filterRowVisible: true,
    groupBy: [],
    groupableColumnIds: [],
    sidebarAvailable: true,
    sidebarPanels: [
      { id: "columns", label: "Columns" },
      { id: "filters", label: "Filters" },
    ],
    sidebarVisible: true,
    statusBarVisible: true,
    onActiveFilterSummaryVisibleChange: () => {},
    onDensityChange: () => {},
    onFilterRowVisibleChange: () => {},
    onGroupByChange: () => {},
    onSidebarPanelChange: () => {},
    onSidebarVisibleChange: () => {},
    onStatusBarVisibleChange: () => {},
    ...overrides,
  }
}

function buildItems(
  optionOverrides: Partial<BcGridChromeContextMenuOptions> = {},
  context: BcContextMenuContext<Row> = makeContext(),
): readonly BcContextMenuItem<Row>[] {
  return resolveContextMenuItems(
    buildGridChromeContextMenuItems<Row>(options(optionOverrides)),
    context,
  )
}

describe("buildGridChromeContextMenuItems", () => {
  test("adds Filter and View submenus around the existing default actions", () => {
    const items = buildItems()

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

  test("View submenu exposes filter row, sidebar, panels, status bar, active filters, and density", () => {
    const items = buildItems({
      activeFilterSummaryVisible: false,
      activeSidebarPanel: "filters",
      density: "comfortable",
      filterRowLocked: true,
      filterRowVisible: false,
      sidebarPanels: [
        { id: "columns", label: "Columns" },
        { id: "filters", label: "Filters" },
        { id: "pivot", label: "Pivot" },
      ],
      statusBarVisible: false,
    })
    const viewItems = submenu(items, "view").items as readonly BcContextMenuItem<Row>[]

    expect(itemIds(viewItems)).toEqual([
      "show-filter-row",
      "show-sidebar",
      "sidebar-panel",
      "show-status-bar",
      "show-active-filters",
      "density",
    ])
    expect(viewItems[0]).toMatchObject({
      kind: "toggle",
      checked: false,
      disabled: true,
    })
    expect(viewItems[1]).toMatchObject({ kind: "toggle", checked: true })
    expect(viewItems[3]).toMatchObject({ kind: "toggle", checked: false })
    expect(viewItems[4]).toMatchObject({ kind: "toggle", checked: false })

    const panelItems = submenu(viewItems, "sidebar-panel")
      .items as readonly BcContextMenuItem<Row>[]
    expect(itemIds(panelItems)).toEqual([
      "sidebar-panel-columns",
      "sidebar-panel-filters",
      "sidebar-panel-pivot",
    ])
    expect(panelItems[1]).toMatchObject({ kind: "toggle", checked: true })

    const densityItems = submenu(viewItems, "density").items as readonly BcContextMenuItem<Row>[]
    expect(itemIds(densityItems)).toEqual([
      "density-compact",
      "density-normal",
      "density-comfortable",
    ])
    expect(densityItems[2]).toMatchObject({
      kind: "toggle",
      selection: "radio",
      checked: true,
    })
  })

  test("Filter submenu opens the Filters panel through the supplied callback", () => {
    let panel: string | null = null
    const items = buildItems({
      activeSidebarPanel: null,
      sidebarPanels: [{ id: "filters", label: "Filters" }],
      sidebarVisible: false,
      onSidebarPanelChange: (next) => {
        panel = next
      },
    })
    const filterItems = submenu(items, "filter").items as readonly BcContextMenuItem<Row>[]
    const openFilters = filterItems[0]

    if (!openFilters || typeof openFilters !== "object" || openFilters.kind !== "item") {
      throw new Error("open filters action not found")
    }
    openFilters.onSelect(makeContext())

    expect(panel).toBe("filters")
  })

  test("header context adds Group and Pin submenus after View", () => {
    const bodyItems = buildItems({ groupableColumnIds: ["status"] })
    expect(itemIds(bodyItems)).not.toContain("group")
    expect(itemIds(bodyItems)).not.toContain("pin")

    const headerItems = buildItems({ groupableColumnIds: ["status"] }, headerContext())
    expect(itemIds(headerItems)).toEqual([
      "copy",
      "copy-row",
      "copy-with-headers",
      "separator-3",
      "filter",
      "view",
      "group",
      "pin",
      "separator-8",
      "clear-selection",
      "clear-range",
    ])

    const groupItems = submenu(headerItems, "group").items as readonly BcContextMenuItem<Row>[]
    expect(groupItems[0]).toMatchObject({
      kind: "toggle",
      id: "group-by-column",
      checked: false,
      disabled: false,
    })
    expect(itemIds(submenu(headerItems, "pin").items as readonly BcContextMenuItem<Row>[])).toEqual(
      ["pin-column-left", "pin-column-right", "unpin-column"],
    )
  })

  test("Group by this column updates the supplied groupBy list", () => {
    let nextGroupBy: readonly ColumnId[] | null = null
    const items = buildItems(
      {
        groupBy: ["region"],
        groupableColumnIds: ["status"],
        onGroupByChange: (next) => {
          nextGroupBy = next
        },
      },
      headerContext(),
    )
    const groupItems = submenu(items, "group").items as readonly BcContextMenuItem<Row>[]

    toggle(groupItems, "group-by-column").onToggle(headerContext(), true)
    expect(nextGroupBy).toEqual(["region", "status"])
  })

  test("unchecked density radio items select that density", () => {
    let nextDensity: BcGridDensity | null = null
    const items = buildItems({
      density: "normal",
      onDensityChange: (next) => {
        nextDensity = next
      },
    })
    const viewItems = submenu(items, "view").items as readonly BcContextMenuItem<Row>[]
    const densityItems = submenu(viewItems, "density").items as readonly BcContextMenuItem<Row>[]

    toggle(densityItems, "density-comfortable").onToggle(makeContext(), true)
    expect(nextDensity).toBe("comfortable")

    nextDensity = null
    toggle(densityItems, "density-normal").onToggle(makeContext(), false)
    expect(nextDensity).toBeNull()
  })
})
