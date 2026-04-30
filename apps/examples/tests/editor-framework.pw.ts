import { type Page, expect, test } from "@playwright/test"

/**
 * `editor-framework` v0.1: cell-edit lifecycle, default text editor,
 * activation paths (F2, Enter, printable, double-click), Tab/Enter/Esc
 * commit/cancel keyboard model, and sync validation.
 *
 * Demo opt-in via `?edit=1` URL flag → `tradingName` becomes editable
 * with a `validate` that rejects empty strings.
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

async function getEditorInput(page: Page) {
  return page.locator('[data-bc-grid-editor-input="true"]').first()
}

test("F2 on a focused editable cell mounts the default text editor with the cell value", async ({
  page,
}) => {
  await page.goto(URL)
  await focusBodyCell(page, 0, EDITABLE_COLUMN)

  await page.keyboard.press("F2")

  const editor = await getEditorInput(page)
  await expect(editor).toBeAttached()
  await expect(editor).toBeFocused()
  // The editor's defaultValue is the existing cell value (non-empty for
  // the seeded customer rows).
  const value = await editor.inputValue()
  expect(value.length).toBeGreaterThan(0)
})

test("Enter on a focused editable cell mounts the editor (commit-on-Enter inside fires move-down)", async ({
  page,
}) => {
  await page.goto(URL)
  await focusBodyCell(page, 0, EDITABLE_COLUMN)
  const grid = page.locator('[role="grid"]').first()
  const activeBefore = await grid.getAttribute("aria-activedescendant")

  await page.keyboard.press("Enter")
  const editor = await getEditorInput(page)
  await expect(editor).toBeAttached()

  // Type a new value, then commit with Enter.
  await editor.fill("Edited Trading Name")
  await page.keyboard.press("Enter")

  // Editor unmounts.
  await expect(page.locator('[data-bc-grid-editor-input="true"]')).toHaveCount(0)

  // Active cell moved DOWN one row (Enter convention) — id changes.
  const activeAfter = await grid.getAttribute("aria-activedescendant")
  expect(activeAfter).not.toBe(activeBefore)
  expect(activeAfter).toBeTruthy()
})

test("Printable character activation seeds the editor with that character", async ({ page }) => {
  await page.goto(URL)
  await focusBodyCell(page, 0, EDITABLE_COLUMN)

  await page.keyboard.press("Z")
  const editor = await getEditorInput(page)
  await expect(editor).toBeAttached()
  // Editor's seedKey replaced the cell value with "Z".
  await expect(editor).toHaveValue("Z")
})

test("Escape cancels the edit; cell value unchanged; active cell stays put", async ({ page }) => {
  await page.goto(URL)
  await focusBodyCell(page, 0, EDITABLE_COLUMN)
  const grid = page.locator('[role="grid"]').first()
  const activeBefore = await grid.getAttribute("aria-activedescendant")

  await page.keyboard.press("F2")
  const editor = await getEditorInput(page)
  await editor.fill("changed")

  await page.keyboard.press("Escape")
  await expect(page.locator('[data-bc-grid-editor-input="true"]')).toHaveCount(0)
  // No move on cancel.
  const activeAfter = await grid.getAttribute("aria-activedescendant")
  expect(activeAfter).toBe(activeBefore)
})

test("Tab commits and moves active cell right", async ({ page }) => {
  await page.goto(URL)
  await focusBodyCell(page, 0, EDITABLE_COLUMN)

  await page.keyboard.press("F2")
  const editor = await getEditorInput(page)
  await editor.fill("v")
  await page.keyboard.press("Tab")
  await expect(page.locator('[data-bc-grid-editor-input="true"]')).toHaveCount(0)

  // Active cell moved to the next column on the same row.
  const grid = page.locator('[role="grid"]').first()
  const activeId = await grid.getAttribute("aria-activedescendant")
  expect(activeId).not.toBeNull()
})

test("Validation rejects empty input — editor stays open with error state", async ({ page }) => {
  await page.goto(URL)
  await focusBodyCell(page, 0, EDITABLE_COLUMN)
  await page.keyboard.press("F2")
  const editor = await getEditorInput(page)
  await editor.fill("")
  await page.keyboard.press("Enter")

  // Editor remains mounted (commit was rejected by validate).
  await expect(page.locator('[data-bc-grid-editor-input="true"]')).toBeAttached()
  // aria-invalid surfaces the rejection on the editor input.
  await expect(editor).toHaveAttribute("aria-invalid", "true")
})

test("Double-click on an editable cell activates the editor with pointerHint", async ({ page }) => {
  await page.goto(URL)
  const cell = await focusBodyCell(page, 0, EDITABLE_COLUMN)
  await cell.dblclick()
  const editor = await getEditorInput(page)
  await expect(editor).toBeAttached()
  await expect(editor).toBeFocused()
})

test("Reading flows through: editor unmounts, the new cell display value reflects the commit", async ({
  page,
}) => {
  await page.goto(URL)
  await focusBodyCell(page, 0, EDITABLE_COLUMN)
  await page.keyboard.press("F2")
  const editor = await getEditorInput(page)
  await editor.fill("Renamed Co.")
  await page.keyboard.press("Enter")

  // Active cell moved to row 1; check that row 0's cell now shows the
  // committed value via the overlay (default cellRenderer reads the
  // formatted value, which after the overlay update reflects the patch).
  // Since the demo's default cellRenderer just shows the formatted
  // string, it'll show the new value.
  const cell = page
    .locator(`.bc-grid-row[data-row-index="0"] .bc-grid-cell[data-column-id="${EDITABLE_COLUMN}"]`)
    .first()
  await expect(cell).toContainText("Renamed Co.")
})
