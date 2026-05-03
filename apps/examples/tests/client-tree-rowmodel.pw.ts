import { expect, test } from "@playwright/test"

// Client tree row model happy-path Playwright spec for worker1 v06
// headline (RFC #438). Drives the BOM-style demo at `?clientTree=1`
// mounted in `apps/examples/src/client-tree.example.tsx` through
// expand/collapse + outline column rendering + chevron interaction.
//
// Worker rule: this `.pw.ts` was NOT run locally (workers do not run
// Playwright per `docs/AGENTS.md §6`). Coordinator runs it at
// review/merge.

const URL_WITH_DEMO = "/?clientTree=1"

test("client tree row model: outline column renders chevron + indent + child-count semantics", async ({
  page,
}) => {
  await page.goto(URL_WITH_DEMO)

  const grid = page.getByRole("grid", { name: "Client tree demo grid" })
  await expect(grid).toBeVisible()

  // The demo seeds expansion = { A, A-1, B } so:
  //   A (root, expanded)
  //   ├── A-1 (expanded)
  //   │   ├── A-1-a (leaf)
  //   │   └── A-1-b (leaf)
  //   └── A-2 (collapsed)
  //   B (root, expanded)
  //   └── B-1 (leaf)
  // Total visible rows: 7.

  // Root rows must be visible.
  await expect(grid.getByText(/Assembly A \(top-level\)/)).toBeVisible()
  await expect(grid.getByText(/Assembly B \(top-level\)/)).toBeVisible()

  // Expanded sub-assembly's children should be visible.
  await expect(grid.getByText(/Component A-1-a/)).toBeVisible()
  await expect(grid.getByText(/Component A-1-b/)).toBeVisible()

  // Collapsed sub-assembly's children must NOT be visible.
  await expect(grid.getByText(/Component A-2-a/)).toHaveCount(0)
})

test("clicking a chevron toggles the row's expansion", async ({ page }) => {
  await page.goto(URL_WITH_DEMO)

  const grid = page.getByRole("grid", { name: "Client tree demo grid" })
  await expect(grid).toBeVisible()

  // A-2 is collapsed in the seed; its child Component A-2-a should
  // not render initially.
  await expect(grid.getByText(/Component A-2-a/)).toHaveCount(0)

  // Click the chevron for the A-2 row.
  const a2Toggle = grid
    .locator(".bc-grid-row")
    .filter({ hasText: /Subassembly A-2/ })
    .locator(".bc-grid-tree-toggle")
  await a2Toggle.click()

  // Now A-2-a should render.
  await expect(grid.getByText(/Component A-2-a/)).toBeVisible()

  // Click again to collapse.
  await a2Toggle.click()
  await expect(grid.getByText(/Component A-2-a/)).toHaveCount(0)
})

test("Expand all / Collapse all buttons drive the full tree", async ({ page }) => {
  await page.goto(URL_WITH_DEMO)

  const grid = page.getByRole("grid", { name: "Client tree demo grid" })
  await expect(grid).toBeVisible()

  // Initially A-2 is collapsed.
  await expect(grid.getByText(/Component A-2-a/)).toHaveCount(0)

  // Expand all.
  await page.getByTestId("client-tree-expand-all").click()
  await expect(grid.getByText(/Component A-2-a/)).toBeVisible()
  await expect(grid.getByText(/Subassembly B-1/)).toBeVisible()

  // Collapse all.
  await page.getByTestId("client-tree-collapse-all").click()
  // Only roots should remain.
  await expect(grid.getByText(/Assembly A \(top-level\)/)).toBeVisible()
  await expect(grid.getByText(/Assembly B \(top-level\)/)).toBeVisible()
  await expect(grid.getByText(/Subassembly A-1/)).toHaveCount(0)
  await expect(grid.getByText(/Component A-2-a/)).toHaveCount(0)
})

test("indent grows with row level (visible padding-left increases per depth)", async ({ page }) => {
  await page.goto(URL_WITH_DEMO)

  const grid = page.getByRole("grid", { name: "Client tree demo grid" })
  await expect(grid).toBeVisible()

  const rootCell = grid
    .locator(".bc-grid-cell-outline")
    .filter({ hasText: /Assembly A/ })
    .first()
  const childCell = grid
    .locator(".bc-grid-cell-outline")
    .filter({ hasText: /Subassembly A-1/ })
    .first()
  const grandchildCell = grid
    .locator(".bc-grid-cell-outline")
    .filter({ hasText: /Component A-1-a/ })
    .first()

  const rootPad = await rootCell.evaluate(
    (el) => Number.parseInt(window.getComputedStyle(el).paddingLeft, 10) || 0,
  )
  const childPad = await childCell.evaluate(
    (el) => Number.parseInt(window.getComputedStyle(el).paddingLeft, 10) || 0,
  )
  const grandchildPad = await grandchildCell.evaluate(
    (el) => Number.parseInt(window.getComputedStyle(el).paddingLeft, 10) || 0,
  )

  // Each level should add the indent step (default 20px). Use >= so a
  // future bump in the indent token doesn't fail this spec.
  expect(childPad).toBeGreaterThan(rootPad)
  expect(grandchildPad).toBeGreaterThan(childPad)
})

test("leaf rows render a spacer (no chevron) where the toggle would be", async ({ page }) => {
  await page.goto(URL_WITH_DEMO)
  const grid = page.getByRole("grid", { name: "Client tree demo grid" })
  await expect(grid).toBeVisible()

  // A-1-a is a leaf — no children → no chevron, just a spacer for
  // visual alignment with sibling rows that DO have chevrons.
  const leafRow = grid.locator(".bc-grid-row").filter({ hasText: /Component A-1-a/ })
  await expect(leafRow.locator(".bc-grid-tree-toggle")).toHaveCount(0)
  await expect(leafRow.locator(".bc-grid-tree-leaf-spacer")).toHaveCount(1)
})
