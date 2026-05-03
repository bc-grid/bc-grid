/**
 * DOMRenderer — pure-DOM consumer of the Virtualizer.
 *
 * Mounts to a host element, listens for scroll, computes the render window
 * via Virtualizer.computeWindow(), and reconciles the DOM by reusing
 * row + cell nodes where possible. Cell content comes from a consumer-supplied
 * `renderCell` callback.
 *
 * No React. No framework dependencies. Used by the spike harness directly;
 * the React layer (`@bc-grid/react`) wraps this with its own component.
 *
 * Layout:
 *   .bc-grid                                  (container, role=grid, aria-rowcount, aria-colcount)
 *   └── .bc-grid-scroller                     (overflow: auto — the only scrolling element)
 *       └── .bc-grid-canvas                   (totalHeight × totalWidth, position: relative)
 *           └── .bc-grid-row                  (role=row, aria-rowindex; position: absolute, full canvas width)
 *               └── .bc-grid-cell             (role=gridcell, aria-colindex)
 *                   • body cells:    position: absolute; left: <colOffset>
 *                   • pinned-left:   position: absolute; left: <colOffset>; transform: translate3d(scrollLeft, 0, 0); z-index: 2
 *                   • pinned-right:  position: absolute; left: <colOffset>; transform: translate3d(scrollLeft + viewportWidth - totalWidth, 0, 0); z-index: 2
 *
 * **Pinned columns use JS-driven translate3d, not CSS sticky.**
 *
 * Why not sticky: with sticky, cells without an explicit `position: absolute`
 * fall back into normal flow, which stacks them vertically inside the row.
 * That breaks layout. Setting `position: sticky` plus `right: <px>` doesn't
 * fully fix it either — sticky uses inset values as offsets, not as the
 * cell's positioned location, and the row's containing-block math doesn't
 * line up cleanly when the row is itself absolute and full canvas width.
 *
 * The translate3d approach: every cell (pinned or body) is `position: absolute`
 * at its column offset. Pinned cells additionally apply a transform that
 * cancels out the canvas's horizontal scroll, anchoring them to the viewport
 * edges. The renderer recomputes these transforms on every scroll event
 * synchronously (in the scroll handler, not the RAF), so pinned cells never
 * lag behind a scroll by a frame.
 *
 * ARIA: every row is `<div role="row" aria-rowindex>`, every cell is
 * `<div role="gridcell" aria-colindex>`. The grid root carries
 * `aria-rowcount` and `aria-colcount` for the *full* dataset, per the
 * accessibility-rfc.
 */

import type { BcScrollAlign } from "@bc-grid/core"
import type { Virtualizer } from "./virtualizer"

export interface RenderCellParams {
  rowIndex: number
  colIndex: number
}

export interface DOMRendererOptions {
  host: HTMLElement
  virtualizer: Virtualizer
  renderCell: (params: RenderCellParams, cell: HTMLElement) => void
  /** Called after every render commit; useful for FPS / metrics. */
  onAfterRender?: () => void
}

interface RowNode {
  el: HTMLElement
  rowIndex: number
  /** key = colIndex → cell node */
  cells: Map<number, HTMLElement>
}

export class DOMRenderer {
  private host: HTMLElement
  private virtualizer: Virtualizer
  private renderCell: (params: RenderCellParams, cell: HTMLElement) => void
  private onAfterRender: (() => void) | undefined

  private scroller!: HTMLDivElement
  private canvas!: HTMLDivElement

  // key = rowIndex → row node
  private rows = new Map<number, RowNode>()
  // Recycled row + cell nodes; the next render reuses them instead of
  // allocating new DOM.
  private freeRows: HTMLElement[] = []
  private freeCells: HTMLElement[] = []

  private scrollRafScheduled = false
  private resizeRafScheduled = false
  private resizeObserver?: ResizeObserver

  /** Monotonic counter — incremented on every render commit. Read by
   * tests + perf telemetry to detect regressions in render frequency. */
  private renderCommitCount = 0

