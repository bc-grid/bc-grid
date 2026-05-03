import { expect, test } from "@playwright/test"

/**
 * `createTextEditor({ inputComponent })` render-prop slot — the
 * consumer's component renders WHERE the built-in `<input>` would,
 * and the framework's commit lifecycle reads through it. v0.6 §1
 * (`v06-shadcn-native-editors`, bsncraft P2 #17). Recipe doc:
 * `docs/recipes/shadcn-editors.md`.
 *
 * Three scenarios:
 *   1. **Custom inputComponent mounts** — wire a shadcn-styled
 *      Input via the factory, assert the cell editor renders the
 *      consumer's wrapper.
 *   2. **Commit reads through** — type into the consumer's input,
 *      Tab to commit, assert the cell renders the new value.
 *   3. **data-bc-grid-editor-input is preserved** — assert the
 *      consumer's input still carries the load-bearing data attr
 *      so the framework's click-outside / Tab paths reach it.
 *
 * Stubs are `test.skip` pending an example-app fixture exposing a
 * column wired with `createTextEditor({ inputComponent: ShadcnInput })`.
 * Coordinator: unskip once fixture lands.
 */

const URL = "/?shadcn-editors=1"

test.skip("custom inputComponent mounts when factory is wired", async ({ page }) => {
  await page.goto(URL)

  const cell = page
    .locator('.bc-grid-row[data-row-index="0"] .bc-grid-cell[data-column-id="name"]')
    .first()
  await cell.dblclick()

  // The consumer's wrapper stamps a known marker class. Assert it
  // appears (proves the render-prop replaced the built-in <input>).
  await expect(page.locator(".shadcn-editor-input").first()).toBeAttached()
})

test.skip("commit path reads through the consumer's component (typed value persists)", async ({
  page,
}) => {
  await page.goto(URL)

  const cell = page
    .locator('.bc-grid-row[data-row-index="0"] .bc-grid-cell[data-column-id="name"]')
    .first()
  await cell.dblclick()

  const input = page.locator(".shadcn-editor-input").first()
  await input.focus()
  await page.keyboard.press("Control+a")
  await page.keyboard.type("New Name")
  await page.keyboard.press("Tab")

  await expect(cell).toContainText("New Name")
})

test.skip("data-bc-grid-editor-input attribute is preserved on the consumer's input", async ({
  page,
}) => {
  await page.goto(URL)

  const cell = page
    .locator('.bc-grid-row[data-row-index="0"] .bc-grid-cell[data-column-id="name"]')
    .first()
  await cell.dblclick()

  // The framework's commit path locates the active input via this
  // attribute. Pin its presence so a regression in the consumer's
  // wrapper (forgetting to spread {...props}) catches in CI.
  await expect(page.locator("[data-bc-grid-editor-input='true']").first()).toBeAttached()
  await expect(page.locator("[data-bc-grid-editor-kind='text']").first()).toBeAttached()
})
