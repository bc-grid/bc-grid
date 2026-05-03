import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

/**
 * Tests for the v0.5 default-context-menu wiring — editor + row-action
 * lane (per worker3 handoff `v05-default-context-menu-wiring-editor`).
 * Pins the chrome menu's `Editor` submenu structure + the
 * `Dismiss latest error` top-level item + the BcUserSettings extension
 * for the six editor toggles. The repo's test runner is bun:test with
 * no DOM, so behavioural correctness of the menu (clicks dispatching
 * the right callbacks, locked-by-prop disabled state) is covered by
 * coordinator-run Playwright at merge — this file pins the wiring
 * an e2e suite would otherwise catch as a regression.
 */

const here = fileURLToPath(new URL(".", import.meta.url))
const typesSource = readFileSync(`${here}../src/types.ts`, "utf8")
const gridSource = readFileSync(`${here}../src/grid.tsx`, "utf8")
const controllerSource = readFileSync(`${here}../src/useEditingController.ts`, "utf8")
const chromeMenuSource = readFileSync(`${here}../src/internal/chrome-context-menu.ts`, "utf8")

describe("BcUserSettings — editor toggle persistence fields", () => {
  test("visible.* gains the four boolean toggles", () => {
    // Pin all four together — one block — so a refactor that
    // adds a fifth or drops one trips here. Mirrors the existing
    // visible.* pattern (filterRow / sidebar / statusBar).
    const block = typesSource.match(/visible\?:\s*\{[\s\S]*?\n\s*\}/)?.[0] ?? ""
    expect(block).toMatch(/editingEnabled\?:\s*boolean/)
    expect(block).toMatch(/showValidationMessages\?:\s*boolean/)
    expect(block).toMatch(/showEditorKeyboardHints\?:\s*boolean/)
    expect(block).toMatch(/escDiscardsRow\?:\s*boolean/)
  })

  test("top-level editorActivation + editorBlurAction enums (don't fit visible.*)", () => {
    // Enums go top-level on BcUserSettings (matching the existing
    // `density?: BcGridDensity` pattern) because `visible.*` is a
    // boolean record. Pin the literal enum members so a typo in
    // either union catches loudly.
    expect(typesSource).toMatch(
      /editorActivation\?:\s*"f2-only"\s*\|\s*"single-click"\s*\|\s*"double-click"/,
    )
    expect(typesSource).toMatch(/editorBlurAction\?:\s*"commit"\s*\|\s*"reject"\s*\|\s*"ignore"/)
  })
})

