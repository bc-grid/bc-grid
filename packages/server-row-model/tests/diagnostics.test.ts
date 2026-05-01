import { describe, expect, test } from "bun:test"
import type {
  ServerBlockQuery,
  ServerPagedQuery,
  ServerPagedResult,
  ServerSelection,
  ServerTreeQuery,
  ServerViewState,
} from "@bc-grid/core"
import {
  createServerRowModel,
  summarizeServerCache,
  summarizeServerQuery,
  summarizeServerViewState,
} from "../src"

interface Row {
  id: string
  name: string
}

const view: ServerViewState = {
  filter: {
    columnId: "status",
    kind: "column",
    op: "in",
    type: "set",
    values: ["active"],
  },
  groupBy: [{ columnId: "region" }],
  locale: "en-US",
  search: "acme",
  sort: [{ columnId: "name", direction: "asc" }],
  visibleColumns: ["id", "name", "status"],
}

const emptySelection: ServerSelection = { mode: "explicit", rowIds: new Set() }

describe("server row model diagnostics", () => {
  test("summarizes server view state for logs", () => {
    expect(summarizeServerViewState(view)).toEqual({
      filterActive: true,
      groupByCount: 1,
      locale: "en-US",
      searchActive: true,
      sortCount: 1,
      visibleColumnCount: 3,
    })
  })

  test("summarizes paged, block, and tree query metadata", () => {
    const pagedQuery: ServerPagedQuery = {
      mode: "paged",
      pageIndex: 2,
      pageSize: 50,
      requestId: "server-page-1",
      view,
      viewKey: "view:customers",
    }
    const blockQuery: ServerBlockQuery = {
      blockSize: 100,
      blockStart: 300,
      mode: "infinite",
      requestId: "server-block-1",
      view,
      viewKey: "view:customers",
    }
    const treeQuery: ServerTreeQuery = {
      childCount: 25,
      childStart: 50,
      groupPath: [{ columnId: "region", value: "West" }],
      mode: "tree",
      parentRowId: "region-west",
      requestId: "server-tree-1",
      view,
      viewKey: "view:customers",
    }

    expect(summarizeServerQuery(pagedQuery)).toMatchObject({
      mode: "paged",
      pageIndex: 2,
      pageSize: 50,
      requestId: "server-page-1",
      viewKey: "view:customers",
    })
    expect(summarizeServerQuery(blockQuery)).toMatchObject({
      blockSize: 100,
      blockStart: 300,
      mode: "infinite",
      requestId: "server-block-1",
    })
    expect(summarizeServerQuery(treeQuery)).toMatchObject({
      childCount: 25,
      childStart: 50,
      mode: "tree",
      parentRowId: "region-west",
    })
  })

  test("reports current row count, cache summary, and last load status", async () => {
    const model = createServerRowModel<Row>()
    const request = model.loadPagedPage({
      loadPage: async (query) => ({
        pageIndex: query.pageIndex,
        pageSize: query.pageSize,
        rows: [
          { id: "1", name: "Acme" },
          { id: "2", name: "Bravo" },
        ],
        totalRows: 12,
        viewKey: query.viewKey,
      }),
      pageIndex: 1,
      pageSize: 2,
      view,
    })

    const loadingDiagnostics = model.getDiagnostics({
      mode: "paged",
      rowCount: 0,
      selection: emptySelection,
      view,
      viewKey: request.query.viewKey ?? "",
    })

    expect(loadingDiagnostics.lastLoad.status).toBe("loading")
    expect(loadingDiagnostics.lastLoad.query).toMatchObject({
      mode: "paged",
      pageIndex: 1,
      pageSize: 2,
    })

    await request.promise

    const diagnostics = model.getDiagnostics({
      mode: "paged",
      rowCount: 12,
      selection: emptySelection,
      view,
      viewKey: request.query.viewKey ?? "",
    })

    expect(diagnostics.rowCount).toBe(12)
    expect(diagnostics.lastLoad.status).toBe("success")
    expect(diagnostics.lastLoad.rowCount).toBe(12)
    expect(diagnostics.cache.states.loaded).toBe(1)
    expect(diagnostics.cache.loadedRowCount).toBe(2)
    expect(diagnostics.pendingMutationCount).toBe(0)
    expect("state" in diagnostics).toBe(false)
  })

  test("keeps diagnostics on the newest request when an aborted older page settles late", async () => {
    const model = createServerRowModel<Row>()
    const nextView: ServerViewState = { ...view, search: "bravo" }
    let resolveOldPage: (value: ServerPagedResult<Row>) => void = () => {}
    const loadPage = (query: ServerPagedQuery) => {
      if (query.view.search === "acme") {
        return new Promise<ServerPagedResult<Row>>((resolve) => {
          resolveOldPage = resolve
        })
      }
      return Promise.resolve<ServerPagedResult<Row>>({
        pageIndex: query.pageIndex,
        pageSize: query.pageSize,
        rows: [{ id: "2", name: "Bravo" }],
        totalRows: 1,
        viewKey: query.viewKey,
      })
    }

    const oldRequest = model.loadPagedPage({ loadPage, pageIndex: 4, pageSize: 25, view })
    oldRequest.promise.catch(() => {})
    const nextRequest = model.loadPagedPage({
      loadPage,
      pageIndex: 0,
      pageSize: 25,
      view: nextView,
    })
    model.abortExcept(nextRequest.blockKey)

    await nextRequest.promise
    expect(
      model.getDiagnostics({
        mode: "paged",
        rowCount: 1,
        selection: emptySelection,
        view: nextView,
        viewKey: nextRequest.query.viewKey ?? "",
      }).lastLoad,
    ).toMatchObject({
      query: { pageIndex: 0, requestId: nextRequest.query.requestId, view: { searchActive: true } },
      rowCount: 1,
      status: "success",
    })

    resolveOldPage({
      pageIndex: 4,
      pageSize: 25,
      rows: [{ id: "1", name: "Acme" }],
      totalRows: 1,
      viewKey: oldRequest.query.viewKey,
    })
    await expect(oldRequest.promise).rejects.toThrow("Aborted")

    const diagnostics = model.getDiagnostics({
      mode: "paged",
      rowCount: 1,
      selection: emptySelection,
      view: nextView,
      viewKey: nextRequest.query.viewKey ?? "",
    })
    expect(diagnostics.lastLoad).toMatchObject({
      query: { pageIndex: 0, requestId: nextRequest.query.requestId },
      rowCount: 1,
      status: "success",
    })
  })

  test("summarizes mixed cache states without exposing row data", () => {
    const model = createServerRowModel<Row>()
    const viewKey = model.createViewKey(view)
    model.cache.markFetching({ blockKey: "fetching", size: 10, start: 0, viewKey })
    model.cache.markLoaded({
      blockKey: "loaded",
      rows: [{ id: "1", name: "Acme" }],
      size: 10,
      start: 10,
      viewKey,
    })
    model.cache.markStale("loaded")

    expect(summarizeServerCache(model.cache.toMap())).toEqual({
      blockCount: 2,
      blockKeys: ["fetching", "loaded"],
      loadedRowCount: 1,
      states: {
        error: 0,
        evicted: 0,
        fetching: 1,
        loaded: 0,
        queued: 0,
        stale: 1,
      },
    })
  })
})
