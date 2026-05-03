import { describe, expect, test } from "bun:test"
import type { BcRangeSelection, ColumnId, RowId } from "@bc-grid/core"
import { Virtualizer } from "@bc-grid/virtualizer"
import { renderToStaticMarkup } from "react-dom/server"
import { BcRangeOverlay, computeRangeOverlayRects } from "../src/rangeOverlay"

const rowIds = ["r1", "r2", "r3"] as RowId[]

describe("computeRangeOverlayRects", () => {
  test("returns no rects without a valid active range", () => {
    const rects = computeRangeOverlayRects({
      columns: [column("name"), column("amount")],
      rangeSelection: { ranges: [], anchor: null },
      rowIds,
      scrollLeft: 0,
      totalWidth: 200,
      viewportWidth: 200,
      virtualizer: virtualizer({ colWidths: [100, 100], rowCount: 3 }),
    })

    expect(rects).toEqual([])
  })

  test("uses the active range and current resolved row and column order", () => {
    const rects = computeRangeOverlayRects({
      columns: [column("name"), column("amount"), column("status")],
      rangeSelection: selection(
        range("r1", "status", "r1", "status"),
        range("r3", "status", "r2", "amount"),
      ),
      rowIds,
      scrollLeft: 0,
      totalWidth: 330,
      viewportWidth: 330,
      virtualizer: virtualizer({ colWidths: [90, 110, 130], rowCount: 3, rowHeight: 24 }),
    })

    expect(rects).toEqual([
      expect.objectContaining({
        top: 24,
        left: 90,
        width: 240,
        height: 48,
        pinned: null,
        transform: undefined,
      }),
    ])
  })

  test("ignores stale row or column references", () => {
    const rects = computeRangeOverlayRects({
      columns: [column("name"), column("amount")],
      rangeSelection: selection(range("r1", "name", "missing-row", "amount")),
      rowIds,
      scrollLeft: 0,
      totalWidth: 200,
      viewportWidth: 200,
      virtualizer: virtualizer({ colWidths: [100, 100], rowCount: 3 }),
    })

    expect(rects).toEqual([])
  })

  test("splits ranges across pinned left, body, and pinned right regions", () => {
    const rects = computeRangeOverlayRects({
      columns: [
        column("account", "left"),
        column("name"),
        column("amount"),
        column("actions", "right"),
      ],
      rangeSelection: selection(range("r1", "account", "r1", "actions")),
      rowIds,
      scrollLeft: 120,
      totalWidth: 390,
      viewportWidth: 240,
      virtualizer: virtualizer({
        colWidths: [80, 100, 120, 90],
        rowCount: 3,
        rowHeight: 30,
      }),
    })

    expect(rects).toHaveLength(3)
    expect(rects[0]).toMatchObject({
      left: 0,
      width: 80,
      pinned: "left",
      transform: "translate3d(120px, 0, 0)",
    })
    expect(rects[1]).toMatchObject({
      left: 80,
      width: 220,
      pinned: null,
      transform: undefined,
    })
    expect(rects[2]).toMatchObject({
      left: 300,
      width: 90,
      pinned: "right",
      transform: "translate3d(-30px, 0, 0)",
    })
  })
})

describe("BcRangeOverlay", () => {
  test("renders pointer-safe active range overlay markup", () => {
    const html = renderToStaticMarkup(
      <BcRangeOverlay
        columns={[column("account", "left"), column("name")]}
        rangeSelection={selection(range("r1", "account", "r1", "name"))}
        rowIds={rowIds}
        scrollLeft={32}
        totalWidth={180}
        viewportWidth={140}
        virtualizer={virtualizer({
          colWidths: [80, 100],
          rowCount: 3,
          rowHeight: 30,
        })}
      />,
    )

    expect(html).toContain('aria-hidden="true"')
    expect(html).toContain("bc-grid-range-overlay-layer")
    expect(html).toContain('data-bc-grid-range-overlay-layer="body"')
    expect(html).toContain('data-bc-grid-range-overlay-layer="pinned"')
    expect(html).toContain('data-bc-grid-range-overlay="true"')
    expect(html).toContain('data-bc-grid-range-active="true"')
    expect(html).toContain('data-bc-grid-range-pinned="left"')
  })

  test("renders a fill handle on an unsplit single active range", () => {
    const html = renderToStaticMarkup(
      <BcRangeOverlay
        columns={[column("name"), column("amount")]}
        fillHandleEnabled={true}
        rangeSelection={selection(range("r1", "name", "r2", "amount"))}
        rowIds={rowIds}
        scrollLeft={0}
        totalWidth={200}
        viewportWidth={200}
        virtualizer={virtualizer({
          colWidths: [100, 100],
          rowCount: 3,
          rowHeight: 30,
        })}
      />,
    )

    expect(html).toContain("bc-grid-fill-handle")
    expect(html).toContain('data-bc-grid-fill-handle="true"')
  })

  test("does not render a fill handle when the active range splits across pinned regions", () => {
    const html = renderToStaticMarkup(
      <BcRangeOverlay
        columns={[column("account", "left"), column("name")]}
        fillHandleEnabled={true}
        rangeSelection={selection(range("r1", "account", "r1", "name"))}
        rowIds={rowIds}
        scrollLeft={32}
        totalWidth={180}
        viewportWidth={140}
        virtualizer={virtualizer({
          colWidths: [80, 100],
          rowCount: 3,
          rowHeight: 30,
        })}
      />,
    )

    expect(html).not.toContain("bc-grid-fill-handle")
  })
})

function virtualizer({
  colWidths,
  rowCount,
  rowHeight = 24,
}: {
  colWidths: readonly number[]
  rowCount: number
  rowHeight?: number
}): Virtualizer {
  const instance = new Virtualizer({
    rowCount,
    colCount: colWidths.length,
    defaultRowHeight: rowHeight,
    defaultColWidth: 100,
    viewportHeight: rowHeight * rowCount,
    viewportWidth: colWidths.reduce((total, width) => total + width, 0),
  })
  colWidths.forEach((width, index) => instance.setColWidth(index, width))
  return instance
}

function column(
  columnId: string,
  pinned: "left" | "right" | null = null,
): { readonly columnId: ColumnId; readonly pinned: "left" | "right" | null } {
  return { columnId: columnId as ColumnId, pinned }
}

function selection(...ranges: BcRangeSelection["ranges"]): BcRangeSelection {
  return {
    ranges,
    anchor: ranges[ranges.length - 1]?.start ?? null,
  }
}

function range(
  startRowId: string,
  startColumnId: string,
  endRowId: string,
  endColumnId: string,
): BcRangeSelection["ranges"][number] {
  return {
    start: { rowId: startRowId as RowId, columnId: startColumnId as ColumnId },
    end: { rowId: endRowId as RowId, columnId: endColumnId as ColumnId },
  }
}
