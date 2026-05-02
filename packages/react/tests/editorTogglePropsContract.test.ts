import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

/**
 * Contract tests for the v0.5 editor-toggle props (`editingEnabled`,
 * `showValidationMessages`, `showEditorKeyboardHints`) — the
 * underlying behaviour layer the v0.5 vanilla-and-context-menu RFC's
 * right-click menu will eventually drive through `BcUserSettings`.
 *
 * The repo's test runner is bun:test with no DOM, so these are
 * source-shape assertions: the props are read at the top of `BcGrid`,
 * `editingEnabled` gates all three editor activation paths, and
 * `showValidationMessages` / `showKeyboardHints` flow through to the
 * editor portal. Pure regression guards — they fail loudly if a
 * refactor accidentally drops a guard or mis-routes a prop.
 */

const here = fileURLToPath(new URL(".", import.meta.url))
const gridSource = readFileSync(`${here}../src/grid.tsx`, "utf8")

describe("editingEnabled gates every editor activation path", () => {
  test("the prop reads with default true", () => {
    expect(gridSource).toMatch(/const\s+editingEnabled\s*=\s*props\.editingEnabled\s*!==\s*false/)
  })

  test("keyboard activation handler checks editingEnabled before isCellEditable", () => {
    // The keydown handler at line ~2100 is the F2 / Enter / printable
    // / Backspace / Delete entry point; gating here disables every
    // keyboard editor activation.
    expect(gridSource).toMatch(/editingEnabled\s*&&\s*\n?\s*cellTarget\s*&&/)
  })

  test("apiRef.startEdit returns early when editingEnabled is false", () => {
    // `apiRef.startEdit({ rowId, columnId })` is the programmatic
    // activation path; gating here lets host code respect the
    // grid-level toggle without re-checking it consumer-side.
    expect(gridSource).toMatch(/startEdit\([\s\S]*?if\s*\(\s*!editingEnabled\s*\)\s*return/)
  })

  test("double-click cell activation respects editingEnabled", () => {
    // The body-cell double-click handler at line ~2670 is the
    // pointer activation path. Gating here keeps a vanilla read-only
    // grid from accidentally entering edit mode on accidental
    // double-clicks.
    expect(gridSource).toMatch(/if\s*\(\s*editingEnabled\s*&&\s*!disabled\s*&&\s*columnId\s*\)/)
  })
})

describe("showValidationMessages + showEditorKeyboardHints flow through to EditorPortal", () => {
  test("BcGrid reads both props with the right defaults", () => {
    // showValidationMessages defaults to true (preserve current
    // behaviour — the popover from #356 stays visible).
    expect(gridSource).toMatch(
      /const\s+showValidationMessages\s*=\s*props\.showValidationMessages\s*!==\s*false/,
    )
    // showEditorKeyboardHints defaults to false (the caption is opt-in
    // chrome, not on by default).
    expect(gridSource).toMatch(
      /const\s+showEditorKeyboardHints\s*=\s*props\.showEditorKeyboardHints\s*===\s*true/,
    )
  })

  test("EditorPortal call site forwards both props", () => {
    expect(gridSource).toMatch(/showValidationMessages=\{showValidationMessages\}/)
    expect(gridSource).toMatch(/showKeyboardHints=\{showEditorKeyboardHints\}/)
  })
})
