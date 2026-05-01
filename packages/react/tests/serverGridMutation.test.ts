import { describe, expect, test } from "bun:test"
import type { ServerSelection } from "@bc-grid/core"
import { createServerRowModel } from "@bc-grid/server-row-model"
import type {
  BcCellEditCommitEvent,
  BcReactGridColumn,
  ServerMutationResult,
  ServerPagedResult,
  ServerRowPatch,
} from "../src"
import {
  commitServerEditMutation,
  createDefaultServerEditMutationPatch,
  createServerEditMutationError,
} from "../src/serverGrid"

interface Row {
  id: string
  name: string
}

const nameColumn: BcReactGridColumn<Row, string> = {
  columnId: "name",
  field: "name",
  header: "Name",
}

const editEvent: BcCellEditCommitEvent<Row, string> = {
  column: nameColumn,
  columnId: "name",
  nextValue: "Acme Co.",
  previousValue: "Acme Inc.",
  row: { id: "customer-1", name: "Acme Inc." },
  rowId: "customer-1",
  source: "keyboard",
}

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

function mutationHarness() {
  const queued: ServerRowPatch[] = []
  const settled: ServerMutationResult<Row>[] = []
  return {
    queued,
    queueServerRowMutation: (patch: ServerRowPatch) => queued.push(patch),
    settled,
    settleServerRowMutation: (result: ServerMutationResult<Row>) => settled.push(result),
  }
}

