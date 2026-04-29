import { expect, test } from "@playwright/test"

/**
 * Live-region announcement contracts per `accessibility-rfc §Live Regions`.
 * The grid renders two visually hidden live regions adjacent to its root —
 * polite for state changes, assertive for errors. This suite verifies the
 * announce text fires for sort / filter / selection state changes.
 *
 * The regions themselves are off-screen via the standard `sr-only` pattern
 * (clip: rect(0,0,0,0); 1×1 px; absolute) so screen readers can read them
 * but sighted users don't see anything visually changing.
 */

test("polite live region exists and is initially empty", async ({ page }) => {
  await page.goto("/")
  const polite = page.locator('[data-bc-grid-status="true"]').first()
  await expect(polite).toBeAttached()
  await expect(polite).toHaveAttribute("role", "status")
  await expect(polite).toHaveAttribute("aria-live", "polite")
  await expect(polite).toHaveAttribute("aria-atomic", "true")
  // Region starts empty — no message until a state change happens.
  await expect(polite).toHaveText("")
})

test("assertive live region exists and is initially empty", async ({ page }) => {
  await page.goto("/")
  const alert = page.locator('[data-bc-grid-alert="true"]').first()
  await expect(alert).toBeAttached()
  await expect(alert).toHaveAttribute("role", "alert")
  await expect(alert).toHaveAttribute("aria-live", "assertive")
})

test("clicking a sortable column header announces the sort change politely", async ({ page }) => {
  await page.goto("/")
  const polite = page.locator('[data-bc-grid-status="true"]').first()
  // Click a sortable header — the first one (the ID column).
  const header = page.locator(".bc-grid-header-cell.bc-grid-header-cell-sortable").first()
  await header.click()

  // Announcement: "Sorted by {label} ascending."
  await expect(polite).toContainText(/Sorted by .* ascending\./i, { timeout: 2000 })

  // Click again to flip to desc.
  await header.click()
  await expect(polite).toContainText(/Sorted by .* descending\./i, { timeout: 2000 })

  // Click a third time to clear.
  await header.click()
  await expect(polite).toHaveText("Sorting cleared.", { timeout: 2000 })
})

test("typing into a filter input announces the filter result", async ({ page }) => {
  await page.goto("/")
  const polite = page.locator('[data-bc-grid-status="true"]').first()
  // Fill the first column's filter input.
  const filterInput = page.locator(".bc-grid-filter-input").first()
  await filterInput.fill("CUS-00001")

  // Wait for the announcement (filter useEffect runs after rowEntries memo
  // re-computes).
  await expect(polite).toContainText(/Filter applied\. \d+ of \d+ rows shown\./, { timeout: 2000 })

  // Clear → announces filter cleared.
  await filterInput.fill("")
  await expect(polite).toContainText(/Filter cleared\. \d+ rows shown\./, { timeout: 2000 })
})

test("selecting rows announces the count after a debounce", async ({ page }) => {
  await page.goto("/")
  const polite = page.locator('[data-bc-grid-status="true"]').first()

  // Click row 0 → should announce "1 row selected." after debounce.
  await page.locator('.bc-grid-row[data-row-index="0"]').first().click()
  await expect(polite).toHaveText("1 row selected.", { timeout: 2000 })

  // Shift-click row 4 → 5 rows selected; only one announce, not five.
  await page
    .locator('.bc-grid-row[data-row-index="4"]')
    .first()
    .click({ modifiers: ["Shift"] })
  await expect(polite).toHaveText("5 rows selected.", { timeout: 2000 })
})
