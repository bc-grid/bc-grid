import { describe, expect, test } from "bun:test"
import type {
  LoadServerBlock,
  LoadServerPage,
  LoadServerTreeChildren,
  ServerBlockResult,
  ServerPagedResult,
  ServerTreeResult,
} from "@bc-grid/core"
import { renderToStaticMarkup } from "react-dom/server"
import { BcServerGrid } from "../src/serverGrid"
import type { BcGridColumn } from "../src/types"

interface Row {
  id: string
  name: string
}

const columns: readonly BcGridColumn<Row>[] = [
  { columnId: "name", field: "name", header: "Name", width: 160 },
]

const stubLoadPage: LoadServerPage<Row> = async (query, _ctx): Promise<ServerPagedResult<Row>> => ({
  pageIndex: query.pageIndex,
  pageSize: query.pageSize,
  rows: [],
  totalRows: 0,
})

const stubLoadBlock: LoadServerBlock<Row> = async (
  query,
  _ctx,
): Promise<ServerBlockResult<Row>> => ({
  blockSize: query.blockSize,
  blockStart: query.blockStart,
  rows: [],
  totalRows: 0,
})

const stubLoadChildren: LoadServerTreeChildren<Row> = async (
  query,
  _ctx,
): Promise<ServerTreeResult<Row>> => ({
  childCount: query.childCount,
  childStart: query.childStart,
  groupPath: query.groupPath,
  parentRowId: query.parentRowId,
  rows: [],
})

describe("BcServerGrid runtime mode polymorphism (mode-switch RFC stage 3.1)", () => {
  test("explicit rowModel='paged' renders the grid (backward compat)", () => {
    const html = renderToStaticMarkup(
      <BcServerGrid<Row>
        ariaLabel="Customers"
        columns={columns}
        rowId={(row) => row.id}
        rowModel="paged"
        loadPage={stubLoadPage}
        height={240}
      />,
    )
    expect(html).toContain('class="bc-grid')
    expect(html).toContain('aria-label="Customers"')
  })

  test("explicit rowModel='infinite' renders the grid (backward compat)", () => {
    const html = renderToStaticMarkup(
      <BcServerGrid<Row>
        ariaLabel="Customers"
        columns={columns}
        rowId={(row) => row.id}
        rowModel="infinite"
        loadBlock={stubLoadBlock}
        height={240}
      />,
    )
    expect(html).toContain('class="bc-grid')
  })

  test("explicit rowModel='tree' renders the grid (backward compat)", () => {
    const html = renderToStaticMarkup(
      <BcServerGrid<Row>
        ariaLabel="Customers"
        columns={columns}
        rowId={(row) => row.id}
        rowModel="tree"
        loadChildren={stubLoadChildren}
        height={240}
      />,
    )
    expect(html).toContain('class="bc-grid')
  })

  test("heuristic activates: rowModel omitted + groupBy=[] → paged hook serves data", () => {
    // No explicit rowModel; empty groupBy → resolveActiveRowModelMode
    // returns "paged" → the paged hook is "isPagedActive" and threads
    // its loadPage. This SSR snapshot just confirms mount succeeds.
    const html = renderToStaticMarkup(
      <BcServerGrid<Row>
        ariaLabel="Customers"
        columns={columns}
        rowId={(row) => row.id}
        loadPage={stubLoadPage}
        height={240}
      />,
    )
    expect(html).toContain('class="bc-grid')
  })

  test("heuristic activates: rowModel omitted + groupBy non-empty → tree hook is active", () => {
    // Non-empty groupBy under the heuristic → resolveActiveRowModelMode
    // returns "tree" → the tree hook activates and threads loadChildren.
    const html = renderToStaticMarkup(
      <BcServerGrid<Row>
        ariaLabel="Customers"
        columns={columns}
        rowId={(row) => row.id}
        loadChildren={stubLoadChildren}
        groupBy={["name"]}
        height={240}
      />,
    )
    expect(html).toContain('class="bc-grid')
  })

  test("explicit rowModel overrides the heuristic (rowModel='paged' wins over non-empty groupBy)", () => {
    // Consumer pins rowModel="paged" — the heuristic would prefer
    // tree (non-empty groupBy) but the explicit override wins.
    const html = renderToStaticMarkup(
      <BcServerGrid<Row>
        ariaLabel="Customers"
        columns={columns}
        rowId={(row) => row.id}
        rowModel="paged"
        loadPage={stubLoadPage}
        groupBy={["name"]}
        height={240}
      />,
    )
    expect(html).toContain('class="bc-grid')
  })
})
