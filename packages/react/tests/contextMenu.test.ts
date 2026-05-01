import { describe, expect, test } from "bun:test"
import type { BcColumnStateEntry, BcGridFilter, BcSelection } from "@bc-grid/core"
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

function apiWithFilter(filter: BcGridFilter | null): BcContextMenuContext<Row>["api"] {
  return {
    getRangeSelection: () => ({ ranges: [], anchor: null }),
    getFilter: () => filter,
  } as BcContextMenuContext<Row>["api"]
}

function apiWithColumnState(state: BcColumnStateEntry[]): BcContextMenuContext<Row>["api"] {
  return {
    getRangeSelection: () => ({ ranges: [], anchor: null }),
    getColumnState: () => state,
  } as BcContextMenuContext<Row>["api"]
}

const dummyColumn = { field: "name", header: "Name" } as BcReactGridColumn<Row>

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

describe("context menu — filter clear built-ins", () => {
  const nameFilter: BcGridFilter = {
    kind: "column",
    columnId: "name",
    type: "text",
    op: "contains",
    value: "John",
  }
  const compoundFilter: BcGridFilter = {
    kind: "group",
    op: "and",
    filters: [
      nameFilter,
      {
        kind: "column",
        columnId: "email",
        type: "text",
        op: "contains",
        value: "@acme",
      },
    ],
  }

  test("labels match the design doc strings", () => {
    expect(contextMenuItemLabel("clear-all-filters")).toBe("Clear All Filters")
    expect(contextMenuItemLabel("clear-column-filter")).toBe("Clear Filter")
  })

  test("contextMenuItemKey returns the built-in id for the new actions", () => {
    expect(contextMenuItemKey("clear-all-filters", 0)).toBe("clear-all-filters")
    expect(contextMenuItemKey("clear-column-filter", 1)).toBe("clear-column-filter")
  })

  test("clear-all-filters is disabled when no filter is active", () => {
    expect(
      contextMenuItemDisabled("clear-all-filters", makeContext({ api: apiWithFilter(null) })),
    ).toBe(true)
  })

  test("clear-all-filters is enabled when any filter is active", () => {
    expect(
      contextMenuItemDisabled("clear-all-filters", makeContext({ api: apiWithFilter(nameFilter) })),
    ).toBe(false)
    expect(
      contextMenuItemDisabled(
        "clear-all-filters",
        makeContext({ api: apiWithFilter(compoundFilter) }),
      ),
    ).toBe(false)
  })

  test("clear-column-filter is disabled when no cell context is available", () => {
    // Shift+F10 with no active cell: there's no column to target.
    expect(
      contextMenuItemDisabled(
        "clear-column-filter",
        makeContext({ api: apiWithFilter(nameFilter) }),
      ),
    ).toBe(true)
  })

  test("clear-column-filter is disabled when the cell's column has no filter entry", () => {
    expect(
      contextMenuItemDisabled(
        "clear-column-filter",
        makeContext({
          api: apiWithFilter(nameFilter),
          cell: { rowId: "r1", columnId: "email" },
        }),
      ),
    ).toBe(true)
  })

  test("clear-column-filter is enabled when the cell's column has a filter entry", () => {
    expect(
      contextMenuItemDisabled(
        "clear-column-filter",
        makeContext({
          api: apiWithFilter(nameFilter),
          cell: { rowId: "r1", columnId: "name" },
        }),
      ),
    ).toBe(false)
    expect(
      contextMenuItemDisabled(
        "clear-column-filter",
        makeContext({
          api: apiWithFilter(compoundFilter),
          cell: { rowId: "r1", columnId: "email" },
        }),
      ),
    ).toBe(false)
  })

  test("the new built-ins are NOT in DEFAULT_CONTEXT_MENU_ITEMS (consumer-opt-in only)", () => {
    // Per the v0.3 brief, default item set stays untouched — consumers
    // wire these IDs explicitly via the contextMenuItems prop.
    expect(DEFAULT_CONTEXT_MENU_ITEMS).not.toContain("clear-all-filters")
    expect(DEFAULT_CONTEXT_MENU_ITEMS).not.toContain("clear-column-filter")
  })

  test("resolveContextMenuItems accepts the new built-ins in a consumer-supplied list", () => {
    const items = resolveContextMenuItems<Row>(
      ["copy", "separator", "clear-column-filter", "clear-all-filters"],
      makeContext({ api: apiWithFilter(nameFilter) }),
    )
    expect(items).toEqual(["copy", "separator", "clear-column-filter", "clear-all-filters"])
  })
})

