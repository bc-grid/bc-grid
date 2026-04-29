# Virtualizer Impl — Plan

**Status:** Draft, ready for review
**Owner:** c1 (Claude) — assumed; reassign as needed
**Branch (planned):** `agent/c1/virtualizer-impl`
**Blocked on:** `virtualizer-spike-v2` (PR #9) merge + `core-types` (PR #14) merge
**Effort:** 2-3 weeks per `queue.md`

---

## 1. Scope

The spike validated that the architecture hits the perf bar. The impl makes it production-shaped: the algorithms scale to the long tail of measurement-heavy and animation-heavy workloads, the API matches `api.md §9`, the package is consumable by `@bc-grid/react`, and the contract from `accessibility-rfc` is fully delivered (not just the smoke-test cases the spike covered).

Concretely, the impl ships:

- The same `Virtualizer` engine + `DOMRenderer` shape, but with the algorithm + retention upgrades listed in §3.
- A public package surface that matches `api.md §9` for `@bc-grid/virtualizer`.
- Pinned-row support in `DOMRenderer` (the spike scoped to pinned columns only).
- A nightly perf harness that catches regressions on the design.md §3.2 memory bar (the spike only validated FPS).
- Browser breadth: Chromium / Firefox / WebKit functional parity, already gated in CI as of PR #9.

The impl does **not** ship:

- React adapter (`useBcGridApi`, `<BcGrid>`) — that's `react-impl-v0`.
- Editor protocol, range selection, master-detail — those are Q2 / Q3.
- Server-row-model integration — that's Q4 (`server-row-model` package).

## 2. Pre-conditions for kickoff

These must be merged to main before the impl branches:

- **PR #9 (virtualizer-spike-v2)** — establishes the baseline architecture and the public class shape (`Virtualizer`, `DOMRenderer`, `RenderCellParams`, etc.). The impl is hardening, not redesign.
- **PR #14 (core-types)** — `@bc-grid/core` exports the types the impl needs to consume (`BcCellPosition`, `BcScrollAlign`, `BcScrollOptions`).
- **NVDA + VoiceOver spot-check on PR #9** — methodology in the spike report; must produce a green pass before merge per the queue task. Until that lands the architecture isn't validated to ship; the impl shouldn't begin from a maybe-broken baseline.

If `theming-impl` (PR #15) and `animations-impl` (PR #16) merge in parallel, that's fine — neither is a hard pre-condition. (But see §6 on class-name coordination with theming.)

## 3. Algorithmic upgrades from spike → impl

### 3.1 Fenwick tree for cumulative offsets

**Spike behaviour.** `ensureRowOffsets` rebuilds the `rowOffsetsCache` array in O(N) every time any row's height changes. With 100k rows and frequent measurements (e.g., dynamic auto-row-height triggered by content reflow), this dominates render cost.

**Impl behaviour.** Replace the flat array with a Fenwick (binary indexed) tree. Update O(log N), prefix-sum query O(log N), point query O(log N) by computing prefix(i) − prefix(i−1).

**Why now, not in the spike.** The spike measured 60 FPS at uniform heights. Fenwick wins only when heights change frequently — the case for editable grids that re-measure on every commit, or grids with auto-sizing rows. Below that threshold, the flat-array rebuild was fine. Production has to handle the threshold.

**Acceptance:** the variable-height Playwright test still passes at ≥58 FPS local, and a new perf-stress test that mutates 1000 row heights then scrolls stays at ≥58 FPS. The flat-array baseline almost certainly fails the latter.

### 3.2 In-flight retention set

**Spike behaviour.** `retainRow` / `retainCol` keep cells in DOM for focus/active-cell scenarios. The spike harness retains the active row.

**Production gap.** `@bc-grid/animations`' `flip()` returns Animation objects that complete asynchronously. While an animation is in flight, the cell's DOM node *must not* be recycled — otherwise the animation flickers through a recycled node mid-flight, or fails to find the element.

**Impl design.** Add a parallel `inFlightRows` / `inFlightCols` set to `Virtualizer`. `DOMRenderer.beginAnimation(rowIndex, colIndex)` adds to the set; the returned handle's `release()` removes it. The recycling pass in `render()` checks this set in addition to `retainedRows`.

```ts
class Virtualizer {
  private inFlightRows = new Set<number>()
  beginInFlightRow(index: number): { release(): void } { ... }
}
```

The `@bc-grid/animations.flip()` integration will call `beginInFlightRow` per affected row before triggering the animation, then `release()` on `animation.finished`.

**Acceptance:** a test that triggers a 1000-row sort animation, mid-animation scrolls the body 50,000 px down, and asserts that every animating row's DOM node is still mounted at every frame until the animation completes.

### 3.3 ResizeObserver RAF throttling

**Spike behaviour.** `ResizeObserver` callback invokes `setViewport` and `render()` synchronously. During continuous drag-resize this fires at sub-frame frequency, costing an unbounded amount of layout work.

**Impl behaviour.** Throttle to RAF — coalesce all observed-size changes into a single render at the next frame.

```ts
private resizePending = false
this.resizeObserver = new ResizeObserver(() => {
  if (this.resizePending) return
  this.resizePending = true
  requestAnimationFrame(() => {
    this.resizePending = false
    this.virtualizer.setViewport(this.scroller.clientHeight, this.scroller.clientWidth)
    this.render()
  })
})
```

**Acceptance:** a test that drives 100 ResizeObserver entries in a tight loop and asserts only one `render()` ran.

### 3.4 Pinned-row DOMRenderer support

**Spike behaviour.** The `Virtualizer` engine returns pinned-top / pinned-bottom rows correctly in `computeWindow()`. The `DOMRenderer` doesn't render them as sticky regions — they're treated as body rows.

**Impl behaviour.** Pinned rows use the same JS-driven translate3d approach as pinned columns:

- pinned-top: `transform: translate3d(0, scrollTop, 0)` per row, anchoring it to the scroller's top edge
- pinned-bottom: `transform: translate3d(0, scrollTop + viewportHeight - totalHeight, 0)`

Updates synchronously in `handleScroll`, same pattern as `updatePinnedTransforms` for columns.

The intersection cell of a pinned row × pinned column gets both transforms — which composes correctly because each axis only adds to its own component.

**Acceptance:** Playwright tests for pinned-top, pinned-bottom, and the four pinned×pinned intersection cells (top-left, top-right, bottom-left, bottom-right). Each must stay anchored to its viewport corner under any scroll.

### 3.5 Memory bar harness

**design.md §3.2 nightly bar:** "Grid overhead memory < 30MB above raw dataset size." The spike doesn't measure this.

**Impl harness.** A new test mode in `apps/benchmarks` that:

1. Mounts the harness with 100k × 30 cells and lets the JS heap settle.
2. Snapshots heap via Chrome DevTools Protocol (Playwright's `page.evaluate` + `performance.measureUserAgentSpecificMemory()` where supported, or CDP `HeapProfiler.takeHeapSnapshot` parsing).
3. Unmounts the grid; lets the heap settle again.
4. Computes the diff.

Asserts diff < 30MB nightly. Daily fluctuation expected; CI uses the median of 3 runs.

The harness is its own task (`nightly-perf-harness`) — file under §7 below. The virtualizer-impl uses it but doesn't build it.

## 4. Public API surface

`@bc-grid/virtualizer` exports per `api.md §9`:

```ts
export { Virtualizer }
export type {
  VirtualItem,
  VirtualOptions,
  VirtualizerA11yInput,
  VirtualRowA11yMeta,
  VirtualColumnA11yMeta,
}
```

The spike currently exports:

```ts
export { Virtualizer, DOMRenderer }
export type {
  VirtualizerOptions,    // → rename to VirtualOptions to match api.md
  VirtualRow,             // → matches "VirtualItem" semantics
  VirtualCol,
  VirtualWindow,
  RenderCellParams,
  ScrollAlign,            // → re-export from @bc-grid/core as BcScrollAlign
  DOMRendererOptions,
}
```

Resolution (impl):

| Spike export | Impl name | Notes |
|---|---|---|
| `Virtualizer` | `Virtualizer` | unchanged |
| `DOMRenderer` | `DOMRenderer` | kept; api.md doesn't list but impl needs to export for the React layer |
| `VirtualizerOptions` | `VirtualOptions` | rename to match api.md |
| `VirtualRow`, `VirtualCol` | `VirtualItem` | unify under one type with axis discriminator |
| `VirtualWindow` | `VirtualWindow` | unchanged (not in api.md but useful) |
| `ScrollAlign` | (consume) `BcScrollAlign` from `@bc-grid/core` | dedupe |
| — | `VirtualizerA11yInput` | new — see §4.1 |
| — | `VirtualRowA11yMeta`, `VirtualColumnA11yMeta` | new — see §4.1 |

### 4.1 A11y input types

`VirtualizerA11yInput` is the contract the React layer passes to the virtualizer to enable correct ARIA wrapping. From `accessibility-rfc §Virtualization Contract`:

```ts
interface VirtualizerA11yInput {
  rowCount: number          // total dataset rows (for aria-rowcount)
  colCount: number          // total cols (for aria-colcount)
  retainedRows: number[]    // active + retained rows (max 2 per a11y RFC)
  retainedCols: number[]    // typically just the active col
}

interface VirtualRowA11yMeta {
  index: number
  ariaRowIndex: number      // 1-based, full dataset
  isActive: boolean
}

interface VirtualColumnA11yMeta {
  index: number
  ariaColIndex: number
  isActive: boolean
}
```

These get attached to the `VirtualItem` output of `computeWindow()` so the renderer can stamp ARIA attrs without re-deriving them.

## 5. Class-name resolution

The spike's `DOMRenderer` emits kebab-case (`.bc-grid-row`, `.bc-grid-cell`, `.bc-grid-cell-pinned-left`). PR #15 (theming-impl) emits BEM (`.bc-grid__row`, `.bc-grid__cell`). The impl needs the convention locked in `design.md §13` decision log so:

1. The renderer's class names match what the theming package styles.
2. Future packages don't drift again.

**Recommended convention (kebab-case):**

- Elements: `.bc-grid`, `.bc-grid-scroller`, `.bc-grid-canvas`, `.bc-grid-row`, `.bc-grid-cell`
- Variants: `.bc-grid-cell-pinned-left`, `.bc-grid-cell-pinned-right`, `.bc-grid-cell-pinned-top`, `.bc-grid-cell-pinned-bottom`
- States: `data-density="compact|normal|comfortable"`, `data-bc-grid-active-cell="true"`, `aria-selected="true"`, `aria-invalid="true"`

**Why kebab over BEM:**

- Aligns with AG Grid's convention (`.ag-row`, `.ag-cell`, `.ag-cell-pinned-left`) — minimum cognitive load for users migrating.
- Aligns with shadcn/Tailwind/CSS-modules ecosystem precedent.
- The `bc-grid-` prefix already disambiguates "grid-block, row-element" without needing `__`.
- Single-hyphen class names are slightly shorter, which matters at scale (hundreds of cells per grid).

This decision blocks PR #15. It needs to land in design.md §13 before either:

- The impl starts (so the renderer's class names don't change between iterations), or
- PR #15 merges (so theming styles target classes that exist).

I'd recommend a small prep PR that adds the §13 entry + nothing else, so PR #15 and the impl can both rebase off a single source of truth.

## 6. Integration boundaries

### 6.1 With `@bc-grid/core` (PR #14)

The impl consumes:
- `BcCellPosition`, `BcScrollAlign`, `BcScrollOptions` for typed method signatures
- `RowId`, `ColumnId` for any future row/column-id-aware APIs (the spike uses indexes; api.md §6.1 uses `BcCellPosition` which means rowId/columnId — the impl needs to translate between both)

Open question: does the virtualizer track indexes or row IDs? Indexes are cheaper (current spike). Row IDs survive sort/filter. The accessibility-rfc requires retained-cell DOM nodes to *survive* re-orderings, which means the retention set must be keyed by row ID, not index. Resolution: retained set keyed by `RowId`, but `computeWindow()` still emits index-based output for the renderer. The translation happens at the boundary.

This is the riskiest part of the impl. Will write a sub-RFC if the index-vs-rowId boundary turns out to be more than a thin shim.

### 6.2 With `@bc-grid/animations` (PR #16)

`@bc-grid/animations.flip()` calls into `Virtualizer.beginInFlightRow(index)` to mark rows as held during animation. The animations package becomes a peer dep of the React layer; the virtualizer doesn't import it (engine layer stays framework + sibling-package free).

The integration shape:

```ts
// In @bc-grid/react (not the virtualizer)
const handles = rowsToAnimate.map(idx => virtualizer.beginInFlightRow(idx))
const animations = flip(targets, { budget })
animations.forEach((a, i) => a.finished.finally(() => handles[i]?.release()))
```

The virtualizer just exposes the in-flight set; animations don't own it.

### 6.3 With `@bc-grid/theming` (PR #15)

Pure CSS. Consumers do `import "@bc-grid/theming/styles.css"` and the styles target the renderer's class names. No code linkage.

Once §5's class-name decision lands, theming and the impl renderer agree on selectors with no shared imports.

### 6.4 With `@bc-grid/react` (later)

The React layer wraps `Virtualizer` + `DOMRenderer` in a component. It supplies `BcCellRendererParams` to map from `RenderCellParams` (renderer-internal) to the React-aware type. It owns the `BcGridApi` surface and routes:

- `scrollToCell(position)` → `Virtualizer.scrollOffsetForRow/Col` → DOM scroll
- `isCellVisible(position)` → `Virtualizer.isCellVisible(rowIndex, colIndex)` after rowId→index translation
- `focusCell(position)` → set active cell via the activedescendant pattern from `accessibility-rfc`

The impl doesn't write any of this — it provides the engine that the React layer wraps.

## 7. Test plan

Unit (Bun, in `packages/virtualizer/tests/`):
- Fenwick tree correctness vs naive cumulative-offset baseline (delta tests over 1000 random updates)
- In-flight retention: cells held across animation lifecycle
- ResizeObserver RAF coalescing: 100 entries → 1 render
- All spike tests still pass (regression gate)

E2E (Playwright, in `apps/benchmarks/tests/`):
- All spike tests pass in Chromium + Firefox + WebKit
- Pinned-top stays anchored under vertical scroll
- Pinned-bottom stays anchored under vertical scroll
- 4 corner-intersection cells stay anchored under any scroll combo
- 1000-row sort animation: every row's DOM node persists for animation duration
- ResizeObserver: drag-resize doesn't drop frames

Perf (nightly, on `apps/benchmarks` via the new `nightly-perf-harness` task):
- 100k × 30 grid: Chrome trace shows ≥58 FPS sustained
- Memory: 100k × 30 mounted vs unmounted heap diff < 30MB (median of 3)
- 1000 in-flight animations: Chrome trace ≥58 FPS

## 8. Risks + open questions

### 8.1 Index ↔ row ID translation (medium risk)

Discussed in §6.1. If retention has to be rowId-keyed, the public API changes shape. Resolution: write a small RFC inside this doc or as a sibling design doc once the impl starts and the boundary is concrete.

### 8.2 Fenwick tree implementation cost (low risk)

Fenwick over a 100k-element array is ~50 lines of code. Standard. The cost is correctness — off-by-one bugs in 1-indexed prefix-sum trees are common. Mitigation: copy from a battle-tested implementation (e.g., MIT-licensed `fenwick-tree` npm package — verify license + audit before pulling in, alternative is hand-rolled with comprehensive unit tests).

### 8.3 ResizeObserver scope (low risk)

The spike attaches ResizeObserver to the scroller. If consumers nest the grid in a flex container that re-measures on parent reflow, the cascade could be costly. Mitigation: the impl observes the scroller only (not children); children that resize don't trigger virtualizer renders.

### 8.4 In-flight retention vs free-list (medium risk)

The cell free-list and the in-flight set must agree on which cells are eligible for recycling. A bug here would either:

- Recycle a cell that's in flight → animation jumps / fails
- Hold a cell that's not in flight → memory leak

Mitigation: every recycle decision routes through a single `canRecycle(rowIndex, colIndex)` predicate that checks both `retainedRows` AND `inFlightRows`. Unit-test that predicate exhaustively.

### 8.5 Browser breadth (low risk)

PR #9 already validates Firefox + WebKit functional parity for the spike's primitives. The impl's additions (pinned rows, fenwick, in-flight retention) are mostly engine-side (no DOM-shape changes), so cross-browser risk is low. The pinned-row DOM updates in `DOMRenderer` are the new cross-browser surface; same translate3d pattern as columns, so the same Playwright tests transfer.

### 8.6 Memory bar feasibility (open question)

The 30MB ceiling was set in design.md without measurement. The spike's harness shows ~430 cells in DOM at 100k × 30, plus the offsets cache (~4MB for 100k indexes × 8 bytes), plus retained refs. Theoretically 5-10MB total grid overhead — well under the bar. But heap snapshots include closures, V8 hidden classes, and DOM bookkeeping that's hard to predict.

The nightly harness will tell us. If the bar is tight, the impl can drop the offsets cache to a typed array (Int32Array) for half the memory, or move it to a SharedArrayBuffer if cross-worker support becomes a goal later. Tracked as a follow-up if needed.

## 9. Sub-tasks (not committed yet — for queue.md once the impl claims)

Order of work, each ~1-3 days:

1. **Land kebab-case class-name decision in design.md §13** (small prep PR) — unblocks PR #15 and §5.
2. **Fenwick tree** — replace flat-array offsets cache; comprehensive correctness tests vs naive baseline.
3. **In-flight retention set** — add `beginInFlightRow/Col`; integration-test with animations primitives.
4. **ResizeObserver RAF throttling** — coalesce; test for 1-render-per-batch.
5. **Pinned-row DOMRenderer support** — translate3d on pinned-top/pinned-bottom; Playwright tests for all 4 corners.
6. **Public API surface** — rename `VirtualizerOptions` → `VirtualOptions`, unify `VirtualRow`/`VirtualCol` → `VirtualItem`, consume `BcScrollAlign` from core, add a11y-meta types.
7. **Memory-bar harness wiring** — depends on `nightly-perf-harness` existing; if that task hasn't started, file it.
8. **Spike report → impl report transition** — `docs/design/virtualizer-impl-report.md` documents the impl decisions, references this plan.

Total: 8 sub-tasks × 1-3 days ≈ 2-3 weeks. Matches the queue's effort estimate.

## 10. Out of scope (named explicitly)

- Server-row-model integration — Q4.
- Editor lifecycle — Q2 editor protocol.
- Range selection — Q3.
- Column resize / reorder — Q1 sub-task `q1-pinned-cols` + future `q2-column-resize`. The virtualizer surfaces width changes via `setColWidth`; UI for resize lives in `@bc-grid/react`.
- Touch gestures — desktop-first per design.md §2.
- RTL — Q4 minimum per design.md §2.

## 11. Decision log entries this plan creates

| Item | Where |
|---|---|
| Kebab-case CSS class convention | design.md §13 (separate prep PR) |
| Pinned cells use JS-driven translate3d, not CSS sticky | already in `virtualizer-spike-v2-report.md` (referenced) |
| Fenwick tree for cumulative offsets | design.md §13 (during impl) |
| Retained set keyed by RowId, computeWindow() emits indexes | design.md §13 (during impl, if §6.1 RFC confirms) |
| In-flight set + free-list interaction | design.md §13 (during impl) |
