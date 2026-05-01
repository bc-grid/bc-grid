import { describe, expect, test } from "bun:test"
import type { ColumnId, SetFilterOption } from "@bc-grid/core"
import { renderToStaticMarkup } from "react-dom/server"
import { encodeSetFilterInput } from "../src/filter"
import { type ResolvedColumn, defaultMessages } from "../src/gridInternals"
import { FilterPopup, renderFilterCell } from "../src/headerCells"

interface Row {
  status: string
}

const baseColumn: ResolvedColumn<Row> = {
  align: "left",
  columnId: "status",
  left: 0,
  pinned: null,
  position: 0,
  source: {
    columnId: "status",
    field: "status",
    header: "Status",
    filter: { type: "set" },
  },
  width: 220,
}

function renderSetFilterCell(args: {
  filterText: string
  loadOptions?: (columnId: ColumnId) => readonly SetFilterOption[]
}): string {
  return renderToStaticMarkup(
    renderFilterCell<Row>({
      column: baseColumn,
      domBaseId: "grid",
      filterText: args.filterText,
      headerHeight: 40,
      index: 0,
      loadSetFilterOptions: args.loadOptions,
      messages: defaultMessages,
      onFilterChange: () => {},
      pinnedEdge: null,
      scrollLeft: 0,
      totalWidth: 220,
      viewportWidth: 220,
    }),
  )
}

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

function renderSetFilterPopup(filterText: string): string {
  return renderToStaticMarkup(
    <FilterPopup
      anchor={popupAnchor}
      columnId="status"
      filterType="set"
      filterText={filterText}
      filterLabel="Filter Status"
      onFilterChange={() => {}}
      onClear={() => {}}
      onClose={() => {}}
      messages={defaultMessages}
    />,
  )
}

describe("renderFilterCell — set filter inline contract", () => {
  // Per the inline-filter-row UX contract (docs/api.md §"Inline filter
  // row UX contract"), set filters do NOT render a value picker
  // inline. The advanced multi-value picker belongs in the popup
  // variant or the Filters tool panel; the inline cell stays empty
  // so the row reads as a quick-filter row. Hosts surface the picker
  // via `filter: { type: "set", variant: "popup" }` (header funnel)
  // or `sidebar={["filters", …]}`.

  test("set-type column renders an empty inline cell — no operator select, no values trigger", () => {
    const html = renderSetFilterCell({ filterText: "" })

    expect(html).toContain("bc-grid-filter-cell")
    expect(html).not.toContain("bc-grid-filter-set")
    expect(html).not.toContain("bc-grid-filter-set-button")
    expect(html).not.toContain('aria-label="Filter Status operator"')
    expect(html).not.toContain('aria-label="Filter Status values"')
  })

  test("active set filter still renders an empty inline cell — visibility lives elsewhere", () => {
    // The inline cell is empty regardless of whether the filter is
    // active. The Filters tool panel surfaces an "active filter
    // summary" card that tells the user the filter is on; the
    // inline cell deliberately stays out of the way so the header
    // row remains compact.
    const html = renderSetFilterCell({
      filterText: encodeSetFilterInput({ op: "in", values: ["Open", "Past Due"] }),
    })

    expect(html).toContain("bc-grid-filter-cell")
    expect(html).not.toContain("bc-grid-filter-set")
    expect(html).not.toContain("Select values")
    expect(html).not.toContain("2 selected")
  })
})

describe("FilterPopup — set filter surface", () => {
  // Popup variant delegates to the same FilterEditorBody as the inline
  // row, so the operator + trigger contract should match.
  test("popup hosts the set filter operator select + values trigger", () => {
    const html = renderSetFilterPopup("")

    expect(html).toContain("bc-grid-filter-set")
    expect(html).toContain('aria-label="Filter Status operator"')
    expect(html).toContain('aria-label="Filter Status values"')
    expect(html).toContain("Select values")
    expect(html).toContain('value="in"')
  })

  test("popup hydrates active selection state from structured filterText", () => {
    const html = renderSetFilterPopup(
      encodeSetFilterInput({ op: "not-in", values: ["Closed", "Draft"] }),
    )

    expect(html).toContain("2 selected")
    expect(html).toContain('value="not-in"')
    expect(html).toContain('data-active="true"')
  })

  test("popup hydrates op=blank with the disabled-trigger contract", () => {
    const html = renderSetFilterPopup(encodeSetFilterInput({ op: "blank", values: [] }))

    expect(html).toContain("Blank rows")
    expect(html).toContain('value="blank"')
    expect(html).toMatch(
      /aria-label="Filter Status values"[^>]*disabled|disabled[^>]*aria-label="Filter Status values"/,
    )
  })
})
