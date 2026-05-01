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

function renderMenu(): string {
  return renderToStaticMarkup(
    <BcGridContextMenu<Row>
      api={noopApi}
      anchor={{ x: 100, y: 80 }}
      columnId={"name" as ColumnId}
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
