import { expect, test } from "@playwright/test"

/**
 * Multi-column sort UI:
 *   - plain click → toggle the primary sort (single column)
 *   - Shift+click → append (or cycle within) a sort key without disturbing
 *     the existing keys
 *   - Ctrl/Cmd+click → remove a column from the sort
 *
 * Visuals: a sort-order index (1, 2, ...) appears next to the direction
 * indicator when more than one column is sorted, so users can read the
 * priority order they composed via Shift+click.
 *
 * Live region: announces the *changed* sort key (added or direction-flipped),
 * not always sortState[0] — Shift+click appends to the tail.
 */

test("Shift+click appends a second sort key without clearing the first", async ({ page }) => {
  await page.goto("/")
  const sortableHeaders = page.locator(".bc-grid-header-cell.bc-grid-header-cell-sortable")

  // Plain click on the first sortable header — primary sort is column 1.
  await sortableHeaders.nth(0).click()
  await expect(sortableHeaders.nth(0)).toHaveAttribute("aria-sort", "ascending")

  // Shift+click on the second sortable header — second key composes onto
  // the first, the first stays at ascending.
  await sortableHeaders.nth(1).click({ modifiers: ["Shift"] })
  await expect(sortableHeaders.nth(0)).toHaveAttribute("aria-sort", "ascending")
  await expect(sortableHeaders.nth(1)).toHaveAttribute("aria-sort", "ascending")
})

test("sort-order index appears next to the indicator when more than one column is sorted", async ({
  page,
}) => {
  await page.goto("/")
  const sortableHeaders = page.locator(".bc-grid-header-cell.bc-grid-header-cell-sortable")

  // Single sort — no order index visible.
  await sortableHeaders.nth(0).click()
  const firstIndicator = sortableHeaders.nth(0).locator(".bc-grid-header-sort-indicator")
  // No order suffix in single-sort mode.
  await expect(firstIndicator.locator(".bc-grid-header-sort-order")).toHaveCount(0)

  // Compose a second sort — both indicators should now expose the order.
  await sortableHeaders.nth(1).click({ modifiers: ["Shift"] })
  await expect(firstIndicator.locator(".bc-grid-header-sort-order")).toHaveText("1")
  const secondIndicator = sortableHeaders.nth(1).locator(".bc-grid-header-sort-indicator")
  await expect(secondIndicator.locator(".bc-grid-header-sort-order")).toHaveText("2")
})

test("Ctrl/Cmd+click removes a single column from the multi-sort", async ({ page }) => {
  await page.goto("/")
  const sortableHeaders = page.locator(".bc-grid-header-cell.bc-grid-header-cell-sortable")

  // Compose a 2-column sort.
  await sortableHeaders.nth(0).click()
  await sortableHeaders.nth(1).click({ modifiers: ["Shift"] })
  await expect(sortableHeaders.nth(0)).toHaveAttribute("aria-sort", "ascending")
  await expect(sortableHeaders.nth(1)).toHaveAttribute("aria-sort", "ascending")

  // Ctrl/Cmd-click drops only the first key.
  await sortableHeaders.nth(0).click({ modifiers: ["ControlOrMeta"] })
  await expect(sortableHeaders.nth(0)).toHaveAttribute("aria-sort", "none")
  await expect(sortableHeaders.nth(1)).toHaveAttribute("aria-sort", "ascending")
})

test("Shift+click cycles a sorted column's direction in place (asc → desc → none)", async ({
  page,
}) => {
  await page.goto("/")
  const sortableHeaders = page.locator(".bc-grid-header-cell.bc-grid-header-cell-sortable")

  // Plain click sets primary sort asc.
  await sortableHeaders.nth(0).click()
  await expect(sortableHeaders.nth(0)).toHaveAttribute("aria-sort", "ascending")

  // Shift+click on the same column flips it in place to desc — multi-column
  // composition keeps a column's position stable while cycling direction.
  await sortableHeaders.nth(0).click({ modifiers: ["Shift"] })
  await expect(sortableHeaders.nth(0)).toHaveAttribute("aria-sort", "descending")

  // Shift+click again drops the key entirely.
  await sortableHeaders.nth(0).click({ modifiers: ["Shift"] })
  await expect(sortableHeaders.nth(0)).toHaveAttribute("aria-sort", "none")
})

test("live region announces the column whose sort direction changed, not sortState[0]", async ({
  page,
}) => {
  await page.goto("/")
  const polite = page.locator('[data-bc-grid-status="true"]').first()
  const sortableHeaders = page.locator(".bc-grid-header-cell.bc-grid-header-cell-sortable")

  // Capture the first header's label so we can match the announcement.
  const firstHeaderLabel = await sortableHeaders.nth(0).locator(".bc-grid-header-label").innerText()
  const secondHeaderLabel = await sortableHeaders
    .nth(1)
    .locator(".bc-grid-header-label")
    .innerText()

  // Plain click — announces first header.
  await sortableHeaders.nth(0).click()
  await expect(polite).toContainText(
    new RegExp(`Sorted by ${escapeRegex(firstHeaderLabel)} ascending\\.`, "i"),
    { timeout: 2000 },
  )

  // Shift+click on second header — announces SECOND header (the one that
  // changed), not the unchanged primary sort.
  await sortableHeaders.nth(1).click({ modifiers: ["Shift"] })
  await expect(polite).toContainText(
    new RegExp(`Sorted by ${escapeRegex(secondHeaderLabel)} ascending\\.`, "i"),
    { timeout: 2000 },
  )
})

function escapeRegex(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
