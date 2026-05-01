import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { BcGridSidebar, type ResolvedSidebarPanel } from "../src/sidebar"
import type { BcSidebarContext } from "../src/types"

interface Row {
  id: string
}

const stubContext = {} as BcSidebarContext<Row>

const panels: readonly ResolvedSidebarPanel<Row>[] = [
  {
    id: "columns",
    label: "Columns",
    Icon: () => null,
    render: () => null,
  },
  {
    id: "filters",
    label: "Filters",
    Icon: () => null,
    render: () => null,
  },
]

function renderSidebar(activePanelId: string | null): string {
  return renderToStaticMarkup(
    <BcGridSidebar<Row>
      panels={panels}
      activePanelId={activePanelId}
      context={stubContext}
      domBaseId="bc-grid-test"
      onActivePanelChange={() => {}}
    />,
  )
}

describe("BcGridSidebar — class / data-state hooks for shadcn-style chrome", () => {
  // Pin the surface hooks the theming layer reads from. The CSS
  // selectors target `.bc-grid-sidebar-rail`, `.bc-grid-sidebar-tab`,
  // `[data-state="open" | "closed"]`, and `[data-state="open" |
  // "collapsed"]` on the aside. If a refactor drops or renames any
  // of these the visual contract stops applying — these assertions
  // catch that drift before review.

  test("aside carries `bc-grid-sidebar` class and `data-state` reflecting the open / collapsed shape", () => {
    const collapsed = renderSidebar(null)
    expect(collapsed).toContain('class="bc-grid-sidebar"')
    expect(collapsed).toContain('data-state="collapsed"')

    const opened = renderSidebar("filters")
    expect(opened).toContain('class="bc-grid-sidebar"')
    expect(opened).toContain('data-state="open"')
  })

  test("rail container exposes `bc-grid-sidebar-rail` plus `role=tablist` so AT users see a tablist, not arbitrary buttons", () => {
    const html = renderSidebar(null)
    expect(html).toContain('class="bc-grid-sidebar-rail"')
    expect(html).toContain('role="tablist"')
    expect(html).toContain('aria-orientation="vertical"')
  })

  test("each tab carries the `bc-grid-sidebar-tab` class and a `data-state` of `open` (active) or `closed` (inactive)", () => {
    const html = renderSidebar("columns")

    // Both tabs render with the surface class so theming targets land.
    const tabClassMatches = html.match(/class="bc-grid-sidebar-tab"/g)
    expect(tabClassMatches?.length).toBe(2)

    // Active tab pins data-state="open" + aria-selected="true".
    expect(html).toMatch(/aria-label="Columns"[^>]*aria-selected="true"[^>]*data-state="open"/)
    // Inactive tab pins data-state="closed" + aria-selected="false".
    expect(html).toMatch(/aria-label="Filters"[^>]*aria-selected="false"[^>]*data-state="closed"/)
  })

  test("collapsed sidebar marks every tab as `data-state=closed` (no tab claims active when no panel is open)", () => {
    const html = renderSidebar(null)
    expect(html).not.toMatch(/data-state="open"[^>]*role="tab"/)
    const closedMatches = html.match(/data-state="closed"/g)
    expect(closedMatches?.length).toBe(2)
  })

  test("rail tabs render no panel surface when collapsed (`bc-grid-sidebar-panel` is omitted)", () => {
    // The panel surface is conditionally rendered; pin that contract
    // so a regression that always renders the panel (and hides via
    // CSS) doesn't accidentally land — it would defeat the
    // collapsed-rail treatment.
    const collapsed = renderSidebar(null)
    expect(collapsed).not.toContain('class="bc-grid-sidebar-panel"')

    const opened = renderSidebar("columns")
    expect(opened).toContain('class="bc-grid-sidebar-panel"')
    expect(opened).toMatch(/role="tabpanel"/)
  })
})
