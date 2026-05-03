import { describe, expect, test } from "bun:test"
import type {
  BcGridApi,
  BcRange,
  BcRangeSelection,
  BcSelection,
  ColumnId,
  RowId,
} from "@bc-grid/core"
import { renderToStaticMarkup } from "react-dom/server"
import type { ResolvedColumn, RowEntry } from "../src/gridInternals"
import { BcGridContextMenu } from "../src/internal/context-menu"
import type { BcContextMenuItems } from "../src/types"

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
  ["r1", { kind: "data", level: 0, row: { id: "r1", name: "Acme" }, rowId: "r1" }],
])

const emptySelection: BcSelection = { mode: "explicit", rowIds: new Set() }

function renderMenu(items?: BcContextMenuItems<Row>, api: BcGridApi<Row> = noopApi): string {
  return renderToStaticMarkup(
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
    />,
  )
}

describe("BcGridContextMenu — Radix-style attribute contract", () => {
  test("emits data-state='open' on the menu root", () => {
    // The right-click menu is point-anchored and unmount-on-close, so
    // the value is constant — but the attribute is set so apps can
    // target the popup with the same `[data-state="open"]` rule they
    // would use for a Radix DropdownMenu.Content.
    const html = renderMenu()
    expect(html).toContain('data-state="open"')
  })

  test("emits constant data-side='bottom' / data-align='start' on the menu root", () => {
    const html = renderMenu()
    expect(html).toContain('data-side="bottom"')
    expect(html).toContain('data-align="start"')
  })

  test("does not render before any DOM measurement (SSR-safe)", () => {
    // The menu's positioning helper runs at render time with a
    // synthetic viewport on the server — assert that the static
    // markup still includes the menu root (no error / no empty
    // string) so this is a load-bearing SSR contract.
    const html = renderMenu()
    expect(html).toContain('class="bc-grid-context-menu"')
    expect(html).toContain('role="menu"')
  })
})

describe("BcGridContextMenu — destructive variant", () => {
  // Custom items can opt into shadcn's destructive treatment via
  // `variant: "destructive"`. The renderer must emit `data-variant`
  // on the row so theming.css can paint the destructive colour
  // (matches shadcn DropdownMenu's `data-[variant=destructive]`).
  test("custom item with variant='destructive' emits data-variant on the row", () => {
    const html = renderMenu([
      {
        id: "delete",
        label: "Delete row",
        onSelect: () => {},
        variant: "destructive",
      },
    ])

    expect(html).toContain('data-variant="destructive"')
    expect(html).toContain(">Delete row<")
  })

  test("custom item without a variant omits the data-variant attribute (not 'default')", () => {
    // CSS targets [data-variant="destructive"]; the absence of the
    // attribute is the default branch, so `data-variant="default"`
    // would be wrong. Pin the omission so a future renderer change
    // doesn't accidentally start emitting "default".
    const html = renderMenu([
      {
        id: "open",
        label: "Open row",
        onSelect: () => {},
      },
    ])

    expect(html).not.toMatch(/data-variant="(default|destructive)"/)
  })

  test("custom item with variant='default' is treated as no variant", () => {
    // The type allows "default" | "destructive". Setting "default"
    // explicitly should behave the same as omitting variant — the
    // renderer doesn't emit the attribute, so theming.css can stay
    // ignorant of the literal string.
    const html = renderMenu([
      {
        id: "open",
        label: "Open row",
        onSelect: () => {},
        variant: "default",
      },
    ])

    expect(html).not.toMatch(/data-variant="(default|destructive)"/)
  })

  test("built-in items don't carry a destructive variant (none of them are irreversible)", () => {
    // Default item set surfaces clipboard / clear-selection /
    // clear-range. None of those are dangerous, so they shouldn't
    // ever render with data-variant="destructive". This pins the
    // contract so a future built-in addition has to opt in
    // explicitly.
    const html = renderMenu(["copy", "copy-with-headers", "separator", "clear-range"])

    expect(html).not.toContain('data-variant="destructive"')
  })

  test("destructive variant renders alongside data-active (keyboard nav state) without conflict", () => {
    // Both attributes live on the same row when the user keyboard-
    // focuses a destructive item. Pin the markup so a CSS author can
    // write `[data-variant="destructive"][data-active="true"]` and
    // know both are present.
    const html = renderMenu([
      {
        id: "delete",
        label: "Delete",
        onSelect: () => {},
        variant: "destructive",
      },
    ])

    // The first focusable item is selected by default in
    // BcGridContextMenu's roving-focus state machine (activeIndex
    // initialised from the first focusable index).
    expect(html).toMatch(
      /data-active="true"[^>]*data-variant="destructive"|data-variant="destructive"[^>]*data-active="true"/,
    )
  })
})

