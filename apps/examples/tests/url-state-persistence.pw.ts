import { expect, test } from "@playwright/test"

function urlWithGridState(state: unknown): string {
  const params = new URLSearchParams({
    grid: JSON.stringify(state),
    urlstate: "1",
  })
  return `/?${params.toString()}`
}

test("URL state hydrates column visibility and sort", async ({ page }) => {
  await page.goto(
    urlWithGridState({
      columnState: [{ columnId: "owner", hidden: true }],
      sort: [{ columnId: "balance", direction: "desc" }],
    }),
  )

  const grid = page.getByRole("grid", { name: "Accounts receivable customer ledger" })
  await expect(grid).toBeVisible()
  await expect(grid.getByRole("columnheader", { name: "Collector" })).toHaveCount(0)
  await expect(grid.getByRole("columnheader", { name: /Outstanding/ })).toHaveAttribute(
    "aria-sort",
    "descending",
  )
})

test("URL state writes sort changes while preserving unrelated params", async ({ page }) => {
  await page.goto("/?urlstate=1&tab=customers")

  const grid = page.getByRole("grid", { name: "Accounts receivable customer ledger" })
  await grid.getByRole("columnheader", { name: /Outstanding/ }).click()

  await expect
    .poll(async () => {
      const url = new URL(page.url())
      const raw = url.searchParams.get("grid")
      if (!raw) return null
      return JSON.parse(raw) as unknown
    })
    .toMatchObject({
      sort: [{ columnId: "balance", direction: "asc" }],
    })

  const url = new URL(page.url())
  expect(url.searchParams.get("urlstate")).toBe("1")
  expect(url.searchParams.get("tab")).toBe("customers")
})
