import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import type { BcReactGridColumn } from "../src/types"
import { resolveColumnHeader } from "../src/useEditingController"

/**
 * Tests for the v0.5 validation-flash + `latestError` status-bar
 * segment (audit P1-W3-4 — pulled forward from worker3-editors-and-
 * validation §1). Two layers, mirroring the controller's split design:
 *
 *   1. Behavioural unit tests for `resolveColumnHeader` — the pure
 *      stringifier that drives the segment's column label.
 *   2. Source-shape regression guards — pin the timer windows
 *      (600 ms flash, 8 s status segment), the new ref / setter /
 *      clearer triple in `useEditingController`, the `data-bc-grid-
 *      error-flash` attribute on the cell, the `"latestError"` arm
 *      in the status-bar render switch, and the public-type widening
 *      on `BcStatusBarSegment` + `BcStatusBarContext`.
 */

interface VendorRow {
  id: string
  name: string
}

describe("resolveColumnHeader — column-label stringifier for the latestError segment", () => {
  function col(over: Partial<BcReactGridColumn<VendorRow>>): BcReactGridColumn<VendorRow> {
    return { columnId: "vendor", header: "Vendor", ...over } as BcReactGridColumn<VendorRow>
  }

  test("returns column.header when it's a string", () => {
    expect(resolveColumnHeader(col({ header: "Discount" }))).toBe("Discount")
  })

  test("falls back to column.field when header is a React node", () => {
    // Consumer-supplied React headers can't render inside the
    // status-segment text, so `field` is the most stable next-best
    // identifier (and usually matches the API name the user knows).
    const header = {
      type: "div",
      props: {},
      key: null,
    } as unknown as BcReactGridColumn<VendorRow>["header"]
    expect(resolveColumnHeader(col({ header, field: "discount" }))).toBe("discount")
  })

  test("falls back to column.columnId when neither header nor field stringifies", () => {
    const header = {
      type: "div",
      props: {},
      key: null,
    } as unknown as BcReactGridColumn<VendorRow>["header"]
    expect(resolveColumnHeader(col({ header, field: undefined, columnId: "vendor" }))).toBe(
      "vendor",
    )
  })

  test("returns empty string when nothing stringifies (defensive null-safety)", () => {
    // Reachable only via a column object that's missing every label
    // — pin the no-throw shape so a malformed column at the rejection
    // moment doesn't crash the editor portal.
    const header = { type: "div", props: {} } as unknown as BcReactGridColumn<VendorRow>["header"]
    const stripped = {
      header,
      field: undefined,
      columnId: undefined,
    } as unknown as BcReactGridColumn<VendorRow>
    expect(resolveColumnHeader(stripped)).toBe("")
  })
})

