import type {
  BcGridFilter,
  BcGridSort,
  ColumnId,
  RowId,
  ServerBlockCacheOptions,
  ServerBlockKey,
  ServerBlockQuery,
  ServerBlockResult,
  ServerCacheBlock,
  ServerCacheDiagnostics,
  ServerGroupKey,
  ServerInvalidation,
  ServerLoadContext,
  ServerLoadDiagnostics,
  ServerMutationResult,
  ServerPagedQuery,
  ServerPagedResult,
  ServerQueryDiagnostics,
  ServerRowModelDiagnostics,
  ServerRowModelEvent,
  ServerRowModelMode,
  ServerRowModelState,
  ServerRowPatch,
  ServerRowUpdate,
  ServerSelection,
  ServerTreeQuery,
  ServerTreeResult,
  ServerTreeRow,
  ServerViewDiagnostics,
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
type IndexedRowIdGetter<TRow> = (row: TRow, index: number) => RowId

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

type ApplyRowUpdateInput<TRow> = {
  rowId: RowIdGetter<TRow>
  update: ServerRowUpdate<TRow>
  viewKey?: string
}

type ApplyRowUpdateResult = {
  affectedBlockKeys: ServerBlockKey[]
  insertedRowIds: RowId[]
  invalidated: boolean
  removedRowIds: RowId[]
  updatedRowIds: RowId[]
}

type LoadTreeChildrenInput<TRow> = {
  loadChildren: (
    query: ServerTreeQuery,
    context: ServerLoadContext,
  ) => Promise<ServerTreeResult<TRow>>
  childCount: number
  childStart: number
  groupPath?: ServerTreeQuery["groupPath"]
  parentRowId: RowId | null
  rowId?: IndexedRowIdGetter<TRow>
  view: ServerViewState
  viewKey?: string
}

type LoadTreeChildrenResult<TRow> = {
  blockKey: ServerBlockKey
  deduped: boolean
  promise: Promise<ServerTreeResult<TRow>>
  query: ServerTreeQuery
}

type ServerTreeNode<TRow> = {
  childIds: RowId[]
  childCount: number | "unknown"
  childrenLoaded: boolean
  error: unknown
  groupPath: ServerGroupKey[]
  hasChildren: boolean
  kind: "leaf" | "group"
  level: number
  loading: boolean
  parentRowId: RowId | null
  row: TRow
  rowId: RowId
}

type ServerTreeSnapshot<TRow> = {
  nodes: Map<RowId, ServerTreeNode<TRow>>
  rootIds: RowId[]
}

type MergeTreeResultInput<TRow> = {
  getRowId: IndexedRowIdGetter<TRow>
  parentNode: ServerTreeNode<TRow> | null
  result: ServerTreeResult<TRow>
  snapshot: ServerTreeSnapshot<TRow>
  viewKey: string
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

type InFlightTreeRequest<TRow> = {
  controller: AbortController
  promise: Promise<ServerTreeResult<TRow>>
  query: ServerTreeQuery
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

type InvalidateInput<TRow> = {
  rowId?: IndexedRowIdGetter<TRow>
}

type InvalidateResult = {
  affectedBlockKeys: ServerBlockKey[]
}

type ViewStateInput = {
  filter: BcGridFilter | undefined
  groupBy: readonly ColumnId[]
  locale: string | undefined
  searchText: string | undefined
  sort: readonly BcGridSort[]
  visibleColumns: readonly ColumnId[]
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
  // Bumped from 20 to 50 (worker1 audit P1 §5, audit-2026-05/worker1-findings.md
  // P2-W1-1). 20 × 100 = 2k rows in cache; 50 × 100 = 5k rows. ERP scroll
  // workloads regularly traverse 5k+ rows; the prior default forced
  // continuous evict-and-refetch cycles. Memory cost at 50 blocks × ~100 B
  // per row × 30 columns ≈ 150 KB peak per grid — well within budget.
  maxBlocks: 50,
  maxConcurrentRequests: 2,
  staleTimeMs: 30_000,
}

const cacheBlockStates = ["queued", "fetching", "loaded", "stale", "error", "evicted"] as const

export function defaultBlockKey(input: BlockKeyInput): ServerBlockKey {
  if (input.mode === "paged") {
    return `paged:${input.viewKey}:page:${input.pageIndex}:size:${input.pageSize}`
  }
  if (input.mode === "infinite") {
    return `infinite:${input.viewKey}:start:${input.blockStart}:size:${input.blockSize}`
  }
  return `tree:${input.viewKey}:parent:${input.parentRowId ?? "root"}:start:${input.childStart}:size:${input.childCount}`
}

export function summarizeServerViewState(view: ServerViewState): ServerViewDiagnostics {
  return {
    filterActive: !!view.filter,
    groupByCount: view.groupBy.length,
    searchActive: !!view.search?.trim(),
    sortCount: view.sort.length,
    visibleColumnCount: view.visibleColumns.length,
    ...(view.locale ? { locale: view.locale } : {}),
    ...(view.timeZone ? { timeZone: view.timeZone } : {}),
  }
}

export function summarizeServerQuery(
  query: ServerPagedQuery | ServerBlockQuery | ServerTreeQuery,
): ServerQueryDiagnostics {
  const base = {
    requestId: query.requestId,
    view: summarizeServerViewState(query.view),
    ...(query.viewKey ? { viewKey: query.viewKey } : {}),
  }

  if (query.mode === "paged") {
    return {
      ...base,
      mode: "paged",
      pageIndex: query.pageIndex,
      pageSize: query.pageSize,
    }
  }

  if (query.mode === "infinite") {
    return {
      ...base,
      blockSize: query.blockSize,
      blockStart: query.blockStart,
      mode: "infinite",
    }
  }

  return {
    ...base,
    childCount: query.childCount,
    childStart: query.childStart,
    groupPath: query.groupPath,
    mode: "tree",
    parentRowId: query.parentRowId,
  }
}

function serverRequestSequence(requestId: string): number | null {
  const match = /-(\d+)$/.exec(requestId)
  if (!match) return null
  const sequence = Number(match[1])
  return Number.isSafeInteger(sequence) ? sequence : null
}

function isOlderServerRequest(
  next: ServerPagedQuery | ServerBlockQuery | ServerTreeQuery,
  current?: ServerQueryDiagnostics,
): boolean {
  if (!current) return false
  const nextSequence = serverRequestSequence(next.requestId)
  const currentSequence = serverRequestSequence(current.requestId)
  return nextSequence != null && currentSequence != null && nextSequence < currentSequence
}

export function summarizeServerCache<TRow>(
  blocks: ReadonlyMap<ServerBlockKey, ServerCacheBlock<TRow>>,
): ServerCacheDiagnostics {
  const states = Object.fromEntries(cacheBlockStates.map((state) => [state, 0])) as Record<
    ServerCacheBlock<unknown>["state"],
    number
  >
  let loadedRowCount = 0
  const blockKeys: ServerBlockKey[] = []

  for (const [blockKey, block] of blocks) {
    blockKeys.push(blockKey)
    states[block.state] += 1
    if (block.state === "loaded" || block.state === "stale") {
      loadedRowCount += block.rows.length
    }
  }

  return {
    blockCount: blocks.size,
    blockKeys,
    loadedRowCount,
    states,
  }
}

export function summarizeServerRowModelState<TRow>(
  state: ServerRowModelState<TRow>,
  lastLoad: ServerLoadDiagnostics = { status: "idle" },
): ServerRowModelDiagnostics {
  return {
    cache: summarizeServerCache(state.blocks),
    lastLoad,
    mode: state.mode,
    pendingMutationCount: state.pendingMutations.size,
    rowCount: state.rowCount,
    view: state.view,
    viewKey: state.viewKey,
    viewSummary: summarizeServerViewState(state.view),
  }
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
    if (invalidation.scope === "all") {
      const blockKeys = [...this.#blocks.keys()]
      this.clear()
      return blockKeys
    }
    if (invalidation.scope === "view") {
      const invalidated: ServerBlockKey[] = []
      for (const [blockKey, block] of this.#blocks) {
        if (!invalidation.viewKey || block.viewKey === invalidation.viewKey) {
          if (this.delete(blockKey)) invalidated.push(blockKey)
        }
      }
      return invalidated
    }
    if (invalidation.scope === "blocks") {
      const invalidated: ServerBlockKey[] = []
      for (const blockKey of invalidation.blockKeys) {
        if (this.delete(blockKey)) invalidated.push(blockKey)
      }
      return invalidated
    }
    return []
  }

  markStale(blockKey: ServerBlockKey): boolean {
    const block = this.#blocks.get(blockKey)
    if (!block || block.state === "fetching" || block.state === "queued") return false
    this.#blocks.set(blockKey, { ...block, state: "stale" })
    this.#accessOrder.delete(blockKey)
    return true
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
  #inFlightTree = new Map<ServerBlockKey, InFlightTreeRequest<TRow>>()
  #infiniteQueueTimer: ReturnType<typeof setTimeout> | null = null
  #lastLoad: ServerLoadDiagnostics = { status: "idle" }
  #metrics = createMetricsState()
  #onEvent: ((event: ServerRowModelEvent<TRow>) => void) | null = null
  #pendingMutations = new Map<string, ServerRowPatch>()
  #requestSequence = 0
  #mutationRowIdGetter: RowIdGetter<TRow> | null = null
  #treeBlockKeysByParent = new Map<RowId | null, Set<ServerBlockKey>>()
  #treeChildRowIdsByBlock = new Map<ServerBlockKey, Set<RowId>>()
  #treeChildRowIdsByParent = new Map<RowId | null, Set<RowId>>()
  #treeParentByBlock = new Map<ServerBlockKey, RowId | null>()

  constructor(options: ServerRowModelControllerOptions<TRow> = {}) {
    this.#onEvent = options.onEvent ?? null
  }

  createViewKey(view: ServerViewState): string {
    return `view:${stableStringify(view)}`
  }

  createViewState(input: ViewStateInput): ServerViewState {
    return {
      groupBy: input.groupBy.map((columnId) => ({ columnId })),
      sort: input.sort.map((entry) => ({
        columnId: entry.columnId,
        direction: entry.direction,
      })),
      visibleColumns: [...input.visibleColumns],
      ...(input.filter ? { filter: input.filter } : {}),
      ...(input.searchText ? { search: input.searchText } : {}),
      ...(input.locale ? { locale: input.locale } : {}),
    }
  }

  isAbortError(error: unknown): boolean {
    return isAbortError(error)
  }

  getMetrics(): ServerRowModelMetricsSnapshot {
    return snapshotMetrics(this.#metrics)
  }

  resetMetrics(): void {
    this.#metrics = createMetricsState()
  }

  getDiagnostics(input: StateSnapshotInput): ServerRowModelDiagnostics {
    return summarizeServerRowModelState(this.getState(input), this.#lastLoad)
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
      this.setLastLoad({ blockKey, query: existing.query, status: "deduped" })
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
    this.setLastLoad({ blockKey, query, status: "loading" })

    const promise = input
      .loadPage(query, { signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) throw createAbortError()
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
        this.setLastLoad({ blockKey, query, rowCount: result.totalRows, status: "success" })
        return rows === result.rows ? result : { ...result, rows }
      })
      .catch((error: unknown) => {
        if (isAbortError(error)) {
          this.setLastLoad({ blockKey, error, query, status: "aborted" })
        } else {
          this.cache.markError({
            blockKey,
            error,
            size: input.pageSize,
            start: input.pageIndex * input.pageSize,
            viewKey,
          })
          this.emit({ type: "blockError", blockKey, error })
          this.setLastLoad({ blockKey, error, query, status: "error" })
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
      this.setLastLoad({
        blockKey,
        query,
        rowCount: "unknown",
        status: "cached",
      })
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
      this.setLastLoad({ blockKey, query: existing.query, status: "deduped" })
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
      this.setLastLoad({ blockKey, query, status: "queued" })
      this.scheduleInfinitePump(options)
    }

    return { blockKey, cached: false, deduped: false, promise: deferred.promise, query }
  }

  loadTreeChildren(input: LoadTreeChildrenInput<TRow>): LoadTreeChildrenResult<TRow> {
    const viewKey = input.viewKey ?? this.createViewKey(input.view)
    const blockKey = defaultBlockKey({
      mode: "tree",
      childCount: input.childCount,
      childStart: input.childStart,
      parentRowId: input.parentRowId,
      viewKey,
    })
    const existing = this.#inFlightTree.get(blockKey)
    if (existing) {
      this.setLastLoad({ blockKey, query: existing.query, status: "deduped" })
      return {
        blockKey,
        deduped: true,
        promise: existing.promise,
        query: existing.query,
      }
    }

    const query = this.createTreeQuery({
      childCount: input.childCount,
      childStart: input.childStart,
      groupPath: input.groupPath ?? [],
      parentRowId: input.parentRowId,
      view: input.view,
      viewKey,
    })
    const controller = new AbortController()
    this.cache.markFetching({
      blockKey,
      size: input.childCount,
      start: input.childStart,
      viewKey,
    })
    this.setLastLoad({ blockKey, query, status: "loading" })

    const promise = input
      .loadChildren(query, { signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) throw createAbortError()
        validateTreeResult(result, query)
        const resultRows = result.rows.map((row) => row.data)
        const rows = this.applyPendingMutationsToRows(resultRows)
        this.cache.markLoaded({
          blockKey,
          rows,
          size: result.childCount,
          start: result.childStart,
          viewKey: result.viewKey ?? viewKey,
          ...(result.revision ? { revision: result.revision } : {}),
        })
        this.rememberTreeBlock({
          blockKey,
          getRowId: input.rowId,
          parentRowId: input.parentRowId,
          result,
          viewKey: result.viewKey ?? viewKey,
        })
        this.setLastLoad({
          blockKey,
          query,
          rowCount: result.totalChildCount ?? result.rows.length,
          status: "success",
        })
        if (rows === resultRows) return result
        return {
          ...result,
          rows: result.rows.map((row, index) => ({ ...row, data: rows[index] ?? row.data })),
        }
      })
      .catch((error: unknown) => {
        if (isAbortError(error)) {
          this.setLastLoad({ blockKey, error, query, status: "aborted" })
        } else {
          this.cache.markError({
            blockKey,
            error,
            size: input.childCount,
            start: input.childStart,
            viewKey,
          })
          this.setLastLoad({ blockKey, error, query, status: "error" })
        }
        throw error
      })
      .finally(() => {
        this.#inFlightTree.delete(blockKey)
      })

    this.#inFlightTree.set(blockKey, { controller, promise, query })
    return { blockKey, deduped: false, promise, query }
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
    for (const [key, request] of this.#inFlightTree) {
      if (key === blockKey) continue
      request.controller.abort()
      this.#inFlightTree.delete(key)
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
    for (const request of this.#inFlightTree.values()) request.controller.abort()
    this.#inFlightTree.clear()
    this.clearInfiniteQueueTimer()
  }

  invalidate(
    invalidation: ServerInvalidation,
    input: InvalidateInput<TRow> = {},
  ): InvalidateResult {
    let affectedBlockKeys: ServerBlockKey[]
    if (invalidation.scope === "rows") {
      affectedBlockKeys = this.invalidateRows(invalidation.rowIds, input.rowId)
      this.emit({ type: "rowsInvalidated", rowIds: invalidation.rowIds })
    } else if (invalidation.scope === "tree") {
      affectedBlockKeys = this.invalidateTree(invalidation.parentRowId, !!invalidation.recursive)
    } else {
      affectedBlockKeys = this.cache.invalidate(invalidation)
      if (invalidation.scope === "all") this.clearTreeIndex()
      else this.forgetTreeBlocks(affectedBlockKeys)
    }

    this.abortInvalidatedRequests(affectedBlockKeys)

    if (invalidation.scope !== "rows") {
      for (const blockKey of affectedBlockKeys) {
        this.#metrics.evictedBlocks += 1
        this.emit({ type: "blockEvicted", blockKey, reason: "invalidate" })
      }
    }
    return { affectedBlockKeys }
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

  applyRowUpdate(input: ApplyRowUpdateInput<TRow>): ApplyRowUpdateResult {
    const baseResult: ApplyRowUpdateResult = {
      affectedBlockKeys: [],
      insertedRowIds: [],
      invalidated: false,
      removedRowIds: [],
      updatedRowIds: [],
    }

    if (input.update.type === "viewInvalidated") {
      const { affectedBlockKeys } = this.invalidate({
        scope: "view",
        ...(input.update.viewKey ? { viewKey: input.update.viewKey } : {}),
      })
      const result = {
        ...baseResult,
        affectedBlockKeys,
        invalidated: true,
      }
      this.emit({ type: "rowUpdateApplied", update: input.update, ...result })
      return result
    }

    if (input.update.type === "rowAdded") {
      const rowId = input.rowId(input.update.row)
      const updatedRowIds = this.replaceCachedRowForUpdate({
        row: input.update.row,
        rowId,
        rowIdGetter: input.rowId,
        revision: input.update.revision,
        viewKey: input.update.viewKey ?? input.viewKey,
      })
      if (updatedRowIds.length > 0) {
        const result = { ...baseResult, updatedRowIds }
        this.emit({ type: "rowUpdateApplied", update: input.update, ...result })
        return result
      }

      const affectedBlockKey = this.insertCachedRowForUpdate({
        indexHint: input.update.indexHint,
        row: input.update.row,
        rowId,
        revision: input.update.revision,
        viewKey: input.update.viewKey ?? input.viewKey,
      })
      const result = affectedBlockKey
        ? {
            ...baseResult,
            affectedBlockKeys: [affectedBlockKey],
            insertedRowIds: [rowId],
          }
        : baseResult
      this.emit({ type: "rowUpdateApplied", update: input.update, ...result })
      return result
    }

    if (input.update.type === "rowUpdated") {
      const updatedRowIds = this.replaceCachedRowForUpdate({
        row: input.update.row,
        rowId: input.update.rowId,
        rowIdGetter: input.rowId,
        revision: input.update.revision,
        viewKey: input.viewKey,
      })
      const result = { ...baseResult, updatedRowIds }
      this.emit({ type: "rowUpdateApplied", update: input.update, ...result })
      return result
    }

    const removedRowIds = this.removeCachedRowForUpdate({
      rowId: input.update.rowId,
      rowIdGetter: input.rowId,
      revision: input.update.revision,
      viewKey: input.viewKey,
    })
    const result = { ...baseResult, removedRowIds }
    this.emit({ type: "rowUpdateApplied", update: input.update, ...result })
    return result
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

  collectContiguousInfiniteRows(viewKey: string): TRow[] {
    const loadedBlocks = [...this.cache.toMap().values()]
      .filter(
        (block) =>
          block.viewKey === viewKey && (block.state === "loaded" || block.state === "stale"),
      )
      .sort((a, b) => a.start - b.start)
    const rows: TRow[] = []
    let expectedStart = 0

    for (const block of loadedBlocks) {
      if (block.start !== expectedStart) break
      rows.push(...block.rows)
      expectedStart = block.start + block.size
    }

    return rows
  }

  mergeInfiniteRows(currentRows: readonly TRow[], result: ServerBlockResult<TRow>): TRow[] | null {
    if (result.blockStart > currentRows.length) return null
    const nextRows = currentRows.slice()
    nextRows.splice(result.blockStart, result.blockSize, ...result.rows)
    return nextRows
  }

  createTreeSnapshot(): ServerTreeSnapshot<TRow> {
    return { nodes: new Map(), rootIds: [] }
  }

  flattenTreeSnapshot(
    snapshot: ServerTreeSnapshot<TRow>,
    expandedRowIds: ReadonlySet<RowId>,
  ): ServerTreeNode<TRow>[] {
    const rows: ServerTreeNode<TRow>[] = []
    const append = (rowId: RowId) => {
      const node = snapshot.nodes.get(rowId)
      if (!node) return
      rows.push(node)
      if (!expandedRowIds.has(rowId)) return
      for (const childId of node.childIds) append(childId)
    }
    for (const rowId of snapshot.rootIds) append(rowId)
    return rows
  }

  updateTreeNode(
    snapshot: ServerTreeSnapshot<TRow>,
    rowId: RowId,
    patch: Partial<ServerTreeNode<TRow>>,
  ): ServerTreeSnapshot<TRow> {
    const node = snapshot.nodes.get(rowId)
    if (!node) return snapshot
    const nodes = new Map(snapshot.nodes)
    nodes.set(rowId, { ...node, ...patch })
    return { ...snapshot, nodes }
  }

  mergeTreeResult(input: MergeTreeResultInput<TRow>): ServerTreeSnapshot<TRow> {
    const nodes = new Map(input.snapshot.nodes)
    const level = input.parentNode ? input.parentNode.level + 1 : 0
    const childNodes = input.result.rows.map((row, index) =>
      this.createTreeNode({
        getRowId: input.getRowId,
        index: input.result.childStart + index,
        level,
        parentGroupPath: input.result.groupPath,
        parentRowId: input.result.parentRowId,
        row,
        viewKey: input.viewKey,
      }),
    )
    const childIds = childNodes.map((node) => node.rowId)
    for (const node of childNodes) nodes.set(node.rowId, node)

    if (!input.parentNode) {
      return { nodes, rootIds: childIds }
    }

    const parent = nodes.get(input.parentNode.rowId) ?? input.parentNode
    nodes.set(parent.rowId, {
      ...parent,
      childIds,
      childrenLoaded: true,
      error: null,
      loading: false,
    })
    return { ...input.snapshot, nodes }
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

  private createTreeQuery(input: {
    childCount: number
    childStart: number
    groupPath: ServerTreeQuery["groupPath"]
    parentRowId: RowId | null
    view: ServerViewState
    viewKey: string
  }): ServerTreeQuery {
    return {
      childCount: input.childCount,
      childStart: input.childStart,
      groupPath: input.groupPath,
      mode: "tree",
      parentRowId: input.parentRowId,
      requestId: `server-tree-${++this.#requestSequence}`,
      view: input.view,
      viewKey: input.viewKey,
    }
  }

  private createTreeNode(input: {
    getRowId: IndexedRowIdGetter<TRow>
    index: number
    level: number
    parentGroupPath: ServerGroupKey[]
    parentRowId: RowId | null
    row: ServerTreeRow<TRow>
    viewKey: string
  }): ServerTreeNode<TRow> {
    const groupPath =
      input.row.kind === "group" && input.row.groupKey
        ? [...input.parentGroupPath, input.row.groupKey]
        : input.parentGroupPath
    const rowId = this.treeRowId({
      getRowId: input.getRowId,
      groupPath,
      index: input.index,
      row: input.row,
      viewKey: input.viewKey,
    })
    const childCount =
      typeof input.row.childCount === "number"
        ? input.row.childCount
        : input.row.hasChildren
          ? "unknown"
          : 0

    return {
      childCount,
      childIds: [],
      childrenLoaded: false,
      error: null,
      groupPath,
      hasChildren: input.row.hasChildren ?? (input.row.kind === "group" || childCount !== 0),
      kind: input.row.kind,
      level: input.level,
      loading: false,
      parentRowId: input.parentRowId,
      row: input.row.data,
      rowId,
    }
  }

  private treeRowId(input: {
    getRowId: IndexedRowIdGetter<TRow>
    groupPath: ServerGroupKey[]
    index: number
    row: ServerTreeRow<TRow>
    viewKey: string
  }): RowId {
    if (input.row.rowId) return input.row.rowId
    if (input.row.kind === "group") {
      if (input.row.groupKey?.rowId) return input.row.groupKey.rowId
      return `group:${input.viewKey}:${stableStringify(input.groupPath)}`
    }
    return input.getRowId(input.row.data, input.index)
  }

  private explicitTreeRowId(row: ServerTreeRow<TRow>): RowId | null {
    if (row.rowId) return row.rowId
    if (row.kind === "group" && row.groupKey?.rowId) return row.groupKey.rowId
    return null
  }

  private rememberTreeBlock(input: {
    blockKey: ServerBlockKey
    getRowId: IndexedRowIdGetter<TRow> | undefined
    parentRowId: RowId | null
    result: ServerTreeResult<TRow>
    viewKey: string
  }): void {
    this.forgetTreeBlocks([input.blockKey])

    const parentBlocks = this.#treeBlockKeysByParent.get(input.parentRowId) ?? new Set()
    parentBlocks.add(input.blockKey)
    this.#treeBlockKeysByParent.set(input.parentRowId, parentBlocks)
    this.#treeParentByBlock.set(input.blockKey, input.parentRowId)

    const childRowIds = new Set<RowId>()
    input.result.rows.forEach((row, index) => {
      const rowId = input.getRowId
        ? this.treeRowId({
            getRowId: input.getRowId,
            groupPath:
              row.kind === "group" && row.groupKey
                ? [...input.result.groupPath, row.groupKey]
                : input.result.groupPath,
            index: input.result.childStart + index,
            row,
            viewKey: input.viewKey,
          })
        : this.explicitTreeRowId(row)
      if (rowId) childRowIds.add(rowId)
    })
    this.#treeChildRowIdsByBlock.set(input.blockKey, childRowIds)
    this.rebuildTreeChildrenForParent(input.parentRowId)
  }

  private forgetTreeBlocks(blockKeys: readonly ServerBlockKey[]): void {
    const affectedParents = new Set<RowId | null>()
    for (const blockKey of blockKeys) {
      const parentRowId = this.#treeParentByBlock.get(blockKey)
      if (parentRowId === undefined) continue
      affectedParents.add(parentRowId)
      this.#treeParentByBlock.delete(blockKey)
      this.#treeChildRowIdsByBlock.delete(blockKey)
      const parentBlocks = this.#treeBlockKeysByParent.get(parentRowId)
      if (parentBlocks) {
        parentBlocks.delete(blockKey)
        if (parentBlocks.size === 0) this.#treeBlockKeysByParent.delete(parentRowId)
      }
    }
    for (const parentRowId of affectedParents) this.rebuildTreeChildrenForParent(parentRowId)
  }

  private rebuildTreeChildrenForParent(parentRowId: RowId | null): void {
    const childRowIds = new Set<RowId>()
    for (const blockKey of this.#treeBlockKeysByParent.get(parentRowId) ?? []) {
      for (const rowId of this.#treeChildRowIdsByBlock.get(blockKey) ?? []) childRowIds.add(rowId)
    }
    if (childRowIds.size > 0) this.#treeChildRowIdsByParent.set(parentRowId, childRowIds)
    else this.#treeChildRowIdsByParent.delete(parentRowId)
  }

  private clearTreeIndex(): void {
    this.#treeBlockKeysByParent.clear()
    this.#treeChildRowIdsByBlock.clear()
    this.#treeChildRowIdsByParent.clear()
    this.#treeParentByBlock.clear()
  }

  private invalidateRows(
    rowIds: readonly RowId[],
    rowIdGetter: IndexedRowIdGetter<TRow> | undefined,
  ): ServerBlockKey[] {
    if (!rowIdGetter || rowIds.length === 0) return []
    const targetRowIds = new Set(rowIds)
    const affectedBlockKeys: ServerBlockKey[] = []

    for (const block of this.cache.toMap().values()) {
      if (block.state !== "loaded" && block.state !== "stale") continue
      const containsInvalidatedRow = block.rows.some((row, index) =>
        targetRowIds.has(rowIdGetter(row, block.start + index)),
      )
      if (containsInvalidatedRow && this.cache.markStale(block.key)) {
        affectedBlockKeys.push(block.key)
      }
    }

    return affectedBlockKeys
  }

  private invalidateTree(parentRowId: RowId | null, recursive: boolean): ServerBlockKey[] {
    const parentRowIds = new Set<RowId | null>([parentRowId])
    if (recursive) {
      const queue: Array<RowId | null> = [parentRowId]
      for (const currentParentId of queue) {
        for (const childRowId of this.#treeChildRowIdsByParent.get(currentParentId) ?? []) {
          if (parentRowIds.has(childRowId)) continue
          parentRowIds.add(childRowId)
          queue.push(childRowId)
        }
      }
    }

    const affectedBlockKeys: ServerBlockKey[] = []
    for (const currentParentId of parentRowIds) {
      for (const blockKey of this.#treeBlockKeysByParent.get(currentParentId) ?? []) {
        if (this.cache.delete(blockKey)) affectedBlockKeys.push(blockKey)
      }
    }
    this.forgetTreeBlocks(affectedBlockKeys)
    return affectedBlockKeys
  }

  private abortInvalidatedRequests(blockKeys: readonly ServerBlockKey[]): void {
    if (blockKeys.length === 0) return
    const invalidated = new Set(blockKeys)
    for (const [blockKey, request] of this.#inFlightPaged) {
      if (!invalidated.has(blockKey)) continue
      request.controller.abort()
      this.#inFlightPaged.delete(blockKey)
    }
    for (const [blockKey, request] of this.#inFlightInfinite) {
      if (!invalidated.has(blockKey)) continue
      request.controller.abort()
      request.reject(createAbortError())
      this.#inFlightInfinite.delete(blockKey)
    }
    for (const [blockKey, request] of this.#inFlightTree) {
      if (!invalidated.has(blockKey)) continue
      request.controller.abort()
      this.#inFlightTree.delete(blockKey)
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
      this.setLastLoad({
        blockKey: input.blockKey,
        error: createAbortError(),
        query: input.query,
        status: "aborted",
      })
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
    this.setLastLoad({ blockKey: input.blockKey, query: input.query, status: "loading" })

    input.input
      .loadBlock(input.query, { signal: input.request.controller.signal })
      .then((result) => {
        if (input.request.controller.signal.aborted) throw createAbortError()
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
        this.setLastLoad({
          blockKey: input.blockKey,
          query: input.query,
          rowCount: getInfiniteRowCount(result),
          status: "success",
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
        if (isAbortError(error)) {
          this.setLastLoad({
            blockKey: input.blockKey,
            error,
            query: input.query,
            status: "aborted",
          })
        } else {
          this.#metrics.blockFetchErrors += 1
          this.cache.markError({
            blockKey: input.blockKey,
            error,
            size: input.options.blockSize,
            start: input.query.blockStart,
            viewKey: input.viewKey,
          })
          this.emit({ type: "blockError", blockKey: input.blockKey, error })
          this.setLastLoad({
            blockKey: input.blockKey,
            error,
            query: input.query,
            status: "error",
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

  private setLastLoad(input: {
    blockKey: ServerBlockKey
    error?: unknown
    query: ServerPagedQuery | ServerBlockQuery | ServerTreeQuery
    rowCount?: number | "unknown"
    status: ServerLoadDiagnostics["status"]
  }): void {
    if (isOlderServerRequest(input.query, this.#lastLoad.query)) return
    this.#lastLoad = {
      blockKey: input.blockKey,
      query: summarizeServerQuery(input.query),
      status: input.status,
      ...(input.rowCount != null ? { rowCount: input.rowCount } : {}),
      ...(input.error != null ? { error: serverLoadErrorMessage(input.error) } : {}),
    }
  }

  private captureCanonicalMutationRow(rowId: RowId, rowIdGetter: RowIdGetter<TRow>): void {
    if (this.#canonicalMutationRows.has(rowId)) return
    const row = this.findCachedRow(rowId, rowIdGetter)
    if (row) this.#canonicalMutationRows.set(rowId, row)
  }

  private findCachedRow(rowId: RowId, rowIdGetter: RowIdGetter<TRow>): TRow | null {
    for (const block of this.cache.toMap().values()) {
      if (block.state !== "loaded" && block.state !== "stale") continue
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
      this.#canonicalMutationRows.set(rowId, row)
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
      this.remapPendingMutations(input.sourceRowId, input.targetRowId)
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

  private remapPendingMutations(sourceRowId: RowId, targetRowId: RowId): void {
    for (const [mutationId, patch] of this.#pendingMutations) {
      if (patch.rowId !== sourceRowId) continue
      this.#pendingMutations.set(mutationId, { ...patch, rowId: targetRowId })
    }
  }

  private insertCachedRowForUpdate(input: {
    indexHint: number | undefined
    revision: string | undefined
    row: TRow
    rowId: RowId
    viewKey: string | undefined
  }): ServerBlockKey | null {
    const blocks = this.loadedBlocksForUpdate(input.viewKey)
    if (blocks.length === 0) return null
    const block =
      typeof input.indexHint === "number"
        ? (blocks.find(
            (candidate) =>
              input.indexHint != null &&
              input.indexHint >= candidate.start &&
              input.indexHint <= candidate.start + candidate.rows.length,
          ) ?? null)
        : (blocks[blocks.length - 1] ?? null)
    if (!block) return null

    const localIndex =
      typeof input.indexHint === "number"
        ? clampIndex(input.indexHint - block.start, 0, block.rows.length)
        : block.rows.length
    const rows = block.rows.slice()
    const row = this.applyPendingMutationsToRows([input.row])[0] ?? input.row
    rows.splice(localIndex, 0, row)
    this.cache.set({
      ...block,
      rows,
      ...(input.revision ? { revision: input.revision } : {}),
    })
    return block.key
  }

  private removeCachedRowForUpdate(input: {
    revision: string | undefined
    rowId: RowId
    rowIdGetter: RowIdGetter<TRow>
    viewKey: string | undefined
  }): RowId[] {
    let removed = false
    for (const block of this.loadedBlocksForUpdate(input.viewKey)) {
      const rows = block.rows.filter((row) => input.rowIdGetter(row) !== input.rowId)
      if (rows.length === block.rows.length) continue
      removed = true
      this.cache.set({
        ...block,
        rows,
        ...(input.revision ? { revision: input.revision } : {}),
      })
    }
    return removed ? [input.rowId] : []
  }

  private replaceCachedRowForUpdate(input: {
    revision: string | undefined
    row: TRow
    rowId: RowId
    rowIdGetter: RowIdGetter<TRow>
    viewKey: string | undefined
  }): RowId[] {
    const row = this.applyPendingMutationsToRows([input.row])[0] ?? input.row
    let updated = false
    for (const block of this.loadedBlocksForUpdate(input.viewKey)) {
      let changed = false
      const rows = block.rows.map((candidate) => {
        if (input.rowIdGetter(candidate) !== input.rowId) return candidate
        changed = true
        updated = true
        return row
      })
      if (changed) {
        this.cache.set({
          ...block,
          rows,
          ...(input.revision ? { revision: input.revision } : {}),
        })
      }
    }
    return updated ? [input.rowId] : []
  }

  private loadedBlocksForUpdate(viewKey: string | undefined): ServerCacheBlock<TRow>[] {
    return [...this.cache.toMap().values()]
      .filter((block) => {
        if (block.state !== "loaded" && block.state !== "stale") return false
        return viewKey == null || block.viewKey === viewKey
      })
      .sort((a, b) => a.start - b.start)
  }

  private replaceCachedRow(
    rowId: RowId,
    replacement: TRow,
    rowIdGetter: RowIdGetter<TRow>,
  ): number {
    let updatedRows = 0
    for (const block of this.cache.toMap().values()) {
      if (block.state !== "loaded" && block.state !== "stale") continue
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

function serverLoadErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === "string") return error
  return "Unknown server row load error"
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

function clampIndex(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return max
  return Math.min(max, Math.max(min, Math.floor(value)))
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

function validateTreeResult<TRow>(result: ServerTreeResult<TRow>, query: ServerTreeQuery): void {
  if (result.parentRowId !== query.parentRowId) {
    throw new Error("ServerTreeResult.parentRowId does not match query parentRowId")
  }
  if (result.childStart !== query.childStart) {
    throw new Error(
      `ServerTreeResult.childStart ${result.childStart} does not match query childStart ${query.childStart}`,
    )
  }
  if (result.childCount !== query.childCount) {
    throw new Error(
      `ServerTreeResult.childCount ${result.childCount} does not match query childCount ${query.childCount}`,
    )
  }
  if (result.rows.length > query.childCount) {
    throw new Error("ServerTreeResult returned more rows than requested")
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
