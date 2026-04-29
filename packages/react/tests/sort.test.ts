import { describe, expect, test } from "bun:test"
import { defaultCompareValues, toggleSortFor } from "../src/sort"

describe("defaultCompareValues", () => {
  test("equal values return 0", () => {
    expect(defaultCompareValues(1, 1)).toBe(0)
    expect(defaultCompareValues("a", "a")).toBe(0)
    expect(defaultCompareValues(null, null)).toBe(0)
    expect(defaultCompareValues(undefined, undefined)).toBe(0)
  })

  test("null and undefined sort last regardless of the other side", () => {
    // Spec: "a == null" returns 1 → a goes after b. So null > anything.
    expect(defaultCompareValues(null, 1)).toBe(1)
    expect(defaultCompareValues(1, null)).toBe(-1)
    expect(defaultCompareValues(undefined, "anything")).toBe(1)
    expect(defaultCompareValues("anything", undefined)).toBe(-1)
  })

  test("numbers compare numerically", () => {
    expect(defaultCompareValues(1, 2)).toBeLessThan(0)
    expect(defaultCompareValues(2, 1)).toBeGreaterThan(0)
    expect(defaultCompareValues(-100, 100)).toBe(-200)
    expect(defaultCompareValues(0.1, 0.2)).toBeCloseTo(-0.1, 5)
  })

  test("Dates compare by epoch ms", () => {
    const earlier = new Date("2025-01-01")
    const later = new Date("2025-12-31")
    expect(defaultCompareValues(earlier, later)).toBeLessThan(0)
    expect(defaultCompareValues(later, earlier)).toBeGreaterThan(0)
  })

  test("booleans: false < true", () => {
    expect(defaultCompareValues(false, true)).toBeLessThan(0)
    expect(defaultCompareValues(true, false)).toBeGreaterThan(0)
    expect(defaultCompareValues(true, true)).toBe(0)
    expect(defaultCompareValues(false, false)).toBe(0)
  })

  test("strings use localeCompare", () => {
    expect(defaultCompareValues("apple", "banana")).toBeLessThan(0)
    expect(defaultCompareValues("banana", "apple")).toBeGreaterThan(0)
  })

  test("mixed types fall back to String.localeCompare", () => {
    // "1" vs "abc" — string compare
    const r = defaultCompareValues(1, "abc")
    expect(typeof r).toBe("number")
    // The pair must be antisymmetric.
    expect(Math.sign(defaultCompareValues(1, "abc"))).toBe(
      -Math.sign(defaultCompareValues("abc", 1)),
    )
  })

  test("a sorted array of mixed nullable numbers puts nulls last", () => {
    const xs: (number | null)[] = [3, null, 1, null, 2]
    xs.sort(defaultCompareValues)
    expect(xs).toEqual([1, 2, 3, null, null])
  })
})

describe("toggleSortFor", () => {
  test("first click on unsorted column → asc", () => {
    expect(toggleSortFor([], "name")).toEqual([{ columnId: "name", direction: "asc" }])
  })

  test("click on asc-sorted column → desc", () => {
    expect(toggleSortFor([{ columnId: "name", direction: "asc" }], "name")).toEqual([
      { columnId: "name", direction: "desc" },
    ])
  })

  test("click on desc-sorted column → cleared", () => {
    expect(toggleSortFor([{ columnId: "name", direction: "desc" }], "name")).toEqual([])
  })

  test("click on a different column replaces the sort (single-column v0.1)", () => {
    expect(toggleSortFor([{ columnId: "name", direction: "asc" }], "balance")).toEqual([
      { columnId: "balance", direction: "asc" },
    ])
  })

  test("the result is always a fresh array — caller can mutate without affecting input", () => {
    const input: readonly { columnId: string; direction: "asc" | "desc" }[] = [
      { columnId: "name", direction: "asc" },
    ]
    const result = toggleSortFor(input, "name")
    expect(result).not.toBe(input)
  })
})
