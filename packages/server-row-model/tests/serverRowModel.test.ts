import { describe, expect, test } from "bun:test"
import type {
  BcGridFilter,
  ServerBlockResult,
  ServerPagedResult,
  ServerRowModelEvent,
  ServerViewState,
} from "@bc-grid/core"
import { ServerBlockCache, createServerRowModel, defaultBlockKey } from "../src"

interface Row {
  id: string
  amount?: number
  name?: string
}

const view: ServerViewState = {
  groupBy: [],
  sort: [{ columnId: "name", direction: "asc" }],
  visibleColumns: ["name", "balance"],
}
const emptySelection = { mode: "explicit", rowIds: new Set<string>() } as const

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

describe("defaultBlockKey", () => {
  test("formats paged, infinite, and tree block keys", () => {
    expect(defaultBlockKey({ mode: "paged", pageIndex: 2, pageSize: 50, viewKey: "v1" })).toBe(
      "paged:v1:page:2:size:50",
    )
    expect(
      defaultBlockKey({ mode: "infinite", blockStart: 200, blockSize: 100, viewKey: "v1" }),
    ).toBe("infinite:v1:start:200:size:100")
    expect(
      defaultBlockKey({
        mode: "tree",
        childCount: 25,
        childStart: 50,
        parentRowId: null,
        viewKey: "v1",
      }),
    ).toBe("tree:v1:parent:root:start:50:size:25")
  })
})

describe("ServerBlockCache", () => {
  test("stores loaded blocks and invalidates by view / block / all", () => {
    const cache = new ServerBlockCache<Row>()
    cache.markLoaded({
      blockKey: "paged:v1:page:0:size:2",
      rows: [{ id: "a" }],
      size: 2,
      start: 0,
      viewKey: "v1",
    })
    cache.markLoaded({
      blockKey: "paged:v2:page:0:size:2",
      rows: [{ id: "b" }],
      size: 2,
      start: 0,
      viewKey: "v2",
    })

    expect(cache.toMap().size).toBe(2)
    cache.invalidate({ scope: "view", viewKey: "v1" })
    expect(cache.get("paged:v1:page:0:size:2")).toBeUndefined()
    expect(cache.get("paged:v2:page:0:size:2")?.rows).toEqual([{ id: "b" }])

    cache.invalidate({ scope: "blocks", blockKeys: ["paged:v2:page:0:size:2"] })
    expect(cache.toMap().size).toBe(0)

    cache.markFetching({
      blockKey: "paged:v3:page:0:size:2",
      size: 2,
      start: 0,
      viewKey: "v3",
    })
    cache.invalidate({ scope: "all" })
    expect(cache.toMap().size).toBe(0)
  })

  test("marks stale blocks without dropping rows", () => {
    const cache = new ServerBlockCache<Row>()
    cache.markLoaded({
      blockKey: "infinite:v1:start:0:size:2",
      rows: [{ id: "a" }],
      size: 2,
      start: 0,
      viewKey: "v1",
    })

    expect(cache.markStale("infinite:v1:start:0:size:2")).toBe(true)
    expect(cache.get("infinite:v1:start:0:size:2")?.state).toBe("stale")
    expect(cache.get("infinite:v1:start:0:size:2")?.rows).toEqual([{ id: "a" }])
  })
})

