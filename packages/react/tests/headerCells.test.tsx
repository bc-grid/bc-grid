import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { type ResolvedColumn, defaultMessages } from "../src/gridInternals"
import {
  FilterPopup,
  renderFilterCell,
  renderHeaderCell,
  shouldStopFilterKeyDown,
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

  test("text filter cell exposes operator select + value input + both modifier toggles in order", () => {
    // Layout invariant for filter-row-shadcn-polish-v030. The text
    // filter row must always render four stable controls — operator
    // <select>, value <input>, case-sensitive <button>, regex
    // <button> — in that DOM order. A future refactor that drops a
    // toggle (or reorders them) breaks pointer-target assumptions in
    // host apps' e2e suites.
    const html = renderTextFilterCellHtml("")

    const opIdx = html.indexOf('aria-label="Filter Account operator"')
    const valIdx = html.indexOf('aria-label="Filter Account"')
    const caseIdx = html.indexOf('aria-label="Filter Account case sensitive"')
    const regexIdx = html.indexOf('aria-label="Filter Account regex"')
    expect(opIdx).toBeGreaterThan(-1)
    expect(valIdx).toBeGreaterThan(opIdx)
    expect(caseIdx).toBeGreaterThan(valIdx)
    expect(regexIdx).toBeGreaterThan(caseIdx)
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

describe("shouldStopFilterKeyDown — filter editor keyboard isolation contract", () => {
  // The filter editor wraps every input / select / button with an
  // onKeyDown that calls `event.stopPropagation()` so a keystroke
  // inside the editor never bubbles up to the parent header cell
  // (Enter / Space would trigger column sort) or the grid root
  // (ArrowDown / Home / End would consume cell navigation). Pure
  // helper so the contract stays unit-testable without mounting React.

  test("Enter inside a filter input stops propagation (would otherwise sort the column)", () => {
    expect(shouldStopFilterKeyDown({ key: "Enter" })).toBe(true)
  })

  test("Space inside a filter input stops propagation (would otherwise sort the column or activate parent click)", () => {
    expect(shouldStopFilterKeyDown({ key: " " })).toBe(true)
  })

  test("Tab inside a filter input stops propagation so the grid root never consumes Tab", () => {
    expect(shouldStopFilterKeyDown({ key: "Tab" })).toBe(true)
  })

  test("Arrow keys inside a filter input stop propagation so cell navigation never fires", () => {
    for (const key of ["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight"]) {
      expect(shouldStopFilterKeyDown({ key })).toBe(true)
    }
  })

  test("Home / End / PageUp / PageDown inside a filter input stop propagation", () => {
    for (const key of ["Home", "End", "PageUp", "PageDown"]) {
      expect(shouldStopFilterKeyDown({ key })).toBe(true)
    }
  })

  test("printable characters inside a filter input stop propagation", () => {
    for (const key of ["a", "1", "/", "?"]) {
      expect(shouldStopFilterKeyDown({ key })).toBe(true)
    }
  })

  test("Escape stops propagation by default (popup variant — usePopupDismiss listens at the document)", () => {
    expect(shouldStopFilterKeyDown({ key: "Escape" })).toBe(true)
    expect(shouldStopFilterKeyDown({ key: "Escape" }, {})).toBe(true)
    expect(shouldStopFilterKeyDown({ key: "Escape" }, { allowEscapeKeyPropagation: false })).toBe(
      true,
    )
  })

  test("Escape passes through when allowEscapeKeyPropagation is true (sidebar-panel variant)", () => {
    // The filters tool panel passes `allowEscapeKeyPropagation` so a
    // top-level Escape can still dismiss the panel from a focused
    // editor input. Without this, the panel's dismiss handler would
    // never fire because the editor swallows the keystroke.
    expect(shouldStopFilterKeyDown({ key: "Escape" }, { allowEscapeKeyPropagation: true })).toBe(
      false,
    )
  })

  test("non-Escape keys ignore allowEscapeKeyPropagation — the option is Escape-only", () => {
    for (const key of ["Enter", " ", "Tab", "ArrowDown"]) {
      expect(shouldStopFilterKeyDown({ key }, { allowEscapeKeyPropagation: true })).toBe(true)
    }
  })
})

describe("FilterPopup keyboard contract — DOM hooks", () => {
  // The popup keyboard contract relies on three DOM-level invariants
  // that SSR markup pins:
  //   1. role="dialog" + aria-labelledby — AT users land in a named
  //      dialog when the trigger fires (matches Radix Popover.Content).
  //   2. The body wraps focusable controls in a stable DOM order so
  //      Tab / Shift+Tab walk through them predictably.
  //   3. The footer's Clear precedes Apply so Apply is the last
  //      tabbable surface before focus exits the popup (the natural
  //      "I'm done with this filter" gesture).
  // These tests pin the structure that `usePopupDismiss` + the
  // editor's `shouldStopFilterKeyDown` handlers need to be effective.

  test("popup root is a dialog with aria-labelledby pointing at the title id", () => {
    const html = renderTextFilterPopup("")
    expect(html).toMatch(
      /<div[^>]*role="dialog"[^>]*aria-labelledby="bc-grid-filter-popup-account-title"|aria-labelledby="bc-grid-filter-popup-account-title"[^>]*role="dialog"/,
    )
  })

  test("popup tab order: body controls precede the footer's Clear, Clear precedes Apply", () => {
    const html = renderTextFilterPopup("CUST-00042")

    const operatorIdx = html.indexOf('aria-label="Filter Account operator"')
    const valueIdx = html.indexOf('aria-label="Filter Account"')
    const caseIdx = html.indexOf('aria-label="Filter Account case sensitive"')
    const regexIdx = html.indexOf('aria-label="Filter Account regex"')
    const clearIdx = html.indexOf('aria-label="Clear Filter Account"')
    const applyIdx = html.indexOf('aria-label="Apply Filter Account"')

    // Every editor control comes before the footer.
    expect(operatorIdx).toBeGreaterThan(-1)
    expect(valueIdx).toBeGreaterThan(operatorIdx)
    expect(caseIdx).toBeGreaterThan(valueIdx)
    expect(regexIdx).toBeGreaterThan(caseIdx)
    expect(clearIdx).toBeGreaterThan(regexIdx)
    expect(applyIdx).toBeGreaterThan(clearIdx)
  })

  test("set-filter trigger inside the popup carries Radix-style aria-haspopup + aria-controls + aria-expanded", () => {
    // Set-filter rows inside the popup body still need the nested
    // disclosure ARIA so AT users get correct semantics. The trigger's
    // own keydown handler treats Escape-while-open as "close just the
    // inner menu" and doesn't bubble that Escape up to the popup.
    const html = renderToStaticMarkup(
      <FilterPopup
        anchor={popupAnchor}
        columnId="status"
        filterType="set"
        filterText=""
        filterLabel="Filter Status"
        onFilterChange={() => {}}
        onClear={() => {}}
        onClose={() => {}}
        messages={defaultMessages}
      />,
    )
    expect(html).toContain('aria-haspopup="dialog"')
    // aria-expanded sits on the set-filter trigger button (closed
    // state — false). React renders it as a string in static markup.
    expect(html).toMatch(/<button[^>]*aria-expanded="false"[^>]*class="bc-grid-filter-set-button"/)
    expect(html).toContain('aria-label="Filter Status values"')
  })

  test("popup body is wrapped in a stable selector so the dismiss helper's containment check stays valid", () => {
    // `usePopupDismiss` calls `popupRef.current.contains(target)` to
    // decide whether a click is "inside the popup" and should not
    // dismiss. The popup root carries `data-bc-grid-filter-popup` so
    // the dismiss-ignore selectors and integration tests can locate
    // it; the body carries `data-bc-grid-filter-popup-body` so the
    // editor controls sit inside a single named region.
    const html = renderTextFilterPopup("")
    expect(html).toContain('data-bc-grid-filter-popup="true"')
    expect(html).toContain('data-bc-grid-filter-popup-body="true"')
  })
})
