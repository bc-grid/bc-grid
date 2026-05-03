import { expect, test } from "@playwright/test"

/**
 * `BcGridProps.initialScrollOffset` + `onScrollChange` +
 * `BcGridApi.getScrollOffset` — round-trip the user's scroll position
 * across navigation. v0.6.0-alpha.1 critical
 * (`v06-scroll-state-controlled-prop`). Recipe doc:
 * `docs/recipes/grid-state-persistence.md`.
 *
 * Two scenarios:
 *   1. **Round-trip via fixture** — scroll the demo grid, navigate
 *      away, navigate back; assert scroll position restored.
 *   2. **Debounced onScrollChange** — scroll continuously; assert
 *      onScrollChange fires once (not per-tick) and reports the
 *      final settled position.
 *
 * Both stubs are `test.skip` pending an example-app fixture wiring
 * `initialScrollOffset` + `onScrollChange` against sessionStorage
 * with a route that round-trips. Coordinator: unskip once the
 * fixture lands (see PR description for the wiring requirement).
 */

const URL = "/?scroll-state=1"

test.skip("scroll position round-trips via initialScrollOffset + onScrollChange", async ({
  page,
}) => {
  await page.goto(URL)

  const scroller = page.locator(".bc-grid .bc-grid-viewport").first()

  // Scroll to a known position.
  await scroller.evaluate((el) => {
    el.scrollTop = 480
  })
  // Wait for the debounce to flush (~120ms internal + headroom).
  await page.waitForTimeout(250)

  // Navigate away + back. The fixture's persistence handler should
  // have written sessionStorage; the second mount restores from it.
  await page.goto("about:blank")
  await page.goto(URL)

  const restored = await page
    .locator(".bc-grid .bc-grid-viewport")
    .first()
    .evaluate((el) => el.scrollTop)
  expect(restored).toBe(480)
})

test.skip("onScrollChange debounces to one call after a continuous scroll", async ({ page }) => {
  await page.goto(URL)

  // Fixture exposes a counter incremented by onScrollChange.
  await page.evaluate(() => {
    window.__bcScrollChangeCount = 0
  })

  const scroller = page.locator(".bc-grid .bc-grid-viewport").first()
  // Scroll five times in quick succession — should coalesce to one
  // onScrollChange call after the debounce settles.
  for (const top of [100, 200, 300, 400, 500]) {
    await scroller.evaluate((el, t) => {
      el.scrollTop = t
    }, top)
    await page.waitForTimeout(20)
  }
  // Now wait long enough for the debounce to flush.
  await page.waitForTimeout(250)

  const count = await page.evaluate(() => window.__bcScrollChangeCount as number)
  expect(count).toBe(1)
})

declare global {
  interface Window {
    __bcScrollChangeCount?: number
  }
}
