import { expect, test } from "@playwright/test"

test("global search filters rows and highlights default-rendered matches", async ({ page }) => {
  await page.goto("/")

  const grid = page.getByRole("grid", { name: "Accounts receivable customer ledger" })
  await expect(grid).toBeVisible()

  await page.getByRole("searchbox", { name: "Global search" }).fill("CUST-00042")

  await expect(grid).toHaveAttribute("aria-rowcount", "3")
  await expect(grid.locator(".bc-grid-row").first()).toContainText("CUST-00042")
  await expect(grid.locator('[data-bc-grid-search-match="true"]').first()).toBeVisible()
})

test("global search matches formatted currency values", async ({ page }) => {
  await page.goto("/")

  const grid = page.getByRole("grid", { name: "Accounts receivable customer ledger" })
  await expect(grid).toBeVisible()

  await page.getByRole("searchbox", { name: "Global search" }).fill("$50,525")
  await expect(grid.locator(".bc-grid-row").first()).toContainText("CUST-00001")
})
