import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import {
  bcGridDensities,
  bcGridPreset,
  bcGridThemeVars,
  createBcGridThemeVars,
  getBcGridDensityClass,
  getBcGridDensityVars,
} from "../src"

describe("@bc-grid/theming", () => {
  test("exports the three Q1 density modes", () => {
    expect(Object.keys(bcGridDensities)).toEqual(["compact", "normal", "comfortable"])
    expect(bcGridDensities.compact.rowHeight).toBe("28px")
    expect(bcGridDensities.normal.rowHeight).toBe("36px")
    expect(bcGridDensities.comfortable.rowHeight).toBe("44px")
  })

  test("exports density helpers", () => {
    expect(getBcGridDensityClass("compact")).toBe("bc-grid--compact")
    expect(getBcGridDensityVars("comfortable")).toEqual({
      "--bc-grid-row-height": "44px",
      "--bc-grid-header-height": "48px",
      "--bc-grid-cell-padding-x": "16px",
      "--bc-grid-font-size": "0.9375rem",
    })
  })

  test("creates typed CSS variable override maps", () => {
    expect(bcGridThemeVars.focusRing).toBe("--bc-grid-focus-ring")
    expect(
      createBcGridThemeVars({
        "--bc-grid-bg": "Canvas",
        "--bc-grid-focus-ring": "Highlight",
      }),
    ).toEqual({
      "--bc-grid-bg": "Canvas",
      "--bc-grid-focus-ring": "Highlight",
    })
  })

  test("tailwind preset maps to CSS variables", () => {
    const colors = bcGridPreset.theme.extend.colors as Record<string, Record<string, string>>
    expect(colors["bc-grid"]?.bg).toBe("var(--bc-grid-bg)")
    expect(colors["bc-grid"]?.["header-bg"]).toBe("var(--bc-grid-header-bg)")
    expect(colors["bc-grid"]?.ring).toBe("var(--bc-grid-focus-ring)")
  })

  test("CSS includes accessibility media contracts", () => {
    const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8")
    expect(css).toContain("@media (prefers-reduced-motion: reduce)")
    expect(css).toContain("@media (forced-colors: active)")
    expect(css).toContain("--bc-grid-focus-ring: Highlight")
    expect(css).toContain('[data-bc-grid-active-cell="true"]')
  })

  test("CSS uses the kebab-case class convention from design.md", () => {
    const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8")
    expect(css).toContain(".bc-grid-row")
    expect(css).toContain(".bc-grid-cell")
    expect(css).toContain(".bc-grid-status-open")
    expect(css).not.toContain("bc-grid__")
  })

  test("package exports built CSS, not source CSS", () => {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
      exports: Record<string, unknown>
      files: string[]
    }
    expect(pkg.exports["./styles.css"]).toBe("./dist/styles.css")
    expect(pkg.files).toEqual(["dist"])
  })
})
