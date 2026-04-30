import type {
  ServerBlockCacheOptions,
  ServerBlockKey,
  ServerBlockQuery,
  ServerBlockResult,
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

type LoadInfiniteBlockInput<TRow> = {
  loadBlock: (
    query: ServerBlockQuery,
    context: ServerLoadContext,
  ) => Promise<ServerBlockResult<TRow>>
  blockStart: number
  blockSize: number
  cacheOptions?: Partial<ServerBlockCacheOptions>
  view: ServerViewState
  viewKey?: string
}

type LoadInfiniteBlockResult<TRow> = {
  blockKey: ServerBlockKey
  cached: boolean
  deduped: boolean
  promise: Promise<ServerBlockResult<TRow>>
  query: ServerBlockQuery
}

type InFlightPagedRequest<TRow> = {
  controller: AbortController
  promise: Promise<ServerPagedResult<TRow>>
  query: ServerPagedQuery
}

type InFlightInfiniteRequest<TRow> = {
  controller: AbortController
  promise: Promise<ServerBlockResult<TRow>>
  query: ServerBlockQuery
  reject: (error: unknown) => void
  start: () => void
  state: "queued" | "fetching"
}

type Deferred<T> = {
  promise: Promise<T>
  reject: (error: unknown) => void
  resolve: (value: T) => void
}

type StateSnapshotInput = {
  mode: ServerRowModelMode
  rowCount: number | "unknown"
  selection: ServerSelection
  view: ServerViewState
  viewKey: string
}

const DEFAULT_BLOCK_CACHE_OPTIONS: ServerBlockCacheOptions = {
  blockLoadDebounceMs: 80,
  blockSize: 100,
  maxBlocks: 20,
  maxConcurrentRequests: 2,
  staleTimeMs: 30_000,
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
  #accessCounter = 0
  #accessOrder = new Map<ServerBlockKey, number>()

  get(blockKey: ServerBlockKey): ServerCacheBlock<TRow> | undefined {
    const block = this.#blocks.get(blockKey)
    if (block?.state === "loaded") this.#touch(blockKey)
    return block
  }

  set(block: ServerCacheBlock<TRow>): void {
    this.#blocks.set(block.key, block)
    if (block.state === "loaded") this.#touch(block.key)
    else this.#accessOrder.delete(block.key)
  }

  markQueued(input: {
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
      state: "queued",
      viewKey: input.viewKey,
    })
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
    this.#accessOrder.delete(blockKey)
    return this.#blocks.delete(blockKey)
  }

  clear(): void {
    this.#blocks.clear()
    this.#accessOrder.clear()
  }

  invalidate(invalidation: ServerInvalidation): void {
    if (invalidation.scope === "all") {
      this.clear()
      return
    }
    if (invalidation.scope === "view") {
      for (const [blockKey, block] of this.#blocks) {
        if (!invalidation.viewKey || block.viewKey === invalidation.viewKey) {
          this.delete(blockKey)
        }
      }
      return
    }
    if (invalidation.scope === "blocks") {
      for (const blockKey of invalidation.blockKeys) this.delete(blockKey)
    }
  }

  toMap(): Map<ServerBlockKey, ServerCacheBlock<TRow>> {
    return new Map(this.#blocks)
  }

  evictLoadedBlocks(maxBlocks: number): ServerBlockKey[] {
    const evicted: ServerBlockKey[] = []
    const target = Math.max(1, maxBlocks)

    while (this.loadedBlockCount() > target) {
      const nextKey = this.leastRecentlyUsedLoadedBlockKey()
      if (!nextKey) break
      const block = this.#blocks.get(nextKey)
      if (block) {
        this.#blocks.set(nextKey, { ...block, rows: [], state: "evicted" })
      }
      this.delete(nextKey)
      evicted.push(nextKey)
    }

    return evicted
  }

  private loadedBlockCount(): number {
    let count = 0
    for (const block of this.#blocks.values()) {
      if (block.state === "loaded") count += 1
    }
    return count
  }

  private leastRecentlyUsedLoadedBlockKey(): ServerBlockKey | null {
    let lruKey: ServerBlockKey | null = null
    let lruOrder = Number.POSITIVE_INFINITY

    for (const [blockKey, block] of this.#blocks) {
      if (block.state !== "loaded") continue
      const order = this.#accessOrder.get(blockKey) ?? 0
      if (order < lruOrder) {
        lruKey = blockKey
        lruOrder = order
      }
    }

    return lruKey
  }

  #touch(blockKey: ServerBlockKey): void {
    this.#accessOrder.set(blockKey, ++this.#accessCounter)
  }
}

