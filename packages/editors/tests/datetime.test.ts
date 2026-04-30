import { describe, expect, test } from "bun:test"
import { normalizeDatetimeValue } from "../src/datetime"

describe("normalizeDatetimeValue", () => {
  test("preserves the local datetime prefix from UTC timestamp strings", () => {
    expect(normalizeDatetimeValue("2026-05-02T09:15:00.000Z")).toBe("2026-05-02T09:15")
  })

  test("preserves the local datetime prefix from offset timestamp strings", () => {
    expect(normalizeDatetimeValue("2026-05-02T09:15:30+11:00")).toBe("2026-05-02T09:15")
  })

  test("keeps already-normalized datetime-local strings unchanged", () => {
    expect(normalizeDatetimeValue("2026-05-02T09:15")).toBe("2026-05-02T09:15")
  })
})
