import { expect, test } from "@playwright/test"

const URL = "/?masterDetail=1"

// Worker rule: this `.pw.ts` is intentionally not run locally by worker2.
// The coordinator owns Playwright/e2e execution during review.

test("detail panel stays anchored to viewport-left during horizontal master scroll", async ({
  page,
}) => {
  await page.goto(URL)

  const grid = page.getByRole("grid", { name: "Accounts receivable customer ledger" })
  await expect(grid).toBeVisible()

  const viewport = grid.locator(".bc-grid-viewport")
  const firstRow = grid.locator('.bc-grid-row[data-row-index="0"]').first()
  await firstRow.locator(".bc-grid-detail-toggle").click()

  const detail = firstRow.locator(".bc-grid-detail-panel").first()
  await expect(detail).toBeVisible()

  const overflow = await viewport.evaluate((el) => ({
    clientWidth: el.clientWidth,
    scrollWidth: el.scrollWidth,
  }))
  expect(overflow.scrollWidth).toBeGreaterThan(overflow.clientWidth)

  const before = await Promise.all([
    detail.evaluate((el) => Math.round(el.getBoundingClientRect().left)),
    viewport.evaluate((el) => Math.round(el.getBoundingClientRect().left)),
    detail.evaluate((el) => Math.round(el.getBoundingClientRect().width)),
    viewport.evaluate((el) => el.clientWidth),
  ])
  expect(Math.abs(before[0] - before[1])).toBeLessThanOrEqual(1)
  expect(Math.abs(before[2] - before[3])).toBeLessThanOrEqual(1)

  await viewport.evaluate((el) => {
    el.scrollLeft = 480
    el.dispatchEvent(new Event("scroll", { bubbles: true }))
  })
  await expect.poll(() => viewport.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0)

  const after = await Promise.all([
    detail.evaluate((el) => Math.round(el.getBoundingClientRect().left)),
    viewport.evaluate((el) => Math.round(el.getBoundingClientRect().left)),
    detail.evaluate((el) => Math.round(el.getBoundingClientRect().width)),
    viewport.evaluate((el) => el.clientWidth),
  ])
  expect(Math.abs(after[0] - after[1])).toBeLessThanOrEqual(1)
  expect(Math.abs(after[2] - after[3])).toBeLessThanOrEqual(1)
})

test("detail panel owns horizontal overflow inside the visible viewport", async ({ page }) => {
  await page.goto(URL)

  const grid = page.getByRole("grid", { name: "Accounts receivable customer ledger" })
  await expect(grid).toBeVisible()

  const firstRow = grid.locator('.bc-grid-row[data-row-index="0"]').first()
  await firstRow.locator(".bc-grid-detail-toggle").click()

  const detail = firstRow.locator(".bc-grid-detail-panel").first()
  await expect(detail).toBeVisible()

  await detail.evaluate((el) => {
    const wideProbe = document.createElement("div")
    wideProbe.textContent = "Wide detail panel overflow probe"
    wideProbe.style.width = "2000px"
    wideProbe.style.height = "1px"
    el.appendChild(wideProbe)
  })

  const dimensions = await detail.evaluate((el) => ({
    clientWidth: el.clientWidth,
    scrollWidth: el.scrollWidth,
  }))
  expect(dimensions.scrollWidth).toBeGreaterThan(dimensions.clientWidth)

  await detail.evaluate((el) => {
    el.scrollLeft = 320
  })
  await expect.poll(() => detail.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0)
})
