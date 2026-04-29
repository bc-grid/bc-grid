import { describe, expect, test } from "bun:test"
import { bcGridDensities, bcGridPreset } from "../src"

describe("@bc-grid/theming", () => {
  test("exports the three Q1 density modes", () => {
    expect(Object.keys(bcGridDensities)).toEqual(["compact", "normal", "comfortable"])
    expect(bcGridDensities.compact.rowHeight).toBe("28px")
    expect(bcGridDensities.normal.rowHeight).toBe("36px")
    expect(bcGridDensities.comfortable.rowHeight).toBe("44px")
  })

  test("tailwind preset maps to CSS variables", () => {
    const colors = bcGridPreset.theme.extend.colors as Record<string, Record<string, string>>
    expect(colors["bc-grid"]?.bg).toBe("var(--bc-grid-bg)")
    expect(colors["bc-grid"]?.["header-bg"]).toBe("var(--bc-grid-header-bg)")
  })
})
