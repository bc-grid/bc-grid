import { type Page, expect, test } from "@playwright/test"

/**
 * Row-selection behaviour for the React grid:
 *   - plain click → selects only that row
 *   - Ctrl/Cmd-click → toggles that row in the current selection
 *   - Shift-click → range select from anchor to current
 * Selected rows render with `aria-selected="true"` and the
 * `.bc-grid-row-selected` class.
 */

async function clickRow(
  page: Page,
  rowIndex: number,
  modifiers: Array<"Control" | "ControlOrMeta" | "Meta" | "Shift"> = [],
): Promise<void> {
  const row = page.locator(`.bc-grid-row[data-row-index="${rowIndex}"]`).first()
  await row.click({ modifiers })
}

async function selectedRowIndexes(page: Page): Promise<number[]> {
  return await page
    .locator('.bc-grid-row[aria-selected="true"]')
    .evaluateAll((rows) =>
      rows
        .map((row) => Number((row as HTMLElement).dataset.rowIndex ?? "-1"))
        .filter((n) => n >= 0),
    )
}

test("plain click selects only that row", async ({ page }) => {
  await page.goto("/")
  // Select row 2.
  await clickRow(page, 2)
  expect(await selectedRowIndexes(page)).toEqual([2])

  // Select row 5; row 2 deselects.
  await clickRow(page, 5)
  expect(await selectedRowIndexes(page)).toEqual([5])
})

test("Ctrl/Cmd-click toggles a row in the current selection", async ({ page }) => {
  await page.goto("/")
  await clickRow(page, 1)
  await clickRow(page, 3, ["ControlOrMeta"])
  await clickRow(page, 5, ["ControlOrMeta"])

  expect((await selectedRowIndexes(page)).sort((a, b) => a - b)).toEqual([1, 3, 5])

  // Ctrl-click an already-selected row → deselect it.
  await clickRow(page, 3, ["ControlOrMeta"])
  expect((await selectedRowIndexes(page)).sort((a, b) => a - b)).toEqual([1, 5])
})

test("Space toggles selection on the focused row", async ({ page }) => {
  await page.goto("/")
  await page.locator(".bc-grid").focus()
  await page.keyboard.press("ArrowDown")
  await page.keyboard.press("ArrowDown")

  await page.keyboard.press("Space")
  expect(await selectedRowIndexes(page)).toEqual([2])

  await page.keyboard.press("Space")
  expect(await selectedRowIndexes(page)).toEqual([])
})

test("Shift+Space and Ctrl/Cmd+Space are reserved and do not toggle selection", async ({
  page,
}) => {
  await page.goto("/")
  await page.locator(".bc-grid").focus()
  await page.keyboard.press("ArrowDown")

  await page.keyboard.down("Shift")
  await page.keyboard.press("Space")
  await page.keyboard.up("Shift")
  expect(await selectedRowIndexes(page)).toEqual([])

  await page.keyboard.down("Control")
  await page.keyboard.press("Space")
  await page.keyboard.up("Control")
  expect(await selectedRowIndexes(page)).toEqual([])
})

test("Shift-click selects the range from anchor to current", async ({ page }) => {
  await page.goto("/")
  // Anchor at row 2, range to row 6 → select 2..6 inclusive.
  await clickRow(page, 2)
  await clickRow(page, 6, ["Shift"])

  expect((await selectedRowIndexes(page)).sort((a, b) => a - b)).toEqual([2, 3, 4, 5, 6])

  // Shift-click backwards from the anchor — the new range replaces the old.
  // Anchor stays at row 2 (was set by the earlier plain click).
  await clickRow(page, 0, ["Shift"])
  expect((await selectedRowIndexes(page)).sort((a, b) => a - b)).toEqual([0, 1, 2])
})

test("aria-selected and the bc-grid-row-selected class coincide", async ({ page }) => {
  await page.goto("/")
  await clickRow(page, 4)

  // The selected row carries both the ARIA flag and the class.
  const row = page.locator('.bc-grid-row[data-row-index="4"]').first()
  await expect(row).toHaveAttribute("aria-selected", "true")
  await expect(row).toHaveClass(/bc-grid-row-selected/)

  // Unselected rows have neither.
  const other = page.locator('.bc-grid-row[data-row-index="2"]').first()
  await expect(other).not.toHaveAttribute("aria-selected", "true")
})
