import { type Page, expect, test } from "@playwright/test"

/**
 * `editor-time` (`kind: "time"`) from `@bc-grid/editors`. The
 * `cutoffTime` column on the demo is wired with `cellEditor:
 * timeEditor` + a `validate` that bounds the time to working hours.
 *
 * Tests assert the editor-specific behaviour:
 *   - `data-bc-grid-editor-kind="time"` discriminator
 *   - `<input type="time">` (browser-native time picker)
 *   - F2 / Enter focuses the input
 *   - existing cell value normalised to `HH:mm`
 *   - validate rejects out-of-bounds + malformed input
 */

const URL = "/?edit=1"
const TIME_COLUMN = "cutoffTime"

async function focusBodyCell(page: Page, rowIndex: number, columnId: string) {
  // cutoffTime is appended to the column list and starts off-screen on
  // first render — scroll the grid's body scroller all the way right so
  // the virtualizer renders cells in this column.
  await page.evaluate(() => {
    const scroller = document.querySelector(".bc-grid-scroller") as HTMLElement | null
    if (scroller) scroller.scrollLeft = scroller.scrollWidth
  })
  const cell = page
    .locator(
      `.bc-grid-row[data-row-index="${rowIndex}"] .bc-grid-cell[data-column-id="${columnId}"]`,
    )
    .first()
  await cell.click()
  await page.locator('[role="grid"]').first().focus()
  return cell
}

test("timeEditor input carries data-bc-grid-editor-kind='time' and type='time'", async ({
  page,
}) => {
  await page.goto(URL)
  await focusBodyCell(page, 0, TIME_COLUMN)
  await page.keyboard.press("F2")
  const input = page.locator('input[data-bc-grid-editor-input="true"]').first()
  await expect(input).toHaveAttribute("data-bc-grid-editor-kind", "time")
  await expect(input).toHaveAttribute("type", "time")
})

test("editor mounts with the existing cell value normalised to HH:mm", async ({ page }) => {
  await page.goto(URL)
  await focusBodyCell(page, 0, TIME_COLUMN)
  await page.keyboard.press("F2")
  const input = page.locator('input[data-bc-grid-editor-input="true"]').first()
  // Fixture rows use deterministic times like `14:00` / `15:30` etc.
  const value = await input.inputValue()
  expect(value).toMatch(/^\d{2}:\d{2}$/)
})

test("commit persists the new time value to the cell display", async ({ page }) => {
  await page.goto(URL)
  await focusBodyCell(page, 0, TIME_COLUMN)
  await page.keyboard.press("F2")
  const input = page.locator('input[data-bc-grid-editor-input="true"]').first()
  await input.fill("15:30")
  await page.keyboard.press("Enter")

  await expect(page.locator('input[data-bc-grid-editor-input="true"]')).toHaveCount(0)
  const cell = page
    .locator(`.bc-grid-row[data-row-index="0"] .bc-grid-cell[data-column-id="${TIME_COLUMN}"]`)
    .first()
  await expect(cell).toContainText("15:30")
})

test("validate rejects times outside working hours (before 08:00)", async ({ page }) => {
  await page.goto(URL)
  await focusBodyCell(page, 0, TIME_COLUMN)
  await page.keyboard.press("F2")
  const input = page.locator('input[data-bc-grid-editor-input="true"]').first()
  await input.fill("06:00")
  await page.keyboard.press("Enter")

  await expect(input).toBeAttached()
  await expect(input).toHaveAttribute("aria-invalid", "true")
})

test("validate rejects times outside working hours (after 22:00)", async ({ page }) => {
  await page.goto(URL)
  await focusBodyCell(page, 0, TIME_COLUMN)
  await page.keyboard.press("F2")
  const input = page.locator('input[data-bc-grid-editor-input="true"]').first()
  await input.fill("23:30")
  await page.keyboard.press("Enter")

  await expect(input).toBeAttached()
  await expect(input).toHaveAttribute("aria-invalid", "true")
})
