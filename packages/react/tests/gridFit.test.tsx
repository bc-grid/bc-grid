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

const rows: readonly Row[] = [
  { id: "1", name: "Acme" },
  { id: "2", name: "Globex" },
]

function renderGrid(props: { fit?: "content" | "viewport" | "auto"; height?: "auto" | number }) {
  return renderToStaticMarkup(
    <BcGrid<Row>
      ariaLabel="Customers"
      columns={columns}
      data={rows}
      rowId={(row) => row.id}
      {...props}
    />,
  )
}

describe("BcGrid fit prop", () => {
  test("content fit renders in page-flow height mode", () => {
    const html = renderGrid({ fit: "content" })

    expect(html).toContain('data-bc-grid-fit="content"')
    expect(html).toContain('data-bc-grid-height-mode="auto"')
  })

  test("viewport fit renders with a fixed fallback before browser measurement", () => {
    const html = renderGrid({ fit: "viewport" })

    expect(html).toContain('data-bc-grid-fit="viewport"')
    expect(html).toContain('data-bc-grid-height-mode="fixed"')
  })

  test("explicit height wins over fit", () => {
    const html = renderGrid({ fit: "content", height: 240 })

    expect(html).toContain('data-bc-grid-fit="content"')
    expect(html).toContain('data-bc-grid-height-mode="fixed"')
    expect(html).toContain("height:240px")
  })
})
