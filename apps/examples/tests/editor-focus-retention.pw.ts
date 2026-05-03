import { expect, test } from "@playwright/test"

/**
 * Editor focus survives grid re-renders for unrelated reasons. v0.6
 * §1 (`v06-editor-focus-retention-on-rerender`), follow-up to the
 * bsncraft 0.5.0 GA P0 fix #451. Recipe doc:
 * `docs/recipes/editor-focus-retention.md`.
 *
 * Two scenarios:
 *   1. **Data prop swap** — start an edit, swap the `data` prop with
 *      the same rowIds (e.g. via a server re-fetch), assert focus
 *      stays on the input.
 *   2. **Unrelated parent state change** — start an edit, toggle a
 *      sibling chrome element (toast, sidebar) that triggers parent
 *      re-render, assert focus stays on the input.
 *
 * Stubs are `test.skip` pending an example-app fixture exposing the
 * data-swap + unrelated-state-toggle controls. Coordinator: unskip
 * once the fixture lands.
 */

const URL = "/?focus-retention=1"

test.skip("editor input retains focus across data prop swap", async ({ page }) => {
  await page.goto(URL)

  const cell = page
    .locator('.bc-grid-row[data-row-index="0"] .bc-grid-cell[data-column-id="tradingName"]')
    .first()
  await cell.dblclick()

  const input = page.locator('[data-bc-grid-editor-input="true"]').first()
  await expect(input).toBeFocused()

  // Trigger a data swap (fixture: button that re-fetches the same
  // rowset with new object identities). Without the bsncraft #451
  // fix, this would unmount the editor + drop focus.
  await page.locator('[data-testid="trigger-data-swap"]').click()

  await expect(input).toBeFocused()
})

test.skip("editor input retains focus across unrelated parent re-render", async ({ page }) => {
  await page.goto(URL)

  const cell = page
    .locator('.bc-grid-row[data-row-index="0"] .bc-grid-cell[data-column-id="tradingName"]')
    .first()
  await cell.dblclick()

  const input = page.locator('[data-bc-grid-editor-input="true"]').first()
  await expect(input).toBeFocused()

  // Toggle a sibling chrome element — sidebar / toast / panel —
  // that forces the parent component to re-render. The editor is
  // not the target of the change but rides through the re-render.
  await page.locator('[data-testid="toggle-sidebar"]').click()

  await expect(input).toBeFocused()
})
