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

export interface VirtualizerOptions {
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

export type ScrollAlign = "start" | "center" | "end" | "nearest"

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

  private rowHeights = new Map<number, number>()
  private colWidths = new Map<number, number>()

  private scrollTop = 0
  private scrollLeft = 0

  private retainedRows = new Set<number>()
  private retainedCols = new Set<number>()

  // Cumulative-offset cache. For uniform heights this is O(1); for variable
  // heights we recompute lazily on size change. A fenwick tree would scale
  // better; deferred until the spike validates the uniform path.
  private rowOffsetsDirty = true
  private colOffsetsDirty = true
  private rowOffsetsCache: number[] = []
  private colOffsetsCache: number[] = []

  constructor(opts: VirtualizerOptions) {
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
    if (this.rowHeights.get(index) === height) return
    this.rowHeights.set(index, height)
    this.rowOffsetsDirty = true
  }

  setColWidth(index: number, width: number): void {
    if (this.colWidths.get(index) === width) return
    this.colWidths.set(index, width)
    this.colOffsetsDirty = true
  }

  retainRow(index: number, retain = true): void {
    if (retain) this.retainedRows.add(index)
    else this.retainedRows.delete(index)
  }

  retainCol(index: number, retain = true): void {
    if (retain) this.retainedCols.add(index)
    else this.retainedCols.delete(index)
  }

  // -------------------------------------------------------------------------
  // Geometry queries
  // -------------------------------------------------------------------------

  rowHeight(index: number): number {
    return this.rowHeights.get(index) ?? this.defaultRowHeight
  }

  colWidth(index: number): number {
    return this.colWidths.get(index) ?? this.defaultColWidth
  }

  /**
   * Cumulative pixel offset of the top of row `index` (relative to the start
   * of the body — pinned-top rows are NOT included in this offset because
   * they live in their own sticky region).
   */
  rowOffset(index: number): number {
    this.ensureRowOffsets()
    return this.rowOffsetsCache[index] ?? 0
  }

  colOffset(index: number): number {
    this.ensureColOffsets()
    return this.colOffsetsCache[index] ?? 0
  }

  totalHeight(): number {
    this.ensureRowOffsets()
    if (this.rowCount === 0) return 0
    const last = this.rowCount - 1
    return (this.rowOffsetsCache[last] ?? 0) + this.rowHeight(last)
  }

  totalWidth(): number {
    this.ensureColOffsets()
    if (this.colCount === 0) return 0
    const last = this.colCount - 1
    return (this.colOffsetsCache[last] ?? 0) + this.colWidth(last)
  }

  /**
   * Find the row index whose top is at or just before `y` (relative to the
   * body's scrollable region). Binary search over the offsets cache.
   */
  rowAtOffset(y: number): number {
    this.ensureRowOffsets()
    return binarySearchOffset(this.rowOffsetsCache, y, this.rowCount)
  }

  colAtOffset(x: number): number {
    this.ensureColOffsets()
    return binarySearchOffset(this.colOffsetsCache, x, this.colCount)
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

    // Retained rows that aren't already in the window
    for (const retained of this.retainedRows) {
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

    for (const retained of this.retainedCols) {
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
   * Calculate the scrollTop required to bring a row into view.
   */
  scrollOffsetForRow(index: number, align: ScrollAlign = "nearest"): number {
    const top = this.rowOffset(index)
    const height = this.rowHeight(index)

    if (align === "start") return top
    if (align === "end") return top + height - this.viewportHeight
    if (align === "center") return top + height / 2 - this.viewportHeight / 2

    // nearest
    if (top < this.scrollTop) return top
    if (top + height > this.scrollTop + this.viewportHeight) {
      return top + height - this.viewportHeight
    }
    return this.scrollTop
  }

  scrollOffsetForCol(index: number, align: ScrollAlign = "nearest"): number {
    const left = this.colOffset(index)
    const width = this.colWidth(index)

    if (align === "start") return left
    if (align === "end") return left + width - this.viewportWidth
    if (align === "center") return left + width / 2 - this.viewportWidth / 2

    if (left < this.scrollLeft) return left
    if (left + width > this.scrollLeft + this.viewportWidth) {
      return left + width - this.viewportWidth
    }
    return this.scrollLeft
  }

  // -------------------------------------------------------------------------
  // Internal: cumulative offset cache
  // -------------------------------------------------------------------------

  private ensureRowOffsets(): void {
    if (!this.rowOffsetsDirty && this.rowOffsetsCache.length === this.rowCount) return
    const cache: number[] = new Array(this.rowCount)
    let acc = 0
    for (let i = 0; i < this.rowCount; i++) {
      cache[i] = acc
      acc += this.rowHeights.get(i) ?? this.defaultRowHeight
    }
    this.rowOffsetsCache = cache
    this.rowOffsetsDirty = false
  }

  private ensureColOffsets(): void {
    if (!this.colOffsetsDirty && this.colOffsetsCache.length === this.colCount) return
    const cache: number[] = new Array(this.colCount)
    let acc = 0
    for (let i = 0; i < this.colCount; i++) {
      cache[i] = acc
      acc += this.colWidths.get(i) ?? this.defaultColWidth
    }
    this.colOffsetsCache = cache
    this.colOffsetsDirty = false
  }
}

/**
 * Find the largest index `i` such that `offsets[i] <= target`. Binary
 * search over the cumulative-offset cache. O(log N).
 */
function binarySearchOffset(offsets: number[], target: number, count: number): number {
  if (count === 0) return 0
  let lo = 0
  let hi = count - 1
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1
    const offset = offsets[mid] ?? 0
    if (offset === target) return mid
    if (offset < target) lo = mid + 1
    else hi = mid - 1
  }
  return Math.max(0, hi)
}