describe("grid.tsx — setters write through to userSettings via existing helpers", () => {
  test("the four boolean toggles use setVisibleUserSetting", () => {
    // Pin that the boolean setters route through the existing
    // `setVisibleUserSetting` helper (which already knows about
    // the `visible.*` shape + the `userSettings.write(next)` call).
    // A refactor that bypasses the helper would silently regress
    // the persistence + the multi-tab subscribe path.
    expect(gridSource).toMatch(
      /setEditingEnabledPreference\s*=\s*useCallback\([\s\S]*?setVisibleUserSetting\("editingEnabled"/,
    )
    expect(gridSource).toMatch(
      /setShowValidationMessagesPreference\s*=\s*useCallback\([\s\S]*?setVisibleUserSetting\("showValidationMessages"/,
    )
    expect(gridSource).toMatch(
      /setShowEditorKeyboardHintsPreference\s*=\s*useCallback\([\s\S]*?setVisibleUserSetting\("showEditorKeyboardHints"/,
    )
    expect(gridSource).toMatch(
      /setEscDiscardsRowPreference\s*=\s*useCallback\([\s\S]*?setVisibleUserSetting\("escDiscardsRow"/,
    )
  })

  test("the two enum setters use updateUserSettings (top-level field)", () => {
    expect(gridSource).toMatch(
      /setEditorActivationPreference\s*=\s*useCallback[\s\S]*?updateUserSettings\(\(prev\)\s*=>\s*\(\{\s*\.\.\.prev,\s*editorActivation:\s*next/,
    )
    expect(gridSource).toMatch(
      /setEditorBlurActionPreference\s*=\s*useCallback[\s\S]*?updateUserSettings\(\(prev\)\s*=>\s*\(\{\s*\.\.\.prev,\s*editorBlurAction:\s*next/,
    )
  })
})

describe("useEditingController — clearLatestValidationError is the dismiss handler", () => {
  test("the helper retires both the status segment + the flash window unconditionally", () => {
    // The per-cell `clearValidationErrorIfFor` already exists for
    // commit-success-on-rejected-cell; this new helper is its
    // unconditional sibling for the chrome-menu "Dismiss latest
    // error" action. Pin the rowId/columnId-agnostic shape so a
    // refactor doesn't accidentally re-introduce the per-cell
    // guard (which would block dismiss when the latest error's
    // cell scrolled out of the visible window).
    const block =
      controllerSource.match(
        /const clearLatestValidationError = useCallback[\s\S]*?\n\s*\}, \[\]\)/,
      )?.[0] ?? ""
    expect(block).toContain("latestValidationErrorRef.current = null")
    expect(block).toContain("validationFlashCellRef.current = null")
    expect(block).not.toMatch(/rowId|columnId/)
  })
})

describe("chrome-context-menu — Editor submenu structure", () => {
  test("BcGridChromeContextMenuOptions carries the six toggle fields + their locked + setter triples", () => {
    // Each toggle needs three coordinated fields: the resolved
    // value, the locked-by-prop flag, and the on*Change setter.
    // Pin all six × 3 = 18 fields so a refactor that drops one
    // trips loudly.
    const block =
      chromeMenuSource.match(/export interface BcGridChromeContextMenuOptions[\s\S]*?\n\}/)?.[0] ??
      ""
    for (const field of [
      "editingEnabled:",
      "editingEnabledLocked:",
      "showValidationMessages:",
      "showValidationMessagesLocked:",
      "showEditorKeyboardHints:",
      "showEditorKeyboardHintsLocked:",
      "escDiscardsRow:",
      "escDiscardsRowLocked:",
      "editorActivation:",
      "editorActivationLocked:",
      "editorBlurAction:",
      "editorBlurActionLocked:",
      "onEditingEnabledChange:",
      "onShowValidationMessagesChange:",
      "onShowEditorKeyboardHintsChange:",
      "onEscDiscardsRowChange:",
      "onEditorActivationChange:",
      "onEditorBlurActionChange:",
    ]) {
      expect(block).toContain(field)
    }
  })

  test("BcGridChromeContextMenuOptions carries the latestValidationError + dismiss handler", () => {
    const block =
      chromeMenuSource.match(/export interface BcGridChromeContextMenuOptions[\s\S]*?\n\}/)?.[0] ??
      ""
    expect(block).toMatch(/latestValidationError:\s*BcLatestValidationError\s*\|\s*null/)
    expect(block).toMatch(/onDismissLatestValidationError:\s*\(\)\s*=>\s*void/)
  })

  test("the Editor submenu is omitted when editingEnabled is false", () => {
    // The whole submenu (Edit mode + show validation messages +
    // show keyboard hints + Activation + On blur + Esc reverts row)
    // collapses when editing is off — there are no editors to
    // configure.
    expect(chromeMenuSource).toMatch(/if\s*\(editingEnabled\)\s*\{[\s\S]*?id:\s*"editor",/)
  })

  test("the Editor submenu lists the six items per the handoff", () => {
    // Pin each item id so a refactor that drops one (or renames
    // the id, which would silently drop visual-test selectors)
    // catches loudly. The submenu shape is documented in the
    // worker3 handoff for the v05-default-context-menu-wiring task.
    const editorRegion =
      chromeMenuSource.match(/id:\s*"editor",[\s\S]*?items:\s*\[[\s\S]*?\],\s*\}\)/)?.[0] ?? ""
    expect(editorRegion).toContain('id: "editor-edit-mode"')
    expect(editorRegion).toContain('id: "editor-show-validation-messages"')
    expect(editorRegion).toContain('id: "editor-show-keyboard-hints"')
    expect(editorRegion).toContain('id: "editor-activation"')
    expect(editorRegion).toContain('id: "editor-blur"')
    expect(editorRegion).toContain('id: "editor-esc-discards-row"')
  })

  test("the activation submenu uses radio toggles per RFC §4 toggle vs radio guidance", () => {
    // Single-choice enums render as radio toggles (selection: "radio")
    // so the user reads them as a 1-of-N choice, not a checkbox
    // grid. Pin the discriminator + the three options on the
    // EDITOR_ACTIVATION_OPTIONS literal (matches `]` even when it
    // sits on its own line after the trailing comma).
    const activationRegion =
      chromeMenuSource.match(/EDITOR_ACTIVATION_OPTIONS[\s\S]*?\n\]/)?.[0] ?? ""
    expect(activationRegion).toContain('"single-click"')
    expect(activationRegion).toContain('"double-click"')
    expect(activationRegion).toContain('"f2-only"')
    expect(chromeMenuSource).toMatch(/EDITOR_ACTIVATION_OPTIONS\.map[\s\S]*?selection:\s*"radio"/)
  })

  test("the blur submenu uses radio toggles with three options", () => {
    const blurRegion = chromeMenuSource.match(/EDITOR_BLUR_OPTIONS[\s\S]*?\n\]/)?.[0] ?? ""
    expect(blurRegion).toContain('"commit"')
    expect(blurRegion).toContain('"reject"')
    expect(blurRegion).toContain('"ignore"')
    expect(chromeMenuSource).toMatch(/EDITOR_BLUR_OPTIONS\.map[\s\S]*?selection:\s*"radio"/)
  })
})

describe("chrome-context-menu — Dismiss latest error item", () => {
  test("emits a top-level item when latestValidationError is non-null", () => {
    // Pin the conditional + the item id + the dismiss handler
    // wiring. Top-level (not inside Editor) because the action
    // targets the status-bar segment from #407, which lives on
    // the chrome — not the editor lifecycle.
    expect(chromeMenuSource).toMatch(
      /if\s*\(latestValidationError\)[\s\S]*?id:\s*"dismiss-latest-error"[\s\S]*?onDismissLatestValidationError\(\)/,
    )
  })

  test("the item is hidden when no error is fresh (controller auto-cleared the entry)", () => {
    // Pin the gate so a refactor doesn't accidentally render a
    // stale "Dismiss" action when there's nothing to dismiss.
    // Symmetric with the latestError status-bar segment from #407
    // which uses the same null guard.
    const dismissRegion =
      chromeMenuSource.match(/if\s*\(latestValidationError\)\s*\{[\s\S]*?\}\)/)?.[0] ?? ""
    expect(dismissRegion.length).toBeGreaterThan(0)
    expect(dismissRegion).toMatch(/items\.push/)
  })
})

describe("grid.tsx — chrome menu options threading", () => {
  test("buildGridChromeContextMenuItems receives the six toggle resolved values + locked flags", () => {
    // Pin the prop wiring at the call site so a refactor that
    // forgets a field catches here instead of silently disabling
    // a menu toggle. Spot-check the locked predicates:
    // `*Locked: <prop> !== undefined` is the locked-by-prop signal.
    expect(gridSource).toMatch(
      /editingEnabled,\s*\n\s*editingEnabledLocked: editingEnabledProp !== undefined/,
    )
    expect(gridSource).toMatch(/editorActivationLocked: editorActivationProp !== undefined/)
    expect(gridSource).toMatch(/editorBlurActionLocked: editorBlurActionProp !== undefined/)
    expect(gridSource).toMatch(/escDiscardsRowLocked: escDiscardsRowProp !== undefined/)
  })

  test("the dismiss handler is wired to the controller's clearLatestValidationError", () => {
    expect(gridSource).toMatch(
      /onDismissLatestValidationError:\s*editController\.clearLatestValidationError/,
    )
  })

  test("latestValidationError is read live each render via the controller", () => {
    // Re-read on every render — the controller bumps state on each
    // new validation error / auto-clear, which re-renders <BcGrid>
    // and pulls the fresh entry through. Mirrors the existing
    // statusBarContext wiring from the validation-flash PR (#407).
    expect(gridSource).toMatch(
      /latestValidationError:\s*editController\.getLatestValidationError\(\)/,
    )
  })
})
