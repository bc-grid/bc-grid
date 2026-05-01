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

  test("groupBy is server query state and resets the requested page", async () => {
    const filter: BcGridFilter = {
      columnId: "status",
      kind: "column",
      op: "in",
      type: "set",
      values: ["active", "pending"],
    }
    const groupedView = model.createViewState({
      filter,
      groupBy: ["status", "name"],
      searchText: "priority",
      sort: [{ columnId: "status", direction: "asc" }],
      visibleColumns: ["id", "name", "status"],
    })
    const groupedViewKey = viewKeyFor(groupedView)
    const pageIndex = resolveServerPagedRequestPage({
      pageIndex: 8,
      previousViewKey: baseViewKey,
      viewKey: groupedViewKey,
    })
    let capturedQuery: ServerPagedQuery | undefined

    await model.loadPagedPage({
      loadPage: async (query) => {
        capturedQuery = query
        return {
          pageIndex: query.pageIndex,
          pageSize: query.pageSize,
          rows: pageRows.slice(0, 4),
          totalRows: 42,
          viewKey: query.viewKey,
        }
      },
      pageIndex,
      pageSize: 25,
      view: groupedView,
      viewKey: groupedViewKey,
    }).promise

    expect(pageIndex).toBe(0)
    expect(capturedQuery).toMatchObject({
      mode: "paged",
      pageIndex: 0,
      pageSize: 25,
      viewKey: groupedViewKey,
    })
    expect(capturedQuery?.view).toEqual(groupedView)
    expect(capturedQuery?.view).toMatchObject({
      filter,
      groupBy: [{ columnId: "status" }, { columnId: "name" }],
      search: "priority",
      sort: [{ columnId: "status", direction: "asc" }],
      visibleColumns: ["id", "name", "status"],
    })
  })

  test("same-view refresh preserves the requested page and full query payload", async () => {
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
      sort: [{ columnId: "name", direction: "desc" }],
      visibleColumns: ["id", "name"],
    })
    const activeViewKey = viewKeyFor(activeView)
    const pageIndex = resolveServerPagedRequestPage({
      pageIndex: 4,
      previousViewKey: activeViewKey,
      viewKey: activeViewKey,
    })
    let capturedQuery: ServerPagedQuery | undefined

    await model.loadPagedPage({
      loadPage: async (query) => {
        capturedQuery = query
        return {
          pageIndex: query.pageIndex,
          pageSize: query.pageSize,
          rows: pageRows.slice(0, 5),
          totalRows: 137,
          viewKey: query.viewKey,
        }
      },
      pageIndex,
      pageSize: 25,
      view: activeView,
      viewKey: activeViewKey,
    }).promise

    expect(pageIndex).toBe(4)
    expect(capturedQuery).toMatchObject({
      mode: "paged",
      pageIndex: 4,
      pageSize: 25,
      viewKey: activeViewKey,
    })
    expect(capturedQuery?.view).toEqual(activeView)
    expect(capturedQuery?.view).toMatchObject({
      filter,
      groupBy: [{ columnId: "status" }],
      search: "acme",
      sort: [{ columnId: "name", direction: "desc" }],
      visibleColumns: ["id", "name"],
    })
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

  test("ignores a slow old grouped view response after a newer query becomes active", async () => {
    const model = createServerRowModel<Row>()
    const oldFilter: BcGridFilter = {
      columnId: "status",
      kind: "column",
      op: "in",
      type: "set",
      values: ["inactive"],
    }
    const nextFilter: BcGridFilter = {
      columnId: "status",
      kind: "column",
      op: "in",
      type: "set",
      values: ["active"],
    }
    const firstView = model.createViewState({
      filter: oldFilter,
      groupBy: ["status"],
      searchText: "old",
      sort: [{ columnId: "name", direction: "desc" }],
      visibleColumns: ["id", "name", "status"],
    })
    const nextView = model.createViewState({
      filter: nextFilter,
      groupBy: ["status", "name"],
      searchText: "new",
      sort: [{ columnId: "name", direction: "asc" }],
      visibleColumns: ["id", "status"],
    })
    const firstLoad = deferred<ServerPagedResult<Row>>()
    const nextLoad = deferred<ServerPagedResult<Row>>()
    const acceptedRows: string[] = []
    let activeBlockKey: string | null = null

    const firstRequest = model.loadPagedPage({
      loadPage: () => firstLoad.promise,
      pageIndex: 6,
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

    expect(firstRequest.query.view).toMatchObject({
      filter: oldFilter,
      groupBy: [{ columnId: "status" }],
      search: "old",
      sort: [{ columnId: "name", direction: "desc" }],
      visibleColumns: ["id", "name", "status"],
    })
    expect(nextRequest.query.view).toMatchObject({
      filter: nextFilter,
      groupBy: [{ columnId: "status" }, { columnId: "name" }],
      search: "new",
      sort: [{ columnId: "name", direction: "asc" }],
      visibleColumns: ["id", "status"],
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
      pageIndex: 6,
      pageSize: 25,
      rows: [{ id: "old", name: "Old", status: "inactive" }],
      totalRows: 151,
    })
    await firstObserver
    expect(acceptedRows).toEqual(["new"])
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

  test("visible-column view changes reset the page and keep server rows unsliced", async () => {
    const model = createServerRowModel<Row>()
    const baseView = model.createViewState({
      groupBy: [],
      sort: [],
      visibleColumns: ["id", "name", "status"],
    })
    const nextVisibleColumns = resolveServerVisibleColumns(columns, [
      { columnId: "name", hidden: true },
      { columnId: "status", hidden: false },
    ])
    const nextView = model.createViewState({
      groupBy: [],
      searchText: "active",
      sort: [{ columnId: "status", direction: "asc" }],
      visibleColumns: nextVisibleColumns,
    })
    const pageIndex = resolveServerPagedRequestPage({
      pageIndex: 5,
      previousViewKey: model.createViewKey(baseView),
      viewKey: model.createViewKey(nextView),
    })
    const serverRows = pageRows.slice(0, 3)
    let capturedQuery: ServerPagedQuery | undefined

    const result = await model.loadPagedPage({
      loadPage: async (query) => {
        capturedQuery = query
        return {
          pageIndex: query.pageIndex,
          pageSize: query.pageSize,
          rows: serverRows,
          totalRows: 103,
          viewKey: query.viewKey,
        }
      },
      pageIndex,
      pageSize: 25,
      view: nextView,
    }).promise
    const shell = resolveServerPagedGridShell({
      pageIndex,
      pageSize: 25,
      pagination: true,
      rows: result.rows,
      totalRows: result.totalRows,
    })

    expect(pageIndex).toBe(0)
    expect(capturedQuery?.view.visibleColumns).toEqual(["id", "status"])
    expect(capturedQuery).toMatchObject({
      mode: "paged",
      pageIndex: 0,
      pageSize: 25,
      view: {
        search: "active",
        sort: [{ columnId: "status", direction: "asc" }],
      },
    })
    expect(shell.gridPagination).toBe(false)
    expect(shell.gridRows).toBe(result.rows)
    expect(shell.gridRows).toEqual(serverRows)
    expect(shell.paginationWindow).toMatchObject({
      page: 0,
      pageCount: 5,
      totalRows: 103,
    })
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
