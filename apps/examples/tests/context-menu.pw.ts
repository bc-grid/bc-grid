import { expect, test } from "@playwright/test"

test("grid context menu opens from right-click and keyboard", async ({ page }) => {
  await page.goto("/")

  const grid = page.getByRole("grid", { name: "Accounts receivable customer ledger" })
  await expect(grid).toBeVisible()

  const firstAccountCell = grid
    .locator('.bc-grid-row[data-row-index="0"] .bc-grid-cell[data-column-id="account"]')
    .first()
  await expect(firstAccountCell).toBeVisible()
  await firstAccountCell.click({ button: "right" })

  const menu = page.getByRole("menu", { name: "Context menu" })
  await expect(menu).toBeVisible()
  await expect(menu.getByRole("menuitem", { name: "Copy", exact: true })).toBeVisible()
  await expect(menu.getByRole("menuitem", { name: "Copy with Headers", exact: true })).toBeVisible()
  await expect(menu.getByRole("menuitem", { name: "Clear Selection", exact: true })).toBeVisible()
  await expect(menu.getByRole("menuitem", { name: "Clear Range", exact: true })).toBeVisible()

  await page.keyboard.press("Escape")
  await expect(menu).toHaveCount(0)

  await grid.focus()
  await page.keyboard.press("Shift+F10")
  await expect(menu).toBeVisible()
})
