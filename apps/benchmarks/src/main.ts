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

import type { ServerBlockResult, ServerViewState } from "@bc-grid/core"
import { createServerRowModel } from "@bc-grid/server-row-model"
import { DOMRenderer, type RenderCellParams, Virtualizer } from "@bc-grid/virtualizer"

interface PerfMetric {
  durationMs: number
  rowCount: number
}

interface ScrollPerfMetric extends PerfMetric {
  fps: number
  frameCount: number
}

interface ServerRowModelPerfInput {
  blockSize?: number
  debounceMs?: number
  fetchDelayMs?: number
  maxBlocks?: number
  maxConcurrentRequests?: number
  rowCount?: number
}

interface PrefetchSweepPerfInput {
  blockSize?: number
  fetchDelayMs?: number
  maxBlocks?: number
  maxConcurrentRequests?: number
  prefetchAhead: number
  rowCount?: number
  scrollSteps?: number
  scrollStepRows?: number
  viewportRows?: number
}

interface GroupRowsPerfInput {
  groupCount?: number
  leafRowsPerGroup?: number
  levels?: number
  viewportRows?: number
}

interface PrefetchSweepPerfMetric extends PerfMetric {
  blocksCached: number
  blocksFetched: number
  cacheHitRate: number
  immediateContentRate: number
  prefetchAhead: number
  scrollSteps: number
}

interface ServerRowModelPerfMetric extends PerfMetric {
  avgFetchLatencyMs: number
  avgQueueWaitMs: number
  blockFetches: number
  blockSize: number
  cacheHitRate: number
  debounceMs: number
  dedupedRequests: number
  hotCacheHitRate: number
  loadedBlocks: number
  maxBlocks: number
  maxConcurrentRequests: number
  maxFetchLatencyMs: number
  maxQueueDepth: number
  maxQueueWaitMs: number
  queuedRequests: number
}

interface GroupRowsPerfMetric extends PerfMetric {
  collapsedFlattenMs: number
  collapsedRowCount: number
  expandedFlattenMs: number
  expandedRowCount: number
  groupCount: number
  groupRowCount: number
  leafRowsPerGroup: number
  levels: number
  rowHeightBucketMs: number
  treeBuildMs: number
  virtualizerMs: number
  visibleRowCount: number
}

interface PerfRow {
  id: number
  customer: string
  status: "open" | "posted" | "held"
  amount: number
  values: number[]
}

declare global {
  interface Window {
    __autoScrollDone__: boolean
    __bcGridPerf: {
      mountGrid(): Promise<PerfMetric>
      sortRows(): Promise<PerfMetric>
      filterRows(): Promise<PerfMetric>
      scrollForFps(durationMs?: number): Promise<ScrollPerfMetric>
      serverRowModelBlocks(input?: ServerRowModelPerfInput): Promise<ServerRowModelPerfMetric>
      serverRowModelPrefetchSweep(input: PrefetchSweepPerfInput): Promise<PrefetchSweepPerfMetric>
      groupRowsExpand(input?: GroupRowsPerfInput): Promise<GroupRowsPerfMetric>
      rawRowCount: number
    }
    __fps__: number[]
    __renderCount__: number
  }
}

function $<T extends Element>(selector: string): T {
  const el = document.querySelector<T>(selector)
  if (!el) throw new Error(`Missing element: ${selector}`)
  return el
}

