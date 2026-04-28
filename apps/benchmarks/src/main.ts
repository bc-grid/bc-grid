/**
 * Virtualizer spike harness.
 *
 * Renders 100k rows × 30 cols (configurable) using @bc-grid/virtualizer's
 * DOMRenderer. Measures FPS during continuous scroll, exposes the cell
 * count in the DOM, and the per-render cost.
 *
 * Pure DOM, no React. Used to validate design.md §3.2 perf bars before
 * committing to the architecture.
 */

import { DOMRenderer, Virtualizer } from "@bc-grid/virtualizer"

function $<T extends Element>(selector: string): T {
  const el = document.querySelector<T>(selector)
  if (!el) throw new Error(`Missing element: ${selector}`)
  return el
}

const grid = $<HTMLElement>("#grid")
const fpsEl = $<HTMLElement>("#fps")
const cellCountEl = $<HTMLElement>("#cellCount")
const renderMsEl = $<HTMLElement>("#renderMs")

const rowCountInput = $<HTMLInputElement>("#rowCount")
const colCountInput = $<HTMLInputElement>("#colCount")
const applyBtn = $<HTMLButtonElement>("#apply")
const scrollToEndBtn = $<HTMLButtonElement>("#scrollToEnd")
const scrollToMiddleBtn = $<HTMLButtonElement>("#scrollToMiddle")
const autoScrollBtn = $<HTMLButtonElement>("#autoScroll")

let virtualizer: Virtualizer
let renderer: DOMRenderer

function buildGrid(rows: number, cols: number): void {
  if (renderer) renderer.unmount()

  virtualizer = new Virtualizer({
    rowCount: rows,
    colCount: cols,
    defaultRowHeight: 32,
    defaultColWidth: 120,
    viewportHeight: grid.clientHeight,
    viewportWidth: grid.clientWidth,
    rowOverscan: 6,
    colOverscan: 2,
  })

  let lastRenderStart = 0

  renderer = new DOMRenderer({
    host: grid,
    virtualizer,
    renderCell({ rowIndex, colIndex }, cell) {
      // Synthetic content — the cell's row + col index, plus a fake
      // value derived from the index. Avoid string concatenation on
      // every render by setting textContent only when it changes.
      const text =
        colIndex === 0 ? `R-${String(rowIndex).padStart(7, "0")}` : `${rowIndex}.${colIndex}`
      if (cell.textContent !== text) cell.textContent = text
    },
    onAfterRender() {
      cellCountEl.textContent = String(grid.querySelectorAll(".bc-grid-cell").length)
      const cost = performance.now() - lastRenderStart
      renderMsEl.textContent = `${cost.toFixed(2)}ms`
    },
  })

  // Wrap render to measure cost.
  const originalRender = renderer.render.bind(renderer)
  renderer.render = () => {
    lastRenderStart = performance.now()
    originalRender()
  }

  renderer.mount()
}

// FPS meter — sampled over a 1s rolling window.
let frameCount = 0
let lastFpsUpdate = performance.now()
function fpsTick() {
  frameCount++
  const now = performance.now()
  if (now - lastFpsUpdate >= 1000) {
    fpsEl.textContent = String(frameCount)
    frameCount = 0
    lastFpsUpdate = now
  }
  requestAnimationFrame(fpsTick)
}
requestAnimationFrame(fpsTick)

// Initial build
buildGrid(Number(rowCountInput.value), Number(colCountInput.value))

applyBtn.addEventListener("click", () => {
  buildGrid(Number(rowCountInput.value), Number(colCountInput.value))
})

scrollToEndBtn.addEventListener("click", () => {
  renderer.scrollToCell(virtualizer.rowCount - 1, virtualizer.colCount - 1, "start")
})

scrollToMiddleBtn.addEventListener("click", () => {
  renderer.scrollToCell(
    Math.floor(virtualizer.rowCount / 2),
    Math.floor(virtualizer.colCount / 2),
    "center",
  )
})

// Auto-scroll: continuously animate scroll for ~6s and report sustained FPS.
let autoScrollHandle: number | null = null
autoScrollBtn.addEventListener("click", () => {
  if (autoScrollHandle !== null) {
    cancelAnimationFrame(autoScrollHandle)
    autoScrollHandle = null
    autoScrollBtn.textContent = "Auto-scroll (FPS test)"
    return
  }

  autoScrollBtn.textContent = "Stop auto-scroll"
  const scrollerEl = grid.querySelector<HTMLElement>(".bc-grid-scroller")
  if (!scrollerEl) return
  const scroller: HTMLElement = scrollerEl
  const startTop = 0
  const endTop = scroller.scrollHeight - scroller.clientHeight
  const duration = 6000 // 6 seconds for a clean FPS sample
  const start = performance.now()

  function step(now: number) {
    const elapsed = (now - start) % duration
    const progress = elapsed / duration
    // ping-pong: 0..1..0..1...
    const t = progress < 0.5 ? progress * 2 : (1 - progress) * 2
    scroller.scrollTop = startTop + (endTop - startTop) * t
    autoScrollHandle = requestAnimationFrame(step)
  }
  autoScrollHandle = requestAnimationFrame(step)
})
