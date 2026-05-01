import { expect, test } from "@playwright/test"

const URL_WITH_AGGREGATIONS = "/?aggregations=1"

test("aggregation footer renders totals and follows search filtering", async ({ page }) => {
  await page.goto(URL_WITH_AGGREGATIONS)

  const grid = page.getByRole("grid", { name: "Accounts receivable customer ledger" })
  await expect(grid).toBeVisible()
  await expect(grid).toHaveAttribute("aria-rowcount", "5003")

  const footer = grid.locator(".bc-grid-aggregation-footer-row")
  await expect(footer).toBeVisible()
  await expect(footer).toContainText("Total")
  await expect(footer).toContainText("$243,756,850")
  await expect(footer).toContainText("$264,425")

  await page.getByRole("searchbox", { name: "Global search" }).fill("CUST-00001")

  await expect(footer).toContainText("$50,525")
  await expect(footer).toContainText("$149,700")
})
