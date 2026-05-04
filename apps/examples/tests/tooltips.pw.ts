import { expect, test } from "@playwright/test"

test("column tooltip opens on cell hover and closes on pointer leave", async ({ page }) => {
  await page.goto("/")

  const cell = page
    .locator('.bc-grid-row[data-row-index="0"] .bc-grid-cell[data-column-id="legalName"]')
    .first()

  await cell.hover()

  const tooltip = page.locator(".bc-grid-tooltip-content").first()
  await expect(tooltip).toBeVisible()
  await expect(tooltip).toContainText("outstanding")
  await expect(cell).toHaveAttribute("aria-describedby", /tooltip/)

  await page.mouse.move(0, 0)
  await expect(tooltip).toBeHidden()
})

test("column tooltip opens when focus enters a cell renderer", async ({ page }) => {
  await page.goto("/")

  const cell = page
    .locator('.bc-grid-row[data-row-index="0"] .bc-grid-cell[data-column-id="legalName"]')
    .first()
  const link = cell.getByRole("link")

  await link.focus()

  const tooltip = page.locator(".bc-grid-tooltip-content").first()
  await expect(tooltip).toBeVisible()
  await expect(tooltip).toContainText("outstanding")
  await expect(cell).toHaveAttribute("aria-describedby", /tooltip/)

  await page.keyboard.press("Escape")
  await expect(tooltip).toBeHidden()
})
