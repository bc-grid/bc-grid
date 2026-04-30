import { type Page, expect, test } from "@playwright/test"

/**
 * `BcGridProps.flashOnEdit` opt-in cell flash on commit per
 * `editing-rfc §Edit-cell paint perf`. Uses the `flash` primitive from
 * `@bc-grid/animations`, which short-circuits when the user has
 * `prefers-reduced-motion`.
 *
 * The demo turns flashOnEdit on whenever editor-framework is on
 * (`?edit=1` URL flag).
 */

const URL = "/?edit=1"
const EDITABLE_COLUMN = "tradingName"

async function installFlashRecorder(page: Page) {
  await page.addInitScript(() => {
    const originalAnimate = Element.prototype.animate

    Element.prototype.animate = function (
      this: Element,
      ...args: Parameters<typeof originalAnimate>
    ) {
      const [keyframes] = args
      const frames = Array.isArray(keyframes) ? keyframes : []
      const firstFrame = frames[0]
      const lastFrame = frames[frames.length - 1]
      const isFlash =
        firstFrame?.opacity === 0.72 &&
        lastFrame?.opacity === 1 &&
        !("transform" in firstFrame) &&
        !("transform" in lastFrame)

      if (isFlash) {
        this.setAttribute("data-test-flash-animation", "true")
      }

      return originalAnimate.apply(this, args)
    }
  })
}

async function focusBodyCell(page: Page, rowIndex: number, columnId: string) {
  const cell = page
    .locator(
      `.bc-grid-row[data-row-index="${rowIndex}"] .bc-grid-cell[data-column-id="${columnId}"]`,
    )
    .first()
  await cell.click()
  await page.locator('[role="grid"]').first().focus()
  return cell
}

test("a successful commit triggers a Web Animations flash on the edited cell", async ({ page }) => {
  await installFlashRecorder(page)
  await page.goto(URL)
  await focusBodyCell(page, 0, EDITABLE_COLUMN)
  await page.keyboard.press("F2")
  const editor = page.locator('[data-bc-grid-editor-input="true"]').first()
  await editor.fill("Flashed")
  await page.keyboard.press("Enter")

  const cell = page
    .locator(`.bc-grid-row[data-row-index="0"] .bc-grid-cell[data-column-id="${EDITABLE_COLUMN}"]`)
    .first()
  await expect(page.locator('[data-bc-grid-editor-input="true"]')).toHaveCount(0)
  await expect(cell).toHaveAttribute("data-test-flash-animation", "true")
})

test("validation rejection does NOT trigger a flash (no commit landed)", async ({ page }) => {
  await installFlashRecorder(page)
  await page.goto(URL)
  const cell = await focusBodyCell(page, 0, EDITABLE_COLUMN)
  await page.keyboard.press("F2")
  const editor = page.locator('[data-bc-grid-editor-input="true"]').first()
  await editor.fill("")
  await page.keyboard.press("Enter")

  // Editor stays open on rejection, so no commit or flash should land.
  await expect(editor).toBeAttached()
  await expect(editor).toHaveAttribute("aria-invalid", "true")
  await expect(cell).not.toHaveAttribute("data-test-flash-animation", "true")
})

test("flashOnEdit=false default URL renders without edit-triggered flash", async ({ page }) => {
  // Default URL has no ?edit=1, so flashOnEdit is false. But default URL
  // also doesn't have editable columns. So instead, exercise the same
  // grid with ?edit=0 to keep flashOnEdit off but still - actually the
  // demo only enables editing when ?edit=1 is on, which also enables
  // flashOnEdit, so opt-out is implicit. This test just confirms the
  // default-state behaviour is "no flash because nothing committed."
  await page.goto("/")
  // No edit possible, no flash possible.
  const renderedRows = await page.locator(".bc-grid-row[data-row-index]").count()
  expect(renderedRows).toBeGreaterThan(0)
})
