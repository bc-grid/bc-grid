import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { BcGrid } from "../src/grid"
import type { BcGridColumn, BcGridFilter, BcGridSort } from "../src/types"

interface Row {
  id: string
  name: string
  status: "active" | "inactive"
}

const columns: readonly BcGridColumn<Row>[] = [
  { columnId: "id", field: "id", header: "Id", width: 80 },
  {
    columnId: "name",
    field: "name",
    filter: { type: "text" },
    header: "Name",
    width: 160,
  },
  {
    columnId: "status",
    field: "status",
    filter: { type: "set" },
    header: "Status",
    width: 120,
  },
]

const unsortedRows: readonly Row[] = [
  { id: "b", name: "Bravo", status: "inactive" },
  { id: "a", name: "Acme", status: "active" },
  { id: "c", name: "Charlie", status: "active" },
]

function renderGrid(
  props: {
    rowProcessingMode?: "client" | "manual"
    sort?: readonly BcGridSort[]
    filter?: BcGridFilter | null
    searchText?: string
    groupBy?: readonly string[]
    groupableColumns?: readonly { columnId: string; header: string }[]
    data?: readonly Row[]
    showInactive?: boolean
    rowIsInactive?: (row: Row) => boolean
    defaultFilter?: BcGridFilter | null
    onFilterChange?: ((next: BcGridFilter | null, prev: BcGridFilter | null) => void) | undefined
    pageSize?: number
    pagination?: boolean
  } = {},
): string {
  const {
    data = unsortedRows,
    sort,
    filter,
    searchText,
    groupBy,
    groupableColumns,
    rowProcessingMode,
    showInactive,
    rowIsInactive,
    defaultFilter,
    onFilterChange,
    pageSize,
    pagination,
  } = props
  return renderToStaticMarkup(
    <BcGrid<Row>
      ariaLabel="Customers"
      columns={columns}
      data={data}
      groupBy={groupBy}
      groupableColumns={groupableColumns}
      height={400}
      rowId={(row) => row.id}
      rowProcessingMode={rowProcessingMode}
      sort={sort}
      filter={filter}
      defaultFilter={defaultFilter}
      onFilterChange={onFilterChange}
      pageSize={pageSize}
      pagination={pagination}
      searchText={searchText}
      showInactive={showInactive}
      rowIsInactive={rowIsInactive}
    />,
  )
}

function dataRowIdsInOrder(html: string): string[] {
  const matches = html.matchAll(/data-bc-grid-row-kind="data"[^>]*data-row-id="([^"]+)"/g)
  const fromKindFirst: string[] = []
  for (const match of matches) {
    if (match[1]) fromKindFirst.push(match[1])
  }
  if (fromKindFirst.length > 0) return fromKindFirst
  // Fallback: row id may appear before kind depending on attribute order.
  const fallback: string[] = []
  for (const match of html.matchAll(/data-row-id="([^"]+)"[^>]*data-bc-grid-row-kind="data"/g)) {
    if (match[1]) fallback.push(match[1])
  }
  return fallback
}

function groupRowCount(html: string): number {
  return Array.from(html.matchAll(/data-bc-grid-row-kind="group"/g)).length
}

