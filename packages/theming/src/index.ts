export const bcGridDensities = {
  compact: {
    rowHeight: "28px",
    headerHeight: "34px",
    cellPaddingX: "8px",
  },
  normal: {
    rowHeight: "36px",
    headerHeight: "40px",
    cellPaddingX: "12px",
  },
  comfortable: {
    rowHeight: "44px",
    headerHeight: "48px",
    cellPaddingX: "16px",
  },
} as const

export type BcGridDensity = keyof typeof bcGridDensities

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
          "header-bg": "var(--bc-grid-header-bg)",
          "header-fg": "var(--bc-grid-header-fg)",
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
    },
  },
} satisfies TailwindPreset
