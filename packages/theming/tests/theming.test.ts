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
    expect(bcGridThemeVars.searchMatchBg).toBe("--bc-grid-search-match-bg")
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
    expect(colors["bc-grid"]?.["search-match"]).toBe("var(--bc-grid-search-match-bg)")
  })

  test("CSS includes accessibility media contracts", () => {
    const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8")
    expect(css).toContain("@media (prefers-reduced-motion: reduce)")
    expect(css).toContain("@media (forced-colors: active)")
    expect(css).toContain("--bc-grid-motion-duration-fast: 120ms")
    expect(css).toContain(
      "transition: transform var(--bc-grid-motion-duration-fast) var(--bc-grid-motion-ease-standard)",
    )
    expect(css).toContain("--bc-grid-focus-ring: Highlight")
    expect(css).toContain("--bc-grid-search-match-bg: Highlight")
    expect(css).toContain('[data-bc-grid-active-cell="true"]')
  })

  test("prefers-reduced-motion block zeroes out motion per accessibility-rfc §Reduced Motion", () => {
    const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8")
    // Locate the last reduced-motion block (the catch-all override) and
    // assert the three properties the RFC names: transition-duration,
    // animation-duration, scroll-behavior.
    const blocks = css.split("@media (prefers-reduced-motion: reduce)")
    // Splitting on the at-rule gives [before, body1, body2, ...] — at
    // least one body block must zero each of the three properties.
    const bodies = blocks.slice(1)
    expect(bodies.length).toBeGreaterThan(0)
    const combined = bodies.join("\n")
    expect(combined).toContain("transition-duration: 0s")
    expect(combined).toContain("animation-duration: 0s")
    expect(combined).toContain("scroll-behavior: auto")
  })

  test("forced-colors block maps to system colors per accessibility-rfc §Forced Colors", () => {
    const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8")
    const idx = css.indexOf("@media (forced-colors: active)")
    expect(idx).toBeGreaterThan(-1)
    // Take everything after the at-rule for assertion purposes; the
    // RFC's "Minimum forced-colors CSS contract" names these tokens.
    const body = css.slice(idx)
    expect(body).toContain("Canvas")
    expect(body).toContain("CanvasText")
    expect(body).toContain("Highlight")
    expect(body).toContain("HighlightText")
    // Active cell uses a real outline (not box-shadow) per the RFC's
    // "Focus indicators use real outlines, not box shadows".
    expect(body).toMatch(/outline:\s*2px\s+solid\s+Highlight/)
    expect(body).toContain("outline-offset: -2px")
  })

  test("pointer: coarse block sets a 44px hit-target minimum per accessibility-rfc §Pointer and Touch Fallback", () => {
    const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8")
    const idx = css.indexOf("@media (pointer: coarse)")
    expect(idx).toBeGreaterThan(-1)
    const body = css.slice(idx)
    // Either the literal 44px or the var that's set to 44px in the same block.
    expect(body).toContain("44px")
    expect(body).toMatch(/min-width:\s*var\(--bc-grid-hit-target-min\)/)
    expect(body).toMatch(/min-height:\s*var\(--bc-grid-hit-target-min\)/)
  })

  test("CSS uses the kebab-case class convention from design.md", () => {
    const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8")
    expect(css).toContain(".bc-grid-row")
    expect(css).toContain(".bc-grid-cell")
    expect(css).toContain(".bc-grid-status-open")
    expect(css).not.toContain("bc-grid__")
  })

  test("CSS includes the visual-only fill handle contract", () => {
    const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8")

    expect(css).toContain("--bc-grid-fill-handle-size: 8px")
    expect(css).toContain(".bc-grid-fill-handle")
    expect(css).toContain("pointer-events: none")
    expect(css).toContain("background: var(--bc-grid-focus-ring)")
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
