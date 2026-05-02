import { describe, expect, test } from "bun:test"
import { shouldHandleSearchHotkey } from "../src/gridInternals"

describe("search hotkey", () => {
  test("handles Cmd/Ctrl+F without Alt", () => {
    expect(shouldHandleSearchHotkey({ key: "f", ctrlKey: true })).toBe(true)
    expect(shouldHandleSearchHotkey({ key: "F", metaKey: true })).toBe(true)
    expect(shouldHandleSearchHotkey({ key: "f", ctrlKey: true, altKey: true })).toBe(false)
    expect(shouldHandleSearchHotkey({ key: "f", ctrlKey: true, shiftKey: true })).toBe(false)
    expect(shouldHandleSearchHotkey({ key: "f", metaKey: true, defaultPrevented: true })).toBe(
      false,
    )
  })

  test("ignores non-search shortcuts and editable targets", () => {
    expect(shouldHandleSearchHotkey({ key: "f" })).toBe(false)
    expect(shouldHandleSearchHotkey({ key: "g", ctrlKey: true })).toBe(false)
    expect(
      shouldHandleSearchHotkey({
        key: "f",
        metaKey: true,
        target: { tagName: "INPUT" } as unknown as EventTarget,
      }),
    ).toBe(false)
    expect(
      shouldHandleSearchHotkey({
        key: "f",
        ctrlKey: true,
        target: { isContentEditable: true } as unknown as EventTarget,
      }),
    ).toBe(false)
  })
})
