import { describe, expect, test } from "bun:test"
import {
  COARSE_POINTER_HIT_TARGET_PX,
  DOUBLE_TAP_DEFAULT_THRESHOLD_MS,
  DOUBLE_TAP_MOVE_THRESHOLD_PX,
  LONG_PRESS_DEFAULT_THRESHOLD_MS,
  LONG_PRESS_MOVE_THRESHOLD_PX,
  isCoarsePointerType,
  isDoubleTap,
  shouldCancelLongPressOnMove,
} from "../src/touchInteraction"

describe("constants", () => {
  test("hit-target minimum is 44px (WCAG 2.5.5 / iOS HIG)", () => {
    expect(COARSE_POINTER_HIT_TARGET_PX).toBe(44)
  })

  test("long-press default threshold is 500ms (matches accessibility-rfc)", () => {
    expect(LONG_PRESS_DEFAULT_THRESHOLD_MS).toBe(500)
  })

  test("long-press move threshold is reasonable (≥8 / ≤16)", () => {
    // 10px aligns with iOS / Material tap-slop conventions; outside this
    // range either fires too easily or fights normal scrolling.
    expect(LONG_PRESS_MOVE_THRESHOLD_PX).toBeGreaterThanOrEqual(8)
    expect(LONG_PRESS_MOVE_THRESHOLD_PX).toBeLessThanOrEqual(16)
  })

  test("double-tap thresholds are reasonable", () => {
    expect(DOUBLE_TAP_DEFAULT_THRESHOLD_MS).toBe(300)
    expect(DOUBLE_TAP_MOVE_THRESHOLD_PX).toBeGreaterThanOrEqual(12)
  })
})

describe("isCoarsePointerType", () => {
  test("treats touch and pen as coarse", () => {
    expect(isCoarsePointerType("touch")).toBe(true)
    expect(isCoarsePointerType("pen")).toBe(true)
  })

  test("rejects mouse", () => {
    expect(isCoarsePointerType("mouse")).toBe(false)
  })

  test("rejects empty / unknown pointer types", () => {
    // Pointer Events spec allows browsers to emit '' for unknown types.
    expect(isCoarsePointerType("")).toBe(false)
    expect(isCoarsePointerType("keyboard")).toBe(false)
  })
})

describe("shouldCancelLongPressOnMove", () => {
  const start = { startX: 100, startY: 200 }

  test("does not cancel when pointer hasn't moved", () => {
    expect(shouldCancelLongPressOnMove(start, { x: 100, y: 200 })).toBe(false)
  })

  test("does not cancel within the slop threshold", () => {
    expect(shouldCancelLongPressOnMove(start, { x: 105, y: 205 })).toBe(false)
    expect(shouldCancelLongPressOnMove(start, { x: 110, y: 210 })).toBe(false)
  })

  test("cancels once movement exceeds the threshold on either axis", () => {
    expect(shouldCancelLongPressOnMove(start, { x: 111, y: 200 })).toBe(true)
    expect(shouldCancelLongPressOnMove(start, { x: 100, y: 211 })).toBe(true)
  })

  test("cancels symmetrically for negative movement", () => {
    expect(shouldCancelLongPressOnMove(start, { x: 89, y: 200 })).toBe(true)
    expect(shouldCancelLongPressOnMove(start, { x: 100, y: 189 })).toBe(true)
  })

  test("respects a custom move threshold", () => {
    expect(shouldCancelLongPressOnMove(start, { x: 105, y: 200 }, { movePxThreshold: 4 })).toBe(
      true,
    )
    expect(shouldCancelLongPressOnMove(start, { x: 103, y: 200 }, { movePxThreshold: 4 })).toBe(
      false,
    )
  })
})

describe("isDoubleTap", () => {
  test("returns false when there's no previous tap", () => {
    expect(isDoubleTap(null, { timeMs: 1000, x: 0, y: 0 })).toBe(false)
  })

  test("matches a quick second tap on roughly the same point", () => {
    expect(isDoubleTap({ timeMs: 1000, x: 100, y: 100 }, { timeMs: 1100, x: 102, y: 99 })).toBe(
      true,
    )
  })

  test("rejects when the second tap is too far away (different cell)", () => {
    expect(isDoubleTap({ timeMs: 1000, x: 100, y: 100 }, { timeMs: 1100, x: 200, y: 100 })).toBe(
      false,
    )
    expect(isDoubleTap({ timeMs: 1000, x: 100, y: 100 }, { timeMs: 1100, x: 100, y: 300 })).toBe(
      false,
    )
  })

  test("rejects when the second tap arrives after the threshold", () => {
    // 301ms apart with default 300ms threshold → not a double-tap (just
    // two separate single-taps).
    expect(isDoubleTap({ timeMs: 1000, x: 100, y: 100 }, { timeMs: 1301, x: 100, y: 100 })).toBe(
      false,
    )
  })

  test("rejects when next.timeMs goes backwards (clock-skew safety)", () => {
    // Defensive: performance.now() is monotonic per spec, but real-world
    // bug reports surface backwards-clock readings on some hardware.
    expect(isDoubleTap({ timeMs: 1000, x: 100, y: 100 }, { timeMs: 999, x: 100, y: 100 })).toBe(
      false,
    )
  })

  test("respects custom thresholds", () => {
    expect(
      isDoubleTap(
        { timeMs: 1000, x: 100, y: 100 },
        { timeMs: 1500, x: 100, y: 100 },
        { thresholdMs: 600 },
      ),
    ).toBe(true)
    expect(
      isDoubleTap(
        { timeMs: 1000, x: 100, y: 100 },
        { timeMs: 1100, x: 130, y: 100 },
        { movePxThreshold: 40 },
      ),
    ).toBe(true)
  })

  test("accepts taps exactly at the timing boundary", () => {
    // Inclusive boundary: dt === thresholdMs counts as a double-tap.
    expect(isDoubleTap({ timeMs: 1000, x: 100, y: 100 }, { timeMs: 1300, x: 100, y: 100 })).toBe(
      true,
    )
  })

  test("accepts taps exactly at the movement boundary", () => {
    // dx === movePxThreshold inclusive
    expect(
      isDoubleTap(
        { timeMs: 1000, x: 100, y: 100 },
        { timeMs: 1100, x: 100 + DOUBLE_TAP_MOVE_THRESHOLD_PX, y: 100 },
      ),
    ).toBe(true)
  })
})
