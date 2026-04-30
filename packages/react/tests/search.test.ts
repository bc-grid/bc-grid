import { describe, expect, test } from "bun:test"
import { matchesSearchText, normaliseSearchText } from "../src/search"

describe("normaliseSearchText", () => {
  test("trims and lowercases search text", () => {
    expect(normaliseSearchText("  Invoice ACME  ")).toBe("invoice acme")
  })

  test("treats undefined as empty search text", () => {
    expect(normaliseSearchText(undefined)).toBe("")
  })
})

describe("matchesSearchText", () => {
  test("empty search text matches every row", () => {
    expect(matchesSearchText("", [])).toBe(true)
    expect(matchesSearchText("   ", ["Acme"])).toBe(true)
  })

  test("matches case-insensitive substrings across formatted values", () => {
    expect(matchesSearchText("acme $1,250", ["CUST-001", "Acme", "$1,250"])).toBe(true)
  })

  test("returns false when no formatted value contains the query", () => {
    expect(matchesSearchText("globex", ["CUST-001", "Acme", "$1,250"])).toBe(false)
  })
})
