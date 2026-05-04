import { afterEach, describe, expect, test } from "bun:test"
import type {
  BcGridApi,
  BcRange,
  BcRangeSelection,
  BcSelection,
  ColumnId,
  RowId,
} from "@bc-grid/core"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import type { ResolvedColumn, RowEntry } from "../../src/gridInternals"
import { BcGridContextMenu } from "../../src/internal/context-menu"
import { ContextMenu, ContextMenuTrigger } from "../../src/shadcn/context-menu"
import type { BcContextMenuContext, BcContextMenuItems } from "../../src/types"

interface Row {
  id: string
  name: string
}

const noopApi = {
  getRangeSelection: (): BcRangeSelection => ({ ranges: [], anchor: null }),
  getFilter: () => null,
  getColumnState: () => [],
} as unknown as BcGridApi<Row>

function makeApiWithColumnState(
  state: ReadonlyArray<{
    columnId: string
    pinned?: "left" | "right" | null
    hidden?: boolean
  }>,
): BcGridApi<Row> {
  return {
    getRangeSelection: (): BcRangeSelection => ({ ranges: [], anchor: null }),
    getFilter: () => null,
    getColumnState: () => state,
  } as unknown as BcGridApi<Row>
}

const resolvedColumns: readonly ResolvedColumn<Row>[] = [
  {
    align: "left",
    columnId: "name",
    left: 0,
    pinned: null,
    position: 0,
    source: { columnId: "name", field: "name", header: "Name" },
    width: 160,
  },
]

const rowsById: ReadonlyMap<RowId, RowEntry<Row>> = new Map([
  ["r1", { kind: "data", index: 0, level: 0, row: { id: "r1", name: "Acme" }, rowId: "r1" }],
])

const emptySelection: BcSelection = { mode: "explicit", rowIds: new Set() }

afterEach(() => cleanup())

function renderMenu(
  items?: BcContextMenuItems<Row>,
  api: BcGridApi<Row> = noopApi,
): {
  openMenu: () => Promise<HTMLElement>
} {
  render(
    <ContextMenu>
      <ContextMenuTrigger data-testid="context-menu-trigger">Open</ContextMenuTrigger>
      <BcGridContextMenu<Row>
        api={api}
        anchor={{ x: 100, y: 80 }}
        columnId={"name" as ColumnId}
        contextMenuItems={items}
        copyRangeToClipboard={async (_range: BcRange | undefined) => {}}
        clearSelection={() => {}}
        onClose={() => {}}
        resolvedColumns={resolvedColumns}
        rowId={"r1" as RowId}
        rowsById={rowsById}
        selection={emptySelection}
      />
    </ContextMenu>,
  )

  return {
    openMenu: async () => {
      await act(async () => {
        fireEvent.contextMenu(screen.getByTestId("context-menu-trigger"), {
          clientX: 100,
          clientY: 80,
        })
      })
      return screen.findByRole("menu", { name: "Context menu" })
    },
  }
}

describe("BcGridContextMenu — Radix DOM contract", () => {
  test("passes row identity and index through the trigger context", () => {
    let seen: Pick<BcContextMenuContext<Row>, "row" | "rowId" | "rowIndex"> | null = null
    renderMenu((ctx) => {
      seen = { row: ctx.row, rowId: ctx.rowId, rowIndex: ctx.rowIndex }
      return []
    })

    expect(seen).toEqual({
      row: { id: "r1", name: "Acme" },
      rowId: "r1",
      rowIndex: 0,
    })
  })

  test("opens through a Radix ContextMenu trigger with menu role and state hooks", async () => {
    const { openMenu } = renderMenu(["copy", "copy-with-headers", "separator", "clear-range"])
    const menu = await openMenu()

    expect(menu.classList.contains("bc-grid-context-menu")).toBe(true)
    expect(menu.getAttribute("data-state")).toBe("open")
    expect(within(menu).getByRole("menuitem", { name: "Copy" })).toBeDefined()
    expect(within(menu).getByRole("separator")).toHaveProperty("tagName", "DIV")
  })

  test("selecting an item closes through the Radix menu lifecycle", async () => {
    let selected = false
    const { openMenu } = renderMenu([
      {
        id: "open",
        label: "Open row",
        onSelect: () => {
          selected = true
        },
      },
    ])
    const menu = await openMenu()

    await act(async () => {
      fireEvent.click(within(menu).getByRole("menuitem", { name: "Open row" }))
    })

    expect(selected).toBe(true)
    expect(screen.queryByRole("menu", { name: "Context menu" })).toBeNull()
  })
})

