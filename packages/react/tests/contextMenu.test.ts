import { describe, expect, test } from "bun:test"
import type { BcSelection } from "@bc-grid/core"
import {
  DEFAULT_CONTEXT_MENU_ITEMS,
  contextMenuItemDisabled,
  contextMenuItemLabel,
  resolveContextMenuItems,
} from "../src/contextMenu"
import type { BcContextMenuContext, BcContextMenuItem, BcReactGridColumn } from "../src/types"

interface Row {
  id: string
  name: string
}

const emptySelection: BcSelection = { mode: "explicit", rowIds: new Set() }

function makeContext(
  overrides: Partial<BcContextMenuContext<Row>> = {},
): BcContextMenuContext<Row> {
  return {
    api: {
      getRangeSelection: () => ({ ranges: [], anchor: null }),
    } as BcContextMenuContext<Row>["api"],
    cell: null,
    column: null,
    row: null,
    selection: emptySelection,
    ...overrides,
  }
}

describe("context menu items", () => {
  test("uses the minimal built-in actions by default", () => {
    expect(resolveContextMenuItems(undefined, makeContext())).toEqual(DEFAULT_CONTEXT_MENU_ITEMS)
    expect(DEFAULT_CONTEXT_MENU_ITEMS.filter((item) => item !== "separator")).toEqual([
      "copy",
      "copy-with-headers",
      "clear-selection",
      "clear-range",
    ])
  })

  test("evaluates a custom item factory against the trigger context", () => {
    const items = resolveContextMenuItems<Row>(
      (context) =>
        context.row
          ? [
              "copy",
              {
                id: "view-customer",
                label: `View ${context.row.name}`,
                onSelect: () => {},
              },
            ]
          : [],
      makeContext({ row: { id: "r1", name: "Acme" } }),
    )

    expect(items.map((item) => (typeof item === "string" ? item : item.id))).toEqual([
      "copy",
      "view-customer",
    ])
  })

  test("reports built-in labels and disabled state", () => {
    const context = makeContext({
      cell: { rowId: "r1", columnId: "name" },
      column: { field: "name", header: "Name" } as BcReactGridColumn<Row>,
      row: { id: "r1", name: "Acme" },
    })

    expect(contextMenuItemLabel("copy-with-headers")).toBe("Copy with Headers")
    expect(contextMenuItemLabel("clear-selection")).toBe("Clear Selection")
    expect(contextMenuItemLabel("clear-range")).toBe("Clear Range")
    expect(contextMenuItemDisabled("copy", context)).toBe(false)
    expect(contextMenuItemDisabled("copy", makeContext())).toBe(true)
    expect(contextMenuItemDisabled("clear-selection", context)).toBe(true)
    expect(contextMenuItemDisabled("clear-range", context)).toBe(true)
    expect(
      contextMenuItemDisabled(
        "clear-selection",
        makeContext({ selection: { mode: "explicit", rowIds: new Set(["r1"]) } }),
      ),
    ).toBe(false)
    expect(
      contextMenuItemDisabled(
        "clear-range",
        makeContext({
          api: {
            getRangeSelection: () => ({
              ranges: [
                {
                  start: { rowId: "r1", columnId: "name" },
                  end: { rowId: "r2", columnId: "name" },
                },
              ],
              anchor: { rowId: "r1", columnId: "name" },
            }),
          } as BcContextMenuContext<Row>["api"],
        }),
      ),
    ).toBe(false)
  })

  test("supports custom disabled predicates", () => {
    const item = {
      id: "delete",
      label: "Delete",
      onSelect: () => {},
      disabled: (context) => context.row?.id === "locked",
    } satisfies BcContextMenuItem<Row>

    expect(
      contextMenuItemDisabled(item, makeContext({ row: { id: "locked", name: "Acme" } })),
    ).toBe(true)
    expect(contextMenuItemDisabled(item, makeContext({ row: { id: "open", name: "Acme" } }))).toBe(
      false,
    )
  })
})
