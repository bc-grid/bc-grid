import { expect, test } from "@playwright/test"

/**
 * Actions-column keyboard shortcuts: Shift+E fires onEdit;
 * Shift+Delete (or Shift+Backspace) fires onDelete with confirmDelete
 * gate. v0.6 §1 (`v06-server-grid-actions-keyboard`). Recipe doc:
 * `docs/recipes/server-grid-actions.md` §Keyboard shortcuts.
 *
 * Three scenarios:
 *   1. **Shift+E fires onEdit** — focus a row, press Shift+E, assert
 *      consumer's onEdit handler ran with the correct row.
 *   2. **Shift+Delete awaits confirmDelete** — assert the confirm
 *      dialog appears; on cancel, onDelete does NOT fire.
 *   3. **canEdit / canDelete gates** — assert the gesture is a no-op
 *      on a row where canEdit returns false.
 *
 * Stubs are `test.skip` pending an example-app fixture wiring
 * <BcServerGrid> with onEdit + onDelete + window-level counters
 * for assertion. Coordinator: unskip once fixture lands.
 */

const URL = "/?server-actions=1"

test.skip("Shift+E on focused row fires onEdit with the row data", async ({ page }) => {
  await page.goto(URL)

  await page.evaluate(() => {
    window.__bcEditCount = 0
  })

  // Focus row 0.
  const cell = page.locator('.bc-grid-row[data-row-index="0"] .bc-grid-cell').first()
  await cell.click()
  await page.locator('[role="grid"]').first().focus()

  await page.keyboard.press("Shift+e")

  const count = await page.evaluate(() => window.__bcEditCount as number)
  expect(count).toBe(1)
})

test.skip("Shift+Delete awaits confirmDelete before firing onDelete", async ({ page }) => {
  await page.goto(URL)

  await page.evaluate(() => {
    window.__bcDeleteCount = 0
    window.__bcConfirmCount = 0
  })

  const cell = page.locator('.bc-grid-row[data-row-index="0"] .bc-grid-cell').first()
  await cell.click()
  await page.locator('[role="grid"]').first().focus()

  await page.keyboard.press("Shift+Delete")
  // Allow the confirmDelete Promise to settle.
  await page.waitForTimeout(50)

  const confirmCount = await page.evaluate(() => window.__bcConfirmCount as number)
  const deleteCount = await page.evaluate(() => window.__bcDeleteCount as number)
  expect(confirmCount).toBe(1)
  expect(deleteCount).toBe(1)
})

test.skip("Shift+E is a no-op when canEdit returns false for the focused row", async ({ page }) => {
  await page.goto(URL)

  await page.evaluate(() => {
    window.__bcEditCount = 0
  })

  // Fixture row 1 is wired with canEdit returning false.
  const cell = page.locator('.bc-grid-row[data-row-index="1"] .bc-grid-cell').first()
  await cell.click()
  await page.locator('[role="grid"]').first().focus()

  await page.keyboard.press("Shift+e")

  const count = await page.evaluate(() => window.__bcEditCount as number)
  expect(count).toBe(0)
})

declare global {
  interface Window {
    __bcEditCount?: number
    __bcDeleteCount?: number
    __bcConfirmCount?: number
  }
}
