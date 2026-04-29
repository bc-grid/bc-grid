import { type Page, expect, test } from "@playwright/test"

/**
 * Plain Space toggles selection on the focused row, providing keyboard
 * parity with the click-to-select gestures (#37) and the checkbox column
 * (#58). Shift+Space and Ctrl+Space stay Q3-reserved (preventDefault) —
 * they will be range-extend / select-all in a future RFC.
 *
 * The active cell does not move when Space toggles selection — Space is
 * selection-only.
 *
 * Note: clicks on body cells set the active cell + selection but do not
 * automatically focus the grid root (matches existing v0.1 behaviour
 * across pinned-cols / row-selection tests). Tests focus the grid
 * explicitly before sending keyboard events, mirroring `pinned-cols.pw.ts`.
 */

async function focusGridAtRow(page: Page, rowIndex: number): Promise<void> {
  await page.locator(`.bc-grid-row[data-row-index="${rowIndex}"]`).first().click()
  await page.locator('[role="grid"]').first().focus()
}

test("plain Space toggles selection on the active row", async ({ page }) => {
  await page.goto("/")
  await focusGridAtRow(page, 3)
  const row3 = page.locator('.bc-grid-row[data-row-index="3"]').first()
  await expect(row3).toHaveAttribute("aria-selected", "true")

  // Space toggles row 3 OFF.
  await page.keyboard.press(" ")
  await expect(row3).not.toHaveAttribute("aria-selected", "true")

  // Space toggles back ON.
  await page.keyboard.press(" ")
  await expect(row3).toHaveAttribute("aria-selected", "true")
})

test("Space does not move the active cell — selection-only", async ({ page }) => {
  await page.goto("/")
  await focusGridAtRow(page, 2)
  const row2 = page.locator('.bc-grid-row[data-row-index="2"]').first()

  const activeCellIdBefore = await page
    .locator('[role="grid"]')
    .first()
    .getAttribute("aria-activedescendant")

  await page.keyboard.press(" ")

  const activeCellIdAfter = await page
    .locator('[role="grid"]')
    .first()
    .getAttribute("aria-activedescendant")

  // Active descendant unchanged.
  expect(activeCellIdAfter).toBe(activeCellIdBefore)
  // Row 2 was selected (plain click), Space toggled it off — verify.
  await expect(row2).not.toHaveAttribute("aria-selected", "true")
})

test("Arrow keys + Space compose: navigate to a row, toggle without clicking", async ({ page }) => {
  await page.goto("/")
  await focusGridAtRow(page, 1)

  // Arrow down twice → focus row 3. Space toggles its selection.
  await page.keyboard.press("ArrowDown")
  await page.keyboard.press("ArrowDown")
  await page.keyboard.press(" ")

  // Space ADDED row 3 to the selection (toggleRow appends in explicit
  // mode rather than replacing — the prior plain-click of row 1 stays
  // selected too).
  await expect(page.locator('.bc-grid-row[data-row-index="3"]').first()).toHaveAttribute(
    "aria-selected",
    "true",
  )
})

test("Shift+Space is swallowed (Q3-reserved range extension)", async ({ page }) => {
  await page.goto("/")
  await focusGridAtRow(page, 4)
  const row4 = page.locator('.bc-grid-row[data-row-index="4"]').first()
  // Shift+Space should NOT toggle — Q3 range RFC will define semantics.
  await expect(row4).toHaveAttribute("aria-selected", "true")
  await page.keyboard.press("Shift+ ")
  // Selection unchanged.
  await expect(row4).toHaveAttribute("aria-selected", "true")
})

test("Space does not scroll the grid scroller (browser default)", async ({ page }) => {
  await page.goto("/")
  await focusGridAtRow(page, 0)

  const scroller = page.locator(".bc-grid-scroller").first()
  const scrollBefore = await scroller.evaluate((el) => el.scrollTop)

  await page.keyboard.press(" ")

  const scrollAfter = await scroller.evaluate((el) => el.scrollTop)
  expect(scrollAfter).toBe(scrollBefore)
})
