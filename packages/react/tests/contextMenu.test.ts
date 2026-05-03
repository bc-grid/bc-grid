import { describe, expect, test } from "bun:test"
import type { BcColumnStateEntry, BcGridFilter, BcSelection } from "@bc-grid/core"
import {
  DEFAULT_CONTEXT_MENU_ITEMS,
  contextMenuItemChecked,
  contextMenuItemDisabled,
  contextMenuItemKey,
  contextMenuItemLabel,
  isContextMenuSeparator,
  isContextMenuSubmenuItem,
  isContextMenuToggleItem,
  isCustomContextMenuItem,
  resolveContextMenuItems,
  resolveContextMenuSubmenuItems,
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
  const context = {
    api: {
      getRangeSelection: () => ({ ranges: [], anchor: null }),
    } as BcContextMenuContext<Row>["api"],
    cell: null,
    column: null,
    row: null,
    selection: emptySelection,
    ...overrides,
  }
  return {
    ...context,
    columnId: context.columnId ?? context.cell?.columnId,
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
  test("uses the v0.3 default built-in actions when no consumer items are supplied", () => {
    expect(resolveContextMenuItems(undefined, makeContext())).toEqual(DEFAULT_CONTEXT_MENU_ITEMS)
    // Built-in clipboard / range actions stay flat at the top of the
    // menu. The Server submenu (added in v0.5 default-context-menu
    // wiring) appears below them; its `items` builder returns `[]` for
    // non-server grids so the submenu collapses harmlessly there.
    const builtInTokens = DEFAULT_CONTEXT_MENU_ITEMS.filter(
      (item): item is string => typeof item === "string" && item !== "separator",
    )
    expect(builtInTokens).toEqual([
      "copy",
      "copy-row",
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
    expect(
      isCustomContextMenuItem({
        kind: "toggle",
        id: "show-filter-row",
        label: "Show filter row",
        checked: true,
        onToggle: () => {},
      }),
    ).toBe(false)
    expect(
      isCustomContextMenuItem({
        kind: "submenu",
        id: "view",
        label: "View",
        items: [],
      }),
    ).toBe(false)
  })

  test("toggle and submenu predicates narrow the new object item shapes", () => {
    const toggle: BcContextMenuItem<Row> = {
      kind: "toggle",
      id: "show-sidebar",
      label: "Show sidebar",
      checked: (context) => context.row?.id === "open",
      onToggle: () => {},
    }
    const submenu: BcContextMenuItem<Row> = {
      kind: "submenu",
      id: "view",
      label: "View",
      items: ["copy", false, null, undefined, "clear-range"],
    }

    expect(isContextMenuToggleItem(toggle)).toBe(true)
    expect(isContextMenuSubmenuItem(toggle)).toBe(false)
    expect(contextMenuItemChecked(toggle, makeContext({ row: { id: "open", name: "Acme" } }))).toBe(
      true,
    )
    expect(
      contextMenuItemChecked(toggle, makeContext({ row: { id: "closed", name: "Acme" } })),
    ).toBe(false)

    expect(isContextMenuSubmenuItem(submenu)).toBe(true)
    expect(isContextMenuToggleItem(submenu)).toBe(false)
    expect(resolveContextMenuSubmenuItems(submenu, makeContext())).toEqual(["copy", "clear-range"])
  })

  test("empty submenus are disabled so the renderer skips dead branches", () => {
    const submenu: BcContextMenuItem<Row> = {
      kind: "submenu",
      id: "empty",
      label: "Empty",
      items: () => [false, null, undefined],
    }

    expect(contextMenuItemDisabled(submenu, makeContext())).toBe(true)
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

  test("clear-column-filter is disabled when no column context is available", () => {
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

  test("clear-column-filter is enabled with a column-only header context", () => {
    expect(
      contextMenuItemDisabled(
        "clear-column-filter",
        makeContext({
          api: apiWithFilter(nameFilter),
          columnId: "name",
          column: dummyColumn,
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

  test("column commands enable with a column-only header context", () => {
    const ctx = makeContext({
      api: apiWithColumnState(baseState),
      columnId: "name",
      column: dummyColumn,
    })
    expect(contextMenuItemDisabled("pin-column-left", ctx)).toBe(false)
    expect(contextMenuItemDisabled("pin-column-right", ctx)).toBe(false)
    expect(contextMenuItemDisabled("autosize-column", ctx)).toBe(false)
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

describe("context menu — clipboard built-ins", () => {
  // The v0.3 menu surface promotes `copy-row` to default and adds the
  // explicit `copy-cell` variant (alongside the existing implicit
  // `copy` that adapts to range/cell). Pin the labels, key uniqueness,
  // and the disabled-state predicate matrix so the renderer's dispatch
  // contract stays stable.
  test("labels for the new clipboard items match the v0.3 strings", () => {
    expect(contextMenuItemLabel("copy-cell")).toBe("Copy Cell")
    expect(contextMenuItemLabel("copy-row")).toBe("Copy Row")
  })

  test("contextMenuItemKey returns the built-in id for the new clipboard items", () => {
    expect(contextMenuItemKey("copy-cell", 0)).toBe("copy-cell")
    expect(contextMenuItemKey("copy-row", 0)).toBe("copy-row")
  })

  test("copy-cell is disabled when the trigger has no cell context", () => {
    expect(contextMenuItemDisabled("copy-cell", makeContext())).toBe(true)
  })

  test("copy-cell is enabled when the right-click landed on a data cell", () => {
    expect(
      contextMenuItemDisabled(
        "copy-cell",
        makeContext({
          cell: { rowId: "r1", columnId: "name" },
          row: { id: "r1", name: "Acme" },
        }),
      ),
    ).toBe(false)
  })

  test("copy-cell ignores an active range — only the cell context matters", () => {
    // The existing implicit `copy` adapts to range; the explicit
    // `copy-cell` is single-cell-only by design. With a range but no
    // cell context, copy-cell stays disabled.
    const apiWithRange = {
      getRangeSelection: () => ({
        ranges: [
          { start: { rowId: "r1", columnId: "name" }, end: { rowId: "r2", columnId: "id" } },
        ],
        anchor: { rowId: "r1", columnId: "name" },
      }),
    } as unknown as BcContextMenuContext<Row>["api"]
    expect(contextMenuItemDisabled("copy-cell", makeContext({ api: apiWithRange }))).toBe(true)
  })

  test("copy-row is disabled when neither cell nor row context exists", () => {
    expect(contextMenuItemDisabled("copy-row", makeContext())).toBe(true)
  })

  test("copy-row is enabled when the right-click landed on a data row", () => {
    expect(
      contextMenuItemDisabled(
        "copy-row",
        makeContext({
          cell: { rowId: "r1", columnId: "name" },
          row: { id: "r1", name: "Acme" },
        }),
      ),
    ).toBe(false)
  })

  test("copy-row stays enabled when row context exists without an explicit cell", () => {
    // Some consumer-driven flows (Shift+F10 with no active cell but a
    // selected row) supply `row` without `cell`. copy-row should still
    // be a valid action.
    expect(
      contextMenuItemDisabled("copy-row", makeContext({ row: { id: "r1", name: "Acme" } })),
    ).toBe(false)
  })

  test("copy and copy-with-headers stay adaptive (cell or range)", () => {
    // Sanity check the existing adaptive behaviour didn't regress when
    // we added the explicit copy-cell / copy-row siblings.
    const noContext = makeContext()
    expect(contextMenuItemDisabled("copy", noContext)).toBe(true)
    expect(contextMenuItemDisabled("copy-with-headers", noContext)).toBe(true)

    const withCell = makeContext({
      cell: { rowId: "r1", columnId: "name" },
      row: { id: "r1", name: "Acme" },
    })
    expect(contextMenuItemDisabled("copy", withCell)).toBe(false)
    expect(contextMenuItemDisabled("copy-with-headers", withCell)).toBe(false)
  })

  test("the new clipboard items appear in DEFAULT_CONTEXT_MENU_ITEMS for out-of-the-box use", () => {
    // Per the brief: "It should expose expected grid commands without
    // bsncraft needing custom wiring for basics." copy-row is one of
    // those; copy-cell stays opt-in (most users want the implicit
    // `copy` that also handles ranges).
    expect(DEFAULT_CONTEXT_MENU_ITEMS).toContain("copy-row")
    expect(DEFAULT_CONTEXT_MENU_ITEMS).not.toContain("copy-cell")
  })
})

describe("context menu — bulk column built-ins", () => {
  // show-all-columns and autosize-all-columns are grid-state-driven
  // (they don't need a column context) and ship as opt-in extras
  // alongside the existing per-column command set.
  const visibleState: BcColumnStateEntry[] = [
    { columnId: "name" },
    { columnId: "amount" },
    { columnId: "status" },
  ]
  const partlyHiddenState: BcColumnStateEntry[] = [
    { columnId: "name" },
    { columnId: "amount", hidden: true },
    { columnId: "status" },
  ]
  const allHiddenState: BcColumnStateEntry[] = [
    { columnId: "name", hidden: true },
    { columnId: "amount", hidden: true },
  ]

  test("labels for the bulk column items match the v0.3 strings", () => {
    expect(contextMenuItemLabel("show-all-columns")).toBe("Show All Columns")
    expect(contextMenuItemLabel("autosize-all-columns")).toBe("Autosize All Columns")
  })

  test("contextMenuItemKey returns the built-in id for the bulk items", () => {
    expect(contextMenuItemKey("show-all-columns", 0)).toBe("show-all-columns")
    expect(contextMenuItemKey("autosize-all-columns", 0)).toBe("autosize-all-columns")
  })

  test("show-all-columns is disabled when every column is already visible", () => {
    expect(
      contextMenuItemDisabled(
        "show-all-columns",
        makeContext({ api: apiWithColumnState(visibleState) }),
      ),
    ).toBe(true)
  })

  test("show-all-columns is enabled when at least one column is hidden", () => {
    expect(
      contextMenuItemDisabled(
        "show-all-columns",
        makeContext({ api: apiWithColumnState(partlyHiddenState) }),
      ),
    ).toBe(false)
  })

  test("autosize-all-columns is disabled when every column is hidden (nothing to measure)", () => {
    expect(
      contextMenuItemDisabled(
        "autosize-all-columns",
        makeContext({ api: apiWithColumnState(allHiddenState) }),
      ),
    ).toBe(true)
  })

  test("autosize-all-columns is enabled whenever at least one column is visible", () => {
    expect(
      contextMenuItemDisabled(
        "autosize-all-columns",
        makeContext({ api: apiWithColumnState(visibleState) }),
      ),
    ).toBe(false)
    expect(
      contextMenuItemDisabled(
        "autosize-all-columns",
        makeContext({ api: apiWithColumnState(partlyHiddenState) }),
      ),
    ).toBe(false)
  })

  test("bulk column items are NOT in DEFAULT_CONTEXT_MENU_ITEMS (opt-in)", () => {
    expect(DEFAULT_CONTEXT_MENU_ITEMS).not.toContain("show-all-columns")
    expect(DEFAULT_CONTEXT_MENU_ITEMS).not.toContain("autosize-all-columns")
  })

  test("resolveContextMenuItems accepts the bulk column items in a consumer-supplied list", () => {
    const items = resolveContextMenuItems<Row>(
      ["hide-column", "show-all-columns", "separator", "autosize-column", "autosize-all-columns"],
      makeContext({ api: apiWithColumnState(partlyHiddenState) }),
    )
    expect(items).toEqual([
      "hide-column",
      "show-all-columns",
      "separator",
      "autosize-column",
      "autosize-all-columns",
    ])
  })
})

describe("context menu — destructive variant on custom items", () => {
  // Visual polish slice opt-in. Custom items can carry
  // `variant: "destructive"` so the renderer surfaces shadcn's
  // destructive treatment via `data-variant`. The unit-level
  // assertions here pin the type + resolver behaviour; the markup
  // emission is exercised in `contextMenu.markup.test.tsx`.
  test("custom items accept variant='destructive' as a typed field", () => {
    const item = {
      id: "delete",
      label: "Delete row",
      onSelect: () => {},
      variant: "destructive" as const,
    } satisfies BcContextMenuItem<Row>

    expect(item.variant).toBe("destructive")
    expect(contextMenuItemLabel(item)).toBe("Delete row")
    expect(contextMenuItemDisabled(item, makeContext())).toBe(false)
  })

  test("custom items accept variant='default' as a no-op", () => {
    // Allow the literal `"default"` so callers can write
    // `variant: condition ? "destructive" : "default"` ergonomically.
    const item = {
      id: "open",
      label: "Open row",
      onSelect: () => {},
      variant: "default" as const,
    } satisfies BcContextMenuItem<Row>

    expect(item.variant).toBe("default")
    expect(contextMenuItemLabel(item)).toBe("Open row")
  })

  test("variant is independent of disabled — the two predicates compose", () => {
    // A destructive item can also be disabled (e.g., "Delete row" when
    // the row is locked). Pin that the disabled predicate runs against
    // the regular `disabled` field and ignores `variant`.
    const item = {
      id: "delete",
      label: "Delete row",
      onSelect: () => {},
      variant: "destructive" as const,
      disabled: true,
    } satisfies BcContextMenuItem<Row>

    expect(contextMenuItemDisabled(item, makeContext())).toBe(true)
  })
})

// `BcServerGridApi` is recognised at runtime by the presence of
// `getActiveRowModelMode`. The default Server submenu's `items` builder
// returns `[]` for non-server grids (the submenu collapses to "disabled"
// per the existing predicate at `contextMenuItemDisabled`) and a mode-
// gated item list otherwise.
function makeServerApi(input: {
  mode: "paged" | "infinite" | "tree"
  visiblePagination?: boolean
  expandAll?: () => void
  collapseAll?: () => void
  setVisible?: (key: string, value: boolean) => void
}): BcContextMenuContext<Row>["api"] {
  return {
    getRangeSelection: () => ({ ranges: [], anchor: null }),
    getActiveRowModelMode: () => input.mode,
    expandAll: input.expandAll ?? (() => {}),
    collapseAll: input.collapseAll ?? (() => {}),
    getVisibleSetting: (key: string) =>
      key === "pagination" ? input.visiblePagination : undefined,
    setVisibleSetting: input.setVisible ?? (() => {}),
  } as unknown as BcContextMenuContext<Row>["api"]
}

function findServerSubmenu(
  items: readonly BcContextMenuItem<Row>[],
): import("../src/types").BcContextMenuSubmenuItem<Row> {
  const submenu = items.find(
    (item): item is import("../src/types").BcContextMenuSubmenuItem<Row> =>
      typeof item === "object" &&
      item !== null &&
      "kind" in item &&
      item.kind === "submenu" &&
      item.id === "server",
  )
  if (!submenu) throw new Error("server submenu not found in DEFAULT_CONTEXT_MENU_ITEMS")
  return submenu
}

describe("DEFAULT_CONTEXT_MENU_ITEMS server submenu", () => {
  test("the Server submenu is present in the default item list", () => {
    const submenu = findServerSubmenu(resolveContextMenuItems(undefined, makeContext()))
    expect(submenu.id).toBe("server")
    expect(submenu.label).toBe("Server")
  })

  test("the submenu is disabled (empty items) when the api is a non-server BcGridApi", () => {
    const ctx = makeContext()
    const submenu = findServerSubmenu(resolveContextMenuItems(undefined, ctx))
    expect(resolveContextMenuSubmenuItems(submenu, ctx)).toEqual([])
    // The shared disabled-predicate flips the submenu off when its
    // resolved items list is empty.
    expect(contextMenuItemDisabled(submenu, ctx)).toBe(true)
  })

  test("paged mode surfaces only the Show pagination toggle", () => {
    const ctx = makeContext({ api: makeServerApi({ mode: "paged", visiblePagination: true }) })
    const items = resolveContextMenuSubmenuItems(
      findServerSubmenu(resolveContextMenuItems(undefined, ctx)),
      ctx,
    )
    expect(items).toHaveLength(1)
    const [toggle] = items
    if (!toggle || !isContextMenuToggleItem(toggle)) {
      throw new Error("expected a toggle item")
    }
    expect(toggle.id).toBe("server-show-pagination")
    expect(toggle.label).toBe("Show pagination")
    expect(contextMenuItemChecked(toggle, ctx)).toBe(true)
  })

  test("paged Show pagination toggle reflects undefined visibility as ON (default true)", () => {
    const ctx = makeContext({ api: makeServerApi({ mode: "paged" }) })
    const items = resolveContextMenuSubmenuItems(
      findServerSubmenu(resolveContextMenuItems(undefined, ctx)),
      ctx,
    )
    const [toggle] = items
    if (!toggle || !isContextMenuToggleItem(toggle)) throw new Error("expected toggle")
    // `getVisibleSetting("pagination")` returns undefined → contract is
    // "pagination chrome is visible by default" → checked === true.
    expect(contextMenuItemChecked(toggle, ctx)).toBe(true)
  })

  test("paged Show pagination toggle reflects explicit false as OFF", () => {
    const ctx = makeContext({
      api: makeServerApi({ mode: "paged", visiblePagination: false }),
    })
    const items = resolveContextMenuSubmenuItems(
      findServerSubmenu(resolveContextMenuItems(undefined, ctx)),
      ctx,
    )
    const [toggle] = items
    if (!toggle || !isContextMenuToggleItem(toggle)) throw new Error("expected toggle")
    expect(contextMenuItemChecked(toggle, ctx)).toBe(false)
  })

  test("paged Show pagination toggle writes through setVisibleSetting", () => {
    const writes: Array<[string, boolean]> = []
    const ctx = makeContext({
      api: makeServerApi({
        mode: "paged",
        setVisible: (key, value) => writes.push([key, value]),
      }),
    })
    const items = resolveContextMenuSubmenuItems(
      findServerSubmenu(resolveContextMenuItems(undefined, ctx)),
      ctx,
    )
    const [toggle] = items
    if (!toggle || !isContextMenuToggleItem(toggle)) throw new Error("expected toggle")
    toggle.onToggle(ctx, false)
    expect(writes).toEqual([["pagination", false]])
  })

  test("tree mode surfaces Expand all groups + Collapse all groups", () => {
    const ctx = makeContext({ api: makeServerApi({ mode: "tree" }) })
    const items = resolveContextMenuSubmenuItems(
      findServerSubmenu(resolveContextMenuItems(undefined, ctx)),
      ctx,
    )
    expect(
      items.map((item) => (typeof item === "object" && "id" in item ? item.id : item)),
    ).toEqual(["server-expand-all", "server-collapse-all"])
  })

  test("tree Expand all delegates to api.expandAll()", () => {
    let expandCalls = 0
    const ctx = makeContext({
      api: makeServerApi({ mode: "tree", expandAll: () => expandCalls++ }),
    })
    const items = resolveContextMenuSubmenuItems(
      findServerSubmenu(resolveContextMenuItems(undefined, ctx)),
      ctx,
    )
    const expand = items[0]
    if (!expand || typeof expand !== "object" || !("onSelect" in expand)) {
      throw new Error("expected expand item")
    }
    expand.onSelect(ctx)
    expect(expandCalls).toBe(1)
  })

  test("tree Collapse all delegates to api.collapseAll()", () => {
    let collapseCalls = 0
    const ctx = makeContext({
      api: makeServerApi({ mode: "tree", collapseAll: () => collapseCalls++ }),
    })
    const items = resolveContextMenuSubmenuItems(
      findServerSubmenu(resolveContextMenuItems(undefined, ctx)),
      ctx,
    )
    const collapse = items[1]
    if (!collapse || typeof collapse !== "object" || !("onSelect" in collapse)) {
      throw new Error("expected collapse item")
    }
    collapse.onSelect(ctx)
    expect(collapseCalls).toBe(1)
  })

  test("infinite mode currently surfaces no items (Prefetch submenu is a v0.6 follow-up)", () => {
    const ctx = makeContext({ api: makeServerApi({ mode: "infinite" }) })
    const items = resolveContextMenuSubmenuItems(
      findServerSubmenu(resolveContextMenuItems(undefined, ctx)),
      ctx,
    )
    // Empty for now — Prefetch budget submenu (handoff item 2) needs
    // BcUserSettings.layout.prefetchAhead + serverGrid wiring; queued
    // as a v0.6 follow-up. The submenu collapses to "disabled" when
    // empty per the shared predicate.
    expect(items).toEqual([])
  })
})
