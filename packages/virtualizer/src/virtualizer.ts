/**
 * Virtualizer — framework-agnostic windowing engine for bc-grid.
 *
 * Tracks scroll position + viewport dims + per-row/per-column sizes, and
 * answers "which row/column indexes should be in the DOM right now?"
 * Decouples math from rendering — the DOM renderer in
 * `packages/virtualizer/src/dom-renderer.ts` consumes this output.
 *
 * Design constraints (from design.md §6 + accessibility-rfc §Virtualization
 * Contract):
 * - 60fps scroll target with 100k rows × 30 cols (smoke perf bar in
 *   design.md §3.2).
 * - Variable row heights: spike v0 uses a uniform default + a measured
 *   cache; cumulative offset computed via cache or estimate. Sub-O(N)
 *   cumulative-offset query is a follow-up; the spike validates the
 *   uniform-height path first.
 * - Pinned rows / columns: returned separately so the renderer can place
 *   them in their own DOM regions.
 * - Retained items: rows/cols kept in the DOM even when out of viewport
 *   (focus, edit mode, animation handoff). Counted in the rendered set
 *   regardless of scroll position.
 *
 * No React. No DOM API usage in this file.
 */

import type { BcScrollAlign } from "@bc-grid/core"
import { FenwickTree } from "./fenwick"

/**
 * Options for constructing a `Virtualizer`. Matches the `VirtualOptions`
 * name from `api.md §9`.
 */
export interface VirtualOptions {
  rowCount: number
  colCount: number
  defaultRowHeight: number
  defaultColWidth: number
  viewportHeight: number
  viewportWidth: number
  /** Overscan rows in each direction. Default: 4. */
  rowOverscan?: number
  /** Overscan columns in each direction. Default: 2. */
  colOverscan?: number
  /** Pinned-left column count (must be at the start of the column index). */
  pinnedLeftCols?: number
  /** Pinned-right column count (must be at the end of the column index). */
  pinnedRightCols?: number
  /** Pinned-top row count (start of index). */
  pinnedTopRows?: number
  /** Pinned-bottom row count (end of index). */
  pinnedBottomRows?: number
}

/**
 * @deprecated Use `VirtualOptions` instead. Kept for back-compat with
 * spike-era consumers; will be removed in v0.2.
 */
export type VirtualizerOptions = VirtualOptions

export interface VirtualRow {
  index: number
  top: number
  height: number
  retained: boolean
  pinned: "top" | "bottom" | null
}

export interface VirtualCol {
  index: number
  left: number
  width: number
  retained: boolean
  pinned: "left" | "right" | null
}

/**
 * Discriminated union of `VirtualRow | VirtualCol` for axis-agnostic
 * iteration. Matches the `VirtualItem` name from `api.md §9`. Code that
 * already knows which axis it's processing should use the specific
 * `VirtualRow` / `VirtualCol` types directly — they carry axis-appropriate
 * field names (`top`/`height` vs `left`/`width`) which read cleaner than
 * abstract `start`/`size`.
 */
export type VirtualItem = VirtualRow | VirtualCol

export interface VirtualWindow {
  rows: VirtualRow[]
  cols: VirtualCol[]
  /** Total scrollable height (sum of all row heights + pinned). */
  totalHeight: number
  /** Total scrollable width. */
  totalWidth: number
  /** Pixel offset of the body (after pinned-top rows). */
  bodyTop: number
  /** Pixel offset where pinned-bottom region starts. */
  bodyBottom: number
  /** Pixel offset of the body (after pinned-left columns). */
  bodyLeft: number
  /** Pixel offset where pinned-right region starts. */
  bodyRight: number
}

/**
 * Re-export of `BcScrollAlign` from `@bc-grid/core` so virtualizer
 * consumers don't have to import from both packages.
 */
export type ScrollAlign = BcScrollAlign

/**
 * Accessibility input the React layer passes to the virtualizer so it can
 * stamp correct ARIA attrs on rendered items. From `accessibility-rfc
 * §Virtualization Contract` and `api.md §9`.
 *
 * The retention sets here are *additional* to the active cell's row/col,
 * which the virtualizer always retains automatically. Callers use these to
 * keep extra rows / columns in the DOM (e.g., the previously-focused row
 * during a transition, or a pinned reference row).
 */
export interface VirtualizerA11yInput {
  /** Total dataset rows — surfaces as `aria-rowcount` on the grid root. */
  rowCount: number
  /** Total dataset cols — surfaces as `aria-colcount` on the grid root. */
  colCount: number
  /** Extra rows the renderer must retain in the DOM. Max 2 per a11y RFC. */
  retainedRows: readonly number[]
  /** Extra cols the renderer must retain. */
  retainedCols: readonly number[]
}

