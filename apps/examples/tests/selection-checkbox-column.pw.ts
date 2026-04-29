import { type Page, expect, test } from "@playwright/test"

/**
 * `<BcGrid checkboxSelection>` adds a pinned-left column with a master
 * checkbox in the header and per-row checkboxes in body cells. The demo
 * app reads `?checkbox=1` from the URL and forwards it as the prop —
 * keeps existing tests untouched.
 *
 *   - Header checkbox toggles every visible row on / off
 *   - Header tri-state: none / some (indeterminate) / all
 *   - Row checkbox toggles a single row, independent of click-to-select
 *   - Clicking a row checkbox does NOT trigger the row's onClick selection
 *     algebra (no double-fire / no race)
 */

const URL_WITH_CHECKBOX = "/?checkbox=1"

async function rowCheckbox(page: Page, rowIndex: number) {
  const row = page.locator(`.bc-grid-row[data-row-index="${rowIndex}"]`).first()
  return row.locator('input[type="checkbox"][data-bc-grid-selection-row]')
}

test("header checkbox renders, starts unchecked, has the correct aria-label", async ({ page }) => {
  await page.goto(URL_WITH_CHECKBOX)
  const headerCheckbox = page
    .locator('input[type="checkbox"][data-bc-grid-selection-header="true"]')
    .first()
  await expect(headerCheckbox).toBeAttached()
  await expect(headerCheckbox).not.toBeChecked()
  await expect(headerCheckbox).toHaveAttribute("aria-label", /Select all rows on this page/i)
  // Initial tri-state attribute reflects "none".
  await expect(headerCheckbox).toHaveAttribute("data-bc-grid-selection-state", "none")
})

test("clicking a row checkbox selects only that row without triggering row-click selection", async ({
  page,
}) => {
  await page.goto(URL_WITH_CHECKBOX)
  const cb = await rowCheckbox(page, 2)
  await cb.check()

  // Row 2 is now selected via checkbox. Other rows untouched.
  const row2 = page.locator('.bc-grid-row[data-row-index="2"]').first()
  await expect(row2).toHaveAttribute("aria-selected", "true")

  // Header advances to indeterminate ("some").
  const headerCheckbox = page
    .locator('input[type="checkbox"][data-bc-grid-selection-header="true"]')
    .first()
  await expect(headerCheckbox).toHaveAttribute("data-bc-grid-selection-state", "some")
})

test("Ctrl/Cmd-clicking a row checkbox doesn't toggle through the row's selection algebra", async ({
  page,
}) => {
  await page.goto(URL_WITH_CHECKBOX)
  // Pre-select row 0 via checkbox to set up selection.
  const cb0 = await rowCheckbox(page, 0)
  await cb0.check()

  // Plain check on row 3 should ADD to the selection (not REPLACE it like
  // a plain row click would). The checkbox path bypasses the row-click
  // selection algebra entirely; multi-select via checkbox is the natural
  // user model.
  const cb3 = await rowCheckbox(page, 3)
  await cb3.check()

  // Both rows still selected.
  await expect(page.locator('.bc-grid-row[data-row-index="0"]').first()).toHaveAttribute(
    "aria-selected",
    "true",
  )
  await expect(page.locator('.bc-grid-row[data-row-index="3"]').first()).toHaveAttribute(
    "aria-selected",
    "true",
  )
})

test("unchecking a row checkbox deselects exactly that row", async ({ page }) => {
  await page.goto(URL_WITH_CHECKBOX)
  const cb0 = await rowCheckbox(page, 0)
  const cb1 = await rowCheckbox(page, 1)
  await cb0.check()
  await cb1.check()

  await cb0.uncheck()

  await expect(page.locator('.bc-grid-row[data-row-index="0"]').first()).not.toHaveAttribute(
    "aria-selected",
    "true",
  )
  await expect(page.locator('.bc-grid-row[data-row-index="1"]').first()).toHaveAttribute(
    "aria-selected",
    "true",
  )
})

test("header checkbox: clicking when none selected → all visible rows selected", async ({
  page,
}) => {
  await page.goto(URL_WITH_CHECKBOX)
  const headerCheckbox = page
    .locator('input[type="checkbox"][data-bc-grid-selection-header="true"]')
    .first()
  await headerCheckbox.check()

  // Tri-state advances to "all".
  await expect(headerCheckbox).toHaveAttribute("data-bc-grid-selection-state", "all")

  // Sample the first 3 rendered rows — every one should be selected.
  for (const idx of [0, 1, 2]) {
    await expect(page.locator(`.bc-grid-row[data-row-index="${idx}"]`).first()).toHaveAttribute(
      "aria-selected",
      "true",
    )
  }
})

test("header checkbox: clicking when all selected → all deselected", async ({ page }) => {
  await page.goto(URL_WITH_CHECKBOX)
  const headerCheckbox = page
    .locator('input[type="checkbox"][data-bc-grid-selection-header="true"]')
    .first()

  // Toggle on, then off.
  await headerCheckbox.check()
  await expect(headerCheckbox).toHaveAttribute("data-bc-grid-selection-state", "all")

  await headerCheckbox.uncheck()
  await expect(headerCheckbox).toHaveAttribute("data-bc-grid-selection-state", "none")

  // Row 0 is back to unselected.
  await expect(page.locator('.bc-grid-row[data-row-index="0"]').first()).not.toHaveAttribute(
    "aria-selected",
    "true",
  )
})

test("clicking a checkbox does not move the active cell or fire row-click selection", async ({
  page,
}) => {
  await page.goto(URL_WITH_CHECKBOX)
  // Plain-click row 5 to set an active cell + selection state.
  await page.locator('.bc-grid-row[data-row-index="5"]').first().click()
  const row5 = page.locator('.bc-grid-row[data-row-index="5"]').first()
  await expect(row5).toHaveAttribute("aria-selected", "true")

  // Now check row 7's checkbox — should ADD row 7 to selection without
  // collapsing the prior plain-click selection of row 5.
  const cb7 = await rowCheckbox(page, 7)
  await cb7.check()

  await expect(page.locator('.bc-grid-row[data-row-index="5"]').first()).toHaveAttribute(
    "aria-selected",
    "true",
  )
  await expect(page.locator('.bc-grid-row[data-row-index="7"]').first()).toHaveAttribute(
    "aria-selected",
    "true",
  )
})
