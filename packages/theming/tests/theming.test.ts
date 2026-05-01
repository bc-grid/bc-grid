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
    expect(colors["bc-grid"]?.["search-match-fg"]).toBe("var(--bc-grid-search-match-fg)")
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

  test("row focus / selection chrome keeps active and edit indicators distinct", () => {
    const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8")
    const ruleFor = (selector: string) => {
      const idx = css.indexOf(selector)
      expect(idx).toBeGreaterThan(-1)
      const ruleEnd = css.indexOf("}", idx)
      return css.slice(idx, ruleEnd)
    }

    const focusedRow = ruleFor('.bc-grid-row[data-bc-grid-focused-row="true"] .bc-grid-cell {')
    expect(focusedRow).toContain("var(--bc-grid-focus-ring) 7%")
    expect(focusedRow).toContain("var(--bc-grid-bg)")

    const selectedFocusedRow = ruleFor(
      '.bc-grid-row[aria-selected="true"][data-bc-grid-focused-row="true"] .bc-grid-cell {',
    )
    expect(selectedFocusedRow).toContain("var(--bc-grid-row-selected) 84%")
    expect(selectedFocusedRow).toContain("var(--bc-grid-focus-ring)")
    expect(selectedFocusedRow).toContain("color: var(--bc-grid-row-selected-fg)")

    const activeCell = ruleFor(
      '.bc-grid-cell:focus-visible,\n.bc-grid-cell[data-bc-grid-active-cell="true"],\n.bc-grid [data-bc-grid-active-cell="true"] {',
    )
    expect(activeCell).toContain("background: color-mix")
    expect(activeCell).toContain("var(--bc-grid-focus-ring) 8%")
    expect(activeCell).toContain("outline: 2px solid var(--bc-grid-focus-ring)")
    expect(activeCell).not.toContain("box-shadow")

    const selectedActiveCell = ruleFor(
      '.bc-grid-row[aria-selected="true"] .bc-grid-cell[data-bc-grid-active-cell="true"],',
    )
    expect(selectedActiveCell).toContain("var(--bc-grid-focus-ring) 12%")
    expect(selectedActiveCell).toContain("var(--bc-grid-row-selected)")
    expect(selectedActiveCell).toContain("color: var(--bc-grid-row-selected-fg)")
  })

  test("row state selector order preserves active focus and cell edit markers", () => {
    const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8")
    const idx = (selector: string) => {
      const value = css.indexOf(selector)
      expect(value).toBeGreaterThan(-1)
      return value
    }

    const base = idx(".bc-grid-row .bc-grid-cell {")
    const focused = idx('.bc-grid-row[data-bc-grid-focused-row="true"] .bc-grid-cell {')
    const hover = idx(".bc-grid-row:hover .bc-grid-cell {")
    const selected = idx('.bc-grid-row[aria-selected="true"] .bc-grid-cell,')
    const selectedHover = idx('.bc-grid-row[aria-selected="true"]:hover .bc-grid-cell {')
    const selectedFocused = idx(
      '.bc-grid-row[aria-selected="true"][data-bc-grid-focused-row="true"] .bc-grid-cell {',
    )
    const active = idx(".bc-grid-cell:focus-visible,")
    const selectedActive = idx(
      '.bc-grid-row[aria-selected="true"] .bc-grid-cell[data-bc-grid-active-cell="true"],',
    )
    const error = idx('.bc-grid-cell[aria-invalid="true"],')
    const dirty = idx('.bc-grid-cell[data-bc-grid-dirty="true"],')

    expect(base).toBeLessThan(focused)
    expect(focused).toBeLessThan(hover)
    expect(hover).toBeLessThan(selected)
    expect(selected).toBeLessThan(selectedHover)
    expect(selectedHover).toBeLessThan(selectedFocused)
    expect(selectedFocused).toBeLessThan(active)
    expect(active).toBeLessThan(selectedActive)
    expect(selectedActive).toBeLessThan(error)
    expect(error).toBeLessThan(dirty)
  })

  test("forced-colors mode preserves focused row and selected active-cell contrast", () => {
    const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8")
    const forcedStart = css.indexOf("@media (forced-colors: active)")
    expect(forcedStart).toBeGreaterThan(-1)
    const forced = css.slice(forcedStart)

    expect(forced).toContain('.bc-grid-row[data-bc-grid-focused-row="true"]')
    expect(forced).toContain("background: Canvas")
    expect(forced).toContain(
      '.bc-grid-row[aria-selected="true"] .bc-grid-cell[data-bc-grid-active-cell="true"]',
    )
    expect(forced).toContain("color: CanvasText")
    expect(forced).toContain("background: Highlight")
    expect(forced).toContain("color: HighlightText")
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

  test("pagination footer wrapper paints with bc-grid tokens (border-top + bg + fg + cell padding)", () => {
    // The grid renders `<div class="bc-grid-footer">` around the
    // pager + any custom footer. Pin the rule so a refactor that
    // accidentally drops the chrome surfaces here.
    const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8")
    const idx = css.indexOf(".bc-grid-footer {")
    expect(idx).toBeGreaterThan(-1)
    const ruleEnd = css.indexOf("}", idx)
    const rule = css.slice(idx, ruleEnd)
    expect(rule).toContain("border-top: 1px solid var(--bc-grid-border)")
    expect(rule).toContain("background: var(--bc-grid-bg)")
    expect(rule).toContain("color: var(--bc-grid-fg)")
    expect(rule).toContain("padding: 0.5rem var(--bc-grid-cell-padding-x)")
  })

  test("search highlight chrome stays quiet and inline", () => {
    const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8")

    expect(css).toContain(
      "--bc-grid-search-match-bg: color-mix(in srgb, var(--bc-grid-muted) 72%, transparent)",
    )
    expect(css).toContain("--bc-grid-search-match-fg: var(--bc-grid-fg)")

    const idx = css.indexOf('.bc-grid [data-bc-grid-search-match="true"] {')
    expect(idx).toBeGreaterThan(-1)
    const ruleEnd = css.indexOf("}", idx)
    const rule = css.slice(idx, ruleEnd)

    expect(rule).toContain("display: inline")
    expect(rule).toContain("box-decoration-break: clone")
    expect(rule).toContain("-webkit-box-decoration-break: clone")
    expect(rule).toContain("background: var(--bc-grid-search-match-bg)")
    expect(rule).toContain("color: var(--bc-grid-search-match-fg)")
    expect(rule).toContain("line-height: inherit")
    expect(rule).toContain("padding-block: 0")
    expect(rule).toContain("padding-inline: 0.0625em")
    expect(rule).not.toContain("display: inline-block")
    expect(rule).not.toContain("padding-block: 0.0625")
  })

  test("pagination button + select share a transition-colors declaration", () => {
    // Smooth hover / focus / disabled transitions match the
    // menu-item polish (slice 3.5). Pin the shared declaration
    // so the snap-cut behaviour can't silently come back.
    const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8")
    const idx = css.indexOf(".bc-grid-pagination-button,\n.bc-grid-pagination-size select")
    expect(idx).toBeGreaterThan(-1)
    const ruleEnd = css.indexOf("}", idx)
    const rule = css.slice(idx, ruleEnd)
    expect(rule).toContain("transition: background-color")
    expect(rule).toContain("var(--bc-grid-motion-duration-fast)")
    expect(rule).toContain("var(--bc-grid-motion-ease-standard)")
  })

  test("pagination button disabled uses cursor: default + pointer-events: none (matches shadcn DropdownMenu)", () => {
    // `cursor: not-allowed` was the legacy treatment; the rest of
    // the grid chrome uses `cursor: default` for disabled. Pin the
    // alignment so a future refactor doesn't accidentally fork the
    // disabled treatment again.
    const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8")
    const idx = css.indexOf(".bc-grid-pagination-button:disabled {")
    expect(idx).toBeGreaterThan(-1)
    const ruleEnd = css.indexOf("}", idx)
    const rule = css.slice(idx, ruleEnd)
    expect(rule).toContain("cursor: default")
    expect(rule).toContain("pointer-events: none")
    expect(rule).not.toContain("cursor: not-allowed")
  })

  test("pagination size <select> strips the platform chevron (appearance: none)", () => {
    // The CSS chevron `::after` rule below depends on the platform
    // chevron being suppressed. Pin both the appearance reset and
    // the prefixed `-webkit-appearance` for older Safari.
    const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8")
    const lastIdx = css.lastIndexOf(".bc-grid-pagination-size select {")
    expect(lastIdx).toBeGreaterThan(-1)
    const ruleEnd = css.indexOf("}", lastIdx)
    const rule = css.slice(lastIdx, ruleEnd)
    expect(rule).toContain("appearance: none")
    expect(rule).toContain("-webkit-appearance: none")
  })

  test("pagination size <select> wrapper paints a custom chevron via mask + currentColor token", () => {
    // The chevron `::after` is the load-bearing dark-mode hook —
    // it inherits `--bc-grid-muted-fg` from the wrapper so the
    // glyph adapts to light / dark / forced-colors automatically.
    // Pin both the mask-image and the muted-fg token.
    const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8")
    const idx = css.indexOf(".bc-grid-pagination-size-control::after {")
    expect(idx).toBeGreaterThan(-1)
    const ruleEnd = css.indexOf("}", idx)
    const rule = css.slice(idx, ruleEnd)
    expect(rule).toContain("background: var(--bc-grid-muted-fg)")
    expect(rule).toContain("mask-image:")
    expect(rule).toContain("pointer-events: none")
  })

  test("pagination button styling reads only bc-grid tokens (no direct shadcn-token reads)", () => {
    // The brief constraint: do not read Tailwind v3-style
    // `hsl(var(--…))` host tokens directly in chrome rules. Slice
    // the pagination CSS block and assert no `var(--background`,
    // `var(--input`, `var(--ring`, etc. direct reads.
    const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8")
    const idx = css.indexOf(".bc-grid-pagination {")
    expect(idx).toBeGreaterThan(-1)
    // Slice from the pagination block start to the next non-pagination
    // rule (`.bc-grid-status` is the next CSS section).
    const sectionEnd = css.indexOf(".bc-grid-status {", idx)
    expect(sectionEnd).toBeGreaterThan(idx)
    const block = css.slice(idx, sectionEnd)
    // Allowed bc-grid tokens (positive examples) — sanity check
    // the block actually consumes them.
    expect(block).toContain("var(--bc-grid-bg)")
    expect(block).toContain("var(--bc-grid-fg)")
    expect(block).toContain("var(--bc-grid-muted-fg)")
    expect(block).toContain("var(--bc-grid-input-border)")
    // Forbidden direct reads — the block must NOT bypass the bridge.
    // The mask-image data URL contains a hardcoded "%23000" stroke
    // colour for the SVG pattern; that's an SVG attribute, not a
    // CSS token read, so it's allowed (the painted colour comes from
    // `background: var(--bc-grid-muted-fg)`).
    expect(block).not.toMatch(/var\(--background[,)]/)
    expect(block).not.toMatch(/var\(--input[,)]/)
    expect(block).not.toMatch(/var\(--ring[,)]/)
    expect(block).not.toMatch(/var\(--accent[,)]/)
    expect(block).not.toMatch(/var\(--popover[,)]/)
    expect(block).not.toMatch(/var\(--foreground[,)]/)
    expect(block).not.toMatch(/var\(--muted-foreground[,)]/)
  })

  test("sidebar tool-panel controls consume `--bc-grid-input-border`", () => {
    // Sidebar panels render search inputs, pin/select dropdowns, and
    // inline filter editors inside a card-like surface. Keep their
    // control borders on the input token, not the surrounding panel
    // border token.
    const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8")
    const ruleFor = (selector: string) => {
      const idx = css.indexOf(selector)
      expect(idx).toBeGreaterThan(-1)
      const ruleEnd = css.indexOf("}", idx)
      return css.slice(idx, ruleEnd)
    }

    expect(ruleFor(".bc-grid-columns-panel-search-input,\n.bc-grid-columns-panel-pin {")).toContain(
      "border: 1px solid var(--bc-grid-input-border)",
    )
    expect(ruleFor(".bc-grid-pivot-panel-search-input,\n.bc-grid-pivot-panel-select {")).toContain(
      "border: 1px solid var(--bc-grid-input-border)",
    )
    expect(
      ruleFor(
        ".bc-grid-filters-panel .bc-grid-filter-input,\n.bc-grid-filters-panel .bc-grid-filter-select,\n.bc-grid-filters-panel .bc-grid-filter-set-button {",
      ),
    ).toContain("border-color: var(--bc-grid-input-border)")
  })

  test("sidebar tool-panel chrome exposes shadcn-style state and surface hooks", () => {
    const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8")
    const ruleFor = (selector: string) => {
      const idx = css.indexOf(selector)
      expect(idx).toBeGreaterThan(-1)
      const ruleEnd = css.indexOf("}", idx)
      return css.slice(idx, ruleEnd)
    }

    expect(ruleFor(".bc-grid-sidebar-tab:focus-visible {")).toContain(
      "outline: 2px solid var(--bc-grid-focus-ring)",
    )
    const selectedTab = ruleFor('.bc-grid-sidebar-tab[data-state="open"] {')
    expect(selectedTab).toContain("background: var(--bc-grid-accent-soft)")
    expect(selectedTab).toContain("box-shadow: inset 2px 0 0 var(--bc-grid-accent)")

    const header = ruleFor(".bc-grid-sidebar-panel-header {")
    expect(header).toContain("border-bottom: 1px solid var(--bc-grid-sidebar-border)")
    expect(header).toContain("min-height: 2rem")

    const emptyState = ruleFor(
      ".bc-grid-columns-panel-empty,\n.bc-grid-filters-panel-empty,\n.bc-grid-pivot-panel-empty {",
    )
    expect(emptyState).toContain("border: 1px dashed var(--bc-grid-border)")
    expect(emptyState).toContain("background: color-mix(in srgb, var(--bc-grid-muted) 42%")

    const disabledActions = ruleFor(".bc-grid-pivot-panel-button:disabled,")
    expect(disabledActions).toContain("color: var(--bc-grid-muted-fg)")
    expect(disabledActions).toContain("opacity: 0.55")
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

  test("editor surfaces expose shadcn-style token chrome", () => {
    const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8")
    const ruleFor = (selector: string) => {
      const idx = css.indexOf(selector)
      expect(idx).toBeGreaterThan(-1)
      const ruleEnd = css.indexOf("}", idx)
      return css.slice(idx, ruleEnd)
    }

    const input = ruleFor(".bc-grid-editor-input {")
    expect(input).toContain("border: 1px solid var(--bc-grid-input-border)")
    expect(input).toContain("background: var(--bc-grid-bg)")
    expect(input).toContain("border-radius: calc(var(--bc-grid-radius) - 2px)")
    expect(input).toContain("padding: 0 var(--bc-grid-cell-padding-x)")

    const focus = ruleFor(".bc-grid-editor-input:focus-visible {")
    expect(focus).toContain("border-color: var(--bc-grid-focus-ring)")
    expect(focus).toContain("box-shadow: 0 0 0 2px color-mix")

    const error = ruleFor('.bc-grid-editor-input[aria-invalid="true"],')
    expect(error).toContain("border-color: var(--bc-grid-invalid)")
    expect(error).toContain("var(--bc-grid-invalid) 18%")

    const pending = ruleFor('.bc-grid-editor-input[data-bc-grid-editor-state="pending"] {')
    expect(pending).toContain("var(--bc-grid-muted) 72%")
    expect(pending).toContain("color: var(--bc-grid-muted-fg)")
    expect(pending).toContain("cursor: progress")

    expect(ruleFor('.bc-grid-editor-input[data-bc-grid-editor-kind="number"] {')).toContain(
      "text-align: right",
    )
    expect(ruleFor(".bc-grid-editor-checkbox-shell {")).toContain("justify-content: center")
    expect(ruleFor(".bc-grid-editor-checkbox-control {")).toContain(
      "accent-color: var(--bc-grid-focus-ring)",
    )
    expect(ruleFor('.bc-grid-editor-portal[data-bc-grid-editor-state="pending"] {')).toContain(
      "cursor: progress",
    )
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
    expect(css).toContain("--bc-grid-column-resize-affordance-active")
    expect(css).toContain("box-sizing: border-box")
    expect(css).toContain("box-shadow: inset -1px 0 0 var(--bc-grid-column-separator)")
    expect(css).toContain(".bc-grid-header-cell-resizable .bc-grid-header-resize-handle::before")
    expect(css).toContain(".bc-grid-header-cell-resizable .bc-grid-header-resize-handle::after")
    expect(css).toContain(".bc-grid-header-resize-handle:hover::before")
    expect(css).toContain(".bc-grid-header-resize-handle:hover::after")
    expect(css).toContain("pointer-events: none")
    expect(css).not.toContain(".bc-grid-header-cell-resizable:hover .bc-grid-header-resize-handle")
    expect(css).not.toContain(
      ".bc-grid-header-cell-resizable:focus-within .bc-grid-header-resize-handle",
    )
    expect(css).not.toContain(".bc-grid-header-cell::after")
    expect(css).not.toContain(".bc-grid-header-cell-resizable::before")
  })

  test("header resize affordance avoids pinned-edge pseudo-element collisions", () => {
    const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8")

    expect(css).toContain(".bc-grid-cell-pinned-left-edge::after")
    expect(css).toContain(".bc-grid-cell-pinned-right-edge::before")
    expect(css).toContain(".bc-grid-header-cell {")
    expect(css).toContain(".bc-grid-header-resize-handle:hover::before")
    expect(css).toContain('.bc-grid-header-resize-handle[data-bc-grid-resizing="true"]::before')
    expect(css).toContain('.bc-grid-header-resize-handle[data-bc-grid-resizing="true"]::after')
    expect(css).toContain("--bc-grid-column-resize-affordance-active: Highlight")
    expect(css).toContain("border-inline-end: 1px solid var(--bc-grid-column-separator)")
    expect(css).toContain("background: none")
    expect(css).toContain("z-index: 5")
  })

  test("CSS exposes compact master-detail panel affordances", () => {
    const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8")

    expect(css).toContain("--bc-grid-detail-panel-bg")
    expect(css).toContain("--bc-grid-detail-surface-bg")
    expect(css).toContain("--bc-grid-detail-loading-bg")
    expect(css).toContain("--bc-grid-detail-loading-border")
    expect(css).toContain("--bc-grid-detail-loading-accent")
    expect(css).toContain(".bc-grid-row-expanded")
    expect(css).toContain(".bc-grid-detail-section")
    expect(css).toContain(".bc-grid-detail-section-header")
    expect(css).toContain(".bc-grid-detail-section-actions")
    expect(css).toContain(".bc-grid-detail-panel-region")
    expect(css).toContain("@keyframes bc-grid-detail-panel-content-in")
    expect(css).toContain(".bc-grid-detail-empty")
    expect(css).toContain(".bc-grid-detail-loading")
    expect(css).toContain(".bc-grid-detail-error")
    expect(css).toContain(".bc-grid-detail-state-title")
    expect(css).toContain(".bc-grid-detail-state-description")
    expect(css).toContain(".bc-grid-detail-state-actions")
    expect(css).toContain("@keyframes bc-grid-detail-loading-pulse")
    expect(css).toContain(".bc-grid-detail-nested-grid")
    expect(css).not.toContain("transition: height")
  })

  test("master-detail / group disclosure motion is icon-only (no text-glyph rotation, no height morph)", () => {
    // Brief: master/detail expansion must never scale text, morph
    // font size, or look like a 1990s height animation. The pre-
    // cleanup detail toggle drew its chevron from CSS pseudo-element
    // borders; the group toggle rotated a literal `&gt;` text glyph.
    // After the cleanup both toggles render an inline SVG vector
    // chevron, and CSS rotates that SVG via the parent's
    // `aria-expanded="true"` selector.
    const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8")

    // Both toggle icons exist and animate `transform` (the only
    // property allowed to transition on the disclosure path).
    expect(css).toMatch(
      /\.bc-grid-group-toggle-icon\s*\{[^}]*transition:\s*transform\s+var\(--bc-grid-motion-duration-fast\)/,
    )
    expect(css).toMatch(
      /\.bc-grid-detail-toggle-icon\s*\{[^}]*transition:\s*transform\s+var\(--bc-grid-motion-duration-fast\)/,
    )

    // The previous `::before` border-arrow construction is gone
    // from the detail toggle. SVG affordance replaces it.
    expect(css).not.toContain(".bc-grid-detail-toggle-icon::before")

    // Neither toggle transitions or animates font-size / height /
    // max-height — guards against a regression where someone wires
    // a 1990s "expand the row by morphing the height" animation.
    function ruleFor(selector: string): string {
      const start = css.indexOf(selector)
      if (start < 0) return ""
      const end = css.indexOf("}", start)
      return css.slice(start, end + 1)
    }
    for (const selector of [
      ".bc-grid-group-toggle ",
      ".bc-grid-group-toggle-icon ",
      ".bc-grid-detail-toggle ",
      ".bc-grid-detail-toggle-icon ",
      ".bc-grid-detail-panel ",
      ".bc-grid-detail-panel-region ",
      ".bc-grid-row-expanded ",
    ]) {
      const rule = ruleFor(selector)
      expect(rule).not.toMatch(/transition:[^;}]*\b(?:height|max-height|font-size|width)\b/)
      expect(rule).not.toMatch(/animation:[^;}]*\b(?:height|max-height|font-size)\b/)
      expect(rule).not.toMatch(/scale[XY]?\(/)
    }

    // The detail-panel content fade keyframe is translate-only —
    // no scale, no height interpolation — and the existing global
    // "CSS motion avoids text scaling" test enforces the no-scale
    // rule across the file. Pin the detail-panel keyframe shape
    // here too so future polish can't reintroduce a scale step.
    const keyframeStart = css.indexOf("@keyframes bc-grid-detail-panel-content-in")
    expect(keyframeStart).toBeGreaterThan(-1)
    const keyframeEnd = css.indexOf("}", css.indexOf("}", keyframeStart) + 1)
    const keyframe = css.slice(keyframeStart, keyframeEnd + 1)
    expect(keyframe).toContain("opacity: 0")
    expect(keyframe).toContain("opacity: 1")
    expect(keyframe).toMatch(/translateY\(/)
    expect(keyframe).not.toMatch(/scale[XY]?\(/)
    expect(keyframe).not.toMatch(/\bheight:/)
    expect(keyframe).not.toMatch(/\bmax-height:/)
    expect(keyframe).not.toMatch(/\bfont-size:/)
  })

  test("master/detail chrome polish — shadcn-ghost toggle, calm panel, expanded-row stripe", () => {
    // Polish-pass invariants from `master-detail-chrome-polish-v040`:
    // toggle is a clean ghost button (no border, real focus ring);
    // detail panel is calm (no inset highlight competing with the
    // master-row stripe); the expanded master row carries an inset
    // accent-soft stripe so it visually owns the panel below it.
    const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8")

    function ruleFor(selector: string): string {
      const start = css.indexOf(selector)
      if (start < 0) return ""
      const end = css.indexOf("}", start)
      return css.slice(start, end + 1)
    }

    // Toggle: shadcn-ghost — no border on idle, real focus ring on
    // keyboard focus. The previous rule used `border: 1px solid
    // transparent` paired with `border-color` change on hover and
    // `outline: none` on focus, which left keyboard users without a
    // visible focus indicator.
    const toggleRule = ruleFor(".bc-grid-detail-toggle ")
    expect(toggleRule).toMatch(/\bborder:\s*0\b/)
    expect(toggleRule).not.toMatch(/border:\s*1px\s+solid\s+transparent/)
    expect(toggleRule).not.toMatch(/border-color:/)

    // Hover doesn't flicker the border any more — only bg + colour
    // change.
    const toggleHoverRule = ruleFor(".bc-grid-detail-toggle:hover")
    expect(toggleHoverRule).not.toMatch(/border-color:/)

    // Focus-visible reinstates the standard outline ring shared with
    // the rest of the chrome.
    const toggleFocusRule = ruleFor(".bc-grid-detail-toggle:focus-visible")
    expect(toggleFocusRule).toMatch(/outline:\s*2px\s+solid\s+var\(--bc-grid-focus-ring\)/)
    expect(toggleFocusRule).toMatch(/outline-offset:/)

    // Detail panel: dropped the inset 1px highlight box-shadow that
    // competed with the new master-row stripe. Just border-top /
    // border-bottom + the muted-tinted bg.
    const panelRule = ruleFor(".bc-grid-detail-panel ")
    expect(panelRule).not.toMatch(/box-shadow:/)
    // Border-top + border-bottom remain the only visual separators.
    expect(panelRule).toMatch(/border-top:\s*1px\s+solid\s+var\(--bc-grid-border\)/)
    expect(panelRule).toMatch(/border-bottom:\s*1px\s+solid\s+var\(--bc-grid-border\)/)

    // Expanded master row picks up an inset accent-soft stripe so the
    // master row visually anchors the detail panel below it. Single-
    // axis box-shadow so it never shifts layout — same idiom as the
    // invalid-cell marker.
    const expandedRule = ruleFor(".bc-grid-row-expanded ")
    expect(expandedRule).toMatch(/box-shadow:\s*inset\s+3px\s+0\s+0\s+var\(--bc-grid-accent-soft\)/)

    // The selection-suppression sibling rule still fires for the
    // unselected-expanded combination so hover-bg doesn't leak after
    // expansion. Pin alongside the new stripe.
    expect(css).toContain('.bc-grid-row-expanded:not([aria-selected="true"])')
  })

  test("CSS motion avoids text scaling and layout-property transitions", () => {
    const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8")

    expect(css).not.toMatch(/scale[XY]?\(/)
    expect(css).not.toMatch(/transition:\s*(?:all|height|width|max-height)/)
    expect(css).toContain("animation: bc-grid-detail-panel-content-in")
    expect(css).toContain("transform: translateY(2px)")
    expect(css).not.toContain("bc-grid-row-expanded {\n  animation")
  })

  test("filter popup chrome — primary action + ghost clear + tokenised active dot", () => {
    // Pins the chrome-polish contract from `filter-popup-chrome-polish`
    // (slice 4 of the chrome polish umbrella). Apply uses the primary
    // (`--bc-grid-accent`) token; Clear is shadcn-ghost (transparent
    // border on idle, hover bg via `--bc-grid-row-hover`); the active
    // dot reads as "filter applied", not as a focus ring.
    const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8")

    // Apply primary tokens
    expect(css).toMatch(
      /\.bc-grid-filter-popup-apply\s*\{[^}]*background:\s*var\(--bc-grid-accent\)/,
    )
    expect(css).toMatch(/\.bc-grid-filter-popup-apply\s*\{[^}]*color:\s*var\(--bc-grid-accent-fg\)/)

    // Clear ghost — transparent border on idle + hover bg
    expect(css).toMatch(/\.bc-grid-filter-popup-clear\s*\{[^}]*border-color:\s*transparent/)
    expect(css).toMatch(
      /\.bc-grid-filter-popup-clear:hover:not\(:disabled\)\s*\{[^}]*background:\s*var\(--bc-grid-row-hover\)/,
    )

    // Active dot uses the accent token (not the focus ring) so it
    // reads as "filter applied" rather than "keyboard-focused widget".
    expect(css).toMatch(
      /\.bc-grid-filter-popup-active-dot\s*\{[^}]*background:\s*var\(--bc-grid-accent\)/,
    )
  })

  test("filter popup trigger surfaces a Radix-style data-state hook for the open state", () => {
    // Mirrors Radix PopoverTrigger — the `[data-state="open"]` selector
    // is how host CSS targets the trigger while its popup is up. Pins
    // the styles.css contract; the trigger React markup is exercised
    // by `packages/react/tests/headerCells.test.tsx`.
    const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8")
    expect(css).toMatch(/\.bc-grid-header-filter-button\[data-state="open"\]/)
  })

  test("filter popup opens with a translate-only fade animation gated by reduced-motion", () => {
    // Animation symmetry with the tooltip — open uses a small
    // translate + opacity transition; reduced-motion users get an
    // instant present.
    const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8")

    // The keyframe exists and uses opacity + translateY only (no
    // scale; pinned by the "CSS motion avoids text scaling" test
    // above, but locked here too against the specific keyframe).
    expect(css).toContain("@keyframes bc-grid-filter-popup-in")
    const keyframeStart = css.indexOf("@keyframes bc-grid-filter-popup-in")
    const keyframeEnd = css.indexOf("}", css.indexOf("}", keyframeStart) + 1)
    const keyframe = css.slice(keyframeStart, keyframeEnd + 1)
    expect(keyframe).toContain("opacity: 0")
    expect(keyframe).toContain("opacity: 1")
    expect(keyframe).toMatch(/translateY\(/)
    expect(keyframe).not.toMatch(/scale[XY]?\(/)

    // The data-state="open" rule applies the animation.
    expect(css).toMatch(
      /\.bc-grid-filter-popup\[data-state="open"\][^}]*animation:\s*bc-grid-filter-popup-in/,
    )

    // A reduced-motion override exists for the popup.
    expect(css).toMatch(
      /@media\s+\(prefers-reduced-motion:\s*reduce\)\s*\{[^}]*\.bc-grid-filter-popup\[data-state="open"\]\s*\{\s*animation:\s*none/,
    )
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
    expect(combined).toContain(".bc-grid-detail-panel-region")
    expect(combined).toContain("animation: none")
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
