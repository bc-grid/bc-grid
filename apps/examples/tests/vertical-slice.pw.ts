import { expect, test } from "@playwright/test"

test("AR customer vertical slice exposes the Q1 grid contract", async ({ page }) => {
  await page.goto("/")

  await expect(page.getByRole("heading", { name: "Accounts Receivable Customers" })).toBeVisible()
  await expect(page.getByText("5,000 customer ledger rows")).toBeVisible()
  await expect(page.getByText("Q1 gate")).toBeVisible()

  const grid = page.getByRole("grid", { name: "Accounts receivable customer ledger" })
  await expect(grid).toBeVisible()
  await expect(grid).toHaveAttribute("aria-rowcount", "5002")
  await expect(grid).toHaveAttribute("aria-colcount", "18")

  const renderedRows = await grid.locator(".bc-grid-row").count()
  expect(renderedRows).toBeGreaterThan(0)
  expect(renderedRows).toBeLessThan(80)
})

test("AR customer filters narrow the ledger to a single account", async ({ page }) => {
  await page.goto("/")

  const grid = page.getByRole("grid", { name: "Accounts receivable customer ledger" })
  await expect(grid).toBeVisible()

  await grid.getByLabel("Filter Account").fill("CUST-00042")
  await expect(grid).toHaveAttribute("aria-rowcount", "3")
  await expect(grid.locator(".bc-grid-row").first()).toContainText("CUST-00042")
})

test("AR customer row click updates selection summary and account detail", async ({ page }) => {
  await page.goto("/")

  const grid = page.getByRole("grid", { name: "Accounts receivable customer ledger" })
  await expect(grid).toBeVisible()

  await grid.locator('.bc-grid-row[data-row-index="4"]').click()
  const selectedSummary = page
    .getByLabel("Accounts receivable summary")
    .locator(".summary-tile", { hasText: "Selected" })
    .locator("strong")
  await expect(selectedSummary).toHaveText("1")

  const detail = page.getByLabel("Selected customer account")
  await expect(detail).toContainText("CUST-00005")
  await expect(detail).toContainText("Outstanding")
})

test("AR customer sort affordance works on outstanding balance", async ({ page }) => {
  await page.goto("/")

  const grid = page.getByRole("grid", { name: "Accounts receivable customer ledger" })
  const outstanding = grid.getByRole("columnheader", { name: /Outstanding/ })

  await outstanding.click()
  await expect(outstanding).toHaveAttribute("aria-sort", "ascending")

  await outstanding.click()
  await expect(outstanding).toHaveAttribute("aria-sort", "descending")
})
