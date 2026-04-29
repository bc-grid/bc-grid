import { expect, test } from "@playwright/test"

const COLD_MOUNT_BAR_MS = 200
const SORT_BAR_MS = 50
const SCROLL_FPS_BAR = 58

declare global {
  interface Window {
    __bcGridPerf: {
      mountGrid(): Promise<PerfMetric>
      sortRows(): Promise<PerfMetric>
      scrollForFps(durationMs?: number): Promise<ScrollPerfMetric>
      rawRowCount: number
    }
  }
}

interface PerfMetric {
  durationMs: number
  rowCount: number
}

interface ScrollPerfMetric extends PerfMetric {
  fps: number
  frameCount: number
}

test(`cold mount 1k x 10 stays under ${COLD_MOUNT_BAR_MS}ms`, async ({ page }) => {
  await page.goto("/?mount=false&rows=1000&cols=10")

  const metric = await page.evaluate(() => window.__bcGridPerf.mountGrid())

  console.log(
    `smoke perf cold-mount rows=${metric.rowCount} duration=${metric.durationMs.toFixed(2)}ms bar=${COLD_MOUNT_BAR_MS}ms`,
  )
  expect(metric.durationMs).toBeLessThan(COLD_MOUNT_BAR_MS)
})

test(`sort 10k rows stays under ${SORT_BAR_MS}ms`, async ({ page }) => {
  await page.goto("/?rawData=1&rows=10000&cols=10")
  await page.waitForFunction(() => window.__bcGridPerf.rawRowCount === 10_000)

  const metric = await page.evaluate(() => window.__bcGridPerf.sortRows())

  console.log(
    `smoke perf sort rows=${metric.rowCount} duration=${metric.durationMs.toFixed(2)}ms bar=${SORT_BAR_MS}ms`,
  )
  expect(metric.durationMs).toBeLessThan(SORT_BAR_MS)
})

test(`scroll 10k x 20 sustains >=${SCROLL_FPS_BAR} FPS over 1s`, async ({ page }) => {
  await page.goto("/?rows=10000&cols=20")

  const metric = await page.evaluate(() => window.__bcGridPerf.scrollForFps(1000))

  console.log(
    `smoke perf scroll rows=${metric.rowCount} frames=${metric.frameCount} duration=${metric.durationMs.toFixed(2)}ms fps=${metric.fps.toFixed(2)} bar=${SCROLL_FPS_BAR}`,
  )
  expect(metric.fps).toBeGreaterThanOrEqual(SCROLL_FPS_BAR)
})

test.skip("edit-cell paint stays under 16ms once Track 1 editing lands", () => {
  // Q2 editing is not implemented yet. This is intentionally skipped per
  // docs/queue.md: smoke-perf-ci reserves the bar but does not gate it until
  // the editor framework exists.
})
