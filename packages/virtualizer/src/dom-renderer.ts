/**
 * DOMRenderer — pure-DOM consumer of the Virtualizer.
 *
 * Mounts to a host element, listens for scroll, computes the render window
 * via Virtualizer.computeWindow(), and reconciles the DOM by reusing
 * row/cell nodes where possible. Cell content comes from a consumer-supplied
 * `renderCell` callback.
 *
 * No React. No framework dependencies. Used by the spike harness directly;
 * the React layer (`@bc-grid/react`) wraps this with its own component.
 *
 * Layout (matches design.md §6.3):
 *   .bc-grid                                 (container, position: relative)
 *   ├── .bc-grid-scroller                    (overflow: auto, fills container)
 *   │   └── .bc-grid-canvas                  (totalHeight × totalWidth, position: relative)
 *   │       └── .bc-grid-cell                (one per visible cell, position: absolute)
 *
 * Pinned regions are deferred to a follow-up commit; the spike validates the
 * non-pinned virtualization first to prove the perf bar.
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

interface CellNode {
  el: HTMLElement
  rowIndex: number
  colIndex: number
}

export class DOMRenderer {
  private host: HTMLElement
  private virtualizer: Virtualizer
  private renderCell: (params: RenderCellParams, cell: HTMLElement) => void
  private onAfterRender: (() => void) | undefined

  private scroller!: HTMLDivElement
  private canvas!: HTMLDivElement

  // key = `${rowIndex}:${colIndex}` → cell node
  private cells = new Map<string, CellNode>()
  // Cells removed from the live set during a render pass; reused next pass.
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

    // Sync viewport to host size.
    this.resizeObserver = new ResizeObserver(() => {
      this.virtualizer.setViewport(this.scroller.clientHeight, this.scroller.clientWidth)
      this.render()
    })
    this.resizeObserver.observe(this.scroller)

    // Initial sizing + render
    this.virtualizer.setViewport(this.scroller.clientHeight, this.scroller.clientWidth)
    this.render()
  }

  unmount(): void {
    this.scroller.removeEventListener("scroll", this.handleScroll)
    this.resizeObserver?.disconnect()
    this.host.innerHTML = ""
    this.host.classList.remove("bc-grid")
    this.cells.clear()
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

    const seen = new Set<string>()

    // Add or update cells for every (row, col) in the render window.
    for (const row of window_.rows) {
      for (const col of window_.cols) {
        const key = `${row.index}:${col.index}`
        seen.add(key)

        let cell = this.cells.get(key)
        if (!cell) {
          const el = this.acquireCellNode()
          el.dataset.rowIndex = String(row.index)
          el.dataset.colIndex = String(col.index)
          cell = { el, rowIndex: row.index, colIndex: col.index }
          this.cells.set(key, cell)
          this.canvas.appendChild(el)
        }

        const el = cell.el
        // Position via top/left (cheaper to update than transform when the
        // value rarely changes for a given cell instance — we recycle
        // nodes, so positions DO change. Translate3d would be marginally
        // faster but offsets harder to inspect in devtools).
        el.style.transform = `translate3d(${col.left}px, ${row.top}px, 0)`
        el.style.width = `${col.width}px`
        el.style.height = `${row.height}px`

        this.renderCell({ rowIndex: row.index, colIndex: col.index }, el)
      }
    }

    // Remove cells no longer in the window. Reusable nodes go to freeCells
    // so the next render can reuse them without DOM allocation.
    for (const [key, cell] of this.cells) {
      if (seen.has(key)) continue
      this.cells.delete(key)
      cell.el.style.transform = "translate3d(-99999px, 0, 0)" // park off-screen
      this.freeCells.push(cell.el)
    }

    // ARIA contract — minimal for the spike. Real surface in @bc-grid/react.
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

  private acquireCellNode(): HTMLElement {
    const reused = this.freeCells.pop()
    if (reused) return reused
    const el = document.createElement("div")
    el.className = "bc-grid-cell"
    el.setAttribute("role", "gridcell")
    el.style.position = "absolute"
    el.style.top = "0"
    el.style.left = "0"
    return el
  }
}
