import { type Page, expect, test } from "@playwright/test"

const FPS_BAR = 58
const LATENCY_BAR_MS = 100
const MEMORY_BAR_BYTES = 30 * 1024 * 1024
const RUN_COUNT = 3
const SERVER_ROW_MODEL_BAR_MS = 3000

declare global {
  interface Window {
    __autoScrollDone__: boolean
    __bcGridPerf: {
      mountGrid(): Promise<PerfMetric>
      sortRows(): Promise<PerfMetric>
      filterRows(): Promise<PerfMetric>
      serverRowModelBlocks(input?: ServerRowModelPerfInput): Promise<ServerRowModelPerfMetric>
      rawRowCount: number
    }
    __fps__: number[]
    __renderCount__: number
  }
}

interface PerfMetric {
  durationMs: number
  rowCount: number
}

interface ServerRowModelPerfInput {
  blockSize?: number
  debounceMs?: number
  fetchDelayMs?: number
  maxBlocks?: number
  maxConcurrentRequests?: number
  rowCount?: number
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

test(`scroll FPS at 100k x 30 stays >=${FPS_BAR} (median of ${RUN_COUNT})`, async ({ page }) => {
  const medians: number[] = []

  for (let run = 0; run < RUN_COUNT; run++) {
    await page.goto(`/?autorun=fps&run=${run}`)
    await page.waitForFunction(() => window.__autoScrollDone__ === true, undefined, {
      timeout: 15_000,
    })

    const samples = await page.evaluate(() => window.__fps__.slice())
    expect(samples.length, "FPS sample count").toBeGreaterThanOrEqual(4)
    const middle = samples.slice(1, -1)
    medians.push(median(middle))
    console.log(`perf scroll run=${run + 1} samples=${JSON.stringify(samples)}`)
  }

  const result = median(medians)
  console.log(`perf scroll medians=${JSON.stringify(medians)} median=${result} bar=${FPS_BAR}`)
  expect(result).toBeGreaterThanOrEqual(FPS_BAR)
})

test(`sort and filter 100k rows stay under ${LATENCY_BAR_MS}ms`, async ({ page }) => {
  await page.goto("/?rawData=1&mount=false")
  await page.waitForFunction(() => window.__bcGridPerf.rawRowCount === 100_000)

  const sortMetrics: PerfMetric[] = []
  const filterMetrics: PerfMetric[] = []
  for (let run = 0; run < RUN_COUNT; run++) {
    sortMetrics.push(await page.evaluate(() => window.__bcGridPerf.sortRows()))
    filterMetrics.push(await page.evaluate(() => window.__bcGridPerf.filterRows()))
  }

  const sortMedian = median(sortMetrics.map((metric) => metric.durationMs))
  const filterMedian = median(filterMetrics.map((metric) => metric.durationMs))
  console.log(
    `perf row-model sort=${formatMetrics(sortMetrics)} median=${sortMedian.toFixed(2)}ms bar=${LATENCY_BAR_MS}ms`,
  )
  console.log(
    `perf row-model filter=${formatMetrics(filterMetrics)} median=${filterMedian.toFixed(2)}ms bar=${LATENCY_BAR_MS}ms`,
  )

  expect(sortMedian).toBeLessThan(LATENCY_BAR_MS)
  expect(filterMedian).toBeLessThan(LATENCY_BAR_MS)
})

test(`grid overhead memory stays under ${formatBytes(MEMORY_BAR_BYTES)}`, async ({ page }) => {
  await page.goto("/?rawData=1&mount=false")
  await page.waitForFunction(() => window.__bcGridPerf.rawRowCount === 100_000)

  const baseline = await measureHeapBytes(page)
  await page.evaluate(() => window.__bcGridPerf.mountGrid())
  await page.waitForFunction(() => window.__renderCount__ >= 1, undefined, { timeout: 5000 })
  const mounted = await measureHeapBytes(page)
  const overhead = mounted - baseline

  console.log(
    `perf memory baseline=${formatBytes(baseline)} mounted=${formatBytes(mounted)} overhead=${formatBytes(overhead)} bar=${formatBytes(MEMORY_BAR_BYTES)}`,
  )
  expect(overhead).toBeLessThan(MEMORY_BAR_BYTES)
})

test(`server row model loads and re-hits 100k cached rows under ${SERVER_ROW_MODEL_BAR_MS}ms`, async ({
  page,
}) => {
  await page.goto("/?rawData=1&mount=false&rows=100000&cols=10")
  await page.waitForFunction(() => window.__bcGridPerf.rawRowCount === 100_000)

  const metric = await page.evaluate(() =>
    window.__bcGridPerf.serverRowModelBlocks({
      blockSize: 100,
      debounceMs: 16,
      fetchDelayMs: 1,
      maxBlocks: 1000,
      maxConcurrentRequests: 4,
      rowCount: 100_000,
    }),
  )

  console.log(
    [
      `perf server-row-model rows=${metric.rowCount}`,
      `blocks=${metric.loadedBlocks}`,
      `duration=${metric.durationMs.toFixed(2)}ms`,
      `bar=${SERVER_ROW_MODEL_BAR_MS}ms`,
      `hotCacheHitRate=${metric.hotCacheHitRate.toFixed(3)}`,
      `overallHitRate=${metric.cacheHitRate.toFixed(3)}`,
      `fetchAvg=${metric.avgFetchLatencyMs.toFixed(2)}ms`,
      `fetchMax=${metric.maxFetchLatencyMs.toFixed(2)}ms`,
      `queueAvg=${metric.avgQueueWaitMs.toFixed(2)}ms`,
      `queueMax=${metric.maxQueueWaitMs.toFixed(2)}ms`,
      `queued=${metric.queuedRequests}`,
      `maxQueueDepth=${metric.maxQueueDepth}`,
      `debounce=${metric.debounceMs}ms`,
      `concurrency=${metric.maxConcurrentRequests}`,
    ].join(" "),
  )
  expect(metric.loadedBlocks).toBe(1000)
  expect(metric.blockFetches).toBe(1000)
  expect(metric.hotCacheHitRate).toBeGreaterThanOrEqual(0.99)
  expect(metric.durationMs).toBeLessThan(SERVER_ROW_MODEL_BAR_MS)
})

async function measureHeapBytes(page: Page): Promise<number> {
  const client = await page.context().newCDPSession(page)
  try {
    await client.send("HeapProfiler.enable")
    await client.send("HeapProfiler.collectGarbage")
    await client.send("HeapProfiler.takeHeapSnapshot", { reportProgress: false })
    const usage = (await client.send("Runtime.getHeapUsage")) as { usedSize: number }
    return usage.usedSize
  } finally {
    await client.detach()
  }
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)] ?? 0
}

function formatMetrics(metrics: readonly PerfMetric[]): string {
  return `[${metrics.map((metric) => metric.durationMs.toFixed(2)).join(", ")}]`
}

function formatBytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(2)}MB`
}