/**
 * Per-row metadata the renderer attaches to each rendered row, so the
 * React layer can stamp `aria-rowindex` and the active highlight without
 * recomputing.
 */
export interface VirtualRowA11yMeta {
  index: number
  /** 1-based index into the *full* dataset, per ARIA grid pattern. */
  ariaRowIndex: number
  isActive: boolean
  disabled?: boolean
}

/**
 * Per-column metadata mirroring `VirtualRowA11yMeta` for column-axis
 * a11y wiring.
 */
export interface VirtualColumnA11yMeta {
  index: number
  /** 1-based index into the *full* dataset. */
  ariaColIndex: number
  isActive: boolean
}

/**
 * Handle returned by `Virtualizer.beginInFlightRow` / `beginInFlightCol`.
 * Calling `release()` decrements the in-flight ref count; idempotent.
 */
export interface InFlightHandle {
  release(): void
}

export class Virtualizer {
  readonly rowCount: number
  readonly colCount: number
  private defaultRowHeight: number
  private defaultColWidth: number
  private viewportHeight: number
  private viewportWidth: number
  private rowOverscan: number
  private colOverscan: number
  readonly pinnedLeftCols: number
  readonly pinnedRightCols: number
  readonly pinnedTopRows: number
  readonly pinnedBottomRows: number

  private scrollTop = 0
  private scrollLeft = 0

  private retainedRows = new Set<number>()
  private retainedCols = new Set<number>()

  /**
   * Reference-counted in-flight retention. Each `beginInFlightRow(index)`
   * increments the count; the returned handle's `release()` decrements.
   * While count > 0 the row is treated like a `retainedRows` member —
   * `computeWindow()` emits it regardless of scroll position, so the
   * renderer doesn't recycle its cells. Used by animation primitives
   * (`@bc-grid/animations.flip`) to hold a row's DOM node steady through
   * an animation that started in viewport but may end outside it.
   */
  private inFlightRows = new Map<number, number>()
  private inFlightCols = new Map<number, number>()

  /**
   * Cumulative-offset stores. Each Fenwick tree holds row heights / column
   * widths at the corresponding 0-based index. `prefixSum(i)` is the
   * bottom edge of row `i` (right edge for cols); `prefixSum(i-1)` is the
   * top (left) edge. Per-update + per-query are both O(log N), eliminating
   * the spike's O(N) rebuild on size changes.
   */
  private rowSizes: FenwickTree
  private colSizes: FenwickTree

  constructor(opts: VirtualOptions) {
    this.rowCount = opts.rowCount
    this.colCount = opts.colCount
    this.defaultRowHeight = opts.defaultRowHeight
    this.defaultColWidth = opts.defaultColWidth
    this.viewportHeight = opts.viewportHeight
    this.viewportWidth = opts.viewportWidth
    this.rowOverscan = opts.rowOverscan ?? 4
    this.colOverscan = opts.colOverscan ?? 2
    this.pinnedLeftCols = opts.pinnedLeftCols ?? 0
    this.pinnedRightCols = opts.pinnedRightCols ?? 0
    this.pinnedTopRows = opts.pinnedTopRows ?? 0
    this.pinnedBottomRows = opts.pinnedBottomRows ?? 0
    this.rowSizes = new FenwickTree(this.rowCount, this.defaultRowHeight)
    this.colSizes = new FenwickTree(this.colCount, this.defaultColWidth)
  }

  // -------------------------------------------------------------------------
  // Mutators
  // -------------------------------------------------------------------------

  setScrollTop(scrollTop: number): void {
    this.scrollTop = Math.max(0, scrollTop)
  }

  setScrollLeft(scrollLeft: number): void {
    this.scrollLeft = Math.max(0, scrollLeft)
  }

  setViewport(height: number, width: number): void {
    this.viewportHeight = height
    this.viewportWidth = width
  }

  setRowHeight(index: number, height: number): void {
    this.rowSizes.set(index, height)
  }

  setColWidth(index: number, width: number): void {
    this.colSizes.set(index, width)
  }

  retainRow(index: number, retain = true): void {
    if (retain) this.retainedRows.add(index)
    else this.retainedRows.delete(index)
  }

  retainCol(index: number, retain = true): void {
    if (retain) this.retainedCols.add(index)
    else this.retainedCols.delete(index)
  }

