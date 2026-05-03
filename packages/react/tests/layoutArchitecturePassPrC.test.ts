import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

/**
 * Tests for the v0.6 layout architecture pass PR (c) — the cleanup
 * leg that closes RFC §4 memos 3 (editor portal mispositioning) and
 * 4 (flex distribution single source of truth). PR (a) (#415) already
 * shipped the structural sticky-positioning rewrite; PR (c)
 * consolidates the band-aids that PR (a)'s structural change made
 * unnecessary.
 *
 * The repo's test runner is bun:test with no DOM, so this is a
 * source-shape regression suite covering:
 *
 *   1. `useViewportSync` renamed → `useViewportSize`, no longer
 *      depends on `virtualizer` (so the hook can run early in
 *      grid.tsx, before the virtualizer is constructed).
 *   2. `availableGridWidth` ResizeObserver + state are deleted from
 *      grid.tsx — `viewport.width` from `useViewportSize` is the
 *      single source of truth that feeds `resolveColumns`.
 *   3. `editorCellRect` `useMemo` no longer depends on
 *      `expansionState` and the biome `useExhaustiveDependencies`
 *      suppression at the memo head is gone.
 *   4. The §13 design.md decisions table has the layout pass entry.
 *
 * Behavioural correctness (the actual sticky positioning, the
 * flex-distribution math) is covered by:
 *   - `gridInternals.test.ts` for the existing `useViewportSync` /
 *     `useViewportSize` ResizeObserver behaviour (preserved).
 *   - Coordinator-run Playwright specs (RFC §9) for the
 *     end-to-end behaviour.
 */

const here = fileURLToPath(new URL(".", import.meta.url))
const gridSource = readFileSync(`${here}../src/grid.tsx`, "utf8")
const internalsSource = readFileSync(`${here}../src/gridInternals.ts`, "utf8")
const designSource = readFileSync(
  fileURLToPath(new URL("../../../docs/design.md", import.meta.url)),
  "utf8",
)