describe("createServerRowModel", () => {
  test("paged queries keep server totals separate from loaded current-page rows", async () => {
    const model = createServerRowModel<Row>()
    const filter: BcGridFilter = {
      columnId: "name",
      kind: "column",
      op: "contains",
      type: "text",
      value: "acme",
    }
    const serverView = model.createViewState({
      filter,
      groupBy: ["status"],
      searchText: "priority",
      sort: [{ columnId: "name", direction: "asc" }],
      visibleColumns: ["id", "name", "status"],
    })
    const viewKey = model.createViewKey(serverView)
    const currentPageRows = [
      { id: "customer-76", name: "Acme 76" },
      { id: "customer-77", name: "Acme 77" },
    ]
    let capturedQuery: unknown

    const request = model.loadPagedPage({
      loadPage: async (query) => {
        capturedQuery = query
        return {
          pageIndex: query.pageIndex,
          pageSize: query.pageSize,
          rows: currentPageRows,
          totalRows: 10_000,
          viewKey: query.viewKey,
        }
      },
      pageIndex: 3,
      pageSize: 25,
      view: serverView,
      viewKey,
    })
    const result = await request.promise

    expect(capturedQuery).toMatchObject({
      mode: "paged",
      pageIndex: 3,
      pageSize: 25,
      view: {
        filter,
        groupBy: [{ columnId: "status" }],
        search: "priority",
        sort: [{ columnId: "name", direction: "asc" }],
        visibleColumns: ["id", "name", "status"],
      },
      viewKey,
    })
    expect(result.rows).toEqual(currentPageRows)
    expect(model.cache.get(request.blockKey)?.rows).toEqual(currentPageRows)

    const diagnostics = model.getDiagnostics({
      mode: "paged",
      rowCount: result.totalRows,
      selection: emptySelection,
      view: serverView,
      viewKey,
    })
    expect(diagnostics.rowCount).toBe(10_000)
    expect(diagnostics.cache.loadedRowCount).toBe(2)
    expect(diagnostics.lastLoad).toMatchObject({
      rowCount: 10_000,
      status: "success",
    })
  })

  test("paged view changes use distinct query keys while same-view refresh retains page", async () => {
    const model = createServerRowModel<Row>()
    const baseView = model.createViewState({
      groupBy: [],
      sort: [{ columnId: "name", direction: "asc" }],
      visibleColumns: ["id", "name", "status"],
    })
    const groupedView = model.createViewState({
      filter: {
        columnId: "name",
        kind: "column",
        op: "contains",
        type: "text",
        value: "acme",
      },
      groupBy: ["status"],
      searchText: "west",
      sort: [{ columnId: "status", direction: "desc" }],
      visibleColumns: ["id", "name"],
    })
    const baseViewKey = model.createViewKey(baseView)
    const groupedViewKey = model.createViewKey(groupedView)
    const loadPage = (rows: Row[]) => async (query: { pageIndex: number; pageSize: number }) => ({
      pageIndex: query.pageIndex,
      pageSize: query.pageSize,
      rows,
      totalRows: 125,
    })

    const sameViewRefresh = model.loadPagedPage({
      loadPage: loadPage([{ id: "same-page", name: "Same" }]),
      pageIndex: 4,
      pageSize: 25,
      view: baseView,
      viewKey: baseViewKey,
    })
    const changedViewReset = model.loadPagedPage({
      loadPage: loadPage([{ id: "reset-page", name: "Reset" }]),
      pageIndex: 0,
      pageSize: 25,
      view: groupedView,
      viewKey: groupedViewKey,
    })

    expect(sameViewRefresh.query.pageIndex).toBe(4)
    expect(sameViewRefresh.blockKey).toBe(
      defaultBlockKey({ mode: "paged", pageIndex: 4, pageSize: 25, viewKey: baseViewKey }),
    )
    expect(changedViewReset.query.pageIndex).toBe(0)
    expect(changedViewReset.blockKey).toBe(
      defaultBlockKey({ mode: "paged", pageIndex: 0, pageSize: 25, viewKey: groupedViewKey }),
    )
    expect(changedViewReset.blockKey).not.toBe(sameViewRefresh.blockKey)
    expect(changedViewReset.query.view).toMatchObject({
      groupBy: [{ columnId: "status" }],
      search: "west",
      sort: [{ columnId: "status", direction: "desc" }],
      visibleColumns: ["id", "name"],
    })

    await Promise.all([sameViewRefresh.promise, changedViewReset.promise])
  })

  test("late paged responses from older query views do not overwrite newer diagnostics or rows", async () => {
    const model = createServerRowModel<Row>()
    const oldView = model.createViewState({
      groupBy: [],
      searchText: "old",
      sort: [{ columnId: "name", direction: "asc" }],
      visibleColumns: ["id", "name", "status"],
    })
    const nextView = model.createViewState({
      filter: {
        columnId: "name",
        kind: "column",
        op: "contains",
        type: "text",
        value: "new",
      },
      groupBy: ["status"],
      searchText: "new",
      sort: [{ columnId: "status", direction: "desc" }],
      visibleColumns: ["id", "status"],
    })
    const oldViewKey = model.createViewKey(oldView)
    const nextViewKey = model.createViewKey(nextView)
    const oldLoad = deferred<ServerPagedResult<Row>>()
    const nextLoad = deferred<ServerPagedResult<Row>>()

    const oldRequest = model.loadPagedPage({
      loadPage: () => oldLoad.promise,
      pageIndex: 5,
      pageSize: 25,
      view: oldView,
      viewKey: oldViewKey,
    })
    oldRequest.promise.catch(() => {})
    const nextRequest = model.loadPagedPage({
      loadPage: () => nextLoad.promise,
      pageIndex: 0,
      pageSize: 25,
      view: nextView,
      viewKey: nextViewKey,
    })
    model.abortExcept(nextRequest.blockKey)

    nextLoad.resolve({
      pageIndex: 0,
      pageSize: 25,
      rows: [{ id: "new", name: "New" }],
      totalRows: 1,
      viewKey: nextViewKey,
    })
    await nextRequest.promise

    oldLoad.resolve({
      pageIndex: 5,
      pageSize: 25,
      rows: [{ id: "stale", name: "Stale" }],
      totalRows: 126,
      viewKey: oldViewKey,
    })
    await expect(oldRequest.promise).rejects.toThrow("Aborted")

    expect(model.cache.get(nextRequest.blockKey)?.rows).toEqual([{ id: "new", name: "New" }])
    const oldBlock = model.cache.get(oldRequest.blockKey)
    if (oldBlock) {
      expect(oldBlock.state).not.toBe("loaded")
      expect(oldBlock.rows).not.toContainEqual({ id: "stale", name: "Stale" })
    }
    const diagnostics = model.getDiagnostics({
      mode: "paged",
      rowCount: 1,
      selection: emptySelection,
      view: nextView,
      viewKey: nextViewKey,
    })
    expect(diagnostics.lastLoad).toMatchObject({
      query: {
        pageIndex: 0,
        view: {
          filterActive: true,
          groupByCount: 1,
          searchActive: true,
          sortCount: 1,
          visibleColumnCount: 2,
        },
        viewKey: nextViewKey,
      },
      rowCount: 1,
      status: "success",
    })
  })

  test("dedupes concurrent paged requests for the same block key", async () => {
    const model = createServerRowModel<Row>()
    let calls = 0
    let resolvePage: (value: ServerPagedResult<Row>) => void = () => {}
    const loadPage = () => {
      calls += 1
      return new Promise<ServerPagedResult<Row>>((resolve) => {
        resolvePage = resolve
      })
    }

    const first = model.loadPagedPage({ loadPage, pageIndex: 0, pageSize: 2, view })
    const second = model.loadPagedPage({ loadPage, pageIndex: 0, pageSize: 2, view })

    expect(calls).toBe(1)
    expect(second.deduped).toBe(true)
    expect(second.promise).toBe(first.promise)
    expect(second.query.requestId).toBe(first.query.requestId)

    resolvePage({
      pageIndex: 0,
      pageSize: 2,
      rows: [{ id: "a" }, { id: "b" }],
      totalRows: 2,
    })
    await first.promise

    expect(model.cache.get(first.blockKey)?.state).toBe("loaded")
    expect(model.cache.get(first.blockKey)?.rows).toEqual([{ id: "a" }, { id: "b" }])
  })

  test("aborts superseded paged requests", () => {
    const model = createServerRowModel<Row>()
    const signals: AbortSignal[] = []
    const loadPage = (_query: unknown, context: { signal: AbortSignal }) => {
      signals.push(context.signal)
      return new Promise<ServerPagedResult<Row>>((_resolve, reject) => {
        context.signal.addEventListener("abort", () =>
          reject(new DOMException("Aborted", "AbortError")),
        )
      })
    }

    const first = model.loadPagedPage({ loadPage, pageIndex: 0, pageSize: 2, view })
    first.promise.catch(() => {})
    const second = model.loadPagedPage({ loadPage, pageIndex: 1, pageSize: 2, view })
    second.promise.catch(() => {})

    model.abortExcept(second.blockKey)

    expect(signals[0]?.aborted).toBe(true)
    expect(signals[1]?.aborted).toBe(false)
  })

  test("dedupes concurrent infinite block requests", async () => {
    const model = createServerRowModel<Row>()
    let calls = 0
    let resolveBlock: (value: ServerBlockResult<Row>) => void = () => {}
    const loadBlock = () => {
      calls += 1
      return new Promise<ServerBlockResult<Row>>((resolve) => {
        resolveBlock = resolve
      })
    }

    const first = model.loadInfiniteBlock({ blockSize: 2, blockStart: 0, loadBlock, view })
    const second = model.loadInfiniteBlock({ blockSize: 2, blockStart: 1, loadBlock, view })

    expect(calls).toBe(1)
    expect(second.deduped).toBe(true)
    expect(second.promise).toBe(first.promise)
    expect(second.query.requestId).toBe(first.query.requestId)

    resolveBlock({
      blockSize: 2,
      blockStart: 0,
      hasMore: false,
      rows: [{ id: "a" }, { id: "b" }],
    })
    await first.promise

    expect(model.cache.get(first.blockKey)?.state).toBe("loaded")
    expect(model.cache.get(first.blockKey)?.rows).toEqual([{ id: "a" }, { id: "b" }])
  })

  test("queues infinite block requests over the concurrency limit", async () => {
    const model = createServerRowModel<Row>()
    const resolvers: Array<(value: ServerBlockResult<Row>) => void> = []
    const loadBlock = () =>
      new Promise<ServerBlockResult<Row>>((resolve) => {
        resolvers.push(resolve)
      })

    const first = model.loadInfiniteBlock({
      blockSize: 2,
      blockStart: 0,
      cacheOptions: { maxConcurrentRequests: 1 },
      loadBlock,
      view,
    })
    const second = model.loadInfiniteBlock({
      blockSize: 2,
      blockStart: 2,
      cacheOptions: { maxConcurrentRequests: 1 },
      loadBlock,
      view,
    })

    expect(resolvers.length).toBe(1)
    expect(model.cache.get(second.blockKey)?.state).toBe("queued")

    resolvers[0]?.({
      blockSize: 2,
      blockStart: 0,
      hasMore: true,
      rows: [{ id: "a" }, { id: "b" }],
    })
    await first.promise
    await Promise.resolve()
    await Promise.resolve()

    expect(resolvers.length).toBe(2)
    expect(model.cache.get(second.blockKey)?.state).toBe("fetching")

    resolvers[1]?.({
      blockSize: 2,
      blockStart: 2,
      hasMore: false,
      rows: [{ id: "c" }, { id: "d" }],
    })
    await second.promise
    expect(model.cache.get(second.blockKey)?.state).toBe("loaded")
  })

  test("evicts least-recently-used loaded infinite blocks", async () => {
    const model = createServerRowModel<Row>()
    const loadBlock = (resultRows: Row[]) => (query: { blockStart: number; blockSize: number }) =>
      Promise.resolve({
        blockSize: query.blockSize,
        blockStart: query.blockStart,
        hasMore: query.blockStart < 4,
        rows: resultRows,
      })

    const first = model.loadInfiniteBlock({
      blockSize: 2,
      blockStart: 0,
      cacheOptions: { maxBlocks: 2 },
      loadBlock: loadBlock([{ id: "a" }, { id: "b" }]),
      view,
    })
    await first.promise
    const second = model.loadInfiniteBlock({
      blockSize: 2,
      blockStart: 2,
      cacheOptions: { maxBlocks: 2 },
      loadBlock: loadBlock([{ id: "c" }, { id: "d" }]),
      view,
    })
    await second.promise
    model.cache.get(first.blockKey)
    const third = model.loadInfiniteBlock({
      blockSize: 2,
      blockStart: 4,
      cacheOptions: { maxBlocks: 2 },
      loadBlock: loadBlock([{ id: "e" }, { id: "f" }]),
      view,
    })
    await third.promise

    expect(model.cache.get(first.blockKey)?.state).toBe("loaded")
    expect(model.cache.get(second.blockKey)).toBeUndefined()
    expect(model.cache.get(third.blockKey)?.state).toBe("loaded")
  })

  test("records cache hit rate, fetch latency, queue wait, and row-model events", async () => {
    const events: Array<ServerRowModelEvent<Row>["type"]> = []
    const model = createServerRowModel<Row>({
      onEvent: (event) => events.push(event.type),
    })
    const loadBlock = (query: { blockStart: number; blockSize: number }) =>
      Promise.resolve({
        blockSize: query.blockSize,
        blockStart: query.blockStart,
        hasMore: false,
        rows: [{ id: "a" }, { id: "b" }],
      })

    const first = model.loadInfiniteBlock({
      blockSize: 2,
      blockStart: 0,
      cacheOptions: { blockLoadDebounceMs: 0 },
      loadBlock,
      view,
    })
    await first.promise

    const second = model.loadInfiniteBlock({
      blockSize: 2,
      blockStart: 0,
      cacheOptions: { blockLoadDebounceMs: 0 },
      loadBlock,
      view,
    })
    await second.promise

    const metrics = model.getMetrics()
    expect(second.cached).toBe(true)
    expect(metrics.cacheHits).toBe(1)
    expect(metrics.cacheMisses).toBe(1)
    expect(metrics.cacheHitRate).toBe(0.5)
    expect(metrics.blockFetches).toBe(1)
    expect(metrics.blockFetchLatencyMs.count).toBe(1)
    expect(metrics.blockQueueWaitMs.count).toBe(1)
    expect(events).toContain("blockFetching")
    expect(events).toContain("blockLoaded")
  })

  test("debounces extra infinite block starts while a request is active", async () => {
    const model = createServerRowModel<Row>()
    const resolvers: Array<(value: ServerBlockResult<Row>) => void> = []
    const loadBlock = () =>
      new Promise<ServerBlockResult<Row>>((resolve) => {
        resolvers.push(resolve)
      })

    const first = model.loadInfiniteBlock({
      blockSize: 2,
      blockStart: 0,
      cacheOptions: { blockLoadDebounceMs: 20, maxConcurrentRequests: 2 },
      loadBlock,
      view,
    })
    const second = model.loadInfiniteBlock({
      blockSize: 2,
      blockStart: 2,
      cacheOptions: { blockLoadDebounceMs: 20, maxConcurrentRequests: 2 },
      loadBlock,
      view,
    })

    expect(resolvers.length).toBe(1)
    expect(model.cache.get(second.blockKey)?.state).toBe("queued")
    expect(model.getMetrics().queuedRequests).toBe(1)

    await sleep(30)
    expect(resolvers.length).toBe(2)

    resolvers[0]?.({
      blockSize: 2,
      blockStart: 0,
      hasMore: true,
      rows: [{ id: "a" }, { id: "b" }],
    })
    resolvers[1]?.({
      blockSize: 2,
      blockStart: 2,
      hasMore: false,
      rows: [{ id: "c" }, { id: "d" }],
    })
    await Promise.all([first.promise, second.promise])

    const queueWait = model.getMetrics().blockQueueWaitMs
    expect(queueWait.count).toBe(2)
    expect(queueWait.maxMs).toBeGreaterThanOrEqual(10)
  })

  test("marks invalid infinite block protocol responses as errors", async () => {
    const model = createServerRowModel<Row>()
    const request = model.loadInfiniteBlock({
      blockSize: 2,
      blockStart: 0,
      loadBlock: () =>
        Promise.resolve({
          blockSize: 2,
          blockStart: 0,
          hasMore: true,
          rows: [{ id: "short" }],
        }),
      view,
    })

    await expect(request.promise).rejects.toThrow(
      "ServerBlockResult returned a short block while hasMore is true",
    )
    expect(model.cache.get(request.blockKey)?.state).toBe("error")
  })

  test("dedupes concurrent tree children requests", async () => {
    const model = createServerRowModel<Row>()
    let calls = 0
    let resolveTree: (value: {
      childCount: number
      childStart: number
      groupPath: []
      parentRowId: string | null
      rows: Array<{ data: Row; kind: "leaf" }>
    }) => void = () => {}
    const loadChildren = () => {
      calls += 1
      return new Promise<{
        childCount: number
        childStart: number
        groupPath: []
        parentRowId: string | null
        rows: Array<{ data: Row; kind: "leaf" }>
      }>((resolve) => {
        resolveTree = resolve
      })
    }

    const first = model.loadTreeChildren({
      childCount: 2,
      childStart: 0,
      loadChildren,
      parentRowId: null,
      view,
    })
    const second = model.loadTreeChildren({
      childCount: 2,
      childStart: 0,
      loadChildren,
      parentRowId: null,
      view,
    })

    expect(calls).toBe(1)
    expect(second.deduped).toBe(true)
    expect(second.promise).toBe(first.promise)
    expect(second.query.requestId).toBe(first.query.requestId)

    resolveTree({
      childCount: 2,
      childStart: 0,
      groupPath: [],
      parentRowId: null,
      rows: [{ data: { id: "a" }, kind: "leaf" }],
    })
    await first.promise

    expect(model.cache.get(first.blockKey)?.state).toBe("loaded")
    expect(model.cache.get(first.blockKey)?.rows).toEqual([{ id: "a" }])
  })

  test("marks invalid tree protocol responses as errors", async () => {
    const model = createServerRowModel<Row>()
    const request = model.loadTreeChildren({
      childCount: 2,
      childStart: 0,
      loadChildren: () =>
        Promise.resolve({
          childCount: 2,
          childStart: 2,
          groupPath: [],
          parentRowId: null,
          rows: [],
        }),
      parentRowId: null,
      view,
    })

    await expect(request.promise).rejects.toThrow(
      "ServerTreeResult.childStart 2 does not match query childStart 0",
    )
    expect(model.cache.get(request.blockKey)?.state).toBe("error")
  })

  test("marks blocks containing invalidated rows as stale", () => {
    const model = createServerRowModel<Row>()
    model.cache.markLoaded({
      blockKey: "paged:v1:page:0:size:2",
      rows: [{ id: "a" }, { id: "b" }],
      size: 2,
      start: 0,
      viewKey: "v1",
    })
    model.cache.markLoaded({
      blockKey: "infinite:v1:start:2:size:2",
      rows: [{ id: "c" }, { id: "d" }],
      size: 2,
      start: 2,
      viewKey: "v1",
    })

    const result = model.invalidate({ scope: "rows", rowIds: ["b"] }, { rowId: (row) => row.id })

    expect(result.affectedBlockKeys).toEqual(["paged:v1:page:0:size:2"])
    expect(model.cache.get("paged:v1:page:0:size:2")?.state).toBe("stale")
    expect(model.cache.get("infinite:v1:start:2:size:2")?.state).toBe("loaded")
  })

  test("drops late block results after invalidating an in-flight request", async () => {
    const model = createServerRowModel<Row>()
    let resolvePage: (value: ServerPagedResult<Row>) => void = () => {}
    const request = model.loadPagedPage({
      loadPage: () =>
        new Promise<ServerPagedResult<Row>>((resolve) => {
          resolvePage = resolve
        }),
      pageIndex: 0,
      pageSize: 1,
      view,
      viewKey: "v1",
    })

    expect(model.cache.get(request.blockKey)?.state).toBe("fetching")
    expect(model.invalidate({ scope: "all" }).affectedBlockKeys).toEqual([request.blockKey])
    expect(model.cache.get(request.blockKey)).toBeUndefined()

    resolvePage({
      pageIndex: 0,
      pageSize: 1,
      rows: [{ id: "a" }],
      totalRows: 1,
    })

    await expect(request.promise).rejects.toThrow("Aborted")
    expect(model.cache.get(request.blockKey)).toBeUndefined()
  })

  test("applies streaming row additions to loaded view blocks", () => {
    const events: ServerRowModelEvent<Row>[] = []
    const model = createServerRowModel<Row>({ onEvent: (event) => events.push(event) })
    model.cache.markLoaded({
      blockKey: "infinite:v1:start:0:size:3",
      rows: [
        { id: "a", name: "alpha" },
        { id: "c", name: "charlie" },
      ],
      size: 3,
      start: 0,
      viewKey: "v1",
    })

    const result = model.applyRowUpdate({
      rowId: (row) => row.id,
      update: { indexHint: 1, row: { id: "b", name: "bravo" }, type: "rowAdded", viewKey: "v1" },
      viewKey: "v1",
    })

    expect(result.insertedRowIds).toEqual(["b"])
    expect(model.cache.get("infinite:v1:start:0:size:3")?.rows).toEqual([
      { id: "a", name: "alpha" },
      { id: "b", name: "bravo" },
      { id: "c", name: "charlie" },
    ])
    expect(events.at(-1)).toMatchObject({
      insertedRowIds: ["b"],
      type: "rowUpdateApplied",
    })
  })

  test("applies streaming row updates and removals to loaded active-view rows", () => {
    const model = createServerRowModel<Row>()
    model.cache.markLoaded({
      blockKey: "paged:v1:page:0:size:2",
      rows: [
        { id: "a", name: "old" },
        { id: "b", name: "stable" },
      ],
      size: 2,
      start: 0,
      viewKey: "v1",
    })
    model.cache.markLoaded({
      blockKey: "paged:v2:page:0:size:1",
      rows: [{ id: "a", name: "other-view" }],
      size: 1,
      start: 0,
      viewKey: "v2",
    })

    const updated = model.applyRowUpdate({
      rowId: (row) => row.id,
      update: { row: { id: "a", name: "new" }, rowId: "a", type: "rowUpdated" },
      viewKey: "v1",
    })
    const removed = model.applyRowUpdate({
      rowId: (row) => row.id,
      update: { rowId: "b", type: "rowRemoved" },
      viewKey: "v1",
    })

    expect(updated.updatedRowIds).toEqual(["a"])
    expect(removed.removedRowIds).toEqual(["b"])
    expect(model.cache.get("paged:v1:page:0:size:2")?.rows).toEqual([{ id: "a", name: "new" }])
    expect(model.cache.get("paged:v2:page:0:size:1")?.rows).toEqual([
      { id: "a", name: "other-view" },
    ])
  })

  test("uses row identity to upsert streaming additions without duplicating rows", () => {
    const model = createServerRowModel<Row>()
    model.cache.markLoaded({
      blockKey: "infinite:v1:start:0:size:3",
      rows: [
        { id: "a", name: "alpha" },
        { id: "b", name: "old" },
      ],
      size: 3,
      start: 0,
      viewKey: "v1",
    })

    const result = model.applyRowUpdate({
      rowId: (row) => row.id,
      update: { indexHint: 0, row: { id: "b", name: "new" }, type: "rowAdded", viewKey: "v1" },
      viewKey: "v1",
    })

    expect(result.insertedRowIds).toEqual([])
    expect(result.updatedRowIds).toEqual(["b"])
    expect(model.cache.get("infinite:v1:start:0:size:3")?.rows).toEqual([
      { id: "a", name: "alpha" },
      { id: "b", name: "new" },
    ])
  })

  test("applies streaming updates and removals to stale invalidated row blocks", () => {
    const model = createServerRowModel<Row>()
    model.cache.markLoaded({
      blockKey: "infinite:v1:start:0:size:2",
      rows: [
        { id: "a", name: "old" },
        { id: "b", name: "removed" },
      ],
      size: 2,
      start: 0,
      viewKey: "v1",
    })

    const invalidated = model.invalidate(
      { scope: "rows", rowIds: ["a"] },
      { rowId: (row) => row.id },
    )
    expect(invalidated.affectedBlockKeys).toEqual(["infinite:v1:start:0:size:2"])
    expect(model.cache.get("infinite:v1:start:0:size:2")?.state).toBe("stale")

    const updated = model.applyRowUpdate({
      rowId: (row) => row.id,
      update: { row: { id: "a", name: "new" }, rowId: "a", type: "rowUpdated" },
      viewKey: "v1",
    })
    const removed = model.applyRowUpdate({
      rowId: (row) => row.id,
      update: { rowId: "b", type: "rowRemoved" },
      viewKey: "v1",
    })

    expect(updated.updatedRowIds).toEqual(["a"])
    expect(removed.removedRowIds).toEqual(["b"])
    expect(model.cache.get("infinite:v1:start:0:size:2")?.state).toBe("stale")
    expect(model.cache.get("infinite:v1:start:0:size:2")?.rows).toEqual([{ id: "a", name: "new" }])
  })

  test("applies streaming view invalidation to matching cached blocks", () => {
    const model = createServerRowModel<Row>()
    model.cache.markLoaded({
      blockKey: "paged:v1:page:0:size:1",
      rows: [{ id: "a" }],
      size: 1,
      start: 0,
      viewKey: "v1",
    })
    model.cache.markLoaded({
      blockKey: "paged:v2:page:0:size:1",
      rows: [{ id: "b" }],
      size: 1,
      start: 0,
      viewKey: "v2",
    })

    const result = model.applyRowUpdate({
      rowId: (row) => row.id,
      update: { reason: "server-push", type: "viewInvalidated", viewKey: "v1" },
      viewKey: "v1",
    })

    expect(result.invalidated).toBe(true)
    expect(result.affectedBlockKeys).toEqual(["paged:v1:page:0:size:1"])
    expect(model.cache.get("paged:v1:page:0:size:1")).toBeUndefined()
    expect(model.cache.get("paged:v2:page:0:size:1")?.rows).toEqual([{ id: "b" }])
  })

  test("evicts tree blocks for a parent recursively", async () => {
    const model = createServerRowModel<Row>()
    const loadRoot = model.loadTreeChildren({
      childCount: 1,
      childStart: 0,
      loadChildren: () =>
        Promise.resolve({
          childCount: 1,
          childStart: 0,
          groupPath: [],
          parentRowId: null,
          rows: [
            {
              data: { id: "sales" },
              groupKey: { columnId: "department", rowId: "group:sales", value: "Sales" },
              hasChildren: true,
              kind: "group",
            },
          ],
        }),
      parentRowId: null,
      rowId: (row) => row.id,
      view,
      viewKey: "v1",
    })
    await loadRoot.promise
    const loadChild = model.loadTreeChildren({
      childCount: 1,
      childStart: 0,
      groupPath: [{ columnId: "department", rowId: "group:sales", value: "Sales" }],
      loadChildren: () =>
        Promise.resolve({
          childCount: 1,
          childStart: 0,
          groupPath: [{ columnId: "department", rowId: "group:sales", value: "Sales" }],
          parentRowId: "group:sales",
          rows: [{ data: { id: "child" }, kind: "leaf" }],
        }),
      parentRowId: "group:sales",
      rowId: (row) => row.id,
      view,
      viewKey: "v1",
    })
    await loadChild.promise

    const result = model.invalidate({ scope: "tree", parentRowId: null, recursive: true })

    expect(result.affectedBlockKeys).toEqual([loadRoot.blockKey, loadChild.blockKey])
    expect(model.cache.get(loadRoot.blockKey)).toBeUndefined()
    expect(model.cache.get(loadChild.blockKey)).toBeUndefined()
  })

  test("merges and flattens tree snapshots by expansion", () => {
    const model = createServerRowModel<Row>()
    const salesGroup = { columnId: "department", rowId: "group:sales", value: "Sales" }
    let snapshot = model.createTreeSnapshot()

    snapshot = model.mergeTreeResult({
      getRowId: (row) => row.id,
      parentNode: null,
      result: {
        childCount: 2,
        childStart: 0,
        groupPath: [],
        parentRowId: null,
        rows: [
          {
            data: { id: "sales" },
            groupKey: salesGroup,
            hasChildren: true,
            kind: "group",
          },
          { data: { id: "root-leaf" }, kind: "leaf" },
        ],
      },
      snapshot,
      viewKey: "v1",
    })

    expect(model.flattenTreeSnapshot(snapshot, new Set()).map((node) => node.rowId)).toEqual([
      "group:sales",
      "root-leaf",
    ])

    const groupNode = snapshot.nodes.get("group:sales")
    expect(groupNode).toBeDefined()
    snapshot = model.mergeTreeResult({
      getRowId: (row) => row.id,
      parentNode: groupNode ?? null,
      result: {
        childCount: 1,
        childStart: 0,
        groupPath: [salesGroup],
        parentRowId: "group:sales",
        rows: [{ data: { id: "child" }, kind: "leaf" }],
      },
      snapshot,
      viewKey: "v1",
    })

    expect(snapshot.nodes.get("group:sales")?.childrenLoaded).toBe(true)
    expect(
      model.flattenTreeSnapshot(snapshot, new Set(["group:sales"])).map((node) => node.rowId),
    ).toEqual(["group:sales", "child", "root-leaf"])
  })

  test("queues mutations and overlays every cached copy of a row", () => {
    const model = createServerRowModel<Row>()
    model.cache.markLoaded({
      blockKey: "paged:v1:page:0:size:2",
      rows: [
        { id: "a", name: "old" },
        { id: "b", name: "stable" },
      ],
      size: 2,
      start: 0,
      viewKey: "v1",
    })
    model.cache.markLoaded({
      blockKey: "infinite:v1:start:0:size:2",
      rows: [{ id: "a", name: "old" }],
      size: 2,
      start: 0,
      viewKey: "v1",
    })

    const result = model.queueMutation({
      patch: { changes: { name: "optimistic" }, mutationId: "m1", rowId: "a" },
      rowId: (row) => row.id,
    })

    expect(result.updatedRows).toBe(2)
    expect(model.cache.get("paged:v1:page:0:size:2")?.rows).toEqual([
      { id: "a", name: "optimistic" },
      { id: "b", name: "stable" },
    ])
    expect(model.cache.get("infinite:v1:start:0:size:2")?.rows).toEqual([
      { id: "a", name: "optimistic" },
    ])
    expect(
      model.getState({ mode: "paged", rowCount: 2, selection: emptySelection, view, viewKey: "v1" })
        .pendingMutations,
    ).toEqual(new Map([["m1", { changes: { name: "optimistic" }, mutationId: "m1", rowId: "a" }]]))
  })

  test("queues mutations over stale cached rows", () => {
    const model = createServerRowModel<Row>()
    model.cache.markLoaded({
      blockKey: "infinite:v1:start:0:size:1",
      rows: [{ id: "a", name: "old" }],
      size: 1,
      start: 0,
      viewKey: "v1",
    })
    model.cache.markStale("infinite:v1:start:0:size:1")

    const queued = model.queueMutation({
      patch: { changes: { name: "optimistic" }, mutationId: "m1", rowId: "a" },
      rowId: (row) => row.id,
    })

    expect(queued.updatedRows).toBe(1)
    expect(model.cache.get("infinite:v1:start:0:size:1")?.state).toBe("stale")
    expect(model.cache.get("infinite:v1:start:0:size:1")?.rows).toEqual([
      { id: "a", name: "optimistic" },
    ])

    model.settleMutation({
      result: { mutationId: "m1", reason: "validation", status: "rejected" },
      rowId: (row) => row.id,
    })

    expect(model.cache.get("infinite:v1:start:0:size:1")?.state).toBe("stale")
    expect(model.cache.get("infinite:v1:start:0:size:1")?.rows).toEqual([{ id: "a", name: "old" }])
  })

  test("rejecting a mutation after a server row update rolls back to the latest canonical row", () => {
    const model = createServerRowModel<Row>()
    model.cache.markLoaded({
      blockKey: "infinite:v1:start:0:size:1",
      rows: [{ amount: 1, id: "a", name: "old" }],
      size: 1,
      start: 0,
      viewKey: "v1",
    })
    model.queueMutation({
      patch: { changes: { name: "optimistic" }, mutationId: "m1", rowId: "a" },
      rowId: (row) => row.id,
    })
    model.invalidate({ scope: "rows", rowIds: ["a"] }, { rowId: (row) => row.id })

    const updated = model.applyRowUpdate({
      rowId: (row) => row.id,
      update: { row: { amount: 2, id: "a", name: "server" }, rowId: "a", type: "rowUpdated" },
      viewKey: "v1",
    })

    expect(updated.updatedRowIds).toEqual(["a"])
    expect(model.cache.get("infinite:v1:start:0:size:1")?.state).toBe("stale")
    expect(model.cache.get("infinite:v1:start:0:size:1")?.rows).toEqual([
      { amount: 2, id: "a", name: "optimistic" },
    ])

    const settled = model.settleMutation({
      result: { mutationId: "m1", reason: "validation", status: "rejected" },
      rowId: (row) => row.id,
    })

    expect(settled.pending).toBe(false)
    expect(model.cache.get("infinite:v1:start:0:size:1")?.state).toBe("stale")
    expect(model.cache.get("infinite:v1:start:0:size:1")?.rows).toEqual([
      { amount: 2, id: "a", name: "server" },
    ])
  })

  test("applies pending mutations to rows loaded after the mutation was queued", async () => {
    const model = createServerRowModel<Row>()
    const queued = model.queueMutation({
      patch: { changes: { name: "optimistic" }, mutationId: "m1", rowId: "a" },
      rowId: (row) => row.id,
    })

    expect(queued.updatedRows).toBe(0)

    const page = model.loadPagedPage({
      loadPage: () =>
        Promise.resolve({
          pageIndex: 0,
          pageSize: 1,
          rows: [{ id: "a", name: "old" }],
          totalRows: 1,
        }),
      pageIndex: 0,
      pageSize: 1,
      view,
      viewKey: "v1",
    })
    const result = await page.promise

    expect(result.rows).toEqual([{ id: "a", name: "optimistic" }])
    expect(model.cache.get(page.blockKey)?.rows).toEqual([{ id: "a", name: "optimistic" }])

    model.settleMutation({
      result: { mutationId: "m1", reason: "validation", status: "rejected" },
      rowId: (row) => row.id,
    })
    expect(model.cache.get(page.blockKey)?.rows).toEqual([{ id: "a", name: "old" }])
  })

  test("keeps optimistic paged edits across page changes and rolls back after refetch rejection", async () => {
    const model = createServerRowModel<Row>()
    const viewKey = "customers:view"
    const page0 = model.loadPagedPage({
      loadPage: () =>
        Promise.resolve({
          pageIndex: 0,
          pageSize: 2,
          rows: [
            { id: "a", name: "old" },
            { id: "b", name: "stable" },
          ],
          totalRows: 3,
          viewKey,
        }),
      pageIndex: 0,
      pageSize: 2,
      view,
      viewKey,
    })
    await page0.promise

    model.queueMutation({
      patch: { changes: { name: "optimistic" }, mutationId: "m1", rowId: "a" },
      rowId: (row) => row.id,
    })
    expect(model.cache.get(page0.blockKey)?.rows).toEqual([
      { id: "a", name: "optimistic" },
      { id: "b", name: "stable" },
    ])

    const page1 = model.loadPagedPage({
      loadPage: () =>
        Promise.resolve({
          pageIndex: 1,
          pageSize: 2,
          rows: [{ id: "c", name: "other page" }],
          totalRows: 3,
          viewKey,
        }),
      pageIndex: 1,
      pageSize: 2,
      view,
      viewKey,
    })
    await page1.promise
    expect(model.cache.get(page1.blockKey)?.rows).toEqual([{ id: "c", name: "other page" }])
    expect(
      model.getState({
        mode: "paged",
        rowCount: 3,
        selection: emptySelection,
        view,
        viewKey,
      }).pendingMutations.size,
    ).toBe(1)

    const refetchedPage0 = model.loadPagedPage({
      loadPage: () =>
        Promise.resolve({
          pageIndex: 0,
          pageSize: 2,
          rows: [
            { id: "a", name: "server still old" },
            { id: "b", name: "stable" },
          ],
          totalRows: 3,
          viewKey,
        }),
      pageIndex: 0,
      pageSize: 2,
      view,
      viewKey,
    })
    expect((await refetchedPage0.promise).rows).toEqual([
      { id: "a", name: "optimistic" },
      { id: "b", name: "stable" },
    ])

    model.settleMutation({
      result: { mutationId: "m1", reason: "Name failed validation", status: "rejected" },
      rowId: (row) => row.id,
    })

    expect(model.cache.get(refetchedPage0.blockKey)?.rows).toEqual([
      { id: "a", name: "server still old" },
      { id: "b", name: "stable" },
    ])
    expect(model.cache.get(page1.blockKey)?.rows).toEqual([{ id: "c", name: "other page" }])
    expect(
      model.getState({
        mode: "paged",
        rowCount: 3,
        selection: emptySelection,
        view,
        viewKey,
      }).pendingMutations.size,
    ).toBe(0)
  })

  test("settles accepted mutations with the server canonical row", () => {
    const model = createServerRowModel<Row>()
    model.cache.markLoaded({
      blockKey: "paged:v1:page:0:size:1",
      rows: [{ id: "a", name: "old" }],
      size: 1,
      start: 0,
      viewKey: "v1",
    })
    model.queueMutation({
      patch: { changes: { name: "optimistic" }, mutationId: "m1", rowId: "a" },
      rowId: (row) => row.id,
    })

    const result = model.settleMutation({
      result: { mutationId: "m1", row: { id: "a", name: "server" }, status: "accepted" },
      rowId: (row) => row.id,
    })

    expect(result.pending).toBe(false)
    expect(result.updatedRows).toBe(1)
    expect(model.cache.get("paged:v1:page:0:size:1")?.rows).toEqual([{ id: "a", name: "server" }])
    expect(
      model.getState({ mode: "paged", rowCount: 1, selection: emptySelection, view, viewKey: "v1" })
        .pendingMutations.size,
    ).toBe(0)
  })

  test("settles accepted mutations without a canonical row by keeping the optimistic patch", () => {
    const model = createServerRowModel<Row>()
    model.cache.markLoaded({
      blockKey: "paged:v1:page:0:size:1",
      rows: [{ amount: 1, id: "a", name: "old" }],
      size: 1,
      start: 0,
      viewKey: "v1",
    })
    model.queueMutation({
      patch: { changes: { amount: 2, name: "optimistic" }, mutationId: "m1", rowId: "a" },
      rowId: (row) => row.id,
    })

    const result = model.settleMutation({
      result: { mutationId: "m1", status: "accepted" },
      rowId: (row) => row.id,
    })

    expect(result.pending).toBe(false)
    expect(result.updatedRows).toBe(1)
    expect(model.cache.get("paged:v1:page:0:size:1")?.rows).toEqual([
      { amount: 2, id: "a", name: "optimistic" },
    ])
  })

  test("ignores stale mutation settlements after the queue no longer contains the mutation", () => {
    const model = createServerRowModel<Row>()
    model.cache.markLoaded({
      blockKey: "paged:v1:page:0:size:1",
      rows: [{ id: "a", name: "current" }],
      size: 1,
      start: 0,
      viewKey: "v1",
    })

    const result = model.settleMutation({
      result: { mutationId: "stale", row: { id: "a", name: "late-server" }, status: "accepted" },
      rowId: (row) => row.id,
    })

    expect(result.pending).toBe(false)
    expect(result.updatedRows).toBe(0)
    expect(model.cache.get("paged:v1:page:0:size:1")?.rows).toEqual([{ id: "a", name: "current" }])
  })

  test("settles accepted mutations that remap row identity", () => {
    const model = createServerRowModel<Row>()
    model.cache.markLoaded({
      blockKey: "paged:v1:page:0:size:1",
      rows: [{ id: "temp-a", name: "optimistic create" }],
      size: 1,
      start: 0,
      viewKey: "v1",
    })
    model.queueMutation({
      patch: { changes: { name: "draft" }, mutationId: "m1", rowId: "temp-a" },
      rowId: (row) => row.id,
    })

    const result = model.settleMutation({
      result: {
        mutationId: "m1",
        previousRowId: "temp-a",
        row: { id: "customer-1", name: "server canonical" },
        rowId: "customer-1",
        status: "accepted",
      },
      rowId: (row) => row.id,
    })

    expect(result.pending).toBe(false)
    expect(result.updatedRows).toBe(1)
    expect(model.cache.get("paged:v1:page:0:size:1")?.rows).toEqual([
      { id: "customer-1", name: "server canonical" },
    ])
  })

  test("settles identity remaps while preserving later pending mutations", () => {
    const model = createServerRowModel<Row>()
    model.cache.markLoaded({
      blockKey: "paged:v1:page:0:size:1",
      rows: [{ amount: 1, id: "temp-a", name: "draft" }],
      size: 1,
      start: 0,
      viewKey: "v1",
    })
    model.queueMutation({
      patch: { changes: { name: "optimistic name" }, mutationId: "m1", rowId: "temp-a" },
      rowId: (row) => row.id,
    })
    model.queueMutation({
      patch: { changes: { amount: 2 }, mutationId: "m2", rowId: "temp-a" },
      rowId: (row) => row.id,
    })

    const settled = model.settleMutation({
      result: {
        mutationId: "m1",
        previousRowId: "temp-a",
        row: { amount: 1, id: "customer-1", name: "server name" },
        rowId: "customer-1",
        status: "accepted",
      },
      rowId: (row) => row.id,
    })

    expect(settled.pending).toBe(true)
    expect(model.cache.get("paged:v1:page:0:size:1")?.rows).toEqual([
      { amount: 2, id: "customer-1", name: "server name" },
    ])
    expect(
      model.getState({ mode: "paged", rowCount: 1, selection: emptySelection, view, viewKey: "v1" })
        .pendingMutations,
    ).toEqual(new Map([["m2", { changes: { amount: 2 }, mutationId: "m2", rowId: "customer-1" }]]))
  })

  test("rolls back rejected mutations", () => {
    const model = createServerRowModel<Row>()
    model.cache.markLoaded({
      blockKey: "paged:v1:page:0:size:1",
      rows: [{ id: "a", name: "old" }],
      size: 1,
      start: 0,
      viewKey: "v1",
    })
    model.queueMutation({
      patch: { changes: { name: "optimistic" }, mutationId: "m1", rowId: "a" },
      rowId: (row) => row.id,
    })

    const result = model.settleMutation({
      result: { mutationId: "m1", reason: "validation", status: "rejected" },
      rowId: (row) => row.id,
    })

    expect(result.pending).toBe(false)
    expect(model.cache.get("paged:v1:page:0:size:1")?.rows).toEqual([{ id: "a", name: "old" }])
  })

  test("recomputes later optimistic mutations when an earlier mutation rejects", () => {
    const model = createServerRowModel<Row>()
    model.cache.markLoaded({
      blockKey: "paged:v1:page:0:size:1",
      rows: [{ amount: 1, id: "a", name: "old" }],
      size: 1,
      start: 0,
      viewKey: "v1",
    })
    model.queueMutation({
      patch: { changes: { name: "first" }, mutationId: "m1", rowId: "a" },
      rowId: (row) => row.id,
    })
    model.queueMutation({
      patch: { changes: { amount: 2 }, mutationId: "m2", rowId: "a" },
      rowId: (row) => row.id,
    })

    const result = model.settleMutation({
      result: { mutationId: "m1", reason: "validation", status: "rejected" },
      rowId: (row) => row.id,
    })

    expect(result.pending).toBe(true)
    expect(model.cache.get("paged:v1:page:0:size:1")?.rows).toEqual([
      { amount: 2, id: "a", name: "old" },
    ])
    expect(
      model.getState({ mode: "paged", rowCount: 1, selection: emptySelection, view, viewKey: "v1" })
        .pendingMutations,
    ).toEqual(new Map([["m2", { changes: { amount: 2 }, mutationId: "m2", rowId: "a" }]]))
  })

  test("settles conflicts on stale blocks without dropping later optimistic overlays", () => {
    const model = createServerRowModel<Row>()
    model.cache.markLoaded({
      blockKey: "paged:v1:page:0:size:1",
      rows: [{ amount: 1, id: "a", name: "old" }],
      size: 1,
      start: 0,
      viewKey: "v1",
    })
    model.queueMutation({
      patch: { changes: { name: "first" }, mutationId: "m1", rowId: "a" },
      rowId: (row) => row.id,
    })
    model.queueMutation({
      patch: { changes: { amount: 2 }, mutationId: "m2", rowId: "a" },
      rowId: (row) => row.id,
    })
    model.invalidate({ scope: "rows", rowIds: ["a"] }, { rowId: (row) => row.id })

    const result = model.settleMutation({
      result: {
        mutationId: "m1",
        row: { amount: 10, id: "a", name: "server" },
        status: "conflict",
      },
      rowId: (row) => row.id,
    })

    expect(result.pending).toBe(true)
    expect(model.cache.get("paged:v1:page:0:size:1")?.state).toBe("stale")
    expect(model.cache.get("paged:v1:page:0:size:1")?.rows).toEqual([
      { amount: 2, id: "a", name: "server" },
    ])
  })

  test("settles conflicts with the server canonical row", () => {
    const model = createServerRowModel<Row>()
    model.cache.markLoaded({
      blockKey: "paged:v1:page:0:size:1",
      rows: [{ id: "a", name: "old" }],
      size: 1,
      start: 0,
      viewKey: "v1",
    })
    model.queueMutation({
      patch: { changes: { name: "optimistic" }, mutationId: "m1", rowId: "a" },
      rowId: (row) => row.id,
    })

    const result = model.settleMutation({
      result: { mutationId: "m1", row: { id: "a", name: "server" }, status: "conflict" },
      rowId: (row) => row.id,
    })

    expect(result.pending).toBe(false)
    expect(model.cache.get("paged:v1:page:0:size:1")?.rows).toEqual([{ id: "a", name: "server" }])
  })

  test("late paged response after abortExcept does not repopulate the cache", async () => {
    // User navigates from page 0 → page 1; the page-0 fetch resolves
    // late. The aborted request must NOT mark page 0 as loaded — its
    // rows would be from a prior view, and a subsequent navigation
    // back to page 0 would briefly read those rows before triggering
    // a refetch (the brief: "stale/aborted page or block responses
    // must not repopulate an old view").
    const model = createServerRowModel<Row>()
    let resolvePage0: (value: ServerPagedResult<Row>) => void = () => {}
    const loadPage = (query: { pageIndex: number }, _ctx: { signal: AbortSignal }) => {
      if (query.pageIndex === 0) {
        return new Promise<ServerPagedResult<Row>>((resolve) => {
          resolvePage0 = resolve
        })
      }
      return Promise.resolve<ServerPagedResult<Row>>({
        pageIndex: 1,
        pageSize: 1,
        rows: [{ id: "b" }],
        totalRows: 2,
      })
    }

    const page0 = model.loadPagedPage({ loadPage, pageIndex: 0, pageSize: 1, view, viewKey: "v1" })
    page0.promise.catch(() => {})
    const page1 = model.loadPagedPage({ loadPage, pageIndex: 1, pageSize: 1, view, viewKey: "v1" })
    model.abortExcept(page1.blockKey)
    await page1.promise

    // After abortExcept the page-0 cache entry is still in the
    // "fetching" placeholder state set by markFetching — abortExcept
    // only fires the controller's signal, it doesn't evict the
    // placeholder. Crucially, no rows are loaded.
    expect(model.cache.get(page0.blockKey)?.state).not.toBe("loaded")

    // Resolve the original page-0 request late. The .then handler must
    // observe the aborted signal and throw, so the cache placeholder
    // never transitions to "loaded" with the stale rows.
    resolvePage0({
      pageIndex: 0,
      pageSize: 1,
      rows: [{ id: "stale" }],
      totalRows: 2,
    })

    await expect(page0.promise).rejects.toThrow("Aborted")
    // The block must not have been promoted to "loaded" with the stale
    // late-arriving rows. (Implementation may keep the placeholder or
    // evict it; either is acceptable. What matters is no stale data.)
    const page0Block = model.cache.get(page0.blockKey)
    if (page0Block) {
      expect(page0Block.state).not.toBe("loaded")
      expect(page0Block.rows).not.toContainEqual({ id: "stale" })
    }
    // page 1 stayed loaded with its real rows.
    expect(model.cache.get(page1.blockKey)?.state).toBe("loaded")
    expect(model.cache.get(page1.blockKey)?.rows).toEqual([{ id: "b" }])
  })

  test("late infinite block response after invalidate does not repopulate the cache", async () => {
    // Mirror of the existing paged-late-after-invalidate test for the
    // infinite path. invalidate({scope:"all"}) aborts the in-flight
    // request; when its promise resolves late, the cache must stay
    // empty.
    const model = createServerRowModel<Row>()
    let resolveBlock: (value: ServerBlockResult<Row>) => void = () => {}
    const block = model.loadInfiniteBlock({
      blockSize: 2,
      blockStart: 0,
      loadBlock: () =>
        new Promise<ServerBlockResult<Row>>((resolve) => {
          resolveBlock = resolve
        }),
      view,
      viewKey: "v1",
    })
    block.promise.catch(() => {})

    expect(model.cache.get(block.blockKey)?.state).toBe("fetching")
    expect(model.invalidate({ scope: "all" }).affectedBlockKeys).toEqual([block.blockKey])
    expect(model.cache.get(block.blockKey)).toBeUndefined()

    resolveBlock({
      blockSize: 2,
      blockStart: 0,
      rows: [{ id: "stale" }],
      totalRows: 1,
      viewKey: "v1",
    })

    await expect(block.promise).rejects.toThrow("Aborted")
    expect(model.cache.get(block.blockKey)).toBeUndefined()
  })

  test("late infinite block response after abortExcept does not repopulate the cache", async () => {
    const model = createServerRowModel<Row>()
    let resolveBlock0: (value: ServerBlockResult<Row>) => void = () => {}
    const loadBlock = (query: { blockStart: number }, _ctx: { signal: AbortSignal }) => {
      if (query.blockStart === 0) {
        return new Promise<ServerBlockResult<Row>>((resolve) => {
          resolveBlock0 = resolve
        })
      }
      return Promise.resolve<ServerBlockResult<Row>>({
        blockSize: 2,
        blockStart: 2,
        rows: [{ id: "c" }, { id: "d" }],
        totalRows: 4,
        viewKey: "v1",
      })
    }

    const block0 = model.loadInfiniteBlock({
      blockSize: 2,
      blockStart: 0,
      loadBlock,
      view,
      viewKey: "v1",
    })
    block0.promise.catch(() => {})
    const block1 = model.loadInfiniteBlock({
      blockSize: 2,
      blockStart: 2,
      loadBlock,
      view,
      viewKey: "v1",
    })
    model.abortExcept(block1.blockKey)
    await block1.promise

    resolveBlock0({
      blockSize: 2,
      blockStart: 0,
      rows: [{ id: "stale-0" }, { id: "stale-1" }],
      totalRows: 4,
      viewKey: "v1",
    })

    await expect(block0.promise).rejects.toThrow("Aborted")
    const block0Entry = model.cache.get(block0.blockKey)
    if (block0Entry) {
      expect(block0Entry.state).not.toBe("loaded")
      expect(block0Entry.rows).not.toContainEqual({ id: "stale-0" })
      expect(block0Entry.rows).not.toContainEqual({ id: "stale-1" })
    }
    expect(model.cache.get(block1.blockKey)?.rows).toEqual([{ id: "c" }, { id: "d" }])
  })

  test("cache.clear discards every block including stale and errored", () => {
    // refresh({purge: true}) in serverGrid.tsx calls cache.clear().
    // Direct-test the cache method so the purge path stays solid.
    const model = createServerRowModel<Row>()
    model.cache.markLoaded({
      blockKey: "paged:v1:page:0:size:2",
      rows: [{ id: "a" }, { id: "b" }],
      size: 2,
      start: 0,
      viewKey: "v1",
    })
    model.cache.markLoaded({
      blockKey: "infinite:v1:start:2:size:2",
      rows: [{ id: "c" }, { id: "d" }],
      size: 2,
      start: 2,
      viewKey: "v1",
    })
    model.cache.markStale("paged:v1:page:0:size:2")
    expect(model.cache.get("paged:v1:page:0:size:2")?.state).toBe("stale")

    model.cache.clear()

    expect(model.cache.get("paged:v1:page:0:size:2")).toBeUndefined()
    expect(model.cache.get("infinite:v1:start:2:size:2")).toBeUndefined()
    expect(model.cache.toMap().size).toBe(0)
  })

  test("invalidate scope=view drops only blocks for the targeted viewKey", () => {
    // After a sort/filter change in the host, the consumer typically
    // calls invalidate({scope:"view", viewKey: previousViewKey}).
    // Other views (e.g., a tab the user previously switched away from)
    // must keep their cache so navigating back doesn't refetch.
    const model = createServerRowModel<Row>()
    model.cache.markLoaded({
      blockKey: "paged:vA:page:0:size:2",
      rows: [{ id: "a" }],
      size: 2,
      start: 0,
      viewKey: "vA",
    })
    model.cache.markLoaded({
      blockKey: "paged:vB:page:0:size:2",
      rows: [{ id: "b" }],
      size: 2,
      start: 0,
      viewKey: "vB",
    })

    const result = model.invalidate({ scope: "view", viewKey: "vA" })
    expect(result.affectedBlockKeys).toEqual(["paged:vA:page:0:size:2"])
    expect(model.cache.get("paged:vA:page:0:size:2")).toBeUndefined()
    expect(model.cache.get("paged:vB:page:0:size:2")?.state).toBe("loaded")
    expect(model.cache.get("paged:vB:page:0:size:2")?.rows).toEqual([{ id: "b" }])
  })

  test("invalidate scope=blocks drops only the named keys", () => {
    const model = createServerRowModel<Row>()
    model.cache.markLoaded({
      blockKey: "paged:v1:page:0:size:2",
      rows: [{ id: "a" }],
      size: 2,
      start: 0,
      viewKey: "v1",
    })
    model.cache.markLoaded({
      blockKey: "paged:v1:page:1:size:2",
      rows: [{ id: "b" }],
      size: 2,
      start: 2,
      viewKey: "v1",
    })

    const result = model.invalidate({
      scope: "blocks",
      blockKeys: ["paged:v1:page:0:size:2"],
    })
    expect(result.affectedBlockKeys).toEqual(["paged:v1:page:0:size:2"])
    expect(model.cache.get("paged:v1:page:0:size:2")).toBeUndefined()
    expect(model.cache.get("paged:v1:page:1:size:2")?.state).toBe("loaded")
  })

  test("pending mutations survive cache.clear() and apply to subsequently loaded rows", async () => {
    // refresh({purge: true}) in serverGrid.tsx clears the cache but
    // leaves the optimistic mutation queue intact. A page reload
    // triggered after the purge must still surface the pending patch
    // — otherwise users would see their optimistic edits flicker back
    // to canonical mid-network. Bridges the "purge" and "queued
    // mutation applies to later-loaded rows" buckets in the brief.
    const model = createServerRowModel<Row>()
    model.cache.markLoaded({
      blockKey: "paged:v1:page:0:size:1",
      rows: [{ id: "a", name: "old" }],
      size: 1,
      start: 0,
      viewKey: "v1",
    })

    model.queueMutation({
      patch: { changes: { name: "optimistic" }, mutationId: "m1", rowId: "a" },
      rowId: (row) => row.id,
    })
    expect(model.cache.get("paged:v1:page:0:size:1")?.rows).toEqual([
      { id: "a", name: "optimistic" },
    ])

    // Purge the cache — mimics refresh({purge: true}).
    model.cache.clear()
    expect(model.cache.toMap().size).toBe(0)

    // Reload the page. The mutation queue is still active; the freshly
    // loaded server row must come back with the optimistic patch
    // overlaid.
    const page = model.loadPagedPage({
      loadPage: () =>
        Promise.resolve({
          pageIndex: 0,
          pageSize: 1,
          rows: [{ id: "a", name: "server-old" }],
          totalRows: 1,
        }),
      pageIndex: 0,
      pageSize: 1,
      view,
      viewKey: "v1",
    })
    const result = await page.promise

    expect(result.rows).toEqual([{ id: "a", name: "optimistic" }])
    expect(model.cache.get(page.blockKey)?.rows).toEqual([{ id: "a", name: "optimistic" }])
  })

  test("pending mutations survive cache.clear() across an identity remap", async () => {
    // Identity remap: the server settles an accepted mutation with a
    // new rowId (e.g., a draft "tmp:1" becomes the real "row:42"). If
    // a follow-up purge + reload happens after the remap, the queue
    // is empty (mutation already settled) and the freshly-loaded
    // canonical row should NOT carry an outdated optimistic overlay.
    const model = createServerRowModel<Row>()
    model.queueMutation({
      patch: { changes: { name: "optimistic" }, mutationId: "m1", rowId: "tmp:1" },
      rowId: (row) => row.id,
    })
    model.settleMutation({
      result: {
        mutationId: "m1",
        previousRowId: "tmp:1",
        row: { id: "row:42", name: "server" },
        status: "accepted",
      },
      rowId: (row) => row.id,
    })

    model.cache.clear()

    const page = model.loadPagedPage({
      loadPage: () =>
        Promise.resolve({
          pageIndex: 0,
          pageSize: 1,
          rows: [{ id: "row:42", name: "server" }],
          totalRows: 1,
        }),
      pageIndex: 0,
      pageSize: 1,
      view,
      viewKey: "v1",
    })
    const result = await page.promise

    // No pending mutation is in queue, so the canonical server row
    // surfaces unchanged.
    expect(result.rows).toEqual([{ id: "row:42", name: "server" }])
  })

  test("conflict result without a canonical row leaves cached rows untouched", () => {
    // The brief: "conflict results apply canonical rows when supplied."
    // The mirror invariant — conflict WITHOUT a canonical row — must
    // not delete or rewrite cached rows; it only signals the
    // application layer that the optimistic edit conflicted.
    const model = createServerRowModel<Row>()
    model.cache.markLoaded({
      blockKey: "paged:v1:page:0:size:1",
      rows: [{ id: "a", name: "server-canonical" }],
      size: 1,
      start: 0,
      viewKey: "v1",
    })
    model.queueMutation({
      patch: { changes: { name: "optimistic" }, mutationId: "m1", rowId: "a" },
      rowId: (row) => row.id,
    })

    const settled = model.settleMutation({
      result: { mutationId: "m1", reason: "stale-revision", status: "conflict" },
      rowId: (row) => row.id,
    })
    expect(settled.pending).toBe(false)
    // Conflict-no-canonical: rolls back to the row that was cached
    // before the optimistic patch, exactly the same as a rejected
    // settle without a row.
    expect(model.cache.get("paged:v1:page:0:size:1")?.rows).toEqual([
      { id: "a", name: "server-canonical" },
    ])
  })
})

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

