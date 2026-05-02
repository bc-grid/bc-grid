import { describe, expect, test } from "bun:test"
import { findOptionIndexByValue, selectedIndicesFromValues } from "../src/internal/combobox"

const STATUS_OPTIONS = [
  { value: "open", label: "Open" },
  { value: "in-progress", label: "In progress" },
  { value: "closed", label: "Closed" },
  { value: 3, label: "Escalated" },
] as const

describe("findOptionIndexByValue", () => {
  test("locates options by exact typed value", () => {
    expect(findOptionIndexByValue(STATUS_OPTIONS, "open")).toBe(0)
    expect(findOptionIndexByValue(STATUS_OPTIONS, "closed")).toBe(2)
  })

  test("string-coerces typed values so non-string options resolve cleanly", () => {
    // 3 is the typed value for "Escalated"; the option-value lookup
    // walks via `editorOptionToString` so consumer-supplied numbers /
    // booleans / objects round-trip without surprise.
    expect(findOptionIndexByValue(STATUS_OPTIONS, 3)).toBe(3)
    expect(findOptionIndexByValue(STATUS_OPTIONS, "3")).toBe(3)
  })

  test("returns -1 for nullish or unknown targets", () => {
    expect(findOptionIndexByValue(STATUS_OPTIONS, null)).toBe(-1)
    expect(findOptionIndexByValue(STATUS_OPTIONS, undefined)).toBe(-1)
    expect(findOptionIndexByValue(STATUS_OPTIONS, "missing")).toBe(-1)
  })
})

describe("selectedIndicesFromValues (multi-select resolver)", () => {
  test("maps every value present in options to its index", () => {
    expect(selectedIndicesFromValues(STATUS_OPTIONS, ["open", "closed"])).toEqual([0, 2])
  })

  test("preserves caller order, not option order", () => {
    // Multi-select trigger renders chips in option order downstream;
    // the resolver is order-preserving so consumers can drive the
    // initial selection from a server-sent array without reshuffling.
    expect(selectedIndicesFromValues(STATUS_OPTIONS, ["closed", "open"])).toEqual([2, 0])
  })

  test("silently drops values not in the options list (matches v0.1 behaviour)", () => {
    // The v0.1 native `<select multiple>` shell silently dropped
    // missing values. The Combobox primitive preserves that contract
    // so the upgrade is non-breaking for consumer rows that carry
    // legacy / migrated values.
    expect(selectedIndicesFromValues(STATUS_OPTIONS, ["open", "removed-value", "closed"])).toEqual([
      0, 2,
    ])
  })

  test("handles an empty values array as no selection", () => {
    expect(selectedIndicesFromValues(STATUS_OPTIONS, [])).toEqual([])
  })

  test("drops nullish entries without throwing", () => {
    expect(selectedIndicesFromValues(STATUS_OPTIONS, [null, "open", undefined])).toEqual([0])
  })
})
