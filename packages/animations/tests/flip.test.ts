import { describe, expect, test } from "bun:test"
import {
  AnimationBudget,
  calculateFlipDelta,
  createFlashKeyframes,
  createFlipKeyframes,
  createSlideKeyframes,
  flash,
  flip,
  resolveMotionPolicy,
  shouldAnimateDelta,
  slide,
} from "../src"

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

    expect(keyframes[0]?.transform).toBe("translate3d(10px, -20px, 0)")
    expect(keyframes[1]?.transform).toBe("translate3d(0, 0, 0) scale(1, 1)")
    expectCompositorOnly(keyframes)
  })

  test("skips no-op deltas", () => {
    expect(shouldAnimateDelta({ x: 0, y: 0, scaleX: 1, scaleY: 1 })).toBe(false)
    expect(shouldAnimateDelta({ x: 0, y: 1, scaleX: 1, scaleY: 1 })).toBe(true)
  })

  test("builds flash and slide keyframes with transform and opacity only", () => {
    expect(createFlashKeyframes()).toEqual([{ opacity: 0.72 }, { opacity: 1 }])
    expect(createSlideKeyframes("up", 16)).toEqual([
      { transform: "translate3d(0, 16px, 0)", opacity: 0 },
      { transform: "translate3d(0, 0, 0)", opacity: 1 },
    ])
    expectCompositorOnly(createFlashKeyframes())
    expectCompositorOnly(createSlideKeyframes("left", 16))
  })
})

describe("AnimationBudget", () => {
  test("defaults to the production-safe 100 row cap", () => {
    const budget = new AnimationBudget()
    expect(budget.maxInFlight).toBe(100)
    expect(budget.hardMaxInFlight).toBe(200)
  })

  test("clamps requested budgets to the hard cap", () => {
    const budget = new AnimationBudget({ maxInFlight: 500 })
    expect(budget.maxInFlight).toBe(200)
  })

  test("tracks reserve and release", () => {
    const budget = new AnimationBudget({ maxInFlight: 2 })
    expect(budget.reserve()).toBe(true)
    expect(budget.reserve()).toBe(true)
    expect(budget.reserve()).toBe(false)
    expect(budget.inFlight).toBe(2)
    budget.release()
    expect(budget.inFlight).toBe(1)
  })
})

describe("animation primitives", () => {
  test("flip honors budget and releases when animations finish", async () => {
    const budget = new AnimationBudget({ maxInFlight: 1 })
    const first = { top: 0, left: 0, width: 100, height: 32 }
    const elements = [
      createFakeElement({ top: 40, left: 0, width: 100, height: 32 }),
      createFakeElement({ top: 80, left: 0, width: 100, height: 32 }),
    ]

    const animations = flip(
      elements.map((element) => ({ element, first })),
      { budget },
    )

    expect(animations.length).toBe(1)
    expect(budget.inFlight).toBe(1)
    await animations[0]?.finished
    await Promise.resolve()
    expect(budget.inFlight).toBe(0)
  })

  test("flip skips reduced motion", () => {
    const element = createFakeElement({ top: 40, left: 0, width: 100, height: 32 })
    const animations = flip([{ element, first: { top: 0, left: 0, width: 100, height: 32 } }], {
      motionPolicy: "reduced",
    })
    expect(animations).toEqual([])
  })

  test("flash and slide reserve from the budget", async () => {
    const budget = new AnimationBudget({ maxInFlight: 1 })
    const element = createFakeElement({ top: 0, left: 0, width: 100, height: 32 })

    const first = flash(element, { budget })
    const second = slide(element, "down", { budget })

    expect(first).not.toBeNull()
    expect(second).toBeNull()
    await first?.finished
    await Promise.resolve()
    expect(budget.inFlight).toBe(0)
  })

  test("resolveMotionPolicy respects explicit options", () => {
    expect(resolveMotionPolicy("normal")).toBe("normal")
    expect(resolveMotionPolicy("reduced")).toBe("reduced")
  })

  test("default primitive calls are still capped by the production budget", async () => {
    const elements = Array.from({ length: 101 }, () =>
      createFakeElement({ top: 0, left: 0, width: 100, height: 32 }),
    )

    const animations = elements.map((element) => flash(element))

    expect(animations.filter(Boolean)).toHaveLength(100)
    expect(animations.at(-1)).toBeNull()
    const started = animations.filter((animation): animation is Animation => animation != null)
    await Promise.all(started.map((animation) => animation.finished))
    await Promise.resolve()
  })

  test("explicit normal motion policy overrides a reduced media query", async () => {
    const restoreMatchMedia = mockMatchMedia(true)
    try {
      expect(resolveMotionPolicy()).toBe("reduced")
      const element = createFakeElement({ top: 40, left: 0, width: 100, height: 32 })
      const animations = flip([{ element, first: { top: 0, left: 0, width: 100, height: 32 } }], {
        motionPolicy: "normal",
      })

      expect(animations).toHaveLength(1)
      await animations[0]?.finished
    } finally {
      restoreMatchMedia()
    }
  })
})

function expectCompositorOnly(keyframes: Keyframe[]): void {
  for (const keyframe of keyframes) {
    for (const property of Object.keys(keyframe)) {
      expect(["opacity", "transform"]).toContain(property)
    }
  }
}

function mockMatchMedia(matches: boolean): () => void {
  const original = globalThis.matchMedia
  Object.defineProperty(globalThis, "matchMedia", {
    configurable: true,
    value: () => ({ matches }) as MediaQueryList,
  })
  return () => {
    Object.defineProperty(globalThis, "matchMedia", {
      configurable: true,
      value: original,
    })
  }
}

function createFakeElement(rect: DOMRectInit): HTMLElement {
  const animation: Animation = {
    finished: Promise.resolve(),
  } as Animation

  return {
    getBoundingClientRect: () =>
      ({
        x: rect.x ?? rect.left ?? 0,
        y: rect.y ?? rect.top ?? 0,
        top: rect.top ?? rect.y ?? 0,
        left: rect.left ?? rect.x ?? 0,
        width: rect.width ?? 0,
        height: rect.height ?? 0,
        right: (rect.left ?? rect.x ?? 0) + (rect.width ?? 0),
        bottom: (rect.top ?? rect.y ?? 0) + (rect.height ?? 0),
        toJSON: () => ({}),
      }) as DOMRect,
    animate: () => animation,
  } as unknown as HTMLElement
}
