import { describe, expect, test } from "bun:test"
import type { AggregationResult } from "@bc-grid/aggregations"
import type { BcGridApi } from "@bc-grid/core"
import { renderToStaticMarkup } from "react-dom/server"
import { BcStatusBar, resolveVisibleSegments } from "../src/statusBar"
import type { BcStatusBarContext, BcStatusBarSegment } from "../src/types"

const stubApi = {} as BcGridApi<unknown>

const sumResult: AggregationResult = {
  columnId: "balance",
  rowCount: 3,
  value: 6000,
  aggregation: { id: "sum" } as AggregationResult["aggregation"],
}

function ctx(overrides: Partial<BcStatusBarContext<unknown>> = {}): BcStatusBarContext<unknown> {
  return {
    api: stubApi,
    totalRowCount: 100,
    filteredRowCount: 100,
    selectedRowCount: 0,
    aggregations: [],
    ...overrides,
  }
}

describe("resolveVisibleSegments", () => {
  test("`total` always renders when listed", () => {
    const visible = resolveVisibleSegments(["total"], ctx())
    expect(visible.length).toBe(1)
    expect(visible[0]?.id).toBe("total")
    expect(visible[0]?.align).toBe("left")
  })

  test("`filtered` renders only when filtered count differs from total", () => {
    const inactive = resolveVisibleSegments(["filtered"], ctx({ filteredRowCount: 100 }))
    expect(inactive.length).toBe(0)

    const active = resolveVisibleSegments(["filtered"], ctx({ filteredRowCount: 7 }))
    expect(active.length).toBe(1)
    expect(active[0]?.id).toBe("filtered")
  })

  test("`filtered` renders when totalRowCount is unknown (server row models)", () => {
    const visible = resolveVisibleSegments(
      ["filtered"],
      ctx({ totalRowCount: "unknown", filteredRowCount: 7 }),
    )
    expect(visible.length).toBe(1)
    expect(visible[0]?.id).toBe("filtered")
  })

  test("`selected` renders only when selectedRowCount > 0", () => {
    const empty = resolveVisibleSegments(["selected"], ctx({ selectedRowCount: 0 }))
    expect(empty.length).toBe(0)

    const populated = resolveVisibleSegments(["selected"], ctx({ selectedRowCount: 3 }))
    expect(populated.length).toBe(1)
    expect(populated[0]?.id).toBe("selected")
  })

  test("`aggregations` renders only when results are non-empty", () => {
    const empty = resolveVisibleSegments(["aggregations"], ctx({ aggregations: [] }))
    expect(empty.length).toBe(0)

    const populated = resolveVisibleSegments(["aggregations"], ctx({ aggregations: [sumResult] }))
    expect(populated.length).toBe(1)
    expect(populated[0]?.id).toBe("aggregations")
    // RFC: aggregations segment defaults to right alignment so it sits
    // opposite the row counts.
    expect(populated[0]?.align).toBe("right")
  })

  test("custom segments render unconditionally and respect align", () => {
    const segments: readonly BcStatusBarSegment[] = [
      { id: "syncTime", render: () => "synced", align: "right" },
    ]
    const visible = resolveVisibleSegments(segments, ctx())
    expect(visible.length).toBe(1)
    expect(visible[0]?.id).toBe("syncTime")
    expect(visible[0]?.align).toBe("right")
  })

  test("custom segments default to left alignment when align is omitted", () => {
    const segments: readonly BcStatusBarSegment[] = [{ id: "x", render: () => "x" }]
    const visible = resolveVisibleSegments(segments, ctx())
    expect(visible[0]?.align).toBe("left")
  })

  test("preserves segment order across mixed built-ins and custom entries", () => {
    const segments: readonly BcStatusBarSegment[] = [
      "total",
      "selected",
      { id: "lastSync", render: () => "synced" },
      "aggregations",
    ]
    const visible = resolveVisibleSegments(
      segments,
      ctx({ selectedRowCount: 2, aggregations: [sumResult] }),
    )
    expect(visible.map((entry) => entry.id)).toEqual([
      "total",
      "selected",
      "lastSync",
      "aggregations",
    ])
  })

  test("hides built-ins that fail their visibility rule but keeps surrounding segments", () => {
    const segments: readonly BcStatusBarSegment[] = [
      "total",
      "filtered",
      "selected",
      "aggregations",
    ]
    const visible = resolveVisibleSegments(
      segments,
      ctx({ selectedRowCount: 0, aggregations: [], filteredRowCount: 100 }),
    )
    expect(visible.map((entry) => entry.id)).toEqual(["total"])
  })

  test("custom segment receives the live context", () => {
    let received: BcStatusBarContext<unknown> | null = null
    const segments: readonly BcStatusBarSegment[] = [
      {
        id: "spy",
        render: (received_) => {
          received = received_
          return ""
        },
      },
    ]
    const liveCtx = ctx({ selectedRowCount: 9 })
    resolveVisibleSegments(segments, liveCtx)
    expect(received).toBe(liveCtx)
  })
})

describe("BcStatusBar render", () => {
  test("returns null when no segments resolve as visible", () => {
    const html = renderToStaticMarkup(
      <BcStatusBar ariaLabel="Grid status" ctx={ctx()} segments={["selected"]} />,
    )
    expect(html).toBe("")
  })

  test("renders region landmark + accessible name + segment data attributes", () => {
    const html = renderToStaticMarkup(
      <BcStatusBar
        ariaLabel="Grid status"
        ctx={ctx({ filteredRowCount: 7, selectedRowCount: 2, aggregations: [sumResult] })}
        segments={["total", "filtered", "selected", "aggregations"]}
      />,
    )
    // <section> + an accessible name carries the implicit region role, no
    // explicit role attribute needed (lint/a11y/useSemanticElements).
    expect(html).toContain("<section")
    expect(html).toContain('aria-label="Grid status"')
    expect(html).toContain('data-segment="total"')
    expect(html).toContain('data-segment="filtered"')
    expect(html).toContain('data-segment="selected"')
    expect(html).toContain('data-segment="aggregations"')
    expect(html).toContain('data-align="right"')
  })

  test("formats counts with locale-aware thousands separators", () => {
    const html = renderToStaticMarkup(
      <BcStatusBar
        ariaLabel="Grid status"
        ctx={ctx({ totalRowCount: 12345, filteredRowCount: 12345 })}
        segments={["total"]}
      />,
    )
    expect(html).toContain("12,345")
  })

  test("renders an em-dash for unknown total counts", () => {
    const html = renderToStaticMarkup(
      <BcStatusBar
        ariaLabel="Grid status"
        ctx={ctx({ totalRowCount: "unknown", filteredRowCount: 0 })}
        segments={["total"]}
      />,
    )
    expect(html).toContain("— rows")
  })
})
