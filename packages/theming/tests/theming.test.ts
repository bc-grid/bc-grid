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
    expect(bcGridThemeVars.accent).toBe("--bc-grid-accent")
    expect(bcGridThemeVars.contextMenuFg).toBe("--bc-grid-context-menu-fg")
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
    expect(colors["bc-grid"]?.accent).toBe("var(--bc-grid-accent)")
    expect(colors["bc-grid"]?.["context-menu-fg"]).toBe("var(--bc-grid-context-menu-fg)")
    expect(colors["bc-grid"]?.["search-match"]).toBe("var(--bc-grid-search-match-bg)")
  })

  test("CSS token bridge accepts Tailwind v4/shadcn full color tokens", () => {
    const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8")

    expect(css).toContain("--bc-grid-bg: var(--background, hsl(0 0% 100%))")
    expect(css).toContain("--bc-grid-focus-ring: var(--ring, hsl(221 83% 53%))")
    expect(css).toContain("--bc-grid-context-menu-fg: var(--popover-foreground, var(--bc-grid-fg))")
    expect(css).toContain("--bc-grid-row-hover: color-mix(")
    expect(css).not.toContain("hsl(var(")
  })

  test("token bridge consumes the full shadcn / Tailwind v4 surface set", () => {
    // Every shadcn token named in the v4 / shadcn-2025 colour contract
    // must be readable via a `--bc-grid-*` companion. Apps that already
    // expose these tokens at `:root` get a coherent grid for free; apps
    // that don't keep the slate fallbacks. Guarding the bridge here so
    // a future refactor can't silently drop a slot.
    const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8")

    expect(css).toContain("--bc-grid-bg: var(--background")
    expect(css).toContain("--bc-grid-fg: var(--foreground")
    expect(css).toContain("--bc-grid-card-bg: var(--card")
    expect(css).toContain("--bc-grid-card-fg: var(--card-foreground")
    expect(css).toContain("--bc-grid-border: var(--border")
    expect(css).toContain("--bc-grid-input-border: var(--input")
    expect(css).toContain("--bc-grid-muted: var(--muted")
    expect(css).toContain("--bc-grid-muted-fg: var(--muted-foreground")
    // `--accent` shows up multiple times (row-hover, row-selected, …) —
    // assert each row consumes it through the bridge declaration line.
    expect(css).toContain("--bc-grid-row-selected: var(--accent")
    expect(css).toContain("--bc-grid-row-selected-fg: var(--accent-foreground")
    expect(css).toContain("--bc-grid-focus-ring: var(--ring")
    expect(css).toContain("--bc-grid-invalid: var(--destructive")
    expect(css).toContain("--bc-grid-accent: var(--primary")
    expect(css).toContain("--bc-grid-context-menu-bg: var(--popover")
    expect(css).toContain("--bc-grid-context-menu-fg: var(--popover-foreground")
  })

  test("chrome surfaces consume `--bc-grid-*` only — shadcn tokens are bridged once at the root", () => {
    // Single-place-override invariant. Direct `var(--background)` /
    // `var(--popover)` / `var(--card)` / `var(--accent)` / `var(--ring)`
    // / `var(--primary)` / `var(--input)` / `var(--destructive)` calls
    // belong inside the grid root token-bridge block ONLY. Any chrome
    // selector below must consume the `--bc-grid-*` companion so apps
    // can override every grid surface from a single place. Without
    // this, a chrome rule could regress to reading shadcn tokens
    // directly and silently bypass user overrides.
    const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8")

    // Find the token-bridge block: the first `.bc-grid {` rule. Strip
    // it before scanning. The bridge declarations are the only place
    // shadcn tokens may be referenced.
    const bridgeStart = css.indexOf(".bc-grid {")
    expect(bridgeStart).toBeGreaterThanOrEqual(0)
    const bridgeEnd = css.indexOf("\n}", bridgeStart)
    expect(bridgeEnd).toBeGreaterThan(bridgeStart)
    const afterBridge = css.slice(bridgeEnd)

    // Each shadcn / Tailwind v4 token below must be absent from every
    // chrome rule. Comments inside the bridge cite these names but
    // those live in `cssBridge` — already excluded above.
    for (const token of [
      "var(--background",
      "var(--foreground",
      "var(--card,",
      "var(--card-foreground",
      "var(--popover,",
      "var(--popover-foreground",
      "var(--accent,",
      "var(--accent-foreground",
      "var(--primary,",
      "var(--primary-foreground",
      "var(--ring,",
      "var(--input,",
      "var(--destructive,",
      "var(--muted,",
      "var(--muted-foreground",
    ]) {
      expect(afterBridge).not.toContain(token)
    }
  })

  test("filter popup `Apply` button uses the primary token, not the row-selected accent", () => {
    // Restraint — Apply is a primary action, not a row-selected
    // surface. The two were the same colour pre-refactor (both bridged
    // `--accent`), but on hosts that distinguish `--primary` from
    // `--accent` the Apply button must follow the primary token so
    // it reads as a button, not as a row-state highlight.
    const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8")
    const idx = css.indexOf(".bc-grid-filter-popup-apply {")
    expect(idx).toBeGreaterThan(-1)
    // Take just this rule — the next `}` plus a newline closes it.
    const ruleEnd = css.indexOf("}", idx)
    const rule = css.slice(idx, ruleEnd)
    expect(rule).toContain("background: var(--bc-grid-accent)")
    expect(rule).toContain("color: var(--bc-grid-accent-fg)")
    expect(rule).not.toContain("var(--bc-grid-row-selected)")
  })

  test("master/detail inner sections bridge to the shadcn `--card` surface", () => {
    const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8")
    // The bridge is at the grid root; chrome consumes the bridged
    // `--bc-grid-card-bg` via the detail-surface companion.
    expect(css).toContain("--bc-grid-detail-surface-bg: var(--bc-grid-card-bg)")
    expect(css).toContain("--bc-grid-detail-surface-fg: var(--bc-grid-card-fg)")
  })

  test("sidebar panel surface bridges to the shadcn `--card` surface", () => {
    // Apps that expose `--card` get an elevated sidebar panel; the
    // fallback chain lands on `--bc-grid-bg` for visual parity.
    const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8")
    expect(css).toContain("--bc-grid-sidebar-bg: var(--bc-grid-card-bg)")
  })

  test("pagination size <select> consumes `--bc-grid-input-border` (not the generic border)", () => {
    // Distinguishes input-control borders from card borders so apps
    // that set `--input` separately get the right look on the size
    // dropdown.
    const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8")
    const idx = css.indexOf(".bc-grid-pagination-size select {")
    // Two `.bc-grid-pagination-size select {` rules exist (the shared
    // declaration and the input-border override). Locate the override
    // by searching after the first occurrence.
    const overrideIdx = css.indexOf(".bc-grid-pagination-size select {", idx + 1)
    expect(overrideIdx).toBeGreaterThan(-1)
    const ruleEnd = css.indexOf("}", overrideIdx)
    const rule = css.slice(overrideIdx, ruleEnd)
    expect(rule).toContain("border-color: var(--bc-grid-input-border)")
  })

  test("tooltip surface no longer chains shadcn fallbacks (single-source bridge)", () => {
    // Pre-refactor the tooltip carried triple-chained fallbacks like
    // `var(--bc-grid-context-menu-bg, var(--popover, var(--background, ...)))`.
    // After the bridge consolidation those are redundant — the bridge
    // already lands on a defined value. Guarding so a future refactor
    // can't reintroduce duplicate fallback chains.
    const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8")
    const idx = css.indexOf(".bc-grid-tooltip-content {")
    expect(idx).toBeGreaterThan(-1)
    const ruleEnd = css.indexOf("}", idx)
    const rule = css.slice(idx, ruleEnd)
    expect(rule).toContain("background: var(--bc-grid-context-menu-bg)")
    expect(rule).toContain("color: var(--bc-grid-context-menu-fg)")
    // No nested `var(--popover` fallback.
    expect(rule).not.toContain("var(--popover")
    expect(rule).not.toContain("var(--background")
    expect(rule).not.toContain("var(--foreground")
  })

  test("React and editor inline styles use bc-grid tokens instead of shadcn HSL channels", () => {
    const sources = [
      "../../react/src/headerCells.tsx",
      "../../react/src/editorPortal.tsx",
      "../../editors/src/autocomplete.tsx",
      "../../editors/src/date.tsx",
      "../../editors/src/datetime.tsx",
      "../../editors/src/multiSelect.tsx",
      "../../editors/src/number.tsx",
      "../../editors/src/select.tsx",
      "../../editors/src/text.tsx",
      "../../editors/src/time.tsx",
    ]

    for (const source of sources) {
      const text = readFileSync(new URL(source, import.meta.url), "utf8")
      expect(text).not.toContain("hsl(var(")
    }
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

  test("CSS exposes a token-based header resize affordance", () => {
    const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8")

    expect(css).toContain("--bc-grid-column-resize-affordance")
    expect(css).toContain("--bc-grid-column-resize-affordance-hover")
    expect(css).toContain(".bc-grid-header-cell-resizable::before")
    expect(css).toContain("pointer-events: none")
    expect(css).not.toContain(".bc-grid-header-resize-handle::before")
  })

  test("CSS exposes compact master-detail panel affordances", () => {
    const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8")

    expect(css).toContain("--bc-grid-detail-panel-bg")
    expect(css).toContain("--bc-grid-detail-surface-bg")
    expect(css).toContain(".bc-grid-row-expanded")
    expect(css).toContain(".bc-grid-detail-section")
    expect(css).toContain(".bc-grid-detail-empty")
    expect(css).toContain(".bc-grid-detail-loading")
    expect(css).toContain(".bc-grid-detail-error")
    expect(css).toContain(".bc-grid-detail-nested-grid")
    expect(css).not.toContain("transition: height")
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

  test("package exports built CSS, not source CSS", () => {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
      exports: Record<string, unknown>
      files: string[]
    }
    expect(pkg.exports["./styles.css"]).toBe("./dist/styles.css")
    expect(pkg.files).toEqual(["dist"])
  })
})