export function createServerRowModel<TRow>() {
  return new ServerRowModelController<TRow>()
}

class ServerRowModelController<TRow> {
  readonly cache = new ServerBlockCache<TRow>()

  #activeInfiniteRequests = 0
  #inFlightInfinite = new Map<ServerBlockKey, InFlightInfiniteRequest<TRow>>()
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

  loadInfiniteBlock(input: LoadInfiniteBlockInput<TRow>): LoadInfiniteBlockResult<TRow> {
    const options = normalizeCacheOptions(input.cacheOptions, input.blockSize)
    const viewKey = input.viewKey ?? this.createViewKey(input.view)
    const blockStart = normalizeBlockStart(input.blockStart, options.blockSize)
    const blockKey = defaultBlockKey({
      mode: "infinite",
      blockStart,
      blockSize: options.blockSize,
      viewKey,
    })
    const cached = this.cache.get(blockKey)
    const query = this.createInfiniteQuery({
      blockSize: options.blockSize,
      blockStart,
      view: input.view,
      viewKey,
    })

    if (cached?.state === "loaded" && !isStale(cached, options.staleTimeMs)) {
      return {
        blockKey,
        cached: true,
        deduped: false,
        promise: Promise.resolve({
          blockSize: cached.size,
          blockStart: cached.start,
          rows: cached.rows,
          viewKey: cached.viewKey,
          ...(cached.revision ? { revision: cached.revision } : {}),
        }),
        query,
      }
    }

    const existing = this.#inFlightInfinite.get(blockKey)
    if (existing) {
      return {
        blockKey,
        cached: false,
        deduped: true,
        promise: existing.promise,
        query: existing.query,
      }
    }

    const controller = new AbortController()
    const deferred = createDeferred<ServerBlockResult<TRow>>()
    const request: InFlightInfiniteRequest<TRow> = {
      controller,
      promise: deferred.promise,
      query,
      reject: deferred.reject,
      start: () => {
        this.startInfiniteRequest({
          blockKey,
          deferred,
          input,
          options,
          query,
          request,
          viewKey,
        })
      },
      state: "queued",
    }

    this.#inFlightInfinite.set(blockKey, request)
    if (this.#activeInfiniteRequests < options.maxConcurrentRequests) {
      request.start()
    } else {
      this.cache.markQueued({
        blockKey,
        size: options.blockSize,
        start: blockStart,
        viewKey,
      })
    }

    return { blockKey, cached: false, deduped: false, promise: deferred.promise, query }
  }

  abortExcept(blockKey: ServerBlockKey): void {
    for (const [key, request] of this.#inFlightPaged) {
      if (key === blockKey) continue
      request.controller.abort()
      this.#inFlightPaged.delete(key)
    }
    for (const [key, request] of this.#inFlightInfinite) {
      if (key === blockKey) continue
      request.controller.abort()
      request.reject(createAbortError())
      this.#inFlightInfinite.delete(key)
    }
  }

