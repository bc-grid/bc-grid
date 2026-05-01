import { describe, expect, test } from "bun:test"
import {
  decideRovingKey,
  firstEnabledIndex,
  lastEnabledIndex,
  nextEnabledIndex,
  nextMatchingIndex,
} from "../src/internal/use-roving-focus"

describe("nextEnabledIndex", () => {
  test("returns -1 for an empty list", () => {
    expect(nextEnabledIndex(0, 0, "next")).toBe(-1)
  })

  test("walks forward to the next enabled item", () => {
    expect(nextEnabledIndex(5, 0, "next")).toBe(1)
    expect(nextEnabledIndex(5, 2, "next")).toBe(3)
  })

  test("walks backward to the previous enabled item", () => {
    expect(nextEnabledIndex(5, 3, "prev")).toBe(2)
    expect(nextEnabledIndex(5, 0, "prev")).toBe(4)
  })

  test("loops by default (ArrowDown past last → first)", () => {
    expect(nextEnabledIndex(5, 4, "next")).toBe(0)
    expect(nextEnabledIndex(5, 0, "prev")).toBe(4)
  })

  test("does not loop when loop=false (stops at the end)", () => {
    expect(nextEnabledIndex(5, 4, "next", undefined, false)).toBe(4)
    expect(nextEnabledIndex(5, 0, "prev", undefined, false)).toBe(0)
  })

  test("skips disabled items in both directions", () => {
    // 0 enabled, 1 DISABLED, 2 enabled, 3 DISABLED, 4 enabled
    const enabled = (i: number) => i === 0 || i === 2 || i === 4
    expect(nextEnabledIndex(5, 0, "next", enabled)).toBe(2)
    expect(nextEnabledIndex(5, 2, "next", enabled)).toBe(4)
    expect(nextEnabledIndex(5, 4, "next", enabled)).toBe(0) // wrap
    expect(nextEnabledIndex(5, 4, "prev", enabled)).toBe(2)
    expect(nextEnabledIndex(5, 0, "prev", enabled)).toBe(4) // wrap
  })

  test("returns the only enabled index when there's nothing else to land on", () => {
    // Only index 2 is enabled; ArrowDown / Up from 2 stay at 2.
    const enabled = (i: number) => i === 2
    expect(nextEnabledIndex(5, 2, "next", enabled)).toBe(2)
    expect(nextEnabledIndex(5, 2, "prev", enabled)).toBe(2)
  })

  test("returns -1 when every item is disabled", () => {
    expect(nextEnabledIndex(5, 0, "next", () => false)).toBe(-1)
    expect(nextEnabledIndex(5, 0, "prev", () => false)).toBe(-1)
  })

  test("clamps a fromIndex outside the range before searching", () => {
    // Negative fromIndex → start at 0; out-of-range → start at last.
    expect(nextEnabledIndex(5, -1, "next")).toBe(1)
    expect(nextEnabledIndex(5, 10, "prev")).toBe(3)
  })
})

describe("firstEnabledIndex / lastEnabledIndex", () => {
  test("first = 0 when everything is enabled", () => {
    expect(firstEnabledIndex(5)).toBe(0)
  })

  test("last = itemCount - 1 when everything is enabled", () => {
    expect(lastEnabledIndex(5)).toBe(4)
  })

  test("skips leading / trailing disabled items", () => {
    const enabled = (i: number) => i >= 2 && i <= 3
    expect(firstEnabledIndex(5, enabled)).toBe(2)
    expect(lastEnabledIndex(5, enabled)).toBe(3)
  })

  test("returns -1 when nothing is enabled", () => {
    expect(firstEnabledIndex(5, () => false)).toBe(-1)
    expect(lastEnabledIndex(5, () => false)).toBe(-1)
  })

  test("returns -1 for an empty list", () => {
    expect(firstEnabledIndex(0)).toBe(-1)
    expect(lastEnabledIndex(0)).toBe(-1)
  })
})

describe("nextMatchingIndex (type-ahead)", () => {
  const items = ["Apple", "Banana", "Berry", "Cherry", "date"]
  const getLabel = (i: number) => items[i] ?? ""

  test("matches the first item starting with the query letter", () => {
    expect(nextMatchingIndex(items.length, -1, "B", getLabel)).toBe(1)
    expect(nextMatchingIndex(items.length, -1, "C", getLabel)).toBe(3)
  })

  test("advances to the NEXT matching item when called repeatedly from the previous match", () => {
    // From Apple (0), pressing 'B' lands on Banana (1).
    expect(nextMatchingIndex(items.length, 0, "B", getLabel)).toBe(1)
    // From Banana (1), pressing 'B' again lands on Berry (2).
    expect(nextMatchingIndex(items.length, 1, "B", getLabel)).toBe(2)
    // From Berry (2), pressing 'B' wraps back to Banana (1).
    expect(nextMatchingIndex(items.length, 2, "B", getLabel)).toBe(1)
  })

  test("is case-insensitive", () => {
    expect(nextMatchingIndex(items.length, -1, "d", getLabel)).toBe(4)
    expect(nextMatchingIndex(items.length, -1, "D", getLabel)).toBe(4)
  })

  test("returns -1 when no item matches", () => {
    expect(nextMatchingIndex(items.length, 0, "Z", getLabel)).toBe(-1)
  })

  test("returns -1 for an empty query", () => {
    expect(nextMatchingIndex(items.length, 0, "", getLabel)).toBe(-1)
  })

  test("skips disabled items", () => {
    // Disable Banana so 'B' from -1 lands on Berry directly.
    const enabled = (i: number) => i !== 1
    expect(nextMatchingIndex(items.length, -1, "B", getLabel, enabled)).toBe(2)
  })

  test("returns -1 when every matching item is disabled", () => {
    const enabled = (i: number) => !["Banana", "Berry"].includes(items[i] ?? "")
    expect(nextMatchingIndex(items.length, -1, "B", getLabel, enabled)).toBe(-1)
  })
})

