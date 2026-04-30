import { type Page, expect, test } from "@playwright/test"

test("AR customer number filter supports comparison operators", async ({ page }) => {
  await page.goto("/")

  const grid = page.getByRole("grid", { name: "Accounts receivable customer ledger" })
  await expect(grid).toBeVisible()
  await revealOutstandingFilter(page)

  await grid.getByLabel("Filter Outstanding operator").selectOption(">")
  await grid.getByLabel("Filter Outstanding", { exact: true }).fill("60000")

  await expect(grid).toHaveAttribute("aria-rowcount", "1274")
  await expect(grid.locator(".bc-grid-row").first()).toContainText("CUST-00004")
})

test("AR customer number filter supports inclusive between ranges", async ({ page }) => {
  await page.goto("/")

  const grid = page.getByRole("grid", { name: "Accounts receivable customer ledger" })
  await expect(grid).toBeVisible()
  await revealOutstandingFilter(page)

  await grid.getByLabel("Filter Outstanding operator").selectOption("between")
  await grid.getByLabel("Filter Outstanding", { exact: true }).fill("50000")
  await grid.getByLabel("Filter Outstanding maximum").fill("51000")

  await expect(grid).toHaveAttribute("aria-rowcount", "143")
  await expect(grid.locator(".bc-grid-row").first()).toContainText("CUST-00001")
})

async function revealOutstandingFilter(page: Page) {
  await page.locator(".bc-grid-scroller").evaluate((scroller) => {
    scroller.scrollLeft = 900
    scroller.dispatchEvent(new Event("scroll", { bubbles: true }))
  })
  await page.waitForFunction(() =>
    Boolean(document.querySelector('[aria-label="Filter Outstanding operator"]')),
  )
}