describe("server edit mutation helpers", () => {
  test("builds the default ServerRowPatch from a cell edit commit", () => {
    expect(createDefaultServerEditMutationPatch(editEvent, "mutation-1")).toEqual({
      changes: { name: "Acme Co." },
      mutationId: "mutation-1",
      rowId: "customer-1",
    })
  })

  test("uses server rejection reasons as edit errors", () => {
    expect(
      createServerEditMutationError({
        mutationId: "mutation-1",
        reason: "Name is required.",
        status: "rejected",
      }).message,
    ).toBe("Name is required.")
  })

  test("provides a conflict fallback edit error", () => {
    expect(
      createServerEditMutationError({
        mutationId: "mutation-1",
        status: "conflict",
      }).message,
    ).toBe("Server reported an edit conflict.")
  })

  test("queues the optimistic server patch before awaiting persistence and settles accepted result", async () => {
    const calls: string[] = []
    const harness = mutationHarness()
    let resolveMutation: ((result: ServerMutationResult<Row>) => void) | undefined
    const commit = commitServerEditMutation({
      createServerRowPatch: (_event, patch) => ({
        ...patch,
        baseRevision: "rev-1",
        mutationId: "mutation-custom",
      }),
      event: editEvent,
      mutationId: "mutation-ignored",
      onServerRowMutation: async ({ patch }) => {
        calls.push(`persist:${patch.mutationId}`)
        return new Promise<ServerMutationResult<Row>>((resolve) => {
          resolveMutation = resolve
        })
      },
      queueServerRowMutation: (patch) => {
        calls.push(`queue:${patch.mutationId}`)
        harness.queueServerRowMutation(patch)
      },
      settleServerRowMutation: harness.settleServerRowMutation,
    })

    expect(calls).toEqual(["queue:mutation-custom", "persist:mutation-custom"])
    expect(harness.queued).toEqual([
      {
        baseRevision: "rev-1",
        changes: { name: "Acme Co." },
        mutationId: "mutation-custom",
        rowId: "customer-1",
      },
    ])
    expect(harness.settled).toEqual([])

    resolveMutation?.({
      mutationId: "mutation-custom",
      row: { id: "customer-1", name: "Acme Co." },
      status: "accepted",
    })
    await commit

    expect(harness.settled).toEqual([
      {
        mutationId: "mutation-custom",
        row: { id: "customer-1", name: "Acme Co." },
        status: "accepted",
      },
    ])
  })

  test("settles rejected server results and rejects the edit commit promise", async () => {
    const harness = mutationHarness()

    await expect(
      commitServerEditMutation({
        event: editEvent,
        mutationId: "mutation-rejected",
        onServerRowMutation: () => ({
          mutationId: "mutation-rejected",
          reason: "Name is required.",
          status: "rejected",
        }),
        queueServerRowMutation: harness.queueServerRowMutation,
        settleServerRowMutation: harness.settleServerRowMutation,
      }),
    ).rejects.toThrow("Name is required.")

    expect(harness.queued).toHaveLength(1)
    expect(harness.settled).toEqual([
      {
        mutationId: "mutation-rejected",
        reason: "Name is required.",
        status: "rejected",
      },
    ])
  })

  test("settles thrown persistence failures as rejected mutations", async () => {
    const harness = mutationHarness()

    await expect(
      commitServerEditMutation({
        event: editEvent,
        mutationId: "mutation-offline",
        onServerRowMutation: async () => {
          throw new Error("Network unavailable.")
        },
        queueServerRowMutation: harness.queueServerRowMutation,
        settleServerRowMutation: harness.settleServerRowMutation,
      }),
    ).rejects.toThrow("Network unavailable.")

    expect(harness.settled).toEqual([
      {
        mutationId: "mutation-offline",
        reason: "Network unavailable.",
        status: "rejected",
      },
    ])
  })

  test("keeps a pending server edit overlay across page changes and page refetches", async () => {
    const model = createServerRowModel<Row>()
    const view = model.createViewState({
      groupBy: [],
      sort: [],
      visibleColumns: ["id", "name"],
    })
    const viewKey = model.createViewKey(view)
    const page0Request = model.loadPagedPage({
      loadPage: async (query): Promise<ServerPagedResult<Row>> => ({
        pageIndex: query.pageIndex,
        pageSize: query.pageSize,
        rows: [{ id: "customer-1", name: "Acme Inc." }],
        totalRows: 51,
        viewKey: query.viewKey,
      }),
      pageIndex: 0,
      pageSize: 25,
      view,
      viewKey,
    })
    const page0 = await page0Request.promise
    expect(page0.rows).toEqual([{ id: "customer-1", name: "Acme Inc." }])

    const serverSettle = deferred<ServerMutationResult<Row>>()
    const commit = commitServerEditMutation({
      event: editEvent,
      mutationId: "mutation-paged",
      onServerRowMutation: () => serverSettle.promise,
      queueServerRowMutation: (patch) => model.queueMutation({ patch, rowId: (row) => row.id }),
      settleServerRowMutation: (result) => model.settleMutation({ result, rowId: (row) => row.id }),
    })

    expect(model.cache.get(page0Request.blockKey)?.rows).toEqual([
      { id: "customer-1", name: "Acme Co." },
    ])
    expect(
      model.getState({ mode: "paged", rowCount: 51, selection: emptySelection, view, viewKey })
        .pendingMutations.size,
    ).toBe(1)

    const page1Request = model.loadPagedPage({
      loadPage: async (query): Promise<ServerPagedResult<Row>> => ({
        pageIndex: query.pageIndex,
        pageSize: query.pageSize,
        rows: [{ id: "customer-26", name: "Beta Ltd." }],
        totalRows: 51,
        viewKey: query.viewKey,
      }),
      pageIndex: 1,
      pageSize: 25,
      view,
      viewKey,
    })
    const page1 = await page1Request.promise
    expect(page1.rows).toEqual([{ id: "customer-26", name: "Beta Ltd." }])
    expect(
      model.getState({ mode: "paged", rowCount: 51, selection: emptySelection, view, viewKey })
        .pendingMutations.size,
    ).toBe(1)

    model.cache.clear()
    const reloadedPage0Request = model.loadPagedPage({
      loadPage: async (query): Promise<ServerPagedResult<Row>> => ({
        pageIndex: query.pageIndex,
        pageSize: query.pageSize,
        rows: [{ id: "customer-1", name: "Acme Inc." }],
        totalRows: 51,
        viewKey: query.viewKey,
      }),
      pageIndex: 0,
      pageSize: 25,
      view,
      viewKey,
    })
    const reloadedPage0 = await reloadedPage0Request.promise
    expect(reloadedPage0.rows).toEqual([{ id: "customer-1", name: "Acme Co." }])

    serverSettle.resolve({
      mutationId: "mutation-paged",
      row: { id: "customer-1", name: "Acme Co." },
      status: "accepted",
    })
    await commit

    expect(
      model.getState({ mode: "paged", rowCount: 51, selection: emptySelection, view, viewKey })
        .pendingMutations.size,
    ).toBe(0)
    expect(model.cache.get(reloadedPage0Request.blockKey)?.rows).toEqual([
      { id: "customer-1", name: "Acme Co." },
    ])
  })
})
