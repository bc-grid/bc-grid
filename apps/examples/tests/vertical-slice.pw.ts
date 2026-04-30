import { type Locator, expect, test } from "@playwright/test"

test("AR customer vertical slice exposes the Q1 grid contract", async ({ page }) => {
  await page.goto("/")

  await expect(page.getByRole("heading", { name: "Accounts Receivable Customers" })).toBeVisible()
  await expect(page.getByText("5,000 customer ledger rows")).toBeVisible()
  await expect(page.getByText("Q1 gate")).toBeVisible()

  const grid = page.getByRole("grid", { name: "Accounts receivable customer ledger" })
  await expect(grid).toBeVisible()
  await expect(grid).toHaveAttribute("aria-rowcount", "5002")
  await expect(grid).toHaveAttribute("aria-colcount", "22")

  const renderedRows = await grid.locator(".bc-grid-row").count()
  expect(renderedRows).toBeGreaterThan(0)
  expect(renderedRows).toBeLessThan(80)
})

test("fixed-height grid owns vertical scrolling and can reveal the final record", async ({
  page,
}) => {
  await page.goto("/")

  const grid = page.getByRole("grid", { name: "Accounts receivable customer ledger" })
  const scroller = grid.locator(".bc-grid-scroller")
  await expect(scroller).toBeVisible()

  const metrics = await scroller.evaluate((node) => {
    const table = node.closest(".bc-grid-table")
    const main = node.closest(".bc-grid-main")
    const root = node.closest(".bc-grid")
    return {
      clientHeight: node.clientHeight,
      scrollHeight: node.scrollHeight,
      rootHeight: root?.getBoundingClientRect().height ?? 0,
      mainInlineDisplay: main?.style.display ?? "",
      rootInlineOverflow: root?.style.overflow ?? "",
      tableMinHeight: table ? getComputedStyle(table).minHeight : "",
      tableInlineDisplay: table?.style.display ?? "",
      tableInlineFlexDirection: table?.style.flexDirection ?? "",
    }
  })

  expect(metrics.rootHeight).toBeGreaterThan(500)
  expect(metrics.rootInlineOverflow).toBe("hidden")
  expect(metrics.mainInlineDisplay).toBe("flex")
  expect(metrics.tableInlineDisplay).toBe("flex")
  expect(metrics.tableInlineFlexDirection).toBe("column")
  expect(metrics.clientHeight).toBeLessThan(metrics.rootHeight)
  expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight + 1_000)
  expect(metrics.tableMinHeight).toBe("0px")

  await scroller.evaluate((node) => {
    node.scrollTop = node.scrollHeight
    node.dispatchEvent(new Event("scroll", { bubbles: true }))
  })

  const finalRow = grid.locator('.bc-grid-row[data-row-id="AR-05000"]')
  await expect(finalRow).toBeVisible()
  await expect(finalRow.locator('[data-column-id="account"]')).toHaveText("CUST-05000")
})

test("AR customer filters narrow the ledger to a single account", async ({ page }) => {
  await page.goto("/")

  const grid = page.getByRole("grid", { name: "Accounts receivable customer ledger" })
  await expect(grid).toBeVisible()

  await grid.getByLabel("Filter Account").fill("CUST-00042")
  await expect(grid).toHaveAttribute("aria-rowcount", "3")
  await expect(grid.locator(".bc-grid-row").first()).toContainText("CUST-00042")
})

test("AR customer boolean filter narrows credit-hold accounts", async ({ page }) => {
  await page.goto("/")

  const grid = page.getByRole("grid", { name: "Accounts receivable customer ledger" })
  await expect(grid).toBeVisible()

  await grid.getByLabel("Filter Credit Hold?").selectOption("true")
  const yesRowCount = Number(await grid.getAttribute("aria-rowcount"))
  expect(yesRowCount).toBeGreaterThan(2)
  expect(yesRowCount).toBeLessThan(5002)
  await expect(grid.locator(".bc-grid-row").first()).toContainText("Yes")

  await grid.getByLabel("Filter Credit Hold?").selectOption("false")
  const noRowCount = Number(await grid.getAttribute("aria-rowcount"))
  expect(noRowCount).toBeGreaterThan(yesRowCount)
  await expect(grid.locator(".bc-grid-row").first()).toContainText("No")
})

