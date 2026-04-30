import { type Page, expect, test } from "@playwright/test"

/**
 * `editor-text` (`kind: "text"`) from `@bc-grid/editors`. The `tradingName`
 * column on the demo is wired with `cellEditor: textEditor` + a
 * `valueParser` that trims whitespace at commit. This test asserts the
 * editor-specific behaviour added on top of the framework-level paths
 * already covered by `editor-framework.pw.ts`:
 *   - `data-bc-grid-editor-kind="text"` discriminator on the input
 *   - F2 / Enter activation: select-all on mount (Excel-style)
 *   - Printable activation: caret at end (seedKey content)
 *   - valueParser (trim) runs at commit; persisted value is trimmed
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

test("textEditor input carries data-bc-grid-editor-kind='text'", async ({ page }) => {
  await page.goto(URL)
  await focusBodyCell(page, 0, EDITABLE_COLUMN)
  await page.keyboard.press("F2")
  const input = page.locator('input[data-bc-grid-editor-input="true"]').first()
  await expect(input).toHaveAttribute("data-bc-grid-editor-kind", "text")
})

test("F2 mounts the editor with the cell value selected (Excel select-all)", async ({ page }) => {
  await page.goto(URL)
  await focusBodyCell(page, 0, EDITABLE_COLUMN)
  await page.keyboard.press("F2")
  const input = page.locator('input[data-bc-grid-editor-input="true"]').first()

  // Selection covers the entire input text on mount.
  const selection = await input.evaluate((el) => {
    const i = el as HTMLInputElement
    return { start: i.selectionStart, end: i.selectionEnd, length: i.value.length }
  })
  expect(selection.start).toBe(0)
  expect(selection.end).toBe(selection.length)
})

test("Printable activation seeds the input and places the caret at the end", async ({ page }) => {
  await page.goto(URL)
  await focusBodyCell(page, 0, EDITABLE_COLUMN)
  await page.keyboard.press("Z")
  const input = page.locator('input[data-bc-grid-editor-input="true"]').first()

  await expect(input).toHaveValue("Z")
  const selection = await input.evaluate((el) => {
    const i = el as HTMLInputElement
    return { start: i.selectionStart, end: i.selectionEnd }
  })
  // Caret at end (no selection); start === end === 1.
  expect(selection.start).toBe(1)
  expect(selection.end).toBe(1)
})

test("valueParser trims whitespace at commit; cell display reflects trimmed value", async ({
  page,
}) => {
  await page.goto(URL)
  await focusBodyCell(page, 0, EDITABLE_COLUMN)
  await page.keyboard.press("F2")
  const input = page.locator('input[data-bc-grid-editor-input="true"]').first()
  await input.fill("   Trimmed Co.   ")
  await page.keyboard.press("Enter")

  // Editor unmounts.
  await expect(page.locator('input[data-bc-grid-editor-input="true"]')).toHaveCount(0)

  // The cell now shows the trimmed value (no leading/trailing spaces).
  const cell = page
    .locator(`.bc-grid-row[data-row-index="0"] .bc-grid-cell[data-column-id="${EDITABLE_COLUMN}"]`)
    .first()
  const cellText = await cell.innerText()
  expect(cellText).toBe("Trimmed Co.")
})

test("validate rejects empty trimmed input — editor stays mounted with aria-invalid", async ({
  page,
}) => {
  await page.goto(URL)
  await focusBodyCell(page, 0, EDITABLE_COLUMN)
  await page.keyboard.press("F2")
  const input = page.locator('input[data-bc-grid-editor-input="true"]').first()
  // valueParser will trim "   " → ""; validate then rejects.
  await input.fill("   ")
  await page.keyboard.press("Enter")

  // Editor remained — commit was rejected.
  await expect(input).toBeAttached()
  await expect(input).toHaveAttribute("aria-invalid", "true")
})
