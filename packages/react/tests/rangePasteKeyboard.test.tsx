import { describe, expect, test } from "bun:test"
import { isRangePasteShortcut } from "../src/keyboard"

describe("range paste keyboard wiring", () => {
  test("recognises Ctrl/Cmd+V without treating other shortcuts as paste", () => {
    expect(isRangePasteShortcut({ key: "v", ctrlKey: true, metaKey: false })).toBe(true)
    expect(isRangePasteShortcut({ key: "V", ctrlKey: false, metaKey: true })).toBe(true)
    expect(isRangePasteShortcut({ key: "c", ctrlKey: true, metaKey: false })).toBe(false)
    expect(isRangePasteShortcut({ key: "v", ctrlKey: false, metaKey: false })).toBe(false)
  })
})
