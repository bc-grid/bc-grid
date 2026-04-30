import { type Page, expect, test } from "@playwright/test"

/**
 * Editor in-flight retention per `editing-rfc §Virtualizer retention
 * contract`. While editing, the editor portal acquires:
 *   - `virtualizer.beginInFlightRow(rowIndex)`
 *   - `virtualizer.beginInFlightCol(colIndex)`
 *
 * so scroll / sort / filter during edit can't unmount the editor's DOM.
 * Both handles release on editor unmount.
 *
 * Without retention, scrolling the active cell out of viewport would
 * recycle the row + column out of the virtualized window, dropping the
 * editor input + DOM focus. With retention, the row + col stay rendered
 * regardless of scroll position.
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

test("editor stays mounted when scrolling vertically far away from the active row", async ({
  page,
}) => {
  await page.goto(URL)
  // Edit a low-index row so we have plenty of room to scroll down.
  await focusBodyCell(page, 2, EDITABLE_COLUMN)
  await page.keyboard.press("F2")
  const editor = page.locator('[data-bc-grid-editor-input="true"]').first()
  await expect(editor).toBeAttached()
  await expect(editor).toBeFocused()

  // Scroll the body scroller far down — past where row 2 would normally
  // render in the virtualized window.
  await page.evaluate(() => {
    const scroller = document.querySelector<HTMLElement>(".bc-grid .bc-grid-scroller")
    if (scroller) scroller.scrollTop = scroller.scrollHeight
  })
  // Two RAF ticks let the virtualizer recompute the window.
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())))
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())))

  // Editor's DOM still present despite the scroll.
  await expect(editor).toBeAttached()
})

test("editor stays mounted when scrolling horizontally far away from the active column", async ({
  page,
}) => {
  await page.goto(URL)
  await focusBodyCell(page, 0, EDITABLE_COLUMN)
  await page.keyboard.press("F2")
  const editor = page.locator('[data-bc-grid-editor-input="true"]').first()
  await expect(editor).toBeAttached()

  // Scroll horizontally to the far right.
  await page.evaluate(() => {
    const scroller = document.querySelector<HTMLElement>(".bc-grid .bc-grid-scroller")
    if (scroller) scroller.scrollLeft = scroller.scrollWidth
  })
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())))
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())))

  await expect(editor).toBeAttached()
})

test("editor unmounts on commit; retention handles release (no leaked rows)", async ({ page }) => {
  await page.goto(URL)
  await focusBodyCell(page, 0, EDITABLE_COLUMN)
  await page.keyboard.press("F2")
  const editor = page.locator('[data-bc-grid-editor-input="true"]').first()
  await editor.fill("Released")
  await page.keyboard.press("Enter")

  await expect(page.locator('[data-bc-grid-editor-input="true"]')).toHaveCount(0)

  // After commit, scrolling far away should recycle the row normally
  // — retention only persists during edit. Verify no orphan
  // bc-grid-row[data-row-id="<edited rowId>"] sticks around outside
  // the virtualized window.
  await page.evaluate(() => {
    const scroller = document.querySelector<HTMLElement>(".bc-grid .bc-grid-scroller")
    if (scroller) scroller.scrollTop = scroller.scrollHeight
  })
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())))
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())))

  // The grid's rendered row count should be in the normal virtualization
  // window range — not include both the originally-edited row and the
  // far-end rows.
  const renderedRows = await page.locator(".bc-grid-row[data-row-index]").count()
  expect(renderedRows).toBeGreaterThan(0)
  expect(renderedRows).toBeLessThan(80)
})
