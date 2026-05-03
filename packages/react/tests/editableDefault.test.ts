import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

/**
 * Regression for bsncraft 2026-05 P1 #10 — silent no-op when a column
 * shipped a `cellEditor` without explicitly setting `editable: true`.
 * Pre-fix the activation guard returned false unless `editable === true`,
 * so consumers who set `cellEditor` and skipped `editable` got a
 * read-only column with no diagnostic. Post-fix the default flips to
 * `cellEditor != null` — set `editable: false` to opt out.
 *
 * The repo's test runner is bun:test with no DOM, so this is a
 * source-shape regression suite covering both gates that matter:
 *
 *   1. `isCellEditable` in `grid.tsx` (the activation gate used by
 *      mouse, keyboard, and api edit-start paths plus copy/paste).
 *   2. `isRangePasteCellEditable` in `rangeClipboard.ts` (the paste
 *      gate that decides whether a range paste writes to a cell).
 */

const here = fileURLToPath(new URL(".", import.meta.url))
const gridSource = readFileSync(`${here}../src/grid.tsx`, "utf8")
const rangeClipboardSource = readFileSync(`${here}../src/rangeClipboard.ts`, "utf8")

describe("activation gate defaults editable to cellEditor != null when undefined", () => {
  test("isCellEditable in grid.tsx falls through to cellEditor != null", () => {
    const region = gridSource.match(/function isCellEditable<TRow>[\s\S]*?\n\}/)?.[0] ?? ""
    expect(region).toContain('typeof editable === "function"')
    expect(region).toContain('typeof editable === "boolean"')
    expect(region).toContain("column.source.cellEditor != null")
    expect(region).not.toMatch(/return\s+editable\s*===\s*true\b/)
  })

  test("isRangePasteCellEditable in rangeClipboard.ts uses the same default", () => {
    const region =
      rangeClipboardSource.match(/function isRangePasteCellEditable[\s\S]*?\n\}/)?.[0] ?? ""
    expect(region).toContain('typeof editable === "function"')
    expect(region).toContain('typeof editable === "boolean"')
    expect(region).toContain("column.source.cellEditor != null")
    expect(region).not.toMatch(/return\s+editable\s*===\s*true\b/)
  })
})
