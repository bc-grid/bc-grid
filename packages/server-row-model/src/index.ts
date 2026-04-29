import type {
  ServerBlockKey,
  ServerCacheBlock,
  ServerInvalidation,
  ServerLoadContext,
  ServerPagedQuery,
  ServerPagedResult,
  ServerRowModelMode,
  ServerRowModelState,
  ServerSelection,
  ServerViewState,
} from "@bc-grid/core"

type BlockKeyInput =
  | {
      mode: "paged"
      pageIndex: number
      pageSize: number
      viewKey: string
    }
  | {
      mode: "infinite"
      blockStart: number
      blockSize: number
      viewKey: string
    }
  | {
      mode: "tree"
      childCount: number
      childStart: number
      parentRowId: string | null
      viewKey: string
    }

type LoadPagedPageInput<TRow> = {
  loadPage: (
    query: ServerPagedQuery,
    context: ServerLoadContext,
  ) => Promise<ServerPagedResult<TRow>>
  pageIndex: number
  pageSize: number
  view: ServerViewState
  viewKey?: string
}

type LoadPagedPageResult<TRow> = {
  blockKey: ServerBlockKey
  deduped: boolean
  promise: Promise<ServerPagedResult<TRow>>
  query: ServerPagedQuery
}

type InFlightPagedRequest<TRow> = {
  controller: AbortController
  promise: Promise<ServerPagedResult<TRow>>
  query: ServerPagedQuery
}

type StateSnapshotInput = {
  mode: ServerRowModelMode
  rowCount: number | "unknown"
  selection: ServerSelection
  view: ServerViewState
  viewKey: string
}

export function defaultBlockKey(input: BlockKeyInput): ServerBlockKey {
  if (input.mode === "paged") {
    return `paged:${input.viewKey}:page:${input.pageIndex}:size:${input.pageSize}`
  }
  if (input.mode === "infinite") {
    return `infinite:${input.viewKey}:start:${input.blockStart}:size:${input.blockSize}`
  }
  return `tree:${input.viewKey}:parent:${input.parentRowId ?? "root"}:start:${input.childStart}:size:${input.childCount}`
}

export class ServerBlockCache<TRow> {
  #blocks = new Map<ServerBlockKey, ServerCacheBlock<TRow>>()

  get(blockKey: ServerBlockKey): ServerCacheBlock<TRow> | undefined {
    return this.#blocks.get(blockKey)
  }

  set(block: ServerCacheBlock<TRow>): void {
    this.#blocks.set(block.key, block)
  }

  markFetching(input: {
    blockKey: ServerBlockKey
    size: number
    start: number
    viewKey: string
  }): void {
    this.set({
      key: input.blockKey,
      rows: [],
      size: input.size,
      start: input.start,
      state: "fetching",
      viewKey: input.viewKey,
    })
  }

  markLoaded(input: {
    blockKey: ServerBlockKey
    revision?: string
    rows: TRow[]
    size: number
    start: number
    viewKey: string
  }): void {
    this.set({
      key: input.blockKey,
      loadedAt: Date.now(),
      rows: input.rows,
      size: input.size,
      start: input.start,
      state: "loaded",
      viewKey: input.viewKey,
      ...(input.revision ? { revision: input.revision } : {}),
    })
  }

  markError(input: {
    blockKey: ServerBlockKey
    error: unknown
    size: number
    start: number
    viewKey: string
  }): void {
    this.set({
      error: input.error,
      key: input.blockKey,
      rows: this.#blocks.get(input.blockKey)?.rows ?? [],
      size: input.size,
      start: input.start,
      state: "error",
      viewKey: input.viewKey,
    })
  }

  delete(blockKey: ServerBlockKey): boolean {
    return this.#blocks.delete(blockKey)
  }

  clear(): void {
    this.#blocks.clear()
  }

  invalidate(invalidation: ServerInvalidation): void {
    if (invalidation.scope === "all") {
      this.clear()
      return
    }
    if (invalidation.scope === "view") {
      for (const [blockKey, block] of this.#blocks) {
        if (!invalidation.viewKey || block.viewKey === invalidation.viewKey) {
          this.#blocks.delete(blockKey)
        }
      }
      return
    }
    if (invalidation.scope === "blocks") {
      for (const blockKey of invalidation.blockKeys) this.#blocks.delete(blockKey)
    }
  }

