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

function renderMenu(items?: BcContextMenuItems<Row>): string {
  return renderToStaticMarkup(
    <BcGridContextMenu<Row>
      api={noopApi}
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
