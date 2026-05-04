import { afterEach, describe, expect, test } from "bun:test"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { encodeSetFilterInput } from "../../src/filter"
import { defaultMessages } from "../../src/gridInternals"
import { FilterPopup } from "../../src/headerCells"
import { BcGridTooltip } from "../../src/tooltip"

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

afterEach(() => cleanup())

function renderPopup(overrides: Partial<Parameters<typeof FilterPopup>[0]> = {}): {
  closeCount: () => number
} {
  let closed = 0
  render(
    <FilterPopup
      anchor={baseAnchor}
      columnId="account"
      filterType="text"
      filterText=""
      filterLabel="Filter Account"
      onFilterChange={() => {}}
      onClear={() => {}}
      onClose={() => {
        closed += 1
      }}
      messages={defaultMessages}
      {...overrides}
    />,
  )
  return { closeCount: () => closed }
}

describe("BcGridTooltip — Radix Tooltip contract", () => {
  test("opens through Radix Tooltip while preserving the bc-grid trigger and content hooks", async () => {
    render(
      <div className="bc-grid">
        <BcGridTooltip content="Customer note" id="customer-note-tooltip">
          <button type="button" aria-describedby="cell-error">
            Cell
          </button>
        </BcGridTooltip>
      </div>,
    )

    const trigger = screen.getByRole("button", { name: "Cell" })
    expect(trigger.getAttribute("data-bc-grid-tooltip-trigger")).toBe("true")
    expect(trigger.getAttribute("aria-describedby")).toBe("cell-error")

    fireEvent.focus(trigger)
    await waitFor(() =>
      expect(document.querySelector<HTMLElement>(".bc-grid-tooltip-content")).not.toBeNull(),
    )
    const tooltip = document.querySelector<HTMLElement>(".bc-grid-tooltip-content")

    expect(tooltip?.id).toBe("customer-note-tooltip")
    expect(tooltip?.getAttribute("data-state")).toBe("instant-open")
    expect(tooltip?.textContent).toContain("Customer note")
    expect(trigger.getAttribute("aria-describedby")).toContain("cell-error")
    expect(trigger.getAttribute("aria-describedby")).toContain("customer-note-tooltip")
  })
})

describe("FilterPopup — Radix Popover contract", () => {
  test("renders filter popup content through Radix Popover with preserved bc-grid hooks", async () => {
    renderPopup()

    const dialog = await screen.findByRole("dialog", { name: "Filter Account" })
    expect(dialog.id).toBe("bc-grid-filter-popup-account")
    expect(dialog.getAttribute("data-slot")).toBe("popover-content")
    expect(dialog.getAttribute("data-bc-grid-filter-popup")).toBe("true")
    expect(dialog.getAttribute("data-state")).toBe("open")
    expect(dialog.getAttribute("data-side")).toBe("bottom")
    expect(dialog.getAttribute("data-align")).toBe("start")
    expect(dialog.classList.contains("bc-grid-filter-popup")).toBe(true)
    expect(within(dialog).getByText("Filter Account")).toBeDefined()
    expect(within(dialog).getByLabelText("Clear Filter Account").hasAttribute("disabled")).toBe(
      true,
    )
    expect(within(dialog).getByLabelText("Filter Account operator")).toBeDefined()
  })

  test("hydrates advanced text operator controls inside the popover", async () => {
    renderPopup({
      filterText: JSON.stringify({ op: "starts-with", value: "AC", regex: true }),
    })

    const dialog = await screen.findByRole("dialog", { name: "Filter Account" })
    const operator = within(dialog).getByLabelText("Filter Account operator") as HTMLSelectElement
    const input = within(dialog).getByLabelText("Filter Account") as HTMLInputElement
    const regex = within(dialog).getByLabelText("Filter Account regex")
    const caseSensitive = within(dialog).getByLabelText("Filter Account case sensitive")

    expect(operator.value).toBe("starts-with")
    expect(input.value).toBe("AC")
    expect(input.getAttribute("placeholder")).toBe("Regex pattern")
    expect(regex.getAttribute("aria-pressed")).toBe("true")
    expect(caseSensitive.getAttribute("aria-pressed")).toBe("false")
    expect(dialog.getAttribute("data-active")).toBe("true")
  })

  test("Escape and outside pointer dismissal route through Popover onOpenChange", async () => {
    const escapePopup = renderPopup()
    const escapeDialog = await screen.findByRole("dialog", { name: "Filter Account" })

    fireEvent.keyDown(escapeDialog, { key: "Escape" })
    await waitFor(() => expect(escapePopup.closeCount()).toBe(1))
    cleanup()

    const outsidePopup = renderPopup()
    await screen.findByRole("dialog", { name: "Filter Account" })

    fireEvent.pointerDown(document.body)
    await waitFor(() => expect(outsidePopup.closeCount()).toBe(1))
  })

  test("filter trigger pointer down is left for the header click toggle", async () => {
    let closed = 0
    render(
      <>
        <button
          type="button"
          aria-controls="bc-grid-filter-popup-account"
          aria-label="Open account filter"
          data-bc-grid-filter-button="true"
        >
          Open
        </button>
        <FilterPopup
          anchor={baseAnchor}
          columnId="account"
          filterType="text"
          filterText=""
          filterLabel="Filter Account"
          onFilterChange={() => {}}
          onClear={() => {}}
          onClose={() => {
            closed += 1
          }}
          messages={defaultMessages}
        />
      </>,
    )
    await screen.findByRole("dialog", { name: "Filter Account" })

    fireEvent.pointerDown(screen.getByRole("button", { name: "Open account filter" }))

    expect(closed).toBe(0)
  })

  test("hosts the set filter operator and value picker inside the popover", async () => {
    renderPopup({
      columnId: "status",
      filterType: "set",
      filterLabel: "Filter Status",
      filterText: encodeSetFilterInput({ op: "not-in", values: ["Closed", "Draft"] }),
    })

    const dialog = await screen.findByRole("dialog", { name: "Filter Status" })
    const operator = within(dialog).getByLabelText("Filter Status operator") as HTMLSelectElement
    const values = within(dialog).getByLabelText("Filter Status values") as HTMLButtonElement

    expect(operator.value).toBe("not-in")
    expect(values.textContent).toContain("2 selected")
    expect(values.getAttribute("data-active")).toBe("true")
    expect(dialog.getAttribute("data-active")).toBe("true")
  })

  test("hydrates set filter op=blank with the disabled value-picker contract", async () => {
    renderPopup({
      columnId: "status",
      filterType: "set",
      filterLabel: "Filter Status",
      filterText: encodeSetFilterInput({ op: "blank", values: [] }),
    })

    const dialog = await screen.findByRole("dialog", { name: "Filter Status" })
    const operator = within(dialog).getByLabelText("Filter Status operator") as HTMLSelectElement
    const values = within(dialog).getByLabelText("Filter Status values")

    expect(operator.value).toBe("blank")
    expect(values.textContent).toContain("Blank rows")
    expect(values.hasAttribute("disabled")).toBe(true)
  })
})
