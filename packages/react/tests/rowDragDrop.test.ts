import { describe, expect, test } from "bun:test"
import type { BcSelection } from "@bc-grid/core"
import {
  BC_GRID_ROW_DRAG_MIME,
  computeEdgeScrollDelta,
  computeRowDropPosition,
  parseRowDragPayload,
  resolveDragSourceRowIds,
  serializeRowDragPayload,
} from "../src/rowDragDrop"

describe("computeRowDropPosition — thirds split (v0.6 §1)", () => {
  // Mirrors macOS Finder, VS Code's file explorer, and Notion DnD.
  // Top 33% = "before", middle 34% = "into", bottom 33% = "after".
  // Pin the boundary behaviour so a refactor that flips fractions
  // catches loudly.
  const rect = { top: 0, bottom: 30 }

  test("top edge maps to 'before'", () => {
    expect(computeRowDropPosition(0, rect)).toBe("before")
    expect(computeRowDropPosition(5, rect)).toBe("before")
    expect(computeRowDropPosition(9, rect)).toBe("before") // ratio 0.3 < 1/3
  })

  test("middle band maps to 'into'", () => {
    expect(computeRowDropPosition(11, rect)).toBe("into") // ratio 0.366
    expect(computeRowDropPosition(15, rect)).toBe("into")
    expect(computeRowDropPosition(19, rect)).toBe("into") // ratio 0.633
  })

  test("bottom edge maps to 'after'", () => {
    expect(computeRowDropPosition(21, rect)).toBe("after") // ratio 0.7 > 2/3
    expect(computeRowDropPosition(28, rect)).toBe("after")
    expect(computeRowDropPosition(30, rect)).toBe("after")
  })

  test("clamps overflow to the nearest edge (fast pointer movements)", () => {
    // The browser can fire dragOver with a Y just past the row edge
    // before the next row's listener takes over. Treat overflow as
    // the nearest edge rather than crashing the math.
    expect(computeRowDropPosition(-5, rect)).toBe("before")
    expect(computeRowDropPosition(35, rect)).toBe("after")
  })

  test("zero-height row resolves to 'none' (defensive — virtualizer transitions)", () => {
    expect(computeRowDropPosition(0, { top: 50, bottom: 50 })).toBe("none")
  })

  test("non-zero rect with offset top works (rows aren't always at y=0)", () => {
    // The body is offset by header chrome — pin that the math
    // computes the offset against the rect's top, not the absolute
    // viewport coordinate.
    const offsetRect = { top: 100, bottom: 130 }
    expect(computeRowDropPosition(105, offsetRect)).toBe("before")
    expect(computeRowDropPosition(115, offsetRect)).toBe("into")
    expect(computeRowDropPosition(125, offsetRect)).toBe("after")
  })
})

describe("computeEdgeScrollDelta — viewport edge auto-scroll (v0.6 §1)", () => {
  // Linear ramp from 0 (just inside the zone) to maxSpeed (at the
  // edge). Default 48px zone matches the comfortable row height
  // range — auto-scroll engages right as the pointer reaches the
  // edge row, not earlier.
  const viewportRect = { top: 0, bottom: 400 }

  test("returns 0 when pointer is in the middle of the viewport", () => {
    expect(computeEdgeScrollDelta({ clientY: 200, viewportRect })).toBe(0)
    expect(computeEdgeScrollDelta({ clientY: 100, viewportRect })).toBe(0)
    expect(computeEdgeScrollDelta({ clientY: 300, viewportRect })).toBe(0)
  })

  test("returns negative delta near top edge (scroll up)", () => {
    // 24px from top is half-way into the 48px edge zone → ~half maxSpeed.
    const delta = computeEdgeScrollDelta({ clientY: 24, viewportRect })
    expect(delta).toBeLessThan(0)
    expect(Math.abs(delta)).toBeLessThan(12)
    expect(Math.abs(delta)).toBeGreaterThan(0)
  })

  test("returns positive delta near bottom edge (scroll down)", () => {
    // 24px from bottom (clientY = 376 with bottom=400) → ~half maxSpeed.
    const delta = computeEdgeScrollDelta({ clientY: 376, viewportRect })
    expect(delta).toBeGreaterThan(0)
    expect(delta).toBeLessThan(12)
  })

  test("ramp is linear: closer to edge = larger magnitude", () => {
    const farther = computeEdgeScrollDelta({ clientY: 40, viewportRect })
    const closer = computeEdgeScrollDelta({ clientY: 5, viewportRect })
    // Both negative (top zone), closer should have larger absolute value.
    expect(Math.abs(closer)).toBeGreaterThan(Math.abs(farther))
  })

  test("at the very edge, returns full maxSpeed", () => {
    expect(computeEdgeScrollDelta({ clientY: 0, viewportRect })).toBe(-12)
    expect(computeEdgeScrollDelta({ clientY: 400, viewportRect })).toBe(12)
  })

  test("respects custom edgeZone + maxSpeed", () => {
    const delta = computeEdgeScrollDelta({
      clientY: 0,
      viewportRect,
      edgeZone: 100,
      maxSpeed: 30,
    })
    expect(delta).toBe(-30)
  })

  test("returns 0 for pointer outside the viewport (above or below)", () => {
    // distanceFromTop < 0 → not in top zone; distanceFromBottom > edgeZone → not in bottom zone.
    expect(computeEdgeScrollDelta({ clientY: -10, viewportRect })).toBe(0)
    expect(computeEdgeScrollDelta({ clientY: 500, viewportRect })).toBe(0)
  })
})

