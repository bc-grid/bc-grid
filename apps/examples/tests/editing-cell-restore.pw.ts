import { expect, test } from "@playwright/test"

/**
 * `editingCell` one-time-restore prop + `onEditingCellChange`
 * change callback (v0.6 §1 `v06-editing-state-controlled-prop`).
 * Companion to `initialScrollOffset` for the "grid looks exactly
 * as the user left it" persistence story. Recipe doc:
 * `docs/recipes/grid-state-persistence.md` §Editing cell.
 *
 * Three scenarios:
 *   1. **Round-trip** — start an edit, navigate away, navigate
 *      back; assert the editor restored on the same cell.
 *   2. **onEditingCellChange fires** — start an edit, assert
 *      callback fires with cell position; commit, assert it fires
 *      with null.
 *   3. **Restore is a no-op for unknown rowId** — set editingCell
 *      to a cell whose row hasn't loaded; assert no editor mounts;
 *      assert apiRef.startEdit can re-trigger once data lands.
 *
 * Stubs are `test.skip` pending an example-app fixture exposing
 * `editingCell` + `onEditingCellChange` wired against
 * sessionStorage. Coordinator: unskip once fixture lands.
 */

const URL = "/?editing-cell=1"

test.skip("editing cell round-trips via editingCell + onEditingCellChange", async ({ page }) => {
  await page.goto(URL)

  const cell = page
    .locator('.bc-grid-row[data-row-index="0"] .bc-grid-cell[data-column-id="tradingName"]')
    .first()
  await cell.dblclick()

  // Editor mounted on row 0 / tradingName cell.
  await expect(page.locator("[data-bc-grid-editor-input='true']").first()).toBeAttached()

  // Wait for the persistence callback to flush (next tick).
  await page.waitForTimeout(50)

  // Navigate away + back. The fixture's persistence handler should
  // have written sessionStorage with the editing cell; the second
  // mount restores via editingCell.
  await page.goto("about:blank")
  await page.goto(URL)

  // Editor should be restored on the same cell.
  await expect(page.locator("[data-bc-grid-editor-input='true']").first()).toBeAttached()
  const restoredCell = page
    .locator('.bc-grid-row[data-row-index="0"] .bc-grid-cell[data-column-id="tradingName"]')
    .first()
  await expect(restoredCell).toBeAttached()
})

test.skip("onEditingCellChange fires on enter + leave edit mode", async ({ page }) => {
  await page.goto(URL)

  await page.evaluate(() => {
    window.__bcEditingCellChanges = []
  })

  const cell = page
    .locator('.bc-grid-row[data-row-index="0"] .bc-grid-cell[data-column-id="tradingName"]')
    .first()
  await cell.dblclick()

  // First fire: enter edit mode (next is non-null).
  await page.waitForTimeout(50)
  let changes = await page.evaluate(() => window.__bcEditingCellChanges as Array<{ next: unknown }>)
  expect(changes.length).toBeGreaterThanOrEqual(1)
  expect(changes[changes.length - 1].next).not.toBeNull()

  // Press Esc to cancel — leaves edit mode (next is null).
  await page.keyboard.press("Escape")
  await page.waitForTimeout(50)
  changes = await page.evaluate(() => window.__bcEditingCellChanges as Array<{ next: unknown }>)
  expect(changes[changes.length - 1].next).toBeNull()
})

test.skip("editingCell restore is a no-op for unknown rowId", async ({ page }) => {
  // Fixture wires editingCell to a rowId that doesn't exist in the
  // initial data. The grid should NOT mount an editor on a phantom
  // cell. Pin the no-op so a refactor that stops gating on
  // rowEntry.kind === "data" doesn't silently break.
  await page.goto(`${URL}&editing-row=missing`)

  await page.waitForTimeout(100)
  await expect(page.locator("[data-bc-grid-editor-input='true']")).toHaveCount(0)
})

declare global {
  interface Window {
    __bcEditingCellChanges?: Array<{ next: unknown; prev: unknown }>
  }
}