describe("paged stale-response flood (worker1 audit P1 §9)", () => {
  test("10 rapid keystroke-style requests: only the latest result lands; all priors abort", async () => {
    const model = createServerRowModel<Row>()

    const buildView = (id: number): ServerViewState => ({
      groupBy: [],
      sort: [],
      visibleColumns: ["name"],
      filter: {
        columnId: "name",
        kind: "column",
        op: "contains",
        type: "text",
        value: `flood-${id}`,
      },
    })

    const requests: Array<{
      blockKey: string
      load: ReturnType<typeof deferred<ServerPagedResult<Row>>>
      promise: Promise<ServerPagedResult<Row>>
      viewKey: string
    }> = []

    // Fire 10 paged requests rapidly — mirrors a user typing "flood-0…9"
    // into a search input over <1s with no debounce. The React layer
    // would normally debounce; this test pins the model-layer contract
    // assuming the debounced state still produces 10 distinct queries.
    for (let i = 0; i < 10; i++) {
      const view = buildView(i)
      const viewKey = model.createViewKey(view)
      const load = deferred<ServerPagedResult<Row>>()
      const request = model.loadPagedPage({
        loadPage: () => load.promise,
        pageIndex: 0,
        pageSize: 25,
        view,
        viewKey,
      })
      // Suppress unhandled rejection warnings; we assert on rejection
      // explicitly below.
      request.promise.catch(() => {})
      // Abort all priors as the new request lands — mirrors the React
      // serverGrid layer's abortExcept-on-each-load behavior.
      model.abortExcept(request.blockKey)
      requests.push({
        blockKey: request.blockKey,
        load,
        promise: request.promise,
        viewKey,
      })
    }

    // Settle all 10 backing loaders out of order: 0, 9, 1, 8, …, 4, 5.
    // The model's abort gate must drop the 9 stale results regardless.
    const order = [0, 9, 1, 8, 2, 7, 3, 6, 4, 5]
    for (const i of order) {
      const r = requests[i]
      if (!r) throw new Error("missing request")
      r.load.resolve({
        pageIndex: 0,
        pageSize: 25,
        rows: [{ id: `row-${i}`, name: `flood-${i}` }],
        totalRows: 1,
        viewKey: r.viewKey,
      })
    }

    // The first 9 promises reject with AbortError (their controllers
    // were aborted when later requests fired via abortExcept).
    for (let i = 0; i < 9; i++) {
      const r = requests[i]
      if (!r) throw new Error("missing request")
      await expect(r.promise).rejects.toThrow("Aborted")
    }

    // The 10th (latest) request resolves successfully.
    const last = requests[9]
    if (!last) throw new Error("missing last request")
    const lastResult = await last.promise
    expect(lastResult.rows).toEqual([{ id: "row-9", name: "flood-9" }])

    // Cache reflects only the latest active request's data.
    const lastBlock = model.cache.get(last.blockKey)
    expect(lastBlock?.state).toBe("loaded")
    expect(lastBlock?.rows).toEqual([{ id: "row-9", name: "flood-9" }])

    // None of the 9 prior block-keys remain as loaded in the cache.
    for (let i = 0; i < 9; i++) {
      const r = requests[i]
      if (!r) throw new Error("missing request")
      const block = model.cache.get(r.blockKey)
      if (block) expect(block.state).not.toBe("loaded")
    }
  })
})

