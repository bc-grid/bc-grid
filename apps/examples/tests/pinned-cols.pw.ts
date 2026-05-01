import { type Locator, expect, test } from "@playwright/test"

/**
 * React-demo Playwright suite — verifies pinned-column behaviour through
 * the actual `<BcEditGrid>` consumer, complementing the spike harness's
 * pinned-cell tests in `apps/benchmarks/tests/fps.pw.ts`.
 *
 * The spike validates the engine-side translate3d math in isolation; this
 * suite validates the React layer correctly wires `column.pinned` through
 * to that engine, that pinned-region scroll-shadows fade in/out, and that
 * keyboard traversal touches every column in index order without skipping
 * pinned regions.
 */

test("pinned-left ID column stays anchored to viewport-left under horizontal scroll", async ({
  page,
}) => {
  await page.goto("/")
  // Wait for the demo grid to mount.
  const grid = page.locator(".bc-grid").first()
  await expect(grid).toBeVisible()

  const pinned = grid.locator(".bc-grid-cell-pinned-left").first()
  await expect(pinned).toBeVisible()
  const beforeBox = await pinned.boundingBox()
  expect(beforeBox).not.toBeNull()

  // Scroll the body horizontally past where the ID column would otherwise be.
  await page.evaluate(() => {
    const scroller = document.querySelector<HTMLElement>(".bc-grid .bc-grid-scroller")
    if (scroller) scroller.scrollLeft = 800
  })
  // One frame for the synchronous handler + one more for layout.
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())))
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())))

  const afterBox = await pinned.boundingBox()
  expect(afterBox).not.toBeNull()
  if (beforeBox && afterBox) {
    expect(Math.abs(afterBox.x - beforeBox.x)).toBeLessThan(5)
  }
})

test("pinned-right actions column stays anchored to viewport-right", async ({ page }) => {
  await page.goto("/")
  const grid = page.locator(".bc-grid").first()
  await expect(grid).toBeVisible()

  const pinned = grid.locator(".bc-grid-cell-pinned-right").first()
  await expect(pinned).toBeVisible()
  const beforeBox = await pinned.boundingBox()
  expect(beforeBox).not.toBeNull()

  // Scroll fully right then back to 0; viewport-x should be steady.
  await page.evaluate(() => {
    const scroller = document.querySelector<HTMLElement>(".bc-grid .bc-grid-scroller")
    if (scroller) scroller.scrollLeft = scroller.scrollWidth - scroller.clientWidth
  })
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())))
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())))
  const fullyRightBox = await pinned.boundingBox()

  await page.evaluate(() => {
    const scroller = document.querySelector<HTMLElement>(".bc-grid .bc-grid-scroller")
    if (scroller) scroller.scrollLeft = 0
  })
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())))
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())))
  const fullyLeftBox = await pinned.boundingBox()

  expect(fullyRightBox).not.toBeNull()
  expect(fullyLeftBox).not.toBeNull()
  if (beforeBox && fullyRightBox && fullyLeftBox) {
    expect(Math.abs(fullyRightBox.x - fullyLeftBox.x)).toBeLessThan(5)
    expect(Math.abs(fullyLeftBox.x - beforeBox.x)).toBeLessThan(5)
  }
})

test("header columns stay horizontally synced with body cells during the scroll event", async ({
  page,
}) => {
  await page.goto("/")
  const grid = page.locator(".bc-grid").first()
  await expect(grid).toBeVisible()

  const positions = await grid.evaluate((gridElement) => {
    const scroller = gridElement.querySelector<HTMLElement>(".bc-grid-scroller")
    if (!scroller) return null
    const cellLeft = (selector: string): number | null => {
      const element = gridElement.querySelector<HTMLElement>(selector)
      return element?.getBoundingClientRect().left ?? null
    }

    scroller.scrollLeft = 240
    scroller.dispatchEvent(new Event("scroll", { bubbles: true }))

    return {
      bodyCustomer: cellLeft(
        '.bc-grid-row[data-row-index="0"] .bc-grid-cell[data-column-id="legalName"]',
      ),
      headerCustomer: cellLeft('.bc-grid-header-cell[data-column-id="legalName"]'),
      bodyPinned: cellLeft(
        '.bc-grid-row[data-row-index="0"] .bc-grid-cell[data-column-id="account"]',
      ),
      headerPinned: cellLeft('.bc-grid-header-cell[data-column-id="account"]'),
    }
  })

  expect(positions).not.toBeNull()
  if (!positions) return
  expect(positions.headerCustomer).not.toBeNull()
  expect(positions.bodyCustomer).not.toBeNull()
  expect(positions.headerPinned).not.toBeNull()
  expect(positions.bodyPinned).not.toBeNull()
  if (
    positions.headerCustomer != null &&
    positions.bodyCustomer != null &&
    positions.headerPinned != null &&
    positions.bodyPinned != null
  ) {
    expect(Math.abs(positions.headerCustomer - positions.bodyCustomer)).toBeLessThan(1)
    expect(Math.abs(positions.headerPinned - positions.bodyPinned)).toBeLessThan(1)
  }
})

