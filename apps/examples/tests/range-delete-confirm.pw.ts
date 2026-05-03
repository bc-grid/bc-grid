import { expect, test } from "@playwright/test"

/**
 * Multi-cell range Delete with `confirmRangeDelete` opt-in. v0.6 §1
 * (`v06-editor-multi-cell-delete-confirm`). Recipe doc:
 * `docs/recipes/range-delete-confirm.md`.
 *
 * Three scenarios:
 *   1. **Default behaviour preserved** — `confirmRangeDelete`
 *      unset, range Delete clears just the active cell.
 *   2. **`confirmRangeDelete: true`** — range Delete clears every
 *      editable cell in the range.
 *   3. **Function form awaits Promise** — range Delete waits for
 *      consumer's confirm; cancel keeps cells intact, confirm
 *      proceeds with clear.
 *
 * Stubs are `test.skip` pending an example-app fixture exposing
 * the prop in three modes (off / true / function). Coordinator:
 * unskip once fixture lands.
 */

const URL_DEFAULT = "/?range-delete=off"
const URL_TRUE = "/?range-delete=true"
const URL_FN = "/?range-delete=fn"

test.skip("default behaviour: range Delete clears only the active cell", async ({ page }) => {
  await page.goto(URL_DEFAULT)

  // Establish a 2x2 range via Shift+ArrowDown + Shift+ArrowRight.
  const cell00 = page
    .locator('.bc-grid-row[data-row-index="0"] .bc-grid-cell[data-column-id="amount"]')
    .first()
  await cell00.click()
  await page.locator('[role="grid"]').first().focus()
  await page.keyboard.press("Shift+ArrowDown")
  await page.keyboard.press("Shift+ArrowRight")

  await page.keyboard.press("Delete")

  // Only the active (top-left) cell cleared; the other 3 retain values.
  await expect(cell00).toHaveText("")
  const otherCell = page
    .locator('.bc-grid-row[data-row-index="1"] .bc-grid-cell[data-column-id="amount"]')
    .first()
  await expect(otherCell).not.toHaveText("")
})

test.skip("confirmRangeDelete: true → range Delete clears every editable cell", async ({
  page,
}) => {
  await page.goto(URL_TRUE)

  const cell00 = page
    .locator('.bc-grid-row[data-row-index="0"] .bc-grid-cell[data-column-id="amount"]')
    .first()
  await cell00.click()
  await page.locator('[role="grid"]').first().focus()
  await page.keyboard.press("Shift+ArrowDown")
  await page.keyboard.press("Shift+ArrowRight")

  await page.keyboard.press("Delete")

  // Every cell in the 2x2 range cleared.
  await expect(
    page.locator('.bc-grid-row[data-row-index="0"] .bc-grid-cell[data-column-id="amount"]'),
  ).toHaveText("")
  await expect(
    page.locator('.bc-grid-row[data-row-index="1"] .bc-grid-cell[data-column-id="amount"]'),
  ).toHaveText("")
})

test.skip("function-form confirmRangeDelete: cancel skips the clear", async ({ page }) => {
  await page.goto(URL_FN)

  // Fixture wires confirmRangeDelete = (range) => dialog.confirm(...)
  // and exposes a "Cancel" button on the dialog.
  await page.evaluate(() => {
    window.__bcRangeDeleteConfirm = "cancel"
  })

  const cell00 = page
    .locator('.bc-grid-row[data-row-index="0"] .bc-grid-cell[data-column-id="amount"]')
    .first()
  const cellBefore = await cell00.textContent()

  await cell00.click()
  await page.locator('[role="grid"]').first().focus()
  await page.keyboard.press("Shift+ArrowDown")
  await page.keyboard.press("Delete")

  // Cancel kept the cell — text unchanged.
  await expect(cell00).toHaveText(cellBefore ?? "")
})

declare global {
  interface Window {
    __bcRangeDeleteConfirm?: "confirm" | "cancel"
  }
}
