import { describe, expect, test } from "bun:test"
import { emptyBcPivotState } from "@bc-grid/core"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import {
  BcFiltersToolPanel,
  activeFilterToolPanelItems,
  buildFilterToolPanelItems,
  isFilterToolPanelDraftActive,
} from "../src/filterToolPanel"
import { defaultMessages } from "../src/gridInternals"
import { resolveSidebarPanels } from "../src/sidebar"
import type { BcReactGridColumn, BcSidebarContext } from "../src/types"

interface Row {
  account: string
  approved: boolean
  balance: number
  notes: string
  postedOn: string
}

const columns: readonly BcReactGridColumn<Row>[] = [
  { field: "account", header: "Account" },
  { field: "balance", header: "Balance", filter: { type: "number" } },
  { columnId: "postedOn", field: "postedOn", header: "Posted", filter: { type: "date" } },
  { field: "approved", header: "Approved", filter: { type: "boolean" } },
  { field: "notes", header: "Notes", filter: false },
]

function sidebarContext(columnFilterText: Record<string, string> = {}): BcSidebarContext<Row> {
  return {
    api: {} as BcSidebarContext<Row>["api"],
    clearColumnFilterText: () => {},
    columnFilterText,
    columns,
    columnState: [],
    filterState: null,
    groupableColumns: [],
    groupBy: [],
    messages: defaultMessages,
    pivotState: emptyBcPivotState,
    setColumnFilterText: () => {},
    setColumnState: () => {},
    setFilterState: () => {},
    setGroupBy: () => {},
    setPivotState: () => {},
  }
}

describe("buildFilterToolPanelItems", () => {
  test("builds filterable panel items from current column filter text", () => {
    const items = buildFilterToolPanelItems(columns, {
      account: "cash",
      approved: "",
    })

    expect(items.map((item) => item.columnId)).toEqual([
      "account",
      "balance",
      "postedOn",
      "approved",
    ])
    expect(items.find((item) => item.columnId === "account")).toMatchObject({
      active: true,
      filterText: "cash",
      label: "Account",
      type: "text",
    })
    expect(items.find((item) => item.columnId === "balance")).toMatchObject({
      active: false,
      label: "Balance",
      type: "number",
    })
    expect(items.find((item) => item.columnId === "approved")).toMatchObject({
      type: "boolean",
    })
  })

  test("limits the visible panel list to active filters", () => {
    const items = buildFilterToolPanelItems(columns, { account: "cash", approved: "  " })

    expect(activeFilterToolPanelItems(items).map((item) => item.columnId)).toEqual(["account"])
    expect(isFilterToolPanelDraftActive("  ")).toBe(false)
    expect(isFilterToolPanelDraftActive("  settled  ")).toBe(true)
  })
})

describe("filters sidebar slot", () => {
  test("resolves the built-in filters panel to the filters tool panel", () => {
    const [panel] = resolveSidebarPanels<Row>(["filters"])
    const context = sidebarContext()

    expect(panel?.id).toBe("filters")
    expect((panel?.render(context) as { type?: unknown }).type).toBe(BcFiltersToolPanel)
  })

  test("renders the shared sidebar header and disabled clear-all chrome", () => {
    const markup = renderToStaticMarkup(
      createElement(BcFiltersToolPanel<Row>, { context: sidebarContext() }),
    )

    expect(markup).toContain("bc-grid-sidebar-panel-header bc-grid-filters-panel-header")
    expect(markup).toContain("bc-grid-filters-panel-empty")
    expect(markup).toMatch(/<button[^>]*class="bc-grid-filters-panel-clear"[^>]*disabled/)
  })
})
