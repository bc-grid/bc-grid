import { describe, expect, test } from "bun:test"
import { acceptNumericSeed, parseLocaleNumber } from "../src/number"

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

describe("parseLocaleNumber — locale-aware number parser (audit P1-W3-5)", () => {
  describe("en-US", () => {
    test("parses comma-grouped, dot-decimal numbers", () => {
      expect(parseLocaleNumber("1,234.56", "en-US")).toBe(1234.56)
      expect(parseLocaleNumber("1234.56", "en-US")).toBe(1234.56)
      expect(parseLocaleNumber("0.5", "en-US")).toBe(0.5)
    })

    test("strips currency symbols and whitespace", () => {
      expect(parseLocaleNumber("$1,234.56", "en-US")).toBe(1234.56)
      expect(parseLocaleNumber("  1,234.56 ", "en-US")).toBe(1234.56)
    })

    test("honours accounting-style negative parens", () => {
      expect(parseLocaleNumber("(1,234.56)", "en-US")).toBe(-1234.56)
      expect(parseLocaleNumber("($1,234.56)", "en-US")).toBe(-1234.56)
    })

    test("honours leading minus sign", () => {
      expect(parseLocaleNumber("-1,234.56", "en-US")).toBe(-1234.56)
    })
  })

  describe("de-DE (comma-decimal, dot-group)", () => {
    test("parses comma as the decimal separator (the headline gap)", () => {
      // The audit's exemplar: a German user types "1,5" and expects 1.5.
      // Without locale awareness this would parse as 15 or NaN.
      expect(parseLocaleNumber("1,5", "de-DE")).toBe(1.5)
      expect(parseLocaleNumber("1234,56", "de-DE")).toBe(1234.56)
    })

    test("parses dot as the group separator", () => {
      expect(parseLocaleNumber("1.234,56", "de-DE")).toBe(1234.56)
      expect(parseLocaleNumber("1.234.567,89", "de-DE")).toBe(1234567.89)
    })

    test("strips currency + accounting-negative", () => {
      expect(parseLocaleNumber("€1.234,56", "de-DE")).toBe(1234.56)
      expect(parseLocaleNumber("(1.234,56)", "de-DE")).toBe(-1234.56)
    })
  })

  describe("fr-FR (narrow no-break space group, comma-decimal)", () => {
    test("parses French-formatted numbers without losing the decimal", () => {
      // Intl uses U+202F (narrow no-break space) as the French group;
      // ASCII space variants don't appear, so this exercises the
      // non-ASCII group-strip path.
      expect(parseLocaleNumber("1 234,56", "fr-FR")).toBe(1234.56)
      expect(parseLocaleNumber("0,5", "fr-FR")).toBe(0.5)
    })
  })

  describe("ja-JP", () => {
    test("parses Japanese-formatted numbers (ASCII separators)", () => {
      // Japanese number formatting uses ASCII comma + dot like en-US,
      // so this is the lightest sanity check across non-Western locales.
      expect(parseLocaleNumber("1,234.56", "ja-JP")).toBe(1234.56)
    })
  })

  describe("graceful failure", () => {
    test("returns NaN for empty / whitespace-only input", () => {
      expect(parseLocaleNumber("", "en-US")).toBeNaN()
      expect(parseLocaleNumber("   ", "en-US")).toBeNaN()
    })

    test("returns NaN for unparseable input rather than throwing", () => {
      expect(parseLocaleNumber("abc", "en-US")).toBeNaN()
      expect(parseLocaleNumber("--", "en-US")).toBeNaN()
    })

    test("falls through to ASCII defaults when locale is unrecognised", () => {
      // Bogus BCP 47 — Intl falls back to en-US-equivalent. The parser
      // shouldn't throw; consumers passing a typo'd locale still get a
      // reasonable result.
      expect(parseLocaleNumber("1,234.56", "xx-INVALID")).toBe(1234.56)
    })

    test("defaults to en-US when no locale is supplied", () => {
      expect(parseLocaleNumber("1,234.56")).toBe(1234.56)
    })
  })
})