describe("useEditingController — latestValidationError + flash window plumbing", () => {
  // The repo's test runner is bun:test with no DOM, so wiring through
  // the controller is pinned via source-shape regression guards.
  // Behavioural correctness of the helpers (timer set/clear, dual
  // ref invariants) is covered by the resolveColumnHeader behavioural
  // tests above + the editingController.test.ts pure-helper suite.
  const here = fileURLToPath(new URL(".", import.meta.url))
  const source = readFileSync(`${here}../src/useEditingController.ts`, "utf8")

  test("declares the flash + status-segment timer windows", () => {
    expect(source).toMatch(/const\s+VALIDATION_FLASH_DURATION_MS\s*=\s*600/)
    expect(source).toMatch(/const\s+VALIDATION_STATUS_TIMEOUT_MS\s*=\s*8000/)
  })

  test("declares the four refs (latest entry, status timer, flash cell, flash timer)", () => {
    expect(source).toMatch(
      /latestValidationErrorRef\s*=\s*useRef<BcLatestValidationError\s*\|\s*null>/,
    )
    expect(source).toMatch(/validationStatusTimerRef\s*=\s*useRef</)
    expect(source).toMatch(/validationFlashCellRef\s*=\s*useRef</)
    expect(source).toMatch(/validationFlashTimerRef\s*=\s*useRef</)
  })

  test("setLatestValidationError schedules both timers + bumps render", () => {
    // Pin all three side effects so a refactor that drops one
    // (e.g. forgets to schedule the flash timer when only the status
    // segment was touched) trips here instead of silently regressing
    // the user-visible flash.
    const block =
      source.match(/setLatestValidationError\s*=\s*useCallback[\s\S]*?\n\s*}, \[\]\)/)?.[0] ?? ""
    expect(block).toMatch(/setTimeout\([\s\S]*?VALIDATION_STATUS_TIMEOUT_MS/)
    expect(block).toMatch(/setTimeout\([\s\S]*?VALIDATION_FLASH_DURATION_MS/)
    expect(block).toContain("forceRender()")
  })

  test("clearValidationErrorIfFor only retires entries that match the cell", () => {
    // Pin the rowId + columnId match guard on both refs — without
    // this guard a successful commit on one cell would clobber a
    // pending rejection elsewhere.
    const block =
      source.match(/clearValidationErrorIfFor\s*=\s*useCallback[\s\S]*?\n\s*}, \[\]\)/)?.[0] ?? ""
    expect(block).toMatch(/latest\.rowId === rowId && latest\.columnId === columnId/)
    expect(block).toMatch(/flash\.rowId === rowId && flash\.columnId === columnId/)
  })

  test("commit's invalid branch fires both setLatestValidationError and the announce", () => {
    // The two paths must stay together — the announce informs AT
    // users; setLatestValidationError lights the cell flash + status
    // segment for sighted users. Splitting them silently regresses
    // the v0.4 "all signal goes through aria-live only" gap that
    // P1-W3-4 was filed for.
    const commitBody =
      source.match(/const commit = useCallback[\s\S]*?\n\s*\]\,\s*\n\s*\)/)?.[0] ?? ""
    expect(commitBody).toMatch(/announce\?\.\(\{\s*kind:\s*"validationError"/)
    expect(commitBody).toMatch(
      /setLatestValidationError\(\{[\s\S]*?columnHeader:\s*resolveColumnHeader/,
    )
  })

  test("commit's success path retires the previous rejection on the same cell", () => {
    // Risk note from the planning doc: flash auto-clearing must not
    // fight a re-edit on the same cell. Pin clearValidationErrorIfFor
    // BEFORE the overlay update so a re-commit retires the flash
    // synchronously (not after the user types again).
    expect(source).toMatch(
      /clearValidationErrorIfFor\(candidate\.rowId,\s*candidate\.columnId\)\s*\n[\s\S]{0,200}?Optimistic overlay update/,
    )
  })

  test("clearCell's invalid branch mirrors commit's wiring", () => {
    // Audit follow-up: the clearCell path was the ORIGINAL motivator
    // (worker3 #378 noted Delete on a required field is silent for
    // sighted users). Pin the same set/clear pair on the clear path.
    const clearCellBody =
      source.match(/const clearCell = useCallback[\s\S]*?\n\s*\]\,\s*\n\s*\)/)?.[0] ?? ""
    expect(clearCellBody).toMatch(/setLatestValidationError\(\{/)
    expect(clearCellBody).toMatch(
      /clearValidationErrorIfFor\(candidate\.rowId,\s*candidate\.columnId\)/,
    )
  })

  test("the controller exposes getLatestValidationError + clearLatestValidationError + isCellFlashing", () => {
    // Pin the read API so a refactor that drops any of these trips
    // the test instead of silently regressing the status-bar segment
    // + flash. `clearLatestValidationError` was added in worker3
    // v05-default-context-menu-wiring as the chrome-menu "Dismiss
    // latest error" handler — it sits between the read accessor and
    // the per-cell `clearValidationErrorIfFor` helper in the return
    // shape.
    expect(source).toMatch(
      /getLatestValidationError,\s*\n\s*clearLatestValidationError,\s*\n\s*isCellFlashing,/,
    )
    expect(source).toMatch(/export function resolveColumnHeader/)
  })

  test("cleanup useEffect retires the timers on unmount", () => {
    // Without this, a grid that unmounts during the 8 s status window
    // would schedule a forceRender on a torn-down hook, throwing in
    // strict-mode dev builds and leaking a setTimeout in prod.
    expect(source).toMatch(
      /useEffect\(\(\) => \{[\s\S]*?return \(\) => \{[\s\S]*?validationStatusTimerRef\.current[\s\S]*?validationFlashTimerRef\.current/,
    )
  })
})

describe("statusBar.tsx — latestError segment + render gating", () => {
  const here = fileURLToPath(new URL(".", import.meta.url))
  const source = readFileSync(`${here}../src/statusBar.tsx`, "utf8")

  test("renderBuiltInSegment branches on the new latestError id", () => {
    expect(source).toMatch(/if\s*\(id === "latestError"\)/)
  })

  test("the latestError segment hides itself when the controller has retired the entry", () => {
    // The controller is the source of truth for "is the entry still
    // fresh" (timer + commit-driven clear). The segment just
    // short-circuits when the context payload is null — pin the
    // null-guard so a refactor doesn't accidentally render a stale
    // entry forever.
    expect(source).toMatch(/if\s*\(!ctx\.latestValidationError\)\s*return null/)
  })

  test("LatestErrorSegment renders columnHeader + error message", () => {
    expect(source).toMatch(
      /<span className="bc-grid-statusbar-latest-error-column">\{err\.columnHeader\}</,
    )
    expect(source).toMatch(
      /<span className="bc-grid-statusbar-latest-error-message">\{err\.error\}</,
    )
  })

  test("the segment exposes rowId + columnId via data attrs (consumer hook for theming or query selectors)", () => {
    expect(source).toMatch(/data-bc-grid-row-id=\{err\.rowId\}/)
    expect(source).toMatch(/data-bc-grid-column-id=\{err\.columnId\}/)
  })

  test("the segment aligns right so it doesn't compete with row count + filter chips on the left", () => {
    expect(source).toMatch(/id:\s*"latestError",\s*\n\s*align:\s*"right"/)
  })
})

describe("bodyCells.tsx — data-bc-grid-error-flash attribute wiring", () => {
  const here = fileURLToPath(new URL(".", import.meta.url))
  const source = readFileSync(`${here}../src/bodyCells.tsx`, "utf8")

  test("renderBodyCell accepts the isCellFlashing predicate from the controller", () => {
    expect(source).toMatch(
      /isCellFlashing\?:\s*\(rowId:\s*RowId,\s*columnId:\s*ColumnId\)\s*=>\s*boolean/,
    )
  })

  test("the cell renders data-bc-grid-error-flash when the controller says it's flashing", () => {
    expect(source).toMatch(
      /data-bc-grid-error-flash=\{errorFlashing\s*\?\s*"true"\s*:\s*undefined\}/,
    )
  })

  test("errorFlashing falls back to false when the predicate isn't supplied", () => {
    // Defensive — keeps standalone bodyCell consumers (none today,
    // but the surface is exported) from crashing on the optional
    // prop. Same pattern as the existing getCellEditEntry?.() guards.
    expect(source).toMatch(/isCellFlashing\?\.\(entry\.rowId,\s*column\.columnId\)\s*\?\?\s*false/)
  })
})

describe("public type surface — BcStatusBarSegment + BcStatusBarContext extensions", () => {
  const here = fileURLToPath(new URL(".", import.meta.url))
  const source = readFileSync(`${here}../src/types.ts`, "utf8")

  test("BcStatusBarSegment built-in union includes latestError", () => {
    expect(source).toMatch(/export type BcStatusBarSegment<TRow[\s\S]*?\|\s*"latestError"/)
  })

  test("BcStatusBarContext carries latestValidationError", () => {
    expect(source).toMatch(/latestValidationError:\s*BcLatestValidationError\s*\|\s*null/)
  })

  test("BcLatestValidationError is exported with the four documented fields", () => {
    const block =
      source.match(/export interface BcLatestValidationError\s*\{[\s\S]*?\n\}/)?.[0] ?? ""
    expect(block).toMatch(/rowId:\s*RowId/)
    expect(block).toMatch(/columnId:\s*ColumnId/)
    expect(block).toMatch(/columnHeader:\s*string/)
    expect(block).toMatch(/error:\s*string/)
  })
})

describe("theming — flash keyframe + latestError segment styling", () => {
  // Source-shape pin on the theming package so a future CSS refactor
  // doesn't drop the keyframe (which would silently regress the
  // sighted-user signal back to "static red stripe like every other").
  const themingSource = readFileSync(
    fileURLToPath(new URL("../../theming/src/styles.css", import.meta.url)),
    "utf8",
  )

  test("the bc-grid-error-flash keyframe is declared", () => {
    expect(themingSource).toMatch(/@keyframes bc-grid-error-flash/)
  })

  test("the cell flash rule pairs the data attribute with the keyframe", () => {
    expect(themingSource).toMatch(
      /\[data-bc-grid-error-flash="true"\][\s\S]*?animation:\s*bc-grid-error-flash\s*600ms/,
    )
  })

  test("the latestError segment styling targets the three docs-listed classes", () => {
    expect(themingSource).toMatch(/\.bc-grid-statusbar-latest-error\b/)
    expect(themingSource).toMatch(/\.bc-grid-statusbar-latest-error-column/)
    expect(themingSource).toMatch(/\.bc-grid-statusbar-latest-error-message/)
  })
})
