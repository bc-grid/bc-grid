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
  test("BcGrid resolves editorActivation through the prop → userSettings → default chain", () => {
    // Updated for worker3 v05-default-context-menu-wiring: the
    // resolution order is now (1) `BcGridProps.editorActivation`
    // when set (locked-by-prop), (2) `BcUserSettings.editorActivation`
    // from the persistence layer, (3) the v0.5 default `"double-click"`.
    // Pin the resolved-value shape and the prop capture so a
    // refactor that flips the chain catches loudly.
    expect(gridSource).toMatch(/const editorActivationProp = props\.editorActivation/)
    expect(gridSource).toMatch(
      /editorActivation:\s*"f2-only"\s*\|\s*"single-click"\s*\|\s*"double-click"\s*=\s*\n?\s*editorActivationProp\s*\?\?\s*userSettingsState\?\.editorActivation\s*\?\?\s*"double-click"/,
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
  test("BcGrid resolves editorBlurAction through the prop → userSettings → default chain", () => {
    // Same prop → userSettings → default chain as editorActivation
    // (worker3 v05-default-context-menu-wiring).
    expect(gridSource).toMatch(/const editorBlurActionProp = props\.editorBlurAction/)
    expect(gridSource).toMatch(
      /editorBlurAction:\s*"commit"\s*\|\s*"reject"\s*\|\s*"ignore"\s*=\s*\n?\s*editorBlurActionProp\s*\?\?\s*userSettingsState\?\.editorBlurAction\s*\?\?\s*"commit"/,
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
  test("BcGrid resolves escDiscardsRow through the prop → userSettings → default chain", () => {
    // Boolean toggle: prop wins (locked-by-prop), else
    // `BcUserSettings.visible.escDiscardsRow`, else `false`. The
    // chrome context menu's `Editor → Esc reverts row` toggle writes
    // through to userSettings via `setEscDiscardsRowPreference`.
    // Worker3 v05-default-context-menu-wiring.
    expect(gridSource).toMatch(/const escDiscardsRowProp = props\.escDiscardsRow/)
    expect(gridSource).toMatch(
      /escDiscardsRow\s*=\s*\n?\s*escDiscardsRowProp\s*!==\s*undefined[\s\S]*?userVisibleSettings\?\.escDiscardsRow\s*\?\?\s*false/,
    )
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

  test("EditorMount layoutEffect deps DON'T include rowEntry.row / column.source / initialValue (bsncraft 0.5.0 GA P0)", () => {
    // These values change on every server-grid re-fetch (new object
    // refs even for unchanged data). Putting them in the layoutEffect
    // dep array re-fires the cleanup mid-edit, which triggers the
    // scroll-out commit path — the editor unmounts on every render of
    // the surrounding `<BcServerGrid>` and the consumer sees no input.
    //
    // The cleanup MUST read these via `cleanupRowRef.current` /
    // `cleanupColumnSourceRef.current` / `cleanupInitialValueRef.current`
    // so values are fresh at unmount without re-firing the effect.
    // Pinning the contract here so a refactor that re-adds them to
    // the dep array catches loudly. Surfaced 2026-05-03 by bsncraft
    // v0.5.0 GA — in-cell editors immediately unmounted on
    // `<BcServerGrid rowModel="paged">`.

    // The scroll-out detection layoutEffect is the one near the
    // bottom of the file with the rowEntry / column / initialValue
    // refs declared above it.
    expect(portalSource).toContain("cleanupRowRef")
    expect(portalSource).toContain("cleanupColumnSourceRef")
    expect(portalSource).toContain("cleanupInitialValueRef")

    // Cleanup reads from the refs, not the closed-over values.
    expect(portalSource).toMatch(/row:\s*cleanupRowRef\.current/)
    expect(portalSource).toMatch(/column:\s*cleanupColumnSourceRef\.current/)
    expect(portalSource).toMatch(/previousValue:\s*cleanupInitialValueRef\.current/)

    // The dep array of the scroll-out layoutEffect must NOT include
    // the unstable refs. Match the dep array specifically (the one
    // ending with `cell.columnId` per the post-fix shape) and assert
    // none of `rowEntry.row`, `column.source`, `initialValue` appear.
    const depArrayMatch = portalSource.match(/}, \[\s*\n[\s\S]*?cell\.columnId,?\s*\n\s*\]\)/)
    expect(depArrayMatch).not.toBeNull()
    const depArray = depArrayMatch?.[0] ?? ""
    expect(depArray).not.toContain("rowEntry.row")
    expect(depArray).not.toContain("column.source")
    expect(depArray).not.toContain("initialValue")
  })
})
