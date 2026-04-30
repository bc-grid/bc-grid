import { type Page, expect, test } from "@playwright/test"

/**
 * `editor-number` (`kind: "number"`) from `@bc-grid/editors`. The
 * `creditLimit` column on the demo is wired with `cellEditor:
 * numberEditor` + a `valueParser` that strips thousands separators and
 * runs `parseFloat` + a `validate` that rejects NaN and negatives.
 *
 * Tests assert the editor-specific behaviour:
 *   - `data-bc-grid-editor-kind="number"` discriminator
 *   - `inputMode="decimal"` triggers the numeric keyboard
 *   - F2 select-all
 *   - seedKey filtered: only digits / `.` / `,` / `-` accepted
 *   - valueParser parses string → number; validate rejects NaN + negative
 */

const URL = "/?edit=1"
const NUMBER_COLUMN = "creditLimit"

async function focusBodyCell(page: Page, rowIndex: number, columnId: string) {
  await page.evaluate(() => {
    const scroller = document.querySelector<HTMLElement>(".bc-grid .bc-grid-scroller")
    if (scroller) scroller.scrollLeft = 900
  })
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

test("numberEditor input carries data-bc-grid-editor-kind='number' and inputMode='decimal'", async ({
  page,
}) => {
  await page.goto(URL)
  await focusBodyCell(page, 0, NUMBER_COLUMN)
  await page.keyboard.press("F2")
  const input = page.locator('input[data-bc-grid-editor-input="true"]').first()
  await expect(input).toHaveAttribute("data-bc-grid-editor-kind", "number")
  await expect(input).toHaveAttribute("inputmode", "decimal")
})

test("F2 mounts the editor with the cell value selected (Excel select-all)", async ({ page }) => {
  await page.goto(URL)
  await focusBodyCell(page, 0, NUMBER_COLUMN)
  await page.keyboard.press("F2")
  const input = page.locator('input[data-bc-grid-editor-input="true"]').first()
  const selection = await input.evaluate((el) => {
    const i = el as HTMLInputElement
    return { start: i.selectionStart, end: i.selectionEnd, length: i.value.length }
  })
  expect(selection.length).toBeGreaterThan(0)
  expect(selection.start).toBe(0)
  expect(selection.end).toBe(selection.length)
})

test("seedKey accepts numeric chars (digits, period, comma, minus)", async ({ page }) => {
  await page.goto(URL)
  await focusBodyCell(page, 0, NUMBER_COLUMN)
  await page.keyboard.press("5")
  const input = page.locator('input[data-bc-grid-editor-input="true"]').first()
  await expect(input).toHaveValue("5")
})

test("valueParser strips thousands separators; commit persists the parsed number", async ({
  page,
}) => {
  await page.goto(URL)
  await focusBodyCell(page, 0, NUMBER_COLUMN)
  await page.keyboard.press("F2")
  const input = page.locator('input[data-bc-grid-editor-input="true"]').first()
  await input.fill("123,456")
  await page.keyboard.press("Enter")

  // Editor unmounts.
  await expect(page.locator('input[data-bc-grid-editor-input="true"]')).toHaveCount(0)

  // The cell now formats 123456 as currency. We assert the cell text
  // contains the formatted figure (USD with no precision per the column
  // format).
  const cell = page
    .locator(`.bc-grid-row[data-row-index="0"] .bc-grid-cell[data-column-id="${NUMBER_COLUMN}"]`)
    .first()
  await expect(cell).toContainText("123,456")
})

test("validate rejects non-numeric input — editor stays mounted with aria-invalid", async ({
  page,
}) => {
  await page.goto(URL)
  await focusBodyCell(page, 0, NUMBER_COLUMN)
  await page.keyboard.press("F2")
  const input = page.locator('input[data-bc-grid-editor-input="true"]').first()
  // valueParser yields NaN; validate rejects.
  await input.fill("not-a-number")
  await page.keyboard.press("Enter")

  await expect(input).toBeAttached()
  await expect(input).toHaveAttribute("aria-invalid", "true")
})

test("validate rejects negative numbers", async ({ page }) => {
  await page.goto(URL)
  await focusBodyCell(page, 0, NUMBER_COLUMN)
  await page.keyboard.press("F2")
  const input = page.locator('input[data-bc-grid-editor-input="true"]').first()
  await input.fill("-100")
  await page.keyboard.press("Enter")

  await expect(input).toBeAttached()
  await expect(input).toHaveAttribute("aria-invalid", "true")
})
