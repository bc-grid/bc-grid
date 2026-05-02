import { type Page, expect, test } from "@playwright/test"

/**
 * `editor-multi-select` (`kind: "multi-select"`) from `@bc-grid/editors`.
 * The `flags` column on the demo is wired with
 * `cellEditor: multiSelectEditor` + `options: FLAG_OPTIONS`.
 *
 * Updated 2026-05-02 after PR #372: multiSelect.tsx migrated from native
 * `<select multiple>` to the multi-mode shadcn Combobox primitive
 * (`packages/editors/src/internal/combobox.tsx` with `mode: "multi"`).
 * Tests now interact with the trigger button + chips + `role="listbox"`
 * + `role="option"` pattern. The migration carries `data-bc-grid-editor-multi="true"`
 * on the wrapper so multi-vs-single is selectable from a test attribute.
 *
 * Tests assert:
 *   - `data-bc-grid-editor-kind="multi-select"` discriminator on trigger
 *   - wrapper carries `data-bc-grid-editor-multi="true"`
 *   - listbox renders one `role="option"` per `column.options` entry
 *   - existing cell values pre-selected (options carry `data-selected="true"`;
 *     labels are checked since typed values aren't exposed in the DOM)
 *   - commit produces a `readonly TValue[]` and the cell renderer reflects
 *     the labels for every selected value
 *   - validation rejection (VIP + Manual Review combo) keeps the trigger
 *     mounted with the assertive live region populated
 */

const URL = "/?edit=1"
const MULTI_SELECT_COLUMN = "flags"
const TRIGGER_SELECTOR =
  'button[data-bc-grid-editor-input="true"][data-bc-grid-editor-kind="multi-select"]'

async function focusBodyCell(page: Page, rowIndex: number, columnId: string) {
  // Flags column is the rightmost — scroll fully right to ensure rendered.
  await page.evaluate(() => {
    const scroller = document.querySelector<HTMLElement>(".bc-grid .bc-grid-scroller")
    if (scroller) scroller.scrollLeft = scroller.scrollWidth
  })
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())))
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())))

  const cell = page
    .locator(
      `.bc-grid-row[data-row-index="${rowIndex}"] .bc-grid-cell[data-column-id="${columnId}"]`,
    )
    .first()
  await cell.click()
  await page.locator('[role="grid"]').first().focus()
  return cell
}

test("multiSelectEditor mounts a multi-mode Combobox trigger with the editor-kind data attribute", async ({
  page,
}) => {
  await page.goto(URL)
  await focusBodyCell(page, 0, MULTI_SELECT_COLUMN)
  await page.keyboard.press("F2")
  const trigger = page.locator(TRIGGER_SELECTOR).first()
  await expect(trigger).toBeAttached()
  await expect(trigger).toHaveAttribute("aria-haspopup", "listbox")
  // The wrapper around the trigger carries the multi/single discriminator
  // so consumer test selectors can assert mode without parsing kind.
  const wrapper = page.locator('[data-bc-grid-editor-multi="true"]').first()
  await expect(wrapper).toBeAttached()
})

test("editor renders one option per column.options entry", async ({ page }) => {
  await page.goto(URL)
  await focusBodyCell(page, 0, MULTI_SELECT_COLUMN)
  await page.keyboard.press("F2")
  const trigger = page.locator(TRIGGER_SELECTOR).first()
  // Combobox opens on edit-activate; the trigger exposes the option count
  // so the assertion doesn't need to wait for the listbox to paint.
  await expect(trigger).toHaveAttribute("data-bc-grid-editor-option-count", "5")
  // CustomerFlag has 5 values; demo wires all of them as options.
  const options = page.locator('[role="listbox"] [role="option"]')
  await expect(options).toHaveCount(5)
})

test("editor pre-selects every value present in the row's flags array", async ({ page }) => {
  await page.goto(URL)
  // Row 3 has `flags: ["high-volume", "tax-exempt"]` (mod 6 === 3).
  await focusBodyCell(page, 3, MULTI_SELECT_COLUMN)
  await page.keyboard.press("F2")
  // Selected options carry `data-selected="true"`. The Combobox doesn't
  // expose typed values via DOM attributes, so we assert the labels.
  // FLAG_OPTIONS labels: "high-volume" → "High Volume", "tax-exempt" → "Tax Exempt".
  const selectedLabels = (
    await page.locator('[role="listbox"] [role="option"][data-selected="true"]').allTextContents()
  ).map((s) => s.replace(/^✓\s*/, "").trim())
  expect(selectedLabels.sort()).toEqual(["High Volume", "Tax Exempt"].sort())
})

test("commit produces an array of typed values and the cell renderer reflects every value", async ({
  page,
}) => {
  await page.goto(URL)
  // Row 0: empty flags. Pick two via clicking the listbox options (multi
  // mode toggles selection on click; listbox stays open until commit).
  await focusBodyCell(page, 0, MULTI_SELECT_COLUMN)
  await page.keyboard.press("F2")
  await page
    .locator('[role="listbox"] [role="option"]')
    .filter({ hasText: "High Volume" })
    .first()
    .click()
  await page
    .locator('[role="listbox"] [role="option"]')
    .filter({ hasText: "International" })
    .first()
    .click()
  // Commit via Enter. Multi-mode Combobox no longer toggles on Enter
  // (audit P1-W3-5b — fixed in v0.5 editor bundle PR); Enter bubbles
  // straight through to the editor portal commit so the chip set the
  // user has built survives. Space remains the toggle gesture.
  await page.keyboard.press("Enter")

  // Trigger should unmount on commit.
  await expect(page.locator(TRIGGER_SELECTOR)).toHaveCount(0)

  // Tab moves focus to the next cell; flags is the rightmost column so
  // the grid auto-scrolls. Re-scroll back to make row 0's flags cell
  // visible in the virtualizer's render window.
  await page.evaluate(() => {
    const scroller = document.querySelector<HTMLElement>(".bc-grid .bc-grid-scroller")
    if (scroller) scroller.scrollLeft = scroller.scrollWidth
  })

  const cell = page
    .locator(
      `.bc-grid-row[data-row-index="0"] .bc-grid-cell[data-column-id="${MULTI_SELECT_COLUMN}"]`,
    )
    .first()
  await expect(cell).toContainText("High Volume")
  await expect(cell).toContainText("International")
})

test("validation rejection keeps the editor open and announces via assertive region", async ({
  page,
}) => {
  await page.goto(URL)
  // Row 0: pick VIP + Manual Review — the demo's validate() rejects this combo.
  await focusBodyCell(page, 0, MULTI_SELECT_COLUMN)
  await page.keyboard.press("F2")
  await page.locator('[role="listbox"] [role="option"]').filter({ hasText: "VIP" }).first().click()
  await page
    .locator('[role="listbox"] [role="option"]')
    .filter({ hasText: "Manual Review" })
    .first()
    .click()
  // Commit via Enter — multi-mode Combobox now bubbles Enter cleanly
  // (audit P1-W3-5b fix).
  await page.keyboard.press("Enter")

  const trigger = page.locator(TRIGGER_SELECTOR).first()
  await expect(trigger).toBeAttached()
  await expect(trigger).toHaveAttribute("aria-invalid", "true")

  const alert = page.locator('[data-bc-grid-alert="true"]').first()
  await expect(alert).toContainText(/VIP and Manual Review/i)
})
