export const bcGridDensities = {
  compact: {
    rowHeight: "28px",
    headerHeight: "34px",
    cellPaddingX: "8px",
    fontSize: "0.8125rem",
  },
  normal: {
    rowHeight: "36px",
    headerHeight: "40px",
    cellPaddingX: "12px",
    fontSize: "0.875rem",
  },
  comfortable: {
    rowHeight: "44px",
    headerHeight: "48px",
    cellPaddingX: "16px",
    fontSize: "0.9375rem",
  },
} as const

export type BcGridDensity = keyof typeof bcGridDensities

export type BcGridCssVar = `--bc-grid-${string}`
export type BcGridCssVars = Partial<Record<BcGridCssVar, string>>

export const bcGridDensityClasses = {
  compact: "bc-grid--compact",
  normal: "bc-grid--normal",
  comfortable: "bc-grid--comfortable",
} as const satisfies Record<BcGridDensity, string>

export const bcGridThemeVars = {
  bg: "--bc-grid-bg",
  fg: "--bc-grid-fg",
  border: "--bc-grid-border",
  muted: "--bc-grid-muted",
  mutedFg: "--bc-grid-muted-fg",
  rowHover: "--bc-grid-row-hover",
  rowSelected: "--bc-grid-row-selected",
  rowSelectedFg: "--bc-grid-row-selected-fg",
  headerBg: "--bc-grid-header-bg",
  headerFg: "--bc-grid-header-fg",
  focusRing: "--bc-grid-focus-ring",
  invalid: "--bc-grid-invalid",
  dirty: "--bc-grid-dirty",
  searchMatchBg: "--bc-grid-search-match-bg",
  searchMatchFg: "--bc-grid-search-match-fg",
  rowHeight: "--bc-grid-row-height",
  headerHeight: "--bc-grid-header-height",
  cellPaddingX: "--bc-grid-cell-padding-x",
  radius: "--bc-grid-radius",
  fontSize: "--bc-grid-font-size",
  headerFontSize: "--bc-grid-header-font-size",
} as const satisfies Record<string, BcGridCssVar>

export function getBcGridDensityClass(density: BcGridDensity): string {
  return bcGridDensityClasses[density]
}

export function getBcGridDensityVars(density: BcGridDensity): BcGridCssVars {
  const tokens = bcGridDensities[density]
  return {
    "--bc-grid-row-height": tokens.rowHeight,
    "--bc-grid-header-height": tokens.headerHeight,
    "--bc-grid-cell-padding-x": tokens.cellPaddingX,
    "--bc-grid-font-size": tokens.fontSize,
  }
}

/** Type-only helper for authoring checked bc-grid CSS variable override maps. */
export function createBcGridThemeVars(vars: BcGridCssVars): BcGridCssVars {
  return { ...vars }
}

type TailwindPreset = {
  theme: {
    extend: Record<string, unknown>
  }
}

export const bcGridPreset = {
  theme: {
    extend: {
      colors: {
        "bc-grid": {
          bg: "var(--bc-grid-bg)",
          fg: "var(--bc-grid-fg)",
          border: "var(--bc-grid-border)",
          muted: "var(--bc-grid-muted)",
          "muted-fg": "var(--bc-grid-muted-fg)",
          hover: "var(--bc-grid-row-hover)",
          selected: "var(--bc-grid-row-selected)",
          "selected-fg": "var(--bc-grid-row-selected-fg)",
          "header-bg": "var(--bc-grid-header-bg)",
          "header-fg": "var(--bc-grid-header-fg)",
          ring: "var(--bc-grid-focus-ring)",
          invalid: "var(--bc-grid-invalid)",
          dirty: "var(--bc-grid-dirty)",
          "search-match": "var(--bc-grid-search-match-bg)",
          "search-match-fg": "var(--bc-grid-search-match-fg)",
        },
      },
      borderRadius: {
        "bc-grid": "var(--bc-grid-radius)",
      },
      height: {
        "bc-grid-row": "var(--bc-grid-row-height)",
        "bc-grid-header": "var(--bc-grid-header-height)",
      },
      spacing: {
        "bc-grid-cell-x": "var(--bc-grid-cell-padding-x)",
      },
      fontSize: {
        "bc-grid": "var(--bc-grid-font-size)",
        "bc-grid-header": "var(--bc-grid-header-font-size)",
      },
    },
  },
} satisfies TailwindPreset
