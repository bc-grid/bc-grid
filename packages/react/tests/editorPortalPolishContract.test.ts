import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

/**
 * Contract tests for the v0.5 editor-portal polish bundle:
 *   - `BcGridProps.editorActivation` (`"f2-only" | "single-click" | "double-click"`)
 *   - `BcGridProps.editorBlurAction` (`"commit" | "reject" | "ignore"`)
 *   - `BcGridProps.escDiscardsRow` (BcEditGrid defaults true)
 *
 * The repo's test runner has no DOM, so these are source-shape
 * regression guards: prop reads, default values, the right wiring
 * lands at each call site. Pure regression — they fail loudly if a
 * refactor accidentally drops a guard or mis-routes a prop.
 */

const here = fileURLToPath(new URL(".", import.meta.url))
const gridSource = readFileSync(`${here}../src/grid.tsx`, "utf8")
const portalSource = readFileSync(`${here}../src/editorPortal.tsx`, "utf8")
const editGridSource = readFileSync(`${here}../src/editGrid.tsx`, "utf8")

describe("editorActivation prop", () => {
  test("BcGrid reads the prop with double-click default (current behaviour)", () => {
    expect(gridSource).toMatch(
      /editorActivation:\s*"f2-only"\s*\|\s*"single-click"\s*\|\s*"double-click"\s*=\s*\n?\s*props\.editorActivation\s*\?\?\s*"double-click"/,
    )
  })

  test("single-click branch in onClick handler activates edit", () => {
    // The single-click branch in the cell click handler activates
    // edit when editorActivation === "single-click" and no modifiers
    // are held. Skipped in "f2-only" + "double-click" modes.
    expect(gridSource).toMatch(
      /editingEnabled\s*&&\s*\n?\s*editorActivation\s*===\s*"single-click"/,
    )
  })

  test('double-click branch is now gated on editorActivation === "double-click"', () => {
    // Previously the dblclick handler activated unconditionally
    // (when editingEnabled). Now it's also gated by the activation
    // mode so "f2-only" and "single-click" modes skip the dblclick
    // path entirely.
    expect(gridSource).toMatch(
      /editingEnabled\s*&&\s*\n?\s*editorActivation\s*===\s*"double-click"/,
    )
  })
})

describe("editorBlurAction prop", () => {
  test("BcGrid reads the prop with commit default (current behaviour)", () => {
    expect(gridSource).toMatch(
      /editorBlurAction:\s*"commit"\s*\|\s*"reject"\s*\|\s*"ignore"\s*=\s*\n?\s*props\.editorBlurAction\s*\?\?\s*"commit"/,
    )
  })

  test("EditorPortal forwards the prop", () => {
    expect(gridSource).toMatch(/blurAction=\{editorBlurAction\}/)
  })

  test("EditorPortal click-outside handler honours the action", () => {
    // The click-outside handler now reads `blurActionRef.current`
    // and dispatches:
    //   - "ignore" → return
    //   - "reject" → cancelRef.current?.()
    //   - "commit" (default) → readEditorInputValue + handleCommitRef
    expect(portalSource).toMatch(/if\s*\(\s*action\s*===\s*"ignore"\s*\)\s*return/)
    expect(portalSource).toMatch(/if\s*\(\s*action\s*===\s*"reject"\s*\)/)
    expect(portalSource).toMatch(/cancelRef\.current\?\.\(\)/)
  })

  test("blurAction defaults to commit at the EditorPortal level", () => {
    expect(portalSource).toMatch(/blurAction\s*=\s*"commit",/)
  })
})

describe("escDiscardsRow prop", () => {
  test("BcGrid reads the prop with false default", () => {
    expect(gridSource).toMatch(/const\s+escDiscardsRow\s*=\s*props\.escDiscardsRow\s*===\s*true/)
  })

  test("EditorPortal forwards the prop", () => {
    expect(gridSource).toMatch(/escDiscardsRow=\{escDiscardsRow\}/)
  })

  test("EditorPortal cancel handler dispatches discardRowEdits when prop is true", () => {
    // The cancel keydown intercept now branches: escDiscardsRow
    // calls discardRowEdits(rowId) (which internally cancels the
    // active editor); else just cancel(). Never both to avoid a
    // redundant double-dispatch.
    expect(portalSource).toMatch(
      /if\s*\(\s*escDiscardsRow\s*\)\s*\{\s*discardRowEdits\(cell\.rowId\)/,
    )
    expect(portalSource).toMatch(/}\s*else\s*\{\s*cancel\(\)/)
  })

  test("BcEditGrid defaults escDiscardsRow to true", () => {
    // The action column already exposes the row-discard surface;
    // the keyboard shortcut completes the symmetry. Consumers can
    // opt out with escDiscardsRow={false}.
    expect(editGridSource).toMatch(/escDiscardsRow=\{props\.escDiscardsRow\s*\?\?\s*true\}/)
  })

  test("BcEditGrid spread order lets prop override the default", () => {
    // {...props} spreads FIRST so an explicit `escDiscardsRow={false}`
    // from the consumer wins over the BcEditGrid default. The
    // default applies only when props.escDiscardsRow is undefined
    // (the `?? true` kicks in).
    expect(editGridSource).toMatch(
      /<BcGrid\s+\{\.\.\.props\}\s+escDiscardsRow=\{props\.escDiscardsRow\s*\?\?\s*true\}/,
    )
  })
})
