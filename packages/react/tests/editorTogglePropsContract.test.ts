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
  test("editingEnabled resolves through the prop → userSettings → default chain", () => {
    // Updated for worker3 v05-default-context-menu-wiring: the
    // resolution order is now (1) `BcGridProps.editingEnabled`
    // when set (locked-by-prop), (2)
    // `BcUserSettings.visible.editingEnabled` from the persistence
    // layer, (3) the v0.5 default `true`. Pin the prop capture +
    // the resolved-value shape.
    expect(gridSource).toMatch(/const editingEnabledProp = props\.editingEnabled/)
    expect(gridSource).toMatch(
      /editingEnabled\s*=\s*\n?\s*editingEnabledProp\s*!==\s*undefined[\s\S]*?userVisibleSettings\?\.editingEnabled\s*\?\?\s*true/,
    )
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

  test("double-click cell activation respects editingEnabled (and editorActivation mode)", () => {
    expect(gridSource).toMatch(
      /editingEnabled\s*&&\s*\n?\s*editorActivation\s*===\s*"double-click"\s*&&\s*\n?\s*!disabled\s*&&\s*\n?\s*columnId/,
    )
  })
})

describe("showValidationMessages + showEditorKeyboardHints flow through to EditorPortal", () => {
  test("both resolve through the prop → userSettings → default chain", () => {
    // Updated for worker3 v05-default-context-menu-wiring.
    // showValidationMessages defaults to true (preserve the v0.4
    // popover-visible behaviour from #356); showEditorKeyboardHints
    // defaults to false (opt-in chrome, not on by default). The
    // chrome context menu's `Editor → Show validation messages` /
    // `Show keyboard hints` toggles write through to userSettings.
    expect(gridSource).toMatch(/const showValidationMessagesProp = props\.showValidationMessages/)
    expect(gridSource).toMatch(
      /showValidationMessages\s*=\s*\n?\s*showValidationMessagesProp\s*!==\s*undefined[\s\S]*?userVisibleSettings\?\.showValidationMessages\s*\?\?\s*true/,
    )
    expect(gridSource).toMatch(/const showEditorKeyboardHintsProp = props\.showEditorKeyboardHints/)
    expect(gridSource).toMatch(
      /showEditorKeyboardHints\s*=\s*\n?\s*showEditorKeyboardHintsProp\s*!==\s*undefined[\s\S]*?userVisibleSettings\?\.showEditorKeyboardHints\s*\?\?\s*false/,
    )
  })

  test("EditorPortal call site forwards both props", () => {
    expect(gridSource).toMatch(/showValidationMessages=\{showValidationMessages\}/)
    expect(gridSource).toMatch(/showKeyboardHints=\{showEditorKeyboardHints\}/)
  })
})
