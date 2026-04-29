import { expect, test } from "@playwright/test"

const gridId = "accounts-receivable.customers"

test("gridId localStorage state is read on mount and written after debounce", async ({ page }) => {
  await page.goto("/")
  await page.evaluate((id) => {
    window.localStorage.setItem(
      `bc-grid:${id}:columnState`,
      JSON.stringify([{ columnId: "account", pinned: "left", position: 0, width: 212 }]),
    )
  }, gridId)

  await page.reload()

  const grid = page.getByRole("grid", { name: "Accounts receivable customer ledger" })
  await expect(grid).toBeVisible()

  const accountHeader = grid.getByRole("columnheader", { name: /Account/ })
  await expect(accountHeader).toBeVisible()
  const accountBox = await accountHeader.boundingBox()
  expect(accountBox?.width).toBeGreaterThan(200)
  expect(accountBox?.width).toBeLessThan(224)

  await expect
    .poll(() => page.evaluate((id) => window.localStorage.getItem(`bc-grid:${id}:density`), gridId))
    .toBe(JSON.stringify("normal"))
})
