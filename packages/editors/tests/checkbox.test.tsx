import { describe, expect, test } from "bun:test"
import { resolveCheckboxCheckedValue } from "../src/checkbox"

describe("resolveCheckboxCheckedValue", () => {
  test("checks only the boolean true value", () => {
    expect(resolveCheckboxCheckedValue(true)).toBe(true)
    expect(resolveCheckboxCheckedValue(false)).toBe(false)
    expect(resolveCheckboxCheckedValue(null)).toBe(false)
    expect(resolveCheckboxCheckedValue(undefined)).toBe(false)
    expect(resolveCheckboxCheckedValue("true")).toBe(false)
    expect(resolveCheckboxCheckedValue(1)).toBe(false)
  })
})
