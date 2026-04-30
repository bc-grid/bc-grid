import { type Page, expect, test } from "@playwright/test"

const DISABLED_URL = "/?disabled=1"
const DISABLED_EDIT_URL = "/?edit=1&disabled=1"
const DISABLED_CHECKBOX_URL = "/?checkbox=1&disabled=1"
const DISABLED_ROW_ID = "AR-00005"
const DISABLED_ROW_INDEX = 4

function grid(page: Page) {
  return page.getByRole("grid", { name: "Accounts receivable customer ledger" })
}

function row(page: Page, index: number) {
  return page.locator(`.bc-grid-row[data-row-index="${index}"]`).first()
}

function disabledRow(page: Page) {
  return page.locator(`.bc-grid-row[data-row-id="${DISABLED_ROW_ID}"]`).first()
}

async function focusBodyCell(page: Page, rowIndex: number, columnId: string) {
  const cell = page
    .locator(
      `.bc-grid-row[data-row-index="${rowIndex}"] .bc-grid-cell[data-column-id="${columnId}"]`,
    )
    .first()
  await cell.click({ force: true })
  await grid(page).focus()
  return cell
}

test("disabled rows expose ARIA/class state and remain focusable", async ({ page }) => {
  await page.goto(DISABLED_URL)

  const targetRow = disabledRow(page)
  await expect(targetRow).toHaveAttribute("aria-disabled", "true")
  await expect(targetRow).toHaveClass(/bc-grid-row-disabled/)

  await targetRow.click({ force: true })
  await expect(targetRow).not.toHaveAttribute("aria-selected", "true")
  await expect(targetRow).not.toHaveClass(/bc-grid-row-selected/)

  const activeCell = await focusBodyCell(page, DISABLED_ROW_INDEX, "account")
  await expect(activeCell).toHaveAttribute("data-bc-grid-active-cell", "true")
})

test("disabled rows ignore mouse, keyboard, and range selection gestures", async ({ page }) => {
  await page.goto(DISABLED_URL)

  const targetRow = disabledRow(page)
  await focusBodyCell(page, DISABLED_ROW_INDEX, "account")
  await page.keyboard.press("Space")
  await expect(targetRow).not.toHaveAttribute("aria-selected", "true")

  await row(page, 3).click()
  await row(page, 5).click({ modifiers: ["Shift"] })

  await expect(row(page, 3)).toHaveAttribute("aria-selected", "true")
  await expect(targetRow).not.toHaveAttribute("aria-selected", "true")
  await expect(row(page, 5)).toHaveAttribute("aria-selected", "true")
})

test("checkbox selection skips disabled rows", async ({ page }) => {
  await page.goto(DISABLED_CHECKBOX_URL)

  const targetRow = disabledRow(page)
  await expect(
    targetRow.locator(`[data-bc-grid-selection-row="${DISABLED_ROW_ID}"]`),
  ).toBeDisabled()

  await page.getByLabel("Select all rows on this page").check()

  await expect(row(page, 0)).toHaveAttribute("aria-selected", "true")
  await expect(targetRow).not.toHaveAttribute("aria-selected", "true")
})

test("disabled editable rows do not activate cell editors", async ({ page }) => {
  await page.goto(DISABLED_EDIT_URL)
  const cell = await focusBodyCell(page, DISABLED_ROW_INDEX, "tradingName")

  await page.keyboard.press("F2")
  await expect(page.locator('[data-bc-grid-editor-input="true"]')).toHaveCount(0)

  await cell.dblclick({ force: true })
  await expect(page.locator('[data-bc-grid-editor-input="true"]')).toHaveCount(0)
})