  toMap(): Map<ServerBlockKey, ServerCacheBlock<TRow>> {
    return new Map(this.#blocks)
  }
}

export function createServerRowModel<TRow>() {
  return new ServerRowModelController<TRow>()
}

class ServerRowModelController<TRow> {
  readonly cache = new ServerBlockCache<TRow>()

  #inFlightPaged = new Map<ServerBlockKey, InFlightPagedRequest<TRow>>()
  #requestSequence = 0

  createViewKey(view: ServerViewState): string {
    return `view:${stableStringify(view)}`
  }

  loadPagedPage(input: LoadPagedPageInput<TRow>): LoadPagedPageResult<TRow> {
    const viewKey = input.viewKey ?? this.createViewKey(input.view)
    const blockKey = defaultBlockKey({
      mode: "paged",
      pageIndex: input.pageIndex,
      pageSize: input.pageSize,
      viewKey,
    })
    const existing = this.#inFlightPaged.get(blockKey)
    if (existing) {
      return {
        blockKey,
        deduped: true,
        promise: existing.promise,
        query: existing.query,
      }
    }

    const query = this.createPagedQuery({
      pageIndex: input.pageIndex,
      pageSize: input.pageSize,
      view: input.view,
      viewKey,
    })
    const controller = new AbortController()
    this.cache.markFetching({
      blockKey,
      size: input.pageSize,
      start: input.pageIndex * input.pageSize,
      viewKey,
    })

    const promise = input
      .loadPage(query, { signal: controller.signal })
      .then((result) => {
        this.cache.markLoaded({
          blockKey,
          rows: result.rows,
          size: result.pageSize,
          start: result.pageIndex * result.pageSize,
          viewKey: result.viewKey ?? viewKey,
          ...(result.revision ? { revision: result.revision } : {}),
        })
        return result
      })
      .catch((error: unknown) => {
        if (!isAbortError(error)) {
          this.cache.markError({
            blockKey,
            error,
            size: input.pageSize,
            start: input.pageIndex * input.pageSize,
            viewKey,
          })
        }
        throw error
      })
      .finally(() => {
        this.#inFlightPaged.delete(blockKey)
      })

    this.#inFlightPaged.set(blockKey, { controller, promise, query })
    return { blockKey, deduped: false, promise, query }
  }

  abortExcept(blockKey: ServerBlockKey): void {
    for (const [key, request] of this.#inFlightPaged) {
      if (key === blockKey) continue
      request.controller.abort()
      this.#inFlightPaged.delete(key)
    }
  }

  abortAll(): void {
    for (const request of this.#inFlightPaged.values()) request.controller.abort()
    this.#inFlightPaged.clear()
  }

  invalidate(invalidation: ServerInvalidation): void {
    this.cache.invalidate(invalidation)
  }

  getState(input: StateSnapshotInput): ServerRowModelState<TRow> {
    return {
      blocks: this.cache.toMap(),
      mode: input.mode,
      pendingMutations: new Map(),
      rowCount: input.rowCount,
      selection: input.selection,
      view: input.view,
      viewKey: input.viewKey,
    }
  }

  private createPagedQuery(input: {
    pageIndex: number
    pageSize: number
    view: ServerViewState
    viewKey: string
  }): ServerPagedQuery {
    return {
      mode: "paged",
      pageIndex: input.pageIndex,
      pageSize: input.pageSize,
      requestId: `server-page-${++this.#requestSequence}`,
      view: input.view,
      viewKey: input.viewKey,
    }
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError"
}

function stableStringify(value: unknown): string {
  if (value === undefined) return "undefined"
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`
  if (value instanceof Set) {
    return stableStringify([...value].sort())
  }

  const record = value as Record<string, unknown>
  const keys = Object.keys(record).filter((key) => record[key] !== undefined)
  keys.sort((a, b) => a.localeCompare(b))
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`
}