describe("hasInFlightRequests + awaitAllSettled (server-mode-switch RFC §6)", () => {
  test("hasInFlightRequests returns false on a fresh model with no requests", () => {
    const model = createServerRowModel<Row>()
    expect(model.hasInFlightRequests()).toBe(false)
  })

  test("hasInFlightRequests returns true while a paged request is in flight, false after settle", async () => {
    const model = createServerRowModel<Row>()
    const load = deferred<ServerPagedResult<Row>>()
    const request = model.loadPagedPage({
      loadPage: () => load.promise,
      pageIndex: 0,
      pageSize: 25,
      view,
    })
    expect(model.hasInFlightRequests()).toBe(true)
    load.resolve({
      pageIndex: 0,
      pageSize: 25,
      rows: [{ id: "a", name: "Acme" }],
      totalRows: 1,
    })
    await request.promise
    expect(model.hasInFlightRequests()).toBe(false)
  })

  test("awaitAllSettled resolves immediately when no requests are in flight", async () => {
    const model = createServerRowModel<Row>()
    const start = performance.now()
    await model.awaitAllSettled()
    expect(performance.now() - start).toBeLessThan(5)
  })

  test("awaitAllSettled resolves when all in-flight requests settle (success or rejection)", async () => {
    const model = createServerRowModel<Row>()
    const successLoad = deferred<ServerPagedResult<Row>>()
    const failLoad = deferred<ServerPagedResult<Row>>()

    const successRequest = model.loadPagedPage({
      loadPage: () => successLoad.promise,
      pageIndex: 0,
      pageSize: 25,
      view,
    })
    successRequest.promise.catch(() => {})

    const failRequest = model.loadPagedPage({
      loadPage: () => failLoad.promise,
      pageIndex: 1,
      pageSize: 25,
      view,
    })
    failRequest.promise.catch(() => {})

    expect(model.hasInFlightRequests()).toBe(true)

    const settledPromise = model.awaitAllSettled()

    successLoad.resolve({
      pageIndex: 0,
      pageSize: 25,
      rows: [{ id: "a", name: "Acme" }],
      totalRows: 1,
    })
    failLoad.reject(new Error("server hiccup"))

    await settledPromise
    expect(model.hasInFlightRequests()).toBe(false)
  })
})

