import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { BcGridSidebar, type ResolvedSidebarPanel } from "../src/sidebar"
import type { BcSidebarContext } from "../src/types"

interface Row {
  id: string
}

const NoopIcon = ({ className }: { className?: string }) => (
  <svg aria-hidden="true" className={className} />
)

const PANELS: readonly ResolvedSidebarPanel<Row>[] = [
  {
    id: "columns",
    label: "Columns",
    Icon: NoopIcon,
    render: () => null,
  },
  {
    id: "filters",
    label: "Filters",
    Icon: NoopIcon,
    render: () => null,
  },
  {
    id: "pivot",
    label: "Pivot",
    Icon: NoopIcon,
    render: () => null,
  },
]

const CONTEXT = {} as unknown as BcSidebarContext<Row>

function renderSidebar(activePanelId: string | null): string {
  return renderToStaticMarkup(
    <BcGridSidebar<Row>
      panels={PANELS}
      activePanelId={activePanelId}
      context={CONTEXT}
      domBaseId="grid"
      onActivePanelChange={() => {}}
    />,
  )
}

function tabsByLabel(html: string): Record<string, string> {
  // Pull each `<button … role="tab" … aria-label="…" … tabindex="…">` into
  // a label → fragment map. The static markup is small enough that a
  // direct regex is fine.
  const fragments = html.match(/<button\b[^>]*role="tab"[^>]*>/g) ?? []
  const out: Record<string, string> = {}
  for (const fragment of fragments) {
    const m = fragment.match(/aria-label="([^"]+)"/)
    if (m?.[1]) out[m[1]] = fragment
  }
  return out
}

describe("BcGridSidebar — tablist roving tabindex (WAI-ARIA APG)", () => {
  test("only the selected tab is in the Tab sequence; others are tabIndex=-1", () => {
    const html = renderSidebar("filters")
    const tabs = tabsByLabel(html)
    expect(tabs.Columns).toMatch(/tabindex="-1"/)
    expect(tabs.Filters).toMatch(/tabindex="0"/)
    expect(tabs.Pivot).toMatch(/tabindex="-1"/)
  })

  test("when no panel is selected (rail collapsed), the first tab is the tabbable anchor", () => {
    // Without a selected tab, the strict roving rule would leave every
    // tab at tabindex=-1 — a keyboard user couldn't Tab into the rail.
    // Per WAI-ARIA APG, the first tab is the fallback.
    const html = renderSidebar(null)
    const tabs = tabsByLabel(html)
    expect(tabs.Columns).toMatch(/tabindex="0"/)
    expect(tabs.Filters).toMatch(/tabindex="-1"/)
    expect(tabs.Pivot).toMatch(/tabindex="-1"/)
  })

  test("the active tab carries `aria-selected='true'` while others carry `aria-selected='false'`", () => {
    const html = renderSidebar("pivot")
    const tabs = tabsByLabel(html)
    expect(tabs.Columns).toMatch(/aria-selected="false"/)
    expect(tabs.Filters).toMatch(/aria-selected="false"/)
    expect(tabs.Pivot).toMatch(/aria-selected="true"/)
  })

  test("data-state mirrors the selected/closed state for shadcn CSS hooks", () => {
    const html = renderSidebar("columns")
    const tabs = tabsByLabel(html)
    expect(tabs.Columns).toMatch(/data-state="open"/)
    expect(tabs.Filters).toMatch(/data-state="closed"/)
    expect(tabs.Pivot).toMatch(/data-state="closed"/)
  })

  test("renders without `window` access (SSR-safe)", () => {
    // The component reads `window` only inside `requestFocusFrame`,
    // which runs from a layout effect — never during render. This is
    // the load-bearing invariant for Next.js app-router consumers.
    const html = renderSidebar("filters")
    expect(html).toContain('role="tablist"')
    expect(html).toContain('role="tabpanel"')
  })

  test("the panel body retains tabIndex=-1 so Tab from the rail lands inside, not back on the tab", () => {
    // The panel body receives focus programmatically when the user
    // hits Enter / Space on a tab; the `tabIndex=-1` makes that
    // focusable without putting the panel itself in the natural Tab
    // sequence (Tab from the active tab continues into the panel
    // contents).
    const html = renderSidebar("columns")
    expect(html).toMatch(/role="tabpanel"[^>]*tabindex="-1"|tabindex="-1"[^>]*role="tabpanel"/)
  })
})
