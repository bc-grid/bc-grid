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
  await expect(menu.getByRole("menuitem", { name: "Copy with Headers", exact: true })).toBeVisible()
  await expect(menu.getByRole("menuitem", { name: "Clear Selection", exact: true })).toBeVisible()
  await expect(menu.getByRole("menuitem", { name: "Clear Range", exact: true })).toBeVisible()

  await page.keyboard.press("Escape")
  await expect(menu).toHaveCount(0)

  await grid.focus()
  await page.keyboard.press("Shift+F10")
  await expect(menu).toBeVisible()
})

test("submenu flips to the LEFT when the right edge would overflow the viewport", async ({
  page,
}) => {
  // Surfaced 2026-05-04 by bsncraft consumer: their grid is rendered
  // full-width, so submenus on the right side of the viewport went
  // invisible past the right edge. The fix in `internal/context-menu.tsx`
  // measures the projected right edge on submenu-open and stamps
  // `data-flip="left"` on the wrapper when the right would overflow
  // (and the left side has clearance — or, failing that, more space
  // than the right). CSS rule under `theming/src/styles.css §submenu`
  // swaps `left: calc(100% + 0.25rem)` → `right: calc(100% + 0.25rem)`.
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

  // The wrapper around the View trigger should have `data-flip="left"`
  // — useLayoutEffect runs synchronously after mount, before paint.
  const submenu = viewTrigger.locator(
    "xpath=ancestor-or-self::*[contains(@class,'bc-grid-context-menu-submenu')][1]",
  )
  await expect(submenu).toHaveAttribute("data-flip", "left")

  // The submenu content should be visible (display: flex from the
  // open-state CSS rule) and its right edge should sit to the LEFT
  // of the trigger's left edge.
  const content = submenu.locator(".bc-grid-context-menu-submenu-content")
  await expect(content).toBeVisible()
  const triggerRect = await viewTrigger.boundingBox()
  const contentRect = await content.boundingBox()
  expect(triggerRect).not.toBeNull()
  expect(contentRect).not.toBeNull()
  if (triggerRect && contentRect) {
    expect(contentRect.x + contentRect.width).toBeLessThanOrEqual(triggerRect.x + 1)
  }
})
