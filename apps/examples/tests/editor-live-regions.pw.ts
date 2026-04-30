import { type Page, expect, test } from "@playwright/test"

/**
 * Cell-edit live-region announcements per `editing-rfc §Live Regions`.
 * The framework dispatches three events through the editing controller's
 * `announce` hook:
 *   - committed (polite): "Updated {col} for {row} to {value}."
 *   - validationError (assertive): "{col} was not updated. {err}"
 *   - serverError (assertive): "{col} update failed. {err} Reverted."
 *
 * Cancel + edit-mode-entered are silent per the RFC.
 */

const URL = "/?edit=1"
const EDITABLE_COLUMN = "tradingName"

async function focusBodyCell(page: Page, rowIndex: number, columnId: string) {
  const cell = page
    .locator(
      `.bc-grid-row[data-row-index="${rowIndex}"] .bc-grid-cell[data-column-id="${columnId}"]`,
    )
    .first()
  await cell.click()
  await page.locator('[role="grid"]').first().focus()
  return cell
}

test("polite live region announces on successful commit", async ({ page }) => {
  await page.goto(URL)
  const polite = page.locator('[data-bc-grid-status="true"]').first()
  // Region starts empty.
  await expect(polite).toHaveText("")

  await focusBodyCell(page, 0, EDITABLE_COLUMN)
  await page.keyboard.press("F2")
  const editor = page.locator('[data-bc-grid-editor-input="true"]').first()
  await editor.fill("Renamed Co")
  await page.keyboard.press("Enter")

  // Editor unmounts; polite region carries the committed announcement.
  await expect(polite).toContainText(/Updated Trading Name for .* to Renamed Co\./i)
})

test("assertive live region announces on validation rejection", async ({ page }) => {
  await page.goto(URL)
  const alert = page.locator('[data-bc-grid-alert="true"]').first()
  await expect(alert).toHaveText("")

  await focusBodyCell(page, 0, EDITABLE_COLUMN)
  await page.keyboard.press("F2")
  const editor = page.locator('[data-bc-grid-editor-input="true"]').first()
  // Empty triggers the column's validate (rejects empty trading name).
  await editor.fill("")
  await page.keyboard.press("Enter")

  // Editor stays mounted; assertive region carries the error.
  await expect(editor).toBeAttached()
  await expect(alert).toContainText("Trading name is required")
})

test("cancel via Escape is silent (no live-region update)", async ({ page }) => {
  await page.goto(URL)
  const polite = page.locator('[data-bc-grid-status="true"]').first()
  const alert = page.locator('[data-bc-grid-alert="true"]').first()

  await focusBodyCell(page, 0, EDITABLE_COLUMN)
  await page.keyboard.press("F2")
  const editor = page.locator('[data-bc-grid-editor-input="true"]').first()
  await editor.fill("dropped")
  await page.keyboard.press("Escape")

  // Per the RFC, cancel is silent. Neither region should pick up a
  // commit / error / cancel announcement from this flow.
  await expect(polite).not.toContainText(/Updated/i)
  await expect(polite).not.toContainText(/cancel/i)
  await expect(alert).toHaveText("")
})