  /**
   * Mark a row as in-flight (e.g. during an animation that started while it
   * was in viewport but may end while scrolled out). Returns a handle whose
   * `release()` decrements the in-flight ref count for that row. Multiple
   * concurrent begins on the same index are valid — each gets its own
   * release. The row is emitted by `computeWindow()` until every
   * outstanding handle has been released.
   *
   * Out-of-range indexes return a no-op handle.
   *
   * Idempotent: calling `release()` twice on the same handle has no effect.
   */
  beginInFlightRow(index: number): InFlightHandle {
    if (index < 0 || index >= this.rowCount) {
      return noopHandle
    }
    this.inFlightRows.set(index, (this.inFlightRows.get(index) ?? 0) + 1)
    let released = false
    const inFlight = this.inFlightRows
    return {
      release() {
        if (released) return
        released = true
        const next = (inFlight.get(index) ?? 1) - 1
        if (next <= 0) inFlight.delete(index)
        else inFlight.set(index, next)
      },
    }
  }

  /**
   * Column-axis sibling of `beginInFlightRow`. Symmetric semantics.
   */
  beginInFlightCol(index: number): InFlightHandle {
    if (index < 0 || index >= this.colCount) {
      return noopHandle
    }
    this.inFlightCols.set(index, (this.inFlightCols.get(index) ?? 0) + 1)
    let released = false
    const inFlight = this.inFlightCols
    return {
      release() {
        if (released) return
        released = true
        const next = (inFlight.get(index) ?? 1) - 1
        if (next <= 0) inFlight.delete(index)
        else inFlight.set(index, next)
      },
    }
  }

  // -------------------------------------------------------------------------
  // Geometry queries
  // -------------------------------------------------------------------------

  rowHeight(index: number): number {
    if (index < 0 || index >= this.rowCount) return this.defaultRowHeight
    return this.rowSizes.value(index)
  }

  colWidth(index: number): number {
    if (index < 0 || index >= this.colCount) return this.defaultColWidth
    return this.colSizes.value(index)
  }

  /**
   * Top edge of row `index`. Pixel offset relative to the body's scrollable
   * region — pinned-top rows are NOT subtracted because they live in their
   * own sticky region.
   */
  rowOffset(index: number): number {
    if (index <= 0) return 0
    return this.rowSizes.prefixSum(index - 1)
  }

  /** Left edge of column `index`. */
  colOffset(index: number): number {
    if (index <= 0) return 0
    return this.colSizes.prefixSum(index - 1)
  }

  totalHeight(): number {
    return this.rowSizes.total()
  }

  totalWidth(): number {
    return this.colSizes.total()
  }

  /**
   * Row index containing pixel `y`. Returns 0 if `y < 0` and `rowCount-1`
   * if `y` exceeds the total height (clamps to the last row).
   */
  rowAtOffset(y: number): number {
    if (this.rowCount === 0) return 0
    if (y <= 0) return 0
    return Math.min(this.rowCount - 1, this.rowSizes.upperBound(y))
  }

  colAtOffset(x: number): number {
    if (this.colCount === 0) return 0
    if (x <= 0) return 0
    return Math.min(this.colCount - 1, this.colSizes.upperBound(x))
  }

  // -------------------------------------------------------------------------
  // Visibility / windowing
  // -------------------------------------------------------------------------

