import { expect, test } from "@playwright/test"

/**
 * `<BcGrid onRowDragOver onRowDrop>` — HTML5 native row drag-and-drop
 * (v0.6 §1 row-drag-drop-hooks). Recipe doc:
 * `docs/recipes/row-drag-drop.md`.
 *
 * Two scenarios:
 *   1. **Reorder** — drag row 0 below row 2, assert the row appears
 *      at index 2 in the rendered DOM (consumer reorder fires).
 *   2. **Drop indicator** — during a drag, assert the hovered row
 *      carries `data-bc-grid-row-drop="before"|"after"|"into"`.
 *
 * Both stubs are `test.skip` pending an example-app fixture wiring
 * `onRowDragOver` + `onRowDrop` on a list-style demo with consumer-
 * owned state. Coordinator: unskip once the fixture lands (see PR
 * description for the wiring requirement). Playwright's drag-and-drop
 * API (`locator.dragTo`) drives HTML5 DnD natively in Chromium /
 * WebKit / Firefox — no custom dispatchEvent shim needed.
 */

const URL = "/?dnd=1"

test.skip("row drag reorders consumer state — drag row 0 to between rows 2 and 3", async ({
  page,
}) => {
  await page.goto(URL)

  const row0 = page.locator('.bc-grid-row[data-row-index="0"]').first()
  const row2 = page.locator('.bc-grid-row[data-row-index="2"]').first()

  // Capture the row-id at index 0 BEFORE the drag so we can assert
  // it landed at index 2 after.
  const draggedRowId = await row0.getAttribute("data-row-id")
  await row0.dragTo(row2, { targetPosition: { x: 50, y: 28 } }) // bottom third = "after"

  const rowAt2After = page.locator('.bc-grid-row[data-row-index="2"]').first()
  await expect(rowAt2After).toHaveAttribute("data-row-id", draggedRowId ?? "")
})

test.skip("data-bc-grid-row-drop reflects the live drop position during drag", async ({ page }) => {
  await page.goto(URL)

  const row0 = page.locator('.bc-grid-row[data-row-index="0"]').first()
  const row3 = page.locator('.bc-grid-row[data-row-index="3"]').first()

  // dragTo with targetPosition near the top of row 3 should produce
  // "before" on row 3 mid-drag. Playwright's dragTo executes a
  // single dispatched dragover before the drop; we'd assert the
  // attribute via a small custom drag stepping that pauses between
  // dragover and drop. For now this stub just pins the assertion
  // shape — the coordinator can flesh it out with the dnd-step
  // helper when wiring the fixture.
  await row0.dragTo(row3, { targetPosition: { x: 50, y: 4 } })
  await expect(row3).toHaveAttribute("data-bc-grid-row-drop", /before|after|into/)
})
