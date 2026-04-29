import { expect, test } from "@playwright/test"

/**
 * Virtualizer scroll FPS — design.md §3.2 perf bar.
 *
 * Loads the benchmark harness with `?autorun=fps`, which kicks off the
 * 6-second ping-pong auto-scroll on first paint. The test waits for the
 * scroll to finish, then reads the FPS samples that the harness collected
 * via the rolling 1s frame counter.
 *
 * Pass criteria, two tiers:
 *   - Local (mid-tier laptop, headless or headed Chromium):  median ≥ 58
 *   - CI (GitHub Actions ubuntu-latest, no GPU compositing): median ≥ 40
 *
 * The design.md §3.2 bar of 58 FPS targets a user's modern machine, not a
 * shared cloud VM. Headless Chrome on a GHA runner has no GPU, so transform-
 * based layer compositing falls back to software rasterisation — the same
 * code that hits 60 FPS on real hardware can drop to 40-56 there. The CI
 * bar exists to catch *regressions* (a 2x drop would still fail), not to
 * gate the architecture. Real perf is measured locally and recorded in the
 * spike report.
 *
 * Sampling: skip the first and last 1s windows (startup + coast) and take
 * the median of the middle 4.
 */

const FPS_BAR = process.env.CI ? 40 : 58

declare global {
  interface Window {
    __fps__: number[]
    __autoScrollDone__: boolean
  }
}

test(`scroll FPS at 100k × 30 stays ≥${FPS_BAR} (median)`, async ({ page }) => {
  // 100k rows × 30 cols, 2 pinned-left, 1 pinned-right (the harness defaults
  // to these — the spike validates the perf bar with pinned panes engaged,
  // since pinned cells are sticky-positioned and a worst-case scenario for
  // scroll compositing).
  await page.goto("/?autorun=fps")

  // Wait for the auto-scroll to finish (6s + a small buffer).
  await page.waitForFunction(() => window.__autoScrollDone__ === true, undefined, {
    timeout: 15_000,
  })

  const samples = await page.evaluate(() => window.__fps__.slice())
  expect(samples.length, "FPS sample count").toBeGreaterThanOrEqual(4)

  // Drop the first and last samples (startup + coast) and take the median
  // of the rest.
  const middle = samples.slice(1, -1).sort((a, b) => a - b)
  const median = middle[Math.floor(middle.length / 2)] ?? 0

  // Log so the spike report can record the actual number.
  console.log(
    `scroll-fps samples=${JSON.stringify(samples)} median(middle)=${median} bar=${FPS_BAR}`,
  )

  expect(median, `median FPS over auto-scroll (bar ${FPS_BAR})`).toBeGreaterThanOrEqual(FPS_BAR)
})

test("variable-height mode still hits the FPS bar", async ({ page }) => {
  await page.goto("/")
  // Toggle variable heights, then start auto-scroll.
  await page.locator("#variableHeight").check()
  // The toggle rebuilds the grid; give it a frame.
  await page.waitForTimeout(100)
  await page.locator("#autoScroll").click()

  await page.waitForFunction(() => window.__autoScrollDone__ === true, undefined, {
    timeout: 15_000,
  })

  const samples = await page.evaluate(() => window.__fps__.slice())
  const middle = samples.slice(1, -1).sort((a, b) => a - b)
  const median = middle[Math.floor(middle.length / 2)] ?? 0

  console.log(
    `variable-height-fps samples=${JSON.stringify(samples)} median(middle)=${median} bar=${FPS_BAR}`,
  )

  expect(median, `median FPS with variable heights (bar ${FPS_BAR})`).toBeGreaterThanOrEqual(
    FPS_BAR,
  )
})

test("aria-rowcount + aria-colcount on grid root", async ({ page }) => {
  await page.goto("/")
  const grid = page.locator(".bc-grid")
  await expect(grid).toHaveAttribute("aria-rowcount", "100000")
  await expect(grid).toHaveAttribute("aria-colcount", "30")
})

test("aria-rowindex + aria-colindex on rendered cells", async ({ page }) => {
  await page.goto("/")
  // First visible row should have aria-rowindex="1" (1-based per ARIA).
  const firstRow = page.locator('.bc-grid-row[aria-rowindex="1"]')
  await expect(firstRow).toBeVisible()

  // Cells inside that row should have aria-colindex.
  const firstCell = firstRow.locator('.bc-grid-cell[aria-colindex="1"]')
  await expect(firstCell).toBeVisible()
})

test("pinned-left cells stay visible after horizontal scroll", async ({ page }) => {
  await page.goto("/")
  const pinned = page.locator(".bc-grid-cell-pinned-left").first()
  const beforeBox = await pinned.boundingBox()
  expect(beforeBox, "pinned cell visible before scroll").not.toBeNull()

  // Scroll the grid horizontally.
  await page.evaluate(() => {
    const el = document.querySelector<HTMLElement>(".bc-grid-scroller")
    if (el) el.scrollLeft = 1500
  })
  // Give the renderer a frame to commit.
  await page.waitForTimeout(50)

  const afterBox = await pinned.boundingBox()
  expect(afterBox, "pinned cell still visible after scroll").not.toBeNull()
  // Pinned cell should remain near the left edge (within a few px tolerance
  // for browser-specific sticky implementations).
  if (beforeBox && afterBox) {
    expect(Math.abs(afterBox.x - beforeBox.x)).toBeLessThan(5)
  }
})

test("focus retention — active row stays in DOM after scrolling out", async ({ page }) => {
  await page.goto("/")
  // Focus the grid and arrow-down a few times to set the active cell.
  await page.locator("#grid").focus()
  // Move active cell to row 50, col 5.
  for (let i = 0; i < 50; i++) await page.keyboard.press("ArrowDown")
  for (let i = 0; i < 5; i++) await page.keyboard.press("ArrowRight")

  // The active row should now be retained. Scroll far away.
  await page.evaluate(() => {
    const el = document.querySelector<HTMLElement>(".bc-grid-scroller")
    if (el) el.scrollTop = 50_000 // ~1500 rows down
  })
  await page.waitForTimeout(100)

  // The active row's DOM node (data-row-index="50") must still exist.
  const retainedRow = page.locator('.bc-grid-row[data-row-index="50"]')
  await expect(retainedRow).toHaveCount(1)
  // And the active cell should still carry the highlight class.
  const activeCell = retainedRow.locator(".bc-grid-cell.is-active")
  await expect(activeCell).toHaveCount(1)
})
