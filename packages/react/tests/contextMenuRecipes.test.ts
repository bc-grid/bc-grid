import { describe, expect, test } from "bun:test"
import type { BcGridApi, BcSelection, ColumnId, RowId } from "@bc-grid/core"
import {
  DEFAULT_CONTEXT_MENU_ITEMS,
  contextMenuItemDisabled,
  isContextMenuSeparator,
  isCustomContextMenuItem,
  resolveContextMenuItems,
} from "../src/contextMenu"
import type { BcContextMenuContext, BcContextMenuItem, BcContextMenuItems } from "../src/types"

/**
 * These tests pin the example shapes published in
 * `docs/api.md §contextMenuItems` and `apps/docs/.../context-menu-recipe.astro`
 * so the docs don't drift from the public types. Each test reproduces a
 * recipe verbatim (typed against the actual public types) and asserts
 * the resolver behaviour the recipe describes — extending the default,
 * conditional `false`-suppression, factory-context awareness, and
 * disabled-predicate gating.
 *
 * If a future API change breaks one of the recipes, the failing test
 * surfaces the doc rot before the `apps/docs` site goes stale.
 */

interface Customer {
  id: string
  name: string
  locked?: boolean
}

const noopApi = {
  getRangeSelection: () => ({ ranges: [], anchor: null }),
  getFilter: () => null,
  getColumnState: () => [],
} as unknown as BcGridApi<Customer>

const emptySelection: BcSelection = { mode: "explicit", rowIds: new Set() }

function makeContext(
  overrides: Partial<BcContextMenuContext<Customer>> = {},
): BcContextMenuContext<Customer> {
  return {
    api: noopApi,
    cell: null,
    column: null,
    row: null,
    selection: emptySelection,
    ...overrides,
  }
}

function makeRowContext(row: Customer): BcContextMenuContext<Customer> {
  return makeContext({
    cell: { rowId: row.id as RowId, columnId: "name" as ColumnId },
    row,
  })
}

describe("docs/api.md — default-menu recipe", () => {
  test("DEFAULT_CONTEXT_MENU_ITEMS is the v0.3 list that the docs claim", () => {
    // The recipe says: spread DEFAULT_CONTEXT_MENU_ITEMS to extend the
    // default. If the package ever changes the list, the docs need to
    // update too — pin the exact contents here.
    expect(DEFAULT_CONTEXT_MENU_ITEMS).toEqual([
      "copy",
      "copy-row",
      "copy-with-headers",
      "separator",
      "clear-selection",
      "clear-range",
    ])
  })

  test("resolveContextMenuItems(undefined) returns the default — recipe relies on this implicit fallback", () => {
    // The default-menu recipe shows passing the array explicitly OR
    // omitting the prop. Both paths must yield the same default.
    const ctx = makeContext()
    expect(resolveContextMenuItems(undefined, ctx)).toEqual(DEFAULT_CONTEXT_MENU_ITEMS)
  })
})

describe("docs/api.md — opt-in built-ins recipe", () => {
  test("the worked example list type-checks + survives the resolver", () => {
    // Reproduces the full opt-in recipe verbatim. The fact that this
    // file type-checks pins the recipe shape against the current
    // BcContextMenuItems<TRow> type; the runtime assertion below pins
    // the resolver pass-through.
    const items: BcContextMenuItems<Customer> = [
      ...DEFAULT_CONTEXT_MENU_ITEMS,
      "separator",
      "clear-column-filter",
      "clear-all-filters",
      "separator",
      "pin-column-left",
      "pin-column-right",
      "unpin-column",
      "hide-column",
      "autosize-column",
      "separator",
      "show-all-columns",
      "autosize-all-columns",
    ]
    const resolved = resolveContextMenuItems(items, makeContext())
    expect(resolved).toEqual(items)
  })
})

describe("docs/api.md — row-action factory recipe", () => {
  test("factory short-circuits on null ctx.row → no row-action surfaces on header trigger", () => {
    // Reproduces the recipe verbatim with the `ctx.row && ...` short
    // circuit. A header right-click (no row context) should drop the
    // row-action entries entirely.
    const items: BcContextMenuItems<Customer> = (ctx) => [
      ...DEFAULT_CONTEXT_MENU_ITEMS,
      ctx.row && "separator",
      ctx.row && {
        id: "open-customer",
        label: `Open ${ctx.row.name}`,
        onSelect: () => {},
      },
    ]
    const resolved = resolveContextMenuItems(items, makeContext())
    expect(resolved).toEqual(DEFAULT_CONTEXT_MENU_ITEMS)
  })

  test("factory returns row actions when ctx.row is populated (cell trigger)", () => {
    const row: Customer = { id: "r1", name: "Acme" }
    const items: BcContextMenuItems<Customer> = (ctx) => [
      ...DEFAULT_CONTEXT_MENU_ITEMS,
      ctx.row && "separator",
      ctx.row && {
        id: "open-customer",
        label: `Open ${ctx.row.name}`,
        onSelect: () => {},
      },
    ]
    const resolved = resolveContextMenuItems(items, makeRowContext(row))
    // Default 6 + separator + custom = 8.
    expect(resolved).toHaveLength(DEFAULT_CONTEXT_MENU_ITEMS.length + 2)
    const last = resolved[resolved.length - 1]
    if (!last || !isCustomContextMenuItem(last)) {
      throw new Error("expected the row-action custom item")
    }
    expect(last.id).toBe("open-customer")
    expect(last.label).toBe("Open Acme")
  })
})

