import { type Page, expect, test } from "@playwright/test"

/**
 * `editor-multi-select` (`kind: "multi-select"`) from `@bc-grid/editors`.
 * The `flags` column on the demo is wired with
 * `cellEditor: multiSelectEditor` + `options: FLAG_OPTIONS`.
 *
 * Tests assert the editor-specific behaviour:
 *   - `data-bc-grid-editor-kind="multi-select"` discriminator
 *   - native `<select multiple>` with one `<option>` per
 *     `column.options` entry
 *   - existing cell values pre-selected (the `flags` array on a row maps
 *     to multiple `option.selected = true`)
 *   - commit produces a `readonly TValue[]` and the cell renderer
 *     reflects it
 *   - validation rejection (VIP + Manual Review combo) keeps the editor
 *     mounted with the assertive live region populated
 */

const URL = "/?edit=1"
const MULTI_SELECT_COLUMN = "flags"

async function focusBodyCell(page: Page, rowIndex: number, columnId: string) {
  // Flags column is the rightmost — scroll fully right to ensure rendered.
  await page.evaluate(() => {
    const scroller = document.querySelector<HTMLElement>(".bc-grid .bc-grid-scroller")
    if (scroller) scroller.scrollLeft = scroller.scrollWidth
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

test("multiSelectEditor mounts a native <select multiple> with the editor-kind data attribute", async ({
  page,
}) => {
  await page.goto(URL)
  await focusBodyCell(page, 0, MULTI_SELECT_COLUMN)
  await page.keyboard.press("F2")
  const select = page.locator('select[data-bc-grid-editor-input="true"]').first()
  await expect(select).toBeAttached()
  await expect(select).toHaveAttribute("data-bc-grid-editor-kind", "multi-select")
  // The `multiple` attribute is what makes the framework iterate
  // `selectedOptions` at commit instead of using `selectedIndex`.
  await expect(select).toHaveAttribute("multiple", "")
})

test("editor renders one option per column.options entry", async ({ page }) => {
  await page.goto(URL)
  await focusBodyCell(page, 0, MULTI_SELECT_COLUMN)
  await page.keyboard.press("F2")
  const select = page.locator('select[data-bc-grid-editor-input="true"]').first()
  // CustomerFlag has 5 values; demo wires all of them as options.
  const optionCount = await select.locator("option").count()
  expect(optionCount).toBe(5)
})

test("editor pre-selects every value present in the row's flags array", async ({ page }) => {
  await page.goto(URL)
  // Row 3 has `flags: ["high-volume", "tax-exempt"]` (mod 6 === 3).
  await focusBodyCell(page, 3, MULTI_SELECT_COLUMN)
  await page.keyboard.press("F2")
  const select = page.locator('select[data-bc-grid-editor-input="true"]').first()
  const selectedValues = await select.evaluate((el) =>
    Array.from((el as HTMLSelectElement).selectedOptions).map((option) => option.value),
  )
  expect(selectedValues).toEqual(["high-volume", "tax-exempt"])
})

test("commit produces an array of typed values and the cell renderer reflects every value", async ({
  page,
}) => {
  await page.goto(URL)
  // Row 0: empty flags. Pick two via selectOption (multi).
  await focusBodyCell(page, 0, MULTI_SELECT_COLUMN)
  await page.keyboard.press("F2")
  const select = page.locator('select[data-bc-grid-editor-input="true"]').first()
  await select.selectOption(["high-volume", "international"])
  await page.keyboard.press("Enter")

  await expect(page.locator('select[data-bc-grid-editor-input="true"]')).toHaveCount(0)

  const cell = page
    .locator(
      `.bc-grid-row[data-row-index="0"] .bc-grid-cell[data-column-id="${MULTI_SELECT_COLUMN}"]`,
    )
    .first()
  await expect(cell).toContainText("High Volume")
  await expect(cell).toContainText("International")
})

test("validation rejection keeps the editor open and announces via assertive region", async ({
  page,
}) => {
  await page.goto(URL)
  // Row 0: pick VIP + Manual Review — the demo's validate() rejects this combo.
  await focusBodyCell(page, 0, MULTI_SELECT_COLUMN)
  await page.keyboard.press("F2")
  const select = page.locator('select[data-bc-grid-editor-input="true"]').first()
  await select.selectOption(["vip", "manual-review"])
  await page.keyboard.press("Enter")

  await expect(select).toBeAttached()
  await expect(select).toHaveAttribute("aria-invalid", "true")

  const alert = page.locator('[data-bc-grid-alert="true"]').first()
  await expect(alert).toContainText(/VIP and Manual Review/i)
})
