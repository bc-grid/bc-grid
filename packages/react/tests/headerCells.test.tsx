import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { type ResolvedColumn, defaultMessages } from "../src/gridInternals"
import { FilterPopup, renderFilterCell, renderHeaderCell } from "../src/headerCells"

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

  test("toggle buttons carry hover-tooltip titles for sighted users", () => {
    // The toggles render as 2-character glyphs ("Aa" / ".*"). Sighted
    // pointer users get the human-readable label via the native
    // tooltip; AT users get the same intent via the aria-label suffix
    // pinned in the test above.
    const html = renderTextFilterCellHtml("")

    expect(html).toContain('title="Case sensitive"')
    expect(html).toContain('title="Regular expression"')
  })

  test("regex mode swaps placeholder, disables spellcheck, and disables autocomplete on the value input", () => {
    // When the user toggles regex, the value-input switches role from
    // "free text needle" to "regex pattern". Browsers' spellcheck and
    // autocomplete heuristics misfire on patterns like `^AC[0-9]+$`,
    // so we mute both and switch the placeholder to a regex hint.
    const html = renderTextFilterCellHtml(
      JSON.stringify({ op: "contains", value: "", regex: true }),
    )

    expect(html).toContain('placeholder="Regex pattern"')
    // react-dom/server `renderToStaticMarkup` preserves the React prop
    // casing for `spellCheck` / `autoComplete` (the live DOM lower-cases
    // them; static markup keeps the JSX form). Match either casing so
    // the test stays valid across React versions.
    expect(html).toMatch(/spell[Cc]heck="false"/)
    expect(html).toMatch(/auto[Cc]omplete="off"/)
  })

  test("regex toggle is unset by default (no spellcheck/autocomplete override on the value input)", () => {
    const html = renderTextFilterCellHtml("CUST-00042")

    // Without regex, the value input is plain text; we don't override
    // spellcheck or autocomplete (host-app preference wins).
    expect(html).not.toMatch(/spell[Cc]heck=/)
    expect(html).not.toMatch(/auto[Cc]omplete=/)
    // Default placeholder is the host's filterPlaceholder message.
    expect(html).not.toContain('placeholder="Regex pattern"')
  })

  test("toggle pressed state reflects the persisted modifier flags", () => {
    const caseOnly = renderTextFilterCellHtml(
      JSON.stringify({ op: "contains", value: "x", caseSensitive: true }),
    )
    const regexOnly = renderTextFilterCellHtml(
      JSON.stringify({ op: "contains", value: "^x", regex: true }),
    )
    const both = renderTextFilterCellHtml(
      JSON.stringify({ op: "contains", value: "^X", caseSensitive: true, regex: true }),
    )
    const neither = renderTextFilterCellHtml("CUST-00042")

    const pressed = (label: string, html: string) =>
      new RegExp(
        `aria-label="${label}"[^>]*aria-pressed="true"|aria-pressed="true"[^>]*aria-label="${label}"`,
      ).test(html)

    expect(pressed("Filter Account case sensitive", caseOnly)).toBe(true)
    expect(pressed("Filter Account regex", caseOnly)).toBe(false)

    expect(pressed("Filter Account case sensitive", regexOnly)).toBe(false)
    expect(pressed("Filter Account regex", regexOnly)).toBe(true)

    expect(pressed("Filter Account case sensitive", both)).toBe(true)
    expect(pressed("Filter Account regex", both)).toBe(true)

    expect(pressed("Filter Account case sensitive", neither)).toBe(false)
    expect(pressed("Filter Account regex", neither)).toBe(false)
  })
})

const popupAnchor: DOMRect = {
  bottom: 80,
  left: 240,
  right: 280,
  top: 40,
  width: 40,
  height: 40,
  x: 240,
  y: 40,
  toJSON: () => ({}),
}

function renderTextFilterPopup(filterText: string): string {
  return renderToStaticMarkup(
    <FilterPopup
      anchor={popupAnchor}
      columnId="account"
      filterType="text"
      filterText={filterText}
      filterLabel="Filter Account"
      onFilterChange={() => {}}
      onClear={() => {}}
      onClose={() => {}}
      messages={defaultMessages}
    />,
  )
}

describe("FilterPopup — text filter operators surface", () => {
  test("popup variant renders the same operator + toggle controls as the inline row", () => {
    // The popup and inline row both delegate to FilterEditorBody, so
    // wiring a text filter into popup mode must surface the full
    // operator UI (select + value input + case-sensitive + regex
    // toggles) rather than the legacy single-input fallback.
    const html = renderTextFilterPopup("")

    expect(html).toContain("bc-grid-filter-text")
    expect(html).toContain('aria-label="Filter Account operator"')
    expect(html).toContain('aria-label="Filter Account case sensitive"')
    expect(html).toContain('aria-label="Filter Account regex"')
    expect(html).toContain('value="contains"')
  })

  test("popup hydrates from structured persistence and reflects modifier flags", () => {
    const html = renderTextFilterPopup(
      JSON.stringify({ op: "starts-with", value: "AC", regex: true }),
    )

    expect(html).toContain('value="starts-with"')
    expect(html).toContain('value="AC"')
    // Regex toggle is pressed; case-sensitive toggle is not.
    expect(html).toMatch(
      /aria-label="Filter Account regex"[^>]*aria-pressed="true"|aria-pressed="true"[^>]*aria-label="Filter Account regex"/,
    )
    expect(html).toMatch(
      /aria-label="Filter Account case sensitive"[^>]*aria-pressed="false"|aria-pressed="false"[^>]*aria-label="Filter Account case sensitive"/,
    )
    // Regex placeholder swap reaches the popup's value input too.
    expect(html).toContain('placeholder="Regex pattern"')
  })

  test("popup default contains+no-modifier shows plain value with no regex placeholder", () => {
    const html = renderTextFilterPopup("CUST-00042")

    expect(html).toContain('value="CUST-00042"')
    expect(html).toContain('value="contains"')
    expect(html).not.toContain('placeholder="Regex pattern"')
    expect(html).not.toContain('spellcheck="false"')
  })
})
