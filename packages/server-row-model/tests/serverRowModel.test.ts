import { describe, expect, test } from "bun:test"
import type { ServerPagedResult, ServerViewState } from "@bc-grid/core"
import { ServerBlockCache, createServerRowModel, defaultBlockKey } from "../src"

interface Row {
  id: string
}

const view: ServerViewState = {
  groupBy: [],
  sort: [{ columnId: "name", direction: "asc" }],
  visibleColumns: ["name", "balance"],
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
})