describe("context menu — column command built-ins", () => {
  function columnContext(
    state: BcColumnStateEntry[],
    cellColumnId = "name",
  ): BcContextMenuContext<Row> {
    return makeContext({
      api: apiWithColumnState(state),
      cell: { rowId: "r1", columnId: cellColumnId },
      column: dummyColumn,
    })
  }

  const baseState: BcColumnStateEntry[] = [
    { columnId: "name" },
    { columnId: "email" },
    { columnId: "balance" },
  ]

  test("labels match the design doc strings", () => {
    expect(contextMenuItemLabel("pin-column-left")).toBe("Pin Left")
    expect(contextMenuItemLabel("pin-column-right")).toBe("Pin Right")
    expect(contextMenuItemLabel("unpin-column")).toBe("Unpin")
    expect(contextMenuItemLabel("hide-column")).toBe("Hide Column")
    expect(contextMenuItemLabel("autosize-column")).toBe("Autosize Column")
  })

  test("contextMenuItemKey returns the built-in id for the new actions", () => {
    expect(contextMenuItemKey("pin-column-left", 0)).toBe("pin-column-left")
    expect(contextMenuItemKey("pin-column-right", 1)).toBe("pin-column-right")
    expect(contextMenuItemKey("unpin-column", 2)).toBe("unpin-column")
    expect(contextMenuItemKey("hide-column", 3)).toBe("hide-column")
    expect(contextMenuItemKey("autosize-column", 4)).toBe("autosize-column")
  })

  test("every column command is disabled when there's no column context", () => {
    // Shift+F10 with no active cell — `context.column` and `context.cell`
    // are both null, so column-targeted commands have nothing to act on.
    const ctx = makeContext({ api: apiWithColumnState(baseState) })
    expect(contextMenuItemDisabled("pin-column-left", ctx)).toBe(true)
    expect(contextMenuItemDisabled("pin-column-right", ctx)).toBe(true)
    expect(contextMenuItemDisabled("unpin-column", ctx)).toBe(true)
    expect(contextMenuItemDisabled("hide-column", ctx)).toBe(true)
    expect(contextMenuItemDisabled("autosize-column", ctx)).toBe(true)
  })

  test("pin-column-left disables when the column is already pinned left", () => {
    const ctx = columnContext([{ columnId: "name", pinned: "left" }, ...baseState.slice(1)])
    expect(contextMenuItemDisabled("pin-column-left", ctx)).toBe(true)
  })

  test("pin-column-left enables when unpinned or pinned to the other edge", () => {
    expect(contextMenuItemDisabled("pin-column-left", columnContext(baseState))).toBe(false)
    expect(
      contextMenuItemDisabled(
        "pin-column-left",
        columnContext([{ columnId: "name", pinned: "right" }, ...baseState.slice(1)]),
      ),
    ).toBe(false)
  })

  test("pin-column-right disables when already pinned right; enables otherwise", () => {
    expect(
      contextMenuItemDisabled(
        "pin-column-right",
        columnContext([{ columnId: "name", pinned: "right" }, ...baseState.slice(1)]),
      ),
    ).toBe(true)
    expect(contextMenuItemDisabled("pin-column-right", columnContext(baseState))).toBe(false)
  })

  test("unpin-column enables only when the column is currently pinned", () => {
    // Unpinned (no entry, or pinned: null/undefined) → disabled
    expect(contextMenuItemDisabled("unpin-column", columnContext(baseState))).toBe(true)
    expect(
      contextMenuItemDisabled(
        "unpin-column",
        columnContext([{ columnId: "name", pinned: null }, ...baseState.slice(1)]),
      ),
    ).toBe(true)
    // Pinned → enabled
    expect(
      contextMenuItemDisabled(
        "unpin-column",
        columnContext([{ columnId: "name", pinned: "left" }, ...baseState.slice(1)]),
      ),
    ).toBe(false)
    expect(
      contextMenuItemDisabled(
        "unpin-column",
        columnContext([{ columnId: "name", pinned: "right" }, ...baseState.slice(1)]),
      ),
    ).toBe(false)
  })

  test("hide-column disables when the targeted column is already hidden", () => {
    const ctx = columnContext([{ columnId: "name", hidden: true }, ...baseState.slice(1)])
    expect(contextMenuItemDisabled("hide-column", ctx)).toBe(true)
  })

  test("hide-column refuses to hide the last visible column (UX guard)", () => {
    // Two of three columns hidden. The targeted column is the only
    // remaining visible one — hiding it would leave the grid empty.
    const ctx = columnContext([
      { columnId: "name" },
      { columnId: "email", hidden: true },
      { columnId: "balance", hidden: true },
    ])
    expect(contextMenuItemDisabled("hide-column", ctx)).toBe(true)
  })

  test("hide-column enables when there are at least two visible columns", () => {
    expect(contextMenuItemDisabled("hide-column", columnContext(baseState))).toBe(false)
  })

  test("autosize-column disables when the targeted column is hidden", () => {
    const ctx = columnContext([{ columnId: "name", hidden: true }, ...baseState.slice(1)])
    expect(contextMenuItemDisabled("autosize-column", ctx)).toBe(true)
  })

  test("autosize-column enables for any visible column", () => {
    expect(contextMenuItemDisabled("autosize-column", columnContext(baseState))).toBe(false)
  })

  test("the column command built-ins are NOT in DEFAULT_CONTEXT_MENU_ITEMS (consumer-opt-in)", () => {
    // Per the v0.3 brief, default item set stays untouched — consumers
    // opt in via the contextMenuItems prop.
    expect(DEFAULT_CONTEXT_MENU_ITEMS).not.toContain("pin-column-left")
    expect(DEFAULT_CONTEXT_MENU_ITEMS).not.toContain("pin-column-right")
    expect(DEFAULT_CONTEXT_MENU_ITEMS).not.toContain("unpin-column")
    expect(DEFAULT_CONTEXT_MENU_ITEMS).not.toContain("hide-column")
    expect(DEFAULT_CONTEXT_MENU_ITEMS).not.toContain("autosize-column")
  })

  test("resolveContextMenuItems accepts the column commands in a consumer-supplied list", () => {
    const items = resolveContextMenuItems<Row>(
      [
        "pin-column-left",
        "pin-column-right",
        "unpin-column",
        "separator",
        "hide-column",
        "autosize-column",
      ],
      columnContext(baseState),
    )
    expect(items).toEqual([
      "pin-column-left",
      "pin-column-right",
      "unpin-column",
      "separator",
      "hide-column",
      "autosize-column",
    ])
  })
})
