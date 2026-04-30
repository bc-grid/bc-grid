import { expect, test } from "@playwright/test"

const URL_WITH_PAGINATION = "/?pagination=1"

test("client pagination limits the rendered row set and advances pages", async ({ page }) => {
  await page.goto(URL_WITH_PAGINATION)

  const grid = page.getByRole("grid", { name: "Accounts receivable customer ledger" })
  await expect(grid).toBeVisible()
  await expect(grid).toHaveAttribute("aria-rowcount", "102")
  await expect(page.getByText("Rows 1-100 of 5,000")).toBeVisible()
  await expect(page.getByText("Page 1 of 50")).toBeVisible()

  await page.getByRole("button", { name: "Next page" }).click()
  await expect(page.getByText("Rows 101-200 of 5,000")).toBeVisible()
  await expect(page.getByText("Page 2 of 50")).toBeVisible()
  await expect(grid.locator(".bc-grid-row").first()).toContainText("CUST-00101")
})

test("client pagination changes page size and resets to the first page", async ({ page }) => {
  await page.goto(URL_WITH_PAGINATION)

  const grid = page.getByRole("grid", { name: "Accounts receivable customer ledger" })
  await expect(grid).toBeVisible()

  await page.getByRole("button", { name: "Last page" }).click()
  await expect(page.getByText("Page 50 of 50")).toBeVisible()

  await page.getByLabel("Rows").selectOption("50")
  await expect(grid).toHaveAttribute("aria-rowcount", "52")
  await expect(page.getByText("Rows 1-50 of 5,000")).toBeVisible()
  await expect(page.getByText("Page 1 of 100")).toBeVisible()
})
