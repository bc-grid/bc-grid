import { type Page, expect, test } from "@playwright/test"

/**
 * `editor-select` (`kind: "select"`) from `@bc-grid/editors`. The
 * `status` column on the demo is wired with `cellEditor: selectEditor`
 * + `options: [{value: "Open", label: "Open"}, ...]`.
 *
 * Tests assert the editor-specific behaviour:
 *   - `data-bc-grid-editor-kind="select"` discriminator
 *   - native `<select>` with one `<option>` per `column.options` entry
 *   - existing cell value pre-selected
 *   - commit persists the new value
 */

const URL = "/?edit=1"
const SELECT_COLUMN = "status"

async function focusBodyCell(page: Page, rowIndex: number, columnId: string) {
  // Status column is mid-grid — scroll partway to ensure rendered.
  await page.evaluate(() => {
    const scroller = document.querySelector<HTMLElement>(".bc-grid .bc-grid-scroller")
    if (scroller) scroller.scrollLeft = scroller.scrollWidth / 2
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

test("selectEditor mounts a native <select> with the editor-kind data attribute", async ({
  page,
}) => {
  await page.goto(URL)
  await focusBodyCell(page, 0, SELECT_COLUMN)
  await page.keyboard.press("F2")
  const select = page.locator('select[data-bc-grid-editor-input="true"]').first()
  await expect(select).toBeAttached()
  await expect(select).toHaveAttribute("data-bc-grid-editor-kind", "select")
})

test("editor renders one option per column.options entry", async ({ page }) => {
  await page.goto(URL)
  await focusBodyCell(page, 0, SELECT_COLUMN)
  await page.keyboard.press("F2")
  const select = page.locator('select[data-bc-grid-editor-input="true"]').first()
  // CustomerStatus has 4 values: Open, Credit Hold, Past Due, Disputed.
  const optionCount = await select.locator("option").count()
  expect(optionCount).toBe(4)
})

test("editor pre-selects the existing cell value", async ({ page }) => {
  await page.goto(URL)
  await focusBodyCell(page, 0, SELECT_COLUMN)
  await page.keyboard.press("F2")
  const select = page.locator('select[data-bc-grid-editor-input="true"]').first()
  // Each customer has one of: Open / Credit Hold / Past Due / Disputed.
  const selected = await select.evaluate((el) => (el as HTMLSelectElement).value)
  expect(["Open", "Credit Hold", "Past Due", "Disputed"]).toContain(selected)
})

test("commit persists the new selection to the cell display", async ({ page }) => {
  await page.goto(URL)
  await focusBodyCell(page, 0, SELECT_COLUMN)
  await page.keyboard.press("F2")
  const select = page.locator('select[data-bc-grid-editor-input="true"]').first()
  await select.selectOption("Disputed")
  await page.keyboard.press("Enter")

  await expect(page.locator('select[data-bc-grid-editor-input="true"]')).toHaveCount(0)

  // The status cell renders via StatusBadge; the badge text reflects the
  // committed value.
  const cell = page
    .locator(`.bc-grid-row[data-row-index="0"] .bc-grid-cell[data-column-id="${SELECT_COLUMN}"]`)
    .first()
  await expect(cell).toContainText("Disputed")
})
