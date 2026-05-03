import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

/**
 * Source-shape regression guards for `v06-editor-focus-retention-on-rerender`
 * (v0.6 §1, follow-up to bsncraft 0.5.0 GA P0 fix #451). The
 * editor portal's focus contract: when an editor is mounted and the
 * grid re-renders for an unrelated reason (a `data` prop swap, an
 * unrelated state change, a server-grid re-fetch), focus stays on
 * the input — the editor does NOT unmount/remount.
 *
 * The contract is enforced by:
 *   1. `EditorMount`'s mount/unmount `useLayoutEffect` deps array
 *      excludes `rowEntry.row`, `column.source`, `initialValue` —
 *      values that change on every server-grid re-fetch (#451 fix).
 *      Without the exclusion, the cleanup re-fires on every re-fetch
 *      → spurious scroll-out commit → editor unmounts → focus drops.
 *   2. The cleanup reads those values from refs at cleanup time so it
 *      sees the latest values without forcing the effect to re-run.
 *   3. The `<EditorMount>` element is rendered without an unstable
 *      `key` prop so React reconciles it across parent re-renders
 *      (the rendered element type + position stay constant).
 *
 * This file pins the wiring shape so a refactor that re-introduces
 * any of `rowEntry.row` / `column.source` / `initialValue` to the
 * deps array — re-opening the focus-drop window — trips here.
 *
 * Behavioural correctness (DOM focus survives a forced re-render)
 * needs the Playwright spec at
 * `apps/examples/tests/editor-focus-retention.pw.ts` which the
 * coordinator runs at merge.
 *
 * Per `docs/recipes/editor-focus-retention.md`.
 */

const here = fileURLToPath(new URL(".", import.meta.url))
const editorPortalSource = readFileSync(`${here}../src/editorPortal.tsx`, "utf8")
const gridSource = readFileSync(`${here}../src/grid.tsx`, "utf8")

describe("EditorMount mount/unmount effect — bsncraft #451 deps array contract", () => {
  // The mount/unmount useLayoutEffect drives the editor's focus +
  // scroll-out detection. Its deps array MUST NOT include values
  // that change on every server-grid re-fetch, or the cleanup
  // re-fires and the editor unmounts under the user.

  test("mount effect deps array exists with the documented members", () => {
    // Pin the exact deps so a refactor that adds rowEntry.row /
    // column.source / initialValue to satisfy a new lint rule
    // re-introduces the focus-drop bug. The deps that ARE included
    // are stable across re-renders by construction (refs / dispatch
    // callbacks / activeCell.rowId+columnId which only change on
    // edit-cell change).
    expect(editorPortalSource).toMatch(
      /\}, \[\s*dispatchMounted,\s*dispatchUnmounted,\s*virtualizer,\s*rowIndex,\s*colIndex,\s*mountStyle,\s*editScrollOutAction,\s*getEditMode,\s*cell\.rowId,\s*cell\.columnId,?\s*\]/,
    )
  })

  test("rowEntry.row is NOT in the mount-effect deps (would re-fire on every server fetch)", () => {
    // Negative pin: any line inside the deps array literal
    // mentioning rowEntry.row would trip here. Without this guard
    // the bsncraft 0.5.0 GA P0 #451 regression would silently come
    // back.
    const depsBlock = editorPortalSource.match(/\}, \[\s*dispatchMounted,[\s\S]*?\]/)?.[0] ?? ""
    expect(depsBlock.length).toBeGreaterThan(0)
    expect(depsBlock).not.toMatch(/rowEntry\.row/)
    expect(depsBlock).not.toMatch(/column\.source/)
    expect(depsBlock).not.toMatch(/initialValue/)
  })

  test("cleanup-time refs (cleanupRowRef / cleanupColumnSourceRef / cleanupInitialValueRef) exist", () => {
    // The cleanup needs latest values WITHOUT forcing the effect
    // to re-run. Refs are the workaround. Pin their existence so a
    // refactor that drops them (e.g. inlining the cleanup body)
    // forces back into the broken pattern.
    expect(editorPortalSource).toMatch(/cleanupRowRef\s*=\s*useRef\(rowEntry\.row\)/)
    expect(editorPortalSource).toMatch(/cleanupColumnSourceRef\s*=\s*useRef\(column\.source\)/)
    expect(editorPortalSource).toMatch(/cleanupInitialValueRef\s*=\s*useRef\(initialValue\)/)
  })

  test("rationale comment cites the bsncraft #451 reasoning (load-bearing context)", () => {
    // Pin the explanatory comment so a doc sweep doesn't strip the
    // load-bearing context. Without it, a future worker is liable
    // to "tidy" the deps array and re-introduce the bug.
    expect(editorPortalSource).toMatch(/Bsncraft v0\.5\.0 GA P0/)
    expect(editorPortalSource).toMatch(/spurious scroll-out commit/)
  })
})

describe("EditorMount initial focus on mount — focusRef.current?.focus()", () => {
  test("initial focus is applied via the same useLayoutEffect that dispatches mounted", () => {
    // Pin the focus-on-mount call. If a refactor moves it to a
    // separate effect, that effect's deps could differ from the
    // mount-effect's deps and the focus could be re-applied on
    // every re-render (causing focus stealing from popovers /
    // chips). Pin co-location with dispatchMounted.
    expect(editorPortalSource).toMatch(
      /useLayoutEffect\(\(\)\s*=>\s*\{\s*focusRef\.current\?\.focus\(\{\s*preventScroll:\s*true\s*\}\)\s*\n\s*dispatchMounted\(\)/,
    )
  })

  test("preventScroll: true is preserved (no scroll jank when entering edit mode)", () => {
    // When the active cell isn't in the viewport, focusing without
    // preventScroll causes the browser to scrollIntoView, conflicting
    // with the grid's own scroll math. Pin the option.
    expect(editorPortalSource).toMatch(
      /focusRef\.current\?\.focus\(\{\s*preventScroll:\s*true\s*\}\)/,
    )
  })
})

describe("EditorMount instance stability — no unstable key prop", () => {
  test("EditorPortal renders <EditorMount> without an unstable key (React reconciles by position)", () => {
    // React's reconciliation keeps the EditorMount instance across
    // parent re-renders as long as the element type + position +
    // key stay stable. No key prop = position-based reconciliation,
    // which is what we want for focus retention. Pin the absence
    // so a refactor that adds e.g. `key={rowId}` would unmount the
    // editor on every re-render (key change forces remount).
    const portalRender = editorPortalSource.match(/<EditorMount[\s\S]*?\/>/g) ?? []
    expect(portalRender.length).toBeGreaterThan(0)
    for (const region of portalRender) {
      // No key= attribute. The string `key=` is allowed inside
      // multi-line JSX comments / strings only — but JSX attributes
      // with `key=` would match.
      expect(region).not.toMatch(/\skey=\{/)
    }
  })

  test("grid.tsx renderInCellEditor returns <EditorMount> without an unstable key", () => {
    // Same contract for the in-cell mount path. The
    // renderInCellEditor callback returns an EditorMount that
    // bodyCells embeds directly into the cell DOM. Adding a `key`
    // here would force remount on every cell render → focus drop.
    const renderRegion =
      gridSource.match(
        /renderInCellEditor[\s\S]*?return\s*\(\s*<EditorMount[\s\S]*?\/>\s*\)/,
      )?.[0] ?? ""
    expect(renderRegion.length).toBeGreaterThan(0)
    expect(renderRegion).not.toMatch(/\skey=\{/)
  })
})