  constructor(opts: DOMRendererOptions) {
    this.host = opts.host
    this.virtualizer = opts.virtualizer
    this.renderCell = opts.renderCell
    this.onAfterRender = opts.onAfterRender
  }

  mount(): void {
    this.host.classList.add("bc-grid")
    this.host.setAttribute("role", "grid")

    this.scroller = document.createElement("div")
    // Post-layout-pass canonical class (was `bc-grid-scroller`,
    // hard-renamed in #415). Both classes are emitted so stand-alone
    // virtualizer consumers still see `bc-grid-scroller` if their
    // styling pre-dates the rename.
    this.scroller.className = "bc-grid-viewport bc-grid-scroller"
    this.scroller.addEventListener("scroll", this.handleScroll, { passive: true })

    this.canvas = document.createElement("div")
    this.canvas.className = "bc-grid-canvas"

    this.scroller.appendChild(this.canvas)
    this.host.appendChild(this.scroller)

    // Throttle to RAF — coalesce all observed-size changes into a single
    // render at the next frame. Without this, drag-resizing the window
    // fires the observer at sub-frame frequency and the linear-in-cell-count
    // re-render cost compounds.
    this.resizeObserver = new ResizeObserver(() => {
      if (this.resizeRafScheduled) return
      this.resizeRafScheduled = true
      requestAnimationFrame(() => {
        this.resizeRafScheduled = false
        this.virtualizer.setViewport(this.scroller.clientHeight, this.scroller.clientWidth)
        this.render()
      })
    })
    this.resizeObserver.observe(this.scroller)

    this.virtualizer.setViewport(this.scroller.clientHeight, this.scroller.clientWidth)
    this.render()
  }

  unmount(): void {
    this.scroller.removeEventListener("scroll", this.handleScroll)
    this.resizeObserver?.disconnect()
    this.host.innerHTML = ""
    this.host.classList.remove("bc-grid")
    this.rows.clear()
    this.freeRows = []
    this.freeCells = []
  }

  scrollToCell(rowIndex: number, colIndex: number, align: BcScrollAlign = "nearest"): void {
    const top = this.virtualizer.scrollOffsetForRow(rowIndex, align)
    const left = this.virtualizer.scrollOffsetForCol(colIndex, align)
    this.scroller.scrollTo({ top, left })
  }

