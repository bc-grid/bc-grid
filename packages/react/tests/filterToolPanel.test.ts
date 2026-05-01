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

  test("empty state renders the slashed-funnel SVG glyph + label inside the same card", () => {
    // Polished empty surface: the bare "No active filters" sentence
    // was reading as unfinished; the polish slice pairs it with a
    // shadcn-style icon + label so the panel reads as deliberate
    // chrome rather than a placeholder. Pin the SVG presence + label
    // text so a future refactor that drops the icon surfaces here.
    const markup = renderToStaticMarkup(
      createElement(BcFiltersToolPanel<Row>, { context: sidebarContext() }),
    )

    expect(markup).toContain("bc-grid-filters-panel-empty-icon")
    expect(markup).toMatch(/<svg[^>]*aria-hidden="true"[^>]*bc-grid-filters-panel-empty-icon/)
    expect(markup).toContain('<span class="bc-grid-filters-panel-empty-label">No active filters')
  })

  test("active-filter card renders an inline SVG XIcon as the remove button glyph", () => {
    // Replaces the historical literal "x" character body so the
    // remove button reads as a real shadcn icon-only IconButton with
    // a stroke-currentColor close glyph that adapts across light /
    // dark / forced-colors. aria-label drives the accessible name;
    // the SVG is aria-hidden.
    const markup = renderToStaticMarkup(
      createElement(BcFiltersToolPanel<Row>, {
        context: sidebarContext({ account: "cash" }),
      }),
    )

    // Remove button is present and aria-labelled per column.
    expect(markup).toMatch(
      /<button[^>]*aria-label="Clear filter on Account"[^>]*class="bc-grid-filters-panel-remove"/,
    )
    // SVG glyph (aria-hidden) lives inside the button — no literal
    // ">x</button>" body any more.
    expect(markup).toMatch(/<svg aria-hidden="true" class="bc-grid-panel-icon"/)
    expect(markup).not.toMatch(/<button[^>]*bc-grid-filters-panel-remove[^>]*>x<\/button>/)
  })

  test("XIcon strokes use currentColor so the glyph adapts across light / dark / forced-colors", () => {
    const markup = renderToStaticMarkup(
      createElement(BcFiltersToolPanel<Row>, {
        context: sidebarContext({ account: "cash" }),
      }),
    )

    // The shared `<Icon>` helper sets `stroke="currentColor"` once;
    // pin that the rendered SVG carries it so a future refactor
    // can't silently regress to a hard-coded colour.
    expect(markup).toMatch(
      /<svg[^>]*stroke="currentColor"[^>]*bc-grid-panel-icon|bc-grid-panel-icon[^>]*stroke="currentColor"/,
    )
  })
})
