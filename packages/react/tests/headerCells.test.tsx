import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { type ResolvedColumn, defaultMessages } from "../src/gridInternals"
import {
  FilterPopup,
  isInlineFilterApplicable,
  renderFilterCell,
  renderHeaderCell,
} from "../src/headerCells"

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

function renderFilterPopupTriggerHtml(
  filterText: string,
  filterPopupOpen: boolean,
  header = "Account",
  columnId = "account",
): string {
  const column: ResolvedColumn<Row> = {
    align: "left",
    columnId,
    left: 0,
    pinned: null,
    position: 0,
    source: {
      columnId,
      field: "name",
      header,
      filter: { type: "text", variant: "popup" },
    },
    width: 200,
  }
  return renderToStaticMarkup(
    renderHeaderCell({
      column,
      domBaseId: "grid",
      headerHeight: 40,
      index: 0,
      filterText,
      filterPopupOpen,
      onColumnMenu: () => {},
      onConsumeReorderClickSuppression: () => false,
      onOpenFilterPopup: () => {},
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
      showColumnMenu: true,
      sortState: [],
      totalWidth: 200,
      viewportWidth: 200,
    }),
  )
}

describe("renderHeaderCell resize affordance", () => {
  test("marks resizable headers for the always-visible affordance", () => {
    const html = renderColumn(baseColumn)

    expect(html).toContain("bc-grid-header-cell-resizable")
    expect(html).toContain('data-bc-grid-resizable="true"')
    expect(html).toContain("bc-grid-header-resize-handle")
    expect(html).toContain('data-bc-grid-resize-handle="true"')
  })

  test("omits resize affordance markup for fixed-width headers", () => {
    const html = renderColumn({
      ...baseColumn,
      source: { ...baseColumn.source, resizable: false },
    })

    expect(html).not.toContain("bc-grid-header-cell-resizable")
    expect(html).not.toContain('data-bc-grid-resizable="true"')
    expect(html).not.toContain("bc-grid-header-resize-handle")
    expect(html).not.toContain('data-bc-grid-resize-handle="true"')
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

describe("renderHeaderCell column menu trigger contract", () => {
  // bsncraft reported the menu trigger as feeling "prototype-level".
  // The polish slice replaces the CSS `::before` radial-gradient dot
  // hack with an inline SVG glyph, hardens propagation handlers so
  // a click never bubbles into sort / reorder / resize, and pins
  // shadcn-quality ARIA attributes. These tests pin the contract a
  // host app + e2e suite depends on so a future refactor that drops
  // a hook fails noisily.
  test("button renders an inline SVG glyph (no CSS-only ::before fallback)", () => {
    const html = renderColumn(baseColumn)

    // The new icon ships as `<svg class="bc-grid-header-menu-icon">…</svg>`
    // inside the button. The legacy `::before` dot hack was fragile
    // (consumer CSS overrides could blank it). Pin the SVG so a
    // future regression that re-introduces a CSS-only icon path
    // surfaces here.
    expect(html).toContain('<svg aria-hidden="true" class="bc-grid-header-menu-icon"')
    // Vertical three-dots glyph — three <circle> elements at the
    // same x with stacked y values. Pin the count so a future glyph
    // swap is intentional.
    const circleMatches = html.match(/<circle[^>]*cy="(?:3\.5|8|12\.5)"/g) ?? []
    expect(circleMatches.length).toBe(3)
  })

  test("trigger carries shadcn / Radix-style ARIA + data hooks for menu surfaces", () => {
    const html = renderColumn(baseColumn)

    // aria-haspopup="menu" tells AT the trigger opens a menu role
    // (matches Radix DropdownMenuTrigger). aria-label is the
    // accessible name driving announcement when only the SVG paints.
    // data-bc-grid-column-menu-button is the e2e + integration hook
    // — sub-systems detect "the click landed on the menu trigger"
    // via this attribute (e.g., the click-outside dismiss path
    // ignores trigger clicks so the menu doesn't open-then-close).
    expect(html).toContain('aria-haspopup="menu"')
    expect(html).toContain('aria-label="Column options for Name"')
    expect(html).toContain('data-bc-grid-column-menu-button="true"')
    expect(html).toMatch(/<button[^>]*type="button"/)
  })

  test("icon is aria-hidden so the button's accessible name is the aria-label, not the SVG", () => {
    // shadcn IconButton convention. Without aria-hidden the SVG can
    // leak into the accessible name on some AT clients. The
    // `aria-label="Column options for Name"` is the only source.
    const html = renderColumn(baseColumn)
    const svgs = html.match(/<svg[^>]*bc-grid-header-menu-icon[^>]*>/g) ?? []
    expect(svgs.length).toBeGreaterThan(0)
    for (const svg of svgs) {
      expect(svg).toContain('aria-hidden="true"')
    }
  })

  test("icon stroke uses currentColor so dark / forced-colors inherit through the button text colour", () => {
    // Light / dark / forced-colors all flow through the button's
    // `color: var(--bc-grid-header-fg)` automatically when the SVG
    // strokes / fills currentColor — no per-mode override needed.
    const html = renderColumn(baseColumn)
    expect(html).toContain('fill="currentColor"')
  })

  test("trigger does not paint visible body text when only the icon should render", () => {
    // The button is icon-only; aria-label drives announcement. Pin
    // the absence of literal "Column options for Name" inside the
    // button body so a future change can't accidentally surface
    // visible text on top of the icon.
    const html = renderColumn(baseColumn)

    // The aria-label appears as an attribute (containing the column
    // name) but should NOT appear as a text-node child of the
    // button. The button's only DOM child is the SVG glyph.
    const buttonMatch = html.match(
      /<button[^>]*data-bc-grid-column-menu-button="true"[^>]*>([\s\S]*?)<\/button>/,
    )
    expect(buttonMatch).not.toBeNull()
    if (buttonMatch) {
      const bodyHtml = buttonMatch[1] ?? ""
      // Body is the SVG only — no text node "Column options".
      expect(bodyHtml).not.toContain("Column options")
      expect(bodyHtml.trimStart().startsWith("<svg")).toBe(true)
    }
  })

  test("menu-trigger and resize handle co-exist on a resizable header", () => {
    // The menu trigger sits inside the header cell; the resize
    // handle is a separate sibling on the right edge. Both must
    // render together on a default resizable column. Pin so a
    // future layout refactor doesn't drop one.
    const html = renderColumn(baseColumn)

    expect(html).toContain('data-bc-grid-column-menu-button="true"')
    expect(html).toContain('data-bc-grid-resize-handle="true"')
  })

  test("menu trigger and resize handle keep separate interaction hooks", () => {
    const html = renderColumn(baseColumn)
    const menuButton = html.match(
      /<button[^>]*data-bc-grid-column-menu-button="true"[^>]*>[\s\S]*?<\/button>/,
    )?.[0]
    const resizeHandle = html.match(/<div[^>]*data-bc-grid-resize-handle="true"[^>]*><\/div>/)?.[0]

    expect(menuButton).toBeDefined()
    expect(resizeHandle).toBeDefined()
    expect(menuButton).not.toContain("data-bc-grid-resize-handle")
    expect(resizeHandle).not.toContain("data-bc-grid-column-menu-button")
    expect(html.indexOf('data-bc-grid-column-menu-button="true"')).toBeLessThan(
      html.indexOf('data-bc-grid-resize-handle="true"'),
    )
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

describe("renderFilterCell — inline filter row UX contract", () => {
  // Coordinator's inline-filter-row UX contract (see docs/api.md
  // §"Inline filter row UX contract"): the inline row hosts a quick
  // filter only — single value input for text / number / date,
  // existing two-input form for ranges, tri-state select for boolean.
  // Operator pickers, modifier toggles (case sensitive / regex), and
  // set-filter value pickers belong to the popup variant and the
  // Filters tool panel.

  test("text filter inline cell renders only the value input — no operator select, no modifier toggles", () => {
    const html = renderTextFilterCellHtml("")

    // Single value input — the only labelled control inline.
    expect(html).toContain('aria-label="Filter Account"')
    // Advanced surfaces are absent inline.
    expect(html).not.toContain("bc-grid-filter-select")
    expect(html).not.toContain("bc-grid-filter-text-toggle")
    expect(html).not.toContain('aria-label="Filter Account operator"')
    expect(html).not.toContain('aria-label="Filter Account case sensitive"')
    expect(html).not.toContain('aria-label="Filter Account regex"')
    expect(html).not.toContain('title="Case sensitive"')
    expect(html).not.toContain('title="Regular expression"')
  })

  test("only one element carries the bare 'Filter Account' aria-label inline", () => {
    const html = renderTextFilterCellHtml("CUST-00042")

    expect(countMatches(html, 'aria-label="Filter Account"')).toBe(1)
  })

  test("inline value input hydrates from the legacy plain-string contract", () => {
    const html = renderTextFilterCellHtml("CUST-00042")

    expect(html).toContain('value="CUST-00042"')
  })

  test("inline value input hydrates the value from structured persistence (operator + modifiers stay implicit)", () => {
    // Persistence interop: structured drafts written by the popup /
    // panel still surface the value inline. Operator + modifiers stay
    // in the stored draft until the user opens the advanced editor.
    const html = renderTextFilterCellHtml(
      JSON.stringify({ op: "equals", value: "CUST-00042", caseSensitive: true }),
    )

    expect(html).toContain('value="CUST-00042"')
    // The inline cell never emits the operator <select> nor the
    // modifier toggles — those surface in the popup / panel.
    expect(html).not.toContain("bc-grid-filter-select")
    expect(html).not.toContain("aria-pressed=")
  })

  test("inline value input renders with autoComplete=off so consumer browser autofill never fires inside the grid", () => {
    const html = renderTextFilterCellHtml("")
    expect(html).toMatch(/auto[Cc]omplete="off"/)
  })
})

describe("renderFilterCell — empty filter cell rendering", () => {
  function renderEmptyFilterCellHtml(filter: false | { type: "text"; variant: "popup" }): string {
    const column: ResolvedColumn<Row> = {
      align: "left",
      columnId: "account",
      left: 0,
      pinned: null,
      position: 0,
      source: { columnId: "account", field: "name", header: "Account", filter },
      width: 200,
    }
    return renderToStaticMarkup(
      renderFilterCell({
        column,
        domBaseId: "grid",
        filterText: "",
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

  test("filter:false renders an empty filter cell with no body controls", () => {
    // bsncraft flagged unfinished-looking visual junk in the inline
    // filter row. Pin that columns opting out of inline filtering
    // (`filter: false`) emit just the cell wrapper for layout — no
    // operator select, no value input, no toggle buttons. The cell
    // keeps its layout role so column widths align.
    const html = renderEmptyFilterCellHtml(false)

    expect(html).toContain("bc-grid-filter-cell")
    expect(html).not.toContain("bc-grid-filter-text")
    expect(html).not.toContain("bc-grid-filter-input")
    expect(html).not.toContain("bc-grid-filter-select")
    expect(html).not.toContain("bc-grid-filter-text-toggle")
    expect(html).not.toContain('aria-label="Filter Account')
  })

  test("popup-variant column renders an empty filter cell — the funnel lives on the header", () => {
    // Popup-variant columns surface their filter via the header
    // funnel button (rendered by renderHeaderCell), not in the
    // inline filter row. Pin that the inline filter cell is empty
    // body-side so the row reads cleanly when most columns are
    // popup-only.
    const html = renderEmptyFilterCellHtml({ type: "text", variant: "popup" })

    expect(html).toContain("bc-grid-filter-cell")
    expect(html).not.toContain("bc-grid-filter-text")
    expect(html).not.toContain("bc-grid-filter-input")
    expect(html).not.toContain('aria-label="Filter Account')
  })

  test("set-type column renders an empty inline cell — the value picker belongs to popup / panel", () => {
    // Per the inline-filter-row UX contract, set filters never paint
    // a value picker inline. The inline cell is empty so the row
    // stays compact; hosts surface the picker via `variant: "popup"`
    // (header funnel) or the Filters tool panel.
    const column: ResolvedColumn<Row> = {
      align: "left",
      columnId: "status",
      left: 0,
      pinned: null,
      position: 0,
      source: {
        columnId: "status",
        field: "name",
        header: "Status",
        filter: { type: "set" },
      },
      width: 200,
    }
    const html = renderToStaticMarkup(
      renderFilterCell({
        column,
        domBaseId: "grid",
        filterText: "",
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

    expect(html).toContain("bc-grid-filter-cell")
    expect(html).not.toContain("bc-grid-filter-set")
    expect(html).not.toContain("bc-grid-filter-set-button")
    expect(html).not.toContain('aria-label="Filter Status')
  })

  test("non-data column (no field, no valueGetter, no explicit filter) renders an empty inline cell", () => {
    // Action / render-only columns shouldn't carry a filter input —
    // the cell value would be undefined and a text filter against it
    // is never useful. Per the inline-filter-row UX contract, the
    // inline cell skips the editor body entirely.
    const column: ResolvedColumn<Row> = {
      align: "left",
      columnId: "actions",
      left: 0,
      pinned: null,
      position: 0,
      source: { columnId: "actions", header: "Actions" },
      width: 120,
    }
    const html = renderToStaticMarkup(
      renderFilterCell({
        column,
        domBaseId: "grid",
        filterText: "",
        headerHeight: 40,
        index: 0,
        messages: defaultMessages,
        onFilterChange: () => {},
        pinnedEdge: null,
        scrollLeft: 0,
        totalWidth: 120,
        viewportWidth: 120,
      }),
    )

    expect(html).toContain("bc-grid-filter-cell")
    expect(html).not.toContain("bc-grid-filter-input")
    expect(html).not.toContain("bc-grid-filter-text")
    expect(html).not.toContain('aria-label="Filter Actions')
  })

  test("non-data column with explicit filter config still renders inline (host opt-in)", () => {
    // The contract is "no field + no valueGetter + no filter config →
    // empty inline". An explicit `filter: { ... }` opts the column
    // back in regardless of data backing — useful for synthetic /
    // computed columns where the host wires the filter through a
    // custom hook.
    const column: ResolvedColumn<Row> = {
      align: "left",
      columnId: "computed",
      left: 0,
      pinned: null,
      position: 0,
      source: { columnId: "computed", header: "Computed", filter: { type: "text" } },
      width: 160,
    }
    const html = renderToStaticMarkup(
      renderFilterCell({
        column,
        domBaseId: "grid",
        filterText: "",
        headerHeight: 40,
        index: 0,
        messages: defaultMessages,
        onFilterChange: () => {},
        pinnedEdge: null,
        scrollLeft: 0,
        totalWidth: 160,
        viewportWidth: 160,
      }),
    )

    expect(html).toContain("bc-grid-filter-input")
    expect(html).toContain('aria-label="Filter Computed"')
  })
})

describe("renderFilterCell — inline number / date quick filter", () => {
  function renderInlineQuickFilterHtml(filterType: "number" | "date", filterText: string): string {
    const column: ResolvedColumn<Row> = {
      align: "left",
      columnId: "value",
      left: 0,
      pinned: null,
      position: 0,
      source: {
        columnId: "value",
        field: "name",
        header: "Value",
        filter: { type: filterType },
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

  test("number filter inline renders only a single input — no operator select", () => {
    const html = renderInlineQuickFilterHtml("number", "")

    expect(html).toContain('aria-label="Filter Value"')
    expect(html).toContain("bc-grid-filter-input")
    // No operator <select> or modifier toggles inline.
    expect(html).not.toContain("bc-grid-filter-select")
    expect(html).not.toContain('aria-label="Filter Value operator"')
    // No range chrome — number-range is a separate type.
    expect(html).not.toContain("bc-grid-filter-number-range")
  })

  test("date filter inline renders a single date input — no operator select", () => {
    const html = renderInlineQuickFilterHtml("date", "")

    expect(html).toContain('aria-label="Filter Value"')
    expect(html).toMatch(/<input[^>]*type="date"/)
    // The lone date input is the only labelled control inline.
    const inputCount = (html.match(/<input/g) ?? []).length
    expect(inputCount).toBe(1)
    expect(html).not.toContain("bc-grid-filter-select")
    expect(html).not.toContain('aria-label="Filter Value operator"')
  })

  test("number filter inline hydrates from structured persistence (value only)", () => {
    const html = renderInlineQuickFilterHtml("number", JSON.stringify({ op: ">=", value: "1000" }))

    // The single input shows the value; the operator stays in the
    // stored draft until the popup / panel is opened.
    expect(html).toContain('value="1000"')
    expect(html).not.toContain('aria-label="Filter Value operator"')
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

/**
 * Build a minimal DOMRect-shaped object for SSR tests. The real DOMRect
 * exists only in browsers; on the server React just hands the value to
 * the component which reads `.left` / `.top` / etc.
 */
function rect(x: number, y: number, width: number, height: number): DOMRect {
  return {
    x,
    y,
    width,
    height,
    left: x,
    top: y,
    right: x + width,
    bottom: y + height,
    toJSON() {
      return { x, y, width, height }
    },
  } as DOMRect
}

describe("FilterPopup — SSR markup contract", () => {
  test("renders without throwing on the server (no `window` access at first paint)", () => {
    const html = renderToStaticMarkup(
      <FilterPopup
        anchor={rect(120, 100, 40, 24)}
        columnId="account"
        filterType="text"
        filterText=""
        filterLabel="Account"
        onFilterChange={() => {}}
        onClear={() => {}}
        onClose={() => {}}
        messages={defaultMessages}
      />,
    )
    expect(html).toContain('data-bc-grid-filter-popup="true"')
    expect(html).toContain('role="dialog"')
  })

  test("emits Radix-style data-side / data-align attributes on the popup root", () => {
    // Single-source-of-truth invariant: the FilterPopup's resolved
    // placement is exposed via `data-side` / `data-align` so consumer
    // CSS can hook into it the same way it would for a Radix Popper —
    // and so future shadcn/Radix swaps don't change the rendered
    // markup contract.
    const html = renderToStaticMarkup(
      <FilterPopup
        anchor={rect(120, 100, 40, 24)}
        columnId="account"
        filterType="text"
        filterText=""
        filterLabel="Account"
        onFilterChange={() => {}}
        onClear={() => {}}
        onClose={() => {}}
        messages={defaultMessages}
      />,
    )
    expect(html).toContain('data-side="bottom"')
    expect(html).toContain('data-align="start"')
  })

  test("data-active reflects whether a filter value is present", () => {
    const empty = renderToStaticMarkup(
      <FilterPopup
        anchor={rect(120, 100, 40, 24)}
        columnId="account"
        filterType="text"
        filterText=""
        filterLabel="Account"
        onFilterChange={() => {}}
        onClear={() => {}}
        onClose={() => {}}
        messages={defaultMessages}
      />,
    )
    const active = renderToStaticMarkup(
      <FilterPopup
        anchor={rect(120, 100, 40, 24)}
        columnId="account"
        filterType="text"
        filterText="acme"
        filterLabel="Account"
        onFilterChange={() => {}}
        onClear={() => {}}
        onClose={() => {}}
        messages={defaultMessages}
      />,
    )
    expect(empty).not.toContain('data-active="true"')
    expect(active).toContain('data-active="true"')
    // Clear button is disabled when the filter is empty.
    expect(empty).toContain("disabled=")
  })
})

describe("filter popup trigger — Radix-style ARIA linkage", () => {
  test("aria-haspopup='dialog' is always set on the trigger", () => {
    const closed = renderFilterPopupTriggerHtml("", false)
    const open = renderFilterPopupTriggerHtml("", true)
    expect(closed).toContain('aria-haspopup="dialog"')
    expect(open).toContain('aria-haspopup="dialog"')
  })

  test("aria-expanded toggles with the popup state (omitted when closed)", () => {
    const closed = renderFilterPopupTriggerHtml("", false)
    const open = renderFilterPopupTriggerHtml("", true)
    // Closed: attribute omitted entirely (omitted-vs-false semantics so
    // CSS `[aria-expanded]` exists/not-exists patterns work cleanly).
    expect(closed).not.toMatch(/aria-expanded=/)
    // Open: aria-expanded="true" — React renders boolean true as the
    // string "true" in static markup.
    expect(open).toMatch(/aria-expanded="true"/)
  })

  test("aria-controls links the trigger to the popup id while open (Radix Popover convention)", () => {
    // Closed: no aria-controls (the dialog isn't in the DOM).
    const closed = renderFilterPopupTriggerHtml("", false)
    expect(closed).not.toMatch(/aria-controls=/)

    // Open: aria-controls=<filterPopupDomId(columnId)>. The id matches
    // what the FilterPopup itself uses for its own root, so AT users
    // can navigate from the trigger to the popup via the linkage.
    const open = renderFilterPopupTriggerHtml("", true, "Account", "account")
    expect(open).toContain('aria-controls="bc-grid-filter-popup-account"')
  })

  test("aria-controls uses domToken to escape special characters in column ids", () => {
    // domToken normalises non-ID-safe characters; the helper guarantees
    // the popup root and the trigger's aria-controls agree on the
    // generated id.
    const html = renderFilterPopupTriggerHtml("", true, "Customer Number", "customer:number/v1")
    // domToken converts non-[a-zA-Z0-9_-] characters to `-`; the
    // generated id is purely ascii and HTML-id-safe.
    const m = html.match(/aria-controls="(bc-grid-filter-popup-[A-Za-z0-9_-]+)"/)
    expect(m).not.toBeNull()
  })

  test("data-state mirrors the popup state ('open' | 'closed') for shadcn CSS hooks", () => {
    // Radix PopoverTrigger sets `data-state="open" | "closed"` on the
    // trigger so consumers can render an open-state highlight or
    // animate the trigger icon. Mirrors that contract on bc-grid's
    // funnel button — the popup root already carries `data-state`
    // (PR #252); this is the matching trigger-side hook.
    const closed = renderFilterPopupTriggerHtml("", false)
    const open = renderFilterPopupTriggerHtml("", true)
    expect(closed).toContain('data-state="closed"')
    expect(open).toContain('data-state="open"')
  })

  test("data-state and data-bc-grid-filter-button coexist on the same button", () => {
    // The dismiss-helper looks up `[data-bc-grid-filter-button]` to
    // skip outside-pointer dismiss when the trigger is clicked; the
    // shadcn `data-state` is independent. Both must coexist on the
    // same node.
    const html = renderFilterPopupTriggerHtml("", true)
    expect(html).toMatch(
      /data-bc-grid-filter-button="true"[^>]*data-state="open"|data-state="open"[^>]*data-bc-grid-filter-button="true"/,
    )
  })

  test("active-filter and open-state are independent — both fire when a filter is set and the popup is open", () => {
    // `bc-grid-header-filter-button-active` is the "filter has a value"
    // marker (drives the focus-ring colour); `data-state="open"` is the
    // popup-open marker (drives the accent-soft pressed surface). They
    // are independent layers — a popup can be open with no value yet,
    // and a value can be set while the popup is closed. Pin that both
    // attributes coexist when both are true.
    const html = renderFilterPopupTriggerHtml("CUST-00042", true)
    expect(html).toContain("bc-grid-header-filter-button-active")
    expect(html).toContain('data-state="open"')
    expect(html).toContain('data-active="true"')
  })

  test("trigger renders the funnel icon with currentColor — open-state highlight reads from `color`", () => {
    // The Radix-style open-state highlight changes `color` on the
    // button; the funnel SVG must adapt via `currentColor` so the icon
    // re-tints automatically across hover / open / active. Pin both
    // glyph variants — empty (outlined: stroke=currentColor) and
    // active (filled: fill=currentColor) — so a future refactor cannot
    // regress the icon to a hard-coded colour.
    const empty = renderFilterPopupTriggerHtml("", true)
    expect(empty).toContain("bc-grid-header-filter-icon")
    expect(empty).toContain('stroke="currentColor"')

    const active = renderFilterPopupTriggerHtml("CUST-00042", true)
    expect(active).toContain("bc-grid-header-filter-icon")
    expect(active).toContain('fill="currentColor"')
  })
})

describe("isInlineFilterApplicable — inline filter row UX contract", () => {
  function makeColumn(overrides: Partial<ResolvedColumn<Row>["source"]> = {}): ResolvedColumn<Row> {
    return {
      align: "left",
      columnId: "value",
      left: 0,
      pinned: null,
      position: 0,
      source: { columnId: "value", header: "Value", ...overrides },
      width: 120,
    }
  }

  test("data column with field is inline-filterable by default", () => {
    expect(isInlineFilterApplicable(makeColumn({ field: "name" }))).toBe(true)
  })

  test("data column with valueGetter is inline-filterable by default", () => {
    expect(isInlineFilterApplicable(makeColumn({ valueGetter: (row) => row.name }))).toBe(true)
  })

  test("non-data column with no field, no valueGetter, no filter config is NOT inline-filterable", () => {
    // Action / render-only columns shouldn't carry a filter input
    // since the cell value would be undefined.
    expect(isInlineFilterApplicable(makeColumn())).toBe(false)
  })

  test("non-data column with explicit filter config opts back in (host opt-in)", () => {
    // Synthetic / computed columns where the host wires the filter
    // through a custom value pipeline can still surface the inline
    // editor by setting `filter: { ... }`.
    expect(isInlineFilterApplicable(makeColumn({ filter: { type: "text" } }))).toBe(true)
  })

  test("filter:false always disables the inline cell, even for data columns", () => {
    expect(isInlineFilterApplicable(makeColumn({ field: "name", filter: false }))).toBe(false)
  })

  test("popup-variant column is NOT inline-filterable — funnel goes on the header instead", () => {
    expect(
      isInlineFilterApplicable(
        makeColumn({ field: "name", filter: { type: "text", variant: "popup" } }),
      ),
    ).toBe(false)
  })
})
