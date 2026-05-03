import { type Page, expect, test } from "@playwright/test"

/**
 * `editor-datetime` (`kind: "datetime"`) from `@bc-grid/editors`. The
 * `nextScheduledCall` column on the demo is wired with `cellEditor:
 * datetimeEditor` + a `validate` that bounds shape to YYYY-MM-DDTHH:mm.
 *
 * Tests assert the editor-specific behaviour:
 *   - `data-bc-grid-editor-kind="datetime"` discriminator
 *   - `<input type="datetime-local">` (browser-native combined picker)
 *   - existing cell value normalised to YYYY-MM-DDTHH:mm
 *   - commit persists new datetime to cell display
 *   - validate rejects malformed input
 */

const URL = "/?edit=1"
const DATETIME_COLUMN = "nextScheduledCall"

async function focusBodyCell(page: Page, rowIndex: number, columnId: string) {
  // nextScheduledCall is the rightmost column — scroll the body all the
  // way right so the virtualizer renders cells in this column.
  await page.evaluate(() => {
    const scroller = document.querySelector<HTMLElement>(".bc-grid .bc-grid-viewport")
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

test("datetimeEditor input carries data-bc-grid-editor-kind='datetime' and type='datetime-local'", async ({
  page,
}) => {
  await page.goto(URL)
  await focusBodyCell(page, 0, DATETIME_COLUMN)
  await page.keyboard.press("F2")
  const input = page.locator('input[data-bc-grid-editor-input="true"]').first()
  await expect(input).toHaveAttribute("data-bc-grid-editor-kind", "datetime")
  await expect(input).toHaveAttribute("type", "datetime-local")
})

test("editor mounts with the existing cell value normalised to YYYY-MM-DDTHH:mm", async ({
  page,
}) => {
  await page.goto(URL)
  await focusBodyCell(page, 0, DATETIME_COLUMN)
  await page.keyboard.press("F2")
  const input = page.locator('input[data-bc-grid-editor-input="true"]').first()
  const value = await input.inputValue()
  expect(value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
})

test("commit persists the new datetime to the cell display", async ({ page }) => {
  await page.goto(URL)
  await focusBodyCell(page, 0, DATETIME_COLUMN)
  await page.keyboard.press("F2")
  const input = page.locator('input[data-bc-grid-editor-input="true"]').first()
  await input.fill("2027-08-12T14:30")
  await page.keyboard.press("Enter")

  await expect(page.locator('input[data-bc-grid-editor-input="true"]')).toHaveCount(0)

  const cell = page
    .locator(`.bc-grid-row[data-row-index="0"] .bc-grid-cell[data-column-id="${DATETIME_COLUMN}"]`)
    .first()
  // Display formatting depends on the column.format default; we just
  // assert the year survives any locale / format pipeline.
  await expect(cell).toContainText("2027")
})

test("validate rejects malformed datetime", async ({ page }) => {
  await page.goto(URL)
  await focusBodyCell(page, 0, DATETIME_COLUMN)
  await page.keyboard.press("F2")
  const input = page.locator('input[data-bc-grid-editor-input="true"]').first()
  // Clear to empty — validator rejects (no datetime supplied).
  await input.fill("")
  await page.keyboard.press("Enter")

  await expect(input).toBeAttached()
  await expect(input).toHaveAttribute("aria-invalid", "true")
})

test("datetimeEditor mounts in-cell (in-cell-editor-mode-rfc §4 hybrid: native picker is OS-chrome)", async ({
  page,
}) => {
  // Same rationale as the dateEditor in-cell pin: the native
  // datetime-local picker is OS-chrome and unreachable to bc-grid's
  // `data-bc-grid-editor-portal` markings, so default `popup: false`
  // mounts the trigger inline inside the cell DOM. Worker3 PR (b)
  // per `docs/coordination/handoff-worker3.md`.
  await page.goto(URL)
  await focusBodyCell(page, 0, DATETIME_COLUMN)
  await page.keyboard.press("F2")
  const wrapper = page.locator("[data-bc-grid-editor-mount]").first()
  await expect(wrapper).toBeAttached()
  await expect(wrapper).toHaveAttribute("data-bc-grid-editor-mount", "in-cell")
  const cellHostsWrapper = await wrapper.evaluate(
    (el) => el.closest("[data-column-id]")?.getAttribute("data-column-id") ?? null,
  )
  expect(cellHostsWrapper).toBe(DATETIME_COLUMN)
})