  /**
   * Compute the current render window: which rows + cols should be in the
   * DOM right now. Includes pinned regions and retained items.
   */
  computeWindow(): VirtualWindow {
    const bodyRowStart = this.pinnedTopRows
    const bodyRowEnd = this.rowCount - this.pinnedBottomRows
    const bodyColStart = this.pinnedLeftCols
    const bodyColEnd = this.colCount - this.pinnedRightCols

    // Body row range from scroll position
    const bodyScrollTop = this.scrollTop
    const bodyScrollBottom = this.scrollTop + this.viewportHeight

    let bodyRowStartIndex = Math.max(bodyRowStart, this.rowAtOffset(bodyScrollTop))
    let bodyRowEndIndex = Math.min(bodyRowEnd, this.rowAtOffset(bodyScrollBottom) + 1)

    bodyRowStartIndex = Math.max(bodyRowStart, bodyRowStartIndex - this.rowOverscan)
    bodyRowEndIndex = Math.min(bodyRowEnd, bodyRowEndIndex + this.rowOverscan)

    // Body col range
    const bodyScrollLeft = this.scrollLeft
    const bodyScrollRight = this.scrollLeft + this.viewportWidth

    let bodyColStartIndex = Math.max(bodyColStart, this.colAtOffset(bodyScrollLeft))
    let bodyColEndIndex = Math.min(bodyColEnd, this.colAtOffset(bodyScrollRight) + 1)

    bodyColStartIndex = Math.max(bodyColStart, bodyColStartIndex - this.colOverscan)
    bodyColEndIndex = Math.min(bodyColEnd, bodyColEndIndex + this.colOverscan)

    // Build the row list
    const rows: VirtualRow[] = []
    const rowIndexes = new Set<number>()

    // Pinned-top rows
    for (let i = 0; i < this.pinnedTopRows; i++) {
      rowIndexes.add(i)
      rows.push({
        index: i,
        top: this.rowOffset(i),
        height: this.rowHeight(i),
        retained: this.retainedRows.has(i),
        pinned: "top",
      })
    }

    // Body rows
    for (let i = bodyRowStartIndex; i < bodyRowEndIndex; i++) {
      if (rowIndexes.has(i)) continue
      rowIndexes.add(i)
      rows.push({
        index: i,
        top: this.rowOffset(i),
        height: this.rowHeight(i),
        retained: this.retainedRows.has(i),
        pinned: null,
      })
    }

    // Pinned-bottom rows
    for (let i = bodyRowEnd; i < this.rowCount; i++) {
      if (rowIndexes.has(i)) continue
      rowIndexes.add(i)
      rows.push({
        index: i,
        top: this.rowOffset(i),
        height: this.rowHeight(i),
        retained: this.retainedRows.has(i),
        pinned: "bottom",
      })
    }

    // Retained rows + in-flight rows that aren't already in the window. Both
    // sets get the same `retained: true` treatment in the output — the
    // renderer doesn't distinguish "kept for focus" from "kept for animation".
    for (const retained of this.iterRetainedRowIndexes()) {
      if (rowIndexes.has(retained)) continue
      if (retained < 0 || retained >= this.rowCount) continue
      rowIndexes.add(retained)
      rows.push({
        index: retained,
        top: this.rowOffset(retained),
        height: this.rowHeight(retained),
        retained: true,
        pinned: null,
      })
    }

    // Build the col list (same pattern)
    const cols: VirtualCol[] = []
    const colIndexes = new Set<number>()

    for (let i = 0; i < this.pinnedLeftCols; i++) {
      colIndexes.add(i)
      cols.push({
        index: i,
        left: this.colOffset(i),
        width: this.colWidth(i),
        retained: this.retainedCols.has(i),
        pinned: "left",
      })
    }

    for (let i = bodyColStartIndex; i < bodyColEndIndex; i++) {
      if (colIndexes.has(i)) continue
      colIndexes.add(i)
      cols.push({
        index: i,
        left: this.colOffset(i),
        width: this.colWidth(i),
        retained: this.retainedCols.has(i),
        pinned: null,
      })
    }

    for (let i = bodyColEnd; i < this.colCount; i++) {
      if (colIndexes.has(i)) continue
      colIndexes.add(i)
      cols.push({
        index: i,
        left: this.colOffset(i),
        width: this.colWidth(i),
        retained: this.retainedCols.has(i),
        pinned: "right",
      })
    }

    for (const retained of this.iterRetainedColIndexes()) {
      if (colIndexes.has(retained)) continue
      if (retained < 0 || retained >= this.colCount) continue
      colIndexes.add(retained)
      cols.push({
        index: retained,
        left: this.colOffset(retained),
        width: this.colWidth(retained),
        retained: true,
        pinned: null,
      })
    }

    // Sort so the renderer can iterate in DOM order. Pinned regions stay first
    // / last; body rows are between in numeric order.
    rows.sort((a, b) => a.index - b.index)
    cols.sort((a, b) => a.index - b.index)

    return {
      rows,
      cols,
      totalHeight: this.totalHeight(),
      totalWidth: this.totalWidth(),
      bodyTop: this.pinnedTopRows === 0 ? 0 : this.rowOffset(this.pinnedTopRows),
      bodyBottom:
        this.pinnedBottomRows === 0
          ? this.totalHeight()
          : this.rowOffset(this.rowCount - this.pinnedBottomRows),
      bodyLeft: this.pinnedLeftCols === 0 ? 0 : this.colOffset(this.pinnedLeftCols),
      bodyRight:
        this.pinnedRightCols === 0
          ? this.totalWidth()
          : this.colOffset(this.colCount - this.pinnedRightCols),
    }
  }

