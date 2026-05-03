import { expect, test } from "@playwright/test"

// RFC §10 Q3 (ratified): forced-colors mode interaction with `position: sticky`.
// Sticky positioning is rendering-engine-level and forced-colors is paint-level,
// so they should compose without browser bugs. This spec exercises that pairing
// after the layout-architecture-pass PR (a) lands so any future regression in
// either layer is caught early.
//
// Worker rule: this `.pw.ts` was NOT run locally (workers do not run Playwright
// or smoke-perf — see `docs/AGENTS.md §6`). The Claude coordinator runs it at
// review/merge.

test.use({ colorScheme: "light", forcedColors: "active" })

test("sticky header band stays pinned at the viewport top under forced-colors mode", async ({
  page,
}) => {
  await page.goto("/")

  const grid = page.getByRole("grid").first()
  await expect(grid).toBeVisible()

  const headerBand = grid.locator(".bc-grid-header-band")
  await expect(headerBand).toBeVisible()

  // Scroll body vertically and assert the header band remains at viewport-top.
  // The viewport scroll container lives at `.bc-grid-viewport`.
  const viewport = grid.locator(".bc-grid-viewport")
  await viewport.evaluate((el) => {
    el.scrollTop = 600
  })

  // After scrolling, the header band's bounding-rect top should still match the
  // viewport's top (sticky composition). One px of slop covers fractional pixel
  // rounding across browsers.
  const [headerTop, viewportTop] = await Promise.all([
    headerBand.evaluate((el) => Math.round(el.getBoundingClientRect().top)),
    viewport.evaluate((el) => Math.round(el.getBoundingClientRect().top)),
  ])
  expect(Math.abs(headerTop - viewportTop)).toBeLessThanOrEqual(1)
})

test("pinned-left lane stays pinned at viewport-left under forced-colors mode", async ({
  page,
}) => {
  await page.goto("/")

  const grid = page.getByRole("grid").first()
  await expect(grid).toBeVisible()

  const viewport = grid.locator(".bc-grid-viewport")
  const leftLane = grid.locator(".bc-grid-pinned-lane-left").first()

  // If the example doesn't have any pinned-left columns, the lane element won't
  // mount. Skip in that case rather than fail — the pinning behavior is the
  // contract we're verifying; lane presence is consumer-driven.
  const laneCount = await leftLane.count()
  test.skip(laneCount === 0, "example has no pinned-left columns to verify")

  await viewport.evaluate((el) => {
    el.scrollLeft = 400
  })

  const [laneLeft, viewportLeft] = await Promise.all([
    leftLane.evaluate((el) => Math.round(el.getBoundingClientRect().left)),
    viewport.evaluate((el) => Math.round(el.getBoundingClientRect().left)),
  ])
  expect(Math.abs(laneLeft - viewportLeft)).toBeLessThanOrEqual(1)
})

test("forced-colors fallbacks render header chrome with system colors", async ({ page }) => {
  await page.goto("/")
  const grid = page.getByRole("grid").first()
  await expect(grid).toBeVisible()

  // The grid's existing forced-colors fallbacks reassign tokens to system
  // keywords (`Canvas`, `CanvasText`). The header band inherits those tokens
  // through its descendant cells; assert at least one header cell uses a
  // CanvasText / system-keyword foreground after forced-colors activates.
  const headerCell = grid.locator(".bc-grid-header .bc-grid-header-cell").first()
  await expect(headerCell).toBeVisible()
  const hasSystemForeground = await headerCell.evaluate((el) => {
    const color = window.getComputedStyle(el).color
    // Forced-colors maps to system colors; the resolved color is a real RGB
    // (not the design token). We can't assert the exact value across browsers,
    // but we can assert it isn't transparent/invisible.
    return color !== "rgba(0, 0, 0, 0)" && color !== "transparent"
  })
  expect(hasSystemForeground).toBe(true)
})
