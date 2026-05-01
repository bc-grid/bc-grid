import { describe, expect, test } from "bun:test"
import type { BcSelection } from "@bc-grid/core"
import {
  DEFAULT_CONTEXT_MENU_ITEMS,
  contextMenuItemDisabled,
  contextMenuItemKey,
  contextMenuItemLabel,
  isContextMenuSeparator,
  isCustomContextMenuItem,
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

describe("context menu — separators and shape predicates", () => {
  test("isContextMenuSeparator narrows on the literal 'separator'", () => {
    expect(isContextMenuSeparator("separator")).toBe(true)
    expect(isContextMenuSeparator("copy")).toBe(false)
    expect(isContextMenuSeparator("clear-range")).toBe(false)
    expect(isContextMenuSeparator({ id: "x", label: "X", onSelect: () => {} })).toBe(false)
  })

  test("isCustomContextMenuItem narrows on the object shape", () => {
    expect(isCustomContextMenuItem("separator")).toBe(false)
    expect(isCustomContextMenuItem("copy")).toBe(false)
    expect(isCustomContextMenuItem("clear-selection")).toBe(false)
    expect(isCustomContextMenuItem({ id: "x", label: "X", onSelect: () => {} })).toBe(true)
  })

  test("contextMenuItemDisabled treats every separator as disabled regardless of context", () => {
    expect(contextMenuItemDisabled("separator", makeContext())).toBe(true)
    // Even with an active range + selection a separator stays disabled —
    // the renderer uses the disabled flag to skip keyboard navigation
    // onto the separator row.
    expect(
      contextMenuItemDisabled(
        "separator",
        makeContext({
          selection: { mode: "explicit", rowIds: new Set(["r1"]) },
          api: {
            getRangeSelection: () => ({
              ranges: [
                {
                  start: { rowId: "r1", columnId: "name" },
                  end: { rowId: "r1", columnId: "name" },
                },
              ],
              anchor: { rowId: "r1", columnId: "name" },
            }),
          } as BcContextMenuContext<Row>["api"],
        }),
      ),
    ).toBe(true)
  })

  test("contextMenuItemLabel returns an empty string for separators", () => {
    // The renderer reads label === '' as 'no visible text', distinct
    // from a built-in's actual label like 'Copy'.
    expect(contextMenuItemLabel("separator")).toBe("")
  })

  test("contextMenuItemLabel returns the label for built-ins and custom items", () => {
    expect(contextMenuItemLabel("copy")).toBe("Copy")
    expect(contextMenuItemLabel({ id: "view", label: "View customer", onSelect: () => {} })).toBe(
      "View customer",
    )
  })
})

describe("context menu — key uniqueness", () => {
  test("contextMenuItemKey returns the built-in id for built-ins", () => {
    expect(contextMenuItemKey("copy", 0)).toBe("copy")
    expect(contextMenuItemKey("copy-with-headers", 1)).toBe("copy-with-headers")
    expect(contextMenuItemKey("clear-selection", 2)).toBe("clear-selection")
    expect(contextMenuItemKey("clear-range", 3)).toBe("clear-range")
  })

  test("contextMenuItemKey returns the custom id for custom items, regardless of array index", () => {
    const item: BcContextMenuItem<Row> = { id: "view", label: "View", onSelect: () => {} }
    expect(contextMenuItemKey(item, 0)).toBe("view")
    expect(contextMenuItemKey(item, 7)).toBe("view")
  })

  test("contextMenuItemKey distinguishes consecutive separators by index", () => {
    // Two separators in the same menu would collide on the bare 'separator'
    // string; the helper appends the index so React keys stay unique.
    const k1 = contextMenuItemKey("separator", 2)
    const k2 = contextMenuItemKey("separator", 5)
    expect(k1).not.toBe(k2)
    expect(k1).toBe("separator-2")
    expect(k2).toBe("separator-5")
  })

  test("every default item produces a unique key when fed through contextMenuItemKey", () => {
    const keys = DEFAULT_CONTEXT_MENU_ITEMS.map((item, index) => contextMenuItemKey(item, index))
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe("context menu — resolver edge cases", () => {
  test("resolveContextMenuItems drops null / false / undefined entries from a static array", () => {
    const items = resolveContextMenuItems<Row>(
      ["copy", false, null, undefined, { id: "view", label: "View", onSelect: () => {} }],
      makeContext(),
    )
    const ids = items.map((item) => (typeof item === "string" ? item : item.id))
    expect(ids).toEqual(["copy", "view"])
  })

  test("resolveContextMenuItems drops null / false / undefined entries from a factory result", () => {
    const items = resolveContextMenuItems<Row>(
      () => ["copy", false as const, null, undefined, "clear-range"],
      makeContext(),
    )
    expect(items).toEqual(["copy", "clear-range"])
  })

  test("resolveContextMenuItems returns [] when the factory wants to suppress the menu entirely", () => {
    expect(resolveContextMenuItems<Row>(() => [], makeContext())).toEqual([])
  })

  test("resolveContextMenuItems returns [] when an explicit empty array is supplied (consumer override)", () => {
    // Distinct from passing `undefined`, which falls back to defaults.
    // An empty array is a deliberate 'show nothing' signal.
    expect(resolveContextMenuItems<Row>([], makeContext())).toEqual([])
  })
})
