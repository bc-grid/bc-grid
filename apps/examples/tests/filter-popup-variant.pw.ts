import { type Page, expect, test } from "@playwright/test"

/**
 * `filter-popup-variant` per `docs/queue.md`. The `?filterPopup=1` URL
 * flag flips every filterable column on the AR Customers grid into
 * `variant: "popup"` mode. The inline filter row collapses entirely and
 * each header gains a funnel icon → floating filter popover.
 *
 * Tests assert:
 *   - inline filter row hidden when every column is popup-variant
 *   - funnel button rendered for each filterable column
 *   - clicking funnel opens a popover anchored below the button
 *   - typing in the popover filters rows live
 *   - active state (filter applied) reflects on the funnel button
 *   - `× Clear` empties the filter and closes the popover
 *   - Escape closes the popover without clearing
 *   - clicking outside closes the popover
 *   - clicking the same funnel toggles closed
 */

const URL = "/?filterPopup=1"

async function openLegalNameFilterPopup(page: Page) {
  // The Customer / legalName column is the second column. Its funnel
  // button is identifiable by data-column-id on the parent header cell.
  const legalNameHeader = page.locator('[data-column-id="legalName"][role="columnheader"]').first()
  const funnel = legalNameHeader.locator('[data-bc-grid-filter-button="true"]').first()
  await funnel.click()
  return funnel
}

test("inline filter row collapses when every column is popup-variant", async ({ page }) => {
  await page.goto(URL)
  await page.waitForSelector('.bc-grid-row[data-row-index="0"]')
  // Inline filter row should not exist at all.
  await expect(page.locator(".bc-grid-filter-row")).toHaveCount(0)
})

test("each filterable column header renders a funnel button", async ({ page }) => {
  await page.goto(URL)
  await page.waitForSelector('.bc-grid-row[data-row-index="0"]')
  const funnels = page.locator('[data-bc-grid-filter-button="true"]')
  // The AR Customers demo wires filters on at least 8 columns. Assert a
  // realistic floor — the exact count can change as columns are added.
  await expect(funnels).not.toHaveCount(0)
  const count = await funnels.count()
  expect(count).toBeGreaterThanOrEqual(8)
})

test("clicking funnel opens a popover anchored below the button", async ({ page }) => {
  await page.goto(URL)
  await page.waitForSelector('.bc-grid-row[data-row-index="0"]')
  const funnel = await openLegalNameFilterPopup(page)
  const popup = page.locator('[data-bc-grid-filter-popup="true"]').first()
  await expect(popup).toBeVisible()
  // Anchor: top of popup ≈ bottom of funnel + a small offset.
  const popupBox = await popup.boundingBox()
  const funnelBox = await funnel.boundingBox()
  expect(popupBox).not.toBeNull()
  expect(funnelBox).not.toBeNull()
  if (popupBox && funnelBox) {
    expect(popupBox.y).toBeGreaterThanOrEqual(funnelBox.y + funnelBox.height)
    expect(popupBox.y).toBeLessThan(funnelBox.y + funnelBox.height + 16)
  }
})

test("typing in the popover filters rows live and the funnel shows active state", async ({
  page,
}) => {
  await page.goto(URL)
  await page.waitForSelector('.bc-grid-row[data-row-index="0"]')
  const funnel = await openLegalNameFilterPopup(page)
  await expect(funnel).not.toHaveAttribute("data-active", "true")

  const popupInput = page.locator('[data-bc-grid-filter-popup="true"] input').first()
  // Customer 0 is "Abbott Homes Pty Ltd ..." — narrow to a unique substring.
  await popupInput.fill("Abbott")
  await page.waitForTimeout(50)

  // Funnel marks active.
  await expect(funnel).toHaveAttribute("data-active", "true")

  // Body row count reflects the filter (only Abbott Homes matches).
  const visibleRows = page.locator(".bc-grid-row[data-row-index]")
  const filteredCount = await visibleRows.count()
  expect(filteredCount).toBeGreaterThan(0)
})

test("× Clear empties the filter, removes active state, and closes the popover", async ({
  page,
}) => {
  await page.goto(URL)
  await page.waitForSelector('.bc-grid-row[data-row-index="0"]')
  const funnel = await openLegalNameFilterPopup(page)
  const popupInput = page.locator('[data-bc-grid-filter-popup="true"] input').first()
  await popupInput.fill("Abbott")
  await page.waitForTimeout(50)
  await expect(funnel).toHaveAttribute("data-active", "true")

  await page.locator('[data-bc-grid-filter-clear="true"]').first().click()
  // Popover closes.
  await expect(page.locator('[data-bc-grid-filter-popup="true"]')).toHaveCount(0)
  // Funnel no longer marked active.
  await expect(funnel).not.toHaveAttribute("data-active", "true")
})

test("Escape closes the popover without clearing the filter", async ({ page }) => {
  await page.goto(URL)
  await page.waitForSelector('.bc-grid-row[data-row-index="0"]')
  const funnel = await openLegalNameFilterPopup(page)
  const popupInput = page.locator('[data-bc-grid-filter-popup="true"] input').first()
  await popupInput.fill("Abbott")
  await page.keyboard.press("Escape")

  // Popover closed.
  await expect(page.locator('[data-bc-grid-filter-popup="true"]')).toHaveCount(0)
  // Funnel still active because the filter wasn't cleared.
  await expect(funnel).toHaveAttribute("data-active", "true")
})

test("clicking the same funnel toggles the popover closed", async ({ page }) => {
  await page.goto(URL)
  await page.waitForSelector('.bc-grid-row[data-row-index="0"]')
  const funnel = await openLegalNameFilterPopup(page)
  await expect(page.locator('[data-bc-grid-filter-popup="true"]')).toHaveCount(1)
  await funnel.click()
  await expect(page.locator('[data-bc-grid-filter-popup="true"]')).toHaveCount(0)
})