describe("useViewportSize — renamed + virtualizer-agnostic", () => {
  test("the hook is exported under the new name", () => {
    expect(internalsSource).toMatch(/export function useViewportSize\(/)
  })

  test("the legacy `useViewportSync` symbol is gone (RFC §10 hard-delete, no alias)", () => {
    expect(internalsSource).not.toMatch(/export function useViewportSync\(/)
    expect(internalsSource).not.toMatch(/useViewportSync,/)
  })

  test("UseViewportSizeParams does not require a Virtualizer", () => {
    // The whole point of the rename is breaking the circular dep —
    // virtualizer.setViewport now happens in a downstream useEffect
    // in grid.tsx, not inside the hook.
    const block =
      internalsSource.match(/export interface UseViewportSizeParams\s*\{[\s\S]*?\n\}/)?.[0] ?? ""
    expect(block).not.toMatch(/virtualizer:/i)
    expect(block).toMatch(/scrollerRef:/)
    expect(block).toMatch(/fallbackBodyHeight\?:/)
    expect(block).toMatch(/requestRender:/)
  })

  test("fallbackBodyHeight defaults to DEFAULT_BODY_HEIGHT (early-call ergonomics)", () => {
    // `useViewportSize` runs BEFORE the late `resolveFallbackBodyHeight`
    // computation in grid.tsx. The default lets the early call avoid
    // threading a placeholder.
    expect(internalsSource).toMatch(
      /fallbackBodyHeight\s*=\s*DEFAULT_BODY_HEIGHT[\s\S]*?\n\s*requestRender,/,
    )
  })

  test("the hook body no longer calls virtualizer.setViewport", () => {
    // Pin the dep removal at the implementation level — the rename
    // is meaningless if the implementation still reaches for the
    // virtualizer (which it can't, structurally, but pin it anyway).
    const fnBody =
      internalsSource.match(/export function useViewportSize\([\s\S]*?\n\}\n/)?.[0] ?? ""
    expect(fnBody).not.toMatch(/virtualizer\.setViewport/)
  })
})

describe("grid.tsx — availableGridWidth deleted, viewport.width is the source of truth", () => {
  test("availableGridWidth state is gone", () => {
    // The pre-v0.6 useState + ResizeObserver pair lived around line
    // 385. PR (c) deletes both — the replacement is `useViewportSize`
    // running early.
    expect(gridSource).not.toMatch(/availableGridWidth/)
    expect(gridSource).not.toMatch(/setAvailableGridWidth/)
  })

  test("useViewportSize is called early (before virtualizer construction)", () => {
    // The hook needs to be called BEFORE `resolveColumns` (which
    // depends on `viewport.width`). Pin that the call site is on
    // the requestRender side of the file (early), not the late
    // virtualizer side.
    expect(gridSource).toMatch(/useViewportSize\(\{\s*scrollerRef,\s*requestRender\s*\}\)/)
  })

  test("resolveColumns calls now read viewport.width instead of availableGridWidth", () => {
    // Two call sites in grid.tsx (consumerResolvedColumns +
    // resolvedColumns). Both must source from viewport.width.
    expect(gridSource).toMatch(
      /resolveColumns\(columns,\s*columnState,\s*viewport\.width\s*\|\|\s*undefined\)/,
    )
    expect(gridSource).toMatch(
      /resolveColumns\(layoutColumnDefinitions,\s*columnState,\s*viewport\.width\s*\|\|\s*undefined\)/,
    )
  })

  test("a small downstream effect feeds viewport into virtualizer.setViewport", () => {
    // The virtualizer wiring that used to live inside
    // `useViewportSync` now lives as a focused effect in grid.tsx —
    // pin the shape so a refactor doesn't quietly drop the
    // virtualizer hand-off.
    expect(gridSource).toMatch(
      /virtualizer\.setViewport\(viewport\.height,\s*viewport\.width\)[\s\S]{0,200}?requestRender\(\)/,
    )
  })

  test("only one ResizeObserver remains in grid.tsx (inside useViewportSize)", () => {
    // Pre-v0.6 had two: the deleted availableGridWidth observer +
    // the one in useViewportSync. PR (c) collapses to one.
    // grid.tsx itself shouldn't construct any ResizeObserver
    // anymore — they all live in gridInternals.ts.
    expect(gridSource).not.toMatch(/new ResizeObserver/)
  })
})

describe("editorCellRect — expansionState dep + lint suppression dropped", () => {
  test("the biome useExhaustiveDependencies suppression is gone", () => {
    // The pre-v0.6 useMemo had a `// biome-ignore lint/correctness/
    // useExhaustiveDependencies` line directly above it because
    // `expansionState` was an invalidation-only dep. With sticky-
    // positioned cells from PR (a), the dep is unnecessary and the
    // suppression goes with it.
    expect(gridSource).not.toMatch(
      /biome-ignore[^\n]*useExhaustiveDependencies[^\n]*\n\s*const editorCellRect = useMemo/,
    )
  })

  test("the editorCellRect useMemo deps array no longer includes expansionState", () => {
    // Pin the deps array shape. A refactor that re-adds
    // `expansionState` here would quietly regress the perf
    // characteristics PR (c) is trying to lock in (the memo would
    // re-run every detail-panel toggle even though the result
    // doesn't change).
    const memoBlock =
      gridSource.match(/const editorCellRect = useMemo\([\s\S]*?\}\,\s*\[[\s\S]*?\]\s*\)/)?.[0] ??
      ""
    expect(memoBlock.length).toBeGreaterThan(0)
    const depsArray = memoBlock.match(/\[\s*([\s\S]*?)\s*\]\s*\)$/)?.[1] ?? ""
    expect(depsArray).not.toMatch(/\bexpansionState\b/)
  })

  test("the JSDoc above editorCellRect explains the simplification", () => {
    // Pin the cross-reference to the layout RFC + the rationale
    // (sticky positioning means the rect reads correctly without
    // an explicit invalidation hint). A future doc sweep that
    // strips this comment loses the structural context.
    expect(gridSource).toMatch(/Pre-PR \(a\) of `layout-architecture-pass-rfc\.md`/)
  })
})

describe("docs/design.md — §13 decisions table + §6.3 render graph", () => {
  test("§13 has a 2026-05-03 row for the layout architecture pass", () => {
    expect(designSource).toMatch(
      /\| 2026-05-03 \| \*\*Layout architecture pass[\s\S]*?Closes layout-architecture-pass-rfc\.md/,
    )
  })

  test("§6.3 mentions .bc-grid-viewport as the single scroll container", () => {
    // §6.3 is the layout DOM structure. PR (c) updates it to
    // describe the post-v0.6 render graph (single viewport, sticky
    // positioning, no scroll-sync helpers).
    const sectionStart = designSource.indexOf("### 6.3 Layout (DOM structure)")
    const sectionEnd = designSource.indexOf("### 6.4", sectionStart)
    const section = designSource.slice(sectionStart, sectionEnd)
    expect(section).toMatch(/\.bc-grid-viewport/)
    expect(section).toMatch(/single scroll container/i)
    expect(section).toMatch(/position:\s*sticky/i)
  })

  test("§6.3 explains the chicken-and-egg consolidation in useViewportSize", () => {
    // The rationale belongs in design.md so a future reader can
    // understand why the hook split exists (vs. being tempted to
    // merge them back together).
    const sectionStart = designSource.indexOf("### 6.3 Layout (DOM structure)")
    const sectionEnd = designSource.indexOf("### 6.4", sectionStart)
    const section = designSource.slice(sectionStart, sectionEnd)
    expect(section).toMatch(/useViewportSize/)
    expect(section).toMatch(/circular dep/i)
  })
})
