import { type Page, expect, test } from "@playwright/test"

test("AR customer date filter supports before operator", async ({ page }) => {
  await page.goto("/")

  const grid = page.getByRole("grid", { name: "Accounts receivable customer ledger" })
  await expect(grid).toBeVisible()
  await revealLastInvoiceFilter(page)

  await grid.getByLabel("Filter Last Invoice operator").selectOption("before")
  await grid.getByLabel("Filter Last Invoice", { exact: true }).fill("2026-03-01")

  await expect(grid).toHaveAttribute("aria-rowcount", "2350")
  await expect(grid.locator(".bc-grid-row").first()).toContainText("CUST-00001")
})

test("AR customer date filter supports inclusive between ranges", async ({ page }) => {
  await page.goto("/")

  const grid = page.getByRole("grid", { name: "Accounts receivable customer ledger" })
  await expect(grid).toBeVisible()
  await revealLastInvoiceFilter(page)

  await grid.getByLabel("Filter Last Invoice operator").selectOption("between")
  await grid.getByLabel("Filter Last Invoice", { exact: true }).fill("2026-03-01")
  await grid.getByLabel("Filter Last Invoice end date").fill("2026-03-05")

  await expect(grid).toHaveAttribute("aria-rowcount", "444")
  await expect(grid.locator(".bc-grid-row").first()).toContainText("CUST-00004")
})

async function revealLastInvoiceFilter(page: Page) {
  const grid = page.getByRole("grid", { name: "Accounts receivable customer ledger" })
  await grid.locator(".bc-grid-scroller").evaluate((scroller) => {
    scroller.scrollLeft = 2200
    scroller.dispatchEvent(new Event("scroll", { bubbles: true }))
  })
  await page.waitForFunction(() =>
    Boolean(document.querySelector('[aria-label="Filter Last Invoice operator"]')),
  )
}
