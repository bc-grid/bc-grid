import { type FlipRect, playFlip, readFlipRect } from "@bc-grid/animations"

interface InvoiceRow {
  id: string
  customer: string
  status: "Open" | "Posted" | "Held"
  dueDate: string
  amount: number
}

interface FrameStats {
  fps: number
  maxFrameMs: number
  slowFrames: number
  layoutMs: number
  durationMs: number
}

declare global {
  interface Window {
    __bcGridAnimationStats?: FrameStats
  }
}

const rowCount = 1000
const customers = [
  "Abbott Homes",
  "Northline Civil",
  "Westmere Projects",
  "Clearwater Plumbing",
  "Lytton Foods",
  "Meridian Health",
  "Harbour Freight",
  "Summit Electrical",
]
const statuses: InvoiceRow["status"][] = ["Open", "Posted", "Held"]
const rowHeight = 32
const urlParams = new URLSearchParams(window.location.search)
const animationBudget = Number(urlParams.get("budget") ?? rowCount)
const animationDuration = Number(urlParams.get("duration") ?? 300)

const rowsEl = mustQuery<HTMLElement>("#rows")
const sortButton = mustQuery<HTMLButtonElement>("#sort")
const fpsEl = mustQuery<HTMLElement>("#fps")
const maxFrameEl = mustQuery<HTMLElement>("#maxFrame")
const slowFramesEl = mustQuery<HTMLElement>("#slowFrames")
const layoutEl = mustQuery<HTMLElement>("#layout")
const durationEl = mustQuery<HTMLElement>("#duration")

let rows = createRows(rowCount)
let ascending = true
let running = false
const rowElements = new Map<string, HTMLElement>()

renderRows(rows)

sortButton.addEventListener("click", () => {
  void runSortBenchmark()
})

if (new URLSearchParams(window.location.search).has("autorun")) {
  window.setTimeout(() => {
    void runSortBenchmark()
  }, 100)
}

async function runSortBenchmark(): Promise<FrameStats> {
  if (running) return window.__bcGridAnimationStats ?? emptyStats()
  running = true
  sortButton.disabled = true

  const firstRects = captureRects()
  rows = [...rows].sort((a, b) => (ascending ? a.amount - b.amount : b.amount - a.amount))
  ascending = !ascending
  const layoutStart = performance.now()
  renderRows(rows)
  const layoutMs = performance.now() - layoutStart

  await nextFrame()
  const stopFrameSampling = sampleFrames()
  const animations: Animation[] = []

  for (const row of rows) {
    if (animations.length >= animationBudget) break
    const element = rowsEl.querySelector<HTMLElement>(`[data-row-id="${row.id}"]`)
    const first = firstRects.get(row.id)
    if (!element || !first) continue
    const animation = playFlip(element, first, {
      duration: animationDuration,
      reducedMotion: false,
    })
    if (animation) animations.push(animation)
  }

  await Promise.allSettled(animations.map((animation) => animation.finished))
  const stats = { ...stopFrameSampling(), layoutMs }
  window.__bcGridAnimationStats = stats
  document.body.dataset.benchmark = "done"
  updateMetrics(stats)

  sortButton.disabled = false
  running = false
  return stats
}

function renderRows(nextRows: readonly InvoiceRow[]): void {
  const fragment = document.createDocumentFragment()
  rowsEl.style.height = `${nextRows.length * rowHeight}px`

  for (let index = 0; index < nextRows.length; index++) {
    const row = nextRows[index]
    if (!row) continue
    let element = rowElements.get(row.id)
    if (!element) {
      element = createRowElement(row)
      rowElements.set(row.id, element)
      fragment.appendChild(element)
    }
    element.style.top = `${index * rowHeight}px`
    element.setAttribute("aria-rowindex", String(index + 2))
  }

  if (fragment.childNodes.length > 0) {
    rowsEl.appendChild(fragment)
  }
}

function createRowElement(row: InvoiceRow): HTMLElement {
  const element = document.createElement("div")
  element.className = "grid-row"
  element.dataset.rowId = row.id
  element.setAttribute("role", "row")

  element.append(
    cell(row.id),
    cell(row.customer),
    statusCell(row.status),
    cell(row.dueDate),
    cell(currency(row.amount)),
  )

  return element
}

function cell(value: string): HTMLElement {
  const element = document.createElement("span")
  element.className = "grid-cell"
  element.setAttribute("role", "gridcell")
  element.textContent = value
  return element
}

function statusCell(status: InvoiceRow["status"]): HTMLElement {
  const element = cell("")
  const pill = document.createElement("span")
  pill.className = `status status-${status.toLowerCase()}`
  pill.textContent = status
  element.appendChild(pill)
  return element
}

function captureRects(): Map<string, FlipRect> {
  const rects = new Map<string, FlipRect>()
  for (const element of rowsEl.querySelectorAll<HTMLElement>("[data-row-id]")) {
    const rowId = element.dataset.rowId
    if (rowId) rects.set(rowId, readFlipRect(element))
  }
  return rects
}

function sampleFrames(): () => FrameStats {
  let frameCount = 0
  let slowFrames = 0
  let maxFrameMs = 0
  let last = performance.now()
  const start = last
  let raf = 0

  function tick(now: number): void {
    const frameMs = now - last
    last = now
    if (frameMs <= 0) {
      raf = requestAnimationFrame(tick)
      return
    }
    frameCount++
    maxFrameMs = Math.max(maxFrameMs, frameMs)
    if (frameMs > 16.7) slowFrames++
    raf = requestAnimationFrame(tick)
  }

  raf = requestAnimationFrame(tick)

  return () => {
    cancelAnimationFrame(raf)
    const durationMs = performance.now() - start
    return {
      fps: Math.round((frameCount / durationMs) * 1000),
      maxFrameMs,
      slowFrames,
      layoutMs: 0,
      durationMs,
    }
  }
}

function updateMetrics(stats: FrameStats): void {
  fpsEl.textContent = String(stats.fps)
  maxFrameEl.textContent = `${stats.maxFrameMs.toFixed(2)}ms`
  slowFramesEl.textContent = String(stats.slowFrames)
  layoutEl.textContent = `${stats.layoutMs.toFixed(2)}ms`
  durationEl.textContent = `${stats.durationMs.toFixed(0)}ms`
}

function createRows(count: number): InvoiceRow[] {
  return Array.from({ length: count }, (_, index) => {
    const amount = ((index * 7919) % 98500) + 500
    const day = (index % 27) + 1
    const month = ((index % 6) + 5).toString().padStart(2, "0")
    return {
      id: `AR-${(1000 + index).toString().padStart(5, "0")}`,
      customer: customers[index % customers.length] ?? "Customer",
      status: statuses[index % statuses.length] ?? "Open",
      dueDate: `2026-${month}-${day.toString().padStart(2, "0")}`,
      amount,
    }
  })
}

function currency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value)
}

function emptyStats(): FrameStats {
  return { fps: 0, maxFrameMs: 0, slowFrames: 0, layoutMs: 0, durationMs: 0 }
}

function mustQuery<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector)
  if (!element) throw new Error(`Missing element: ${selector}`)
  return element
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()))
}
