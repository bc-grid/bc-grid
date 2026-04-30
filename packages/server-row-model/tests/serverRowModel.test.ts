import { describe, expect, test } from "bun:test"
import type { ServerBlockResult, ServerPagedResult, ServerViewState } from "@bc-grid/core"
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
})

describe("createServerRowModel", () => {
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
})
