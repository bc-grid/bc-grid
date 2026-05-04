import { expect, test } from "@playwright/test"

test("grid context menu opens from right-click and keyboard", async ({ page }) => {
  await page.goto("/")

  const grid = page.getByRole("grid", { name: "Accounts receivable customer ledger" })
  await expect(grid).toBeVisible()

  const firstAccountCell = grid
    .locator('.bc-grid-row[data-row-index="0"] .bc-grid-cell[data-column-id="account"]')
    .first()
  await expect(firstAccountCell).toBeVisible()
  await firstAccountCell.click({ button: "right" })

  const menu = page.getByRole("menu", { name: "Context menu" })
  await expect(menu).toBeVisible()
  await expect(menu.getByRole("menuitem", { name: "Copy", exact: true })).toBeVisible()
  await expect(menu.getByRole("menuitem", { name: "Copy Row", exact: true })).toBeVisible()
  await expect(menu.getByRole("menuitem", { name: "Copy with Headers", exact: true })).toBeVisible()
  await expect(menu.getByRole("menuitem", { name: "Clear Selection", exact: true })).toBeVisible()
  await expect(menu.getByRole("menuitem", { name: "Clear Range", exact: true })).toBeVisible()

  await page.keyboard.press("Escape")
  await expect(menu).toHaveCount(0)

  await firstAccountCell.click({ button: "right" })
  await expect(menu).toBeVisible()
  await page.mouse.click(12, 12)
  await expect(menu).toHaveCount(0)

  await grid.focus()
  await page.keyboard.press("Shift+F10")
  await expect(menu).toBeVisible()
})

test("header column options opens as a Radix dropdown and restores focus", async ({ page }) => {
  await page.goto("/")

  const grid = page.getByRole("grid", { name: "Accounts receivable customer ledger" })
  await expect(grid).toBeVisible()

  const accountHeader = grid.locator('.bc-grid-header-cell[data-column-id="account"]').first()
  await expect(accountHeader).toBeVisible()
  await accountHeader.click({ button: "right" })

  const columnMenu = page.getByRole("menu", { name: "Column visibility" })
  await expect(columnMenu).toBeVisible()
  await expect(columnMenu.getByRole("menuitemcheckbox", { name: "Hide Account" })).toBeVisible()

  await page.keyboard.press("Escape")
  await expect(columnMenu).toHaveCount(0)

  const trigger = accountHeader.locator('[data-bc-grid-column-menu-button="true"]')
  await trigger.click()
  await expect(columnMenu).toBeVisible()

  await page.keyboard.press("Escape")
  await expect(columnMenu).toHaveCount(0)
  await expect(trigger).toBeFocused()
})

test("submenu opens on hover and Radix flips it away from the viewport edge", async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 600 })
  await page.goto("/")

  const grid = page.getByRole("grid", { name: "Accounts receivable customer ledger" })
  await expect(grid).toBeVisible()

  // Right-click far-right so the popup hugs the right edge of the
  // viewport (clampContextMenu pulls it to within the 8px margin).
  await page.mouse.move(680, 400)
  await page.mouse.click(680, 400, { button: "right" })

  const menu = page.getByRole("menu", { name: "Context menu" })
  await expect(menu).toBeVisible()

  // Hover the View submenu trigger (a built-in submenu item — first
  // submenu pre-Group in the default chrome).
  const viewTrigger = menu.getByRole("menuitem", { name: "View" })
  await viewTrigger.hover()

  const showFilterRow = page.getByRole("menuitemcheckbox", { name: "Show filter row" })
  await expect(showFilterRow).toBeVisible()

  const content = showFilterRow.locator(
    "xpath=ancestor::*[contains(@class,'bc-grid-context-menu-submenu-content')][1]",
  )
  await expect(content).toBeVisible()
  await expect(content).toHaveAttribute("data-side", "left")

  const triggerRect = await viewTrigger.boundingBox()
  const contentRect = await content.boundingBox()
  expect(triggerRect).not.toBeNull()
  expect(contentRect).not.toBeNull()
  if (triggerRect && contentRect) {
    expect(contentRect.x + contentRect.width).toBeLessThanOrEqual(triggerRect.x + 1)
    expect(contentRect.x + contentRect.width).toBeLessThanOrEqual(700)
  }
})