function applyNumericParam(name: string, input: HTMLInputElement): void {
  const value = urlParams.get(name)
  if (value === null) return
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return
  input.value = String(parsed)
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
const pinnedTopInput = $<HTMLInputElement>("#pinnedTop")
const pinnedBottomInput = $<HTMLInputElement>("#pinnedBottom")
const variableHeightToggle = $<HTMLInputElement>("#variableHeight")
const applyBtn = $<HTMLButtonElement>("#apply")
const scrollToEndBtn = $<HTMLButtonElement>("#scrollToEnd")
const scrollToMiddleBtn = $<HTMLButtonElement>("#scrollToMiddle")
const autoScrollBtn = $<HTMLButtonElement>("#autoScroll")

const urlParams = new URLSearchParams(location.search)
applyNumericParam("rows", rowCountInput)
applyNumericParam("cols", colCountInput)
applyNumericParam("pinnedLeft", pinnedLeftInput)
applyNumericParam("pinnedRight", pinnedRightInput)
applyNumericParam("pinnedTop", pinnedTopInput)
applyNumericParam("pinnedBottom", pinnedBottomInput)
if (urlParams.get("variableHeight") === "true") variableHeightToggle.checked = true

const rawRows = urlParams.has("rawData")
  ? createPerfRows(Number(rowCountInput.value), Number(colCountInput.value))
  : []
let filteredRows: PerfRow[] = []

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
  const pinnedTop = Math.max(0, Math.min(rows, Number(pinnedTopInput.value)))
  const pinnedBottom = Math.max(0, Math.min(rows - pinnedTop, Number(pinnedBottomInput.value)))

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
    pinnedTopRows: pinnedTop,
    pinnedBottomRows: pinnedBottom,
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
    renderCell({ rowIndex, colIndex }: RenderCellParams, cell: HTMLElement) {
      const row = rawRows[rowIndex]
      const text = row
        ? colIndex === 0
          ? `R-${String(row.id).padStart(7, "0")}`
          : String(row.values[colIndex] ?? `${row.id}.${colIndex}`)
        : colIndex === 0
          ? `R-${String(rowIndex).padStart(7, "0")}`
          : `${rowIndex}.${colIndex}`
      if (cell.textContent !== text) cell.textContent = text
    },
    onAfterRender() {
      cellCountEl.textContent = String(grid.querySelectorAll(".bc-grid-cell").length)
      const cost = performance.now() - lastRenderStart
      renderMsEl.textContent = `${cost.toFixed(2)}ms`
      refreshActiveCellHighlight()
      window.__renderCount__ = renderer.renderCount
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
window.__fps__ = fpsSamples

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

if (urlParams.get("mount") !== "false") {
  buildGrid()
} else {
  window.__renderCount__ = 0
}

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
window.__autoScrollDone__ = false

autoScrollBtn.addEventListener("click", () => startAutoScroll())

function startAutoScroll(): void {
  if (autoScrollHandle !== null) {
    cancelAnimationFrame(autoScrollHandle)
    autoScrollHandle = null
    autoScrollBtn.textContent = "Auto-scroll (FPS test)"
    return
  }

  autoScrollBtn.textContent = "Stop auto-scroll"
  window.__autoScrollDone__ = false
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
      window.__autoScrollDone__ = true
      return
    }
    const progress = (elapsed % duration) / duration
    const t = progress < 0.5 ? progress * 2 : (1 - progress) * 2
    scroller.scrollTop = startTop + (endTop - startTop) * t
    autoScrollHandle = requestAnimationFrame(step)
  }
  autoScrollHandle = requestAnimationFrame(step)
}

