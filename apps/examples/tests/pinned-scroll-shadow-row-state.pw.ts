import { expect, test } from "@playwright/test"

const URL = "/?masterDetail=1"

// Worker rule: this `.pw.ts` is intentionally not run locally by worker2.
// The coordinator owns Playwright/e2e execution during review.

test("pinned seam shadow darkens the hovered row state instead of replacing it", async ({
  page,
}) => {
  await page.goto(URL)

  await page.addStyleTag({
    content: `
      .bc-grid {
        --bc-grid-row-hover: rgb(180, 220, 255);
        --bc-grid-pinned-boundary: rgba(0, 0, 0, 0.35);
      }
    `,
  })

  const grid = page.getByRole("grid", { name: "Accounts receivable customer ledger" })
  await expect(grid).toBeVisible()

  const viewport = grid.locator(".bc-grid-viewport")
  const firstRow = grid.locator('.bc-grid-row[data-row-index="0"]').first()
  await firstRow.locator(".bc-grid-detail-toggle").click()
  await expect(firstRow.locator(".bc-grid-detail-panel")).toBeVisible()

  await viewport.evaluate((el) => {
    el.scrollLeft = 480
    el.dispatchEvent(new Event("scroll", { bubbles: true }))
  })
  await expect(grid).toHaveAttribute("data-scrolled-left", "true", { timeout: 1000 })

  const pinnedEdge = firstRow.locator(".bc-grid-cell-pinned-left-edge").first()
  await pinnedEdge.hover()

  const shadowState = await pinnedEdge.evaluate((el) => {
    const row = el.closest(".bc-grid-row")
    const pseudo = getComputedStyle(el, "::after")
    const cell = getComputedStyle(el)
    const rowStyle = row ? getComputedStyle(row) : null

    return {
      cellBackgroundImage: cell.backgroundImage,
      mixBlendMode: pseudo.mixBlendMode,
      opacity: pseudo.opacity,
      rowBackground: rowStyle?.backgroundColor ?? "",
    }
  })

  expect(shadowState.opacity).toBe("1")
  expect(shadowState.mixBlendMode).toBe("multiply")
  expect(shadowState.rowBackground).toBe("rgb(180, 220, 255)")
  expect(shadowState.cellBackgroundImage).toContain("rgb(180, 220, 255)")
})