describe("BcGrid rowProcessingMode — default 'client'", () => {
  test("client mode applies sort transform to data", () => {
    const html = renderGrid({ sort: [{ columnId: "name", direction: "asc" }] })
    expect(dataRowIdsInOrder(html)).toEqual(["a", "b", "c"])
  })

  test("client mode applies filter transform to data", () => {
    const filter: BcGridFilter = {
      columnId: "status",
      kind: "column",
      op: "in",
      type: "set",
      values: ["active"],
    }
    const html = renderGrid({ filter })
    expect(dataRowIdsInOrder(html)).toEqual(["a", "c"])
  })

  test("filter={undefined} and onFilterChange={undefined} behave like omitted props", () => {
    const maybeFilter: BcGridFilter | null | undefined = undefined
    const maybeOnFilterChange:
      | ((next: BcGridFilter | null, prev: BcGridFilter | null) => void)
      | undefined = undefined
    const defaultFilter: BcGridFilter = {
      columnId: "status",
      kind: "column",
      op: "in",
      type: "set",
      values: ["active"],
    }

    const html = renderGrid({
      defaultFilter,
      filter: maybeFilter,
      onFilterChange: maybeOnFilterChange,
    })

    expect(dataRowIdsInOrder(html)).toEqual(["a", "c"])
  })

  test("client mode applies search transform to data", () => {
    const html = renderGrid({ searchText: "acme" })
    expect(dataRowIdsInOrder(html)).toEqual(["a"])
  })

  test("client mode applies grouping transform when groupBy is set", () => {
    const html = renderGrid({
      groupableColumns: [{ columnId: "status", header: "Status" }],
      groupBy: ["status"],
    })
    expect(groupRowCount(html)).toBeGreaterThan(0)
  })

  test("client grouping computes counts before page-window slicing", () => {
    const html = renderGrid({
      groupableColumns: [{ columnId: "status", header: "Status" }],
      groupBy: ["status"],
      pageSize: 2,
      pagination: true,
    })

    expect(groupRowCount(html)).toBe(2)
    expect(html).toContain("Status: active")
    expect(html).toContain("(2)")
  })
})

describe("BcGrid rowProcessingMode — 'manual'", () => {
  test("preserves row order regardless of sort prop", () => {
    const html = renderGrid({
      rowProcessingMode: "manual",
      sort: [{ columnId: "name", direction: "asc" }],
    })
    expect(dataRowIdsInOrder(html)).toEqual(["b", "a", "c"])
  })

  test("does not client-filter rows even when filter prop is set", () => {
    const filter: BcGridFilter = {
      columnId: "status",
      kind: "column",
      op: "in",
      type: "set",
      values: ["active"],
    }
    const html = renderGrid({ rowProcessingMode: "manual", filter })
    expect(dataRowIdsInOrder(html)).toEqual(["b", "a", "c"])
  })

  test("does not client-search rows even when searchText is set", () => {
    const html = renderGrid({ rowProcessingMode: "manual", searchText: "acme" })
    expect(dataRowIdsInOrder(html)).toEqual(["b", "a", "c"])
  })

  test("does not synthesize group rows when groupBy is set", () => {
    const html = renderGrid({
      rowProcessingMode: "manual",
      groupableColumns: [{ columnId: "status", header: "Status" }],
      groupBy: ["status"],
    })
    expect(groupRowCount(html)).toBe(0)
    expect(dataRowIdsInOrder(html)).toEqual(["b", "a", "c"])
  })

  test("respects showInactive=false (host-owned filter contract is separate from chrome filter)", () => {
    // showInactive is the consumer-controlled "active filter" convention,
    // not chrome filter state. Manual row processing must still honor it
    // because it is the only way a server-backed grid can hide soft-
    // deleted rows the host already loaded but does not want shown.
    const html = renderGrid({
      rowProcessingMode: "manual",
      showInactive: false,
      rowIsInactive: (row) => row.status === "inactive",
    })
    expect(dataRowIdsInOrder(html)).toEqual(["a", "c"])
  })

  test("preserves chrome state — header sort indicator reflects sort prop", () => {
    const html = renderGrid({
      rowProcessingMode: "manual",
      sort: [{ columnId: "name", direction: "asc" }],
    })
    expect(html).toContain('aria-sort="ascending"')
    // Chrome state stays controlled even though the rows themselves
    // are not re-sorted; the host owns row order.
    expect(dataRowIdsInOrder(html)).toEqual(["b", "a", "c"])
  })

  test("client mode default still applies sort when prop is omitted", () => {
    // Regression guard: omitting `rowProcessingMode` must keep the
    // existing client-side behavior so non-server consumers are not
    // affected by this contract.
    const html = renderGrid({ sort: [{ columnId: "name", direction: "asc" }] })
    expect(dataRowIdsInOrder(html)).toEqual(["a", "b", "c"])
  })
})