test("AR customer row click updates selection summary and account detail", async ({ page }) => {
  await page.goto("/")

  const grid = page.getByRole("grid", { name: "Accounts receivable customer ledger" })
  await expect(grid).toBeVisible()

  await grid.locator('.bc-grid-row[data-row-index="4"]').click()
  const selectedSummary = page
    .getByLabel("Accounts receivable summary")
    .locator(".summary-tile", { hasText: "Selected" })
    .locator("strong")
  await expect(selectedSummary).toHaveText("1")

  const detail = page.getByLabel("Selected customer account")
  await expect(detail).toContainText("CUST-00005")
  await expect(detail).toContainText("Outstanding")
})

test("AR customer sort affordance works on outstanding balance", async ({ page }) => {
  await page.goto("/")

  const grid = page.getByRole("grid", { name: "Accounts receivable customer ledger" })
  const outstanding = grid.getByRole("columnheader", { name: /Outstanding/ })

  await outstanding.click()
  await expect(outstanding).toHaveAttribute("aria-sort", "ascending")

  await outstanding.click()
  await expect(outstanding).toHaveAttribute("aria-sort", "descending")
  await scrollHorizontallyTo(grid, 900)

  await expect
    .poll(async () => isNonIncreasing(await visibleColumnNumbers(grid, "balance")))
    .toBe(true)
})

test("AR customer sort changes rendered data order, not just header state", async ({ page }) => {
  await page.goto("/")

  const grid = page.getByRole("grid", { name: "Accounts receivable customer ledger" })
  const outstanding = grid.getByRole("columnheader", { name: /Outstanding/ })
  const firstAccountBefore = await grid
    .locator(".bc-grid-row[data-row-id]")
    .first()
    .locator('[data-column-id="account"]')
    .innerText()

  await outstanding.click()
  await expect(outstanding).toHaveAttribute("aria-sort", "ascending")
  await scrollHorizontallyTo(grid, 900)

  await expect
    .poll(async () => {
      const firstAccountAfter = await grid
        .locator(".bc-grid-row[data-row-id]")
        .first()
        .locator('[data-column-id="account"]')
        .innerText()
      return firstAccountAfter !== firstAccountBefore
    })
    .toBe(true)

  await expect
    .poll(async () => isNonDecreasing(await visibleColumnNumbers(grid, "balance")))
    .toBe(true)
})

async function scrollHorizontallyTo(grid: Locator, left: number): Promise<void> {
  await grid.locator(".bc-grid-scroller").evaluate((node, scrollLeft) => {
    node.scrollLeft = scrollLeft
    node.dispatchEvent(new Event("scroll", { bubbles: true }))
  }, left)
}

async function visibleColumnNumbers(grid: Locator, columnId: string): Promise<number[]> {
  const values = await grid
    .locator(`.bc-grid-row[data-row-id] [data-column-id="${columnId}"]`)
    .evaluateAll((cells) =>
      cells.map((cell) => Number(cell.textContent?.replace(/[^0-9.-]/g, "") ?? Number.NaN)),
    )
  return values.filter((value) => Number.isFinite(value))
}

function isNonDecreasing(values: readonly number[]): boolean {
  if (values.length < 2) return false
  for (let index = 1; index < values.length; index += 1) {
    if (values[index] < values[index - 1]) return false
  }
  return true
}

function isNonIncreasing(values: readonly number[]): boolean {
  if (values.length < 2) return false
  for (let index = 1; index < values.length; index += 1) {
    if (values[index] > values[index - 1]) return false
  }
  return true
}
