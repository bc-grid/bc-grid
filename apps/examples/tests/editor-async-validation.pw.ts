import { expect, test } from "@playwright/test"

/**
 * Async `column.validate` returning Promise<BcValidationResult> +
 * AbortSignal cancellation. v0.6 §1
 * (`v06-editor-async-validation`). Recipe doc:
 * `docs/recipes/async-validation.md`.
 *
 * Three scenarios:
 *   1. **Pending visual state** — start an edit on a column with an
 *      async validator, commit; assert the wrapper carries
 *      `data-bc-grid-edit-state="pending"` while the validator's
 *      promise is in flight.
 *   2. **Resolves with valid: true** — validator resolves true; assert
 *      the cell commits and the editor unmounts.
 *   3. **AbortSignal cancels stale commits** — start commit A,
 *      supersede with commit B; assert validator A's signal aborted
 *      and only B's result triggers a state transition.
 *
 * Stubs are `test.skip` pending an example-app fixture exposing an
 * editable cell wired with an async validator + a fetch-mock. The
 * fixture should expose `__bcValidatorCalls` on window so the test
 * can assert how many times the validator fired and which signals
 * aborted.
 */

const URL = "/?async-validate=1"

test.skip("data-bc-grid-edit-state='pending' surfaces during async validation", async ({
  page,
}) => {
  await page.goto(URL)

  const cell = page
    .locator('.bc-grid-row[data-row-index="0"] .bc-grid-cell[data-column-id="customerCode"]')
    .first()
  await cell.dblclick()
  await page.keyboard.press("Control+a")
  await page.keyboard.type("NEW-CODE")
  await page.keyboard.press("Tab")

  // Wrapper carries the pending attribute while the validator's
  // Promise is in flight.
  const wrapper = page.locator("[data-bc-grid-edit-state='pending']").first()
  await expect(wrapper).toBeAttached()
})

test.skip("validator resolving { valid: true } commits the cell", async ({ page }) => {
  await page.goto(URL)

  const cell = page
    .locator('.bc-grid-row[data-row-index="0"] .bc-grid-cell[data-column-id="customerCode"]')
    .first()
  await cell.dblclick()
  await page.keyboard.press("Control+a")
  await page.keyboard.type("VALID-CODE")
  await page.keyboard.press("Tab")

  // Wait for the async validator to resolve.
  await expect(page.locator("[data-bc-grid-edit-state='pending']")).toHaveCount(0, {
    timeout: 2000,
  })
  // Editor portal unmounts on commit.
  await expect(page.locator("[data-bc-grid-editor-input='true']")).toHaveCount(0)
  // Cell now reflects the new value.
  await expect(cell).toContainText("VALID-CODE")
})

test.skip("supersedure aborts the in-flight validator's AbortSignal", async ({ page }) => {
  await page.goto(URL)

  // Reset validator-tracking shim.
  await page.evaluate(() => {
    window.__bcValidatorCalls = []
  })

  const cell = page
    .locator('.bc-grid-row[data-row-index="0"] .bc-grid-cell[data-column-id="customerCode"]')
    .first()
  await cell.dblclick()
  await page.keyboard.press("Control+a")
  await page.keyboard.type("FIRST")
  await page.keyboard.press("Tab")

  // Immediately re-edit the cell before the first validator's
  // Promise resolves.
  await cell.dblclick()
  await page.keyboard.press("Control+a")
  await page.keyboard.type("SECOND")
  await page.keyboard.press("Tab")

  // Both validator calls fired; the first one's signal aborted.
  const calls = await page.evaluate(() => window.__bcValidatorCalls as { aborted: boolean }[])
  expect(calls.length).toBe(2)
  expect(calls[0].aborted).toBe(true)
  expect(calls[1].aborted).toBe(false)
})

declare global {
  interface Window {
    __bcValidatorCalls?: { aborted: boolean }[]
  }
}
