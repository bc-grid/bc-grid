import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

/**
 * Tests for the v0.5 `prepareResult` preload pull-forward (audit
 * P1-W3-2). Two layers:
 *
 *   1. `BcCellEditorPrepareParams.column` — additive type extension on
 *      the public surface, threaded through `useEditingController.start`
 *      from the four `start()` call sites in `grid.tsx`.
 *   2. Graceful prepare-rejection — `editingStateMachine` now mounts
 *      the editor with `prepareResult: undefined` instead of returning
 *      to Navigation, so vendor-lookup grids on flaky networks don't
 *      lose every cell-edit gesture (the state-machine transition
 *      itself is pinned in `editingStateMachine.test.ts`).
 *
 * The state-machine transition has its own behavioural test in
 * `editingStateMachine.test.ts`. The autocomplete `prepare` hook has
 * its own behavioural test in `packages/editors/tests/autocomplete.test.ts`.
 * This file pins the wiring through `useEditingController` + `grid.tsx`
 * + the public types via source-shape regression guards (the repo's
 * test runner is bun:test with no DOM).
 */

const here = fileURLToPath(new URL(".", import.meta.url))
const typesSource = readFileSync(`${here}../src/types.ts`, "utf8")
const controllerSource = readFileSync(`${here}../src/useEditingController.ts`, "utf8")
const gridSource = readFileSync(`${here}../src/grid.tsx`, "utf8")

describe("BcCellEditorPrepareParams.column — additive public-type extension", () => {
  test("the column field is declared on the prepare-params interface", () => {
    expect(typesSource).toMatch(
      /export interface BcCellEditorPrepareParams<TRow>\s*\{[\s\S]*?column:\s*BcReactGridColumn<TRow>/,
    )
  })

  test("the existing { row, rowId, columnId } fields are preserved", () => {
    // Pin all four fields so a future refactor that drops one trips
    // the test loudly. Pre-existing `prepare` consumers that only
    // read `row` / `rowId` / `columnId` see no behaviour change —
    // this is purely additive.
    const block =
      typesSource.match(/export interface BcCellEditorPrepareParams<TRow>\s*\{[\s\S]*?\n\}/)?.[0] ??
      ""
    expect(block).toMatch(/row:\s*TRow/)
    expect(block).toMatch(/rowId:\s*RowId/)
    expect(block).toMatch(/columnId:\s*ColumnId/)
    expect(block).toMatch(/column:\s*BcReactGridColumn<TRow>/)
  })
})

describe("useEditingController.start — column threaded into prepare", () => {
  test("start() opts type accepts column: BcReactGridColumn<TRow>", () => {
    expect(controllerSource).toMatch(/column\?:\s*BcReactGridColumn<TRow>/)
  })

  test("start() forwards column to the prepare hook", () => {
    // The prepare call site reads `opts.column` and passes it to
    // `prepare({ row, rowId, columnId, column })`. Pin both the
    // local read and the prepare call so a refactor that drops the
    // pass-through trips here instead of silently regressing the
    // autocomplete preload to the v0.4 "blank dropdown" experience.
    expect(controllerSource).toMatch(/const\s+prepareColumn\s*=\s*opts\?\.column/)
    expect(controllerSource).toMatch(/column:\s*prepareColumn/)
  })

  test("start() guards on column undefined (skips prepare instead of throwing)", () => {
    // Mirrors the existing row / rowId guards. If a caller didn't
    // pass column context, the start-fn skips the prepare hook and
    // dispatches `prepareResolved` directly so the editor mounts
    // with no preload (functionally identical to having no prepare
    // hook at all).
    expect(controllerSource).toMatch(/prepareColumn\s*===\s*undefined/)
  })
})

describe("grid.tsx — every editController.start() call passes column", () => {
  // Four activation paths today: keyboard, apiRef, body-cell single
  // click, body-cell double click. Each must thread `column` through
  // to the controller so prepare hooks (notably the new autocomplete
  // preload) see the resolved column metadata. A regression here
  // means the prepare hook silently drops back to its
  // graceful-no-column path and the dropdown stays blank.
  test("the keyboard-activation startOpts include column", () => {
    // The keyboard path builds a shared `startOpts` object and spreads
    // it into `start()` for both the printable and non-printable
    // intent branches. Pin column on the startOpts definition.
    expect(gridSource).toMatch(
      /const\s+startOpts\s*=\s*\{[\s\S]*?column:\s*cellColumn\.source[\s\S]*?\}/,
    )
  })

  test("the apiRef + body-cell click + body-cell dblclick paths include column", () => {
    // The apiRef path resolves `column` locally then passes
    // `column: column.source`. The two pointer paths inside
    // bodyCells's onClick / onDoubleClick handlers do the same.
    // Count: at least three direct `column: column.source` strings
    // (one per non-keyboard call site).
    const directPasses = gridSource.match(/column:\s*column\.source/g) ?? []
    expect(directPasses.length).toBeGreaterThanOrEqual(3)
  })
})

describe("graceful prepare-rejection (audit P1-W3-2)", () => {
  // The state-machine transition itself is pinned in
  // editingStateMachine.test.ts ("prepareRejected mounts the editor
  // with no preload"). Source-shape pin here on the announce /
  // dispatch wiring inside useEditingController so the controller
  // doesn't reintroduce a side-effect (e.g. a console.warn that
  // pollutes consumer logs, or a state-machine cancel) that the
  // graceful-fallback contract doesn't allow.
  const stateMachineSource = readFileSync(`${here}../src/editingStateMachine.ts`, "utf8")

  test("prepareRejected transitions to mounting (not navigation)", () => {
    // Pin the SHAPE of the prepareRejected branch — must produce
    // `mode: "mounting"` and must NOT include `prepareResult` (the
    // editor mounts with no preload).
    const branch =
      stateMachineSource.match(
        /if\s*\(event\.type\s*===\s*"prepareRejected"\)\s*\{[\s\S]*?\n\s*\}/,
      )?.[0] ?? ""
    expect(branch).toContain('mode: "mounting"')
    expect(branch).toContain("cell: state.cell")
    expect(branch).not.toContain("prepareResult")
  })

  test("cancel during preparing still returns to navigation (split from prepareRejected)", () => {
    // Pre-v0.5 the two events shared a branch. The split is
    // intentional — cancel is a user gesture (Esc) so abort is
    // correct; prepareRejected is an environmental failure so
    // graceful-mount is correct. Pin both to catch a re-merge
    // refactor.
    const branch =
      stateMachineSource.match(
        /if\s*\(event\.type\s*===\s*"cancel"\)\s*\{[\s\S]*?return\s*\{\s*mode:\s*"navigation"\s*\}/,
      )?.[0] ?? ""
    expect(branch.length).toBeGreaterThan(0)
  })
})
