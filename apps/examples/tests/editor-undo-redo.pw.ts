import { expect, test } from "@playwright/test"

/**
 * `Cmd/Ctrl+Z` undo + `Cmd+Shift+Z` / `Ctrl+Y` redo on the focused
 * row. v0.6 §1 (`v06-editor-cell-undo-redo`). Recipe doc:
 * `docs/recipes/editor-undo-redo.md`.
 *
 * Three scenarios:
 *   1. **Undo restores the previous committed value.**
 *   2. **Redo re-applies the undone value.**
 *   3. **A new commit clears the redo stack** (subsequent redo
 *      gesture has nothing to apply).
 *
 * Stubs are `test.skip` pending an example-app fixture exposing an
 * editable cell with a known starting value. Coordinator: unskip
 * once the demo is wired (use the existing edit-grid demo route).
 */

const URL = "/?edit=1"

test.skip("Cmd+Z restores the previous committed value on the focused row", async ({ page }) => {
  await page.goto(URL)

  const cell = page
    .locator('.bc-grid-row[data-row-index="0"] .bc-grid-cell[data-column-id="tradingName"]')
    .first()
  const before = await cell.textContent()

  // Edit the cell and commit a new value.
  await cell.dblclick()
  await page.keyboard.press("Control+a")
  await page.keyboard.type("Replaced Name")
  await page.keyboard.press("Tab")

  await expect(cell).toContainText("Replaced Name")

  // Press Cmd/Ctrl+Z on the focused row → undo.
  await page.locator('[role="grid"]').first().focus()
  await page.keyboard.press("Meta+z")

  await expect(cell).toContainText(before ?? "")
})

test.skip("Cmd+Shift+Z (or Ctrl+Y) re-applies the undone value", async ({ page }) => {
  await page.goto(URL)

  const cell = page
    .locator('.bc-grid-row[data-row-index="0"] .bc-grid-cell[data-column-id="tradingName"]')
    .first()
  await cell.dblclick()
  await page.keyboard.press("Control+a")
  await page.keyboard.type("Replaced Name")
  await page.keyboard.press("Tab")

  await page.locator('[role="grid"]').first().focus()
  await page.keyboard.press("Meta+z") // undo
  await page.keyboard.press("Meta+Shift+z") // redo

  await expect(cell).toContainText("Replaced Name")
})

test.skip("a new commit clears the redo stack — subsequent redo is a no-op", async ({ page }) => {
  await page.goto(URL)

  const cell = page
    .locator('.bc-grid-row[data-row-index="0"] .bc-grid-cell[data-column-id="tradingName"]')
    .first()
  await cell.dblclick()
  await page.keyboard.press("Control+a")
  await page.keyboard.type("First Edit")
  await page.keyboard.press("Tab")

  await page.locator('[role="grid"]').first().focus()
  await page.keyboard.press("Meta+z") // undo "First Edit"

  // New commit — invalidates the redo stack.
  await cell.dblclick()
  await page.keyboard.press("Control+a")
  await page.keyboard.type("Second Edit")
  await page.keyboard.press("Tab")

  await page.locator('[role="grid"]').first().focus()
  await page.keyboard.press("Meta+Shift+z") // redo — should NOT bring back "First Edit"

  await expect(cell).toContainText("Second Edit")
})