async function scrollForFps(durationMs = 1000): Promise<ScrollPerfMetric> {
  const scrollerEl = grid.querySelector<HTMLElement>(".bc-grid-scroller")
  if (!scrollerEl) throw new Error("Cannot run scroll perf without a mounted grid")
  const scroller: HTMLElement = scrollerEl

  await nextPaint()

  return new Promise((resolve) => {
    const start = performance.now()
    const endTop = scroller.scrollHeight - scroller.clientHeight
    let frameCount = 0

    function step(now: number) {
      frameCount++
      const elapsed = now - start
      const progress = Math.min(1, elapsed / durationMs)
      scroller.scrollTop = endTop * progress

      if (elapsed >= durationMs) {
        resolve({
          durationMs: elapsed,
          fps: (frameCount / elapsed) * 1000,
          frameCount,
          rowCount: virtualizer.rowCount,
        })
        return
      }

      requestAnimationFrame(step)
    }

    requestAnimationFrame(step)
  })
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

if (urlParams.get("autorun") === "fps") {
  requestAnimationFrame(() => requestAnimationFrame(() => startAutoScroll()))
}

window.__bcGridPerf = {
  async mountGrid() {
    const start = performance.now()
    buildGrid()
    await nextPaint()
    return { durationMs: performance.now() - start, rowCount: virtualizer.rowCount }
  },
  async sortRows() {
    const start = performance.now()
    rawRows.sort((a, b) => a.amount - b.amount || a.id - b.id)
    renderer?.render()
    await nextPaint()
    return { durationMs: performance.now() - start, rowCount: rawRows.length }
  },
  async filterRows() {
    const start = performance.now()
    filteredRows = rawRows.filter((row) => row.customer.includes("42") || row.status === "held")
    await nextPaint()
    return { durationMs: performance.now() - start, rowCount: filteredRows.length }
  },
  get rawRowCount() {
    return rawRows.length
  },
  scrollForFps,
  serverRowModelBlocks,
  serverRowModelPrefetchSweep,
  groupRowsExpand,
}

interface GroupRowsPerfTree {
  groupRowCount: number
  leafRowCount: number
  roots: readonly GroupRowsPerfGroup[]
}

interface GroupRowsPerfGroup {
  id: number
  children: GroupRowsPerfGroup[]
  leafCount: number
  leafStart: number
}

async function groupRowsExpand(input: GroupRowsPerfInput = {}): Promise<GroupRowsPerfMetric> {
  const levels = input.levels ?? 5
  const groupCount = input.groupCount ?? 1000
  const leafRowsPerGroup = input.leafRowsPerGroup ?? 1000
  const viewportRows = input.viewportRows ?? 40

  const startedAt = performance.now()
  const treeStartedAt = performance.now()
  const tree = createGroupRowsPerfTree({ groupCount, leafRowsPerGroup, levels })
  const treeBuildMs = performance.now() - treeStartedAt

  const collapsedStartedAt = performance.now()
  const collapsedRows = flattenGroupRows(tree, new Set())
  const collapsedFlattenMs = performance.now() - collapsedStartedAt

  const expandedGroupIds = new Set<number>()
  for (let id = 0; id < tree.groupRowCount; id += 1) expandedGroupIds.add(id)

  const expandedStartedAt = performance.now()
  const expandedRows = flattenGroupRows(tree, expandedGroupIds)
  const expandedFlattenMs = performance.now() - expandedStartedAt

  const virtualizerStartedAt = performance.now()
  const virtualizedGroupRows = new Virtualizer({
    rowCount: expandedRows.length,
    colCount: 8,
    defaultRowHeight: 32,
    defaultColWidth: 120,
    viewportHeight: viewportRows * 32,
    viewportWidth: 960,
    rowOverscan: 6,
    colOverscan: 2,
  })

  const rowHeightBucketStartedAt = performance.now()
  for (let index = 0; index < expandedRows.length; index += 1) {
    if ((expandedRows[index] ?? 0) < 0) virtualizedGroupRows.setRowHeight(index, 28)
  }
  const rowHeightBucketMs = performance.now() - rowHeightBucketStartedAt

  virtualizedGroupRows.setScrollTop(
    virtualizedGroupRows.scrollOffsetForRow(Math.floor(expandedRows.length / 2), "center"),
  )
  const visibleRowCount = virtualizedGroupRows.computeWindow().rows.length
  const virtualizerMs = performance.now() - virtualizerStartedAt

  await nextPaint()

  return {
    collapsedFlattenMs,
    collapsedRowCount: collapsedRows.length,
    durationMs: performance.now() - startedAt,
    expandedFlattenMs,
    expandedRowCount: expandedRows.length,
    groupCount,
    groupRowCount: tree.groupRowCount,
    leafRowsPerGroup,
    levels,
    rowCount: tree.leafRowCount,
    rowHeightBucketMs,
    treeBuildMs,
    virtualizerMs,
    visibleRowCount,
  }
}

function createGroupRowsPerfTree({
  groupCount,
  leafRowsPerGroup,
  levels,
}: {
  groupCount: number
  leafRowsPerGroup: number
  levels: number
}): GroupRowsPerfTree {
  const roots: GroupRowsPerfGroup[] = []
  let groupRowCount = 0
  for (let groupIndex = 0; groupIndex < groupCount; groupIndex += 1) {
    let root: GroupRowsPerfGroup | null = null
    let parent: { children: GroupRowsPerfGroup[] } | null = null
    for (let level = 0; level < levels; level += 1) {
      const node: GroupRowsPerfGroup = {
        children: [],
        id: groupRowCount,
        leafCount: level === levels - 1 ? leafRowsPerGroup : 0,
        leafStart: groupIndex * leafRowsPerGroup,
      }
      groupRowCount += 1
      if (parent) parent.children.push(node)
      else root = node
      parent = node
    }
    if (root) roots.push(root)
  }
  return {
    groupRowCount,
    leafRowCount: groupCount * leafRowsPerGroup,
    roots,
  }
}

function flattenGroupRows(
  tree: GroupRowsPerfTree,
  expandedGroupIds: ReadonlySet<number>,
): number[] {
  const output: number[] = []
  const appendGroup = (group: GroupRowsPerfGroup): void => {
    output.push(-group.id - 1)
    if (!expandedGroupIds.has(group.id)) return
    for (const child of group.children) appendGroup(child)
    for (let offset = 0; offset < group.leafCount; offset += 1) {
      output.push(group.leafStart + offset)
    }
  }
  for (const root of tree.roots) appendGroup(root)
  return output
}

async function serverRowModelBlocks(
  input: ServerRowModelPerfInput = {},
): Promise<ServerRowModelPerfMetric> {
  const rowCount = input.rowCount ?? 100_000
  const blockSize = input.blockSize ?? 100
  const maxBlocks = input.maxBlocks ?? Math.ceil(rowCount / blockSize)
  const debounceMs = input.debounceMs ?? 16
  const maxConcurrentRequests = input.maxConcurrentRequests ?? 4
  const fetchDelayMs = input.fetchDelayMs ?? 1
  const blockCount = Math.ceil(rowCount / blockSize)
  const view: ServerViewState = {
    groupBy: [],
    sort: [{ columnId: "amount", direction: "asc" }],
    visibleColumns: ["customer", "status", "amount"],
  }
  const model = createServerRowModel<PerfRow>()
  const rows = rawRows.length >= rowCount ? rawRows : createPerfRows(rowCount, 10)
  const loadBlock = async (query: { blockStart: number; blockSize: number }): Promise<
    ServerBlockResult<PerfRow>
  > => {
    if (fetchDelayMs > 0) await wait(fetchDelayMs)
    const resultRows = rows.slice(query.blockStart, query.blockStart + query.blockSize)
    return {
      blockSize: query.blockSize,
      blockStart: query.blockStart,
      hasMore: query.blockStart + resultRows.length < rowCount,
      rows: resultRows,
      totalRows: rowCount,
    }
  }

  const blockStarts = Array.from({ length: blockCount }, (_, index) => index * blockSize)
  const startedAt = performance.now()
  const firstPass = blockStarts.map((blockStart) =>
    model.loadInfiniteBlock({
      blockSize,
      blockStart,
      cacheOptions: {
        blockLoadDebounceMs: debounceMs,
        maxBlocks,
        maxConcurrentRequests,
        staleTimeMs: 60_000,
      },
      loadBlock,
      view,
    }),
  )
  await Promise.all(firstPass.map((request) => request.promise))

  let hotCacheHits = 0
  for (const blockStart of blockStarts) {
    const request = model.loadInfiniteBlock({
      blockSize,
      blockStart,
      cacheOptions: {
        blockLoadDebounceMs: debounceMs,
        maxBlocks,
        maxConcurrentRequests,
        staleTimeMs: 60_000,
      },
      loadBlock,
      view,
    })
    if (request.cached) hotCacheHits += 1
    await request.promise
  }

  const metrics = model.getMetrics()
  return {
    avgFetchLatencyMs: metrics.blockFetchLatencyMs.avgMs,
    avgQueueWaitMs: metrics.blockQueueWaitMs.avgMs,
    blockFetches: metrics.blockFetches,
    blockSize,
    cacheHitRate: metrics.cacheHitRate,
    debounceMs,
    dedupedRequests: metrics.dedupedRequests,
    durationMs: performance.now() - startedAt,
    hotCacheHitRate: hotCacheHits / blockCount,
    loadedBlocks: firstPass.length,
    maxBlocks,
    maxConcurrentRequests,
    maxFetchLatencyMs: metrics.blockFetchLatencyMs.maxMs,
    maxQueueDepth: metrics.maxQueueDepth,
    maxQueueWaitMs: metrics.blockQueueWaitMs.maxMs,
    queuedRequests: metrics.queuedRequests,
    rowCount,
  }
}

// `v06-server-perf-prefetch-budget-tuning` (worker1 audit P1 §6).
// Simulates a scrolling user under the React layer's
// `handleVisibleRowRangeChange` contract: each scroll step calls
// ensureBlock(start), ensureBlock(end), and prefetches the next
// `prefetchAhead` blocks past the visible window's tail. Tracks
// per-step cache hits + total fetches so the bench can A/B compare
// prefetchAhead = 0 / 1 / 2 / 3 against the same scroll trace and
// surface the marginal value of bumping the default.
async function serverRowModelPrefetchSweep(
  input: PrefetchSweepPerfInput,
): Promise<PrefetchSweepPerfMetric> {
  const rowCount = input.rowCount ?? 10_000
  const blockSize = input.blockSize ?? 100
  const viewportRows = input.viewportRows ?? 50
  const scrollSteps = input.scrollSteps ?? 100
  const scrollStepRows = input.scrollStepRows ?? 50
  const prefetchAhead = Math.max(0, Math.floor(input.prefetchAhead))
  const fetchDelayMs = input.fetchDelayMs ?? 1
  const maxConcurrentRequests = input.maxConcurrentRequests ?? 4

  const view: ServerViewState = {
    groupBy: [],
    sort: [{ columnId: "amount", direction: "asc" }],
    visibleColumns: ["customer", "status", "amount"],
  }
  const model = createServerRowModel<PerfRow>()
  const rows = rawRows.length >= rowCount ? rawRows : createPerfRows(rowCount, 10)
  const loadBlock = async (query: {
    blockStart: number
    blockSize: number
  }): Promise<ServerBlockResult<PerfRow>> => {
    if (fetchDelayMs > 0) await wait(fetchDelayMs)
    const resultRows = rows.slice(query.blockStart, query.blockStart + query.blockSize)
    return {
      blockSize: query.blockSize,
      blockStart: query.blockStart,
      hasMore: query.blockStart + resultRows.length < rowCount,
      rows: resultRows,
      totalRows: rowCount,
    }
  }

  function ensureBlockAt(rowIndex: number): {
    cached: boolean
    deduped: boolean
    promise: Promise<unknown>
  } {
    const blockStart = Math.max(0, Math.floor(rowIndex / blockSize) * blockSize)
    const cacheOptions = {
      blockLoadDebounceMs: 0,
      maxConcurrentRequests,
      ...(input.maxBlocks !== undefined ? { maxBlocks: input.maxBlocks } : {}),
    }
    return model.loadInfiniteBlock({
      blockSize,
      blockStart,
      cacheOptions,
      loadBlock,
      view,
    })
  }

  let blocksFetched = 0
  let blocksCached = 0
  let immediateContentSteps = 0

  const startedAt = performance.now()
  const allPromises: Promise<unknown>[] = []
  for (let step = 0; step < scrollSteps; step += 1) {
    const startIndex = step * scrollStepRows
    const endIndex = Math.min(startIndex + viewportRows - 1, rowCount - 1)
    if (endIndex >= rowCount - 1) break

    // Probe whether every block needed for this scroll step is already
    // cached BEFORE issuing the ensureBlock calls. This is the
    // user-perceived "instant content on scroll" metric.
    const startBlockKey = `infinite:${model.createViewKey(view)}:start:${
      Math.floor(startIndex / blockSize) * blockSize
    }:size:${blockSize}`
    const endBlockKey = `infinite:${model.createViewKey(view)}:start:${
      Math.floor(endIndex / blockSize) * blockSize
    }:size:${blockSize}`
    const startCached = model.cache.get(startBlockKey)?.state === "loaded"
    const endCached = model.cache.get(endBlockKey)?.state === "loaded"
    if (startCached && endCached) immediateContentSteps += 1

    // Fire ensureBlock per the React layer's algorithm. Track cached vs
    // fetched per call.
    const calls = [ensureBlockAt(startIndex), ensureBlockAt(endIndex)]
    for (let i = 1; i <= prefetchAhead; i += 1) {
      calls.push(ensureBlockAt(endIndex + blockSize * i))
    }
    for (const call of calls) {
      if (call.cached) blocksCached += 1
      else if (!call.deduped) blocksFetched += 1
      allPromises.push(call.promise.catch(() => undefined))
    }

    // Wait one tick so the model's debounce/queue runs; mirrors how a
    // real scroll handler interleaves with the model's debouncer.
    await wait(0)
  }

  await Promise.all(allPromises)
  const duration = performance.now() - startedAt

  const totalCalls = blocksFetched + blocksCached
  return {
    blocksCached,
    blocksFetched,
    cacheHitRate: totalCalls > 0 ? blocksCached / totalCalls : 0,
    durationMs: duration,
    immediateContentRate: scrollSteps > 0 ? immediateContentSteps / scrollSteps : 0,
    prefetchAhead,
    rowCount,
    scrollSteps,
  }
}

function createPerfRows(rowCount: number, colCount: number): PerfRow[] {
  const statuses = ["open", "posted", "held"] as const
  return Array.from({ length: rowCount }, (_, rowIndex) => {
    const values = Array.from({ length: colCount }, (_, colIndex) => rowIndex * colCount + colIndex)
    return {
      id: rowIndex,
      customer: `Customer ${String(rowIndex % 997).padStart(3, "0")}`,
      status: statuses[rowIndex % statuses.length] ?? "open",
      amount: ((rowIndex * 7919) % 1_000_000) / 100,
      values,
    }
  })
}

function nextPaint(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()))
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
