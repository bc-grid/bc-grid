import { type Page, expect, test } from "@playwright/test"

/**
 * `BcGridProps.rowIsDisabled` predicate marks rows as disabled. Disabled
 * rows render with `aria-disabled="true"` and `.bc-grid-row-disabled`,
 * skip selection gestures (click / ctrl-click / shift-click / Space /
 * checkbox), but remain keyboard-focusable so navigation isn't trapped.
 *
 * Per `accessibility-rfc §VirtualRowA11yMeta.disabled`.
 *
 * The demo opts in via `?disabled=1` URL flag — every "Credit Hold"
 * customer is treated as disabled.
 */

const URL = "/?disabled=1"

async function findFirstDisabledRow(page: Page) {
  return page.locator('.bc-grid-row[aria-disabled="true"]').first()
}

async function findFirstEnabledRow(page: Page) {
  return page.locator('.bc-grid-row:not([aria-disabled="true"])').first()
}

test("disabled rows render aria-disabled='true' and .bc-grid-row-disabled class", async ({
  page,
}) => {
  await page.goto(URL)
  const disabled = await findFirstDisabledRow(page)
  await expect(disabled).toBeAttached()
  await expect(disabled).toHaveAttribute("aria-disabled", "true")
  await expect(disabled).toHaveClass(/bc-grid-row-disabled/)
})

test("clicking a disabled row does not toggle selection", async ({ page }) => {
  await page.goto(URL)
  const disabled = await findFirstDisabledRow(page)
  await expect(disabled).not.toHaveAttribute("aria-selected", "true")
  // `force: true` bypasses Playwright's actionability check — `aria-disabled`
  // makes Playwright wait for "enabled". The whole point of this test is to
  // assert the click goes through but the grid's handler short-circuits;
  // bypass the auto-wait so we can verify the grid-side behaviour.
  await disabled.click({ force: true })
  // Disabled row stays unselected — the grid's row onClick short-circuits.
  await expect(disabled).not.toHaveAttribute("aria-selected", "true")
})

test("Space on a focused disabled row does not toggle selection", async ({ page }) => {
  await page.goto(URL)
  // Focus the grid via an enabled row first.
  const enabled = await findFirstEnabledRow(page)
  await enabled.click()
  await page.locator('[role="grid"]').first().focus()

  // Find a disabled row's index and press ArrowDown until we land on it.
  const disabledIndexAttr = await (await findFirstDisabledRow(page)).getAttribute("data-row-index")
  const enabledIndexAttr = await enabled.getAttribute("data-row-index")
  const disabledIndex = Number(disabledIndexAttr)
  const enabledIndex = Number(enabledIndexAttr)
  if (!Number.isFinite(disabledIndex) || !Number.isFinite(enabledIndex)) {
    throw new Error("could not read row indices")
  }
  const steps = disabledIndex - enabledIndex
  for (let i = 0; i < Math.abs(steps); i++) {
    await page.keyboard.press(steps > 0 ? "ArrowDown" : "ArrowUp")
  }

  // Press Space — should be a noop on the disabled row.
  await page.keyboard.press(" ")
  const disabled = page.locator(`.bc-grid-row[data-row-index="${disabledIndex}"]`).first()
  await expect(disabled).not.toHaveAttribute("aria-selected", "true")
})

test("disabled rows remain keyboard-focusable (active descendant lands on them)", async ({
  page,
}) => {
  await page.goto(URL)
  const enabled = await findFirstEnabledRow(page)
  await enabled.click()
  await page.locator('[role="grid"]').first().focus()

  const disabledIndexAttr = await (await findFirstDisabledRow(page)).getAttribute("data-row-index")
  const enabledIndexAttr = await enabled.getAttribute("data-row-index")
  const disabledIndex = Number(disabledIndexAttr)
  const enabledIndex = Number(enabledIndexAttr)
  const steps = disabledIndex - enabledIndex
  for (let i = 0; i < Math.abs(steps); i++) {
    await page.keyboard.press(steps > 0 ? "ArrowDown" : "ArrowUp")
  }

  // The grid's aria-activedescendant should now reference a cell on the
  // disabled row — keyboard nav crosses it, doesn't skip it.
  const activeId = await page.locator('[role="grid"]').first().getAttribute("aria-activedescendant")
  expect(activeId).toBeTruthy()
  // The active id encodes the rowId; we don't have the exact rowId here,
  // but we can assert that the row is rendered as the active cell's parent.
  const activeCell = activeId
    ? page.locator(`#${activeId.replace(/[^a-zA-Z0-9_-]/g, "\\$&")}`)
    : null
  if (activeCell) {
    const parent = activeCell.locator("..")
    await expect(parent).toHaveAttribute("data-row-index", String(disabledIndex))
  }
})

test("disabled row's checkbox (when checkboxSelection is on) is disabled", async ({ page }) => {
  await page.goto("/?checkbox=1&disabled=1")
  const disabled = await findFirstDisabledRow(page)
  const checkbox = disabled.locator('input[type="checkbox"][data-bc-grid-selection-row]')
  await expect(checkbox).toBeAttached()
  await expect(checkbox).toBeDisabled()
})