  /**
   * Public render trigger — useful when external state (row count, sizes)
   * has changed without the scroll position moving.
   */
  render(): void {
    const window_ = this.virtualizer.computeWindow()

    this.canvas.style.height = `${window_.totalHeight}px`
    this.canvas.style.width = `${window_.totalWidth}px`

    const seenRows = new Set<number>()
    const pinnedLeftDx = this.scroller.scrollLeft
    const pinnedRightDx = this.scroller.scrollLeft + this.scroller.clientWidth - window_.totalWidth
    const pinnedTopDy = this.scroller.scrollTop
    const pinnedBottomDy =
      this.scroller.scrollTop + this.scroller.clientHeight - window_.totalHeight

    for (const row of window_.rows) {
      seenRows.add(row.index)
      const seenCols = new Set<number>()

      let rowNode = this.rows.get(row.index)
      if (!rowNode) {
        const el = this.acquireRowNode()
        el.dataset.rowIndex = String(row.index)
        el.setAttribute("aria-rowindex", String(row.index + 1))
        rowNode = { el, rowIndex: row.index, cells: new Map() }
        this.rows.set(row.index, rowNode)
        this.canvas.appendChild(el)
      }

      // Position the row. translate3d for GPU compositing on scroll.
      // Pinned rows get an additional Y offset that anchors them to the
      // scroller's top / bottom edge, mirroring the JS-translate approach
      // used for pinned columns. Body cells inside still flow with row.top;
      // pinned cells inside still get their own X transform on top of this.
      this.applyRowPinning(rowNode.el, row.pinned)
      let rowDy = 0
      if (row.pinned === "top") rowDy = pinnedTopDy
      else if (row.pinned === "bottom") rowDy = pinnedBottomDy
      rowNode.el.style.transform = `translate3d(0, ${row.top + rowDy}px, 0)`
      rowNode.el.style.height = `${row.height}px`

      for (const col of window_.cols) {
        seenCols.add(col.index)

        let cellEl = rowNode.cells.get(col.index)
        if (!cellEl) {
          cellEl = this.acquireCellNode(col.pinned)
          cellEl.dataset.colIndex = String(col.index)
          cellEl.setAttribute("aria-colindex", String(col.index + 1))
          rowNode.cells.set(col.index, cellEl)
          rowNode.el.appendChild(cellEl)
        } else {
          // Pinned status of an existing cell can change if the grid is
          // reconfigured. Update the position class + style.
          this.applyCellPinning(cellEl, col.pinned)
        }

        cellEl.style.width = `${col.width}px`
        cellEl.style.height = `${row.height}px`
        cellEl.style.left = `${col.left}px`

        if (col.pinned === "left") {
          cellEl.style.transform = `translate3d(${pinnedLeftDx}px, 0, 0)`
        } else if (col.pinned === "right") {
          cellEl.style.transform = `translate3d(${pinnedRightDx}px, 0, 0)`
        } else {
          cellEl.style.transform = ""
        }

        this.renderCell({ rowIndex: row.index, colIndex: col.index }, cellEl)
      }

      // Recycle cells in this row that are no longer in the window.
      for (const [colIndex, cellEl] of rowNode.cells) {
        if (seenCols.has(colIndex)) continue
        rowNode.cells.delete(colIndex)
        cellEl.style.transform = "translate3d(-99999px, 0, 0)"
        this.freeCells.push(cellEl)
        cellEl.parentElement?.removeChild(cellEl)
      }
    }

    // Recycle rows no longer in the window.
    for (const [rowIndex, rowNode] of this.rows) {
      if (seenRows.has(rowIndex)) continue
      this.rows.delete(rowIndex)
      // Park the row off-screen and recycle its cells.
      rowNode.el.style.transform = "translate3d(-99999px, 0, 0)"
      for (const cellEl of rowNode.cells.values()) {
        this.freeCells.push(cellEl)
        cellEl.parentElement?.removeChild(cellEl)
      }
      rowNode.cells.clear()
      this.freeRows.push(rowNode.el)
      rowNode.el.parentElement?.removeChild(rowNode.el)
    }

    this.host.setAttribute("aria-rowcount", String(this.virtualizer.rowCount))
    this.host.setAttribute("aria-colcount", String(this.virtualizer.colCount))

    this.renderCommitCount++
    this.onAfterRender?.()
  }

  /**
   * Total number of render commits since mount. Useful for detecting
   * regressions in render frequency (e.g. resize coalescing).
   */
  get renderCount(): number {
    return this.renderCommitCount
  }

  /**
   * Update only the pinned cells + pinned rows' transforms — runs
   * synchronously on every scroll event so pinned regions don't lag the
   * body by a frame. The full render still happens on the next RAF.
   */
  private updatePinnedTransforms(): void {
    const totalWidth = this.virtualizer.totalWidth()
    const totalHeight = this.virtualizer.totalHeight()
    const scrollLeft = this.scroller.scrollLeft
    const scrollTop = this.scroller.scrollTop
    const pinnedLeftDx = scrollLeft
    const pinnedRightDx = scrollLeft + this.scroller.clientWidth - totalWidth
    const pinnedTopDy = scrollTop
    const pinnedBottomDy = scrollTop + this.scroller.clientHeight - totalHeight

    for (const rowNode of this.rows.values()) {
      const rowIndex = rowNode.rowIndex
      const isPinnedTop = rowIndex < this.virtualizer.pinnedTopRows
      const isPinnedBottom =
        rowIndex >= this.virtualizer.rowCount - this.virtualizer.pinnedBottomRows

      if (isPinnedTop || isPinnedBottom) {
        const baseY = this.virtualizer.rowOffset(rowIndex)
        const dy = isPinnedTop ? pinnedTopDy : pinnedBottomDy
        rowNode.el.style.transform = `translate3d(0, ${baseY + dy}px, 0)`
      }

      for (const [colIndex, cellEl] of rowNode.cells) {
        if (colIndex < this.virtualizer.pinnedLeftCols) {
          cellEl.style.transform = `translate3d(${pinnedLeftDx}px, 0, 0)`
        } else if (colIndex >= this.virtualizer.colCount - this.virtualizer.pinnedRightCols) {
          cellEl.style.transform = `translate3d(${pinnedRightDx}px, 0, 0)`
        }
      }
    }
  }

