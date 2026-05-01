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

function renderGrid(props: { loading?: boolean; loadingOverlay?: ReactNode } = {}): string {
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
