import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { BcGrid } from "../src/grid"
import type { BcGridColumn } from "../src/types"

interface Row {
  id: string
  name: string
}

const columns: readonly BcGridColumn<Row>[] = [
  { columnId: "name", field: "name", header: "Name", width: 160 },
]

// 30 rows so pagination auto-enables at the default 25 page size.
const rows: readonly Row[] = Array.from({ length: 30 }, (_, index) => ({
  id: `row-${index}`,
  name: `Row ${index}`,
}))

function renderGrid(
  props: {
    showPagination?: boolean
    pagination?: boolean
    pageSize?: number
  } = {},
): string {
  return renderToStaticMarkup(
    <BcGrid<Row>
      ariaLabel="Grid"
      columns={columns}
      data={rows}
      height={400}
      rowId={(row) => row.id}
      pageSize={props.pageSize ?? 25}
      pagination={props.pagination}
      showPagination={props.showPagination}
    />,
  )
}

describe("showPagination prop (vanilla-and-context-menu RFC §4)", () => {
  test("undefined (default) renders pagination chrome when pagination is enabled", () => {
    const html = renderGrid({ pagination: true })
    expect(html).toContain('class="bc-grid-pagination"')
  })

  test("true renders pagination chrome the same as undefined", () => {
    const html = renderGrid({ pagination: true, showPagination: true })
    expect(html).toContain('class="bc-grid-pagination"')
  })

  test("false hides the pagination chrome even when pagination is enabled", () => {
    const html = renderGrid({ pagination: true, showPagination: false })
    expect(html).not.toContain('class="bc-grid-pagination"')
  })

  test("false leaves page-window slicing intact (canvas reflects page size, not full dataset)", () => {
    const html = renderGrid({ pagination: true, showPagination: false })
    // Page-window slicing means aria-rowcount counts header + 25 page
    // rows = 26, NOT header + all 30 rows = 31. The pager chrome being
    // hidden does not change the underlying paged data shape.
    expect(html).toContain('aria-rowcount="26"')
    // First page still rows 0..24; row-25 lives on page 2 and is not
    // in the current-page DOM at all.
    expect(html).toContain('data-row-id="row-0"')
    expect(html).not.toContain('data-row-id="row-25"')
  })

  test("false on a non-paginated grid is a no-op (no chrome to hide either way)", () => {
    const html = renderGrid({ pagination: false, showPagination: false })
    expect(html).not.toContain('class="bc-grid-pagination"')
  })
})