describe("BcGridContextMenu — separator markup", () => {
  test("renders separator items with role='separator' and the bc-grid-context-menu-separator class", () => {
    // Separator chrome is unchanged in this PR; pin the contract so
    // the visual polish slice doesn't accidentally drop the role or
    // the class hook the existing CSS targets.
    const html = renderMenu(["copy", "separator", "clear-range"])

    expect(html).toContain('role="separator"')
    expect(html).toContain('class="bc-grid-context-menu-separator"')
    expect(html).toContain('aria-orientation="horizontal"')
  })
})

describe("BcGridContextMenu — toggle and submenu markup", () => {
  test("renders toggle items as checkbox menuitems with checked state hooks", () => {
    const html = renderMenu([
      {
        kind: "toggle",
        id: "show-filter-row",
        label: "Show filter row",
        checked: true,
        onToggle: () => {},
      },
    ])

    expect(html).toContain('role="menuitemcheckbox"')
    expect(html).toContain('aria-checked="true"')
    expect(html).toContain('data-state="checked"')
    expect(html).toContain(">Show filter row</span>")
    expect(html).toContain("M3 8.5 6.5 12 13 4.5")
  })

  test("renders radio-style toggle items as radio menuitems", () => {
    const html = renderMenu([
      {
        kind: "toggle",
        selection: "radio",
        id: "density-normal",
        label: "Normal",
        checked: true,
        onToggle: () => {},
      },
    ])

    expect(html).toContain('role="menuitemradio"')
    expect(html).toContain('aria-checked="true"')
    expect(html).toContain(">Normal</span>")
  })

  test("renders submenu triggers with aria-haspopup and nested menu content", () => {
    const html = renderMenu([
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

    expect(html).toContain('class="bc-grid-context-menu-submenu"')
    expect(html).toContain('aria-haspopup="menu"')
    expect(html).toContain('class="bc-grid-context-menu-submenu-content"')
    expect(html).toContain('role="menu"')
    expect(html).toContain('class="bc-grid-context-menu-chevron"')
    expect(html).toContain(">Show sidebar</span>")
  })
})

describe("BcGridContextMenu — column command rendering through BcGridMenuItem", () => {
  // Pure-helper tests in `contextMenu.test.ts` exercise the label /
  // disabled-state predicates; these tests confirm the rendered menu
  // surfaces the column commands through the shared `BcGridMenuItem`
  // primitive (icon slot, label, aria-disabled wired correctly).

  const COLUMN_COMMANDS = [
    "pin-column-left",
    "pin-column-right",
    "unpin-column",
    "hide-column",
    "autosize-column",
  ] as const

  /**
   * Find the menuitem `<div>` for the item at `index` (0-based) in the
   * items array. The renderer assigns ids like `${useId}-item-N`; the
   * `-item-N` suffix is stable per array index regardless of the
   * auto-generated React id.
   */
  function itemAt(html: string, index: number): string {
    const m = html.match(new RegExp(`<div\\s+id="[^"]+-item-${index}"[^>]*>`))
    if (!m) throw new Error(`item-${index} not found in markup`)
    return m[0]
  }

  test("renders every single-column command label when supplied as the items list", () => {
    const html = renderMenu(
      [...COLUMN_COMMANDS],
      makeApiWithColumnState([{ columnId: "name", pinned: "left" }, { columnId: "email" }]),
    )
    // Labels render inside the `bc-grid-menu-item-label` span (the
    // shared menu-item primitive). Match the closing-tag context.
    expect(html).toContain(">Pin Left</span>")
    expect(html).toContain(">Pin Right</span>")
    expect(html).toContain(">Unpin</span>")
    expect(html).toContain(">Hide Column</span>")
    expect(html).toContain(">Autosize Column</span>")
  })

  test("each column command carries an inline-SVG icon in the leading slot (aria-hidden)", () => {
    // The icon slot in BcGridMenuItem renders the per-id SVG from
    // context-menu-icons.tsx. Every column command should land an SVG.
    const html = renderMenu([...COLUMN_COMMANDS], makeApiWithColumnState([{ columnId: "name" }]))
    // The leading-slot wrapper carries `aria-hidden="true"` and its
    // SVG class is `bc-grid-context-menu-icon-svg`. One SVG per item.
    const svgs = html.match(/class="bc-grid-context-menu-icon-svg"/g) ?? []
    expect(svgs.length).toBe(COLUMN_COMMANDS.length)
  })

  test("aria-disabled toggles per the column-context predicate (pin-column-left vs already-pinned-left)", () => {
    // Column "name" is pinned left → pin-column-left disabled,
    // pin-column-right enabled, unpin-column enabled.
    const html = renderMenu(
      [...COLUMN_COMMANDS],
      makeApiWithColumnState([{ columnId: "name", pinned: "left" }]),
    )

    // pin-column-left (item-0): disabled (already pinned to that side)
    expect(itemAt(html, 0)).toMatch(/aria-disabled="true"/)
    // pin-column-right (item-1): enabled — the renderer omits
    // aria-disabled rather than emitting "false".
    expect(itemAt(html, 1)).not.toMatch(/aria-disabled=/)
    // unpin-column (item-2): enabled (currently pinned left).
    expect(itemAt(html, 2)).not.toMatch(/aria-disabled=/)
  })

  test("aria-disabled flips when the column has no pin state (unpin disabled, both pin sides enabled)", () => {
    const html = renderMenu([...COLUMN_COMMANDS], makeApiWithColumnState([{ columnId: "name" }]))

    // pin-column-left (item-0) + pin-column-right (item-1): enabled
    expect(itemAt(html, 0)).not.toMatch(/aria-disabled=/)
    expect(itemAt(html, 1)).not.toMatch(/aria-disabled=/)
    // unpin-column (item-2): disabled (column isn't pinned)
    expect(itemAt(html, 2)).toMatch(/aria-disabled="true"/)
  })

  test("hide-column disables when it would hide the last visible column (UX guard)", () => {
    // Only one column, currently visible — hiding it would leave the
    // grid empty. The disabled-state predicate guards against this.
    const html = renderMenu(["hide-column"], makeApiWithColumnState([{ columnId: "name" }]))
    expect(itemAt(html, 0)).toMatch(/aria-disabled="true"/)
  })

  test("autosize-column disables when the targeted column is hidden", () => {
    const html = renderMenu(
      ["autosize-column"],
      makeApiWithColumnState([{ columnId: "name", hidden: true }, { columnId: "email" }]),
    )
    // Right-click trigger landed on `name` (hidden); autosize disabled.
    expect(itemAt(html, 0)).toMatch(/aria-disabled="true"/)
  })

  test("first item carries data-active='true' (initial roving-focus seed)", () => {
    // BcGridContextMenu seeds activeIndex from the first focusable
    // index. With no separators in the list, that's index 0.
    const html = renderMenu([...COLUMN_COMMANDS], makeApiWithColumnState([{ columnId: "name" }]))
    expect(itemAt(html, 0)).toMatch(/data-active="true"/)
    // Items 1+ don't carry the active state.
    expect(itemAt(html, 1)).not.toMatch(/data-active=/)
  })
})
