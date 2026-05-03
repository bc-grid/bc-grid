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
import { useServerGrid } from "../src/useServerGrid"

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

function PagedHarness() {
  const grid = useServerGrid<Row>({
    gridId: "harness.paged",
    rowId: (row) => row.id,
    loadPage: stubLoadPage,
  })
  return (
    <BcServerGrid<Row> {...grid.props} ariaLabel="Paged harness" columns={columns} height={240} />
  )
}

function TreeHarness() {
  const grid = useServerGrid<Row>({
    gridId: "harness.tree",
    rowId: (row) => row.id,
    loadChildren: stubLoadChildren,
    initial: { groupBy: ["name"] },
  })
  return (
    <BcServerGrid<Row> {...grid.props} ariaLabel="Tree harness" columns={columns} height={240} />
  )
}

function InfiniteHarness() {
  const grid = useServerGrid<Row>({
    gridId: "harness.infinite",
    rowId: (row) => row.id,
    rowModel: "infinite",
    loadBlock: stubLoadBlock,
  })
  return (
    <BcServerGrid<Row>
      {...grid.props}
      ariaLabel="Infinite harness"
      columns={columns}
      height={240}
    />
  )
}

function PagedAndTreeHarness() {
  const grid = useServerGrid<Row>({
    gridId: "harness.both",
    rowId: (row) => row.id,
    loadPage: stubLoadPage,
    loadChildren: stubLoadChildren,
  })
  return (
    <BcServerGrid<Row> {...grid.props} ariaLabel="Both harness" columns={columns} height={240} />
  )
}

describe("useServerGrid SSR markup", () => {
  test("paged harness renders the grid chrome (no groupBy → paged mode)", () => {
    const html = renderToStaticMarkup(<PagedHarness />)
    expect(html).toContain('class="bc-grid')
    expect(html).toContain('aria-label="Paged harness"')
  })

  test("tree harness renders the grid chrome (initial.groupBy → tree mode)", () => {
    const html = renderToStaticMarkup(<TreeHarness />)
    expect(html).toContain('class="bc-grid')
    expect(html).toContain('aria-label="Tree harness"')
  })

  test("infinite harness renders the grid chrome (explicit rowModel override)", () => {
    const html = renderToStaticMarkup(<InfiniteHarness />)
    expect(html).toContain('class="bc-grid')
    expect(html).toContain('aria-label="Infinite harness"')
  })

  test("paged+tree harness mounts in paged mode by default (no groupBy)", () => {
    const html = renderToStaticMarkup(<PagedAndTreeHarness />)
    expect(html).toContain('class="bc-grid')
    expect(html).toContain('aria-label="Both harness"')
  })
})
