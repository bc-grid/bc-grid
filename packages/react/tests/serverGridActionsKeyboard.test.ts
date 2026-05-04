import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

/**
 * Source-shape regression guards for `v06-server-grid-actions-keyboard`.
 * Followup to #453 server-grid actions column. Today the actions
 * column is reachable via Tab; this PR adds Shift+E (Edit) and
 * Shift+Delete (Delete with confirmDelete gate) for sighted-keyboard
 * users who'd otherwise have to discover the column manually.
 *
 * The behaviour itself (key fires consumer's onEdit / onDelete with
 * the focused row) needs a DOM-mounted test which the coordinator
 * runs via the Playwright spec at
 * `apps/examples/tests/server-grid-actions-keyboard.pw.ts`.
 *
 * This file pins the wiring shape so a refactor that drops the
 * gate, the canEdit/canDelete check, the actions-column-presence
 * check, or the confirmDelete await trips here.
 *
 * Per `docs/recipes/server-grid-actions.md` (keyboard section).
 */

const here = fileURLToPath(new URL(".", import.meta.url))
const gridSource = readFileSync(`${here}../src/grid.tsx`, "utf8")

describe("grid.tsx — Shift+E / Shift+Delete keyboard intercept", () => {
  test("Shift+E gesture is gated on shift, no other modifier, key === E/e", () => {
    expect(gridSource).toMatch(
      /isActionEditKey\s*=\s*event\.shiftKey\s*&&\s*!event\.metaKey\s*&&\s*!event\.ctrlKey\s*&&\s*!event\.altKey\s*&&\s*\(event\.key\s*===\s*"E"\s*\|\|\s*event\.key\s*===\s*"e"\)/,
    )
  })

  test("Shift+Delete gesture accepts both Delete and Backspace (Mac muscle memory)", () => {
    // Mac users press Shift+Backspace (no forward Delete on most
    // keyboards); Windows users press Shift+Delete. Pin both so the
    // gesture works cross-platform without consumer config.
    expect(gridSource).toMatch(
      /isActionDeleteKey\s*=[\s\S]*?event\.key\s*===\s*"Delete"\s*\|\|\s*event\.key\s*===\s*"Backspace"/,
    )
  })

  test("gesture is gated on the actions column being present (__bc_actions in resolvedColumns)", () => {
    // Direct BcGrid consumers may wire onEdit/onDelete without
    // injecting the actions column. The shortcut must NOT fire in
    // that case — pressing Shift+E on a regular grid should fall
    // through to the printable activation path. Pin the gate.
    expect(gridSource).toMatch(
      /resolvedColumns\.some\(\(c\)\s*=>\s*c\.columnId\s*===\s*"__bc_actions"\)/,
    )
  })

  test("gesture is gated on data row (group rows can't be edited / deleted)", () => {
    // The actions column itself is rendered as null on group rows
    // (cellRenderer reads rowState.dirty etc which are data-row
    // concepts). Pin the rowEntry.kind === "data" check inside the
    // shortcut handler so a refactor that broadens to group rows
    // doesn't fire onEdit / onDelete with a partial row entry.
    const handlerRegion =
      gridSource.match(
        /if\s*\(isActionEditKey\s*\|\|\s*isActionDeleteKey\)[\s\S]*?return\s+\}\s*\n/,
      )?.[0] ?? ""
    expect(handlerRegion.length).toBeGreaterThan(0)
    expect(handlerRegion).toMatch(/rowEntry\.kind\s*!==\s*"data"/)
  })

  test("Shift+E branch reads onEdit + canEdit from captured deps (stable closure for useCallback)", () => {
    // Pin the captured-deps pattern so a refactor that re-inlines
    // the cast (`props as BcActionsColumnProps`) re-introduces the
    // useCallback re-binding cost on every render. The captures
    // live near the top of the component (`actionsKeyboardOnEdit`
    // etc) so the deps array can list specific stable refs.
    expect(gridSource).toMatch(/const onEdit\s*=\s*actionsKeyboardOnEdit/)
    expect(gridSource).toMatch(/const canEdit\s*=\s*actionsKeyboardCanEdit/)
  })

  test("captured deps are populated from runtime props via BcActionsColumnProps cast", () => {
    expect(gridSource).toMatch(/actionsProps\s*=\s*props as Partial<BcActionsColumnProps<TRow>>/)
    expect(gridSource).toMatch(/actionsKeyboardOnEdit\s*=\s*actionsProps\.onEdit/)
    expect(gridSource).toMatch(/actionsKeyboardOnDelete\s*=\s*actionsProps\.onDelete/)
  })

  test("Shift+E respects canEdit per-row gate (skips when consumer rejects)", () => {
    // Pin the canEdit short-circuit: if the consumer's per-row gate
    // returns false, the gesture is a no-op (not preventDefault'd,
    // not invoked). Without this, a row the consumer marked as
    // un-editable would still fire onEdit when the user pressed
    // Shift+E.
    expect(gridSource).toMatch(/if\s*\(canEdit\s*&&\s*!canEdit\(rowEntry\.row\)\)\s*return/)
  })

  test("Shift+Delete respects canDelete per-row gate", () => {
    expect(gridSource).toMatch(/if\s*\(canDelete\s*&&\s*!canDelete\(rowEntry\.row\)\)\s*return/)
  })

  test("Shift+Delete awaits confirmDelete before firing onDelete", () => {
    // The actions column's button click awaits confirmDelete; the
    // keyboard gesture must follow the same gate so the user gets
    // the same confirm prompt regardless of how they triggered the
    // action. Pin the Promise.resolve(confirmResult).then chain.
    expect(gridSource).toMatch(
      /Promise\.resolve\(confirmResult\)\.then\(\(proceed\)\s*=>\s*\{\s*if\s*\(proceed\)\s*onDelete\(rowEntry\.row\)/,
    )
  })

  test("preventDefault fires only after the gate clears (canEdit / canDelete pass)", () => {
    // Pin that preventDefault is INSIDE the canEdit/canDelete gate
    // — calling it before the gate would consume the keystroke even
    // when no action ultimately fires, breaking the fall-through to
    // other handlers (range select, etc.). Pin the order.
    const editBranch =
      gridSource.match(
        /if\s*\(isActionEditKey\)\s*\{[\s\S]*?event\.preventDefault\(\)[\s\S]*?onEdit\(rowEntry\.row\)/,
      )?.[0] ?? ""
    expect(editBranch.length).toBeGreaterThan(0)
    // The canEdit gate appears BEFORE preventDefault.
    const canEditIdx = editBranch.indexOf("canEdit && !canEdit")
    const preventIdx = editBranch.indexOf("event.preventDefault()")
    expect(canEditIdx).toBeGreaterThanOrEqual(0)
    expect(preventIdx).toBeGreaterThanOrEqual(0)
    expect(canEditIdx).toBeLessThan(preventIdx)
  })

  test("rationale comment cites discovery for sighted-keyboard users (load-bearing context)", () => {
    expect(gridSource).toMatch(/Discoverability gap closer/)
    // The phrase wraps across a comment line break; allow whitespace
    // (including newline + comment marker) between the words.
    expect(gridSource).toMatch(/sighted-keyboard[\s\S]*?users/)
  })
})
