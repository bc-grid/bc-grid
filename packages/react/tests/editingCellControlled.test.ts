import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

/**
 * Source-shape regression guards for `v06-editing-state-controlled-prop`
 * (v0.6 §1). Companion to `v06-scroll-state-controlled-prop` (#450)
 * for the "grid looks exactly as the user left it" persistence story.
 *
 * Pin:
 *   - `BcGridProps.editingCell` + `onEditingCellChange` shape
 *   - One-time restore at mount via `initialEditingCellRef`
 *   - Outbound effect derives editing cell from controller state +
 *     fires change callback only on actual change
 *   - Restore effect is gated on editingEnabled + valid row + editable
 *     column (mirrors `apiRef.startEdit` gates)
 *   - `resolveEditingCellFromState` + `cellPositionsEqual` helpers
 *
 * Behavioural correctness (consumer's `editingCell` actually mounts
 * the editor, `onEditingCellChange` fires per cell change) needs
 * DOM-mounted verification — covered by the Playwright spec at
 * `apps/examples/tests/editing-cell-restore.pw.ts`.
 *
 * Per `docs/recipes/grid-state-persistence.md` (editing-cell section).
 */

const here = fileURLToPath(new URL(".", import.meta.url))
const gridSource = readFileSync(`${here}../src/grid.tsx`, "utf8")
const typesSource = readFileSync(`${here}../src/types.ts`, "utf8")

describe("public type surface — editingCell + onEditingCellChange on BcGridProps", () => {
  test("BcGridProps exposes editingCell as BcCellPosition | null", () => {
    expect(typesSource).toMatch(/editingCell\?:\s*BcCellPosition\s*\|\s*null/)
  })

  test("BcGridProps exposes onEditingCellChange with the documented signature", () => {
    expect(typesSource).toMatch(
      /onEditingCellChange\?:\s*\([\s\S]*?next:\s*BcCellPosition\s*\|\s*null,\s*prev:\s*BcCellPosition\s*\|\s*null[\s\S]*?\)\s*=>\s*void/,
    )
  })

  test("editingCell JSDoc cross-references initialScrollOffset (companion props)", () => {
    // Pin the cross-reference so a doc sweep doesn't strip the
    // load-bearing context that ties this to the broader
    // state-persistence story.
    expect(typesSource).toMatch(/companion[\s\S]*?initialScrollOffset/)
  })

  test("editingCell is documented as one-time restore (NOT fully controlled)", () => {
    // The editor's async lifecycle (prepare → mount → editing →
    // unmount) makes a fully-controlled `editingCell` race-prone.
    // Pin the restore-only documentation so a future maintainer
    // doesn't try to make it a fully bidirectional controlled prop
    // (which would break the editor mid-edit on prop updates).
    expect(typesSource).toMatch(/Read on first render only/)
  })
})

