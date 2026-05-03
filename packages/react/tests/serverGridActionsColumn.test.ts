import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

/**
 * Source-shape regression guards for `v06-server-grid-actions-column`
 * (bsncraft P1, 2026-05-03). Pinning the wiring shape so a refactor
 * that drops the auto-injection — leaving server-grid consumers back
 * to hand-rolling the actions column — trips here loudly.
 *
 * The behaviour itself (pinned-right column appears when
 * `onEdit` / `onDelete` / `onDiscardRowEdits` / `extraActions` is
 * supplied to `<BcServerGrid>`) needs a DOM-mounted test which the
 * coordinator runs via the Playwright spec at
 * `apps/examples/tests/server-grid-actions.pw.ts`.
 *
 * Per `docs/recipes/server-grid-actions.md`.
 */

const here = fileURLToPath(new URL(".", import.meta.url))
const serverGridSource = readFileSync(`${here}../src/serverGrid.tsx`, "utf8")
const editGridSource = readFileSync(`${here}../src/editGrid.tsx`, "utf8")
const typesSource = readFileSync(`${here}../src/types.ts`, "utf8")

describe("public type surface — BcActionsColumnProps shared by edit + server", () => {
  test("BcActionsColumnProps is the documented shared interface", () => {
    expect(typesSource).toMatch(/export interface BcActionsColumnProps<TRow>\s*\{/)
  })

  test("BcEditGridProps extends BcActionsColumnProps (DRY surface)", () => {
    expect(typesSource).toMatch(
      /BcEditGridProps<TRow>\s+extends\s+BcGridProps<TRow>,\s*BcActionsColumnProps<TRow>/,
    )
  })

  test("BcServerGridProps extends BcActionsColumnProps (the new bsncraft P1 surface)", () => {
    // Pin the inheritance so a refactor that re-narrows the actions
    // surface to BcEditGridProps only trips here. The whole point of
    // this PR: bsncraft-style server-paged consumers should NOT need
    // their own ServerEditGrid wrapper.
    expect(typesSource).toMatch(/BcServerGridProps<TRow>[\s\S]*?BcActionsColumnProps<TRow>/)
  })
})

describe("editGrid.tsx — uses the shared shouldRenderActionsColumn predicate", () => {
  test("imports both createActionsColumn AND shouldRenderActionsColumn from ./actionsColumn", () => {
    expect(editGridSource).toMatch(
      /import\s*\{\s*createActionsColumn,\s*shouldRenderActionsColumn\s*\}\s*from\s*"\.\/actionsColumn"/,
    )
  })

  test("the local hasActions boolean was replaced by shouldRenderActionsColumn", () => {
    // The pre-lift code checked `hasActions = Boolean(...)` inline.
    // After the lift, the predicate lives in actionsColumn.tsx so
    // both grids share it. Pin the call site so a refactor doesn't
    // accidentally restore the inline duplicate.
    expect(editGridSource).toMatch(/shouldRenderActionsColumn\(/)
  })

  test("createActionsColumn is re-exported for back-compat", () => {
    // Consumers who imported createActionsColumn from `./editGrid`
    // before the lift keep working. Pin the re-export.
    expect(editGridSource).toMatch(
      /export\s*\{\s*createActionsColumn\s*\}\s*from\s*"\.\/actionsColumn"/,
    )
  })
})

describe("serverGrid.tsx — auto-inject actions column via shared module", () => {
  test("imports createActionsColumn + shouldRenderActionsColumn from ./actionsColumn", () => {
    expect(serverGridSource).toMatch(
      /import\s*\{\s*createActionsColumn,\s*shouldRenderActionsColumn\s*\}\s*from\s*"\.\/actionsColumn"/,
    )
  })

  test("actionsColumn memo gates on shouldRenderActionsColumn (returns null otherwise)", () => {
    // Pin the gate so a refactor that hardcodes "always inject" or
    // "never inject" trips here. The whole purpose of the predicate
    // is the consistent "no handler ⇒ no column" rule across grids.
    expect(serverGridSource).toMatch(
      /shouldRenderActionsColumn\(\s*\{[\s\S]*?onEdit:[\s\S]*?\}\s*\)/,
    )
  })

  test("renderColumns appends actionsColumn after consumer columns", () => {
    // The whole point: actions column is last. Source-shape pin
    // guards against a refactor that prepends or interleaves it
    // (which would break the right-pin layout + consumer CSS).
    expect(serverGridSource).toMatch(/return\s*\[\s*\.\.\.sourceColumns,\s*actionsColumn\s*\]/)
  })

  test("renderColumns picks tree.columns vs gridProps.columns based on activeMode", () => {
    // The tree row model wraps consumer columns to add the outline
    // chevron; for tree mode we MUST source from tree.columns or
    // the chevron gets stripped. Pin the branch so a refactor that
    // collapses to gridProps.columns directly trips here.
    expect(serverGridSource).toMatch(
      /sourceColumns\s*=\s*activeMode\s*===\s*"tree"\s*\?\s*tree\.columns\s*:\s*gridProps\.columns/,
    )
  })

  test("BcGrid render uses renderColumns (not gridProps.columns directly)", () => {
    expect(serverGridSource).toMatch(/columns=\{renderColumns\}/)
  })
})