  private handleScroll = (): void => {
    this.virtualizer.setScrollTop(this.scroller.scrollTop)
    this.virtualizer.setScrollLeft(this.scroller.scrollLeft)

    // Update pinned cell transforms synchronously to avoid a 1-frame lag
    // between the scroll committing and the next render.
    this.updatePinnedTransforms()

    if (this.scrollRafScheduled) return
    this.scrollRafScheduled = true
    requestAnimationFrame(() => {
      this.scrollRafScheduled = false
      this.render()
    })
  }

  private acquireRowNode(): HTMLElement {
    const reused = this.freeRows.pop()
    if (reused) return reused
    const el = document.createElement("div")
    el.className = "bc-grid-row"
    el.setAttribute("role", "row")
    el.style.position = "absolute"
    el.style.top = "0"
    el.style.left = "0"
    el.style.width = "100%"
    return el
  }

  /**
   * Apply or remove the pinned-class state on a row. Pinned rows get a
   * higher z-index than body rows so they layer over body content; the
   * class adds visual treatment (background) defined by the consumer's
   * stylesheet. Row transform (Y position) is set in `render()` /
   * `updatePinnedTransforms()` — this method only manages classes + zIndex.
   */
  private applyRowPinning(el: HTMLElement, pinned: "top" | "bottom" | null): void {
    if (pinned === "top") {
      el.classList.add("bc-grid-row-pinned-top")
      el.classList.remove("bc-grid-row-pinned-bottom")
      el.style.zIndex = "3"
    } else if (pinned === "bottom") {
      el.classList.add("bc-grid-row-pinned-bottom")
      el.classList.remove("bc-grid-row-pinned-top")
      el.style.zIndex = "3"
    } else {
      el.classList.remove("bc-grid-row-pinned-top", "bc-grid-row-pinned-bottom")
      el.style.zIndex = ""
    }
  }

  private acquireCellNode(pinned: "left" | "right" | null): HTMLElement {
    const reused = this.freeCells.pop()
    if (reused) {
      this.applyCellPinning(reused, pinned)
      return reused
    }
    const el = document.createElement("div")
    el.className = "bc-grid-cell"
    el.setAttribute("role", "gridcell")
    el.style.position = "absolute"
    el.style.top = "0"
    this.applyCellPinning(el, pinned)
    return el
  }

  /**
   * Apply or remove the pinned-class state on a cell. Position is always
   * `absolute`; the pinned variants additionally raise z-index so pinned
   * cells render above body cells, and the class adds the visual treatment
   * (background + edge shadow) defined by the consumer's stylesheet.
   * Cell transforms are set in `render()` / `updatePinnedTransforms()` —
   * this method does not touch them.
   */
  private applyCellPinning(el: HTMLElement, pinned: "left" | "right" | null): void {
    el.style.position = "absolute"
    if (pinned === "left") {
      el.classList.add("bc-grid-cell-pinned-left")
      el.classList.remove("bc-grid-cell-pinned-right")
      el.style.zIndex = "2"
    } else if (pinned === "right") {
      el.classList.add("bc-grid-cell-pinned-right")
      el.classList.remove("bc-grid-cell-pinned-left")
      el.style.zIndex = "2"
    } else {
      el.classList.remove("bc-grid-cell-pinned-left", "bc-grid-cell-pinned-right")
      el.style.zIndex = ""
    }
  }
}
