import { afterEach, describe, expect, test } from "bun:test"
import type { ColumnId } from "@bc-grid/core"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { useState } from "react"
import { type ColumnVisibilityItem, ColumnVisibilityMenu } from "../../src/columnVisibility"

const items: readonly ColumnVisibilityItem[] = [
  { columnId: "name" as ColumnId, hidden: false, hideDisabled: false, label: "Name" },
  { columnId: "email" as ColumnId, hidden: true, hideDisabled: false, label: "Email" },
  { columnId: "balance" as ColumnId, hidden: false, hideDisabled: false, label: "Balance" },
]

afterEach(() => cleanup())

function renderMenu(
  overrides: {
    items?: readonly ColumnVisibilityItem[]
    onClose?: () => void
    onToggle?: (columnId: ColumnId, hidden: boolean) => void
  } = {},
): Promise<HTMLElement> {
  render(
    <ColumnVisibilityMenu
      anchor={{ x: 240, y: 80 }}
      items={overrides.items ?? items}
      onClose={overrides.onClose ?? (() => {})}
      onToggle={overrides.onToggle ?? (() => {})}
    />,
  )
  return screen.findByRole("menu", { name: "Column visibility" })
}

describe("ColumnVisibilityMenu — Radix DropdownMenu contract", () => {
  test("renders open menu content with Radix state and positioning hooks", async () => {
    const menu = await renderMenu()

    expect(menu.classList.contains("bc-grid-column-menu")).toBe(true)
    expect(menu.getAttribute("data-state")).toBe("open")
    expect(menu.getAttribute("data-side")).toBe("bottom")
    expect(within(menu).getByText("Columns")).toBeDefined()
  })

  test("returns null markup when there are no items", () => {
    render(
      <ColumnVisibilityMenu
        anchor={{ x: 240, y: 80 }}
        items={[]}
        onClose={() => {}}
        onToggle={() => {}}
      />,
    )

    expect(screen.queryByRole("menu", { name: "Column visibility" })).toBeNull()
  })

  test("each item carries checked state and disabled state through Radix attributes", async () => {
    const menu = await renderMenu({
      items: [
        { columnId: "name" as ColumnId, hidden: false, hideDisabled: true, label: "Name" },
        { columnId: "email" as ColumnId, hidden: true, hideDisabled: false, label: "Email" },
      ],
    })

    const name = within(menu).getByRole("menuitemcheckbox", { name: "Hide Name" })
    const email = within(menu).getByRole("menuitemcheckbox", { name: "Show Email" })

    expect(name.getAttribute("aria-checked")).toBe("true")
    expect(name.getAttribute("data-state")).toBe("checked")
    expect(name.hasAttribute("data-disabled")).toBe(true)
    expect(email.getAttribute("aria-checked")).toBe("false")
    expect(email.getAttribute("data-state")).toBe("unchecked")
  })

  test("toggles hidden state without closing the dropdown", async () => {
    const toggles: Array<{ columnId: ColumnId; hidden: boolean }> = []
    const menu = await renderMenu({
      onToggle: (columnId, hidden) => toggles.push({ columnId, hidden }),
    })

    await act(async () => {
      fireEvent.click(within(menu).getByRole("menuitemcheckbox", { name: "Hide Name" }))
    })

    expect(toggles).toEqual([{ columnId: "name" as ColumnId, hidden: true }])
    expect(screen.getByRole("menu", { name: "Column visibility" })).toBeDefined()
  })

  test("Escape closes through onOpenChange", async () => {
    function Harness() {
      const [open, setOpen] = useState(true)
      return open ? (
        <ColumnVisibilityMenu
          anchor={{ x: 240, y: 80 }}
          items={items}
          onClose={() => setOpen(false)}
          onToggle={() => {}}
        />
      ) : null
    }

    render(<Harness />)
    expect(await screen.findByRole("menu", { name: "Column visibility" })).toBeDefined()

    await act(async () => {
      fireEvent.keyDown(document, { key: "Escape" })
    })

    expect(screen.queryByRole("menu", { name: "Column visibility" })).toBeNull()
  })
})
