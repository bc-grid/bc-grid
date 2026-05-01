import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { defaultMessages } from "../src/gridInternals"
import type { ResolvedColumn } from "../src/gridInternals"
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

function renderColumn(column: ResolvedColumn<Row>): string {
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

function renderTextFilter(filterText: string): string {
  return renderToStaticMarkup(
    renderFilterCell({
      column: {
        ...baseColumn,
        source: {
          ...baseColumn.source,
          header: "Account",
          filter: { type: "text" },
        },
      },
      domBaseId: "grid",
      filterText,
      headerHeight: 40,
      index: 0,
      onFilterChange: () => {},
      pinnedEdge: null,
      scrollLeft: 0,
      totalWidth: 120,
      viewportWidth: 120,
      messages: defaultMessages,
    }),
  )
}

describe("renderFilterCell — TextFilterControl aria-label structure", () => {
  // Locks down the aria-label shape that the vertical-slice.pw.ts spec
  // relies on. The text editor renders four labelled controls and only
  // the value <input> carries the bare "Filter Account" name — Playwright
  // tests can either use `getByLabel(name, { exact: true })` or
  // `getByRole("textbox", { name })` to scope to the value input.
  // Regression guard so a future label tweak doesn't reintroduce the
  // strict-mode locator violation that broke #208's first CI run.

  test("renders exactly one element with aria-label='Filter Account' (the value input)", () => {
    const html = renderTextFilter("")
    const matches = html.match(/aria-label="Filter Account"/g) ?? []
    expect(matches.length).toBe(1)
  })

  test("operator dropdown carries the suffixed label 'Filter Account operator'", () => {
    const html = renderTextFilter("")
    expect(html).toContain('aria-label="Filter Account operator"')
  })

  test("case-sensitivity and regex toggles carry distinct suffixed labels", () => {
    const html = renderTextFilter("")
    expect(html).toContain('aria-label="Filter Account case-sensitive"')
    expect(html).toContain('aria-label="Filter Account regex"')
  })

  test("the value input is a typeable textbox so getByRole('textbox', { name }) scopes uniquely", () => {
    const html = renderTextFilter("")
    // The exact attribute order from React's renderToStaticMarkup is
    // an implementation detail — assert both attributes appear on the
    // same <input ...> tag without pinning their order.
    const inputTag = html.match(/<input[^>]*aria-label="Filter Account"[^>]*\/?>/)
    expect(inputTag).not.toBeNull()
    expect(inputTag?.[0]).toContain('type="text"')
  })

  test("toggle pressed-state surfaces via aria-pressed for keyboard a11y + locator scoping", () => {
    // Even with both modifiers active, only the value <input> exposes
    // aria-label="Filter Account" exactly — the pressed buttons keep
    // their suffixed names. Pinned because the JSON-encoded payload
    // could otherwise leak modifier state through the label hierarchy.
    const html = renderTextFilter(
      JSON.stringify({ op: "starts-with", value: "Acme", caseSensitive: true, regex: true }),
    )
    const matches = html.match(/aria-label="Filter Account"/g) ?? []
    expect(matches.length).toBe(1)
    expect(html).toContain('aria-pressed="true"')
  })
})
