import { expect, test } from "@playwright/test"

/**
 * `BcGridColumn.tooltip` (api.md §1.1) renders as the native browser
 * `title` attribute on body cells. Two shapes:
 *   - string: same tooltip on every row
 *   - (row) => string | undefined: per-row tooltip
 *
 * v0.1 default: native `title` — keyboard-accessible (focus + hover) and
 * works under forced-colors / reduced-motion without theming work.
 * Consumers wanting a richer popover wrap via cellRenderer.
 */

// Scope locators to body rows so the inline filter row (which also
// renders cells with `data-column-id`) isn't matched.
const BODY_CELL = ".bc-grid-row[data-row-index] .bc-grid-cell"

test("string-variant tooltip renders as the cell's title attribute", async ({ page }) => {
  await page.goto("/")
  // The Collector column has tooltip: "Customer's assigned credit-control owner."
  const cell = page.locator(`${BODY_CELL}[data-column-id="owner"]`).first()
  await expect(cell).toHaveAttribute("title", "Customer's assigned credit-control owner.")
})

test("function-variant tooltip resolves with the row and renders per-row", async ({ page }) => {
  await page.goto("/")
  // The Trading Name column has tooltip: (row) => `Legal: ${row.legalName}`
  // Each row should have a distinct title that starts with "Legal:".
  const cells = page.locator(`${BODY_CELL}[data-column-id="tradingName"]`)
  const count = await cells.count()
  expect(count).toBeGreaterThan(0)

  // Spot-check the first 3 visible rows: each title starts with "Legal:".
  for (let i = 0; i < Math.min(3, count); i++) {
    const title = await cells.nth(i).getAttribute("title")
    expect(title).toMatch(/^Legal: .+/)
  }

  // Different rows render different titles (legalName varies row-to-row).
  const titleA = await cells.nth(0).getAttribute("title")
  const titleB = await cells.nth(1).getAttribute("title")
  expect(titleA).not.toBe(titleB)
})

test("columns without a tooltip have no title attribute", async ({ page }) => {
  await page.goto("/")
  // The Region column doesn't declare a tooltip — its body cells should
  // have no title attr (or null).
  const cell = page.locator(`${BODY_CELL}[data-column-id="region"]`).first()
  const title = await cell.getAttribute("title")
  expect(title).toBeNull()
})
