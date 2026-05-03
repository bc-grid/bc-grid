import { describe, expect, test } from "bun:test"
import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { BcGrid } from "../src/grid"
import type { BcGridColumn } from "../src/types"

interface Row {
  id: string
  name: string
}

const columns: readonly BcGridColumn<Row>[] = [
  {
    columnId: "name",
    field: "name",
    header: "Name",
    width: 160,
  },
]

function renderGrid(
  props: { loading?: boolean; loadingOverlay?: ReactNode; errorOverlay?: ReactNode } = {},
): string {
  return renderToStaticMarkup(
    <BcGrid<Row>
      ariaLabel="Customers"
      columns={columns}
      data={[]}
      height={240}
      rowId={(row) => row.id}
      {...props}
    />,
  )
}

describe("BcGrid loading overlay", () => {
  test("default loading overlay renders a spinner and visible label hooks", () => {
    const html = renderGrid({ loading: true })

    expect(html).toContain('class="bc-grid-overlay"')
    expect(html).toContain('class="bc-grid-loading-state"')
    expect(html).toContain('class="bc-grid-loading-spinner"')
    expect(html).toContain('aria-hidden="true"')
    expect(html).toContain('class="bc-grid-loading-label"')
    expect(html).toContain("Loading")
  })

  test("custom loadingOverlay remains consumer-owned", () => {
    const html = renderGrid({
      loading: true,
      loadingOverlay: <span data-testid="custom-loader">Fetching customers</span>,
    })

    expect(html).toContain('data-testid="custom-loader"')
    expect(html).toContain("Fetching customers")
    expect(html).not.toContain("bc-grid-loading-spinner")
  })
})

describe("BcGrid error overlay (worker1 v06 server-grid error boundary)", () => {
  test("errorOverlay renders inside bc-grid-overlay with role=alert when loading is false", () => {
    const html = renderGrid({
      errorOverlay: <span data-testid="boom">Server hiccup</span>,
    })
    expect(html).toContain('class="bc-grid-overlay" role="alert"')
    expect(html).toContain('data-testid="boom"')
    expect(html).toContain("Server hiccup")
    // No-rows fallback is suppressed when errorOverlay wins precedence.
    expect(html).not.toContain("No rows")
  })

  test("errorOverlay is suppressed while loading is true (loading wins)", () => {
    const html = renderGrid({
      loading: true,
      errorOverlay: <span data-testid="boom">Should not render</span>,
    })
    // Loading overlay renders inside bc-grid-overlay; error overlay does not.
    expect(html).toContain('class="bc-grid-overlay" role="status"')
    expect(html).not.toContain('data-testid="boom"')
  })

  test("no errorOverlay + zero rows + not loading → no-rows fallback renders", () => {
    const html = renderGrid()
    // bc-grid-overlay renders with status role + the noRowsLabel.
    expect(html).toContain('class="bc-grid-overlay" role="status"')
    expect(html).toContain("No rows")
    // No bc-grid-overlay with role="alert" when there's no errorOverlay.
    expect(html).not.toContain('class="bc-grid-overlay" role="alert"')
  })
})
