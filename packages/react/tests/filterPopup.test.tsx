import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { defaultMessages } from "../src/gridInternals"
import { FilterPopup } from "../src/headerCells"

const baseAnchor: DOMRect = {
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

function renderPopup(overrides: Partial<Parameters<typeof FilterPopup>[0]> = {}): string {
  return renderToStaticMarkup(
    <FilterPopup
      anchor={baseAnchor}
      columnId="account"
      filterType="text"
      filterText=""
      filterLabel="Filter Account"
      onFilterChange={() => {}}
      onClear={() => {}}
      onClose={() => {}}
      messages={defaultMessages}
      {...overrides}
    />,
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

describe("FilterPopup chrome", () => {
  test("uses CSS-class chrome (no hardcoded inline background / border / shadow)", () => {
    const html = renderPopup()
    expect(html).toContain('class="bc-grid-filter-popup"')
    // Position is allowed inline (anchor-derived); shadcn chrome must come
    // from the CSS so dark-mode tokens and host-app overrides apply.
    expect(html).not.toContain("background:hsl")
    expect(html).not.toContain("box-shadow")
    expect(html).not.toContain("rgba(0, 0, 0")
  })

  test("renders the popup at the anchor's bottom-left as inline position", () => {
    const html = renderPopup()
    // Anchor.bottom = 80 → top = 84; anchor.left = 240 → left = 240.
    expect(html).toMatch(/top:84(?:px)?/)
    expect(html).toMatch(/left:240(?:px)?/)
  })

  test("links the dialog to the title via aria-labelledby (sighted + AT parity)", () => {
    const html = renderPopup()
    // Per axe / WAI-ARIA: a dialog with a visible heading should reference
    // it via aria-labelledby rather than duplicating the name in
    // aria-label.
    const labelMatch = html.match(/aria-labelledby="([^"]+)"/)
    expect(labelMatch).not.toBeNull()
    if (labelMatch) {
      const titleId = labelMatch[1]
      expect(html).toContain(`id="${titleId}"`)
      expect(html).toContain("bc-grid-filter-popup-title")
      expect(html).toContain(">Filter Account</span>")
    }
  })

  test("does not also carry a duplicate aria-label on the dialog container", () => {
    // aria-labelledby already names the dialog. Doubling up would
    // produce an inconsistent name across screen readers.
    const html = renderPopup()
    expect(html).not.toMatch(/role="dialog"[^>]*aria-label="Filter Account"/)
  })

  test("wraps popup-hosted controls in the dedicated body surface", () => {
    const html = renderPopup()

    expect(html).toContain('data-bc-grid-filter-popup-body="true"')
    expect(html).toContain('class="bc-grid-filter-popup-body"')
    expect(html).toMatch(/class="bc-grid-filter-popup-body"[^>]*>.*class="bc-grid-filter-text"/s)
  })
})

describe("FilterPopup footer buttons", () => {
  test("renders Clear + Apply with distinct aria-labels", () => {
    const html = renderPopup()
    expect(html).toContain('aria-label="Clear Filter Account"')
    expect(html).toContain('aria-label="Apply Filter Account"')
    expect(html).toContain("bc-grid-filter-popup-clear")
    expect(html).toContain("bc-grid-filter-popup-apply")
    expect(html).toContain('data-variant="ghost"')
    expect(html).toContain('data-variant="primary"')
  })

  test("Clear is disabled when no filter is active; Apply is always enabled", () => {
    const empty = renderPopup({ filterText: "" })
    // Static-string match is stricter than parsing — pin exact attribute.
    expect(empty).toMatch(
      /aria-label="Clear Filter Account"[^>]*disabled|disabled[^>]*aria-label="Clear Filter Account"/,
    )
    // Apply has no `disabled` attribute in the static markup.
    expect(empty).not.toMatch(
      /aria-label="Apply Filter Account"[^>]*disabled|disabled[^>]*aria-label="Apply Filter Account"/,
    )
  })

  test("Clear is enabled once a filter value is present", () => {
    const active = renderPopup({ filterText: "CUST-00042" })
    expect(active).not.toMatch(
      /aria-label="Clear Filter Account"[^>]*disabled|disabled[^>]*aria-label="Clear Filter Account"/,
    )
  })
})

describe("FilterPopup active indicator", () => {
  test("active dot is absent when filterText is empty", () => {
    const html = renderPopup({ filterText: "" })
    expect(html).not.toContain("bc-grid-filter-popup-active-dot")
    // Container's data-active is omitted (not "false") so CSS selectors
    // can use `[data-active]` exists / not-exists semantics.
    expect(html).not.toMatch(/data-active="(true|false)"/)
  })

  test("active dot + data-active=true appear when filterText is non-empty", () => {
    const html = renderPopup({ filterText: "CUST-00042" })
    expect(html).toContain("bc-grid-filter-popup-active-dot")
    expect(html).toContain('data-active="true"')
  })

  test("active dot is aria-hidden so AT users get the indicator from the live filter, not the dot", () => {
    const html = renderPopup({ filterText: "CUST-00042" })
    expect(html).toMatch(
      /class="bc-grid-filter-popup-active-dot"[^>]*aria-hidden="true"|aria-hidden="true"[^>]*class="bc-grid-filter-popup-active-dot"/,
    )
  })
})

describe("FilterPopup data hooks", () => {
  test("preserves the data-bc-grid-filter-popup attribute used by the click-outside handler", () => {
    const html = renderPopup()
    expect(html).toContain('data-bc-grid-filter-popup="true"')
    expect(html).toContain('data-column-id="account"')
  })

  test("renders exactly one data-bc-grid-filter-clear hook (the Clear button)", () => {
    const html = renderPopup({ filterText: "CUST-00042" })
    expect(countMatches(html, 'data-bc-grid-filter-clear="true"')).toBe(1)
  })
})

describe("FilterPopup Radix-style state attributes", () => {
  test("emits data-state='open' on the dialog root for shadcn / Radix CSS hooks", () => {
    // Mirrors the Radix Popover.Content contract — even though the popup
    // is unmount-on-close (so the value is constant), apps can target
    // the popup with `[data-bc-grid-filter-popup][data-state="open"]
    // { … }` exactly the way they would Radix.
    const html = renderPopup()
    expect(html).toMatch(/role="dialog"[^>]*data-state="open"|data-state="open"[^>]*role="dialog"/)
  })

  test("emits data-side and data-align (resolved placement, not requested)", () => {
    const html = renderPopup()
    // Default placement: bottom + start. The helper resolves these
    // values; consumers can detect a flip via the rendered attribute.
    expect(html).toContain('data-side="bottom"')
    expect(html).toContain('data-align="start"')
  })
})

describe("FilterPopup chrome polish (slice 4)", () => {
  test("Apply button is the primary action — accent bg + accent fg", () => {
    // The apply button shipped in the popup-interaction-contracts pass
    // already routed through `--bc-grid-accent`; this test pins the
    // contract so a future polish pass can't accidentally regress
    // Apply to a row-selected accent (which would be visually
    // identical on hosts that don't distinguish primary from accent).
    const html = renderPopup()
    expect(html).toContain("bc-grid-filter-popup-apply")
    // Marker class survives — the styles.css rule pins background:
    // var(--bc-grid-accent) and color: var(--bc-grid-accent-fg).
    expect(html).toMatch(/class="bc-grid-filter-popup-button bc-grid-filter-popup-apply"/)
  })

  test("Clear button uses the shadcn-ghost class hooks (transparent border, muted fg)", () => {
    // The CSS overrides the default `border-color` to transparent and
    // sets `color` to muted-fg. Markup-side: the class hook is the
    // only invariant we can assert here.
    const html = renderPopup({ filterText: "CUST-00042" })
    expect(html).toMatch(/class="bc-grid-filter-popup-button bc-grid-filter-popup-clear"/)
  })

  test("active dot uses the accent token, not the focus-ring (was visually conflated)", () => {
    // Active-dot's CSS swaps from `--bc-grid-focus-ring` to
    // `--bc-grid-accent` so the indicator reads as "filter applied"
    // rather than "this widget is keyboard-focused". Markup-side the
    // class is the contract; the styles.css rule is asserted in the
    // theming test suite.
    const html = renderPopup({ filterText: "CUST-00042" })
    expect(html).toContain("bc-grid-filter-popup-active-dot")
  })
})