  abortAll(): void {
    for (const request of this.#inFlightPaged.values()) request.controller.abort()
    this.#inFlightPaged.clear()
    for (const request of this.#inFlightInfinite.values()) {
      request.controller.abort()
      request.reject(createAbortError())
    }
    this.#inFlightInfinite.clear()
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

  private createInfiniteQuery(input: {
    blockSize: number
    blockStart: number
    view: ServerViewState
    viewKey: string
  }): ServerBlockQuery {
    return {
      blockSize: input.blockSize,
      blockStart: input.blockStart,
      mode: "infinite",
      requestId: `server-block-${++this.#requestSequence}`,
      view: input.view,
      viewKey: input.viewKey,
    }
  }

  private startInfiniteRequest(input: {
    blockKey: ServerBlockKey
    deferred: Deferred<ServerBlockResult<TRow>>
    input: LoadInfiniteBlockInput<TRow>
    options: ServerBlockCacheOptions
    query: ServerBlockQuery
    request: InFlightInfiniteRequest<TRow>
    viewKey: string
  }): void {
    if (input.request.controller.signal.aborted) {
      input.deferred.reject(createAbortError())
      return
    }

    input.request.state = "fetching"
    this.#activeInfiniteRequests += 1
    this.cache.markFetching({
      blockKey: input.blockKey,
      size: input.options.blockSize,
      start: input.query.blockStart,
      viewKey: input.viewKey,
    })

    input.input
      .loadBlock(input.query, { signal: input.request.controller.signal })
      .then((result) => {
        validateInfiniteResult(result, input.query)
        this.cache.markLoaded({
          blockKey: input.blockKey,
          rows: result.rows,
          size: input.options.blockSize,
          start: input.query.blockStart,
          viewKey: result.viewKey ?? input.viewKey,
          ...(result.revision ? { revision: result.revision } : {}),
        })
        this.cache.evictLoadedBlocks(input.options.maxBlocks)
        input.deferred.resolve(result)
      })
      .catch((error: unknown) => {
        if (!isAbortError(error)) {
          this.cache.markError({
            blockKey: input.blockKey,
            error,
            size: input.options.blockSize,
            start: input.query.blockStart,
            viewKey: input.viewKey,
          })
        }
        input.deferred.reject(error)
      })
      .finally(() => {
        this.#activeInfiniteRequests -= 1
        this.#inFlightInfinite.delete(input.blockKey)
        this.pumpInfiniteQueue(input.options)
      })
  }

  private pumpInfiniteQueue(options: ServerBlockCacheOptions): void {
    if (this.#activeInfiniteRequests >= options.maxConcurrentRequests) return
    for (const request of this.#inFlightInfinite.values()) {
      if (request.state !== "queued") continue
      request.start()
      if (this.#activeInfiniteRequests >= options.maxConcurrentRequests) return
    }
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError"
}

function createAbortError(): DOMException {
  return new DOMException("Aborted", "AbortError")
}

function createDeferred<T>(): Deferred<T> {
  let resolve: (value: T) => void = () => {}
  let reject: (error: unknown) => void = () => {}
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })
  return { promise, reject, resolve }
}

function normalizeCacheOptions(
  options: Partial<ServerBlockCacheOptions> | undefined,
  blockSize: number,
): ServerBlockCacheOptions {
  return {
    ...DEFAULT_BLOCK_CACHE_OPTIONS,
    ...options,
    blockSize,
    maxBlocks: Math.max(1, options?.maxBlocks ?? DEFAULT_BLOCK_CACHE_OPTIONS.maxBlocks),
    maxConcurrentRequests: Math.max(
      1,
      options?.maxConcurrentRequests ?? DEFAULT_BLOCK_CACHE_OPTIONS.maxConcurrentRequests,
    ),
  }
}

function normalizeBlockStart(blockStart: number, blockSize: number): number {
  if (blockStart <= 0) return 0
  return Math.floor(blockStart / blockSize) * blockSize
}

function isStale<TRow>(block: ServerCacheBlock<TRow>, staleTimeMs: number): boolean {
  if (!block.loadedAt) return true
  return Date.now() - block.loadedAt > staleTimeMs
}

function validateInfiniteResult<TRow>(
  result: ServerBlockResult<TRow>,
  query: ServerBlockQuery,
): void {
  if (result.blockStart !== query.blockStart) {
    throw new Error(
      `ServerBlockResult.blockStart ${result.blockStart} does not match query blockStart ${query.blockStart}`,
    )
  }
  if (result.blockSize !== query.blockSize) {
    throw new Error(
      `ServerBlockResult.blockSize ${result.blockSize} does not match query blockSize ${query.blockSize}`,
    )
  }
  if (result.rows.length < query.blockSize && result.hasMore === true) {
    throw new Error("ServerBlockResult returned a short block while hasMore is true")
  }
  if (result.totalRows == null && result.hasMore == null) {
    throw new Error("ServerBlockResult requires totalRows or hasMore")
  }
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
