/**
 * Virtualizer spike harness.
 *
 * Renders 100k rows × 30 cols (configurable) using @bc-grid/virtualizer's
 * DOMRenderer. Measures FPS during continuous scroll, exposes the cell
 * count in the DOM, and the per-render cost.
 *
 * Validates design.md §3.2 perf bars and the accessibility-rfc retention
 * contract:
 *  - Pinned-left/right columns stick to the scroller viewport edges.
 *  - Variable-height rows (toggle) preserve correct totalHeight + scroll-to.
 *  - Keyboard arrow keys move the active cell; the active row is retained
 *    so its DOM node persists across virtualisation when scrolled out.
 *  - Auto-scroll runs a ping-pong scroll for measured FPS sampling.
 *
 * Pure DOM, no React.
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
const activeCellEl = $<HTMLElement>("#activeCell")

const rowCountInput = $<HTMLInputElement>("#rowCount")
const colCountInput = $<HTMLInputElement>("#colCount")
const pinnedLeftInput = $<HTMLInputElement>("#pinnedLeft")
const pinnedRightInput = $<HTMLInputElement>("#pinnedRight")
const variableHeightToggle = $<HTMLInputElement>("#variableHeight")
const applyBtn = $<HTMLButtonElement>("#apply")
const scrollToEndBtn = $<HTMLButtonElement>("#scrollToEnd")
const scrollToMiddleBtn = $<HTMLButtonElement>("#scrollToMiddle")
const autoScrollBtn = $<HTMLButtonElement>("#autoScroll")

let virtualizer: Virtualizer
let renderer: DOMRenderer

// Active cell — the spike's stand-in for keyboard focus. The active row is
// always retained so that the cell DOM node persists when the row scrolls
// out of viewport (per accessibility-rfc 2-row retention budget).
let activeRow = 0
let activeCol = 0

function updateActiveCellLabel(): void {
  activeCellEl.textContent = `R${activeRow},C${activeCol}`
}

function findCellElement(rowIndex: number, colIndex: number): HTMLElement | null {
  return grid.querySelector<HTMLElement>(
    `.bc-grid-row[data-row-index="${rowIndex}"] .bc-grid-cell[data-col-index="${colIndex}"]`,
  )
}

function refreshActiveCellHighlight(): void {
  for (const cell of grid.querySelectorAll(".bc-grid-cell.is-active")) {
    cell.classList.remove("is-active")
  }
  const cell = findCellElement(activeRow, activeCol)
  cell?.classList.add("is-active")
}

function buildGrid(): void {
  const rows = Number(rowCountInput.value)
  const cols = Number(colCountInput.value)
  const pinnedLeft = Math.max(0, Math.min(cols, Number(pinnedLeftInput.value)))
  const pinnedRight = Math.max(0, Math.min(cols - pinnedLeft, Number(pinnedRightInput.value)))

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
    pinnedLeftCols: pinnedLeft,
    pinnedRightCols: pinnedRight,
  })

  if (variableHeightToggle.checked) {
    applyVariableHeights(virtualizer, rows)
  }

  // Clamp active cell to new dataset.
  activeRow = Math.min(activeRow, rows - 1)
  activeCol = Math.min(activeCol, cols - 1)
  virtualizer.retainRow(activeRow, true)
  virtualizer.retainCol(activeCol, true)
  updateActiveCellLabel()

  let lastRenderStart = 0

  renderer = new DOMRenderer({
    host: grid,
    virtualizer,
    renderCell({ rowIndex, colIndex }, cell) {
      const text =
        colIndex === 0 ? `R-${String(rowIndex).padStart(7, "0")}` : `${rowIndex}.${colIndex}`
      if (cell.textContent !== text) cell.textContent = text
    },
    onAfterRender() {
      cellCountEl.textContent = String(grid.querySelectorAll(".bc-grid-cell").length)
      const cost = performance.now() - lastRenderStart
      renderMsEl.textContent = `${cost.toFixed(2)}ms`
      refreshActiveCellHighlight()
    },
  })

  const originalRender = renderer.render.bind(renderer)
  renderer.render = () => {
    lastRenderStart = performance.now()
    originalRender()
  }

  renderer.mount()
}

/**
 * Stamp deterministic non-uniform heights so screenshots / Playwright runs
 * are reproducible. Pattern: every 7th row is 56px, every 13th is 24px,
 * everything else default (32px).
 */
function applyVariableHeights(v: Virtualizer, rowCount: number): void {
  for (let i = 0; i < rowCount; i++) {
    if (i % 7 === 0 && i % 13 !== 0) v.setRowHeight(i, 56)
    else if (i % 13 === 0) v.setRowHeight(i, 24)
  }
}

// FPS meter — sampled over a 1s rolling window. The headless Playwright
// test reads `__fps__` from the page to assert the perf bar.
let frameCount = 0
let lastFpsUpdate = performance.now()
const fpsSamples: number[] = []
;(globalThis as unknown as { __fps__: number[] }).__fps__ = fpsSamples

