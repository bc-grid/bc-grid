import { describe, expect, test } from "bun:test"
import type { BcGridFilter, ServerViewState } from "@bc-grid/core"
import { createServerRowModel } from "@bc-grid/server-row-model"
import {
  resolveServerPagedGridShell,
  resolveServerPagedRequestPage,
  resolveServerVisibleColumns,
  shouldResetServerPagedPage,
} from "../src/serverGrid"
import type { BcReactGridColumn } from "../src/types"

interface Row {
  id: string
  name: string
  status: string
}

const pageRows: readonly Row[] = Array.from({ length: 25 }, (_, index) => ({
  id: `customer-${index + 51}`,
  name: `Customer ${index + 51}`,
  status: "active",
}))

describe("server paged grid shell", () => {
  test("uses server totalRows for page count and keeps current page rows intact", () => {
    const shell = resolveServerPagedGridShell({
      pageIndex: 2,
      pageSize: 25,
      pageSizeOptions: [10, 25, 50],
      pagination: true,
      rows: pageRows,
      totalRows: 137,
    })

    expect(shell.gridRows).toBe(pageRows)
    expect(shell.gridPagination).toBe(false)
    expect(shell.paginationEnabled).toBe(true)
    expect(shell.paginationWindow).toEqual({
      endIndex: 75,
      page: 2,
      pageCount: 6,
      pageSize: 25,
      startIndex: 50,
      totalRows: 137,
    })
  })

  test("auto pagination follows server totalRows rather than loaded page length", () => {
    expect(
      resolveServerPagedGridShell({
        pageIndex: 0,
        pageSize: 25,
        pagination: undefined,
        rows: pageRows,
        totalRows: 25,
      }).paginationEnabled,
    ).toBe(false)

    expect(
      resolveServerPagedGridShell({
        pageIndex: 0,
        pageSize: 25,
        pagination: undefined,
        rows: pageRows,
        totalRows: 26,
      }).paginationEnabled,
    ).toBe(true)
  })
})

describe("server paged query reset semantics", () => {
  const model = createServerRowModel<Row>()
  const baseView: ServerViewState = model.createViewState({
    groupBy: [],
    sort: [],
    visibleColumns: ["id", "name", "status"],
  })
  const baseViewKey = model.createViewKey(baseView)

  function viewKeyFor(view: ServerViewState): string {
    return model.createViewKey(view)
  }

  test("resets requested page to zero when sort/filter/search/group/visible columns change", () => {
    const filter: BcGridFilter = {
      columnId: "status",
      kind: "column",
      op: "in",
      type: "set",
      values: ["active"],
    }
    const changedViews: readonly ServerViewState[] = [
      model.createViewState({
        groupBy: [],
        sort: [{ columnId: "name", direction: "asc" }],
        visibleColumns: ["id", "name", "status"],
      }),
      model.createViewState({
        filter,
        groupBy: [],
        sort: [],
        visibleColumns: ["id", "name", "status"],
      }),
      model.createViewState({
        groupBy: [],
        searchText: "acme",
        sort: [],
        visibleColumns: ["id", "name", "status"],
      }),
      model.createViewState({
        groupBy: ["status"],
        sort: [],
        visibleColumns: ["id", "name", "status"],
      }),
      model.createViewState({
        groupBy: [],
        sort: [],
        visibleColumns: ["id", "name"],
      }),
    ]

    for (const view of changedViews) {
      const viewKey = viewKeyFor(view)
      expect(
        resolveServerPagedRequestPage({ pageIndex: 3, previousViewKey: baseViewKey, viewKey }),
      ).toBe(0)
      expect(
        shouldResetServerPagedPage({ pageIndex: 3, previousViewKey: baseViewKey, viewKey }),
      ).toBe(true)
    }
  })

  test("keeps the requested page for the same view or when already on page zero", () => {
    expect(
      resolveServerPagedRequestPage({
        pageIndex: 3,
        previousViewKey: baseViewKey,
        viewKey: baseViewKey,
      }),
    ).toBe(3)
    expect(
      shouldResetServerPagedPage({
        pageIndex: 3,
        previousViewKey: baseViewKey,
        viewKey: baseViewKey,
      }),
    ).toBe(false)
    expect(
      shouldResetServerPagedPage({
        pageIndex: 0,
        previousViewKey: baseViewKey,
        viewKey: viewKeyFor({ ...baseView, search: "acme" }),
      }),
    ).toBe(false)
  })
})

describe("server paged visible columns", () => {
  const columns: readonly BcReactGridColumn<Row>[] = [
    { field: "id", header: "ID" },
    { columnId: "name", field: "name", header: "Name" },
    { columnId: "status", field: "status", header: "Status", hidden: true },
  ]

  test("derives visible columns from source columns plus column state", () => {
    expect(
      resolveServerVisibleColumns(columns, [
        { columnId: "name", hidden: true },
        { columnId: "status", hidden: false },
      ]),
    ).toEqual(["id", "status"])
  })

  test("ignores non-visibility column state when building the server view", () => {
    expect(
      resolveServerVisibleColumns(columns, [
        { columnId: "id", pinned: "left" },
        { columnId: "name", width: 240 },
      ]),
    ).toEqual(["id", "name"])
  })
})
