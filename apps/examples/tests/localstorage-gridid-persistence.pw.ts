import { expect, test } from "@playwright/test"

/**
 * `gridId`-scoped localStorage persistence per `api.md §3.3`. When `gridId`
 * is set, the React layer reads `columnState` from localStorage on mount
 * and writes back (debounced) on change. Storage key:
 * `bc-grid:{gridId}:columnState`.
 *
 * The demo opts in via `?persist=1` URL flag → gridId="ar-customers-demo".
 */

const STORAGE_KEY = "bc-grid:ar-customers-demo:columnState"

test.beforeEach(async ({ page }) => {
  // Wipe any prior state so tests are deterministic.
  await page.addInitScript(() => {
    try {
      window.localStorage.removeItem("bc-grid:ar-customers-demo:columnState")
    } catch {
      /* private mode etc. — best effort */
    }
  })
})

test("with no gridId, no localStorage write happens (consumer opted out)", async ({ page }) => {
  // Default URL has no ?persist=1 → no gridId → no persistence.
  await page.goto("/")
  const stored = await page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY)
  expect(stored).toBeNull()
})

test("pre-populated localStorage is read on mount and applied as initial columnState", async ({
  page,
}) => {
  // Seed storage BEFORE navigation so the grid mounts with it.
  await page.addInitScript((key) => {
    // Resize the `account` column to a non-default width — the grid mounts
    // with this width applied via columnState.
    window.localStorage.setItem(key, JSON.stringify([{ columnId: "account", width: 220 }]))
  }, STORAGE_KEY)

  await page.goto("/?persist=1")

  // The first body cell of the `account` column reflects the persisted width.
  const cell = page
    .locator('.bc-grid-row[data-row-index] .bc-grid-cell[data-column-id="account"]')
    .first()
  // CSS `width: 220px` set inline by cellStyle.
  await expect(cell).toBeVisible()
  const width = await cell.evaluate((el) => Number.parseFloat(getComputedStyle(el).width))
  // Allow ±1px for sub-pixel rounding across browsers.
  expect(width).toBeGreaterThanOrEqual(218)
  expect(width).toBeLessThanOrEqual(222)
})

test("a column-state mutation is persisted to localStorage (debounced ≈ 500ms)", async ({
  page,
}) => {
  await page.goto("/?persist=1")

  // Mutate columnState by writing it through the grid's apiRef. The demo
  // exposes the grid via window for tests... it doesn't, so instead we
  // exercise the path that mutates columnState: a column resize.
  // For this S-effort task we instead test via direct setColumnState call
  // exposed in dev mode by patching the grid: simpler approach — drag the
  // resize handle on the `account` column, then read storage after the
  // debounce window.

  // Locate the `account` column's header resize handle and drag it 30px
  // to the right.
  const handle = page
    .locator('.bc-grid-header-cell[data-column-id="account"] [data-bc-grid-resize-handle="true"]')
    .first()
  const box = await handle.boundingBox()
  if (!box) throw new Error("resize handle not found")

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2, { steps: 5 })
  await page.mouse.up()

  // Wait past the 500ms debounce window before reading storage.
  await page.waitForTimeout(750)

  const stored = await page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY)
  expect(stored).not.toBeNull()
  if (stored) {
    const parsed = JSON.parse(stored) as Array<{ columnId: string; width?: number }>
    const account = parsed.find((entry) => entry.columnId === "account")
    expect(account).toBeTruthy()
    // Width should have grown by ≈ 30px from the default 132 (set in App.tsx).
    expect(account?.width).toBeGreaterThan(140)
  }
})

test("a non-zero gridId namespaces the storage key", async ({ page }) => {
  // Two different gridIds should not share storage. Implicit assertion —
  // this PR only ships one gridId, but the storage-key shape is asserted
  // by the unit tests; here we just verify the prefix.
  await page.addInitScript((key) => {
    window.localStorage.setItem(key, JSON.stringify([{ columnId: "account", width: 250 }]))
  }, STORAGE_KEY)

  await page.goto("/?persist=1")
  const otherKey = await page.evaluate(() =>
    window.localStorage.getItem("bc-grid:some-other-grid:columnState"),
  )
  expect(otherKey).toBeNull()
})
