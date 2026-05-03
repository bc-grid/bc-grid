import { type Page, expect, test } from "@playwright/test"

/**
 * `editor-select` (`kind: "select"`) from `@bc-grid/editors`. The
 * `status` column on the demo is wired with `cellEditor: selectEditor`
 * + `options: [{value: "Open", label: "Open"}, ...]`.
 *
 * Updated 2026-05-02 after PR #364: select.tsx migrated from native
 * `<select>` to the shadcn-native Combobox primitive
 * (`packages/editors/src/internal/combobox.tsx`). Tests now interact
 * with the trigger button + `role="listbox"` + `role="option"` pattern
 * rather than native `<select>` / `<option>` elements.
 *
 * Tests assert:
 *   - `data-bc-grid-editor-kind="select"` discriminator on the trigger
 *   - listbox renders one `role="option"` per `column.options` entry
 *   - existing cell value pre-selected (`[data-selected="true"]`)
 *   - commit persists the new value
 */

const URL = "/?edit=1"
const SELECT_COLUMN = "status"
const TRIGGER_SELECTOR =
  'button[data-bc-grid-editor-input="true"][data-bc-grid-editor-kind="select"]'

async function focusBodyCell(page: Page, rowIndex: number, columnId: string) {
  // Status column is mid-grid — scroll partway to ensure rendered.
  await page.evaluate(() => {
    const scroller = document.querySelector<HTMLElement>(".bc-grid .bc-grid-scroller")
    if (scroller) scroller.scrollLeft = scroller.scrollWidth / 2
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

test("selectEditor mounts a Combobox trigger with the editor-kind data attribute", async ({
  page,
}) => {
  await page.goto(URL)
  await focusBodyCell(page, 0, SELECT_COLUMN)
  await page.keyboard.press("F2")
  const trigger = page.locator(TRIGGER_SELECTOR).first()
  await expect(trigger).toBeAttached()
  await expect(trigger).toHaveAttribute("aria-haspopup", "listbox")
})

test("editor renders one option per column.options entry", async ({ page }) => {
  await page.goto(URL)
  await focusBodyCell(page, 0, SELECT_COLUMN)
  await page.keyboard.press("F2")
  const trigger = page.locator(TRIGGER_SELECTOR).first()
  // Combobox opens by default on edit-activate; the option count is
  // exposed on the trigger via `data-bc-grid-editor-option-count` so
  // the assertion doesn't need to wait for listbox paint.
  await expect(trigger).toHaveAttribute("data-bc-grid-editor-option-count", "4")
  // CustomerStatus has 4 values: Open, Credit Hold, Past Due, Disputed.
  const options = page.locator('[role="listbox"] [role="option"]')
  await expect(options).toHaveCount(4)
})

test("editor pre-selects the existing cell value", async ({ page }) => {
  await page.goto(URL)
  await focusBodyCell(page, 0, SELECT_COLUMN)
  await page.keyboard.press("F2")
  // Pre-selected option carries `data-selected="true"` and the label
  // matches one of the four CustomerStatus values.
  const selected = page.locator('[role="listbox"] [role="option"][data-selected="true"]').first()
  const label = (await selected.textContent())?.trim() ?? ""
  expect(["Open", "Credit Hold", "Past Due", "Disputed"]).toContain(label)
})

test("commit persists the new selection to the cell display", async ({ page }) => {
  await page.goto(URL)
  await focusBodyCell(page, 0, SELECT_COLUMN)
  await page.keyboard.press("F2")
  // Click the "Disputed" option in the listbox (Combobox uses
  // pointerdown to commit the pick; locator.click() fires both).
  const disputed = page
    .locator('[role="listbox"] [role="option"]')
    .filter({ hasText: "Disputed" })
    .first()
  await disputed.click()
  await page.keyboard.press("Enter")

  // Trigger should unmount on commit (editor portal closes).
  await expect(page.locator(TRIGGER_SELECTOR)).toHaveCount(0)

  // The status cell renders via StatusBadge; the badge text reflects
  // the committed value.
  const cell = page
    .locator(`.bc-grid-row[data-row-index="0"] .bc-grid-cell[data-column-id="${SELECT_COLUMN}"]`)
    .first()
  await expect(cell).toContainText("Disputed")
})

test("selectEditor mounts in popup mode (in-cell-editor-mode-rfc §4: dropdown overflows)", async ({
  page,
}) => {
  // Per `in-cell-editor-mode-rfc.md` §4: the select dropdown listbox
  // overflows the cell box, so the editor sets `popup: true` and the
  // framework mounts it via `<EditorPortal>` in the overlay sibling.
  // Pin the wrapper attribute so a regression that flips select to
  // in-cell mounts catches in CI rather than slipping into production
  // (the listbox would clip against the cell's `overflow: hidden`).
  // Worker3 PR (c) per `docs/coordination/handoff-worker3.md`.
  await page.goto(URL)
  await focusBodyCell(page, 0, SELECT_COLUMN)
  await page.keyboard.press("F2")
  const wrapper = page.locator("[data-bc-grid-editor-mount]").first()
  await expect(wrapper).toBeAttached()
  await expect(wrapper).toHaveAttribute("data-bc-grid-editor-mount", "popup")
})
