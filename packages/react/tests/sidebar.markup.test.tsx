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
  // Radix `[data-state="active" | "inactive"]`, and `[data-state="open" |
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

  test("each tab carries the `bc-grid-sidebar-tab` class and Radix active/inactive state", () => {
    const html = renderSidebar("columns")

    // Both tabs render with the surface class so theming targets land.
    const tabClassMatches = html.match(/class="bc-grid-sidebar-tab"/g)
    expect(tabClassMatches?.length).toBe(2)

    // Active tab pins Radix data-state="active" + aria-selected="true".
    expect(html).toMatch(
      /<button(?=[^>]*aria-label="Columns")(?=[^>]*aria-selected="true")(?=[^>]*data-state="active")/,
    )
    // Inactive tab pins Radix data-state="inactive" + aria-selected="false".
    expect(html).toMatch(
      /<button(?=[^>]*aria-label="Filters")(?=[^>]*aria-selected="false")(?=[^>]*data-state="inactive")/,
    )
  })

  test("collapsed sidebar marks every tab inactive (no tab claims active when no panel is open)", () => {
    const html = renderSidebar(null)
    expect(html).not.toMatch(/<button(?=[^>]*role="tab")(?=[^>]*data-state="active")/)
    const inactiveMatches = html.match(/<button(?=[^>]*role="tab")(?=[^>]*data-state="inactive")/g)
    expect(inactiveMatches?.length).toBe(2)
  })

  test("collapsed sidebar renders Radix-hidden panel content and active state exposes the panel", () => {
    const collapsed = renderSidebar(null)
    const hiddenPanels = collapsed.match(
      /<div(?=[^>]*role="tabpanel")(?=[^>]*hidden="")(?=[^>]*class="bc-grid-sidebar-panel")/g,
    )
    expect(hiddenPanels?.length).toBe(2)

    const opened = renderSidebar("columns")
    expect(opened).toContain('class="bc-grid-sidebar-panel"')
    expect(opened).toMatch(/<div(?=[^>]*role="tabpanel")(?=[^>]*data-state="active")/)
  })
})
