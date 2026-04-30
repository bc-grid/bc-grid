import { describe, expect, test } from "bun:test"
import { resolveTextEditorSeed } from "../src/text"

describe("resolveTextEditorSeed", () => {
  test("seedKey wins when supplied (printable activation replaces content)", () => {
    expect(resolveTextEditorSeed("Existing", "Z")).toBe("Z")
    expect(resolveTextEditorSeed(42, "x")).toBe("x")
    expect(resolveTextEditorSeed(null, "a")).toBe("a")
    expect(resolveTextEditorSeed(undefined, "")).toBe("")
  })

  test("falls back to the existing string value when no seedKey", () => {
    expect(resolveTextEditorSeed("Hello", undefined)).toBe("Hello")
    expect(resolveTextEditorSeed("", undefined)).toBe("")
  })

  test("coerces non-string initialValue safely so the input renders", () => {
    expect(resolveTextEditorSeed(42, undefined)).toBe("42")
    expect(resolveTextEditorSeed(true, undefined)).toBe("true")
  })

  test("null / undefined initialValue with no seedKey yields empty string", () => {
    expect(resolveTextEditorSeed(null, undefined)).toBe("")
    expect(resolveTextEditorSeed(undefined, undefined)).toBe("")
  })
})
