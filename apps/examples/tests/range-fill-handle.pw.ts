import { type Page, expect, test } from "@playwright/test"

/**
 * Worker note: do not run this Playwright spec locally from worker
 * checkouts. Coordinator/CI owns browser execution for `.pw.ts` files.
 */

const URL = "/?edit=1"
const EDITABLE_TEXT_COLUMN = "tradingName"

async function focusBodyCell(page: Page, rowIndex: number, columnId: string) {
  const cell = bodyCell(page, rowIndex, columnId)
  await cell.click()
  await page.locator('[role="grid"]').first().focus()
  return cell
}

function bodyCell(page: Page, rowIndex: number, columnId: string) {
  return page
    .locator(
      `.bc-grid-row[data-row-index="${rowIndex}"] .bc-grid-cell[data-column-id="${columnId}"]`,
    )
    .first()
}

async function selectSingleCellRange(page: Page, rowIndex: number, columnId: string) {
  await focusBodyCell(page, rowIndex, columnId)
  await page.keyboard.press("Shift+ArrowDown")
  await expect(page.locator(".bc-grid-fill-handle").first()).toBeVisible()
  await page.keyboard.press("Shift+ArrowUp")
  await expect(page.locator(".bc-grid-fill-handle").first()).toBeVisible()
}

async function dragFillHandleToCell(page: Page, rowIndex: number, columnId: string) {
  const handle = page.locator(".bc-grid-fill-handle").first()
  const target = bodyCell(page, rowIndex, columnId)
  await expect(handle).toBeVisible()
  await expect(target).toBeVisible()

  const handleBox = await handle.boundingBox()
  const targetBox = await target.boundingBox()
  if (!handleBox || !targetBox) throw new Error("Expected fill handle and target cell boxes")

  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, {
    steps: 8,
  })
  await page.mouse.up()
}

test("fill handle repeats a single source cell down the target rows", async ({ page }) => {
  await page.goto(URL)
  const source = await focusBodyCell(page, 0, EDITABLE_TEXT_COLUMN)
  const sourceText = (await source.textContent())?.trim() ?? ""

  await selectSingleCellRange(page, 0, EDITABLE_TEXT_COLUMN)
  await dragFillHandleToCell(page, 3, EDITABLE_TEXT_COLUMN)

  await expect(bodyCell(page, 1, EDITABLE_TEXT_COLUMN)).toContainText(sourceText)
  await expect(bodyCell(page, 2, EDITABLE_TEXT_COLUMN)).toContainText(sourceText)
  await expect(bodyCell(page, 3, EDITABLE_TEXT_COLUMN)).toContainText(sourceText)
})

test("fill handle repeats a multi-cell horizontal source across editable targets", async ({
  page,
}) => {
  await page.goto(URL)
  const source = await focusBodyCell(page, 0, EDITABLE_TEXT_COLUMN)
  const sourceText = (await source.textContent())?.trim() ?? ""
  await page.keyboard.press("Shift+ArrowRight")
  await expect(page.locator(".bc-grid-fill-handle").first()).toBeVisible()

  await dragFillHandleToCell(page, 0, "owner")

  await expect(bodyCell(page, 0, "owner")).toContainText(sourceText)
})

test("fill handle repeats a multi-cell vertical source down the column", async ({ page }) => {
  await page.goto(URL)
  const first = await focusBodyCell(page, 0, EDITABLE_TEXT_COLUMN)
  const firstText = (await first.textContent())?.trim() ?? ""
  const secondText = (await bodyCell(page, 1, EDITABLE_TEXT_COLUMN).textContent())?.trim() ?? ""
  await page.keyboard.press("Shift+ArrowDown")
  await expect(page.locator(".bc-grid-fill-handle").first()).toBeVisible()

  await dragFillHandleToCell(page, 4, EDITABLE_TEXT_COLUMN)

  await expect(bodyCell(page, 2, EDITABLE_TEXT_COLUMN)).toContainText(firstText)
  await expect(bodyCell(page, 3, EDITABLE_TEXT_COLUMN)).toContainText(secondText)
  await expect(bodyCell(page, 4, EDITABLE_TEXT_COLUMN)).toContainText(firstText)
})

test("fill handle skips non-editable cells and applies editable cells", async ({ page }) => {
  await page.goto(URL)
  const source = await focusBodyCell(page, 0, EDITABLE_TEXT_COLUMN)
  const sourceText = (await source.textContent())?.trim() ?? ""
  const originalRegion = (await bodyCell(page, 0, "region").textContent())?.trim() ?? ""

  await selectSingleCellRange(page, 0, EDITABLE_TEXT_COLUMN)
  await dragFillHandleToCell(page, 0, "owner")

  await expect(bodyCell(page, 0, "region")).toContainText(originalRegion)
  await expect(bodyCell(page, 0, "owner")).toContainText(sourceText)
})