describe("docs/api.md — disabled-predicate recipe", () => {
  test("predicate returns true for null row → item disabled", () => {
    // Reproduces the recipe verbatim. The "Delete row" custom item
    // disables itself when there's no row context.
    const item: BcContextMenuItem<Customer> = {
      id: "delete-customer",
      label: "Delete row",
      onSelect: ({ row }) => row != null,
      disabled: ({ row }) => row == null || row.locked === true,
    }
    expect(contextMenuItemDisabled(item, makeContext())).toBe(true)
  })

  test("predicate returns true when row.locked is true", () => {
    const item: BcContextMenuItem<Customer> = {
      id: "delete-customer",
      label: "Delete row",
      onSelect: ({ row }) => row != null,
      disabled: ({ row }) => row == null || row.locked === true,
    }
    const lockedRow: Customer = { id: "r1", name: "Acme", locked: true }
    expect(contextMenuItemDisabled(item, makeRowContext(lockedRow))).toBe(true)
  })

  test("predicate returns false when row is unlocked", () => {
    const item: BcContextMenuItem<Customer> = {
      id: "delete-customer",
      label: "Delete row",
      onSelect: ({ row }) => row != null,
      disabled: ({ row }) => row == null || row.locked === true,
    }
    const unlockedRow: Customer = { id: "r2", name: "Beta" }
    expect(contextMenuItemDisabled(item, makeRowContext(unlockedRow))).toBe(false)
  })
})

describe("docs/api.md — conditional-suppression recipe", () => {
  test("returning false drops the entry before the disabled predicate runs", () => {
    // The recipe shows `ctx.row ? "separator" : false` to drop a
    // separator when the row group below is empty. The resolver must
    // strip the `false` entry entirely so the menu doesn't show a
    // stray divider.
    const items: BcContextMenuItems<Customer> = (ctx) => [
      ...DEFAULT_CONTEXT_MENU_ITEMS,
      ctx.row ? "separator" : false,
      ctx.row && {
        id: "view-customer",
        label: "View",
        onSelect: () => {},
      },
    ]
    const headerResolved = resolveContextMenuItems(items, makeContext())
    expect(headerResolved).toEqual(DEFAULT_CONTEXT_MENU_ITEMS)
    // No trailing separator from the false branch.
    expect(headerResolved[headerResolved.length - 1]).toBe("clear-range")
  })

  test("returning false drops null + undefined entries too", () => {
    // The resolver's filter is `!= null && !== false` — pin both
    // branches so a future change doesn't accidentally narrow it.
    const items: BcContextMenuItems<Customer> = [
      "copy",
      null,
      "separator",
      undefined,
      "clear-range",
    ]
    expect(resolveContextMenuItems(items, makeContext())).toEqual([
      "copy",
      "separator",
      "clear-range",
    ])
  })
})

describe("docs/api.md — header / row / cell context recipe", () => {
  test("ctx.column scope: short-circuits column items on a no-column trigger", () => {
    const items: BcContextMenuItems<Customer> = (ctx) => [
      "copy",
      "copy-with-headers",
      ctx.column && "separator",
      ctx.column && "clear-column-filter",
      ctx.column && "pin-column-left",
      ctx.column && "pin-column-right",
      ctx.column && "unpin-column",
      ctx.row && "separator",
      ctx.row && {
        id: "view-customer",
        label: "View",
        onSelect: () => {},
      },
    ]
    // No column AND no row → only the clipboard pair survives.
    const empty = resolveContextMenuItems(items, makeContext())
    expect(empty).toEqual(["copy", "copy-with-headers"])

    // Column without row (header trigger) → column group surfaces,
    // row group doesn't.
    const headerCtx = makeContext({
      column: { columnId: "name" as ColumnId, field: "name", header: "Name" } as never,
    })
    const header = resolveContextMenuItems(items, headerCtx)
    expect(header).toEqual([
      "copy",
      "copy-with-headers",
      "separator",
      "clear-column-filter",
      "pin-column-left",
      "pin-column-right",
      "unpin-column",
    ])

    // Row + cell + column (data-cell trigger) → both groups surface.
    const cellCtx = makeContext({
      cell: { rowId: "r1" as RowId, columnId: "name" as ColumnId },
      column: { columnId: "name" as ColumnId, field: "name", header: "Name" } as never,
      row: { id: "r1", name: "Acme" },
    })
    const cell = resolveContextMenuItems(items, cellCtx)
    expect(cell).toHaveLength(9)
    // Last entry is the row-action custom item.
    const last = cell[cell.length - 1]
    if (!last || !isCustomContextMenuItem(last)) {
      throw new Error("expected the row-action custom item")
    }
    expect(last.id).toBe("view-customer")
  })
})

describe("docs/api.md — suppress-menu recipe", () => {
  test("factory returning [] yields no items", () => {
    const items: BcContextMenuItems<Customer> = (ctx) =>
      ctx.row?.locked === true ? [] : DEFAULT_CONTEXT_MENU_ITEMS

    const lockedRow: Customer = { id: "r1", name: "Acme", locked: true }
    expect(resolveContextMenuItems(items, makeRowContext(lockedRow))).toEqual([])

    const unlockedRow: Customer = { id: "r2", name: "Beta" }
    expect(resolveContextMenuItems(items, makeRowContext(unlockedRow))).toEqual(
      DEFAULT_CONTEXT_MENU_ITEMS,
    )
  })
})

describe("docs/api.md — separator handling", () => {
  test("isContextMenuSeparator narrows correctly so the recipe's separator strings stay typed", () => {
    // The recipe uses `"separator"` as a string literal between
    // groups. Pin the type-guard so a future widening of the union
    // doesn't accidentally accept random strings as separators.
    expect(isContextMenuSeparator("separator")).toBe(true)
    expect(isContextMenuSeparator("copy")).toBe(false)
    expect(isContextMenuSeparator("clear-range")).toBe(false)
  })
})