describe("resolveDragSourceRowIds — multi-row drag (v0.6 §1)", () => {
  // Drag-from-inside-selection drags the whole selection (matches
  // macOS Finder + VS Code). Drag-from-outside-selection drags just
  // the origin row. The returned order matches `visibleRowIds` so
  // the consumer sees the drop in the user's visual ordering.

  test("drag from outside selection drags only the origin row", () => {
    const selection: BcSelection = { mode: "explicit", rowIds: new Set(["r1", "r3"]) }
    const result = resolveDragSourceRowIds({
      originRowId: "r5",
      selection,
      visibleRowIds: ["r1", "r2", "r3", "r4", "r5"],
    })
    expect(result).toEqual(["r5"])
  })

  test("drag from inside explicit selection drags every selected row in visible order", () => {
    const selection: BcSelection = { mode: "explicit", rowIds: new Set(["r3", "r1"]) }
    const result = resolveDragSourceRowIds({
      originRowId: "r1",
      selection,
      visibleRowIds: ["r1", "r2", "r3", "r4", "r5"],
    })
    // Order matches visibleRowIds, not Set insertion order.
    expect(result).toEqual(["r1", "r3"])
  })

  test("drag from inside 'all' selection drags every visible row", () => {
    const selection: BcSelection = { mode: "all", except: new Set() }
    const result = resolveDragSourceRowIds({
      originRowId: "r2",
      selection,
      visibleRowIds: ["r1", "r2", "r3"],
    })
    expect(result).toEqual(["r1", "r2", "r3"])
  })

  test("drag from inside 'all' selection respects the except set", () => {
    const selection: BcSelection = { mode: "all", except: new Set(["r2"]) }
    const result = resolveDragSourceRowIds({
      originRowId: "r1",
      selection,
      visibleRowIds: ["r1", "r2", "r3"],
    })
    expect(result).toEqual(["r1", "r3"])
  })

  test("falls through to single-row drag when selection mode is 'all' but visibleRowIds is empty", () => {
    // Defensive: virtualizer mid-transition can return empty visible.
    // Without the fallback we'd drag an empty list, which produces no
    // drop event downstream — silent failure.
    const selection: BcSelection = { mode: "all", except: new Set() }
    const result = resolveDragSourceRowIds({
      originRowId: "r1",
      selection,
      visibleRowIds: [],
    })
    expect(result).toEqual(["r1"])
  })
})

describe("serializeRowDragPayload + parseRowDragPayload — round-trip (v0.6 §1)", () => {
  test("round-trips a valid rowIds list", () => {
    const rowIds = ["r1", "r2", "r3"] as const
    expect(parseRowDragPayload(serializeRowDragPayload(rowIds))).toEqual(rowIds)
  })

  test("round-trips a single rowId", () => {
    expect(parseRowDragPayload(serializeRowDragPayload(["only"]))).toEqual(["only"])
  })

  test("round-trips an empty list (caller responsibility to ignore)", () => {
    expect(parseRowDragPayload(serializeRowDragPayload([]))).toEqual([])
  })

  test("returns null for non-JSON input (plain text drops, drag from outside the grid)", () => {
    expect(parseRowDragPayload("not-json")).toBeNull()
    expect(parseRowDragPayload("")).toBeNull()
  })

  test("returns null for JSON that isn't an array", () => {
    expect(parseRowDragPayload('{"rowIds": ["r1"]}')).toBeNull()
    expect(parseRowDragPayload('"r1"')).toBeNull()
    expect(parseRowDragPayload("42")).toBeNull()
  })

  test("returns null when array contains non-string entries", () => {
    expect(parseRowDragPayload("[1, 2, 3]")).toBeNull()
    expect(parseRowDragPayload('["r1", null]')).toBeNull()
    expect(parseRowDragPayload('["r1", {}]')).toBeNull()
  })
})

describe("BC_GRID_ROW_DRAG_MIME — public constant (v0.6 §1)", () => {
  test("is the documented application/x-bc-grid-rows MIME", () => {
    // Pin the literal string — consumers reading dataTransfer in
    // cross-grid drop targets reference this constant; changing the
    // value silently breaks every consumer wiring.
    expect(BC_GRID_ROW_DRAG_MIME).toBe("application/x-bc-grid-rows")
  })
})
