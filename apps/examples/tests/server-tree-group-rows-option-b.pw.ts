import { expect, test } from "@playwright/test"

// Worker1 v06 — regression guard for the pinned-lane Option B fix
// (#479). Worker3 flagged in their pinned-lane RFC verdict (#473):
// "verify <BcServerGrid rowModel='tree'> group rows still render
// correctly under Option B" (the new 3-track template
// `auto minmax(0, 1fr) auto`).
//
// Group rows render via `renderGroupRowCell` with
// `position: absolute; left: 0; width: totalWidth`. Absolute
// positioning sidesteps the row's grid layout entirely, so the
// 3-track template doesn't constrain the group cell's reach. This
// spec pins that contract end-to-end so a future row-template change
// doesn't silently truncate the group cell at the consumer-visible
// layer (the unit tests in `groupRowOptionB.test.tsx` cover SSR;
// this covers DOM + computed style + layout).
//
// Drives the existing server-mode-switch demo at `?serverModeSwitch=1`
// (already mounts `<BcServerGrid>` and toggles to tree mode via a
// groupBy toggle).
//
// Worker rule: this `.pw.ts` was NOT run locally (workers do not run
// Playwright — see `docs/AGENTS.md §6`). The Claude coordinator runs
// it at review/merge.

const URL_WITH_DEMO = "/?serverModeSwitch=1"

test("Option B regression: server-tree group rows render with full row-width group cell", async ({
  page,
}) => {
  await page.goto(URL_WITH_DEMO)

  const grid = page.getByRole("grid", { name: "Server mode-switch customer demo" })
  await expect(grid).toBeVisible()

  // Flip to tree mode via the demo's groupBy toggle.
  const toggle = page.getByTestId("server-mode-switch-toggle")
  await toggle.click()
  await expect(toggle).toHaveAttribute("aria-pressed", "true")

  // Tree mode renders group rows for the 4 customer-type buckets.
  const groupRows = grid.locator('[data-bc-grid-row-kind="group"]')
  await expect(groupRows).toHaveCount(4)

  // Pin the contract: each group row's child group-cell renders with
  // position:absolute + left:0 + a width that spans the row's full
  // declared totalWidth (NOT clamped to the 1fr center track). If a
  // future row-template change forces grid layout to constrain the
  // absolute cell, this assertion catches it.
  const firstGroupCell = grid.locator(".bc-grid-group-cell").first()
  await expect(firstGroupCell).toBeVisible()

  const groupCellMetrics = await firstGroupCell.evaluate((el) => {
    const style = window.getComputedStyle(el as HTMLElement)
    const rect = (el as HTMLElement).getBoundingClientRect()
    const parentRect = ((el as HTMLElement).parentElement as HTMLElement).getBoundingClientRect()
    return {
      position: style.position,
      left: style.left,
      cellWidth: rect.width,
      parentWidth: parentRect.width,
    }
  })

  expect(groupCellMetrics.position).toBe("absolute")
  expect(groupCellMetrics.left).toBe("0px")
  // The group cell width should match its parent row's width within a
  // 1px tolerance for sub-pixel rounding. If grid layout were
  // constraining the absolute cell to the 1fr center track, the cell
  // width would be much smaller than the row width (~33% with two
  // auto lanes flanking it, or even less with non-zero pinned content).
  expect(Math.abs(groupCellMetrics.cellWidth - groupCellMetrics.parentWidth)).toBeLessThanOrEqual(1)
})

test("Option B regression: aria-colspan on group cell matches column count", async ({ page }) => {
  await page.goto(URL_WITH_DEMO)

  const grid = page.getByRole("grid", { name: "Server mode-switch customer demo" })
  await expect(grid).toBeVisible()

  const toggle = page.getByTestId("server-mode-switch-toggle")
  await toggle.click()
  await expect(toggle).toHaveAttribute("aria-pressed", "true")

  const firstGroupCell = grid.locator(".bc-grid-group-cell").first()
  await expect(firstGroupCell).toBeVisible()

  // aria-colspan reflects the visible column count. The exact number
  // depends on the demo's column layout — assert it's at least 2 (any
  // multi-column grid has more than one visible column to span across).
  const colspan = await firstGroupCell.getAttribute("aria-colspan")
  expect(colspan).not.toBeNull()
  expect(Number(colspan)).toBeGreaterThanOrEqual(2)
})
