import { describe, expect, test } from "bun:test"
import type { BcGridApi, BcSelection, ColumnId } from "@bc-grid/core"
import { contextMenuItemKey, resolveContextMenuItems } from "../src/contextMenu"
import {
  type BcGridChromeContextMenuOptions,
  buildGridChromeContextMenuItems,
} from "../src/internal/chrome-context-menu"
import type {
  BcContextMenuContext,
  BcContextMenuCustomItem,
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

function actionItem(
  items: readonly BcContextMenuItem<Row>[],
  id: string,
): BcContextMenuCustomItem<Row> {
  const item = items.find((candidate) => typeof candidate === "object" && candidate.id === id)
  if (!item || typeof item !== "object" || item.kind === "submenu" || item.kind === "toggle") {
    throw new Error(`action ${id} not found`)
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

function rowContext(rowIndex = 2): BcContextMenuContext<Row> {
  return makeContext({
    cell: { rowId: "r1", columnId: "status" },
    column: statusColumn,
    columnId: "status",
    row: { id: "r1" },
    rowId: "r1",
    rowIndex,
  })
}

function options(
  overrides: Partial<BcGridChromeContextMenuOptions<Row>> = {},
): BcGridChromeContextMenuOptions<Row> {
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
  optionOverrides: Partial<BcGridChromeContextMenuOptions<Row>> = {},
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

  test("body row context omits Row submenu until edit-grid row actions are supplied", () => {
    expect(itemIds(buildItems({}, rowContext()))).not.toContain("row")
    expect(
      itemIds(buildItems({ rowActions: { onDelete: () => {} } }, headerContext())),
    ).not.toContain("row")
  })

  test("row context adds BcEditGrid Row submenu actions", () => {
    const items = buildItems(
      {
        rowActions: {
          onDelete: () => {},
          onDuplicateRow: () => {},
          onInsertRow: () => {},
        },
      },
      rowContext(),
    )

    expect(itemIds(items)).toEqual([
      "copy",
      "copy-row",
      "copy-with-headers",
      "separator-3",
      "filter",
      "view",
      "row",
      "separator-7",
      "clear-selection",
      "clear-range",
    ])

    const rowItems = submenu(items, "row").items as readonly BcContextMenuItem<Row>[]
    expect(itemIds(rowItems)).toEqual([
      "insert-row-above",
      "insert-row-below",
      "duplicate-row",
      "separator-3",
      "delete-row",
    ])
    expect(actionItem(rowItems, "delete-row")).toMatchObject({
      kind: "item",
      variant: "destructive",
      disabled: false,
    })
  })

  test("Row submenu invokes insert, duplicate, and confirmed delete callbacks", async () => {
    const inserted: unknown[] = []
    let duplicated: unknown = null
    let confirmed: unknown = null
    let deleted: unknown = null
    const ctx = rowContext()
    const items = buildItems(
      {
        rowActions: {
          confirmDelete: async (params) => {
            confirmed = params
            return true
          },
          onDelete: (row) => {
            deleted = row
          },
          onDuplicateRow: (params) => {
            duplicated = params
          },
          onInsertRow: (params) => {
            inserted.push(params)
          },
        },
      },
      ctx,
    )
    const rowItems = submenu(items, "row").items as readonly BcContextMenuItem<Row>[]

    actionItem(rowItems, "insert-row-above").onSelect(ctx)
    actionItem(rowItems, "insert-row-below").onSelect(ctx)
    actionItem(rowItems, "duplicate-row").onSelect(ctx)
    actionItem(rowItems, "delete-row").onSelect(ctx)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(inserted).toEqual([
      { row: { id: "r1" }, rowId: "r1", rowIndex: 2, at: 2, placement: "above" },
      { row: { id: "r1" }, rowId: "r1", rowIndex: 2, at: 3, placement: "below" },
    ])
    expect(duplicated).toEqual({ row: { id: "r1" }, rowId: "r1", rowIndex: 2 })
    expect(confirmed).toEqual({ row: { id: "r1" }, rowId: "r1", rowIndex: 2 })
    expect(deleted).toEqual({ id: "r1" })
  })

  test("Row delete action respects canDelete and consumer confirmation", async () => {
    let deleted = false
    const ctx = rowContext()
    const items = buildItems(
      {
        rowActions: {
          canDelete: () => false,
          confirmDelete: () => false,
          onDelete: () => {
            deleted = true
          },
        },
      },
      ctx,
    )
    const rowItems = submenu(items, "row").items as readonly BcContextMenuItem<Row>[]
    const deleteRow = actionItem(rowItems, "delete-row")

    expect(deleteRow).toMatchObject({ disabled: true, variant: "destructive" })
    deleteRow.onSelect(ctx)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(deleted).toBe(false)
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
