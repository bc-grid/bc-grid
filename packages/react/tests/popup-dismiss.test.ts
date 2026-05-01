import { describe, expect, test } from "bun:test"
import { shouldDismissOnKey, shouldDismissOnOutsidePointer } from "../src/internal/popup-dismiss"

/**
 * Minimal target shim. The pure helper duck-types on `closest` so tests
 * can pass plain objects without instantiating real DOM.
 */
interface MockTarget {
  closest(selector: string): MockTarget | null
}

function makeTarget(matchers: Record<string, MockTarget | null> = {}): MockTarget {
  const target: MockTarget = {
    closest(selector: string) {
      // Self-matches one of the canned selectors? Return self.
      if (selector in matchers) return matchers[selector] ?? null
      return null
    },
  }
  return target
}

function makePopupRoot(...descendants: readonly MockTarget[]) {
  return {
    contains(node: unknown): boolean {
      return descendants.includes(node as MockTarget)
    },
  }
}

describe("shouldDismissOnOutsidePointer", () => {
  test("returns false when target is null", () => {
    expect(shouldDismissOnOutsidePointer(null, null, [])).toBe(false)
  })

  test("returns false when target has no `.closest` method (non-Element pointer source)", () => {
    // The Pointer Events spec doesn't preclude exotic non-Element targets;
    // be defensive — a non-Element pointer (window resize, etc.) shouldn't
    // dismiss a popup.
    const exotic = {} as EventTarget
    expect(shouldDismissOnOutsidePointer(exotic, null, [])).toBe(false)
  })

  test("returns false when the target is inside the popup root", () => {
    const child = makeTarget()
    const popup = makePopupRoot(child)
    expect(shouldDismissOnOutsidePointer(child as unknown as EventTarget, popup, [])).toBe(false)
  })

  test("returns false when the target matches an ignored selector (trigger button)", () => {
    const trigger = makeTarget({
      '[data-bc-grid-filter-button="true"]': makeTarget(),
    })
    expect(
      shouldDismissOnOutsidePointer(trigger as unknown as EventTarget, null, [
        '[data-bc-grid-filter-button="true"]',
      ]),
    ).toBe(false)
  })

  test("returns true for a target outside the popup with no ignore-selector match", () => {
    const outside = makeTarget()
    const popup = makePopupRoot()
    expect(
      shouldDismissOnOutsidePointer(outside as unknown as EventTarget, popup, [
        '[data-bc-grid-filter-button="true"]',
      ]),
    ).toBe(true)
  })

  test("checks the popup root containment first (before ignore selectors)", () => {
    // An element inside the popup that ALSO matches an ignore selector
    // should not dismiss — containment short-circuits.
    const child = makeTarget({ ".trigger": makeTarget() })
    const popup = makePopupRoot(child)
    expect(
      shouldDismissOnOutsidePointer(child as unknown as EventTarget, popup, [".trigger"]),
    ).toBe(false)
  })

  test("returns true when popup root is null and no ignore selectors match", () => {
    // Edge case: the popup hasn't mounted yet but listeners are attached
    // (a transient state during open animation). Outside pointer should
    // still dismiss.
    const outside = makeTarget()
    expect(shouldDismissOnOutsidePointer(outside as unknown as EventTarget, null, [])).toBe(true)
  })

  test("respects multiple ignore selectors", () => {
    const a = makeTarget({ ".trigger-a": makeTarget() })
    const b = makeTarget({ ".trigger-b": makeTarget() })
    const c = makeTarget()
    expect(
      shouldDismissOnOutsidePointer(a as unknown as EventTarget, null, [
        ".trigger-a",
        ".trigger-b",
      ]),
    ).toBe(false)
    expect(
      shouldDismissOnOutsidePointer(b as unknown as EventTarget, null, [
        ".trigger-a",
        ".trigger-b",
      ]),
    ).toBe(false)
    expect(
      shouldDismissOnOutsidePointer(c as unknown as EventTarget, null, [
        ".trigger-a",
        ".trigger-b",
      ]),
    ).toBe(true)
  })
})

describe("shouldDismissOnKey", () => {
  test("Escape dismisses", () => {
    expect(shouldDismissOnKey({ key: "Escape" })).toBe(true)
  })

  test("non-Escape keys do not dismiss", () => {
    for (const key of [
      "Enter",
      " ",
      "Tab",
      "ArrowDown",
      "ArrowUp",
      "ArrowLeft",
      "ArrowRight",
      "Home",
      "End",
      "PageUp",
      "PageDown",
      "F2",
      "a",
    ]) {
      expect(shouldDismissOnKey({ key })).toBe(false)
    }
  })
})
