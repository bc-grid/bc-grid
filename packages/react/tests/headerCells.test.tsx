import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { type ResolvedColumn, defaultMessages } from "../src/gridInternals"
import { renderFilterCell, renderHeaderCell } from "../src/headerCells"

interface Row {
  name: string
}

const baseColumn: ResolvedColumn<Row> = {
  align: "left",
  columnId: "name",
  left: 0,
  pinned: null,
  position: 0,
  source: {
    columnId: "name",
    field: "name",
    header: "Name",
  },
  width: 120,
}

function renderColumn(column: ResolvedColumn<Row>, showColumnMenu = true): string {
  return renderToStaticMarkup(
    renderHeaderCell({
      column,
      domBaseId: "grid",
      headerHeight: 40,
      index: 0,
      onColumnMenu: () => {},
      onConsumeReorderClickSuppression: () => false,
      onReorderEnd: () => {},
      onReorderMove: () => {},
      onReorderStart: () => {},
      onResizeEnd: () => {},
      onResizeMove: () => {},
      onResizeStart: () => {},
      onSort: () => {},
      pinnedEdge: null,
      reorderingColumnId: undefined,
      scrollLeft: 0,
      showColumnMenu,
      sortState: [],
      totalWidth: 120,
      viewportWidth: 120,
    }),
  )
}

describe("renderHeaderCell resize affordance", () => {
  test("marks resizable headers for the always-visible affordance", () => {
    const html = renderColumn(baseColumn)

    expect(html).toContain("bc-grid-header-cell-resizable")
    expect(html).toContain("bc-grid-header-resize-handle")
  })

  test("omits resize affordance markup for fixed-width headers", () => {
    const html = renderColumn({
      ...baseColumn,
      source: { ...baseColumn.source, resizable: false },
    })

    expect(html).not.toContain("bc-grid-header-cell-resizable")
    expect(html).not.toContain("bc-grid-header-resize-handle")
  })
})

describe("renderHeaderCell column menu visibility", () => {
  test("omits the column menu button when disabled", () => {
    const html = renderColumn(baseColumn, false)

    expect(html).not.toContain("bc-grid-header-menu-button")
    expect(html).not.toContain("data-bc-grid-column-menu-button")
  })

  test("omits the column menu button for opted-out columns", () => {
    const html = renderColumn({
      ...baseColumn,
      source: { ...baseColumn.source, columnMenu: false },
    })

    expect(html).not.toContain("bc-grid-header-menu-button")
    expect(html).not.toContain("data-bc-grid-column-menu-button")
  })

  test("renders the menu icon without visible ellipsis text", () => {
    const html = renderColumn(baseColumn)

    expect(html).toContain("bc-grid-header-menu-button")
    expect(html).not.toContain("&gt;...&lt;")
    expect(html).not.toContain(">...</button>")
  })
})

function renderTextFilterCellHtml(filterText: string, header = "Account"): string {
  const column: ResolvedColumn<Row> = {
    align: "left",
    columnId: "account",
    left: 0,
    pinned: null,
    position: 0,
    source: {
      columnId: "account",
      field: "name",
      header,
      filter: { type: "text" },
    },
    width: 200,
  }
  return renderToStaticMarkup(
    renderFilterCell({
      column,
      domBaseId: "grid",
      filterText,
      headerHeight: 40,
      index: 0,
      messages: defaultMessages,
      onFilterChange: () => {},
      pinnedEdge: null,
      scrollLeft: 0,
      totalWidth: 200,
      viewportWidth: 200,
    }),
  )
}

function countMatches(haystack: string, needle: string): number {
  let count = 0
  let i = haystack.indexOf(needle)
  while (i !== -1) {
    count++
    i = haystack.indexOf(needle, i + needle.length)
  }
  return count
}

describe("renderFilterCell — text filter aria-label structure", () => {
  test("operator/value/case-sensitive/regex controls have distinct aria-labels", () => {
    const html = renderTextFilterCellHtml("")

    expect(html).toContain('aria-label="Filter Account"')
    expect(html).toContain('aria-label="Filter Account operator"')
    expect(html).toContain('aria-label="Filter Account case sensitive"')
    expect(html).toContain('aria-label="Filter Account regex"')
  })

  test("only one element carries the bare 'Filter Account' aria-label", () => {
    const html = renderTextFilterCellHtml("CUST-00042")

    // The exact-match locator pattern in vertical-slice.pw.ts depends on
    // there being exactly one element whose aria-label equals
    // "Filter Account". Operator/case-sensitive/regex labels must add a
    // descriptive suffix so they do not collide as substrings.
    expect(countMatches(html, 'aria-label="Filter Account"')).toBe(1)
  })

  test("text filter cell uses the bc-grid-filter-text wrapper", () => {
    const html = renderTextFilterCellHtml("")

    expect(html).toContain("bc-grid-filter-text")
    expect(html).toContain("bc-grid-filter-text-toggle")
  })

  test("default contains+no-modifier persistence renders as plain-string value", () => {
    const html = renderTextFilterCellHtml("CUST-00042")

    expect(html).toContain('value="CUST-00042"')
    expect(html).toContain('value="contains"')
  })

  test("structured persistence hydrates operator + modifier toggles", () => {
    const html = renderTextFilterCellHtml(
      JSON.stringify({ op: "equals", value: "CUST-00042", caseSensitive: true }),
    )

    expect(html).toContain('value="equals"')
    expect(html).toContain('value="CUST-00042"')
    // The case-sensitive toggle reflects pressed state via aria-pressed.
    expect(html).toMatch(
      /aria-label="Filter Account case sensitive"[^>]*aria-pressed="true"|aria-pressed="true"[^>]*aria-label="Filter Account case sensitive"/,
    )
  })
})