describe("grid.tsx — outbound onEditingCellChange + inbound editingCell restore", () => {
  test("outbound effect captures previousEditingCellRef + fires only on change", () => {
    // Pin the dedup gate (`cellPositionsEqual(next, prev)`) so a
    // refactor that fires on every render — even when the cell
    // hasn't changed — doesn't quietly burn consumer's persistence
    // budget. Mirrors the contract `onScrollChange` debounces for.
    expect(gridSource).toMatch(/previousEditingCellRef\s*=\s*useRef<BcCellPosition\s*\|\s*null>/)
    expect(gridSource).toMatch(/if\s*\(cellPositionsEqual\(next,\s*prev\)\)\s*return/)
  })

  test("outbound effect derives editing cell from editController.editState", () => {
    expect(gridSource).toMatch(/resolveEditingCellFromState\(editController\.editState\)/)
  })

  test("outbound effect fires onEditingCellChangeProp (not the raw prop)", () => {
    // Pin the captured-ref pattern so the effect's deps array
    // doesn't include `props` (which would re-fire on every render).
    expect(gridSource).toMatch(/onEditingCellChangeProp\(next,\s*prev\)/)
  })

  test("inbound restore captures editingCell once at mount via ref", () => {
    // Mirrors `initialScrollOffsetRef` from #450. The prop is read
    // on first render only; subsequent updates are ignored.
    expect(gridSource).toMatch(/initialEditingCellRef\s*=\s*useRef\(props\.editingCell\)/)
  })

  test("inbound restore is gated on editingEnabled + navigation mode", () => {
    // Don't restore if the consumer disabled editing OR if the
    // controller is already in a non-navigation mode (e.g. another
    // restore path beat us). Pin both guards.
    expect(gridSource).toMatch(/if\s*\(!editingEnabled\)\s*return/)
    expect(gridSource).toMatch(
      /if\s*\(editController\.editState\.mode\s*!==\s*"navigation"\)\s*return/,
    )
  })

  test("inbound restore is gated on valid data row + editable column", () => {
    // The cell may not exist (server data hasn't loaded, column was
    // hidden, etc.); the early-return makes restore a no-op so the
    // consumer can re-trigger via apiRef.startEdit once data lands.
    // Pin the row-kind + isCellEditable checks.
    expect(gridSource).toMatch(/if\s*\(!rowEntry\s*\|\|\s*rowEntry\.kind\s*!==\s*"data"\)\s*return/)
    expect(gridSource).toMatch(/if\s*\(!isCellEditable\(column,\s*rowEntry\.row\)\)\s*return/)
  })

  test("inbound restore calls editController.start with activation: 'api'", () => {
    // Mirrors `apiRef.startEdit` so the editor's source telemetry
    // attribution is consistent — programmatic restore = "api"
    // source, distinguishable from user gestures.
    expect(gridSource).toMatch(
      /editController\.start\(target,\s*"api",\s*\{[\s\S]*?editor:[\s\S]*?row:[\s\S]*?column:/,
    )
  })

  test("inbound restore effect deps array is empty (read once at mount)", () => {
    // Pin the empty-deps + the suppression so a refactor that
    // adds `editingEnabled` etc. as deps doesn't accidentally
    // re-trigger restore on every prop change.
    const region =
      gridSource.match(
        /initialEditingCellRef[\s\S]*?\}, \[\][\s\S]*?\)\s*\n\s*\n\s*\/\/ Pixel rect/,
      )?.[0] ?? ""
    expect(region.length).toBeGreaterThan(0)
    expect(region).toMatch(/biome-ignore lint\/correctness\/useExhaustiveDependencies/)
  })
})

describe("resolveEditingCellFromState helper — pure derivation", () => {
  test("returns null in navigation mode", () => {
    // The function lives at module scope in grid.tsx; pin its
    // shape via source-shape regression so a refactor doesn't
    // change the navigation → null mapping.
    expect(gridSource).toMatch(
      /resolveEditingCellFromState[\s\S]*?if\s*\(state\.mode\s*===\s*"navigation"\)\s*return null/,
    )
  })

  test("returns the cell from any non-navigation mode", () => {
    expect(gridSource).toMatch(
      /resolveEditingCellFromState[\s\S]*?return state\.cell\s*\?\?\s*null/,
    )
  })
})

describe("cellPositionsEqual helper — narrow equality contract", () => {
  test("identity short-circuit", () => {
    expect(gridSource).toMatch(/cellPositionsEqual[\s\S]*?if\s*\(a\s*===\s*b\)\s*return true/)
  })

  test("nullish handling — both null is equal, one null is not", () => {
    expect(gridSource).toMatch(
      /cellPositionsEqual[\s\S]*?if\s*\(a\s*==\s*null\s*\|\|\s*b\s*==\s*null\)\s*return false/,
    )
  })

  test("compares rowId + columnId", () => {
    expect(gridSource).toMatch(
      /cellPositionsEqual[\s\S]*?return a\.rowId\s*===\s*b\.rowId\s*&&\s*a\.columnId\s*===\s*b\.columnId/,
    )
  })
})
