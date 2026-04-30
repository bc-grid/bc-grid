import { expect, test } from "@playwright/test"

test("header column menu hides and restores columns", async ({ page }) => {
  await page.goto("/")

  const grid = page.getByRole("grid", { name: "Accounts receivable customer ledger" })
  await expect(grid).toBeVisible()

  const accountHeader = grid.getByRole("columnheader", { name: "Account" })
  await accountHeader.hover()
  await accountHeader.getByRole("button", { name: "Column options for Account" }).click()

  const menu = page.getByRole("menu", { name: "Column visibility" })
  await expect(menu).toBeVisible()
  await expect(menu.getByRole("menuitemcheckbox", { name: "Hide Collector" })).toHaveAttribute(
    "aria-checked",
    "true",
  )
  await menu.getByRole("menuitemcheckbox", { name: "Hide Collector" }).click()

  await expect(grid.getByRole("columnheader", { name: "Collector" })).toHaveCount(0)

  await accountHeader.click({ button: "right" })
  await expect(menu.getByRole("menuitemcheckbox", { name: "Show Collector" })).toHaveAttribute(
    "aria-checked",
    "false",
  )
  await menu.getByRole("menuitemcheckbox", { name: "Show Collector" }).click()

  await expect(grid.getByRole("columnheader", { name: "Collector" })).toBeVisible()
})

test("header column menu closes with Escape after opening from the button", async ({ page }) => {
  await page.goto("/")

  const grid = page.getByRole("grid", { name: "Accounts receivable customer ledger" })
  await expect(grid).toBeVisible()

  const accountHeader = grid.getByRole("columnheader", { name: "Account" })
  await accountHeader.hover()
  await accountHeader.getByRole("button", { name: "Column options for Account" }).click()

  const menu = page.getByRole("menu", { name: "Column visibility" })
  await expect(menu).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(menu).toHaveCount(0)
})
