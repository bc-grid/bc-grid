import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

/**
 * Source-shape regression guards for `v06-editor-cell-undo-redo`.
 * The behaviour itself (Cmd/Ctrl+Z reverts the most recent commit
 * on the focused row; Cmd+Shift+Z / Ctrl+Y re-applies) needs a
 * DOM-mounted test which the coordinator runs via the Playwright
 * spec at `apps/examples/tests/editor-undo-redo.pw.ts`.
 *
 * This file pins the wiring shape so a refactor that drops the
 * history cap, the redo-clear-on-new-commit semantics, the source
 * enum widening, or the keyboard intercept trips here loudly.
 *
 * Per `docs/recipes/editor-undo-redo.md`.
 */

const here = fileURLToPath(new URL(".", import.meta.url))
const controllerSource = readFileSync(`${here}../src/useEditingController.ts`, "utf8")
const gridSource = readFileSync(`${here}../src/grid.tsx`, "utf8")
const typesSource = readFileSync(`${here}../src/types.ts`, "utf8")

describe("public type surface — BcCellEditCommitEvent.source widened with undo/redo", () => {
  test("source enum includes 'undo' and 'redo' literals", () => {
    expect(typesSource).toMatch(
      /source:\s*"keyboard"\s*\|\s*"pointer"\s*\|\s*"api"\s*\|\s*"paste"\s*\|\s*"fill"\s*\|\s*"scroll-out"\s*\|\s*"undo"\s*\|\s*"redo"/,
    )
  })
})

