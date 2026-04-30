import { describe, expect, test } from "bun:test"
import {
  DOUBLE_TAP_MAX_INTERVAL_MS,
  LONG_PRESS_DEFAULT_MS,
  LONG_PRESS_MOVE_TOLERANCE_PX,
  type PointerLikeEvent,
  type TimerHandle,
  type TimerScheduler,
  createLongPressTracker,
  isDoubleTap,
} from "../src/touch"

describe("isDoubleTap", () => {
  test("returns false when there is no previous tap", () => {
    expect(isDoubleTap({ rowId: "r1", columnId: "c1", time: 100 }, null)).toBe(false)
  })

  test("returns true when both taps land on the same cell within the window", () => {
    const previous = { rowId: "r1", columnId: "c1", time: 0 }
    const current = { rowId: "r1", columnId: "c1", time: 200 }
    expect(isDoubleTap(current, previous)).toBe(true)
  })

  test("returns false when the second tap is on a different column", () => {
    const previous = { rowId: "r1", columnId: "c1", time: 0 }
    const current = { rowId: "r1", columnId: "c2", time: 100 }
    expect(isDoubleTap(current, previous)).toBe(false)
  })

  test("returns false when the second tap is on a different row", () => {
    const previous = { rowId: "r1", columnId: "c1", time: 0 }
    const current = { rowId: "r2", columnId: "c1", time: 100 }
    expect(isDoubleTap(current, previous)).toBe(false)
  })

  test("returns false when the interval exceeds the default window", () => {
    const previous = { rowId: "r1", columnId: "c1", time: 0 }
    const current = { rowId: "r1", columnId: "c1", time: DOUBLE_TAP_MAX_INTERVAL_MS + 1 }
    expect(isDoubleTap(current, previous)).toBe(false)
  })

  test("at the exact window boundary the second tap does not count (strict less-than)", () => {
    const previous = { rowId: "r1", columnId: "c1", time: 0 }
    const current = { rowId: "r1", columnId: "c1", time: DOUBLE_TAP_MAX_INTERVAL_MS }
    expect(isDoubleTap(current, previous)).toBe(false)
  })

  test("respects a custom interval override", () => {
    const previous = { rowId: "r1", columnId: "c1", time: 0 }
    const current = { rowId: "r1", columnId: "c1", time: 80 }
    expect(isDoubleTap(current, previous, 50)).toBe(false)
    expect(isDoubleTap(current, previous, 100)).toBe(true)
  })

  test("a tap with a clock anomaly (negative interval) is not a double-tap", () => {
    const previous = { rowId: "r1", columnId: "c1", time: 500 }
    const current = { rowId: "r1", columnId: "c1", time: 100 }
    expect(isDoubleTap(current, previous)).toBe(false)
  })

  test("treats undefined columnId as same when both sides are absent", () => {
    const previous = { rowId: "r1", time: 0 }
    const current = { rowId: "r1", time: 100 }
    expect(isDoubleTap(current, previous)).toBe(true)
  })
})

interface CapturedTimer {
  handler: () => void
  delayMs: number
  cancelled: boolean
}

/**
 * Manual timer scheduler — the tests inject this so they can assert
 * timing behaviour without waiting on real time. Captures every queued
 * handler so individual tests can invoke or cancel them deterministically.
 */
function createCapturingScheduler(): {
  scheduler: TimerScheduler
  timers: CapturedTimer[]
} {
  const timers: CapturedTimer[] = []
  const scheduler: TimerScheduler = {
    setTimeout(handler, delayMs): TimerHandle {
      const timer: CapturedTimer = { handler, delayMs, cancelled: false }
      timers.push(timer)
      return timer
    },
    clearTimeout(handle): void {
      const timer = handle as CapturedTimer | null
      if (timer) timer.cancelled = true
    },
  }
  return { scheduler, timers }
}

function touchEvent(x = 0, y = 0): PointerLikeEvent {
  return { pointerType: "touch", clientX: x, clientY: y }
}

describe("createLongPressTracker", () => {
  test("fires onLongPress when the queued timer elapses on touch input", () => {
    const { scheduler, timers } = createCapturingScheduler()
    const events: PointerLikeEvent[] = []
    const tracker = createLongPressTracker({
      onLongPress: (event) => events.push(event),
      scheduler,
    })

    tracker.start(touchEvent(10, 10))
    expect(timers.length).toBe(1)
    expect(timers[0]?.delayMs).toBe(LONG_PRESS_DEFAULT_MS)
    expect(events.length).toBe(0)

    timers[0]?.handler()
    expect(events.length).toBe(1)
    expect(events[0]?.clientX).toBe(10)
  })

  test("does not arm for non-touch pointers (mouse / pen)", () => {
    const { scheduler, timers } = createCapturingScheduler()
    const tracker = createLongPressTracker({
      onLongPress: () => {},
      scheduler,
    })

    tracker.start({ pointerType: "mouse", clientX: 0, clientY: 0 })
    tracker.start({ pointerType: "pen", clientX: 0, clientY: 0 })

    expect(timers.length).toBe(0)
  })

  test("re-arming via subsequent start() cancels the prior timer", () => {
    const { scheduler, timers } = createCapturingScheduler()
    const tracker = createLongPressTracker({ onLongPress: () => {}, scheduler })

    tracker.start(touchEvent(0, 0))
    tracker.start(touchEvent(5, 5))

    expect(timers.length).toBe(2)
    expect(timers[0]?.cancelled).toBe(true)
    expect(timers[1]?.cancelled).toBe(false)
  })

  test("end() clears any pending long-press timer", () => {
    const { scheduler, timers } = createCapturingScheduler()
    const tracker = createLongPressTracker({ onLongPress: () => {}, scheduler })

    tracker.start(touchEvent(0, 0))
    tracker.end()

    expect(timers[0]?.cancelled).toBe(true)
  })

  test("move within tolerance keeps the timer armed; beyond tolerance cancels it", () => {
    const { scheduler, timers } = createCapturingScheduler()
    const tracker = createLongPressTracker({ onLongPress: () => {}, scheduler })

    tracker.start(touchEvent(0, 0))
    tracker.move(touchEvent(LONG_PRESS_MOVE_TOLERANCE_PX - 1, 0))
    expect(timers[0]?.cancelled).toBe(false)

    tracker.move(touchEvent(LONG_PRESS_MOVE_TOLERANCE_PX + 1, LONG_PRESS_MOVE_TOLERANCE_PX + 1))
    expect(timers[0]?.cancelled).toBe(true)
  })

  test("custom delayMs overrides the accessibility-rfc default", () => {
    const { scheduler, timers } = createCapturingScheduler()
    const tracker = createLongPressTracker({
      onLongPress: () => {},
      scheduler,
      delayMs: 800,
    })

    tracker.start(touchEvent(0, 0))
    expect(timers[0]?.delayMs).toBe(800)
  })

  test("custom moveTolerancePx overrides the default", () => {
    const { scheduler, timers } = createCapturingScheduler()
    const tracker = createLongPressTracker({
      onLongPress: () => {},
      scheduler,
      moveTolerancePx: 2,
    })

    tracker.start(touchEvent(0, 0))
    tracker.move(touchEvent(3, 0))
    expect(timers[0]?.cancelled).toBe(true)
  })

  test("move on an unarmed tracker is a no-op", () => {
    const { scheduler, timers } = createCapturingScheduler()
    const tracker = createLongPressTracker({ onLongPress: () => {}, scheduler })

    tracker.move(touchEvent(50, 50))
    expect(timers.length).toBe(0)
    // end() on an unarmed tracker is also safe.
    tracker.end()
  })
})
