import { describe, expect, test } from "bun:test"
import { computePopupPosition } from "../src/internal/popup-position"

const VP = { width: 1024, height: 768 }

describe("computePopupPosition — point anchor (right-click context menu)", () => {
  test("places popup top-left at the click coordinate when it fits", () => {
    const result = computePopupPosition({
      anchor: { x: 200, y: 150 },
      popup: { width: 240, height: 320 },
      viewport: VP,
    })
    expect(result).toEqual({ x: 200, y: 150, side: "bottom", align: "start" })
  })

  test("clamps to the right edge when the click is too close to it", () => {
    const result = computePopupPosition({
      anchor: { x: 1010, y: 100 },
      popup: { width: 240, height: 200 },
      viewport: VP,
    })
    // Right edge clamp: x = viewport.width - popup.width - margin (8)
    expect(result.x).toBe(1024 - 240 - 8)
    expect(result.y).toBe(100)
  })

  test("clamps to the bottom edge when the click is too close to it", () => {
    const result = computePopupPosition({
      anchor: { x: 100, y: 760 },
      popup: { width: 240, height: 200 },
      viewport: VP,
    })
    expect(result.y).toBe(768 - 200 - 8)
    expect(result.x).toBe(100)
  })

  test("clamps to the top-left margin when the click is at the origin", () => {
    const result = computePopupPosition({
      anchor: { x: 0, y: 0 },
      popup: { width: 200, height: 200 },
      viewport: VP,
    })
    expect(result.x).toBe(8)
    expect(result.y).toBe(8)
  })

  test("pins to the top-left margin when the popup is bigger than the viewport", () => {
    const result = computePopupPosition({
      anchor: { x: 100, y: 100 },
      popup: { width: 2000, height: 2000 },
      viewport: VP,
    })
    expect(result).toEqual({ x: 8, y: 8, side: "bottom", align: "start" })
  })

  test("does not anchor side / align — they are constants for point anchors", () => {
    // Point anchors are conventionally context menus where the click
    // coordinate IS the position. Side / align flipping is meaningless
    // because there's no trigger rect to flip relative to.
    const result = computePopupPosition({
      anchor: { x: 50, y: 50 },
      popup: { width: 100, height: 100 },
      viewport: VP,
      side: "left",
      align: "end",
    })
    expect(result.side).toBe("bottom")
    expect(result.align).toBe("start")
  })
})

describe("computePopupPosition — rect anchor (filter popup)", () => {
  const trigger = { x: 200, y: 100, width: 32, height: 24 }

  test("default placement is below + start-aligned to the trigger", () => {
    const result = computePopupPosition({
      anchor: trigger,
      popup: { width: 320, height: 200 },
      viewport: VP,
    })
    expect(result.side).toBe("bottom")
    expect(result.align).toBe("start")
    // Below: y = trigger.y + trigger.height + sideOffset (4)
    expect(result.y).toBe(100 + 24 + 4)
    // Start-aligned: x = trigger.x
    expect(result.x).toBe(200)
  })

  test("flips to top when there's no room below the trigger", () => {
    const result = computePopupPosition({
      anchor: { x: 200, y: 700, width: 32, height: 24 },
      popup: { width: 320, height: 240 },
      viewport: VP,
    })
    expect(result.side).toBe("top")
    // Top: y = trigger.y - popup.height - sideOffset (4)
    expect(result.y).toBe(700 - 240 - 4)
  })

  test("falls back to requested side when neither fits (perpendicular clamp will catch it)", () => {
    // Trigger near the top edge, popup larger than the space above —
    // bottom doesn't fit either. Helper keeps the requested side; the
    // perpendicular-axis clamp doesn't apply here so the popup may
    // still extend off-screen. Documented invariant — callers can
    // detect this by checking `result.side === requestedSide` even
    // though the popup would overflow.
    const result = computePopupPosition({
      anchor: { x: 200, y: 0, width: 32, height: 16 },
      popup: { width: 320, height: 800 },
      viewport: VP,
      side: "bottom",
    })
    expect(result.side).toBe("bottom")
  })

  test("clamps the perpendicular axis when start-alignment overflows the right edge", () => {
    const result = computePopupPosition({
      anchor: { x: 1000, y: 100, width: 32, height: 24 },
      popup: { width: 320, height: 200 },
      viewport: VP,
      align: "start",
    })
    // Trigger.x = 1000 → start-aligned popup would land at x=1000 and
    // overflow the right edge. Clamp pushes it back to fit.
    expect(result.x).toBe(1024 - 320 - 8)
    // align is reported as the *requested* value — consumers can
    // detect the shift by comparing against the rendered position.
    expect(result.align).toBe("start")
  })

  test("places popup to the right of the trigger when side=right", () => {
    const result = computePopupPosition({
      anchor: trigger,
      popup: { width: 200, height: 200 },
      viewport: VP,
      side: "right",
    })
    expect(result.side).toBe("right")
    expect(result.x).toBe(200 + 32 + 4)
  })

  test("centers popup along the trigger axis when align=center", () => {
    const result = computePopupPosition({
      anchor: { x: 400, y: 100, width: 100, height: 32 },
      popup: { width: 200, height: 100 },
      viewport: VP,
      align: "center",
    })
    // center: x = trigger.x + trigger.width/2 - popup.width/2
    expect(result.x).toBe(400 + 50 - 100)
  })

  test("end-aligns popup to the trigger right edge when align=end", () => {
    const result = computePopupPosition({
      anchor: { x: 300, y: 100, width: 80, height: 32 },
      popup: { width: 200, height: 100 },
      viewport: VP,
      align: "end",
    })
    // end: x = trigger.x + trigger.width - popup.width
    expect(result.x).toBe(300 + 80 - 200)
  })

  test("respects custom sideOffset and viewportMargin", () => {
    const result = computePopupPosition({
      anchor: { x: 100, y: 100, width: 32, height: 32 },
      popup: { width: 200, height: 100 },
      viewport: VP,
      sideOffset: 12,
      viewportMargin: 16,
    })
    expect(result.y).toBe(100 + 32 + 12)
    expect(result.x).toBe(100)
  })
})

describe("computePopupPosition — SSR-style viewports", () => {
  test("works with a viewport derived from anchor + popup (no `window`)", () => {
    // Mirrors the callsite pattern used by `headerCells.tsx` when
    // `typeof window === "undefined"` — viewport is sized to fit the
    // popup so positioning still produces valid (x, y) without a real
    // window.
    const anchor = { x: 100, y: 200, width: 32, height: 24 }
    const popup = { width: 240, height: 200 }
    const viewport = {
      width: anchor.x + popup.width + 32,
      height: anchor.y + popup.height + 32 + 24,
    }
    const result = computePopupPosition({ anchor, popup, viewport })
    // Should still place below+start with the synthetic viewport.
    expect(result.side).toBe("bottom")
    expect(result.x).toBe(100)
    expect(result.y).toBe(200 + 24 + 4)
  })
})
