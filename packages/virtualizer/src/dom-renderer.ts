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
 *                   • pinned-left:   position: sticky;   left: 0;  z-index: 2
 *                   • pinned-right:  position: sticky;   right: 0; z-index: 2
 *
 * Pinned columns ride the row containers — `position: sticky` keeps them at
 * the scroller-viewport edges as the body scrolls horizontally, while the row
 * (and therefore the body cells inside it) move with the scroll.
 *
 * ARIA: every row is `<div role="row" aria-rowindex>`, every cell is
 * `<div role="gridcell" aria-colindex>`. The grid root carries
 * `aria-rowcount` and `aria-colcount` for the *full* dataset, per the
 * accessibility-rfc.
 */

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
  private resizeObserver?: ResizeObserver

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
    this.scroller.className = "bc-grid-scroller"
    this.scroller.addEventListener("scroll", this.handleScroll, { passive: true })

    this.canvas = document.createElement("div")
    this.canvas.className = "bc-grid-canvas"

    this.scroller.appendChild(this.canvas)
    this.host.appendChild(this.scroller)

    this.resizeObserver = new ResizeObserver(() => {
      this.virtualizer.setViewport(this.scroller.clientHeight, this.scroller.clientWidth)
      this.render()
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

  scrollToCell(
    rowIndex: number,
    colIndex: number,
    align: "start" | "center" | "end" | "nearest" = "nearest",
  ): void {
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
      rowNode.el.style.transform = `translate3d(0, ${row.top}px, 0)`
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

        if (col.pinned === "left") {
          // sticky left: 0 — no horizontal offset needed.
          cellEl.style.left = "0"
          cellEl.style.right = ""
        } else if (col.pinned === "right") {
          // Pinned-right cells stick to the scroller's right edge.
          // We anchor by `right: 0` and let the canvas being totalWidth do
          // the work. The cell's intrinsic right edge is canvas-right minus
          // (totalWidth - col.left - col.width); using `right` calc keeps it
          // simple for the renderer.
          cellEl.style.right = `${window_.totalWidth - col.left - col.width}px`
          cellEl.style.left = ""
        } else {
          // Body cells: absolute-positioned at their column offset.
          cellEl.style.left = `${col.left}px`
          cellEl.style.right = ""
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

    this.onAfterRender?.()
  }

  private handleScroll = (): void => {
    this.virtualizer.setScrollTop(this.scroller.scrollTop)
    this.virtualizer.setScrollLeft(this.scroller.scrollLeft)

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

  private acquireCellNode(pinned: "left" | "right" | null): HTMLElement {
    const reused = this.freeCells.pop()
    if (reused) {
      this.applyCellPinning(reused, pinned)
      return reused
    }
    const el = document.createElement("div")
    el.className = "bc-grid-cell"
    el.setAttribute("role", "gridcell")
    el.style.top = "0"
    this.applyCellPinning(el, pinned)
    return el
  }

  private applyCellPinning(el: HTMLElement, pinned: "left" | "right" | null): void {
    if (pinned === "left") {
      el.classList.add("bc-grid-cell-pinned-left")
      el.classList.remove("bc-grid-cell-pinned-right")
      el.style.position = "sticky"
      el.style.zIndex = "2"
    } else if (pinned === "right") {
      el.classList.add("bc-grid-cell-pinned-right")
      el.classList.remove("bc-grid-cell-pinned-left")
      el.style.position = "sticky"
      el.style.zIndex = "2"
    } else {
      el.classList.remove("bc-grid-cell-pinned-left", "bc-grid-cell-pinned-right")
      el.style.position = "absolute"
      el.style.zIndex = ""
    }
  }
}
