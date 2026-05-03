import { describe, expect, test } from "bun:test"
import type {
  BcGridFilter,
  ServerPagedQuery,
  ServerPagedResult,
  ServerSelection,
  ServerViewState,
} from "@bc-grid/core"
import { createServerRowModel } from "@bc-grid/server-row-model"
import {
  isActiveServerPagedResponse,
  resolveActiveRowModelMode,
  resolveMissingLoaderMessage,
  resolvePrefetchAhead,
  resolveScrollToServerCellAction,
  resolveServerPagedGridShell,
  resolveServerPagedRequestPage,
  resolveServerVisibleColumns,
  resolveTreeChildCount,
  resolveTreeRowCount,
  shouldMergeTreeResult,
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

const emptySelection: ServerSelection = { mode: "explicit", rowIds: new Set() }

function deferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason?: unknown) => void
} {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

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

  test("separates current page rows from the global server total", () => {
    const sparseLoadedRows = pageRows.slice(0, 7)
    const shell = resolveServerPagedGridShell({
      pageIndex: 12,
      pageSize: 25,
      pageSizeOptions: [25, 50, 100],
      pagination: true,
      rows: sparseLoadedRows,
      totalRows: 10_000,
    })

    expect(shell.gridRows).toBe(sparseLoadedRows)
    expect(shell.gridRows).toHaveLength(7)
    expect(shell.paginationWindow).toEqual({
      endIndex: 325,
      page: 12,
      pageCount: 400,
      pageSize: 25,
      startIndex: 300,
      totalRows: 10_000,
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

  test("passes a short last page through without client double-slicing", () => {
    const lastPageRows = pageRows.slice(0, 2)
    const shell = resolveServerPagedGridShell({
      pageIndex: 2,
      pageSize: 25,
      pagination: true,
      rows: lastPageRows,
      totalRows: 52,
    })

    expect(shell.gridPagination).toBe(false)
    expect(shell.gridRows).toBe(lastPageRows)
    expect(shell.paginationWindow).toMatchObject({
      endIndex: 52,
      page: 2,
      pageCount: 3,
      startIndex: 50,
      totalRows: 52,
    })
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

  test("keeps the requested page for pagination, refresh, and active-view invalidate", () => {
    const sameViewTransitions = [
      { pageIndex: 4, reason: "pagination" },
      { pageIndex: 2, reason: "refresh" },
      { pageIndex: 3, reason: "invalidate" },
    ] as const

    for (const transition of sameViewTransitions) {
      expect(
        resolveServerPagedRequestPage({
          pageIndex: transition.pageIndex,
          previousViewKey: baseViewKey,
          viewKey: baseViewKey,
        }),
      ).toBe(transition.pageIndex)
      expect(
        shouldResetServerPagedPage({
          pageIndex: transition.pageIndex,
          previousViewKey: baseViewKey,
          viewKey: baseViewKey,
        }),
      ).toBe(false)
    }
  })

  test("does not request a negative reset when already on page zero", () => {
    expect(
      resolveServerPagedRequestPage({
        pageIndex: 0,
        previousViewKey: baseViewKey,
        viewKey: viewKeyFor({ ...baseView, search: "acme" }),
      }),
    ).toBe(0)
    expect(
      shouldResetServerPagedPage({
        pageIndex: 0,
        previousViewKey: baseViewKey,
        viewKey: viewKeyFor({ ...baseView, search: "acme" }),
      }),
    ).toBe(false)
  })

  test("loadPage receives reset page plus complete active query model after view changes", async () => {
    const filter: BcGridFilter = {
      columnId: "status",
      kind: "column",
      op: "in",
      type: "set",
      values: ["active"],
    }
    const activeView = model.createViewState({
      filter,
      groupBy: ["status"],
      searchText: "acme",
      sort: [{ columnId: "name", direction: "asc" }],
      visibleColumns: ["id", "name"],
    })
    const activeViewKey = viewKeyFor(activeView)
    const pageIndex = resolveServerPagedRequestPage({
      pageIndex: 7,
      previousViewKey: baseViewKey,
      viewKey: activeViewKey,
    })
    let capturedQuery: ServerPagedQuery | undefined

    await model.loadPagedPage({
      loadPage: async (query) => {
        capturedQuery = query
        return {
          pageIndex: query.pageIndex,
          pageSize: query.pageSize,
          rows: pageRows.slice(0, query.pageSize),
          totalRows: 137,
          viewKey: query.viewKey,
        }
      },
      pageIndex,
      pageSize: 50,
      view: activeView,
      viewKey: activeViewKey,
    }).promise

    expect(capturedQuery).toMatchObject({
      mode: "paged",
      pageIndex: 0,
      pageSize: 50,
      viewKey: activeViewKey,
    })
    expect(capturedQuery?.view).toEqual(activeView)
    expect(capturedQuery?.view).toMatchObject({
      filter,
      groupBy: [{ columnId: "status" }],
      search: "acme",
      sort: [{ columnId: "name", direction: "asc" }],
      visibleColumns: ["id", "name"],
    })
  })

  test("sort/filter/search changes each reset to page zero with the active query payload", async () => {
    const filter: BcGridFilter = {
      columnId: "status",
      kind: "column",
      op: "in",
      type: "set",
      values: ["active"],
    }
    const scenarios = [
      {
        expected: { sort: [{ columnId: "name", direction: "desc" }] },
        view: model.createViewState({
          groupBy: [],
          sort: [{ columnId: "name", direction: "desc" }],
          visibleColumns: ["id", "name", "status"],
        }),
      },
      {
        expected: { filter },
        view: model.createViewState({
          filter,
          groupBy: [],
          sort: [],
          visibleColumns: ["id", "name", "status"],
        }),
      },
      {
        expected: { search: "acme" },
        view: model.createViewState({
          groupBy: [],
          searchText: "acme",
          sort: [],
          visibleColumns: ["id", "name", "status"],
        }),
      },
    ] as const

    for (const scenario of scenarios) {
      const viewKey = viewKeyFor(scenario.view)
      const pageIndex = resolveServerPagedRequestPage({
        pageIndex: 9,
        previousViewKey: baseViewKey,
        viewKey,
      })
      let capturedQuery: ServerPagedQuery | undefined

      await model.loadPagedPage({
        loadPage: async (query) => {
          capturedQuery = query
          return {
            pageIndex: query.pageIndex,
            pageSize: query.pageSize,
            rows: pageRows.slice(0, 3),
            totalRows: 137,
            viewKey: query.viewKey,
          }
        },
        pageIndex,
        pageSize: 25,
        view: scenario.view,
        viewKey,
      }).promise

      expect(pageIndex).toBe(0)
      expect(capturedQuery).toMatchObject({
        mode: "paged",
        pageIndex: 0,
        pageSize: 25,
        view: scenario.expected,
        viewKey,
      })
      expect(capturedQuery?.view.visibleColumns).toEqual(["id", "name", "status"])
    }
  })
})

describe("server paged stale response ordering", () => {
  test("keeps accepted page rows stable while server-owned sort/filter/search request is pending", async () => {
    const model = createServerRowModel<Row>()
    const baseView = model.createViewState({
      groupBy: [],
      sort: [],
      visibleColumns: ["id", "name", "status"],
    })
    const acceptedRows: Row[] = [
      { id: "b", name: "Bravo", status: "inactive" },
      { id: "a", name: "Acme", status: "active" },
    ]
    const acceptedRequest = model.loadPagedPage({
      loadPage: async (query) => ({
        pageIndex: query.pageIndex,
        pageSize: query.pageSize,
        rows: acceptedRows,
        totalRows: acceptedRows.length,
        viewKey: query.viewKey,
      }),
      pageIndex: 0,
      pageSize: 25,
      view: baseView,
    })
    const acceptedResult = await acceptedRequest.promise
    const acceptedGridRows = acceptedResult.rows

    const nextFilter: BcGridFilter = {
      columnId: "status",
      kind: "column",
      op: "in",
      type: "set",
      values: ["active"],
    }
    const nextView = model.createViewState({
      filter: nextFilter,
      groupBy: [],
      searchText: "ac",
      sort: [{ columnId: "name", direction: "asc" }],
      visibleColumns: ["id", "name", "status"],
    })
    const nextViewKey = model.createViewKey(nextView)
    const nextLoad = deferred<ServerPagedResult<Row>>()
    let capturedQuery: ServerPagedQuery | undefined
    const nextRequest = model.loadPagedPage({
      loadPage: (query) => {
        capturedQuery = query
        return nextLoad.promise
      },
      pageIndex: 0,
      pageSize: 25,
      view: nextView,
      viewKey: nextViewKey,
    })

    const loadingShell = resolveServerPagedGridShell({
      pageIndex: 0,
      pageSize: 25,
      pagination: true,
      rows: acceptedGridRows,
      totalRows: acceptedResult.totalRows,
    })
    expect(loadingShell.gridRows).toBe(acceptedGridRows)
    expect(loadingShell.gridRows.map((row) => row.id)).toEqual(["b", "a"])
    expect(capturedQuery?.view).toEqual(nextView)
    expect(capturedQuery?.view).toMatchObject({
      filter: nextFilter,
      search: "ac",
      sort: [{ columnId: "name", direction: "asc" }],
    })

    nextLoad.resolve({
      pageIndex: 0,
      pageSize: 25,
      rows: [{ id: "a", name: "Acme", status: "active" }],
      totalRows: 1,
      viewKey: nextViewKey,
    })
    const nextResult = await nextRequest.promise
    expect(nextResult.rows.map((row) => row.id)).toEqual(["a"])
  })

  test("accepts only the response for the latest active block key", async () => {
    const model = createServerRowModel<Row>()
    const firstView = model.createViewState({
      groupBy: [],
      sort: [],
      visibleColumns: ["id", "name", "status"],
    })
    const nextView = model.createViewState({
      groupBy: [],
      searchText: "acme",
      sort: [],
      visibleColumns: ["id", "name", "status"],
    })
    const firstRequest = model.loadPagedPage({
      loadPage: async (query) => ({
        pageIndex: query.pageIndex,
        pageSize: query.pageSize,
        rows: [{ id: "old", name: "Old", status: "inactive" }],
        totalRows: 1,
      }),
      pageIndex: 4,
      pageSize: 25,
      view: firstView,
    })
    const nextRequest = model.loadPagedPage({
      loadPage: async (query) => ({
        pageIndex: query.pageIndex,
        pageSize: query.pageSize,
        rows: [{ id: "new", name: "New", status: "active" }],
        totalRows: 1,
      }),
      pageIndex: 0,
      pageSize: 25,
      view: nextView,
    })
    const firstBlockKey = firstRequest.blockKey
    const nextBlockKey = nextRequest.blockKey

    expect(firstBlockKey).not.toBe(nextBlockKey)
    expect(
      isActiveServerPagedResponse({
        activeBlockKey: nextBlockKey,
        responseBlockKey: firstBlockKey,
      }),
    ).toBe(false)
    expect(
      isActiveServerPagedResponse({
        activeBlockKey: nextBlockKey,
        responseBlockKey: nextBlockKey,
      }),
    ).toBe(true)
    await Promise.all([firstRequest.promise, nextRequest.promise])
  })

  test("ignores a slow old response after a newer view request becomes active", async () => {
    const model = createServerRowModel<Row>()
    const firstView = model.createViewState({
      groupBy: [],
      sort: [],
      visibleColumns: ["id", "name", "status"],
    })
    const nextView = model.createViewState({
      groupBy: [],
      searchText: "acme",
      sort: [],
      visibleColumns: ["id", "name"],
    })
    const firstLoad = deferred<ServerPagedResult<Row>>()
    const nextLoad = deferred<ServerPagedResult<Row>>()
    const acceptedRows: string[] = []
    let activeBlockKey: string | null = null

    const firstRequest = model.loadPagedPage({
      loadPage: () => firstLoad.promise,
      pageIndex: 3,
      pageSize: 25,
      view: firstView,
    })
    activeBlockKey = firstRequest.blockKey
    const firstObserver = firstRequest.promise.then((result) => {
      if (
        isActiveServerPagedResponse({
          activeBlockKey,
          responseBlockKey: firstRequest.blockKey,
        })
      ) {
        acceptedRows.push(...result.rows.map((row) => row.id))
      }
    })

    const nextRequest = model.loadPagedPage({
      loadPage: () => nextLoad.promise,
      pageIndex: 0,
      pageSize: 25,
      view: nextView,
    })
    activeBlockKey = nextRequest.blockKey
    const nextObserver = nextRequest.promise.then((result) => {
      if (
        isActiveServerPagedResponse({
          activeBlockKey,
          responseBlockKey: nextRequest.blockKey,
        })
      ) {
        acceptedRows.push(...result.rows.map((row) => row.id))
      }
    })

    nextLoad.resolve({
      pageIndex: 0,
      pageSize: 25,
      rows: [{ id: "new", name: "New", status: "active" }],
      totalRows: 1,
    })
    await nextObserver
    expect(acceptedRows).toEqual(["new"])

    firstLoad.resolve({
      pageIndex: 3,
      pageSize: 25,
      rows: [{ id: "old", name: "Old", status: "inactive" }],
      totalRows: 76,
    })
    await firstObserver
    expect(acceptedRows).toEqual(["new"])
  })

  test("aborted stale sort/filter/search response does not replace active rows or diagnostics", async () => {
    const model = createServerRowModel<Row>()
    const staleFilter: BcGridFilter = {
      columnId: "status",
      kind: "column",
      op: "in",
      type: "set",
      values: ["inactive"],
    }
    const activeFilter: BcGridFilter = {
      columnId: "status",
      kind: "column",
      op: "in",
      type: "set",
      values: ["active"],
    }
    const staleView = model.createViewState({
      filter: staleFilter,
      groupBy: [],
      searchText: "old",
      sort: [{ columnId: "name", direction: "desc" }],
      visibleColumns: ["id", "name", "status"],
    })
    const activeView = model.createViewState({
      filter: activeFilter,
      groupBy: [],
      searchText: "new",
      sort: [{ columnId: "name", direction: "asc" }],
      visibleColumns: ["id", "name"],
    })
    const staleViewKey = model.createViewKey(staleView)
    const activeViewKey = model.createViewKey(activeView)
    const staleLoad = deferred<ServerPagedResult<Row>>()
    const activeLoad = deferred<ServerPagedResult<Row>>()

    const staleRequest = model.loadPagedPage({
      loadPage: () => staleLoad.promise,
      pageIndex: 4,
      pageSize: 25,
      view: staleView,
      viewKey: staleViewKey,
    })
    staleRequest.promise.catch(() => {})
    const activeRequest = model.loadPagedPage({
      loadPage: () => activeLoad.promise,
      pageIndex: 0,
      pageSize: 25,
      view: activeView,
      viewKey: activeViewKey,
    })
    model.abortExcept(activeRequest.blockKey)

    activeLoad.resolve({
      pageIndex: 0,
      pageSize: 25,
      rows: [{ id: "new", name: "New", status: "active" }],
      totalRows: 1,
      viewKey: activeViewKey,
    })
    await activeRequest.promise

    staleLoad.resolve({
      pageIndex: 4,
      pageSize: 25,
      rows: [{ id: "stale", name: "Stale", status: "inactive" }],
      totalRows: 76,
      viewKey: staleViewKey,
    })
    await expect(staleRequest.promise).rejects.toThrow("Aborted")

    expect(model.cache.get(activeRequest.blockKey)?.rows).toEqual([
      { id: "new", name: "New", status: "active" },
    ])
    const staleBlock = model.cache.get(staleRequest.blockKey)
    if (staleBlock) {
      expect(staleBlock.state).not.toBe("loaded")
      expect(staleBlock.rows).not.toContainEqual({
        id: "stale",
        name: "Stale",
        status: "inactive",
      })
    }

    const diagnostics = model.getDiagnostics({
      mode: "paged",
      rowCount: 1,
      selection: emptySelection,
      view: activeView,
      viewKey: activeViewKey,
    })
    expect(diagnostics.lastLoad).toMatchObject({
      query: {
        mode: "paged",
        pageIndex: 0,
        view: {
          filterActive: true,
          searchActive: true,
          sortCount: 1,
          visibleColumnCount: 2,
        },
        viewKey: activeViewKey,
      },
      rowCount: 1,
      status: "success",
    })
  })
})

describe("server paged diagnostics", () => {
  test("distinguishes loaded current-page rows from the full server row count", async () => {
    const model = createServerRowModel<Row>()
    const view = model.createViewState({
      groupBy: [],
      sort: [],
      visibleColumns: ["id", "name", "status"],
    })
    const request = model.loadPagedPage({
      loadPage: async (query) => ({
        pageIndex: query.pageIndex,
        pageSize: query.pageSize,
        rows: pageRows.slice(0, 7),
        totalRows: 10_000,
        viewKey: query.viewKey,
      }),
      pageIndex: 12,
      pageSize: 25,
      view,
    })

    await request.promise

    const diagnostics = model.getDiagnostics({
      mode: "paged",
      rowCount: 10_000,
      selection: emptySelection,
      view,
      viewKey: request.query.viewKey ?? "",
    })

    expect(diagnostics.rowCount).toBe(10_000)
    expect(diagnostics.cache.loadedRowCount).toBe(7)
    expect(diagnostics.lastLoad).toMatchObject({
      query: {
        mode: "paged",
        pageIndex: 12,
        pageSize: 25,
      },
      rowCount: 10_000,
      status: "success",
    })
  })

  test("reflects the active view and reset page after a view transition", async () => {
    const model = createServerRowModel<Row>()
    const baseView = model.createViewState({
      groupBy: [],
      sort: [],
      visibleColumns: ["id", "name", "status"],
    })
    const baseViewKey = model.createViewKey(baseView)
    const activeFilter: BcGridFilter = {
      columnId: "status",
      kind: "column",
      op: "in",
      type: "set",
      values: ["active"],
    }
    const activeView = model.createViewState({
      filter: activeFilter,
      groupBy: ["status"],
      searchText: "acme",
      sort: [{ columnId: "name", direction: "asc" }],
      visibleColumns: ["id", "name"],
    })
    const activeViewKey = model.createViewKey(activeView)
    const pageIndex = resolveServerPagedRequestPage({
      pageIndex: 4,
      previousViewKey: baseViewKey,
      viewKey: activeViewKey,
    })
    const request = model.loadPagedPage({
      loadPage: async (query) => ({
        pageIndex: query.pageIndex,
        pageSize: query.pageSize,
        rows: pageRows.slice(0, query.pageSize),
        totalRows: 137,
        viewKey: query.viewKey,
      }),
      pageIndex,
      pageSize: 25,
      view: activeView,
      viewKey: activeViewKey,
    })

    const loadingDiagnostics = model.getDiagnostics({
      mode: "paged",
      rowCount: 0,
      selection: emptySelection,
      view: activeView,
      viewKey: activeViewKey,
    })
    expect(loadingDiagnostics.viewKey).toBe(activeViewKey)
    expect(loadingDiagnostics.view).toEqual(activeView)
    expect(loadingDiagnostics.viewSummary).toMatchObject({
      filterActive: true,
      groupByCount: 1,
      searchActive: true,
      sortCount: 1,
      visibleColumnCount: 2,
    })
    expect(loadingDiagnostics.lastLoad.status).toBe("loading")
    expect(loadingDiagnostics.lastLoad.query).toMatchObject({
      mode: "paged",
      pageIndex: 0,
      pageSize: 25,
      viewKey: activeViewKey,
    })

    await request.promise

    const settledDiagnostics = model.getDiagnostics({
      mode: "paged",
      rowCount: 137,
      selection: emptySelection,
      view: activeView,
      viewKey: activeViewKey,
    })
    expect(settledDiagnostics.lastLoad.status).toBe("success")
    expect(settledDiagnostics.lastLoad.rowCount).toBe(137)
    expect(settledDiagnostics.rowCount).toBe(137)
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

  test("passes resolved visible columns into the paged request view", async () => {
    const model = createServerRowModel<Row>()
    const visibleColumns = resolveServerVisibleColumns(columns, [
      { columnId: "name", hidden: true },
      { columnId: "status", hidden: false },
    ])
    const view = model.createViewState({
      groupBy: [],
      sort: [],
      visibleColumns,
    })
    let capturedQuery: ServerPagedQuery | undefined

    await model.loadPagedPage({
      loadPage: async (query) => {
        capturedQuery = query
        return {
          pageIndex: query.pageIndex,
          pageSize: query.pageSize,
          rows: [],
          totalRows: 0,
        }
      },
      pageIndex: 0,
      pageSize: 25,
      view,
    }).promise

    expect(capturedQuery?.view.visibleColumns).toEqual(["id", "status"])
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

describe("resolveScrollToServerCellAction — scrollToServerCell decision matrix", () => {
  test("returns 'sync' when the row is already loaded, regardless of mode or pageIndex", () => {
    expect(
      resolveScrollToServerCellAction({
        rowLoaded: true,
        mode: "paged",
        currentPageIndex: 0,
        requestedPageIndex: undefined,
      }),
    ).toBe("sync")
    expect(
      resolveScrollToServerCellAction({
        rowLoaded: true,
        mode: "paged",
        currentPageIndex: 3,
        requestedPageIndex: 7,
      }),
    ).toBe("sync")
    expect(
      resolveScrollToServerCellAction({
        rowLoaded: true,
        mode: "infinite",
        currentPageIndex: 0,
        requestedPageIndex: undefined,
      }),
    ).toBe("sync")
    expect(
      resolveScrollToServerCellAction({
        rowLoaded: true,
        mode: "tree",
        currentPageIndex: 0,
        requestedPageIndex: undefined,
      }),
    ).toBe("sync")
  })

  test("returns 'navigate' when the row is unloaded, mode is paged, and pageIndex differs from current", () => {
    expect(
      resolveScrollToServerCellAction({
        rowLoaded: false,
        mode: "paged",
        currentPageIndex: 0,
        requestedPageIndex: 5,
      }),
    ).toBe("navigate")
    expect(
      resolveScrollToServerCellAction({
        rowLoaded: false,
        mode: "paged",
        currentPageIndex: 5,
        requestedPageIndex: 0,
      }),
    ).toBe("navigate")
  })

  test("returns 'none' when the row is unloaded and no pageIndex is supplied", () => {
    expect(
      resolveScrollToServerCellAction({
        rowLoaded: false,
        mode: "paged",
        currentPageIndex: 0,
        requestedPageIndex: undefined,
      }),
    ).toBe("none")
  })

  test("returns 'none' when the requested pageIndex matches the current page (already there, row not present)", () => {
    expect(
      resolveScrollToServerCellAction({
        rowLoaded: false,
        mode: "paged",
        currentPageIndex: 3,
        requestedPageIndex: 3,
      }),
    ).toBe("none")
  })

  test("returns 'none' for infinite/tree modes even when pageIndex is supplied (no paged navigation)", () => {
    expect(
      resolveScrollToServerCellAction({
        rowLoaded: false,
        mode: "infinite",
        currentPageIndex: 0,
        requestedPageIndex: 5,
      }),
    ).toBe("none")
    expect(
      resolveScrollToServerCellAction({
        rowLoaded: false,
        mode: "tree",
        currentPageIndex: 0,
        requestedPageIndex: 5,
      }),
    ).toBe("none")
  })
})

describe("resolveTreeChildCount", () => {
  test("defaults to 100 when undefined", () => {
    expect(resolveTreeChildCount(undefined)).toBe(100)
  })

  test("passes through finite positive integers", () => {
    expect(resolveTreeChildCount(50)).toBe(50)
    expect(resolveTreeChildCount(500)).toBe(500)
    expect(resolveTreeChildCount(1)).toBe(1)
  })

  test("clamps zero to 1 (defensive against misconfiguration)", () => {
    expect(resolveTreeChildCount(0)).toBe(1)
  })

  test("clamps negative values to 1", () => {
    expect(resolveTreeChildCount(-10)).toBe(1)
  })

  test("rounds non-integer values down", () => {
    expect(resolveTreeChildCount(75.7)).toBe(75)
    expect(resolveTreeChildCount(1.4)).toBe(1)
  })

  test("falls back to default for NaN / Infinity", () => {
    expect(resolveTreeChildCount(Number.NaN)).toBe(100)
    expect(resolveTreeChildCount(Number.POSITIVE_INFINITY)).toBe(100)
  })
})

describe("resolveTreeRowCount", () => {
  test("returns 'unknown' for non-tree row models regardless of inputs", () => {
    expect(
      resolveTreeRowCount({
        mode: "paged",
        visibleRowCount: 10,
        initialRootChildCount: 500,
        rootLoading: true,
      }),
    ).toBe("unknown")
    expect(
      resolveTreeRowCount({
        mode: "infinite",
        visibleRowCount: 10,
        initialRootChildCount: 500,
        rootLoading: false,
      }),
    ).toBe("unknown")
  })

  test("returns the visible row count once any tree rows have rendered", () => {
    expect(
      resolveTreeRowCount({
        mode: "tree",
        visibleRowCount: 25,
        initialRootChildCount: 500,
        rootLoading: false,
      }),
    ).toBe(25)
  })

  test("uses initialRootChildCount as a chrome pre-seed during the initial root load", () => {
    expect(
      resolveTreeRowCount({
        mode: "tree",
        visibleRowCount: 0,
        initialRootChildCount: 500,
        rootLoading: true,
      }),
    ).toBe(500)
  })

  test("falls back to 0 when no rows are visible and no pre-seed is supplied", () => {
    expect(
      resolveTreeRowCount({
        mode: "tree",
        visibleRowCount: 0,
        initialRootChildCount: undefined,
        rootLoading: true,
      }),
    ).toBe(0)
  })

  test("ignores initialRootChildCount once visible rows have rendered (real count wins)", () => {
    expect(
      resolveTreeRowCount({
        mode: "tree",
        visibleRowCount: 7,
        initialRootChildCount: 500,
        rootLoading: false,
      }),
    ).toBe(7)
  })

  test("ignores a non-finite initialRootChildCount (defensive)", () => {
    expect(
      resolveTreeRowCount({
        mode: "tree",
        visibleRowCount: 0,
        initialRootChildCount: Number.NaN,
        rootLoading: true,
      }),
    ).toBe(0)
  })

  test("rounds a fractional initialRootChildCount down", () => {
    expect(
      resolveTreeRowCount({
        mode: "tree",
        visibleRowCount: 0,
        initialRootChildCount: 12.7,
        rootLoading: true,
      }),
    ).toBe(12)
  })
})

describe("resolvePrefetchAhead (worker1 audit P1 §8)", () => {
  test("defaults to 1 when undefined (matches prior implicit behavior)", () => {
    expect(resolvePrefetchAhead(undefined)).toBe(1)
  })

  test("passes through finite non-negative integers", () => {
    expect(resolvePrefetchAhead(0)).toBe(0)
    expect(resolvePrefetchAhead(1)).toBe(1)
    expect(resolvePrefetchAhead(3)).toBe(3)
    expect(resolvePrefetchAhead(10)).toBe(10)
  })

  test("clamps negative values to 0 (defensive)", () => {
    expect(resolvePrefetchAhead(-1)).toBe(0)
    expect(resolvePrefetchAhead(-10)).toBe(0)
  })

  test("rounds non-integer values down", () => {
    expect(resolvePrefetchAhead(2.7)).toBe(2)
    expect(resolvePrefetchAhead(0.9)).toBe(0)
  })

  test("falls back to default for NaN / Infinity", () => {
    expect(resolvePrefetchAhead(Number.NaN)).toBe(1)
    expect(resolvePrefetchAhead(Number.POSITIVE_INFINITY)).toBe(1)
  })
})

describe("resolveActiveRowModelMode (server-mode-switch RFC §6 stage 1)", () => {
  test("explicit rowModel wins regardless of groupBy", () => {
    expect(resolveActiveRowModelMode({ rowModel: "paged", groupBy: [] })).toBe("paged")
    expect(resolveActiveRowModelMode({ rowModel: "paged", groupBy: ["region"] })).toBe("paged")
    expect(resolveActiveRowModelMode({ rowModel: "infinite", groupBy: [] })).toBe("infinite")
    expect(resolveActiveRowModelMode({ rowModel: "infinite", groupBy: ["region"] })).toBe(
      "infinite",
    )
    expect(resolveActiveRowModelMode({ rowModel: "tree", groupBy: [] })).toBe("tree")
    expect(resolveActiveRowModelMode({ rowModel: "tree", groupBy: ["region"] })).toBe("tree")
  })

  test("heuristic kicks in when rowModel is undefined: empty groupBy → 'paged'", () => {
    expect(resolveActiveRowModelMode({ rowModel: undefined, groupBy: [] })).toBe("paged")
  })

  test("heuristic kicks in when rowModel is undefined: non-empty groupBy → 'tree'", () => {
    expect(resolveActiveRowModelMode({ rowModel: undefined, groupBy: ["region"] })).toBe("tree")
    expect(resolveActiveRowModelMode({ rowModel: undefined, groupBy: ["region", "owner"] })).toBe(
      "tree",
    )
  })

  test("heuristic defaults to 'paged' when both rowModel and groupBy are undefined", () => {
    expect(resolveActiveRowModelMode({ rowModel: undefined, groupBy: undefined })).toBe("paged")
  })
})

describe("resolveMissingLoaderMessage (server-mode-switch RFC §6 stage 2 mount assertion)", () => {
  test("returns null when the active mode's loader is present (paged + loadPage)", () => {
    expect(
      resolveMissingLoaderMessage({
        activeMode: "paged",
        hasLoadPage: true,
        hasLoadBlock: false,
        hasLoadChildren: false,
      }),
    ).toBeNull()
  })

  test("returns null when the active mode's loader is present (infinite + loadBlock)", () => {
    expect(
      resolveMissingLoaderMessage({
        activeMode: "infinite",
        hasLoadPage: false,
        hasLoadBlock: true,
        hasLoadChildren: false,
      }),
    ).toBeNull()
  })

  test("returns null when the active mode's loader is present (tree + loadChildren)", () => {
    expect(
      resolveMissingLoaderMessage({
        activeMode: "tree",
        hasLoadPage: false,
        hasLoadBlock: false,
        hasLoadChildren: true,
      }),
    ).toBeNull()
  })

  test("returns a dev-error message when paged mode is active but loadPage is missing", () => {
    const message = resolveMissingLoaderMessage({
      activeMode: "paged",
      hasLoadPage: false,
      hasLoadBlock: true,
      hasLoadChildren: true,
    })
    expect(message).not.toBeNull()
    expect(message).toContain('"paged"')
    expect(message).toContain("loadPage")
    expect(message).toContain("server-mode-switch-rfc")
  })

  test("returns a dev-error message when infinite mode is active but loadBlock is missing", () => {
    const message = resolveMissingLoaderMessage({
      activeMode: "infinite",
      hasLoadPage: true,
      hasLoadBlock: false,
      hasLoadChildren: true,
    })
    expect(message).not.toBeNull()
    expect(message).toContain('"infinite"')
    expect(message).toContain("loadBlock")
  })

  test("returns a dev-error message when tree mode is active but loadChildren is missing", () => {
    const message = resolveMissingLoaderMessage({
      activeMode: "tree",
      hasLoadPage: true,
      hasLoadBlock: true,
      hasLoadChildren: false,
    })
    expect(message).not.toBeNull()
    expect(message).toContain('"tree"')
    expect(message).toContain("loadChildren")
  })

  test("ignores loaders for inactive modes (paged active, loadBlock present but loadPage missing)", () => {
    const message = resolveMissingLoaderMessage({
      activeMode: "paged",
      hasLoadPage: false,
      hasLoadBlock: true, // present but irrelevant
      hasLoadChildren: false,
    })
    expect(message).toContain("loadPage")
  })
})

describe("shouldMergeTreeResult — stale-viewKey gate (worker1 audit P1 §10)", () => {
  // The React layer's `loadTreeChildren` does NOT call `abortExcept`
  // (paged does at `serverGrid.tsx:1163`). Tree fetches under one
  // viewKey can outlive a filter change to a new viewKey, and without
  // a gate at the merge site the stale children would land in the new
  // snapshot. The fix at `serverGrid.tsx:1745-1755` discards the
  // result when the resolved viewKey != the model's current viewKey.

  test("returns true when result.viewKey matches the current viewKey", () => {
    expect(
      shouldMergeTreeResult({
        resultViewKey: "v1",
        fallbackViewKey: "v1",
        currentViewKey: "v1",
      }),
    ).toBe(true)
  })

  test("returns true when the loader echoed the active viewKey via result.viewKey", () => {
    // Server may echo a different viewKey than the request-time one
    // (e.g. it normalised the query). The gate respects what the
    // server returned over the request-time fallback.
    expect(
      shouldMergeTreeResult({
        resultViewKey: "v2",
        fallbackViewKey: "v1",
        currentViewKey: "v2",
      }),
    ).toBe(true)
  })

  test("returns false when the result's resolved viewKey is stale (model has moved on)", () => {
    // The classic §10 case: fetch fired under v1, user changed filter
    // to v2 before the fetch resolved. result.viewKey is undefined
    // (server didn't echo) → fallback is v1 → current is v2 → DROP.
    expect(
      shouldMergeTreeResult({
        resultViewKey: undefined,
        fallbackViewKey: "v1",
        currentViewKey: "v2",
      }),
    ).toBe(false)
  })

  test("returns false when result.viewKey itself doesn't match (server-echoed viewKey is stale)", () => {
    // The server explicitly echoed the original viewKey (v1) but the
    // model has moved to v2 since. Drop.
    expect(
      shouldMergeTreeResult({
        resultViewKey: "v1",
        fallbackViewKey: "v1",
        currentViewKey: "v2",
      }),
    ).toBe(false)
  })

  test("falls back to fallbackViewKey when result.viewKey is undefined", () => {
    // Loader didn't echo viewKey; fallback (the request-time viewKey)
    // is what's compared against the current viewKey. Match → merge.
    expect(
      shouldMergeTreeResult({
        resultViewKey: undefined,
        fallbackViewKey: "v1",
        currentViewKey: "v1",
      }),
    ).toBe(true)
  })

  test("empty-string viewKeys participate in equality (edge case)", () => {
    // Defensive: an empty viewKey is a legitimate (degenerate) value;
    // the gate should compare it like any other string.
    expect(
      shouldMergeTreeResult({
        resultViewKey: "",
        fallbackViewKey: "v1",
        currentViewKey: "",
      }),
    ).toBe(true)
    expect(
      shouldMergeTreeResult({
        resultViewKey: undefined,
        fallbackViewKey: "",
        currentViewKey: "v2",
      }),
    ).toBe(false)
  })
})