describe("pendingMutationIds (server-mode-switch RFC §4 item 13)", () => {
  test("returns empty array on a fresh model", () => {
    const model = createServerRowModel<Row>()
    expect(model.pendingMutationIds()).toEqual([])
  })

  test("returns the IDs of currently-pending mutations in insertion order", () => {
    const model = createServerRowModel<Row>()
    model.cache.markLoaded({
      blockKey: "paged:v1:page:0:size:1",
      rows: [{ id: "a", name: "Acme" }],
      size: 1,
      start: 0,
      viewKey: "v1",
    })
    model.queueMutation({
      patch: { changes: { name: "first" }, mutationId: "m-1", rowId: "a" },
      rowId: (row) => row.id,
    })
    model.queueMutation({
      patch: { changes: { name: "second" }, mutationId: "m-2", rowId: "a" },
      rowId: (row) => row.id,
    })
    expect(model.pendingMutationIds()).toEqual(["m-1", "m-2"])
  })

  test("returns a fresh array each call so iteration during settle does not skip entries", () => {
    const model = createServerRowModel<Row>()
    model.cache.markLoaded({
      blockKey: "paged:v1:page:0:size:1",
      rows: [{ id: "a", name: "Acme" }],
      size: 1,
      start: 0,
      viewKey: "v1",
    })
    model.queueMutation({
      patch: { changes: { name: "x" }, mutationId: "m-1", rowId: "a" },
      rowId: (row) => row.id,
    })

    const snapshot = model.pendingMutationIds()
    // Settle the mutation in the snapshot — new pendingMutationIds()
    // should return [] but the captured snapshot still contains the
    // settled id.
    model.settleMutation({
      result: { mutationId: "m-1", reason: "test", status: "rejected" },
      rowId: (row) => row.id,
    })
    expect(snapshot).toEqual(["m-1"])
    expect(model.pendingMutationIds()).toEqual([])
  })

  test("force-settle pattern: iterate pendingMutationIds() and settle each as rejected", () => {
    // Mirrors the React-layer mode-switch grace flow: get the current
    // ID set, settle each as rejected with reason="mode switch", verify
    // pending count returns to zero.
    const model = createServerRowModel<Row>()
    model.cache.markLoaded({
      blockKey: "paged:v1:page:0:size:2",
      rows: [
        { id: "a", name: "Acme" },
        { id: "b", name: "Beta" },
      ],
      size: 2,
      start: 0,
      viewKey: "v1",
    })
    model.queueMutation({
      patch: { changes: { name: "x" }, mutationId: "m-1", rowId: "a" },
      rowId: (row) => row.id,
    })
    model.queueMutation({
      patch: { changes: { name: "y" }, mutationId: "m-2", rowId: "b" },
      rowId: (row) => row.id,
    })
    expect(model.pendingMutationIds()).toHaveLength(2)

    for (const mutationId of model.pendingMutationIds()) {
      model.settleMutation({
        result: { mutationId, reason: "mode switch", status: "rejected" },
        rowId: (row) => row.id,
      })
    }
    expect(model.pendingMutationIds()).toEqual([])
  })
})
