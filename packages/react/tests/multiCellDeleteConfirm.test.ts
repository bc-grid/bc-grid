import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

/**
 * Source-shape regression guards for `v06-editor-multi-cell-delete-confirm`.
 *
 * Adds an opt-in path: when `BcGridProps.confirmRangeDelete` is wired
 * AND the user presses Delete/Backspace AND a range > 1 cell is
 * active, the grid clears every editable cell in the range
 * (optionally awaiting the consumer's confirm gate).
 *
 * Default `undefined` / `false` falls through to the existing
 * single-cell clear path (preserves v0.5 behaviour for consumers
 * not yet opted in).
 *
 * Behavioural correctness (cells actually clear, confirm dialog
 * fires, atomic) needs DOM-mounted tests which the coordinator
 * runs via the Playwright spec at
 * `apps/examples/tests/range-delete-confirm.pw.ts`.
 *
 * Per `docs/recipes/range-delete-confirm.md`.
 */

const here = fileURLToPath(new URL(".", import.meta.url))
const gridSource = readFileSync(`${here}../src/grid.tsx`, "utf8")
const typesSource = readFileSync(`${here}../src/types.ts`, "utf8")

describe("public type surface — confirmRangeDelete on BcGridProps", () => {
  test("BcGridProps exposes confirmRangeDelete with the documented union", () => {
    expect(typesSource).toMatch(
      /confirmRangeDelete\?:\s*boolean\s*\|\s*\(\(range:\s*CoreBcRange\)\s*=>\s*boolean\s*\|\s*Promise<boolean>\)/,
    )
  })

  test("rationale comment cites Excel/Google-Sheets convention (load-bearing context)", () => {
    expect(typesSource).toMatch(/Excel\/Google-Sheets/)
  })

  test("default undefined / false preserves v0.5 behaviour (documented)", () => {
    // Pin the documentation so a future maintainer doesn't flip
    // the default to `true` (which would silently change existing
    // consumer behaviour).
    expect(typesSource).toMatch(/Preserves v0\.5 behaviour/)
  })
})

describe("grid.tsx — multi-cell range-delete keyboard handler", () => {
  test("range-delete branch fires only when confirmRangeDelete is wired", () => {
    // Pin the gate: without confirmRangeDelete, the keystroke falls
    // through to the single-cell clear path. A refactor that drops
    // the truthy check would silently activate multi-cell clear for
    // every consumer (not what the v0.6 polish promises).
    expect(gridSource).toMatch(
      /editingEnabled\s*&&\s*confirmRangeDelete\s*&&\s*\(event\.key\s*===\s*"Delete"\s*\|\|\s*event\.key\s*===\s*"Backspace"\)/,
    )
  })

  test("range-delete only fires when no modifier keys are held (no Shift+Delete etc.)", () => {
    // Shift+Delete is the actions-column keyboard shortcut from #464;
    // Cmd+Delete is browser back-navigation on macOS. Pin the
    // no-modifier gate so the multi-cell clear doesn't collide.
    expect(gridSource).toMatch(
      /event\.key\s*===\s*"Backspace"\)\s*&&\s*!event\.shiftKey\s*&&\s*!event\.ctrlKey\s*&&\s*!event\.metaKey\s*&&\s*!event\.altKey/,
    )
  })

  test("range-delete only fires when range > 1 cell (single-cell falls through)", () => {
    // Pin the cells.length > 1 gate so single-cell ranges keep
    // using the existing single-cell clear path (which surfaces an
    // editor with empty seed for Backspace, etc.). Multi-cell is
    // the only case that bypasses the editor portal.
    expect(gridSource).toMatch(/cells\.length\s*>\s*1/)
  })

  test("range-delete branch awaits Promise from function-form confirmRangeDelete", () => {
    // Pin the Promise.then chain so an async confirm dialog (the
    // typical case — modal libraries return Promises) gates the
    // clear. Without the await, the clear would fire BEFORE the
    // user clicked Confirm.
    expect(gridSource).toMatch(/proceed\s+instanceof\s+Promise/)
    expect(gridSource).toMatch(/proceed\.then\(finishClear\)/)
  })

  test("sync confirm result skips the Promise branch (immediate fire)", () => {
    // Pin both branches: Promise → await; non-Promise → call
    // finishClear immediately. A refactor that wraps everything in
    // Promise.resolve adds an unnecessary tick; pin the sync path.
    expect(gridSource).toMatch(/finishClear\(proceed\)/)
  })

  test("cells iterated through editController.clearCell (consumer pipeline applies per-cell)", () => {
    // Per the spec: each cell goes through the consumer's
    // valueParser + validate + onCellEditCommit pipeline. Pin the
    // clearCell call so a refactor that bypasses (e.g. direct
    // overlay write) doesn't break consumer wiring.
    expect(gridSource).toMatch(
      /editController\.clearCell\(\{[\s\S]*?rowId:\s*cell\.rowId,[\s\S]*?columnId:\s*cell\.columnId/,
    )
  })

  test("collectEditableCellsInRange helper is defined at module scope (testable)", () => {
    expect(gridSource).toMatch(/function collectEditableCellsInRange<TRow>/)
  })
})

describe("collectEditableCellsInRange helper — pure cell iteration", () => {
  test("uses normaliseRange to bound the iteration (handles reversed ranges)", () => {
    // The user can drag a range from bottom-right to top-left;
    // normaliseRange flips coordinates so the iteration always
    // walks top-to-bottom, left-to-right. Pin the call so a
    // refactor doesn't accidentally use range.start/end raw.
    expect(gridSource).toMatch(
      /collectEditableCellsInRange[\s\S]*?normalised\s*=\s*normaliseRange\(/,
    )
  })

  test("skips group rows + disabled rows + non-editable cells", () => {
    expect(gridSource).toMatch(/if\s*\(!rowEntry\s*\|\|\s*!isDataRowEntry\(rowEntry\)\)\s*continue/)
    expect(gridSource).toMatch(/if\s*\(isRowDisabled\(rowEntry\.row\)\)\s*continue/)
    expect(gridSource).toMatch(/if\s*\(!isCellEditable\(column,\s*rowEntry\.row\)\)\s*continue/)
  })

  test("captures previousValue from the row's field for onCellEditCommit telemetry", () => {
    // Pin previousValue capture so the consumer's onCellEditCommit
    // sees the value the user actually saw before clear (not
    // undefined). Mirrors the single-cell clear path's behaviour.
    expect(gridSource).toMatch(
      /previousValue\s*=\s*column\.source\.field\s*\?\s*\(rowEntry\.row[\s\S]*?\[column\.source\.field\]/,
    )
  })
})
