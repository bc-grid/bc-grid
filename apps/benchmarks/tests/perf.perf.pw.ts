import { type Page, expect, test } from "@playwright/test"

const FPS_BAR = 58
const LATENCY_BAR_MS = 100
const MEMORY_BAR_BYTES = 30 * 1024 * 1024
const RUN_COUNT = 3
const SERVER_ROW_MODEL_BAR_MS = 3000
const GROUP_ROWS_EXPAND_BAR_MS = 2000

declare global {
  interface Window {
    __autoScrollDone__: boolean
    __bcGridPerf: {
      mountGrid(): Promise<PerfMetric>
      sortRows(): Promise<PerfMetric>
      filterRows(): Promise<PerfMetric>
      groupRowsExpand(input?: GroupRowsPerfInput): Promise<GroupRowsPerfMetric>
      serverRowModelBlocks(input?: ServerRowModelPerfInput): Promise<ServerRowModelPerfMetric>
      serverRowModelPrefetchSweep(input: PrefetchSweepPerfInput): Promise<PrefetchSweepPerfMetric>
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

test(`group-row expand at 5 x 1k scale stays under ${GROUP_ROWS_EXPAND_BAR_MS}ms`, async ({
  page,
}) => {
  await page.goto("/?mount=false")
  await page.waitForFunction(() => typeof window.__bcGridPerf?.groupRowsExpand === "function")

  const metric = await page.evaluate(() =>
    window.__bcGridPerf.groupRowsExpand({
      leafRowsPerGroup: 1000,
      levels: 5,
    }),
  )

  console.log(
    [
      `perf group-rows rows=${metric.rowCount}`,
      `groups=${metric.groupRowCount}`,
      `collapsedRows=${metric.collapsedRowCount}`,
      `expandedRows=${metric.expandedRowCount}`,
      `duration=${metric.durationMs.toFixed(2)}ms`,
      `bar=${GROUP_ROWS_EXPAND_BAR_MS}ms`,
      `tree=${metric.treeBuildMs.toFixed(2)}ms`,
      `collapsedFlatten=${metric.collapsedFlattenMs.toFixed(2)}ms`,
      `expandedFlatten=${metric.expandedFlattenMs.toFixed(2)}ms`,
      `rowHeightBucket=${metric.rowHeightBucketMs.toFixed(2)}ms`,
      `virtualizer=${metric.virtualizerMs.toFixed(2)}ms`,
      `visibleRows=${metric.visibleRowCount}`,
    ].join(" "),
  )

  expect(metric.levels).toBe(5)
  expect(metric.leafRowsPerGroup).toBe(1000)
  expect(metric.groupRowCount).toBe(5000)
  expect(metric.rowCount).toBe(1_000_000)
  expect(metric.collapsedRowCount).toBe(1000)
  expect(metric.expandedRowCount).toBe(1_005_000)
  expect(metric.visibleRowCount).toBeGreaterThan(0)
  expect(metric.durationMs).toBeLessThan(GROUP_ROWS_EXPAND_BAR_MS)
})

// `v06-server-perf-block-cache-lru-tuning` (worker1 audit P1 §5).
// Default `maxBlocks` is 50 (5k rows of 100-row blocks). The existing
// 100k-row test above pins the IDEAL — every block stays cached. This
// case pins the EVICTION-ACTIVE workload: 10k rows scrolled top-to-
// bottom-and-back, causing the second pass to refetch ~half the blocks
// because the first 50 evicted as the user scrolled past them. Coordinator
// reads the emitted metrics at merge to decide whether to bump the
// default to 75 / 100 if the latency or hit-rate numbers warrant it.
const LRU_TUNING_BAR_MS = 5_000
test(`server row model under-default-cache eviction stays under ${LRU_TUNING_BAR_MS}ms with sustained scroll`, async ({
  page,
}) => {
  await page.goto("/?rawData=1&mount=false&rows=10000&cols=10")
  await page.waitForFunction(() => window.__bcGridPerf.rawRowCount === 10_000)

  // 10k rows / 100 per block = 100 blocks. Default `maxBlocks: 50` →
  // first pass loads 100 (evicting the first 50 as the last 50 land);
  // second pass re-traverses → cache holds the latest 50, so the first
  // 50 of the second pass are fresh fetches and the last 50 are hits.
  // Expected hot-cache hit rate ≈ 50 % under the default; coordinator
  // can rerun with `maxBlocks: 75 / 100 / 150` to surface the marginal
  // value of bumping the default.
  const metric = await page.evaluate(() =>
    window.__bcGridPerf.serverRowModelBlocks({
      blockSize: 100,
      debounceMs: 16,
      fetchDelayMs: 1,
      maxConcurrentRequests: 4,
      rowCount: 10_000,
      // Intentionally NOT passing `maxBlocks` so the harness picks up
      // `DEFAULT_BLOCK_CACHE_OPTIONS.maxBlocks` (currently 50). If
      // coordinator wants to A/B test a tuning bump, override here.
    }),
  )

  console.log(
    [
      `perf lru-tuning rows=${metric.rowCount}`,
      `blocks=${metric.loadedBlocks}`,
      `duration=${metric.durationMs.toFixed(2)}ms`,
      `bar=${LRU_TUNING_BAR_MS}ms`,
      `maxBlocks=${metric.maxBlocks}`,
      `hotCacheHitRate=${metric.hotCacheHitRate.toFixed(3)}`,
      `overallHitRate=${metric.cacheHitRate.toFixed(3)}`,
      `fetchAvg=${metric.avgFetchLatencyMs.toFixed(2)}ms`,
      `fetchMax=${metric.maxFetchLatencyMs.toFixed(2)}ms`,
      `queueAvg=${metric.avgQueueWaitMs.toFixed(2)}ms`,
      `queueMax=${metric.maxQueueWaitMs.toFixed(2)}ms`,
      `queued=${metric.queuedRequests}`,
      `maxQueueDepth=${metric.maxQueueDepth}`,
      `blockFetches=${metric.blockFetches}`,
      `dedupedRequests=${metric.dedupedRequests}`,
    ].join(" "),
  )
  // Loose bars — the case is informational, not gating. Bars catch
  // gross regressions (e.g. eviction loop running indefinitely) but
  // leave coordinator the latitude to read the emitted metrics and
  // decide whether to tune the default upwards.
  expect(metric.durationMs).toBeLessThan(LRU_TUNING_BAR_MS)
  expect(metric.maxBlocks).toBe(50) // pin the documented default
  // Hit rate must stay above zero (cache must be doing SOMETHING) but
  // we don't pin a floor like the 100k case's 0.99 — under the default
  // with eviction active, ~0.5 is expected.
  expect(metric.hotCacheHitRate).toBeGreaterThan(0)
})

// `v06-server-perf-prefetch-budget-tuning` (worker1 audit P1 §6).
// Sweeps `prefetchAhead` over 0/1/2/3 against the same 10k-row scroll
// trace. The harness simulates the React layer's
// `handleVisibleRowRangeChange` algorithm: each scroll step calls
// ensureBlock(start), ensureBlock(end), and prefetches the next N
// blocks past the visible window's tail. Coordinator reads the emitted
// per-budget metrics at merge to decide whether the default of 1 is
// still right or whether 2 / 3 measurably improves the user-perceived
// "instant content on scroll" rate enough to justify the extra fetch
// bandwidth.
const PREFETCH_SWEEP_BAR_MS = 10_000
test(`server row model prefetch-budget sweep stays under ${PREFETCH_SWEEP_BAR_MS}ms`, async ({
  page,
}) => {
  await page.goto("/?rawData=1&mount=false&rows=10000&cols=10")
  await page.waitForFunction(() => window.__bcGridPerf.rawRowCount === 10_000)

  const budgets = [0, 1, 2, 3]
  const results: Array<{ budget: number; metric: PrefetchSweepPerfMetric }> = []
  for (const budget of budgets) {
    const metric = await page.evaluate(
      (prefetchAhead) =>
        window.__bcGridPerf.serverRowModelPrefetchSweep({
          blockSize: 100,
          fetchDelayMs: 1,
          prefetchAhead,
          rowCount: 10_000,
          scrollSteps: 100,
          scrollStepRows: 50,
          viewportRows: 50,
        }),
      budget,
    )
    results.push({ budget, metric })
    console.log(
      [
        `perf prefetch-sweep budget=${budget}`,
        `duration=${metric.durationMs.toFixed(2)}ms`,
        `cacheHitRate=${metric.cacheHitRate.toFixed(3)}`,
        `immediateContentRate=${metric.immediateContentRate.toFixed(3)}`,
        `blocksFetched=${metric.blocksFetched}`,
        `blocksCached=${metric.blocksCached}`,
        `scrollSteps=${metric.scrollSteps}`,
      ].join(" "),
    )
  }

  // Loose bars — the case is informational. A nonzero result for every
  // budget proves the harness ran; the per-budget contrast is what
  // coordinator reads to decide on tuning.
  for (const { budget, metric } of results) {
    expect(metric.durationMs, `budget=${budget} duration`).toBeLessThan(PREFETCH_SWEEP_BAR_MS)
    expect(metric.prefetchAhead).toBe(budget)
  }

  // Contract: prefetch SHOULD improve the immediate-content rate (more
  // blocks already in cache when the next scroll step lands). The
  // sweep won't be monotonic in every micro-detail (queueing + LRU
  // interact), but budget=3 should never be WORSE than budget=0 for
  // the immediate-content rate. If this assertion ever fails, the
  // prefetch trigger has a bug — investigate before tuning the default.
  const zeroBudget = results[0]
  const maxBudget = results[results.length - 1]
  if (zeroBudget && maxBudget) {
    expect(maxBudget.metric.immediateContentRate).toBeGreaterThanOrEqual(
      zeroBudget.metric.immediateContentRate,
    )
  }
})

// Worker1 v06 phase 3 — client-tree pure-helper perf. Builds a
// synthetic balanced tree (4 children × 6 levels ≈ 5460 rows) and
// measures `buildClientTree` + `flattenClientTree` + an
// expand-toggle re-flatten. Pins the steady-state cost of the
// helpers consumers see when they enable `treeData` on a
// large-but-not-huge dataset. Loose bars — coordinator tightens
// after the first run on the bench machine.
const CLIENT_TREE_BUILD_BAR_MS = 200
const CLIENT_TREE_FLATTEN_BAR_MS = 200
const CLIENT_TREE_TOGGLE_BAR_MS = 50

interface ClientTreeBuildInput {
  branching?: number
  depth?: number
}

interface ClientTreeBuildMetric {
  branching: number
  depth: number
  buildMs: number
  flattenMs: number
  toggleMs: number
  visibleRowCount: number
  durationMs: number
  rowCount: number
}

declare global {
  interface Window {
    __bcGridPerf: Window["__bcGridPerf"] & {
      clientTreeBuild(input?: ClientTreeBuildInput): Promise<ClientTreeBuildMetric>
    }
  }
}

test(`client tree pure helpers build + flatten 5k rows under ${CLIENT_TREE_BUILD_BAR_MS}ms / ${CLIENT_TREE_FLATTEN_BAR_MS}ms / ${CLIENT_TREE_TOGGLE_BAR_MS}ms`, async ({
  page,
}) => {
  await page.goto("/?rawData=1&mount=false&rows=10&cols=2")
  // The harness builds its own synthetic rows; we only need the
  // page mounted so `__bcGridPerf` is populated.
  await page.waitForFunction(() => typeof window.__bcGridPerf?.clientTreeBuild === "function")

  const metric = await page.evaluate(() =>
    window.__bcGridPerf.clientTreeBuild({ branching: 4, depth: 6 }),
  )

  console.log(
    [
      `perf client-tree rows=${metric.rowCount}`,
      `branching=${metric.branching}`,
      `depth=${metric.depth}`,
      `build=${metric.buildMs.toFixed(2)}ms`,
      `flatten=${metric.flattenMs.toFixed(2)}ms`,
      `toggle=${metric.toggleMs.toFixed(2)}ms`,
      `visible=${metric.visibleRowCount}`,
      `bars=build:${CLIENT_TREE_BUILD_BAR_MS}/flatten:${CLIENT_TREE_FLATTEN_BAR_MS}/toggle:${CLIENT_TREE_TOGGLE_BAR_MS}`,
    ].join(" "),
  )

  // 4 children × 6 depth levels = 4 + 16 + 64 + 256 + 1024 + 4096 = 5460 rows.
  expect(metric.rowCount).toBe(5460)
  expect(metric.visibleRowCount).toBe(5460)
  expect(metric.buildMs).toBeLessThan(CLIENT_TREE_BUILD_BAR_MS)
  expect(metric.flattenMs).toBeLessThan(CLIENT_TREE_FLATTEN_BAR_MS)
  expect(metric.toggleMs).toBeLessThan(CLIENT_TREE_TOGGLE_BAR_MS)
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
