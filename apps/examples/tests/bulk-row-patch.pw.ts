import { expect, test } from "@playwright/test"

/**
 * `apiRef.applyRowPatches([...])` — atomic bulk-update primitive
 * (v0.6 §1 HEADLINE). Recipe doc: `docs/recipes/bulk-row-patch.md`.
 *
 * Two scenarios:
 *   1. **Fill down** — happy path. Patch every selected row's `status`
 *      column, assert overlay paints + cells reflect the new value.
 *   2. **Atomic reject-all-on-validation-failure** — patch one cell
 *      that fails `validate`; assert NONE of the cells changed (no
 *      partial application leak).
 *
 * Both stubs are `test.skip` pending an example-app fixture exposing
 * an "Apply bulk patch" button + a controlled `applyRowPatches` call
 * with the demo selection. Coordinator: unskip once the fixture lands
 * (see PR description for the wiring requirement).
 */

const URL = "/?edit=1"

test.skip("applyRowPatches fill-down: every selected row's status updates in one render pass", async ({
  page,
}) => {
  await page.goto(URL)

  // Fixture (TBD): a top-bar button labeled "Apply bulk patch" that
  // resolves the current selection + calls
  // `apiRef.current?.applyRowPatches(rows.map(r => ({ rowId: r.id,
  // fields: { status: "Closed" } })))`. The test selects two rows,
  // clicks the button, and asserts both rows render the new status.
  await page.locator('[data-testid="select-row-0"]').click()
  await page.locator('[data-testid="select-row-1"]').click()
  await page.locator('[data-testid="apply-bulk-patch"]').click()

  const row0Status = page
    .locator('.bc-grid-row[data-row-index="0"] .bc-grid-cell[data-column-id="status"]')
    .first()
  const row1Status = page
    .locator('.bc-grid-row[data-row-index="1"] .bc-grid-cell[data-column-id="status"]')
    .first()

  await expect(row0Status).toContainText("Closed")
  await expect(row1Status).toContainText("Closed")
})

test.skip("applyRowPatches atomic reject: one validation failure leaves every cell unchanged", async ({
  page,
}) => {
  await page.goto(URL)

  // Fixture (TBD): a "Apply invalid bulk patch" button that calls
  // `applyRowPatches` with a value that fails `validate` for one of
  // the selected rows. The test asserts: (a) the result envelope's
  // `ok: false` surfaces a toast, (b) NO row has the patched value
  // — atomic semantics.
  const row0StatusBefore = await page
    .locator('.bc-grid-row[data-row-index="0"] .bc-grid-cell[data-column-id="status"]')
    .first()
    .textContent()

  await page.locator('[data-testid="select-row-0"]').click()
  await page.locator('[data-testid="select-row-1"]').click()
  await page.locator('[data-testid="apply-invalid-bulk-patch"]').click()

  const row0StatusAfter = await page
    .locator('.bc-grid-row[data-row-index="0"] .bc-grid-cell[data-column-id="status"]')
    .first()
    .textContent()

  // Atomic gate: even though row 0's patch alone would have passed
  // validate, row 1's failure aborted the whole batch. Row 0 stayed.
  expect(row0StatusAfter).toBe(row0StatusBefore)
  await expect(page.locator('[data-testid="bulk-patch-error-toast"]')).toBeVisible()
})
