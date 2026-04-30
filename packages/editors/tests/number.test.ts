import { describe, expect, test } from "bun:test"
import { acceptNumericSeed } from "../src/number"

describe("acceptNumericSeed", () => {
  test("accepts every digit 0-9", () => {
    for (const digit of "0123456789") {
      expect(acceptNumericSeed(digit)).toBe(digit)
    }
  })

  test("accepts decimal separator characters", () => {
    expect(acceptNumericSeed(".")).toBe(".")
    expect(acceptNumericSeed(",")).toBe(",")
  })

  test("accepts the minus sign", () => {
    expect(acceptNumericSeed("-")).toBe("-")
  })

  test("rejects letters, spaces, punctuation, and symbols", () => {
    expect(acceptNumericSeed("a")).toBeUndefined()
    expect(acceptNumericSeed("Z")).toBeUndefined()
    expect(acceptNumericSeed(" ")).toBeUndefined()
    expect(acceptNumericSeed("/")).toBeUndefined()
    expect(acceptNumericSeed("$")).toBeUndefined()
    expect(acceptNumericSeed("+")).toBeUndefined()
    expect(acceptNumericSeed("=")).toBeUndefined()
  })

  test("rejects multi-character strings (the framework only seeds single keys)", () => {
    expect(acceptNumericSeed("12")).toBeUndefined()
    expect(acceptNumericSeed("-1")).toBeUndefined()
    expect(acceptNumericSeed(".5")).toBeUndefined()
  })

  test("returns undefined when seedKey is undefined or empty", () => {
    expect(acceptNumericSeed(undefined)).toBeUndefined()
    expect(acceptNumericSeed("")).toBeUndefined()
  })
})
