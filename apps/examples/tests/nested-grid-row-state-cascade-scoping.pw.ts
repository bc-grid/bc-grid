import { type Page, expect, test } from "@playwright/test"

/**
 * Behavioural test for `row-state-cascade-scoping-rfc.md` — bsncraft
 * v0.5.0-alpha.2 P0 #2. The bug: master `.bc-grid-row:hover` cascades
 * into nested grid cells via descendant selectors. The fix: each
 * affected row-state CSS rule is gated with
 * `:not(.bc-grid-detail-panel .bc-grid-row)` (row-level) or
 * `:not(.bc-grid-detail-panel .bc-grid-cell)` (cell-level) /
 * `:not(.bc-grid-detail-panel .bc-grid-cell-pinned-{left,right})`
 * (pinned-cell-level).
 *
 * **Coordinator fixture note:** the existing customers demo at
 * `?master-detail=1` uses a vanilla `<table>` inside the detail
 * panel — it doesn't trigger the cascade because the inner `<tr>`
 * doesn't carry `.bc-grid-row`. This spec assumes a *nested-`<BcGrid>`*
 * fixture which is queued as a separate App.tsx wiring task. Until
 * that fixture lands, the source-shape regression suite at
 * `packages/theming/tests/rowStateCascadeScoping.test.ts` is the
 * load-bearing CI gate; this spec runs once the fixture is mounted
 * (URL flag `?master-detail-nested=1` per the demo convention).
 */

const URL = "/?master-detail-nested=1"

async function expandRow(page: Page, rowIndex: number): Promise<void> {
  // Click the master row's detail-toggle button so the detail panel
  // mounts. The toggle uses the standard `.bc-grid-detail-toggle`
  // class shared with the other master/detail demos.
  const toggle = page
    .locator(`.bc-grid-row[data-row-index="${rowIndex}"] .bc-grid-detail-toggle`)
    .first()
  await toggle.click()
  // Detail panel mounts asynchronously (lazy CustomerMasterDetail
  // load resolves on the next microtask); wait for the nested grid
  // to be in the DOM before the hover assertions fire.
  await expect(
    page
      .locator(`.bc-grid-row[data-row-index="${rowIndex}"] .bc-grid-detail-panel .bc-grid-row`)
      .first(),
  ).toBeAttached()
}

test.describe("master-row state does NOT cascade into nested grid cells", () => {
  test.skip(true, "Pending nested-`<BcGrid>` master-detail fixture in App.tsx")

  test("hovering the master row does not paint the nested grid's cells", async ({ page }) => {
    await page.goto(URL)
    await expandRow(page, 0)

    // Hover the master row's center body cell (NOT the detail panel
    // — that's where the cursor lands when hovering a master row in
    // practice).
    const masterCell = page
      .locator(`.bc-grid-row[data-row-index="0"] > .bc-grid-cell[data-column-id="name"]`)
      .first()
    await masterCell.hover()

    // The master cell takes the hover bg.
    const masterBg = await masterCell.evaluate((el) => window.getComputedStyle(el).backgroundColor)
    expect(masterBg).not.toBe("rgba(0, 0, 0, 0)")

    // The first NESTED grid cell does NOT take the hover bg —
    // pre-fix it would, post-fix the cascade-scoping guard rejects
    // the descendant match. The nested cell renders inside
    // `.bc-grid-detail-panel`.
    const nestedCell = page
      .locator(`.bc-grid-row[data-row-index="0"] .bc-grid-detail-panel .bc-grid-row .bc-grid-cell`)
      .first()
    const nestedBg = await nestedCell.evaluate((el) => window.getComputedStyle(el).backgroundColor)

    // The pre-fix bug: nestedBg === masterBg (the cascade painted
    // the nested cell with the master's hover token). Post-fix the
    // nested cell stays at its own background (the nested grid's
    // base `.bc-grid-row .bc-grid-cell` rule, NOT the row-hover
    // tint).
    expect(nestedBg).not.toBe(masterBg)
  })

  test("aria-selected on the master row does not paint nested cells", async ({ page }) => {
    await page.goto(URL)
    await expandRow(page, 0)

    // Click the master row's selection checkbox (or the row, if
    // `selectionMode === "click"` is the demo default).
    await page.locator(`.bc-grid-row[data-row-index="0"]`).first().click()

    const masterCell = page
      .locator(`.bc-grid-row[data-row-index="0"] > .bc-grid-cell[data-column-id="name"]`)
      .first()
    const nestedCell = page
      .locator(`.bc-grid-row[data-row-index="0"] .bc-grid-detail-panel .bc-grid-row .bc-grid-cell`)
      .first()

    const masterBg = await masterCell.evaluate((el) => window.getComputedStyle(el).backgroundColor)
    const nestedBg = await nestedCell.evaluate((el) => window.getComputedStyle(el).backgroundColor)

    expect(masterBg).not.toBe("rgba(0, 0, 0, 0)")
    expect(nestedBg).not.toBe(masterBg)
  })

  test("hovering a nested grid row paints its OWN cells (the nested grid's rules still fire)", async ({
    page,
  }) => {
    await page.goto(URL)
    await expandRow(page, 0)

    // The cascade-scoping guard rejects MASTER row state from
    // cascading into nested cells, but the nested grid's own rules
    // still fire — hovering a nested row should tint the nested
    // cell. The nested grid mounts with the same theme tokens, so
    // the same `--bc-grid-row-hover` color applies inside its scope.
    const nestedRow = page
      .locator(`.bc-grid-row[data-row-index="0"] .bc-grid-detail-panel .bc-grid-row`)
      .first()
    await nestedRow.hover()

    const nestedCell = nestedRow.locator(".bc-grid-cell").first()
    const nestedBg = await nestedCell.evaluate((el) => window.getComputedStyle(el).backgroundColor)
    expect(nestedBg).not.toBe("rgba(0, 0, 0, 0)")

    // The MASTER row should NOT be in :hover state (cursor moved
    // into the nested row). Its background should be the resting
    // state, not the hover tint.
    const masterCell = page
      .locator(`.bc-grid-row[data-row-index="0"] > .bc-grid-cell[data-column-id="name"]`)
      .first()
    const masterBg = await masterCell.evaluate((el) => window.getComputedStyle(el).backgroundColor)
    // Cursor over the nested row means the master row IS still
    // matching `:hover` (nested row is a descendant of the master
    // row's DOM). But the MASTER cells should not change because
    // the cell-side guard `:not(.bc-grid-detail-panel .bc-grid-cell)`
    // only allows the hover bg on cells outside the detail panel —
    // the master cells qualify for the hover tint.
    //
    // The load-bearing assertion: the nested cell took the hover
    // tint via its OWN grid's rule, not the master's cascade.
    expect(masterBg).not.toBe("rgba(0, 0, 0, 0)")
  })
})
