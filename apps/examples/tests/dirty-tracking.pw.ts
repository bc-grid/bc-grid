import { type Page, expect, test } from "@playwright/test"

/**
 * `dirty-tracking` plumbs editor state onto cell renderer params:
 *   - `pending: boolean`         — async commit in flight
 *   - `editError?: string`        — async commit / server reject
 *   - `isDirty: boolean`          — committed locally this session
 *
 * The cell DOM exposes the same state via the `data-bc-grid-cell-state`
 * attribute (one of `"dirty" | "pending" | "error"` or absent).
 *
 * Tests use the AR Customers demo with `?edit=1`; the `tradingName`
 * column is editable with a non-empty validate.
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

test("clean cells have no data-bc-grid-cell-state attribute", async ({ page }) => {
  await page.goto(URL)
  const cell = await focusBodyCell(page, 0, EDITABLE_COLUMN)
  // Default state: no edit has happened on this cell.
  const state = await cell.getAttribute("data-bc-grid-cell-state")
  expect(state).toBeNull()
})

test("after a successful commit the cell is marked dirty", async ({ page }) => {
  await page.goto(URL)
  await focusBodyCell(page, 0, EDITABLE_COLUMN)
  await page.keyboard.press("F2")
  const editor = page.locator('[data-bc-grid-editor-input="true"]').first()
  await editor.fill("Edited Trading Name")
  await page.keyboard.press("Enter")

  // Editor unmounts; row 0's tradingName cell now reflects the dirty
  // patch and exposes data-bc-grid-cell-state="dirty".
  const cell = page
    .locator(`.bc-grid-row[data-row-index="0"] .bc-grid-cell[data-column-id="${EDITABLE_COLUMN}"]`)
    .first()
  await expect(cell).toHaveAttribute("data-bc-grid-cell-state", "dirty")
})

test("validation rejection leaves the cell clean (commit never landed)", async ({ page }) => {
  await page.goto(URL)
  const cell = await focusBodyCell(page, 0, EDITABLE_COLUMN)
  await page.keyboard.press("F2")
  const editor = page.locator('[data-bc-grid-editor-input="true"]').first()
  // Empty value triggers the column's validate (rejects empty trading
  // name).
  await editor.fill("")
  await page.keyboard.press("Enter")

  // Editor stays mounted on rejection — no overlay patch was applied,
  // so the underlying cell stays clean.
  await expect(editor).toBeAttached()
  await page.keyboard.press("Escape")

  // After cancel, no patch landed → cell stays clean.
  const state = await cell.getAttribute("data-bc-grid-cell-state")
  expect(state).toBeNull()
})

test("dirty state survives navigating away from the cell and coming back", async ({ page }) => {
  await page.goto(URL)
  await focusBodyCell(page, 0, EDITABLE_COLUMN)
  await page.keyboard.press("F2")
  const editor = page.locator('[data-bc-grid-editor-input="true"]').first()
  await editor.fill("Persisted Edit")
  await page.keyboard.press("Enter")

  // Click on row 4 to defocus, then come back.
  await page.locator('.bc-grid-row[data-row-index="4"]').first().click()
  await page.locator('[role="grid"]').first().focus()

  // Row 0's tradingName cell should still report dirty.
  const cell = page
    .locator(`.bc-grid-row[data-row-index="0"] .bc-grid-cell[data-column-id="${EDITABLE_COLUMN}"]`)
    .first()
  await expect(cell).toHaveAttribute("data-bc-grid-cell-state", "dirty")
})
