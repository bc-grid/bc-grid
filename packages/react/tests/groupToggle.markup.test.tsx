import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { renderGroupRowCell } from "../src/bodyCells"
import type { GroupRowEntry, ResolvedColumn } from "../src/gridInternals"

interface Row {
  id: string
  region: string
}

const groupColumn: ResolvedColumn<Row> = {
  align: "left",
  columnId: "region",
  left: 0,
  pinned: null,
  position: 0,
  source: { columnId: "region", field: "region", header: "Region" },
  width: 200,
}

function makeGroupEntry(expanded: boolean): GroupRowEntry {
  return {
    kind: "group",
    rowId: "region:emea",
    index: 0,
    level: 0,
    label: "EMEA",
    childCount: 5,
    childRowIds: ["r1", "r2", "r3", "r4", "r5"],
    expanded,
  }
}

function renderGroupCell(expanded: boolean): string {
  return renderToStaticMarkup(
    renderGroupRowCell({
      activeCell: null,
      colCount: 4,
      column: groupColumn,
      domBaseId: "bc-grid",
      entry: makeGroupEntry(expanded),
      onToggle: () => {},
      totalWidth: 800,
      virtualRow: { height: 36 },
    }),
  )
}

describe("renderGroupRowCell — disclosure affordance (no text-glyph chevron)", () => {
  // Brief: master/detail and group expand/collapse must never scale
  // text, morph font size, or rotate text glyphs. The pre-cleanup
  // group toggle rendered a literal `&gt;` text node that the CSS
  // rotated 90deg on `aria-expanded="true"` — the actual character
  // glyph being rotated. These tests pin the SVG affordance so that
  // anti-pattern can't return.

  test("renders an SVG disclosure chevron, never a `&gt;` text glyph", () => {
    const closed = renderGroupCell(false)
    const open = renderGroupCell(true)

    // SVG chevron present with the shared icon class.
    expect(closed).toContain("<svg")
    expect(closed).toMatch(/class="bc-grid-group-toggle-icon"/)
    expect(closed).toContain('viewBox="0 0 12 12"')
    // No `&gt;` character rendered as a child of the toggle button.
    expect(closed).not.toMatch(/<button[^>]*bc-grid-group-toggle[^>]*>[^<]*&gt;[^<]*<\/button>/)
    expect(open).not.toMatch(/<button[^>]*bc-grid-group-toggle[^>]*>[^<]*&gt;[^<]*<\/button>/)
  })

  test("aria-expanded reflects the group state and label changes accordingly", () => {
    const closed = renderGroupCell(false)
    const open = renderGroupCell(true)

    expect(closed).toMatch(/aria-expanded="false"/)
    expect(open).toMatch(/aria-expanded="true"/)
    expect(closed).toContain('aria-label="Expand EMEA"')
    expect(open).toContain('aria-label="Collapse EMEA"')
  })

  test("group label and child count render outside the toggle button (not inside the rotation target)", () => {
    // The label / count text live in sibling spans — never inside the
    // rotation target. If a regression moves them inside the icon
    // span, CSS rotation would scale the visible label.
    const html = renderGroupCell(true)

    // Label and count are present.
    expect(html).toContain("EMEA")
    expect(html).toContain("(5)")

    // The icon span (bc-grid-group-toggle-icon) carries no descendant
    // text content other than the SVG paths. Pin this by asserting
    // the label / count don't appear inside an element with the
    // toggle-icon class. Crude regex check: between
    // `bc-grid-group-toggle-icon` and the next class change, no
    // human text should appear.
    const iconChunkMatch = html.match(/class="bc-grid-group-toggle-icon"[^>]*>([\s\S]*?)<\/svg>/)
    expect(iconChunkMatch).not.toBeNull()
    if (iconChunkMatch?.[1]) {
      expect(iconChunkMatch[1]).not.toContain("EMEA")
      expect(iconChunkMatch[1]).not.toContain("(5)")
    }
  })

  test("toggle markup uses the bc-grid-group-toggle class for the CSS surface", () => {
    // Pin the surface class so the theming-test invariants
    // (transform on icon only, no scale, no height-morph) keep
    // applying after refactors.
    const html = renderGroupCell(false)
    expect(html).toContain('class="bc-grid-group-toggle"')
  })
})
