import { describe, expect, test } from "bun:test"
import { calculateFlipDelta, createFlipKeyframes, shouldAnimateDelta } from "../src"

describe("@bc-grid/animations FLIP helpers", () => {
  test("calculates inverse translation from first and last rects", () => {
    const delta = calculateFlipDelta(
      { top: 120, left: 40, width: 200, height: 32 },
      { top: 48, left: 16, width: 200, height: 32 },
    )

    expect(delta).toEqual({ x: 24, y: 72, scaleX: 1, scaleY: 1 })
  })

  test("calculates scale when dimensions change", () => {
    const delta = calculateFlipDelta(
      { top: 0, left: 0, width: 200, height: 40 },
      { top: 0, left: 0, width: 100, height: 20 },
    )

    expect(delta.scaleX).toBe(2)
    expect(delta.scaleY).toBe(2)
  })

  test("builds transform-only keyframes", () => {
    const keyframes = createFlipKeyframes({ x: 10, y: -20, scaleX: 1, scaleY: 1 })

    expect(keyframes[0]?.transform).toBe("translate(10px, -20px)")
    expect(keyframes[1]?.transform).toBe("translate(0, 0) scale(1, 1)")
  })

  test("skips no-op deltas", () => {
    expect(shouldAnimateDelta({ x: 0, y: 0, scaleX: 1, scaleY: 1 })).toBe(false)
    expect(shouldAnimateDelta({ x: 0, y: 1, scaleX: 1, scaleY: 1 })).toBe(true)
  })
})
