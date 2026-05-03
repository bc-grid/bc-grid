import { expect, test } from "@playwright/test"

/**
 * Paste-into-cell format detection on number + date editors. v0.6 §1
 * (`v06-editor-paste-into-cell-detection`). Recipe doc:
 * `docs/recipes/editor-paste-detection.md`.
 *
 * Three scenarios:
 *   1. **Currency paste into number editor** — paste "$1,234.56",
 *      assert input shows "1234.56" before commit.
 *   2. **Parens-negative paste** — paste "(500)", assert input
 *      shows "-500".
 *   3. **RFC date paste into date editor** — paste "May 4, 2026",
 *      assert input value is "2026-05-04".
 *
 * Stubs are `test.skip` pending an example-app fixture exposing
 * editable number + date columns. Coordinator: unskip once fixture
 * lands. Playwright's clipboard API is used to seed the paste.
 */

const URL = "/?edit=1"

test.skip("paste '$1,234.56' into number editor → input shows '1234.56'", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"])
  await page.goto(URL)

  const cell = page
    .locator('.bc-grid-row[data-row-index="0"] .bc-grid-cell[data-column-id="amount"]')
    .first()
  await cell.dblclick()

  // Seed clipboard + paste.
  await page.evaluate(() => navigator.clipboard.writeText("$1,234.56"))
  const input = page.locator("[data-bc-grid-editor-kind='number']").first()
  await input.focus()
  await page.keyboard.press("Control+a")
  await page.keyboard.press("Control+v")

  await expect(input).toHaveValue("1234.56")
})

test.skip("paste '(500)' into number editor → input shows '-500' (accounting parens)", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"])
  await page.goto(URL)

  const cell = page
    .locator('.bc-grid-row[data-row-index="0"] .bc-grid-cell[data-column-id="amount"]')
    .first()
  await cell.dblclick()

  await page.evaluate(() => navigator.clipboard.writeText("(500)"))
  const input = page.locator("[data-bc-grid-editor-kind='number']").first()
  await input.focus()
  await page.keyboard.press("Control+a")
  await page.keyboard.press("Control+v")

  await expect(input).toHaveValue("-500")
})

test.skip("paste 'May 4, 2026' into date editor → input value '2026-05-04'", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"])
  await page.goto(URL)

  const cell = page
    .locator('.bc-grid-row[data-row-index="0"] .bc-grid-cell[data-column-id="lastInvoice"]')
    .first()
  await cell.dblclick()

  await page.evaluate(() => navigator.clipboard.writeText("May 4, 2026"))
  const input = page.locator("[data-bc-grid-editor-kind='date']").first()
  await input.focus()
  await page.keyboard.press("Control+v")

  await expect(input).toHaveValue("2026-05-04")
})
