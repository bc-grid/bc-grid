import { describe, expect, test } from "bun:test"
import { emptyBcPivotState } from "@bc-grid/core"
import { renderToStaticMarkup } from "react-dom/server"
import { BcFiltersToolPanel } from "../src/filterToolPanel"
import { defaultMessages } from "../src/gridInternals"
import type { BcReactGridColumn, BcSidebarContext } from "../src/types"

interface Row {
  id: string
  account: string
  balance: number
}

const COLUMNS: readonly BcReactGridColumn<Row>[] = [
  { columnId: "account", field: "account", header: "Account" },
  { columnId: "balance", field: "balance", header: "Balance", filter: { type: "number" } },
]

function buildContext(columnFilterText: Readonly<Record<string, string>>): BcSidebarContext<Row> {
  return {
    api: {} as BcSidebarContext<Row>["api"],
    clearColumnFilterText: () => {},
    columnFilterText,
    columns: COLUMNS,
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

function renderPanel(filterText: Readonly<Record<string, string>> = {}): string {
  return renderToStaticMarkup(<BcFiltersToolPanel<Row> context={buildContext(filterText)} />)
}

describe("BcFiltersToolPanel — markup contract", () => {
  test("the 'Clear all' button carries `aria-label='Clear all filters'`", () => {
    // Visible button text is "Clear all"; the explicit aria-label
    // disambiguates the intent for AT users without depending on the
    // surrounding section heading. Pinned here so a future polish
    // pass can't drop the attribute and silently leave AT users with
    // ambiguous announcement.
    const html = renderPanel()
    expect(html).toMatch(
      /class="bc-grid-filters-panel-clear"[^>]*aria-label="Clear all filters"|aria-label="Clear all filters"[^>]*class="bc-grid-filters-panel-clear"/,
    )
  })

  test("Clear-all is disabled when no filters are active and enabled when at least one is", () => {
    const empty = renderPanel({})
    const active = renderPanel({ account: "cash" })

    // `disabled` toggles with `hasFilters`. The disabled attribute is
    // emitted as a bare attribute by react-dom/server (no value).
    expect(empty).toMatch(/class="bc-grid-filters-panel-clear"[^>]*disabled/)
    expect(active).not.toMatch(/class="bc-grid-filters-panel-clear"[^>]*disabled/)
  })

  test("the Active filters list carries `aria-label='Active filters'` (single source for the list name)", () => {
    // Per WAI-ARIA, lists with multiple items benefit from an
    // accessible name. The component already labels the <ul>; pin
    // the contract.
    const html = renderPanel({ account: "cash" })
    expect(html).toContain('aria-label="Active filters"')
  })

  test("each active filter row labels itself + its remove button by the column heading", () => {
    // Per-row Clear button ("x") relies on aria-label for AT users
    // since the visible glyph is non-descriptive. Locking in the
    // current contract: aria-label includes the column label.
    const html = renderPanel({ account: "cash" })
    expect(html).toContain('aria-label="Clear filter on Account"')
  })

  test("renders the empty-state placeholder when no filters are active (SSR-safe)", () => {
    const html = renderPanel({})
    expect(html).toContain("No active filters")
  })
})
