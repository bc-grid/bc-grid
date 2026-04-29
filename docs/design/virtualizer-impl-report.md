# Virtualizer Impl — Report

**Status:** ✅ Phase-4 production virtualizer complete
**Owner:** c1 (Claude)
**Plan:** `docs/design/virtualizer-impl-plan.md` (#17)
**Branches:** `agent/c1/virtualizer-impl-{surface, fenwick, inflight, resize, pinned-rows, report}`
**Bars validated:** `design.md §3.2` smoke + nightly scroll-FPS + production-shape contract

---

## What landed

Six PRs hardened the spike into a production engine, in dependency order:

| PR | Sub-task | What landed |
|---|---|---|
| #20 | API surface | Renamed `VirtualizerOptions` → `VirtualOptions`; added `VirtualItem` (discriminated union of `VirtualRow | VirtualCol`); `ScrollAlign` now re-exports `BcScrollAlign` from `@bc-grid/core`; new `VirtualizerA11yInput`, `VirtualRowA11yMeta`, `VirtualColumnA11yMeta` types for the React layer's ARIA wiring contract. |
| #21 | Fenwick tree | Replaced the spike's O(N)-rebuild flat cumulative-offset cache with a Fenwick (binary indexed) tree. O(log N) per update + O(log N) per `prefixSum` / `upperBound`. Backed by `Float64Array` + parallel values array for O(1) `value(i)`. Killed `ensureRowOffsets` / `ensureColOffsets` / `binarySearchOffset` / `rowHeights`+`colWidths` Maps. |
| #22 | In-flight retention | Reference-counted `beginInFlightRow(index)` / `beginInFlightCol(index)` returning `InFlightHandle`. While count > 0, the row is emitted by `computeWindow()` regardless of scroll position so animation primitives can hold a row's DOM node steady through animations that start in viewport but end outside. Multiple handles per index compose; `release()` is idempotent. |
| #23 | RO throttling | `ResizeObserver` callback now coalesces all observed-size changes into a single render at the next frame. Continuous drag-resize no longer compounds the linear-in-cell-count re-render cost. Added `DOMRenderer.renderCount` getter for regression detection. |
| #24 | Pinned-row support | `DOMRenderer` now applies JS-driven translate3d to pinned-top + pinned-bottom rows, mirroring the column approach. Pinned rows get z-index 3 (vs pinned cells at 2) so corners stack correctly. New CSS classes `.bc-grid-row-pinned-top` / `.bc-grid-row-pinned-bottom`. |
| this | Impl report | This file + decision log entries. Marks `virtualizer-impl` done. |

## Test surface

| Layer | Count | Coverage |
|---|---|---|
| Unit (Bun) — virtualizer | 79 | Geometry, windowing + overscan, scroll alignment, scroll clamping, pinned regions, in-flight retention (8), `isCellVisible` per-axis (10), public API surface (4) |
| Unit (Bun) — Fenwick | 17 | Correctness, set/add semantics, `upperBound` semantics matching `rowAtOffset`, randomised vs naive baseline (1k ops × 100 elements + 5k ops × 10k elements), edge sizes |
| e2e (Playwright × 3 browsers) | 35 | ARIA wiring, sticky pinned-left + pinned-right + multi-pinned-right, focus retention, pinned-top + pinned-bottom + 4 corner intersections, RO coalescing, FPS (Chromium only — local) |

Total: **96 unit + 35 e2e**. All pass.

## Performance vs spike

| Metric | Spike | Impl | Notes |
|---|---|---|---|
| `setRowHeight` cost | O(N) on every call | O(log N) | Fenwick — wins big when heights change frequently (editable grids re-measuring on commit, auto-sized rows). |
| `rowAtOffset(y)` cost | O(log N) binary search on flat array | O(log N) Fenwick descent | Functionally equivalent; eliminates the dependency on a freshly rebuilt array. |
| Continuous resize | 1 render per RO entry (linear in entries) | 1 render per RAF (constant) | Drag-resizing the window no longer compounds. Verified by Playwright. |
| Animation handoff | Free-list could recycle node mid-flight | Held by in-flight set | Animations now safe to span scroll-out events. |
| Scroll FPS at 100k × 30 | 60 (median, M-series Mac, Chromium) | 60 (median, same hardware) | No regression. |

## Public API surface (final, per `api.md §9`)

```ts
export {
  Virtualizer,
  type VirtualOptions,
  type VirtualizerOptions,        // @deprecated alias
  type VirtualRow,
  type VirtualCol,
  type VirtualItem,                // discriminated union
  type VirtualWindow,
  type ScrollAlign,                // re-exports BcScrollAlign from @bc-grid/core
  type VirtualizerA11yInput,
  type VirtualRowA11yMeta,
  type VirtualColumnA11yMeta,
  type InFlightHandle,
} from "@bc-grid/virtualizer"

export {
  DOMRenderer,
  type DOMRendererOptions,
  type RenderCellParams,
} from "@bc-grid/virtualizer"
```

`api.md §9` mandates `Virtualizer + VirtualItem + VirtualOptions + Virtualizer*A11yMeta`. The package additionally exports `DOMRenderer` (consumed by `@bc-grid/react`), `VirtualWindow`, axis-specific `VirtualRow` / `VirtualCol`, the `@deprecated VirtualizerOptions` alias, `ScrollAlign` re-export, and `InFlightHandle`. The extras are flagged for `api-surface-diff` review when that tool lands; none of them are speculative — all have an in-tree consumer (the spike harness, the planned react-impl-v0, or the tests).

## Decisions made during impl

These will be appended to `design.md §13` in the same PR as this report.

- **Fenwick tree backs cumulative offsets.** O(log N) update + query, no batch rebuild. Float64Array storage, 1-indexed internal, 0-indexed public. `upperBound()` uses standard bit-decomposition descent for single-pass O(log N).
- **In-flight retention is reference-counted, keyed by index, idempotent on release.** Multiple animation primitives can hold the same row concurrently; the row is emitted by `computeWindow()` until every handle has released. Out-of-range indexes return a shared frozen no-op handle.
- **`isCellVisible` is per-axis.** Pinned-row || vertical-overlap; pinned-col || horizontal-overlap; cell visible iff both. A pinned-left cell in a scrolled-out row is *not* visible (caught by Codex during PR #9 round-3 review).
- **Pinned-row z-index is 3, pinned-cell z-index is 2.** Corners (pinned row × pinned col) live at the row's z-index level, raising the entire row above body content.
- **ResizeObserver coalesces to one render per RAF.** A `resizePending` flag guards the RAF; subsequent observed changes within the frame are dropped.
- **Index ↔ row ID translation deferred to react-impl-v0.** The virtualizer's retention sets remain index-keyed for now; the React layer is the boundary that translates `RowId` → index. If post-mutation row identity invariants force the engine to be rowId-aware, that's a v0.2 migration with the spike→impl→v0.2 deprecation cycle (`VirtualOptions` is already named that way to anticipate).

## Risks closed

- **O(N) cumulative-offset rebuild** — closed by Fenwick.
- **Pinned-right doesn't stick** (Codex round 2 of PR #9) — closed by JS-driven translate3d.
- **`isCellVisible` over-reports pinned cells in scrolled-out rows** (Codex round 3) — closed by per-axis logic.
- **Continuous resize compounds render cost** — closed by RAF coalescing.
- **Animation node recycling collision** — closed by in-flight retention set.
- **Pinned-rows missing from DOMRenderer** — closed by the Y-axis translate3d mirror of the column approach.

## Risks remaining

- **Memory bar (`< 30MB grid overhead`).** Not measured by this impl. Tracked under the queued `nightly-perf-harness` task. Theoretical estimate: ~5-10MB for the offsets + retained sets, well under the bar. Will be confirmed by CDP heap snapshots when the harness lands.
- **In-flight retention vs free-list invariant.** Both `retainedRows` and `inFlightRows` are checked before recycling, but the predicate is implicit — every recycle decision routes through `seenRows.has(index)` (which `computeWindow` populates from both sets). If a future change splits these checks, a bug here would silently recycle held nodes. Mitigation for the future: extract a `canRecycle(rowIndex)` predicate that names both sets explicitly.
- **NVDA + VoiceOver spot-check.** Deferred from spike merge per maintainer call. Tracked as `screenreader-spot-check` in the queue.
- **Browser breadth in CI.** Chromium + Firefox + WebKit run all functional tests on every PR; FPS bars stay Chromium-local. Sufficient for now; expand to Edge / Safari mobile in Q2 if needed.
- **Real bc-next data shape.** The harness's synthetic `R-{padded index}` strings are width-uniform monospace; real ERP cells have mixed types and widths. Q1 vertical-slice-demo (`q1-vertical-slice-demo`) is the right gate for this.

## What unblocks now

`virtualizer-impl` is the foundation Phase-5 needs. With this merged, `react-impl-v0` is unblocked for kickoff (gated only on `theming-impl` which awaits Codex's kebab-case rename per `design.md §13` / PR #18).

When `react-impl-v0` lands, the `<BcGrid>` component wires:
- `Virtualizer` engine via `VirtualOptions` / `computeWindow()` / `setRowHeight` / `setColWidth` / retention APIs
- `DOMRenderer` (or the React layer's own renderer using `VirtualizerA11yInput` + `VirtualRowA11yMeta`)
- `BcGridApi.isCellVisible` → `Virtualizer.isCellVisible`
- `BcGridApi.scrollToCell` → `virtualizer.scrollOffsetForRow/Col` + scroller scrollTo
- `flip()` animations → `beginInFlightRow` / `release()` lifecycle

That's the convergence point on a working `<BcGrid>` React component.