describe("editing controller — per-row history cap + clear-redo-on-new-commit", () => {
  test("BcEditHistoryEntry interface is exported with the documented shape", () => {
    expect(controllerSource).toMatch(
      /export interface BcEditHistoryEntry\s*\{[\s\S]*?columnId:[\s\S]*?previousValue:[\s\S]*?appliedValue:[\s\S]*?timestamp:/,
    )
  })

  test("history cap pinned as a named constant (HISTORY_CAP = 10)", () => {
    // The cap is consumer-observable (memory bound + how far back
    // the user can undo). Pin so a future tuning becomes a deliberate
    // change reviewed in PR rather than an inline number flip.
    expect(controllerSource).toMatch(/HISTORY_CAP\s*=\s*10/)
  })

  test("recordCommitHistory pushes onto editHistoryRef + caps via shift", () => {
    expect(controllerSource).toMatch(/editHistoryRef\.current\.set\(rowId,\s*stack\)/)
    expect(controllerSource).toMatch(
      /while\s*\(stack\.length\s*>\s*HISTORY_CAP\)\s*stack\.shift\(\)/,
    )
  })

  test("recordCommitHistory clears the redo stack on every new commit (spreadsheet UX)", () => {
    // Pin the clear so a refactor that preserves the redo stack
    // through new commits silently breaks the spreadsheet
    // convention (typing a new value should invalidate redos).
    expect(controllerSource).toMatch(/editRedoRef\.current\.delete\(rowId\)/)
  })

  test("commit() skips history recording when source is 'undo' or 'redo'", () => {
    // Without this guard, undo would push back onto the history
    // stack, making subsequent undos walk through alternating
    // before/after states. Pin the gate.
    expect(controllerSource).toMatch(
      /candidate\.source\s*!==\s*"undo"\s*&&\s*candidate\.source\s*!==\s*"redo"/,
    )
  })
})

describe("editing controller — undoLastEdit / redoLastEdit / applyHistoryEntry", () => {
  test("undoLastEdit pops from editHistoryRef (not editRedoRef)", () => {
    expect(controllerSource).toMatch(/undoLastEdit[\s\S]*?editHistoryRef\.current\.get\(rowId\)/)
  })

  test("redoLastEdit pops from editRedoRef (not editHistoryRef)", () => {
    expect(controllerSource).toMatch(/redoLastEdit[\s\S]*?editRedoRef\.current\.get\(rowId\)/)
  })

  test("applyHistoryEntry pushes the entry onto the OPPOSITE stack so user can walk back/forward", () => {
    // Pin the symmetry: undo pushes to redo, redo pushes back to
    // undo. Without this, the redo gesture wouldn't work after an
    // undo; or undo wouldn't work after a redo.
    expect(controllerSource).toMatch(
      /const oppositeRef\s*=\s*mode\s*===\s*"undo"\s*\?\s*editRedoRef\s*:\s*editHistoryRef/,
    )
  })

  test("applyHistoryEntry bypasses column.valueParser + column.validate", () => {
    // The whole point of skipping validation: the value being
    // restored was already valid at original-commit time, and
    // re-validating could spuriously reject (e.g. uniqueness
    // checks where another row now holds that value). Pin the
    // absence of parser / validate calls inside applyHistoryEntry.
    const region =
      controllerSource.match(
        /applyHistoryEntry\s*=\s*useCallback[\s\S]*?\[options\.onCellEditCommit/,
      )?.[0] ?? ""
    expect(region.length).toBeGreaterThan(0)
    expect(region).not.toMatch(/valueParser/)
    expect(region).not.toMatch(/options\.validate/)
  })

  test("applyHistoryEntry fires onCellEditCommit so consumer can mirror to server state", () => {
    // Without this fire, the consumer's server state diverges from
    // the displayed grid value after an undo. Pin the consumer hook
    // call inside applyHistoryEntry.
    expect(controllerSource).toMatch(/applyHistoryEntry[\s\S]*?consumerHook\?\.\(event\)/)
  })

  test("applyHistoryEntry stamps source: mode (undo|redo) on the event", () => {
    expect(controllerSource).toMatch(/applyHistoryEntry[\s\S]*?source:\s*mode/)
  })

  test("getEditHistoryDepth returns { undo, redo } counts (narrow public API)", () => {
    expect(controllerSource).toMatch(
      /getEditHistoryDepth[\s\S]*?undo:\s*editHistoryRef\.current\.get\(rowId\)\?\.length\s*\?\?\s*0/,
    )
    expect(controllerSource).toMatch(
      /getEditHistoryDepth[\s\S]*?redo:\s*editRedoRef\.current\.get\(rowId\)\?\.length\s*\?\?\s*0/,
    )
  })
})

describe("grid.tsx keyboard wiring — Cmd/Ctrl+Z + Cmd+Shift+Z + Ctrl+Y", () => {
  test("Cmd/Ctrl+Z gesture is detected by metaKey || ctrlKey + key === z", () => {
    expect(gridSource).toMatch(
      /isUndoKey\s*=\s*\([\s\S]*?event\.metaKey\s*\|\|\s*event\.ctrlKey[\s\S]*?event\.key\s*===\s*"z"/,
    )
  })

  test("Cmd+Shift+Z OR Ctrl+Y maps to redo (both Mac + Windows conventions)", () => {
    expect(gridSource).toMatch(/event\.shiftKey[\s\S]*?event\.key\s*===\s*"z"/)
    expect(gridSource).toMatch(/event\.key\s*===\s*"y"/)
  })

  test("undo/redo gesture preventDefault prevents the printable activation path from firing", () => {
    // Without preventDefault on the gesture, the activation logic
    // below would treat 'z' as a printable seed and try to enter
    // edit mode — racing the undo write. Pin the preventDefault.
    const region =
      gridSource.match(/if\s*\(isUndoKey\s*\|\|\s*isRedoKey\)[\s\S]*?return\s*\n\s*\}/)?.[0] ?? ""
    expect(region.length).toBeGreaterThan(0)
    expect(region).toMatch(/event\.preventDefault\(\)/)
  })

  test("undo/redo gesture is gated on data row (group rows can't be undone)", () => {
    expect(gridSource).toMatch(/rowEntry\.kind\s*!==\s*"data"/)
  })

  test("undo/redo calls editController.applyHistoryEntry with the resolved row + column", () => {
    expect(gridSource).toMatch(
      /editController\.applyHistoryEntry\(\{[\s\S]*?rowId:[\s\S]*?row:[\s\S]*?column:[\s\S]*?entry,[\s\S]*?mode:/,
    )
  })
})
