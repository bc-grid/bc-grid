import { describe, expect, test } from "bun:test"
import type { ColumnId, SetFilterOption } from "@bc-grid/core"
import { renderToStaticMarkup } from "react-dom/server"
import { encodeSetFilterInput } from "../src/filter"
import { type ResolvedColumn, defaultMessages } from "../src/gridInternals"
import { renderFilterCell } from "../src/headerCells"

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

describe("renderFilterCell — set filter trigger", () => {
  test("inactive trigger shows the operator select + 'Select values' summary", () => {
    const html = renderSetFilterCell({ filterText: "" })

    expect(html).toContain("bc-grid-filter-set")
    expect(html).toContain('aria-label="Filter Status operator"')
    expect(html).toContain('aria-label="Filter Status values"')
    expect(html).toContain("Select values")
    // The trigger button is not in the active state when filterText is
    // empty — `data-active` must NOT be emitted (omitted, not "false",
    // so CSS [data-active] selectors only match the active branch).
    expect(html).not.toMatch(/data-active="(true|false)"/)
  })

  test("active trigger reflects the selected count + carries data-active=true", () => {
    const html = renderSetFilterCell({
      filterText: encodeSetFilterInput({ op: "in", values: ["Open", "Past Due"] }),
    })

    expect(html).toContain("2 selected")
    expect(html).toContain('data-active="true"')
    // Aria-label is unchanged so AT users still target by stable name.
    expect(html).toContain('aria-label="Filter Status values"')
  })

  test("op=blank disables the values trigger and shows 'Blank rows' summary", () => {
    const html = renderSetFilterCell({
      filterText: encodeSetFilterInput({ op: "blank", values: [] }),
    })

    expect(html).toContain("Blank rows")
    expect(html).toContain('data-active="true"')
    // Native `disabled` attribute renders on the values trigger so a
    // user can't accidentally open the values menu while the operator
    // is set to "blank".
    expect(html).toMatch(
      /aria-label="Filter Status values"[^>]*disabled|disabled[^>]*aria-label="Filter Status values"/,
    )
  })

  test("operator select renders operators in the expected contract order", () => {
    const html = renderSetFilterCell({ filterText: "" })

    // The DOM order is the user-facing operator-list order; pin it so
    // a future re-shuffle triggers an explicit decision. Match the
    // option content rather than a single attribute fragment so
    // selected="" / surrounding chrome doesn't break the assertion.
    const opIndex = html.indexOf('aria-label="Filter Status operator"')
    const inIndex = html.indexOf(">In</option>")
    const notInIndex = html.indexOf(">Not in</option>")
    const currentUserIndex = html.indexOf(">Current user</option>")
    const currentTeamIndex = html.indexOf(">Current team</option>")
    const blankIndex = html.indexOf(">Blank</option>")

    expect(opIndex).toBeGreaterThan(-1)
    expect(inIndex).toBeGreaterThan(opIndex)
    expect(notInIndex).toBeGreaterThan(inIndex)
    expect(currentUserIndex).toBeGreaterThan(notInIndex)
    expect(currentTeamIndex).toBeGreaterThan(currentUserIndex)
    expect(blankIndex).toBeGreaterThan(currentTeamIndex)
  })

  test("unknown values from filterText project as themselves (legacy compat)", () => {
    // A filterText payload may contain values that are not in the
    // currently-loaded options (e.g., the filter was persisted in a
    // prior session, or the option list hasn't been computed yet).
    // The trigger summary still reports the selected count so the
    // user sees the filter is active. Menu rendering of those values
    // happens on open and is exercised at the helper level via
    // filter.test.ts.
    const html = renderSetFilterCell({
      filterText: encodeSetFilterInput({
        op: "in",
        values: ["legacy-key-1", "legacy-key-2", "legacy-key-3"],
      }),
    })

    expect(html).toContain("3 selected")
    expect(html).toContain('data-active="true"')
  })
})