function fpsTick() {
  frameCount++
  const now = performance.now()
  if (now - lastFpsUpdate >= 1000) {
    fpsEl.textContent = String(frameCount)
    fpsSamples.push(frameCount)
    if (fpsSamples.length > 60) fpsSamples.shift()
    frameCount = 0
    lastFpsUpdate = now
  }
  requestAnimationFrame(fpsTick)
}
requestAnimationFrame(fpsTick)

// ---- Initial build + control wiring ---------------------------------------

buildGrid()

applyBtn.addEventListener("click", () => buildGrid())
variableHeightToggle.addEventListener("change", () => buildGrid())

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

// ---- Auto-scroll (ping-pong, 6s) ------------------------------------------

let autoScrollHandle: number | null = null
;(globalThis as unknown as { __autoScrollDone__: boolean }).__autoScrollDone__ = false

autoScrollBtn.addEventListener("click", () => startAutoScroll())

function startAutoScroll(): void {
  if (autoScrollHandle !== null) {
    cancelAnimationFrame(autoScrollHandle)
    autoScrollHandle = null
    autoScrollBtn.textContent = "Auto-scroll (FPS test)"
    return
  }

  autoScrollBtn.textContent = "Stop auto-scroll"
  ;(globalThis as unknown as { __autoScrollDone__: boolean }).__autoScrollDone__ = false
  const scrollerEl = grid.querySelector<HTMLElement>(".bc-grid-scroller")
  if (!scrollerEl) return
  const scroller: HTMLElement = scrollerEl
  const startTop = 0
  const endTop = scroller.scrollHeight - scroller.clientHeight
  const duration = 6000
  const start = performance.now()

  function step(now: number) {
    const elapsed = now - start
    if (elapsed >= duration) {
      autoScrollHandle = null
      autoScrollBtn.textContent = "Auto-scroll (FPS test)"
      ;(globalThis as unknown as { __autoScrollDone__: boolean }).__autoScrollDone__ = true
      return
    }
    const progress = (elapsed % duration) / duration
    const t = progress < 0.5 ? progress * 2 : (1 - progress) * 2
    scroller.scrollTop = startTop + (endTop - startTop) * t
    autoScrollHandle = requestAnimationFrame(step)
  }
  autoScrollHandle = requestAnimationFrame(step)
}

// ---- Keyboard navigation + focus retention --------------------------------

/**
 * Move the active cell. Retains the new active row (so the row's DOM node
 * persists when scrolled out of viewport) and releases the previous one,
 * keeping the retention budget at 1 active + 0 = 1 row (well within the
 * 2-row budget from accessibility-rfc).
 *
 * Calls scrollToCell with `align: "nearest"` so the active cell stays in
 * view when the user nudges off-screen via arrow key.
 */
function moveActive(deltaRow: number, deltaCol: number): void {
  const prevRow = activeRow
  const prevCol = activeCol

  activeRow = Math.max(0, Math.min(virtualizer.rowCount - 1, prevRow + deltaRow))
  activeCol = Math.max(0, Math.min(virtualizer.colCount - 1, prevCol + deltaCol))

  if (activeRow === prevRow && activeCol === prevCol) return

  if (prevRow !== activeRow) {
    virtualizer.retainRow(prevRow, false)
    virtualizer.retainRow(activeRow, true)
  }
  if (prevCol !== activeCol) {
    virtualizer.retainCol(prevCol, false)
    virtualizer.retainCol(activeCol, true)
  }

  renderer.scrollToCell(activeRow, activeCol, "nearest")
  // scrollToCell only scrolls — render comes from the scroll RAF.
  // Trigger an immediate render so the highlight updates synchronously even
  // if no scroll was needed (e.g., already in view).
  renderer.render()
  updateActiveCellLabel()
}

window.addEventListener("keydown", (e) => {
  if (e.target !== document.body && e.target !== grid) return
  switch (e.key) {
    case "ArrowDown":
      moveActive(1, 0)
      e.preventDefault()
      break
    case "ArrowUp":
      moveActive(-1, 0)
      e.preventDefault()
      break
    case "ArrowRight":
      moveActive(0, 1)
      e.preventDefault()
      break
    case "ArrowLeft":
      moveActive(0, -1)
      e.preventDefault()
      break
    case "PageDown":
      moveActive(20, 0)
      e.preventDefault()
      break
    case "PageUp":
      moveActive(-20, 0)
      e.preventDefault()
      break
    case "Home":
      moveActive(0, -virtualizer.colCount)
      e.preventDefault()
      break
    case "End":
      moveActive(0, virtualizer.colCount)
      e.preventDefault()
      break
  }
})

// Make grid focusable so it receives keyboard events naturally.
grid.tabIndex = 0

// ---- Headless autorun -----------------------------------------------------
// When Playwright loads the page with `?autorun=fps`, kick off auto-scroll
// after first paint so the test can sample without UI clicking.

if (new URLSearchParams(location.search).get("autorun") === "fps") {
  requestAnimationFrame(() => requestAnimationFrame(() => startAutoScroll()))
}
