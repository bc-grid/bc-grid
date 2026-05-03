import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

/**
 * Tests for `row-state-cascade-scoping-rfc.md` — bsncraft v0.5.0-
 * alpha.2 P0 #2. The bug: master `.bc-grid-row:hover` cascades into
 * nested grid cells via descendant selectors. The fix: each affected
 * row-state rule gates with `:not(.bc-grid-detail-panel .bc-grid-row)`
 * (row-level) or `:not(.bc-grid-detail-panel .bc-grid-cell)` (cell-
 * level) or `:not(.bc-grid-detail-panel .bc-grid-cell-pinned-{left,right})`
 * (pinned cells).
 *
 * The repo's test runner is bun:test with no DOM, so this is a
 * source-shape regression suite over `packages/theming/src/styles.css`.
 * Behavioural correctness (a hover on the master row leaves nested
 * cells untouched) is covered by the coordinator-run Playwright spec
 * at `apps/examples/tests/nested-grid-row-state-cascade-scoping.pw.ts`.
 */

const themingSource = readFileSync(
  fileURLToPath(new URL("../src/styles.css", import.meta.url)),
  "utf8",
)

describe("row-level state rules — gated with :not(.bc-grid-detail-panel .bc-grid-row)", () => {
  // Five row-level rules per RFC §4 inventory (lines 243, 247, 251,
  // 256, 260 pre-fix). Each rule gates the `.bc-grid-row` selector
  // itself — so a nested `.bc-grid-row` inside a `.bc-grid-detail-
  // panel` does NOT take the master row's :hover / [aria-selected] /
  // [data-bc-grid-focused-row] background.
  test("hover", () => {
    expect(themingSource).toMatch(
      /\.bc-grid-row:hover:not\(\.bc-grid-detail-panel \.bc-grid-row\)\s*\{/,
    )
  })

  test("data-bc-grid-focused-row", () => {
    expect(themingSource).toMatch(
      /\.bc-grid-row\[data-bc-grid-focused-row="true"\]:not\(\.bc-grid-detail-panel \.bc-grid-row\)\s*\{/,
    )
  })

  test("aria-selected", () => {
    expect(themingSource).toMatch(
      /\.bc-grid-row\[aria-selected="true"\]:not\(\.bc-grid-detail-panel \.bc-grid-row\)\s*\{/,
    )
  })

  test("aria-selected + hover", () => {
    expect(themingSource).toMatch(
      /\.bc-grid-row\[aria-selected="true"\]:hover:not\(\.bc-grid-detail-panel \.bc-grid-row\)\s*\{/,
    )
  })

  test("aria-selected + data-bc-grid-focused-row", () => {
    expect(themingSource).toMatch(
      /\.bc-grid-row\[aria-selected="true"\]\[data-bc-grid-focused-row="true"\]:not\(\s*\.bc-grid-detail-panel \.bc-grid-row\s*\)\s*\{/,
    )
  })
})

describe("row + cell rules — cell-side gate :not(.bc-grid-detail-panel .bc-grid-cell)", () => {
  // Six row+cell rules per RFC §4 inventory (lines 824, 828, 832,
  // 838, 842, 869 pre-fix). The cell-side gate rejects any
  // `.bc-grid-cell` that is a descendant of a `.bc-grid-detail-panel`
  // — exactly the nested-grid case. Master cells (siblings of the
  // detail panel inside the master row) still match.
  test("focused-row → cell", () => {
    expect(themingSource).toMatch(
      /\.bc-grid-row\[data-bc-grid-focused-row="true"\]\s+\.bc-grid-cell:not\(\.bc-grid-detail-panel \.bc-grid-cell\)\s*\{/,
    )
  })

  test("hover → cell", () => {
    expect(themingSource).toMatch(
      /\.bc-grid-row:hover \.bc-grid-cell:not\(\.bc-grid-detail-panel \.bc-grid-cell\)\s*\{/,
    )
  })

  test("aria-selected → cell + the standalone aria-selected cell variant", () => {
    // The pre-fix selector list had two members:
    //   .bc-grid-row[aria-selected="true"] .bc-grid-cell,
    //   .bc-grid-cell[aria-selected="true"]
    // Both gain the cell-side guard so neither cascades into nested
    // cells. The standalone variant catches range-selected single
    // cells that don't propagate to the row attribute.
    expect(themingSource).toMatch(
      /\.bc-grid-row\[aria-selected="true"\] \.bc-grid-cell:not\(\.bc-grid-detail-panel \.bc-grid-cell\),/,
    )
    expect(themingSource).toMatch(
      /\.bc-grid-cell\[aria-selected="true"\]:not\(\.bc-grid-detail-panel \.bc-grid-cell\)\s*\{/,
    )
  })

  test("aria-selected + hover → cell", () => {
    expect(themingSource).toMatch(
      /\.bc-grid-row\[aria-selected="true"\]:hover\s+\.bc-grid-cell:not\(\.bc-grid-detail-panel \.bc-grid-cell\)\s*\{/,
    )
  })

  test("aria-selected + focused-row → cell", () => {
    expect(themingSource).toMatch(
      /\.bc-grid-row\[aria-selected="true"\]\[data-bc-grid-focused-row="true"\]\s+\.bc-grid-cell:not\(\.bc-grid-detail-panel \.bc-grid-cell\)\s*\{/,
    )
  })

  test("aria-selected + active-cell intersection", () => {
    // Pin both members of the selector list — the row+cell variant
    // and the standalone cell variant.
    expect(themingSource).toMatch(
      /\.bc-grid-row\[aria-selected="true"\]\s+\.bc-grid-cell\[data-bc-grid-active-cell="true"\]:not\(\.bc-grid-detail-panel \.bc-grid-cell\),/,
    )
    expect(themingSource).toMatch(
      /\.bc-grid-cell\[aria-selected="true"\]\[data-bc-grid-active-cell="true"\]:not\(\s*\.bc-grid-detail-panel \.bc-grid-cell\s*\)\s*\{/,
    )
  })
})

describe("row + pinned-cell rules — guarded for both `-left` and `-right` variants", () => {
  // Five pinned-cell row-state rules per RFC §4 inventory (lines
  // 903-927 pre-fix). Each rule pair (left + right) gains the
  // matching `.bc-grid-cell-pinned-{left,right}` cell-side guard.
  // Pinned-cell shading parity from #5341af3 stays load-bearing —
  // the +2 specificity is uniform so cascade order is preserved.
  test("hover → pinned cell (both variants)", () => {
    expect(themingSource).toMatch(
      /\.bc-grid-row:hover\s+\.bc-grid-cell-pinned-left:not\(\.bc-grid-detail-panel \.bc-grid-cell-pinned-left\),/,
    )
    expect(themingSource).toMatch(
      /\.bc-grid-row:hover\s+\.bc-grid-cell-pinned-right:not\(\.bc-grid-detail-panel \.bc-grid-cell-pinned-right\)\s*\{/,
    )
  })

  test("focused-row → pinned cell", () => {
    expect(themingSource).toMatch(
      /\.bc-grid-row\[data-bc-grid-focused-row="true"\]\s+\.bc-grid-cell-pinned-left:not\(\.bc-grid-detail-panel \.bc-grid-cell-pinned-left\),/,
    )
    expect(themingSource).toMatch(
      /\.bc-grid-row\[data-bc-grid-focused-row="true"\]\s+\.bc-grid-cell-pinned-right:not\(\.bc-grid-detail-panel \.bc-grid-cell-pinned-right\)\s*\{/,
    )
  })

  test("aria-selected → pinned cell + standalone pinned variants", () => {
    // The pre-fix selector list had FOUR members:
    //   .bc-grid-row[aria-selected="true"] .bc-grid-cell-pinned-left,
    //   .bc-grid-row[aria-selected="true"] .bc-grid-cell-pinned-right,
    //   .bc-grid-cell-pinned-left[aria-selected="true"],
    //   .bc-grid-cell-pinned-right[aria-selected="true"]
    // All four gain the matching cell-side guard.
    expect(themingSource).toMatch(
      /\.bc-grid-row\[aria-selected="true"\]\s+\.bc-grid-cell-pinned-left:not\(\.bc-grid-detail-panel \.bc-grid-cell-pinned-left\),/,
    )
    expect(themingSource).toMatch(
      /\.bc-grid-cell-pinned-left\[aria-selected="true"\]:not\(\s*\.bc-grid-detail-panel \.bc-grid-cell-pinned-left\s*\),/,
    )
    expect(themingSource).toMatch(
      /\.bc-grid-cell-pinned-right\[aria-selected="true"\]:not\(\s*\.bc-grid-detail-panel \.bc-grid-cell-pinned-right\s*\)\s*\{/,
    )
  })

  test("aria-selected + hover → pinned cell", () => {
    expect(themingSource).toMatch(
      /\.bc-grid-row\[aria-selected="true"\]:hover\s+\.bc-grid-cell-pinned-left:not\(\.bc-grid-detail-panel \.bc-grid-cell-pinned-left\),/,
    )
    expect(themingSource).toMatch(
      /\.bc-grid-row\[aria-selected="true"\]:hover\s+\.bc-grid-cell-pinned-right:not\(\.bc-grid-detail-panel \.bc-grid-cell-pinned-right\)\s*\{/,
    )
  })
})

describe("rationale comments — pin the RFC reference so doc sweeps don't strip context", () => {
  test("the styles.css cascade-scoping comment cites the RFC", () => {
    expect(themingSource).toMatch(/row-state-cascade-scoping-rfc/)
  })

  test("comment names the bsncraft consumer ticket so the bug attribution stays visible", () => {
    expect(themingSource).toMatch(/bsncraft v0\.5\.0-alpha\.2 P0 #2/)
  })
})
