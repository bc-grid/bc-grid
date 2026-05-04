import { afterEach, describe, expect, test } from "bun:test"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { act, useState } from "react"
import { BcGridSidebar, type ResolvedSidebarPanel } from "../../src/sidebar"
import type { BcSidebarContext } from "../../src/types"

interface Row {
  id: string
}

const stubContext = {} as BcSidebarContext<Row>

const panels: readonly ResolvedSidebarPanel<Row>[] = [
  {
    id: "columns",
    label: "Columns",
    Icon: () => null,
    render: () => <div>Columns body</div>,
  },
  {
    id: "filters",
    label: "Filters",
    Icon: () => null,
    render: () => <div>Filters body</div>,
  },
]

afterEach(() => cleanup())

function SidebarHarness({ initialActive = null }: { initialActive?: string | null }) {
  const [activePanel, setActivePanel] = useState<string | null>(initialActive)
  return (
    <BcGridSidebar<Row>
      panels={panels}
      activePanelId={activePanel}
      context={stubContext}
      domBaseId="bc-grid-dom"
      onActivePanelChange={setActivePanel}
    />
  )
}

describe("BcGridSidebar — Radix Tabs contract", () => {
  test("renders the rail and active panel through Radix Tabs primitives", () => {
    render(<SidebarHarness initialActive="columns" />)

    expect(document.querySelector(".bc-grid-sidebar-tabs")?.getAttribute("data-slot")).toBe("tabs")
    expect(screen.getByRole("tablist", { name: "Sidebar tools" })).toBeDefined()

    const columns = screen.getByRole("tab", { name: "Columns" })
    const filters = screen.getByRole("tab", { name: "Filters" })
    expect(columns.getAttribute("data-slot")).toBe("tabs-trigger")
    expect(columns.getAttribute("data-state")).toBe("active")
    expect(filters.getAttribute("data-state")).toBe("inactive")

    const panel = screen.getByRole("tabpanel")
    expect(panel.getAttribute("data-slot")).toBe("tabs-content")
    expect(panel.classList.contains("bc-grid-sidebar-panel")).toBe(true)
    expect(panel.textContent).toContain("Columns body")
  })

  test("clicking the active tab collapses and clicking another tab switches panels", () => {
    render(<SidebarHarness initialActive="columns" />)

    fireEvent.click(screen.getByRole("tab", { name: "Columns" }))
    expect(screen.queryByRole("tabpanel")).toBeNull()

    fireEvent.click(screen.getByRole("tab", { name: "Filters" }))
    const panel = screen.getByRole("tabpanel")
    expect(panel.textContent).toContain("Filters body")
  })

  test("manual activation waits for Enter when focus is on another tab", async () => {
    render(<SidebarHarness initialActive="columns" />)

    const filters = screen.getByRole("tab", { name: "Filters" })
    expect(filters.getAttribute("data-radix-collection-item")).toBe("")
    await act(async () => {
      filters.focus()
    })
    expect(screen.getByRole("tabpanel").textContent).toContain("Columns body")

    await act(async () => {
      fireEvent.keyDown(filters, { key: "Enter" })
    })
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("tabpanel")))
    expect(screen.getByRole("tabpanel").textContent).toContain("Filters body")
  })

  test("Escape closes the active tab content and returns focus to the trigger", async () => {
    render(<SidebarHarness initialActive="filters" />)

    const panel = screen.getByRole("tabpanel")
    await act(async () => {
      panel.focus()
    })
    await act(async () => {
      fireEvent.keyDown(panel, { key: "Escape" })
    })

    await waitFor(() => expect(screen.queryByRole("tabpanel")).toBeNull())
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Filters" }))
  })
})