describe("BcGridContextMenu — destructive variant", () => {
  test("custom item with variant='destructive' emits data-variant on the row", async () => {
    const { openMenu } = renderMenu([
      {
        id: "delete",
        label: "Delete row",
        onSelect: () => {},
        variant: "destructive",
      },
    ])
    const menu = await openMenu()
    const item = within(menu).getByRole("menuitem", { name: "Delete row" })

    expect(item.getAttribute("data-variant")).toBe("destructive")
  })

  test("custom item without a destructive variant omits data-variant", async () => {
    const { openMenu } = renderMenu([
      {
        id: "open",
        label: "Open row",
        onSelect: () => {},
        variant: "default",
      },
    ])
    const menu = await openMenu()
    const item = within(menu).getByRole("menuitem", { name: "Open row" })

    expect(item.hasAttribute("data-variant")).toBe(false)
  })
})

describe("BcGridContextMenu — toggle and submenu markup", () => {
  test("renders toggle items as checkbox menuitems with checked state hooks", async () => {
    const { openMenu } = renderMenu([
      {
        kind: "toggle",
        id: "show-filter-row",
        label: "Show filter row",
        checked: true,
        onToggle: () => {},
      },
    ])
    const menu = await openMenu()
    const item = within(menu).getByRole("menuitemcheckbox", { name: "Show filter row" })

    expect(item.getAttribute("aria-checked")).toBe("true")
    expect(item.getAttribute("data-state")).toBe("checked")
  })

  test("renders radio-style toggle items as radio menuitems", async () => {
    const { openMenu } = renderMenu([
      {
        kind: "toggle",
        selection: "radio",
        id: "density-normal",
        label: "Normal",
        checked: true,
        onToggle: () => {},
      },
    ])
    const menu = await openMenu()
    const item = within(menu).getByRole("menuitemradio", { name: "Normal" })

    expect(item.getAttribute("aria-checked")).toBe("true")
  })

  test("renders submenu triggers with Radix menu popup semantics", async () => {
    const { openMenu } = renderMenu([
      {
        kind: "submenu",
        id: "view",
        label: "View",
        items: [
          {
            kind: "toggle",
            id: "show-sidebar",
            label: "Show sidebar",
            checked: false,
            onToggle: () => {},
          },
        ],
      },
    ])
    const menu = await openMenu()
    const item = within(menu).getByRole("menuitem", { name: "View" })

    expect(item.classList.contains("bc-grid-context-menu-item")).toBe(true)
    expect(item.getAttribute("aria-haspopup")).toBe("menu")
  })
})

describe("BcGridContextMenu — column command rendering", () => {
  const columnCommands = [
    "pin-column-left",
    "pin-column-right",
    "unpin-column",
    "hide-column",
    "autosize-column",
  ] as const

  test("renders every single-column command label with leading icons", async () => {
    const { openMenu } = renderMenu(
      [...columnCommands],
      makeApiWithColumnState([{ columnId: "name", pinned: "left" }, { columnId: "email" }]),
    )
    const menu = await openMenu()

    for (const label of ["Pin Left", "Pin Right", "Unpin", "Hide Column", "Autosize Column"]) {
      expect(within(menu).getByRole("menuitem", { name: label })).toBeDefined()
    }
    expect(menu.querySelectorAll(".bc-grid-context-menu-icon-svg").length).toBe(
      columnCommands.length,
    )
  })

  test("aria-disabled toggles per the column-context predicate", async () => {
    const { openMenu } = renderMenu(
      [...columnCommands],
      makeApiWithColumnState([{ columnId: "name", pinned: "left" }]),
    )
    const menu = await openMenu()

    expect(
      within(menu).getByRole("menuitem", { name: "Pin Left" }).getAttribute("aria-disabled"),
    ).toBe("true")
    expect(
      within(menu).getByRole("menuitem", { name: "Pin Right" }).hasAttribute("aria-disabled"),
    ).toBe(false)
    expect(
      within(menu).getByRole("menuitem", { name: "Unpin" }).hasAttribute("aria-disabled"),
    ).toBe(false)
  })

  test("hide-column disables when it would hide the last visible column", async () => {
    const { openMenu } = renderMenu(["hide-column"], makeApiWithColumnState([{ columnId: "name" }]))
    const menu = await openMenu()

    expect(
      within(menu).getByRole("menuitem", { name: "Hide Column" }).getAttribute("aria-disabled"),
    ).toBe("true")
  })

  test("autosize-column disables when the targeted column is hidden", async () => {
    const { openMenu } = renderMenu(
      ["autosize-column"],
      makeApiWithColumnState([{ columnId: "name", hidden: true }, { columnId: "email" }]),
    )
    const menu = await openMenu()

    expect(
      within(menu).getByRole("menuitem", { name: "Autosize Column" }).getAttribute("aria-disabled"),
    ).toBe("true")
  })
})