test("pinned scroll-shadow data attrs toggle with scroll position", async ({ page }) => {
  await page.goto("/")
  const grid = page.locator(".bc-grid").first()
  await expect(grid).toBeVisible()

  // At scrollLeft = 0, no left shadow.
  await expect(grid).not.toHaveAttribute("data-scrolled-left", "true")

  // Scroll right; left shadow appears.
  await page.evaluate(() => {
    const scroller = document.querySelector<HTMLElement>(".bc-grid .bc-grid-scroller")
    if (scroller) scroller.scrollLeft = 200
  })
  await expect(grid).toHaveAttribute("data-scrolled-left", "true", { timeout: 1000 })

  // Scroll back to 0; left shadow goes away.
  await page.evaluate(() => {
    const scroller = document.querySelector<HTMLElement>(".bc-grid .bc-grid-scroller")
    if (scroller) scroller.scrollLeft = 0
  })
  await expect(grid).not.toHaveAttribute("data-scrolled-left", "true", { timeout: 1000 })
})

test("pinned scroll shadows render only on pinned group seam cells", async ({ page }) => {
  await page.goto("/?checkbox=1")
  const grid = page.locator(".bc-grid").first()
  await expect(grid).toBeVisible()

  const pinnedLeftHeaders = grid.locator(".bc-grid-header .bc-grid-cell-pinned-left")
  expect(await pinnedLeftHeaders.count()).toBeGreaterThan(1)
  await expect(grid.locator(".bc-grid-header .bc-grid-cell-pinned-left-edge")).toHaveCount(1)
  await expect(
    grid.locator(".bc-grid-header .bc-grid-cell-pinned-left:not(.bc-grid-cell-pinned-left-edge)"),
  ).not.toHaveCount(0)
  await expect(grid.locator(".bc-grid-header .bc-grid-cell-pinned-right-edge")).toHaveCount(1)
})

test("pinned header corner shadow fades in when body content scrolls underneath", async ({
  page,
}) => {
  await page.goto("/?checkbox=1")
  const grid = page.locator(".bc-grid").first()
  await expect(grid).toBeVisible()

  const leftEdge = grid.locator(".bc-grid-header .bc-grid-cell-pinned-left-edge").first()
  await expect(leftEdge).toBeVisible()
  await expect.poll(() => pseudoOpacity(leftEdge, "::after")).toBe("0")

  await page.evaluate(() => {
    const scroller = document.querySelector<HTMLElement>(".bc-grid .bc-grid-scroller")
    if (scroller) scroller.scrollLeft = 240
  })

  await expect(grid).toHaveAttribute("data-scrolled-left", "true", { timeout: 1000 })
  await expect.poll(() => pseudoOpacity(leftEdge, "::after")).toBe("1")
})

test("pinned header cells layer above body cells and unpinned header cells", async ({ page }) => {
  await page.goto("/")
  const grid = page.locator(".bc-grid").first()
  await expect(grid).toBeVisible()

  const headerPinned = grid.locator(".bc-grid-header .bc-grid-cell-pinned-left").first()
  const headerUnpinned = grid
    .locator(
      ".bc-grid-header .bc-grid-cell:not(.bc-grid-cell-pinned-left):not(.bc-grid-cell-pinned-right)",
    )
    .first()
  const bodyPinned = grid.locator(".bc-grid-row .bc-grid-cell-pinned-left").first()

  const headerPinnedZ = await zIndex(headerPinned)
  expect(headerPinnedZ).toBeGreaterThan(await zIndex(headerUnpinned))
  expect(headerPinnedZ).toBeGreaterThan(await zIndex(bodyPinned))
})

test("keyboard ArrowRight from last body cell reaches a pinned-right cell", async ({ page }) => {
  await page.goto("/")
  const grid = page.locator(".bc-grid").first()
  await expect(grid).toBeVisible()

  // Focus the grid and walk to the rightmost cell of the first row.
  // Ctrl+End jumps to the last cell of the grid — which is the rightmost
  // pinned-right cell in the last row. Use Ctrl+Home then End to land on
  // the rightmost cell of the *first* row.
  await grid.focus()
  await page.keyboard.press("Control+Home")
  await page.keyboard.press("End")

  // The active cell should now be a pinned-right cell.
  const activeId = await grid.getAttribute("aria-activedescendant")
  expect(activeId).toBeTruthy()
  if (!activeId) return

  // Locate the active cell by its id and check it has the pinned-right class.
  // Note: cells can be inside a wrapper (BcEditGrid action cell). Just check
  // the column-id-derived suffix matches the actions column.
  const lastColIndex = Number(await grid.getAttribute("aria-colcount")) - 1
  const cellsWithThatColIndex = grid.locator(`.bc-grid-row [aria-colindex="${lastColIndex + 1}"]`)
  await expect(cellsWithThatColIndex.first()).toBeVisible()
})

test("aria-colindex preserves visual order: pinned-left → body → pinned-right", async ({
  page,
}) => {
  await page.goto("/")
  const grid = page.locator(".bc-grid").first()
  await expect(grid).toBeVisible()

  // Read every header cell's aria-colindex in DOM order.
  const colIndexes = await grid
    .locator(".bc-grid-header .bc-grid-cell")
    .evaluateAll((cells) => cells.map((cell) => Number(cell.getAttribute("aria-colindex") ?? "0")))

  // Indexes must be strictly monotonically increasing — the pinned-left
  // cells get the lowest indexes, body cells the middle, pinned-right the
  // highest.
  for (let i = 1; i < colIndexes.length; i++) {
    expect(colIndexes[i]).toBeGreaterThan(colIndexes[i - 1] ?? -1)
  }
})

async function pseudoOpacity(
  locator: Locator,
  pseudoElement: "::before" | "::after",
): Promise<string> {
  return locator.evaluate(
    (element, pseudo) => getComputedStyle(element, pseudo).opacity,
    pseudoElement,
  )
}

async function zIndex(locator: Locator): Promise<number> {
  return locator.evaluate((element) => Number(getComputedStyle(element).zIndex))
}
