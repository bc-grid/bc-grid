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

  test("active-filter card renders an operator chip and value summary inline", () => {
    // bsncraft flagged the panel as feeling unfinished. The polish
    // slice adds a compact summary row — `<operator chip>` plus
    // `<value>` — so a host scanning the panel can read every active
    // filter without expanding any rows. Pin the chip + value markup
    // and the operator wording for a default text-filter.
    const markup = renderToStaticMarkup(
      createElement(BcFiltersToolPanel<Row>, {
        context: sidebarContext({ account: "cash" }),
      }),
    )

    expect(markup).toContain('<p class="bc-grid-filters-panel-item-summary">')
    expect(markup).toContain('<span class="bc-grid-filters-panel-item-operator">contains</span>')
    expect(markup).toContain('<span class="bc-grid-filters-panel-item-value">cash</span>')
  })

  test("text-filter modifier flags surface as separate chips next to the value", () => {
    // Persisted structured text filter with `caseSensitive` set —
    // panel must show a `case sensitive` modifier chip so the host
    // can see the modifier without expanding the editor.
    const markup = renderToStaticMarkup(
      createElement(BcFiltersToolPanel<Row>, {
        context: sidebarContext({
          account: JSON.stringify({ op: "starts-with", value: "AC-", caseSensitive: true }),
        }),
      }),
    )

    expect(markup).toContain('<span class="bc-grid-filters-panel-item-operator">starts with</span>')
    expect(markup).toContain('<span class="bc-grid-filters-panel-item-value">AC-</span>')
    expect(markup).toContain(
      '<span class="bc-grid-filters-panel-item-modifier">case sensitive</span>',
    )
  })

  test("active-filter card pairs the summary with the inline editor body", () => {
    // The panel keeps the inline editor body mounted alongside the
    // summary so the host can refine the filter without a separate
    // disclosure interaction. The summary tells the host what the
    // filter currently does; the editor lets them change it.
    const markup = renderToStaticMarkup(
      createElement(BcFiltersToolPanel<Row>, {
        context: sidebarContext({ account: "cash" }),
      }),
    )

    expect(markup).toContain('class="bc-grid-filters-panel-item-summary"')
    expect(markup).toContain("bc-grid-filters-panel-control")
    expect(markup).toContain("bc-grid-filter-text")
  })

  test("per-row clear button stays an icon-only IconButton with the X glyph", () => {
    // The clear button is the only action on a card row; the
    // historical aria-label is preserved so e2e suites can locate
    // it.
    const markup = renderToStaticMarkup(
      createElement(BcFiltersToolPanel<Row>, {
        context: sidebarContext({ account: "cash" }),
      }),
    )

    expect(markup).toMatch(
      /<button[^>]*aria-label="Clear filter on Account"[^>]*class="bc-grid-filters-panel-remove"/,
    )
  })

  test("set-filter rows with no labels renders raw values capped at 3 + +N more", () => {
    // bsncraft's "compact value summary" requirement — set filters
    // with many selected values shouldn't blow up the panel row.
    const markup = renderToStaticMarkup(
      createElement(BcFiltersToolPanel<Row>, {
        context: {
          ...sidebarContext({
            // notes column has filter:false; reuse approved (boolean)
            // would short-circuit. Use a custom column with set filter.
          }),
          columns: [
            { field: "status", header: "Status", filter: { type: "set" } },
          ] as readonly BcReactGridColumn<Row>[],
          columnFilterText: {
            status: JSON.stringify({ op: "in", values: ["AC", "PND", "VOID", "CL", "DR"] }),
          },
        },
      }),
    )

    expect(markup).toContain('<span class="bc-grid-filters-panel-item-operator">is</span>')
    // Capped at 3 — first three labels + "+2 more"
    expect(markup).toContain(
      '<span class="bc-grid-filters-panel-item-value">AC, PND, VOID +2 more</span>',
    )
  })

  test("number-range filter shows EN DASH range summary", () => {
    const markup = renderToStaticMarkup(
      createElement(BcFiltersToolPanel<Row>, {
        context: sidebarContext({
          balance: JSON.stringify({ op: "between", value: "100", valueTo: "500" }),
        }),
      }),
    )

    expect(markup).toContain('<span class="bc-grid-filters-panel-item-operator">is between</span>')
    expect(markup).toContain('<span class="bc-grid-filters-panel-item-value">100 – 500</span>')
  })
})
