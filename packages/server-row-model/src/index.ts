import type {
  RowId,
  ServerBlockCacheOptions,
  ServerBlockKey,
  ServerBlockQuery,
  ServerBlockResult,
  ServerCacheBlock,
  ServerInvalidation,
  ServerLoadContext,
  ServerMutationResult,
  ServerPagedQuery,
  ServerPagedResult,
  ServerRowModelEvent,
  ServerRowModelMode,
  ServerRowModelState,
  ServerRowPatch,
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

type RowIdGetter<TRow> = (row: TRow) => RowId

type QueueMutationInput<TRow> = {
  patch: ServerRowPatch
  rowId: RowIdGetter<TRow>
}

type QueueMutationResult = {
  mutationId: string
  rowId: RowId
  updatedRows: number
}

type SettleMutationInput<TRow> = {
  result: ServerMutationResult<TRow>
  rowId: RowIdGetter<TRow>
}

type SettleMutationResult<TRow> = {
  pending: boolean
  result: ServerMutationResult<TRow>
  updatedRows: number
}

type InFlightPagedRequest<TRow> = {
  controller: AbortController
  promise: Promise<ServerPagedResult<TRow>>
  query: ServerPagedQuery
}

type InFlightInfiniteRequest<TRow> = {
  controller: AbortController
  promise: Promise<ServerBlockResult<TRow>>
  queuedAt: number
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

type ServerRowModelControllerOptions<TRow> = {
  onEvent?: (event: ServerRowModelEvent<TRow>) => void
}

type TimingState = {
  count: number
  lastMs: number
  maxMs: number
  minMs: number
  totalMs: number
}

type TimingSnapshot = {
  avgMs: number
  count: number
  lastMs: number
  maxMs: number
  minMs: number
}

type ServerRowModelMetricsState = {
  blockFetchErrors: number
  blockFetches: number
  blockFetchLatencyMs: TimingState
  blockQueueWaitMs: TimingState
  cacheHits: number
  cacheMisses: number
  dedupedRequests: number
  evictedBlocks: number
  maxQueueDepth: number
  queuedRequests: number
}

type ServerRowModelMetricsSnapshot = {
  blockFetchErrors: number
  blockFetches: number
  blockFetchLatencyMs: TimingSnapshot
  blockQueueWaitMs: TimingSnapshot
  cacheHitRate: number
  cacheHits: number
  cacheMisses: number
  dedupedRequests: number
  evictedBlocks: number
  maxQueueDepth: number
  queuedRequests: number
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

  invalidate(invalidation: ServerInvalidation): ServerBlockKey[] {
    const evicted: ServerBlockKey[] = []
    if (invalidation.scope === "all") {
      evicted.push(...this.#blocks.keys())
      this.clear()
      return evicted
    }
    if (invalidation.scope === "view") {
      for (const [blockKey, block] of this.#blocks) {
        if (!invalidation.viewKey || block.viewKey === invalidation.viewKey) {
          if (this.delete(blockKey)) evicted.push(blockKey)
        }
      }
      return evicted
    }
    if (invalidation.scope === "blocks") {
      for (const blockKey of invalidation.blockKeys) {
        if (this.delete(blockKey)) evicted.push(blockKey)
      }
    }
    return evicted
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

export function createServerRowModel<TRow>(options: ServerRowModelControllerOptions<TRow> = {}) {
  return new ServerRowModelController<TRow>(options)
}

class ServerRowModelController<TRow> {
  readonly cache = new ServerBlockCache<TRow>()

  #activeInfiniteRequests = 0
  #canonicalMutationRows = new Map<RowId, TRow>()
  #inFlightInfinite = new Map<ServerBlockKey, InFlightInfiniteRequest<TRow>>()
  #inFlightPaged = new Map<ServerBlockKey, InFlightPagedRequest<TRow>>()
  #infiniteQueueTimer: ReturnType<typeof setTimeout> | null = null
  #metrics = createMetricsState()
  #onEvent: ((event: ServerRowModelEvent<TRow>) => void) | null = null
  #pendingMutations = new Map<string, ServerRowPatch>()
  #requestSequence = 0
  #mutationRowIdGetter: RowIdGetter<TRow> | null = null

  constructor(options: ServerRowModelControllerOptions<TRow> = {}) {
    this.#onEvent = options.onEvent ?? null
  }

  createViewKey(view: ServerViewState): string {
    return `view:${stableStringify(view)}`
  }

  getMetrics(): ServerRowModelMetricsSnapshot {
    return snapshotMetrics(this.#metrics)
  }

  resetMetrics(): void {
    this.#metrics = createMetricsState()
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
    this.emit({ type: "blockFetching", blockKey, requestId: query.requestId })

    const promise = input
      .loadPage(query, { signal: controller.signal })
      .then((result) => {
        const rows = this.applyPendingMutationsToRows(result.rows)
        this.cache.markLoaded({
          blockKey,
          rows,
          size: result.pageSize,
          start: result.pageIndex * result.pageSize,
          viewKey: result.viewKey ?? viewKey,
          ...(result.revision ? { revision: result.revision } : {}),
        })
        this.emit({ type: "blockLoaded", blockKey, rowCount: result.totalRows })
        return rows === result.rows ? result : { ...result, rows }
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
          this.emit({ type: "blockError", blockKey, error })
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
      this.#metrics.cacheHits += 1
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

    this.#metrics.cacheMisses += 1
    const existing = this.#inFlightInfinite.get(blockKey)
    if (existing) {
      this.#metrics.dedupedRequests += 1
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
      queuedAt: nowMs(),
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
    if (this.shouldStartInfiniteRequestImmediately(options)) {
      request.start()
    } else {
      this.cache.markQueued({
        blockKey,
        size: options.blockSize,
        start: blockStart,
        viewKey,
      })
      this.#metrics.queuedRequests += 1
      this.observeQueueDepth()
      this.emit({ type: "blockQueued", blockKey })
      this.scheduleInfinitePump(options)
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
    this.clearInfiniteQueueTimer()
  }

  invalidate(invalidation: ServerInvalidation): void {
    const evicted = this.cache.invalidate(invalidation)
    for (const blockKey of evicted) {
      this.#metrics.evictedBlocks += 1
      this.emit({ type: "blockEvicted", blockKey, reason: "invalidate" })
    }
    if (invalidation.scope === "rows") {
      this.emit({ type: "rowsInvalidated", rowIds: invalidation.rowIds })
    }
  }

  queueMutation(input: QueueMutationInput<TRow>): QueueMutationResult {
    if (this.#pendingMutations.has(input.patch.mutationId)) {
      throw new Error(`Mutation ${input.patch.mutationId} is already pending`)
    }

    this.#mutationRowIdGetter = input.rowId
    this.captureCanonicalMutationRow(input.patch.rowId, input.rowId)
    this.#pendingMutations.set(input.patch.mutationId, input.patch)
    const updatedRows = this.reconcileMutatedRow(input.patch.rowId, input.rowId)
    this.emit({
      type: "mutationQueued",
      mutationId: input.patch.mutationId,
      rowId: input.patch.rowId,
    })

    return {
      mutationId: input.patch.mutationId,
      rowId: input.patch.rowId,
      updatedRows,
    }
  }

  settleMutation(input: SettleMutationInput<TRow>): SettleMutationResult<TRow> {
    this.#mutationRowIdGetter = input.rowId
    const patch = this.#pendingMutations.get(input.result.mutationId)
    if (!patch) {
      return {
        pending: false,
        result: input.result,
        updatedRows: 0,
      }
    }

    const targetRowId = input.result.previousRowId ?? patch.rowId
    this.#pendingMutations.delete(input.result.mutationId)

    if (input.result.status === "accepted") {
      const canonicalRow =
        input.result.row ?? applyPatchChanges(this.#canonicalMutationRows.get(targetRowId), patch)
      const nextRowId = input.result.row
        ? (input.result.rowId ?? input.rowId(input.result.row))
        : (input.result.rowId ?? targetRowId)
      const updatedRows = canonicalRow
        ? this.setCanonicalMutationRow({
            canonicalRow,
            rowId: input.rowId,
            sourceRowId: targetRowId,
            targetRowId: nextRowId,
          })
        : this.reconcileMutatedRow(targetRowId, input.rowId)

      const settled = {
        pending: this.hasPendingRowMutations(nextRowId),
        result: input.result,
        updatedRows,
      }
      this.emit({ type: "mutationSettled", result: input.result })
      return settled
    }

    if (input.result.status === "conflict" && input.result.row) {
      const nextRowId = input.result.rowId ?? input.rowId(input.result.row)
      const updatedRows = this.setCanonicalMutationRow({
        canonicalRow: input.result.row,
        rowId: input.rowId,
        sourceRowId: targetRowId,
        targetRowId: nextRowId,
      })

      const settled = {
        pending: this.hasPendingRowMutations(nextRowId),
        result: input.result,
        updatedRows,
      }
      this.emit({ type: "mutationSettled", result: input.result })
      return settled
    }

    const updatedRows = this.reconcileMutatedRow(targetRowId, input.rowId)
    const settled = {
      pending: this.hasPendingRowMutations(targetRowId),
      result: input.result,
      updatedRows,
    }
    this.emit({ type: "mutationSettled", result: input.result })
    return settled
  }

  getState(input: StateSnapshotInput): ServerRowModelState<TRow> {
    return {
      blocks: this.cache.toMap(),
      mode: input.mode,
      pendingMutations: new Map(this.#pendingMutations),
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

    const fetchStartedAt = nowMs()
    let fetchDurationObserved = false
    const observeFetchDuration = () => {
      if (fetchDurationObserved) return
      fetchDurationObserved = true
      observeTiming(this.#metrics.blockFetchLatencyMs, nowMs() - fetchStartedAt)
    }

    input.request.state = "fetching"
    this.#activeInfiniteRequests += 1
    this.#metrics.blockFetches += 1
    observeTiming(this.#metrics.blockQueueWaitMs, fetchStartedAt - input.request.queuedAt)
    this.cache.markFetching({
      blockKey: input.blockKey,
      size: input.options.blockSize,
      start: input.query.blockStart,
      viewKey: input.viewKey,
    })
    this.emit({ type: "blockFetching", blockKey: input.blockKey, requestId: input.query.requestId })

    input.input
      .loadBlock(input.query, { signal: input.request.controller.signal })
      .then((result) => {
        observeFetchDuration()
        validateInfiniteResult(result, input.query)
        const rows = this.applyPendingMutationsToRows(result.rows)
        this.cache.markLoaded({
          blockKey: input.blockKey,
          rows,
          size: input.options.blockSize,
          start: input.query.blockStart,
          viewKey: result.viewKey ?? input.viewKey,
          ...(result.revision ? { revision: result.revision } : {}),
        })
        this.emit({
          type: "blockLoaded",
          blockKey: input.blockKey,
          rowCount: getInfiniteRowCount(result),
        })
        const evicted = this.cache.evictLoadedBlocks(input.options.maxBlocks)
        for (const blockKey of evicted) {
          this.#metrics.evictedBlocks += 1
          this.emit({ type: "blockEvicted", blockKey, reason: "lru" })
        }
        input.deferred.resolve(rows === result.rows ? result : { ...result, rows })
      })
      .catch((error: unknown) => {
        observeFetchDuration()
        if (!isAbortError(error)) {
          this.#metrics.blockFetchErrors += 1
          this.cache.markError({
            blockKey: input.blockKey,
            error,
            size: input.options.blockSize,
            start: input.query.blockStart,
            viewKey: input.viewKey,
          })
          this.emit({ type: "blockError", blockKey: input.blockKey, error })
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

  private shouldStartInfiniteRequestImmediately(options: ServerBlockCacheOptions): boolean {
    if (this.#activeInfiniteRequests >= options.maxConcurrentRequests) return false
    if (options.blockLoadDebounceMs <= 0) return true
    return this.#activeInfiniteRequests === 0 && this.queuedInfiniteRequestCount() === 1
  }

  private queuedInfiniteRequestCount(): number {
    let count = 0
    for (const request of this.#inFlightInfinite.values()) {
      if (request.state === "queued") count += 1
    }
    return count
  }

  private scheduleInfinitePump(options: ServerBlockCacheOptions): void {
    if (this.#activeInfiniteRequests >= options.maxConcurrentRequests) return
    if (options.blockLoadDebounceMs <= 0) {
      this.pumpInfiniteQueue(options)
      return
    }
    if (this.#infiniteQueueTimer !== null) return
    this.#infiniteQueueTimer = setTimeout(() => {
      this.#infiniteQueueTimer = null
      this.pumpInfiniteQueue(options)
    }, options.blockLoadDebounceMs)
  }

  private clearInfiniteQueueTimer(): void {
    if (this.#infiniteQueueTimer === null) return
    clearTimeout(this.#infiniteQueueTimer)
    this.#infiniteQueueTimer = null
  }

  private observeQueueDepth(): void {
    let queued = 0
    for (const request of this.#inFlightInfinite.values()) {
      if (request.state === "queued") queued += 1
    }
    this.#metrics.maxQueueDepth = Math.max(this.#metrics.maxQueueDepth, queued)
  }

  private emit(event: ServerRowModelEvent<TRow>): void {
    this.#onEvent?.(event)
  }

  private captureCanonicalMutationRow(rowId: RowId, rowIdGetter: RowIdGetter<TRow>): void {
    if (this.#canonicalMutationRows.has(rowId)) return
    const row = this.findCachedRow(rowId, rowIdGetter)
    if (row) this.#canonicalMutationRows.set(rowId, row)
  }

  private findCachedRow(rowId: RowId, rowIdGetter: RowIdGetter<TRow>): TRow | null {
    for (const block of this.cache.toMap().values()) {
      if (block.state !== "loaded") continue
      for (const row of block.rows) {
        if (rowIdGetter(row) === rowId) return row
      }
    }
    return null
  }

  private pendingPatchesForRow(rowId: RowId): ServerRowPatch[] {
    return [...this.#pendingMutations.values()].filter((patch) => patch.rowId === rowId)
  }

  private hasPendingRowMutations(rowId: RowId): boolean {
    return this.pendingPatchesForRow(rowId).length > 0
  }

  private applyPendingMutationsToRows(rows: TRow[]): TRow[] {
    if (!this.#mutationRowIdGetter || this.#pendingMutations.size === 0) return rows
    let changed = false
    const nextRows = rows.map((row) => {
      const rowId = this.#mutationRowIdGetter?.(row) ?? null
      if (rowId == null) return row
      const pendingPatches = this.pendingPatchesForRow(rowId)
      if (pendingPatches.length === 0) return row
      if (!this.#canonicalMutationRows.has(rowId)) {
        this.#canonicalMutationRows.set(rowId, row)
      }
      changed = true
      return pendingPatches.reduce<TRow>(
        (nextRow, patch) => applyPatchChanges(nextRow, patch) ?? nextRow,
        row,
      )
    })
    return changed ? nextRows : rows
  }

  private reconcileMutatedRow(rowId: RowId, rowIdGetter: RowIdGetter<TRow>): number {
    const canonicalRow = this.#canonicalMutationRows.get(rowId)
    if (!canonicalRow) return 0

    const pendingPatches = this.pendingPatchesForRow(rowId)
    const nextRow =
      pendingPatches.length > 0
        ? pendingPatches.reduce<TRow>(
            (row, patch) => applyPatchChanges(row, patch) ?? row,
            canonicalRow,
          )
        : canonicalRow
    const updatedRows = this.replaceCachedRow(rowId, nextRow, rowIdGetter)

    if (pendingPatches.length === 0) {
      this.#canonicalMutationRows.delete(rowId)
    }

    return updatedRows
  }

  private setCanonicalMutationRow(input: {
    canonicalRow: TRow
    rowId: RowIdGetter<TRow>
    sourceRowId: RowId
    targetRowId: RowId
  }): number {
    if (input.sourceRowId !== input.targetRowId) {
      this.#canonicalMutationRows.delete(input.sourceRowId)
    }

    this.#canonicalMutationRows.set(input.targetRowId, input.canonicalRow)
    const pendingPatches = this.pendingPatchesForRow(input.targetRowId)
    const nextRow =
      pendingPatches.length > 0
        ? pendingPatches.reduce<TRow>(
            (row, patch) => applyPatchChanges(row, patch) ?? row,
            input.canonicalRow,
          )
        : input.canonicalRow
    const updatedRows = this.replaceCachedRow(input.sourceRowId, nextRow, input.rowId)

    if (pendingPatches.length === 0) {
      this.#canonicalMutationRows.delete(input.targetRowId)
    }

    return updatedRows
  }

  private replaceCachedRow(
    rowId: RowId,
    replacement: TRow,
    rowIdGetter: RowIdGetter<TRow>,
  ): number {
    let updatedRows = 0
    for (const block of this.cache.toMap().values()) {
      if (block.state !== "loaded") continue
      let changed = false
      const rows = block.rows.map((row) => {
        if (rowIdGetter(row) !== rowId) return row
        changed = true
        updatedRows += 1
        return replacement
      })
      if (changed) this.cache.set({ ...block, rows })
    }
    return updatedRows
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

function getInfiniteRowCount<TRow>(result: ServerBlockResult<TRow>): number | "unknown" {
  if (result.totalRows != null) return result.totalRows
  if (result.hasMore === false) return result.blockStart + result.rows.length
  return "unknown"
}

function applyPatchChanges<TRow>(row: TRow | undefined, patch: ServerRowPatch): TRow | undefined {
  if (!row) return undefined
  return { ...(row as object), ...patch.changes } as TRow
}

function createMetricsState(): ServerRowModelMetricsState {
  return {
    blockFetchErrors: 0,
    blockFetches: 0,
    blockFetchLatencyMs: createTimingState(),
    blockQueueWaitMs: createTimingState(),
    cacheHits: 0,
    cacheMisses: 0,
    dedupedRequests: 0,
    evictedBlocks: 0,
    maxQueueDepth: 0,
    queuedRequests: 0,
  }
}

function createTimingState(): TimingState {
  return {
    count: 0,
    lastMs: 0,
    maxMs: 0,
    minMs: Number.POSITIVE_INFINITY,
    totalMs: 0,
  }
}

function observeTiming(state: TimingState, durationMs: number): void {
  const normalized = Math.max(0, durationMs)
  state.count += 1
  state.lastMs = normalized
  state.totalMs += normalized
  state.minMs = Math.min(state.minMs, normalized)
  state.maxMs = Math.max(state.maxMs, normalized)
}

function snapshotMetrics(state: ServerRowModelMetricsState): ServerRowModelMetricsSnapshot {
  const cacheAttempts = state.cacheHits + state.cacheMisses
  return {
    blockFetchErrors: state.blockFetchErrors,
    blockFetches: state.blockFetches,
    blockFetchLatencyMs: snapshotTiming(state.blockFetchLatencyMs),
    blockQueueWaitMs: snapshotTiming(state.blockQueueWaitMs),
    cacheHitRate: cacheAttempts === 0 ? 1 : state.cacheHits / cacheAttempts,
    cacheHits: state.cacheHits,
    cacheMisses: state.cacheMisses,
    dedupedRequests: state.dedupedRequests,
    evictedBlocks: state.evictedBlocks,
    maxQueueDepth: state.maxQueueDepth,
    queuedRequests: state.queuedRequests,
  }
}

function snapshotTiming(state: TimingState): TimingSnapshot {
  return {
    avgMs: state.count === 0 ? 0 : state.totalMs / state.count,
    count: state.count,
    lastMs: state.lastMs,
    maxMs: state.maxMs,
    minMs: state.count === 0 ? 0 : state.minMs,
  }
}

function nowMs(): number {
  return globalThis.performance?.now() ?? Date.now()
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