describe("decideRovingKey", () => {
  const ctx = (overrides: Partial<Parameters<typeof decideRovingKey>[1]> = {}) => ({
    itemCount: 5,
    activeIndex: 2,
    isItemEnabled: (_: number) => true,
    loop: true,
    ...overrides,
  })

  test("ArrowDown / ArrowUp produce 'move' actions with the next enabled index", () => {
    expect(decideRovingKey({ key: "ArrowDown" }, ctx())).toEqual({ kind: "move", index: 3 })
    expect(decideRovingKey({ key: "ArrowUp" }, ctx())).toEqual({ kind: "move", index: 1 })
  })

  test("ArrowDown / ArrowUp at edge of non-looping list produces noop", () => {
    expect(decideRovingKey({ key: "ArrowDown" }, ctx({ activeIndex: 4, loop: false }))).toEqual({
      kind: "noop",
    })
    expect(decideRovingKey({ key: "ArrowUp" }, ctx({ activeIndex: 0, loop: false }))).toEqual({
      kind: "noop",
    })
  })

  test("Home / End jump to the first / last enabled index", () => {
    expect(decideRovingKey({ key: "Home" }, ctx({ activeIndex: 3 }))).toEqual({
      kind: "move",
      index: 0,
    })
    expect(decideRovingKey({ key: "End" }, ctx({ activeIndex: 1 }))).toEqual({
      kind: "move",
      index: 4,
    })
  })

  test("Home / End noop when active is already at the target", () => {
    expect(decideRovingKey({ key: "Home" }, ctx({ activeIndex: 0 }))).toEqual({ kind: "noop" })
    expect(decideRovingKey({ key: "End" }, ctx({ activeIndex: 4 }))).toEqual({ kind: "noop" })
  })

  test("Enter / Space activate the active item when enabled", () => {
    expect(decideRovingKey({ key: "Enter" }, ctx())).toEqual({ kind: "activate", index: 2 })
    expect(decideRovingKey({ key: " " }, ctx())).toEqual({ kind: "activate", index: 2 })
  })

  test("Enter on a disabled active item is a noop", () => {
    const onlyOddEnabled = (i: number) => i % 2 === 1
    expect(decideRovingKey({ key: "Enter" }, ctx({ isItemEnabled: onlyOddEnabled }))).toEqual({
      kind: "noop",
    })
  })

  test("Escape / Tab / Shift-Tab are noops (popup-dismiss / browser own them)", () => {
    expect(decideRovingKey({ key: "Escape" }, ctx())).toEqual({ kind: "noop" })
    expect(decideRovingKey({ key: "Tab" }, ctx())).toEqual({ kind: "noop" })
  })

  test("Modifier-bearing single keys do not trigger type-ahead", () => {
    const items = ["Apple", "Banana"]
    const cfg = ctx({
      itemCount: items.length,
      activeIndex: 0,
      getItemLabel: (i: number) => items[i] ?? "",
    })
    // Plain 'B' moves to Banana via type-ahead.
    expect(decideRovingKey({ key: "B" }, cfg)).toEqual({ kind: "move", index: 1 })
    // Ctrl+B is for the host app (or browser); roving-focus stays out.
    expect(decideRovingKey({ key: "B", ctrlKey: true }, cfg)).toEqual({ kind: "noop" })
    expect(decideRovingKey({ key: "B", metaKey: true }, cfg)).toEqual({ kind: "noop" })
    expect(decideRovingKey({ key: "B", altKey: true }, cfg)).toEqual({ kind: "noop" })
  })

  test("Type-ahead is opt-in — without `getItemLabel`, single keys are noops", () => {
    expect(decideRovingKey({ key: "B" }, ctx())).toEqual({ kind: "noop" })
  })

  test("Empty list → every key is a noop", () => {
    expect(decideRovingKey({ key: "ArrowDown" }, ctx({ itemCount: 0 }))).toEqual({ kind: "noop" })
    expect(decideRovingKey({ key: "Home" }, ctx({ itemCount: 0 }))).toEqual({ kind: "noop" })
    expect(decideRovingKey({ key: "Enter" }, ctx({ itemCount: 0 }))).toEqual({ kind: "noop" })
  })
})
