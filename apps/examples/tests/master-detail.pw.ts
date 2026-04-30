import { expect, test } from "@playwright/test"

const URL = "/?masterDetail=1"

test("master-detail disclosure expands a row-level detail panel", async ({ page }) => {
  await page.goto(URL)

  const firstRow = page.locator('.bc-grid-row[data-row-index="0"]').first()
  const toggle = firstRow.locator(".bc-grid-detail-toggle").first()

  await expect(toggle).toBeVisible()
  await expect(toggle).toHaveAttribute("aria-expanded", "false")

  const collapsedHeight = await firstRow.evaluate(
    (element) => element.getBoundingClientRect().height,
  )
  await toggle.click()

  await expect(toggle).toHaveAttribute("aria-expanded", "true")
  const detail = firstRow.locator(".bc-grid-detail-panel").first()
  await expect(detail).toBeVisible()
  await expect(detail).toContainText("Follow-up")
  await expect(detail).toContainText("Collector Notes")

  const expandedHeight = await firstRow.evaluate(
    (element) => element.getBoundingClientRect().height,
  )
  expect(expandedHeight).toBeGreaterThan(collapsedHeight + 100)
})

test("master-detail disclosure collapses without changing row selection", async ({ page }) => {
  await page.goto(URL)

  const firstRow = page.locator('.bc-grid-row[data-row-index="0"]').first()
  const toggle = firstRow.locator(".bc-grid-detail-toggle").first()

  await toggle.click()
  await expect(firstRow.locator(".bc-grid-detail-panel")).toBeVisible()
  await toggle.click()

  await expect(toggle).toHaveAttribute("aria-expanded", "false")
  await expect(firstRow.locator(".bc-grid-detail-panel")).toHaveCount(0)
  await expect(firstRow).not.toHaveAttribute("aria-selected", "true")
})
