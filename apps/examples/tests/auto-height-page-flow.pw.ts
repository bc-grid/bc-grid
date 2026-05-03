import { expect, test } from "@playwright/test"

const URL = "/?autoHeight=1&pagination=1"

test("auto-height mode uses document vertical scroll while preserving horizontal grid scroll", async ({
  page,
}) => {
  await page.goto(URL)

  const grid = page.getByRole("grid", { name: "Accounts receivable customer ledger" })
  await expect(grid).toBeVisible()
  await expect(grid).toHaveAttribute("data-bc-grid-height-mode", "auto")
  await expect(grid).toHaveAttribute("aria-rowcount", "102")

  const metrics = await page.evaluate(() => {
    const scroller = document.querySelector<HTMLElement>(".bc-grid .bc-grid-viewport")
    const header = document.querySelector<HTMLElement>(".bc-grid .bc-grid-header-band")
    if (!scroller || !header) return null
    return {
      documentScrolls: document.documentElement.scrollHeight > window.innerHeight,
      headerPosition: getComputedStyle(header).position,
      scrollerClientHeight: scroller.clientHeight,
      scrollerScrollHeight: scroller.scrollHeight,
      scrollerClientWidth: scroller.clientWidth,
      scrollerScrollWidth: scroller.scrollWidth,
    }
  })

  expect(metrics).not.toBeNull()
  expect(metrics?.documentScrolls).toBe(true)
  expect(metrics?.headerPosition).toBe("sticky")
  expect(metrics?.scrollerScrollHeight).toBeLessThanOrEqual(
    (metrics?.scrollerClientHeight ?? 0) + 1,
  )
  expect(metrics?.scrollerScrollWidth).toBeGreaterThan(metrics?.scrollerClientWidth ?? 0)

  await grid.locator(".bc-grid-viewport").evaluate((scroller) => {
    scroller.scrollLeft = 800
    scroller.dispatchEvent(new Event("scroll", { bubbles: true }))
  })
  await expect(grid).toHaveAttribute("data-scrolled-left", "true")
})