  /**
   * Calculate the scrollTop required to bring a row into view. The returned
   * value is always clamped to `[0, totalHeight - viewportHeight]` so the
   * caller can apply it directly without further validation. If the row index
   * is out of range, returns the current scrollTop unchanged.
   */
  scrollOffsetForRow(index: number, align: BcScrollAlign = "nearest"): number {
    if (index < 0 || index >= this.rowCount) return this.scrollTop
    const top = this.rowOffset(index)
    const height = this.rowHeight(index)
    const max = Math.max(0, this.totalHeight() - this.viewportHeight)

    let target: number
    if (align === "start") {
      target = top
    } else if (align === "end") {
      target = top + height - this.viewportHeight
    } else if (align === "center") {
      target = top + height / 2 - this.viewportHeight / 2
    } else {
      // nearest
      if (top < this.scrollTop) target = top
      else if (top + height > this.scrollTop + this.viewportHeight) {
        target = top + height - this.viewportHeight
      } else target = this.scrollTop
    }

    return Math.max(0, Math.min(max, target))
  }

  scrollOffsetForCol(index: number, align: BcScrollAlign = "nearest"): number {
    if (index < 0 || index >= this.colCount) return this.scrollLeft
    const left = this.colOffset(index)
    const width = this.colWidth(index)
    const max = Math.max(0, this.totalWidth() - this.viewportWidth)

    let target: number
    if (align === "start") {
      target = left
    } else if (align === "end") {
      target = left + width - this.viewportWidth
    } else if (align === "center") {
      target = left + width / 2 - this.viewportWidth / 2
    } else {
      if (left < this.scrollLeft) target = left
      else if (left + width > this.scrollLeft + this.viewportWidth) {
        target = left + width - this.viewportWidth
      } else target = this.scrollLeft
    }

    return Math.max(0, Math.min(max, target))
  }

  /**
   * Whether the cell at (rowIndex, colIndex) is currently rendered AND
   * visible to the user. Visibility is computed per-axis: a pinned row or
   * pinned column is always visible *on its own axis* (it sticks to the
   * viewport edge), but visibility of a cell still requires both axes to
   * be visible. A pinned-left cell in row 50,000 isn't visible if row
   * 50,000 is scrolled far out of the viewport — the column sticks but
   * the row doesn't.
   *
   * Out-of-range indexes are not visible.
   *
   * Used by the React layer's `isCellVisible(position)` API
   * (`api.md §6.1`) and for keyboard-nav scroll decisions per the
   * accessibility-rfc.
   */
  isCellVisible(rowIndex: number, colIndex: number): boolean {
    if (rowIndex < 0 || rowIndex >= this.rowCount) return false
    if (colIndex < 0 || colIndex >= this.colCount) return false

    const isPinnedRow =
      rowIndex < this.pinnedTopRows || rowIndex >= this.rowCount - this.pinnedBottomRows
    const isPinnedCol =
      colIndex < this.pinnedLeftCols || colIndex >= this.colCount - this.pinnedRightCols

    let verticallyVisible: boolean
    if (isPinnedRow) {
      verticallyVisible = true
    } else {
      const rowTop = this.rowOffset(rowIndex)
      const rowBottom = rowTop + this.rowHeight(rowIndex)
      verticallyVisible =
        rowBottom > this.scrollTop && rowTop < this.scrollTop + this.viewportHeight
    }

    let horizontallyVisible: boolean
    if (isPinnedCol) {
      horizontallyVisible = true
    } else {
      const colLeft = this.colOffset(colIndex)
      const colRight = colLeft + this.colWidth(colIndex)
      horizontallyVisible =
        colRight > this.scrollLeft && colLeft < this.scrollLeft + this.viewportWidth
    }

    return verticallyVisible && horizontallyVisible
  }

  // -------------------------------------------------------------------------
  // Internal: union iterators over retained + in-flight indexes
  // -------------------------------------------------------------------------

  private *iterRetainedRowIndexes(): IterableIterator<number> {
    for (const idx of this.retainedRows) yield idx
    for (const idx of this.inFlightRows.keys()) {
      if (!this.retainedRows.has(idx)) yield idx
    }
  }

  private *iterRetainedColIndexes(): IterableIterator<number> {
    for (const idx of this.retainedCols) yield idx
    for (const idx of this.inFlightCols.keys()) {
      if (!this.retainedCols.has(idx)) yield idx
    }
  }
}

/**
 * Shared no-op handle returned by `beginInFlightRow` / `beginInFlightCol`
 * for out-of-range indexes. `release()` does nothing.
 */
const noopHandle = Object.freeze({ release(): void {} })
