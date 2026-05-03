import { type Page, expect, test } from "@playwright/test"

/**
 * `editor-autocomplete` (`kind: "autocomplete"`) from `@bc-grid/editors`.
 * The `owner` column on the demo is wired with
 * `cellEditor: autocompleteEditor` + `fetchOptions: fetchCollectorOptions`
 * (async resolver against a 30-name roster).
 *
 * Updated 2026-05-02 after PR #370: autocomplete.tsx migrated from
 * `<input list>` + `<datalist>` to the shadcn-native search Combobox
 * primitive (`packages/editors/src/internal/combobox-search.tsx`).
 * The trigger is still an `<input>` (free-text editing) but the
 * suggestion list now lives in a sibling `[role="listbox"]` element
 * with `[role="option"]` children — no datalist linking.
 *
 * Tests assert:
 *   - `data-bc-grid-editor-kind="autocomplete"` discriminator
 *   - `<input role="combobox" aria-haspopup="listbox">` shell
 *   - initial value + initial fetch produce options on first paint
 *   - typing fires debounced `fetchOptions(query, signal)` —
 *     the listbox updates with filtered results
 *   - commit returns the input value (string) — `valueParser` runs
 *     and the cell renderer reflects the trimmed value
 *   - validation rejection (empty string) keeps the editor open and
 *     populates the assertive live region
 */

const URL = "/?edit=1"
const AUTOCOMPLETE_COLUMN = "owner"
const DEBOUNCE_PLUS_FETCH_MS = 320

async function focusBodyCell(page: Page, rowIndex: number, columnId: string) {
  // Owner is column 5 — leftish. In firefox, the pinned-left "account"
  // column intercepts pointer events near the left gutter; scroll right
  // a bit so the owner cell is well away from the pinned shadow.
  await page.evaluate(() => {
    const scroller = document.querySelector<HTMLElement>(".bc-grid .bc-grid-viewport")
    if (scroller) scroller.scrollLeft = 200
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

test("autocompleteEditor mounts a Combobox-search input with the editor-kind data attribute", async ({
  page,
}) => {
  await page.goto(URL)
  await focusBodyCell(page, 0, AUTOCOMPLETE_COLUMN)
  await page.keyboard.press("F2")
  const input = page.locator('input[data-bc-grid-editor-input="true"]').first()
  await expect(input).toBeAttached()
  await expect(input).toHaveAttribute("data-bc-grid-editor-kind", "autocomplete")
  await expect(input).toHaveAttribute("type", "text")
  // The shadcn-native search Combobox uses role="combobox" + aria-haspopup
  // to expose the input as a popover trigger; the listbox is rendered
  // separately. autocomplete="off" suppresses the browser's history-based
  // autofill so only fetchOptions results appear.
  await expect(input).toHaveAttribute("role", "combobox")
  await expect(input).toHaveAttribute("aria-haspopup", "listbox")
  await expect(input).toHaveAttribute("autocomplete", "off")
})

test("input pre-fills with the existing cell value", async ({ page }) => {
  await page.goto(URL)
  await focusBodyCell(page, 0, AUTOCOMPLETE_COLUMN)
  await page.keyboard.press("F2")
  const input = page.locator('input[data-bc-grid-editor-input="true"]').first()
  // Each customer's `owner` is one of the 8-name seed list.
  const value = await input.evaluate((el) => (el as HTMLInputElement).value)
  expect(value.length).toBeGreaterThan(0)
})

test("typing fires fetchOptions and the listbox updates with filtered options", async ({
  page,
}) => {
  await page.goto(URL)
  await focusBodyCell(page, 0, AUTOCOMPLETE_COLUMN)
  await page.keyboard.press("F2")
  const input = page.locator('input[data-bc-grid-editor-input="true"]').first()
  await input.fill("alex")
  // Wait for debounce (200ms) + fetch (50ms simulated) + a small buffer.
  await page.waitForTimeout(DEBOUNCE_PLUS_FETCH_MS)
  // Suggestions render inside `[role="listbox"]` as `[role="option"]`
  // elements; their text content is the option label.
  const optionLabels = await page.locator('[role="listbox"] [role="option"]').allTextContents()
  // Demo roster has exactly one "alex" — Alex Chen.
  expect(optionLabels.map((l) => l.trim())).toEqual(["Alex Chen"])
})

test("commit produces a string value (valueParser trims) reflected by the cell renderer", async ({
  page,
}) => {
  await page.goto(URL)
  await focusBodyCell(page, 0, AUTOCOMPLETE_COLUMN)
  await page.keyboard.press("F2")
  const input = page.locator('input[data-bc-grid-editor-input="true"]').first()
  // Note the trailing/leading spaces — valueParser should trim at commit.
  await input.fill("  Sofia Delgado  ")
  await page.keyboard.press("Enter")

  await expect(page.locator('input[data-bc-grid-editor-input="true"]')).toHaveCount(0)

  const cell = page
    .locator(
      `.bc-grid-row[data-row-index="0"] .bc-grid-cell[data-column-id="${AUTOCOMPLETE_COLUMN}"]`,
    )
    .first()
  await expect(cell).toContainText("Sofia Delgado")
})

test("validation rejection keeps the editor open and announces via assertive region", async ({
  page,
}) => {
  await page.goto(URL)
  await focusBodyCell(page, 0, AUTOCOMPLETE_COLUMN)
  await page.keyboard.press("F2")
  const input = page.locator('input[data-bc-grid-editor-input="true"]').first()
  await input.fill("")
  await page.keyboard.press("Enter")

  await expect(input).toBeAttached()
  await expect(input).toHaveAttribute("aria-invalid", "true")

  const alert = page.locator('[data-bc-grid-alert="true"]').first()
  await expect(alert).toContainText(/Collector is required/i)
})

test("autocompleteEditor mounts in popup mode (in-cell-editor-mode-rfc §4: async dropdown overflows)", async ({
  page,
}) => {
  // Per `in-cell-editor-mode-rfc.md` §4: autocomplete sets
  // `popup: true` because the async-option dropdown panel
  // (5-15 fetched rows + loading + no-matches rows) overflows the
  // cell box. Pin the popup wrapper attribute. Worker3 PR (c).
  await page.goto(URL)
  await focusBodyCell(page, 0, AUTOCOMPLETE_COLUMN)
  await page.keyboard.press("F2")
  const wrapper = page.locator("[data-bc-grid-editor-mount]").first()
  await expect(wrapper).toBeAttached()
  await expect(wrapper).toHaveAttribute("data-bc-grid-editor-mount", "popup")
})
