import { expect, test } from "@playwright/test"

/**
 * `<BcServerGrid>` actions-column auto-injection (v0.6 §1
 * `v06-server-grid-actions-column`, bsncraft P1). Recipe doc:
 * `docs/recipes/server-grid-actions.md`.
 *
 * Three scenarios:
 *   1. **Column appears** — wire `onEdit` / `onDelete` on a server-paged
 *      demo grid; assert the pinned-right `__bc_actions` column renders.
 *   2. **Edit fires** — click the Edit button; assert the consumer's
 *      handler ran with the row.
 *   3. **Discard surfaces only when row is dirty** — make a cell
 *      uncommitted; assert the Discard button appears; commit; assert
 *      it disappears.
 *
 * Stubs are `test.skip` pending an example-app fixture wiring
 * `<BcServerGrid>` with the actions handlers. Coordinator: unskip
 * once the demo route lands.
 */

const URL = "/?server-actions=1"

test.skip("server grid auto-injects actions column when onEdit / onDelete is wired", async ({
  page,
}) => {
  await page.goto(URL)

  const actionsColumn = page.locator('.bc-grid-cell[data-column-id="__bc_actions"]').first()
  await expect(actionsColumn).toBeVisible()

  // Both built-ins should render.
  const editButton = actionsColumn.locator('[data-bc-grid-action="true"]', { hasText: "Edit" })
  const deleteButton = actionsColumn.locator('[data-bc-grid-action="true"]', { hasText: "Delete" })
  await expect(editButton).toBeVisible()
  await expect(deleteButton).toBeVisible()
})

test.skip("Edit click fires consumer handler with the row", async ({ page }) => {
  await page.goto(URL)

  // Fixture exposes a counter incremented by onEdit.
  await page.evaluate(() => {
    window.__bcEditCount = 0
  })

  const editButton = page
    .locator('.bc-grid-row[data-row-index="0"] [data-bc-grid-action="true"]', { hasText: "Edit" })
    .first()
  await editButton.click()

  const count = await page.evaluate(() => window.__bcEditCount as number)
  expect(count).toBe(1)
})

test.skip("Discard appears only when the row has uncommitted edits", async ({ page }) => {
  await page.goto(URL)

  const row0 = page.locator('.bc-grid-row[data-row-index="0"]').first()
  const discard = row0.locator('[data-bc-grid-action="true"]', { hasText: "Discard" })

  // Initially clean → no Discard.
  await expect(discard).toHaveCount(0)

  // Edit a cell to make the row dirty.
  const cell = row0.locator(".bc-grid-cell").nth(1)
  await cell.dblclick()
  await page.keyboard.type("Acme Updated")
  await page.keyboard.press("Tab")

  // Discard now visible.
  await expect(discard).toBeVisible()
})

declare global {
  interface Window {
    __bcEditCount?: number
  }
}
