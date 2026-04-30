import { type Page, expect, test } from "@playwright/test"

const gridId = "accounts-receivable.customers"

test.beforeEach(async ({ page }) => {
  await page.goto("/")
  await page.evaluate((id) => {
    window.localStorage.removeItem(`bc-grid:${id}:columnState`)
  }, gridId)
  await page.reload()
})

test("dragging a header reorders columns without sorting", async ({ page }) => {
  const grid = page.getByRole("grid", { name: "Accounts receivable customer ledger" })
  await expect(grid).toBeVisible()

  await expectHeaderOrder(page, ["account", "legalName", "tradingName", "region", "owner"])

  await dragHeaderBefore(page, "Region", "Customer")

  await expectHeaderOrder(page, ["account", "region", "legalName", "tradingName", "owner"])
  await expect(grid.getByRole("columnheader", { name: "Region" })).toHaveAttribute(
    "aria-sort",
    "none",
  )
})

test("column reorder persists through columnState storage", async ({ page }) => {
  await dragHeaderBefore(page, "Region", "Customer")

  await expect
    .poll(async () => {
      const columnState = await readPersistedColumnState(page)
      const region = columnState.find((entry) => entry.columnId === "region")
      const customer = columnState.find((entry) => entry.columnId === "legalName")
      return (
        typeof region?.position === "number" &&
        typeof customer?.position === "number" &&
        region.position < customer.position
      )
    })
    .toBe(true)

  await page.reload()
  await expectHeaderOrder(page, ["account", "region", "legalName", "tradingName", "owner"])
})

async function readPersistedColumnState(page: Page) {
  return page.evaluate((id) => {
    const raw = window.localStorage.getItem(`bc-grid:${id}:columnState`)
    return raw ? (JSON.parse(raw) as { columnId: string; position?: number }[]) : []
  }, gridId)
}

async function dragHeaderBefore(page: Page, sourceName: string, targetName: string) {
  const grid = page.getByRole("grid", { name: "Accounts receivable customer ledger" })
  const source = grid.getByRole("columnheader", { name: sourceName })
  const target = grid.getByRole("columnheader", { name: targetName })
  await expect(source).toBeVisible()
  await expect(target).toBeVisible()
  const sourceBox = await source.boundingBox()
  const targetBox = await target.boundingBox()
  if (!sourceBox || !targetBox) throw new Error("Expected source and target header boxes")

  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(targetBox.x + 4, targetBox.y + targetBox.height / 2, { steps: 8 })
  await expect(page.locator(".bc-grid-column-drop-indicator")).toBeVisible()
  await page.mouse.up()
  await expect(page.locator(".bc-grid-column-drop-indicator")).toHaveCount(0)
}

async function expectHeaderOrder(page: Page, expectedPrefix: readonly string[]) {
  await expect
    .poll(async () => (await headerOrder(page)).slice(0, expectedPrefix.length))
    .toEqual(expectedPrefix)
}

async function headerOrder(page: Page) {
  return page
    .locator(".bc-grid-header .bc-grid-header-cell")
    .evaluateAll((headers) =>
      headers.map((header) => header.getAttribute("data-column-id")).filter(Boolean),
    )
}
