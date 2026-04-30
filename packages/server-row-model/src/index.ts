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
  ServerGroupKey,
  ServerInvalidation,
  ServerLoadContext,
  ServerMutationResult,
  ServerPagedQuery,
  ServerPagedResult,
  ServerRowModelMode,
  ServerRowModelState,
  ServerRowPatch,
  ServerSelection,
  ServerTreeQuery,
  ServerTreeResult,
  ServerTreeRow,
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

type LoadTreeChildrenInput<TRow> = {
  loadChildren: (
    query: ServerTreeQuery,
    context: ServerLoadContext,
  ) => Promise<ServerTreeResult<TRow>>
  childCount: number
  childStart: number
  groupPath?: ServerTreeQuery["groupPath"]
  parentRowId: RowId | null
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

type ViewStateInput = {
  filter: BcGridFilter | undefined
  groupBy: readonly ColumnId[]
  locale: string | undefined
  searchText: string | undefined
  sort: readonly BcGridSort[]
  visibleColumns: readonly ColumnId[]
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
  #canonicalMutationRows = new Map<RowId, TRow>()
  #inFlightInfinite = new Map<ServerBlockKey, InFlightInfiniteRequest<TRow>>()
  #inFlightPaged = new Map<ServerBlockKey, InFlightPagedRequest<TRow>>()
  #inFlightTree = new Map<ServerBlockKey, InFlightTreeRequest<TRow>>()
  #pendingMutations = new Map<string, ServerRowPatch>()
  #requestSequence = 0
  #mutationRowIdGetter: RowIdGetter<TRow> | null = null

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
        const rows = this.applyPendingMutationsToRows(result.rows)
        this.cache.markLoaded({
          blockKey,
          rows,
          size: result.pageSize,
          start: result.pageIndex * result.pageSize,
          viewKey: result.viewKey ?? viewKey,
          ...(result.revision ? { revision: result.revision } : {}),
        })
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

    const promise = input
      .loadChildren(query, { signal: controller.signal })
      .then((result) => {
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
        if (rows === resultRows) return result
        return {
          ...result,
          rows: result.rows.map((row, index) => ({ ...row, data: rows[index] ?? row.data })),
        }
      })
      .catch((error: unknown) => {
        if (!isAbortError(error)) {
          this.cache.markError({
            blockKey,
            error,
            size: input.childCount,
            start: input.childStart,
            viewKey,
          })
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
  }

  invalidate(invalidation: ServerInvalidation): void {
    this.cache.invalidate(invalidation)
  }

  queueMutation(input: QueueMutationInput<TRow>): QueueMutationResult {
    if (this.#pendingMutations.has(input.patch.mutationId)) {
      throw new Error(`Mutation ${input.patch.mutationId} is already pending`)
    }

    this.#mutationRowIdGetter = input.rowId
    this.captureCanonicalMutationRow(input.patch.rowId, input.rowId)
    this.#pendingMutations.set(input.patch.mutationId, input.patch)
    const updatedRows = this.reconcileMutatedRow(input.patch.rowId, input.rowId)

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

      return {
        pending: this.hasPendingRowMutations(nextRowId),
        result: input.result,
        updatedRows,
      }
    }

    if (input.result.status === "conflict" && input.result.row) {
      const nextRowId = input.result.rowId ?? input.rowId(input.result.row)
      const updatedRows = this.setCanonicalMutationRow({
        canonicalRow: input.result.row,
        rowId: input.rowId,
        sourceRowId: targetRowId,
        targetRowId: nextRowId,
      })

      return {
        pending: this.hasPendingRowMutations(nextRowId),
        result: input.result,
        updatedRows,
      }
    }

    const updatedRows = this.reconcileMutatedRow(targetRowId, input.rowId)
    return {
      pending: this.hasPendingRowMutations(targetRowId),
      result: input.result,
      updatedRows,
    }
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
      .filter((block) => block.viewKey === viewKey && block.state === "loaded")
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
        const rows = this.applyPendingMutationsToRows(result.rows)
        this.cache.markLoaded({
          blockKey: input.blockKey,
          rows,
          size: input.options.blockSize,
          start: input.query.blockStart,
          viewKey: result.viewKey ?? input.viewKey,
          ...(result.revision ? { revision: result.revision } : {}),
        })
        this.cache.evictLoadedBlocks(input.options.maxBlocks)
        input.deferred.resolve(rows === result.rows ? result : { ...result, rows })
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

function applyPatchChanges<TRow>(row: TRow | undefined, patch: ServerRowPatch): TRow | undefined {
  if (!row) return undefined
  return { ...(row as object), ...patch.changes } as TRow
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
