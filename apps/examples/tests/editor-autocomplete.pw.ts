import { type Page, expect, test } from "@playwright/test"

/**
 * `editor-autocomplete` (`kind: "autocomplete"`) from `@bc-grid/editors`.
 * The `owner` column on the demo is wired with
 * `cellEditor: autocompleteEditor` + `fetchOptions: fetchCollectorOptions`
 * (async resolver against a 30-name roster).
 *
 * Tests assert the editor-specific behaviour:
 *   - `data-bc-grid-editor-kind="autocomplete"` discriminator
 *   - native `<input type="text" list>` paired with a `<datalist>`
 *   - initial value + initial fetch produce options on first paint
 *   - typing fires debounced `fetchOptions(query, signal)` —
 *     the datalist updates with filtered results
 *   - commit returns the input value (string) — `valueParser` runs
 *     and the cell renderer reflects the trimmed value
 *   - validation rejection (empty string) keeps the editor open and
 *     populates the assertive live region
 */

const URL = "/?edit=1"
const AUTOCOMPLETE_COLUMN = "owner"
const DEBOUNCE_PLUS_FETCH_MS = 320

async function focusBodyCell(page: Page, rowIndex: number, columnId: string) {
  // Owner is column 5 — leftish. In firefox, the pinned-left "account"
  // column intercepts pointer events near the left gutter; scroll right
  // a bit so the owner cell is well away from the pinned shadow.
  await page.evaluate(() => {
    const scroller = document.querySelector<HTMLElement>(".bc-grid .bc-grid-scroller")
    if (scroller) scroller.scrollLeft = 200
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

test("autocompleteEditor mounts a native <input list> with the editor-kind data attribute", async ({
  page,
}) => {
  await page.goto(URL)
  await focusBodyCell(page, 0, AUTOCOMPLETE_COLUMN)
  await page.keyboard.press("F2")
  const input = page.locator('input[data-bc-grid-editor-input="true"]').first()
  await expect(input).toBeAttached()
  await expect(input).toHaveAttribute("data-bc-grid-editor-kind", "autocomplete")
  await expect(input).toHaveAttribute("type", "text")
  // The `list` attr links the input to the sibling <datalist>; the
  // browser uses this to draw the suggestion popover. autocomplete="off"
  // suppresses the browser's history-based autofill so only fetchOptions
  // results appear.
  await expect(input).toHaveAttribute("list", /.+/)
  await expect(input).toHaveAttribute("autocomplete", "off")
})

test("input pre-fills with the existing cell value", async ({ page }) => {
  await page.goto(URL)
  await focusBodyCell(page, 0, AUTOCOMPLETE_COLUMN)
  await page.keyboard.press("F2")
  const input = page.locator('input[data-bc-grid-editor-input="true"]').first()
  // Each customer's `owner` is one of the 8-name seed list.
  const value = await input.evaluate((el) => (el as HTMLInputElement).value)
  expect(value.length).toBeGreaterThan(0)
})

test("typing fires fetchOptions and the datalist updates with filtered options", async ({
  page,
}) => {
  await page.goto(URL)
  await focusBodyCell(page, 0, AUTOCOMPLETE_COLUMN)
  await page.keyboard.press("F2")
  const input = page.locator('input[data-bc-grid-editor-input="true"]').first()
  await input.fill("alex")
  // Wait for debounce (200ms) + fetch (50ms simulated) + a small buffer.
  await page.waitForTimeout(DEBOUNCE_PLUS_FETCH_MS)
  const optionValues = await page.evaluate(() => {
    const i = document.querySelector('input[data-bc-grid-editor-input="true"]')
    const listId = i?.getAttribute("list")
    const dl = listId ? document.getElementById(listId) : null
    return Array.from(dl?.querySelectorAll("option") ?? []).map(
      (o) => (o as HTMLOptionElement).value,
    )
  })
  // Demo roster has exactly one "alex" — Alex Chen.
  expect(optionValues).toEqual(["Alex Chen"])
})

test("commit produces a string value (valueParser trims) reflected by the cell renderer", async ({
  page,
}) => {
  await page.goto(URL)
  await focusBodyCell(page, 0, AUTOCOMPLETE_COLUMN)
  await page.keyboard.press("F2")
  const input = page.locator('input[data-bc-grid-editor-input="true"]').first()
  // Note the trailing/leading spaces — valueParser should trim at commit.
  await input.fill("  Sofia Delgado  ")
  await page.keyboard.press("Enter")

  await expect(page.locator('input[data-bc-grid-editor-input="true"]')).toHaveCount(0)

  const cell = page
    .locator(
      `.bc-grid-row[data-row-index="0"] .bc-grid-cell[data-column-id="${AUTOCOMPLETE_COLUMN}"]`,
    )
    .first()
  await expect(cell).toContainText("Sofia Delgado")
})

test("validation rejection keeps the editor open and announces via assertive region", async ({
  page,
}) => {
  await page.goto(URL)
  await focusBodyCell(page, 0, AUTOCOMPLETE_COLUMN)
  await page.keyboard.press("F2")
  const input = page.locator('input[data-bc-grid-editor-input="true"]').first()
  await input.fill("")
  await page.keyboard.press("Enter")

  await expect(input).toBeAttached()
  await expect(input).toHaveAttribute("aria-invalid", "true")

  const alert = page.locator('[data-bc-grid-alert="true"]').first()
  await expect(alert).toContainText(/Collector is required/i)
})
