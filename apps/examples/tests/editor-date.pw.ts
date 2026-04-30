import { type Page, expect, test } from "@playwright/test"

/**
 * `editor-date` (`kind: "date"`) from `@bc-grid/editors`. The
 * `lastInvoice` column on the demo is wired with `cellEditor:
 * dateEditor` + a `validate` that bounds dates to "not in the future".
 *
 * Tests assert the editor-specific behaviour:
 *   - `data-bc-grid-editor-kind="date"` discriminator
 *   - `<input type="date">` (browser-native calendar)
 *   - existing cell value normalised to YYYY-MM-DD (accepts ISO strings
 *     and Date instances)
 *   - commit persists new date to cell display
 *   - validate rejects future dates
 */

const URL = "/?edit=1"
const DATE_COLUMN = "lastInvoice"

async function focusBodyCell(page: Page, rowIndex: number, columnId: string) {
  // lastInvoice is far-right of the grid — scroll the body all the way
  // right so the virtualizer renders cells in this column.
  await page.evaluate(() => {
    const scroller = document.querySelector<HTMLElement>(".bc-grid .bc-grid-scroller")
    if (scroller) scroller.scrollLeft = scroller.scrollWidth
  })
  // Two RAF ticks let the virtualizer commit the new viewport.
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())))
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())))

  const cell = page
    .locator(
      `.bc-grid-row[data-row-index="${rowIndex}"] .bc-grid-cell[data-column-id="${columnId}"]`,
    )
    .first()
  await cell.click()
  await page.locator('[role="grid"]').first().focus()
  return cell
}

test("dateEditor input carries data-bc-grid-editor-kind='date' and type='date'", async ({
  page,
}) => {
  await page.goto(URL)
  await focusBodyCell(page, 0, DATE_COLUMN)
  await page.keyboard.press("F2")
  const input = page.locator('input[data-bc-grid-editor-input="true"]').first()
  await expect(input).toHaveAttribute("data-bc-grid-editor-kind", "date")
  await expect(input).toHaveAttribute("type", "date")
})

test("editor mounts with the existing cell value normalised to YYYY-MM-DD", async ({ page }) => {
  await page.goto(URL)
  await focusBodyCell(page, 0, DATE_COLUMN)
  await page.keyboard.press("F2")
  const input = page.locator('input[data-bc-grid-editor-input="true"]').first()
  // Fixture uses ISO timestamps (e.g., 2026-04-01T00:00:00.000Z) — the
  // editor normalises to YYYY-MM-DD.
  const value = await input.inputValue()
  expect(value).toMatch(/^\d{4}-\d{2}-\d{2}$/)
})

test("commit persists the new date to the cell display", async ({ page }) => {
  await page.goto(URL)
  await focusBodyCell(page, 0, DATE_COLUMN)
  await page.keyboard.press("F2")
  const input = page.locator('input[data-bc-grid-editor-input="true"]').first()
  await input.fill("2025-06-15")
  await page.keyboard.press("Enter")

  await expect(page.locator('input[data-bc-grid-editor-input="true"]')).toHaveCount(0)

  // Cell now displays the formatted date. The exact formatting depends on
  // the column.format = "date" pipeline (Intl.DateTimeFormat); we just
  // assert the cell text contains a recognisable substring of the date.
  const cell = page
    .locator(`.bc-grid-row[data-row-index="0"] .bc-grid-cell[data-column-id="${DATE_COLUMN}"]`)
    .first()
  // Year survives any locale formatting; month + day vary by locale
  // (e.g., "Jun" in en-US, "06" elsewhere).
  await expect(cell).toContainText("2025")
})

test("validate rejects future dates — editor stays mounted with aria-invalid", async ({
  page,
}) => {
  await page.goto(URL)
  await focusBodyCell(page, 0, DATE_COLUMN)
  await page.keyboard.press("F2")
  const input = page.locator('input[data-bc-grid-editor-input="true"]').first()
  // Far-future date.
  await input.fill("2099-12-31")
  await page.keyboard.press("Enter")

  await expect(input).toBeAttached()
  await expect(input).toHaveAttribute("aria-invalid", "true")
})

test("validate rejects malformed dates", async ({ page }) => {
  await page.goto(URL)
  await focusBodyCell(page, 0, DATE_COLUMN)
  await page.keyboard.press("F2")
  const input = page.locator('input[data-bc-grid-editor-input="true"]').first()
  // Try to commit an empty value (cleared the input). Native date
  // inputs allow empty value; the validator should reject it.
  await input.fill("")
  await page.keyboard.press("Enter")

  await expect(input).toBeAttached()
  await expect(input).toHaveAttribute("aria-invalid", "true")
})
