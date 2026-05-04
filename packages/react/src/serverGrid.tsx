import type {
  BcColumnStateEntry,
  BcGridFilter,
  BcGridSort,
  BcPaginationState,
  BcSelection,
  BcServerBlockErrorParams,
  BcServerBlockRetryConfig,
  BcServerGridApi,
  ColumnId,
  RowId,
  ServerBlockKey,
  ServerBlockResult,
  ServerGroupKey,
  ServerInvalidation,
  ServerMutationResult,
  ServerPagedResult,
  ServerRowModelDiagnostics,
  ServerRowModelMode,
  ServerRowModelState,
  ServerRowPatch,
  ServerRowUpdate,
  ServerSelection,
  ServerViewState,
} from "@bc-grid/core"
import { emptyBcRangeSelection } from "@bc-grid/core"
import { createServerRowModel } from "@bc-grid/server-row-model"
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createActionsColumn, shouldRenderActionsColumn } from "./actionsColumn"
import { BcGrid, useBcGridApi } from "./grid"
import {
  assignRef,
  columnIdFor,
  createEmptySelection,
  defaultMessages,
  hasDefinedProp,
  hasProp,
} from "./gridInternals"
import {
  BcGridPagination,
  type PaginationWindow,
  getPaginationWindow,
  isPaginationEnabled,
  normalisePageSizeOptions,
} from "./pagination"
import type {
  BcCellEditCommitEvent,
  BcCellEditCommitHandler,
  BcGridProps,
  BcReactGridColumn,
  BcServerEditMutationHandler,
  BcServerEditPatchFactory,
  BcServerGridProps,
  ServerRowEntryOverride,
} from "./types"

const DEFAULT_SERVER_PAGE_SIZE = 100
const DEFAULT_SERVER_BLOCK_SIZE = 100

/**
 * Time the React layer waits after a mode-switch deactivation for
 * pending optimistic mutations to settle naturally before forcibly
 * settling the remainder as `{ status: "rejected", reason: MODE_SWITCH_REJECT_REASON }`.
 * Per `docs/design/server-mode-switch-rfc.md §4` item 13.
 */
const MODE_SWITCH_MUTATION_GRACE_MS = 100

/**
 * `reason` field on the `ServerMutationResult` synthesised by the
 * React layer when force-settling a pending mutation that did not
 * settle naturally during the grace window. Consumer error handlers
 * can match on this string to differentiate user-driven rejections
 * from mode-switch flushes.
 */
const MODE_SWITCH_REJECT_REASON = "mode switch"

/**
 * Settlement payload returned by `PagedServerState.awaitNextSettlement`.
 * The `ok` flag distinguishes a successful loadPage settlement from a
 * rejected one or component unmount; consumers can use it to short-
 * circuit downstream actions like `scrollToServerCell`.
 */
export interface PagedServerSettlement<TRow> {
  ok: boolean
  result?: ServerPagedResult<TRow>
  error?: unknown
}

interface PagedServerState<TRow> {
  applyRowUpdate: (update: ServerRowUpdate<TRow>) => void
  /**
   * Returns a Promise that resolves the next time the active paged
   * loadPage request settles (success, error, or component unmount).
   * Used by `scrollToServerCell` to await navigation to a different
   * page before re-attempting the scroll.
   */
  awaitNextSettlement: () => Promise<PagedServerSettlement<TRow>>
  /**
   * Resolves when the model has zero in-flight requests. Re-checks
   * after each settlement so newly-fired requests during a
   * `whenIdle()` await also get drained. Used by
   * `BcServerGridApi.whenIdle()` per `docs/design/server-mode-switch-rfc.md
   * §6` Q1 hybrid resolution.
   */
  whenIdle: () => Promise<void>
  error: unknown
  getDiagnostics: (selection?: BcSelection) => ServerRowModelDiagnostics
  gridShell: ServerPagedGridShell<TRow>
  handleColumnStateChange: (
    next: readonly BcColumnStateEntry[],
    prev: readonly BcColumnStateEntry[],
  ) => void
  handleGroupByChange: (next: readonly ColumnId[], prev: readonly ColumnId[]) => void
  getModelState: () => ServerRowModelState<TRow>
  handleFilterChange: (next: BcGridFilter | null, prev: BcGridFilter | null) => void
  handlePaginationChange: (next: BcPaginationState) => void
  handleSearchTextChange: (next: string, prev: string) => void
  handleSortChange: (next: readonly BcGridSort[], prev: readonly BcGridSort[]) => void
  invalidate: (invalidation: ServerInvalidation) => void
  loading: boolean
  pageIndex: number
  pageSize: number
  queueMutation: (patch: ServerRowPatch) => void
  refresh: (opts?: { purge?: boolean }) => void
  retryBlock: (blockKey: ServerBlockKey) => void
  rows: readonly TRow[]
  rowCount: number | "unknown"
  settleMutation: (result: ServerMutationResult<TRow>) => void
  view: ServerViewState
}

export interface ServerPagedGridShell<TRow> {
  gridRows: readonly TRow[]
  gridPagination: false
  paginationEnabled: boolean
  paginationWindow: PaginationWindow
  pageSizeOptions: readonly number[]
}

interface InfiniteServerState<TRow> {
  applyRowUpdate: (update: ServerRowUpdate<TRow>) => void
  /** See `PagedServerState.whenIdle`. */
  whenIdle: () => Promise<void>
  error: unknown
  getDiagnostics: (selection?: BcSelection) => ServerRowModelDiagnostics
  getModelState: () => ServerRowModelState<TRow>
  handleFilterChange: (next: BcGridFilter | null, prev: BcGridFilter | null) => void
  handleSortChange: (next: readonly BcGridSort[], prev: readonly BcGridSort[]) => void
  handleVisibleRowRangeChange: (range: { startIndex: number; endIndex: number }) => void
  invalidate: (invalidation: ServerInvalidation) => void
  loading: boolean
  queueMutation: (patch: ServerRowPatch) => void
  refresh: (opts?: { purge?: boolean }) => void
  retryBlock: (blockKey: ServerBlockKey) => void
  rows: readonly TRow[]
  rowCount: number | "unknown"
  settleMutation: (result: ServerMutationResult<TRow>) => void
  view: ServerViewState
}

interface ServerSortFilterState {
  filterState: BcGridFilter | null
  handleFilterChange: (next: BcGridFilter | null, prev: BcGridFilter | null) => void
  handleSortChange: (next: readonly BcGridSort[], prev: readonly BcGridSort[]) => void
  sortState: readonly BcGridSort[]
}

interface TreeServerState<TRow> {
  applyRowUpdate: (update: ServerRowUpdate<TRow>) => void
  /** See `PagedServerState.whenIdle`. */
  whenIdle: () => Promise<void>
  columns: readonly BcReactGridColumn<TRow>[]
  error: unknown
  getDiagnostics: (selection?: BcSelection) => ServerRowModelDiagnostics
  getModelState: () => ServerRowModelState<TRow>
  handleFilterChange: (next: BcGridFilter | null, prev: BcGridFilter | null) => void
  handleSortChange: (next: readonly BcGridSort[], prev: readonly BcGridSort[]) => void
  invalidate: (invalidation: ServerInvalidation) => void
  loading: boolean
  queueMutation: (patch: ServerRowPatch) => void
  refresh: (opts?: { purge?: boolean }) => void
  retryBlock: (blockKey: ServerBlockKey) => void
  rowId: (row: TRow, index: number) => RowId
  rows: readonly TRow[]
  rowCount: number | "unknown"
  serverRowEntryOverrides: ReadonlyMap<RowId, ServerRowEntryOverride>
  settleMutation: (result: ServerMutationResult<TRow>) => void
  view: ServerViewState
}

interface TreeNode<TRow> {
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

interface TreeSnapshot<TRow> {
  nodes: Map<RowId, TreeNode<TRow>>
  rootIds: RowId[]
}

export function resolveServerPagedGridShell<TRow>(input: {
  pageIndex: number
  pageSize: number
  pageSizeOptions?: readonly number[] | undefined
  pagination?: boolean | undefined
  rows: readonly TRow[]
  totalRows: number
}): ServerPagedGridShell<TRow> {
  const paginationWindow = getPaginationWindow(input.totalRows, input.pageIndex, input.pageSize)
  const configuredPageSizeOptions = normalisePageSizeOptions(input.pageSizeOptions)
  const pageSizeOptions = configuredPageSizeOptions.includes(paginationWindow.pageSize)
    ? configuredPageSizeOptions
    : normalisePageSizeOptions([...configuredPageSizeOptions, paginationWindow.pageSize])

  return {
    gridPagination: false,
    gridRows: input.rows,
    pageSizeOptions,
    paginationEnabled: isPaginationEnabled(
      input.pagination,
      paginationWindow.totalRows,
      paginationWindow.pageSize,
    ),
    paginationWindow,
  }
}

export function resolveServerPagedRequestPage(input: {
  pageIndex: number
  previousViewKey: string
  viewKey: string
}): number {
  return input.previousViewKey === input.viewKey ? input.pageIndex : 0
}

export function shouldResetServerPagedPage(input: {
  pageIndex: number
  previousViewKey: string
  viewKey: string
}): boolean {
  return input.pageIndex > 0 && input.previousViewKey !== input.viewKey
}

export function isActiveServerPagedResponse(input: {
  activeBlockKey: ServerBlockKey | null
  responseBlockKey: ServerBlockKey
}): boolean {
  return input.activeBlockKey === input.responseBlockKey
}

/**
 * Pure decision helper for the tree-mode stale-viewKey gate (worker1
 * audit P1 §10). `loadTreeChildren` does not call `abortExcept` (paged
 * does); without this gate, a fetch in flight under viewKey K1 that
 * resolves AFTER the user has changed filter to K2 would merge K1's
 * children into the K2 snapshot, surfacing stale rows under nodes that
 * may have re-collapsed or been filtered out.
 *
 * Returns `true` when the result's resolved viewKey (the explicit
 * `result.viewKey` if the loader echoed it, otherwise the request-time
 * `fallbackViewKey`) matches the model's current viewKey at settle
 * time. The React-layer caller `return`s early when this returns
 * `false`, leaving the model cache populated (handy for a later
 * refetch after a re-expand under the new view) but skipping the
 * snapshot merge.
 *
 * Exported for unit testing; the React `loadTreeChildren` inlined this
 * pre-#391 / #422 / #428.
 */
export function shouldMergeTreeResult(input: {
  resultViewKey: string | undefined
  fallbackViewKey: string
  currentViewKey: string
}): boolean {
  return (input.resultViewKey ?? input.fallbackViewKey) === input.currentViewKey
}

/**
 * Pure decision helper for `BcServerGridApi.scrollToServerCell`. Given
 * the current loaded-row check, the active rowModel + paged page, and
 * the consumer-supplied `pageIndex` opt, decides which path to take:
 *
 * - `"sync"` — the row is already loaded; the caller scrolls
 *   immediately and resolves `{ scrolled: true }`.
 * - `"navigate"` — the row is not loaded but we should navigate to
 *   `opts.pageIndex` and re-attempt the scroll after settlement.
 * - `"none"` — the row is not loaded and we have no pageIndex (or the
 *   provided pageIndex matches current); resolve `{ scrolled: false }`.
 *
 * Exported for unit testing; the apiRef construction inlines the
 * runtime equivalent so we don't burn an extra closure per call.
 */
export function resolveScrollToServerCellAction(input: {
  rowLoaded: boolean
  mode: ServerRowModelMode
  currentPageIndex: number
  requestedPageIndex: number | undefined
}): "sync" | "navigate" | "none" {
  if (input.rowLoaded) return "sync"
  if (input.mode !== "paged") return "none"
  if (input.requestedPageIndex == null) return "none"
  if (input.requestedPageIndex === input.currentPageIndex) return "none"
  return "navigate"
}

/**
 * Built-in default for `BcServerInfiniteProps.autoRetryBlocks` — 1
 * initial fetch + 2 retries with exponential 1s/2s/4s backoff.
 * Worker1 v0.6 server block error affordance (planning doc §3).
 */
const DEFAULT_BLOCK_RETRY_CONFIG: { maxAttempts: number; backoffMs: readonly number[] } = {
  maxAttempts: 3,
  backoffMs: [1000, 2000, 4000],
}

/**
 * Pure helper exported for unit testing. Resolves the next retry
 * decision for a failed `loadBlock`. Worker1 v0.6 server block error
 * affordance (planning doc §3).
 *
 * Inputs:
 *   - `attempt` — 1-indexed attempt number that just failed (the
 *     initial fetch is `1`; first auto-retry is `2`; etc.).
 *   - `config` — the consumer's `autoRetryBlocks` config (or `false`
 *     to disable; or `undefined` to use the built-in default).
 *
 * Returns `{ willRetry: false, retryDelayMs: 0 }` when the retry
 * budget is exhausted (or auto-retry is disabled). Returns
 * `{ willRetry: true, retryDelayMs }` with the next backoff delay
 * otherwise — the orchestration schedules the retry with
 * `setTimeout(retryDelayMs)` then re-fires the block fetch.
 */
export function resolveBlockRetryDecision(input: {
  attempt: number
  config: BcServerBlockRetryConfig | undefined
}): { willRetry: boolean; retryDelayMs: number } {
  const config = input.config === undefined ? DEFAULT_BLOCK_RETRY_CONFIG : input.config
  if (config === false) return { willRetry: false, retryDelayMs: 0 }
  if (input.attempt >= config.maxAttempts) return { willRetry: false, retryDelayMs: 0 }
  const backoffIndex = Math.min(input.attempt - 1, config.backoffMs.length - 1)
  const retryDelayMs = config.backoffMs[Math.max(0, backoffIndex)] ?? 1000
  return { willRetry: true, retryDelayMs }
}

export function resolveServerVisibleColumns<TRow>(
  columns: readonly BcReactGridColumn<TRow>[],
  columnState: readonly BcColumnStateEntry[],
): ColumnId[] {
  const stateById = new Map(columnState.map((entry) => [entry.columnId, entry]))
  return columns.flatMap((column, index) => {
    const columnId = columnIdFor(column, index)
    const state = stateById.get(columnId)
    const hidden = state?.hidden ?? column.hidden ?? false
    return hidden ? [] : [columnId]
  })
}

/**
 * Pure helper exported for unit testing. Returns visible columns in
 * USER-DRIVEN DISPLAY ORDER per `BcColumnStateEntry.position`. Same
 * column set as `resolveServerVisibleColumns` (hidden columns
 * excluded), but ordered by the position field set by drag-reorder
 * chrome.
 *
 * Returns `null` when no `columnState` entry has a non-default
 * position — caller should treat this as "display order matches
 * source order, omit `view.displayColumnOrder` to keep the query
 * payload lean".
 *
 * Tie-break for equal positions: source order. Worker1 v0.6 server
 * display column order (planning doc §4).
 */
export function resolveServerDisplayColumns<TRow>(
  columns: readonly BcReactGridColumn<TRow>[],
  columnState: readonly BcColumnStateEntry[],
): ColumnId[] | null {
  const hasPositionOverride = columnState.some(
    (entry) => typeof entry.position === "number" && Number.isFinite(entry.position),
  )
  if (!hasPositionOverride) return null
  const stateById = new Map(columnState.map((entry) => [entry.columnId, entry]))
  const visible = columns.flatMap((column, index) => {
    const columnId = columnIdFor(column, index)
    const state = stateById.get(columnId)
    const hidden = state?.hidden ?? column.hidden ?? false
    if (hidden) return []
    const position =
      typeof state?.position === "number" && Number.isFinite(state.position)
        ? state.position
        : index
    return [{ columnId, position, sourceIndex: index }]
  })
  visible.sort((a, b) => {
    if (a.position !== b.position) return a.position - b.position
    return a.sourceIndex - b.sourceIndex
  })
  return visible.map((entry) => entry.columnId)
}

/**
 * Pure helper exported for unit testing. Resolves the prefetch-ahead
 * block budget for `<BcServerGrid rowModel="infinite">`. Resolution
 * order:
 *
 *   1. Explicit `BcServerInfiniteProps.prefetchAhead` prop (consumer
 *      pin, takes precedence — locked-by-prop pattern matching
 *      `showPagination` / `editingEnabled`).
 *   2. `BcUserSettings.prefetchAhead` (set by the
 *      `DEFAULT_CONTEXT_MENU_ITEMS` Server → Prefetch ahead radio
 *      submenu — worker1 v06-server-perf-prefetch-budget-tuning).
 *   3. Default `1` (one block past the visible range).
 *
 * Clamps to non-negative integers; `0` disables prefetch entirely.
 */
export function resolvePrefetchAhead(
  prefetchAhead: number | undefined,
  userSettingsValue?: number | undefined,
): number {
  if (typeof prefetchAhead === "number" && Number.isFinite(prefetchAhead)) {
    return Math.max(0, Math.floor(prefetchAhead))
  }
  if (typeof userSettingsValue === "number" && Number.isFinite(userSettingsValue)) {
    return Math.max(0, Math.floor(userSettingsValue))
  }
  return 1
}

/**
 * Pure helper exported for unit testing. Returns a dev-only error
 * message when the active row-model mode's required loader is
 * missing. Returns `null` when the loader for the active mode is
 * present (no warning needed). Per `docs/design/server-mode-switch-rfc.md
 * §6` stage 2 mount assertion.
 */
export function resolveMissingLoaderMessage(input: {
  activeMode: ServerRowModelMode
  hasLoadPage: boolean
  hasLoadBlock: boolean
  hasLoadChildren: boolean
}): string | null {
  const missing =
    input.activeMode === "paged"
      ? !input.hasLoadPage
      : input.activeMode === "infinite"
        ? !input.hasLoadBlock
        : input.activeMode === "tree"
          ? !input.hasLoadChildren
          : false
  if (!missing) return null
  const loaderName =
    input.activeMode === "paged"
      ? "loadPage"
      : input.activeMode === "infinite"
        ? "loadBlock"
        : "loadChildren"
  return `<BcServerGrid> is in "${input.activeMode}" mode but the required ${loaderName} prop is missing. Pass ${loaderName} or set rowModel explicitly. See docs/design/server-mode-switch-rfc.md §6.`
}

/**
 * Pure helper exported for unit testing. Resolves the active row-model
 * mode given the consumer's optional `rowModel` prop and the controlled
 * `groupBy` array.
 *
 * Today, `<BcServerGrid>` requires an explicit `rowModel`, so this
 * helper short-circuits to it. Once the server-mode-switch RFC's
 * stage 2+ ships (the `BcServerGridProps` collapse where `rowModel`
 * becomes optional), the heuristic kicks in: `groupBy.length > 0` ⇒
 * `"tree"`, else `"paged"`. Per `docs/design/server-mode-switch-rfc.md
 * §6` and the Q2 ratification ("hard-coded heuristic with `rowModel`
 * prop override").
 *
 * Consumers needing `infinite` mode under the heuristic must pass an
 * explicit `rowModel="infinite"`.
 */
export function resolveActiveRowModelMode(input: {
  rowModel: ServerRowModelMode | undefined
  groupBy: readonly ColumnId[] | undefined
}): ServerRowModelMode {
  if (input.rowModel) return input.rowModel
  if (input.groupBy && input.groupBy.length > 0) return "tree"
  return "paged"
}

/**
 * Pure decision helper for view-change reset behaviour (worker1 audit
 * P1 §1). When `<BcServerGrid>`'s resolved viewKey changes (filter /
 * sort / search / groupBy / visibleColumns), the grid resets scroll /
 * selection / focus by default — matches the NetSuite, Salesforce LWC
 * datatable, and Excel-table convention so the user sees the new
 * query result from row 0 with no ghost selection or stranded focus.
 *
 * Returns `{ resetScroll, resetSelection, resetFocus }` based on the
 * viewKey-changed signal and the three opt-out props on
 * `BcServerGridProps`. When the viewKey did NOT change (e.g. a refresh
 * fired with the same view), no resets fire — the user's scroll
 * position / selection / focus stay put.
 */
export function resolveViewChangeReset(input: {
  viewKeyChanged: boolean
  preserveScroll?: boolean | undefined
  preserveSelection?: boolean | undefined
  preserveFocus?: boolean | undefined
}): {
  resetScroll: boolean
  resetSelection: boolean
  resetFocus: boolean
} {
  if (!input.viewKeyChanged) {
    return { resetScroll: false, resetSelection: false, resetFocus: false }
  }
  return {
    resetScroll: !input.preserveScroll,
    resetSelection: !input.preserveSelection,
    resetFocus: !input.preserveFocus,
  }
}

/**
 * Pure helper exported for unit testing. Resolves the per-tree-fetch
 * `childCount` from the consumer-supplied `BcServerTreeProps.childCount`,
 * defaulting to `DEFAULT_SERVER_BLOCK_SIZE` (100) and clamping to a
 * minimum of 1 so a misconfigured `0` does not cause the model to
 * spin on empty fetches.
 */
export function resolveTreeChildCount(childCount: number | undefined): number {
  if (typeof childCount !== "number" || !Number.isFinite(childCount)) {
    return DEFAULT_SERVER_BLOCK_SIZE
  }
  return Math.max(1, Math.floor(childCount))
}

/**
 * Pure helper exported for unit testing. Resolves the `rowCount` the
 * tree path returns through `TreeServerState`. Mirrors the existing
 * "visible-rows-only" convention but adds an `initialRootChildCount`
 * pre-seed window: while the initial root load is in flight and no
 * rows have rendered yet, the consumer-supplied count is reported so
 * the chrome (scrollbar, status bar) can render at the right size
 * before the first fetch resolves. After the first fetch settles,
 * `visibleRowCount` takes over.
 */
export function resolveTreeRowCount(input: {
  mode: ServerRowModelMode
  visibleRowCount: number
  initialRootChildCount: number | undefined
  rootLoading: boolean
}): number | "unknown" {
  if (input.mode !== "tree") return "unknown"
  if (input.visibleRowCount > 0) return input.visibleRowCount
  if (
    input.rootLoading &&
    typeof input.initialRootChildCount === "number" &&
    Number.isFinite(input.initialRootChildCount) &&
    input.initialRootChildCount >= 0
  ) {
    return Math.floor(input.initialRootChildCount)
  }
  return input.visibleRowCount
}

function sameColumnIds(left: readonly ColumnId[], right: readonly ColumnId[]): boolean {
  if (left.length !== right.length) return false
  return left.every((columnId, index) => columnId === right[index])
}

export function BcServerGrid<TRow>(props: BcServerGridProps<TRow>): ReactNode {
  const gridApiRef = useBcGridApi<TRow>()
  const externalApiRef = props.apiRef
  const baseVisibleColumns = useMemo(
    () => resolveServerVisibleColumns(props.columns, []),
    [props.columns],
  )
  const paged = usePagedServerState(props)
  const infinite = useInfiniteServerState(props, baseVisibleColumns)
  const tree = useTreeServerState(props, baseVisibleColumns)
  const mutationCounterRef = useRef(0)

  // Resolved active mode — heuristic kicks in when `props.rowModel`
  // is omitted, per `docs/design/server-mode-switch-rfc.md §6` stage
  // 2 collapse + Q2 ratification.
  const activeMode = resolveActiveRowModelMode({
    rowModel: props.rowModel,
    groupBy: props.groupBy,
  })

  // Dev-only mount assertion: fires once on mount (and on activeMode
  // change) when the active mode's required loader is missing. Per
  // RFC §6 stage 2 mount assertion. Production builds elide the
  // warning; the runtime contract is "the loader matching the active
  // mode is required" and the resulting null loader will throw when
  // invoked, but the dev message lands first.
  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-only assertion
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return
    const message = resolveMissingLoaderMessage({
      activeMode,
      hasLoadPage: props.loadPage !== undefined,
      hasLoadBlock: props.loadBlock !== undefined,
      hasLoadChildren: props.loadChildren !== undefined,
    })
    if (message != null) console.error(message)
    // Mount-only — only fire when the active mode itself changes.
  }, [activeMode])

  // View-change reset (worker1 audit P1 §1). When the resolved viewKey
  // changes (filter / sort / search / groupBy / visibleColumns), reset
  // scroll-to-top + selection + active cell focus per the
  // `preserveScrollOnViewChange` / `preserveSelectionOnViewChange` /
  // `preserveFocusOnViewChange` opt-out props (all default `false` →
  // reset by default, matches NetSuite / Salesforce LWC datatable /
  // Excel-table convention). Skips the initial mount so the user's
  // explicit initial selection survives first render.
  const activeView =
    activeMode === "paged" ? paged.view : activeMode === "infinite" ? infinite.view : tree.view
  const previousViewKeyRef = useRef<string | null>(null)
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset triggers on viewKey change only
  useEffect(() => {
    const viewKey = JSON.stringify(activeView)
    if (previousViewKeyRef.current === null) {
      previousViewKeyRef.current = viewKey
      return
    }
    if (previousViewKeyRef.current === viewKey) return
    previousViewKeyRef.current = viewKey
    const decision = resolveViewChangeReset({
      viewKeyChanged: true,
      preserveScroll: props.preserveScrollOnViewChange,
      preserveSelection: props.preserveSelectionOnViewChange,
      preserveFocus: props.preserveFocusOnViewChange,
    })
    if (decision.resetScroll) gridApiRef.current?.scrollToTop()
    if (decision.resetSelection) gridApiRef.current?.clearSelection()
    if (decision.resetFocus) gridApiRef.current?.clearActiveCell()
  }, [activeView])

  // Mode-switch RFC §5: render the inner `<BcGrid>` with `loading=true`
  // for one frame between the abort-on-deactivate and the new mode's
  // first response landing, so the user sees a clean loading state
  // instead of the previous mode's stale rows briefly while the
  // newly-active hook fires its initial query. Cleared on the next
  // microtask so the new mode's own loading state takes over.
  const [modeSwitchTransition, setModeSwitchTransition] = useState(false)
  const prevActiveModeRef = useRef(activeMode)
  useEffect(() => {
    if (prevActiveModeRef.current === activeMode) return
    prevActiveModeRef.current = activeMode
    setModeSwitchTransition(true)
    const handle = setTimeout(() => setModeSwitchTransition(false), 0)
    return () => clearTimeout(handle)
  }, [activeMode])

  const queueServerRowMutation = useCallback(
    (patch: ServerRowPatch) => {
      if (activeMode === "paged") paged.queueMutation(patch)
      else if (activeMode === "infinite") infinite.queueMutation(patch)
      else if (activeMode === "tree") tree.queueMutation(patch)
    },
    [activeMode, infinite, paged, tree],
  )

  const settleServerRowMutation = useCallback(
    (result: ServerMutationResult<TRow>) => {
      if (activeMode === "paged") paged.settleMutation(result)
      else if (activeMode === "infinite") infinite.settleMutation(result)
      else if (activeMode === "tree") tree.settleMutation(result)
    },
    [activeMode, infinite, paged, tree],
  )

  const handleCellEditCommit = useCallback<BcCellEditCommitHandler<TRow>>(
    async (event) => {
      if (!props.onServerRowMutation) {
        // Coerce a sync `void` return from the consumer hook to
        // `undefined` so this bridge's return type lines up with
        // `BcCellEditCommitHandler<TRow>`'s `Promise<undefined | Result>`.
        // Runtime is unchanged: `await` of `void` resolves to `undefined`,
        // and `await` of a Promise<X> resolves to X.
        return (await props.onCellEditCommit?.(event)) ?? undefined
      }

      await commitServerEditMutation({
        createServerRowPatch: props.createServerRowPatch,
        event,
        mutationId: `server-edit:${++mutationCounterRef.current}`,
        onServerRowMutation: props.onServerRowMutation,
        queueServerRowMutation,
        settleServerRowMutation,
      })
      return undefined
    },
    [
      props.createServerRowPatch,
      props.onCellEditCommit,
      props.onServerRowMutation,
      queueServerRowMutation,
      settleServerRowMutation,
    ],
  )
  const cellEditCommitHandler =
    props.onServerRowMutation || props.onCellEditCommit ? handleCellEditCommit : undefined
  // `showPagination === false` hides the pager chrome — same contract
  // as the inner `<BcGrid>`. `<BcServerGrid>` paged mode renders its
  // own footer (because the inner grid is in `paginationMode="manual"`
  // and never auto-renders a pager), so the gate has to live here too.
  const showServerPaginationChrome = props.showPagination !== false
  const pagedFooter =
    activeMode === "paged"
      ? (props.footer ??
        (paged.gridShell.paginationEnabled && showServerPaginationChrome ? (
          <BcGridPagination
            page={paged.gridShell.paginationWindow.page}
            pageCount={paged.gridShell.paginationWindow.pageCount}
            pageSize={paged.gridShell.paginationWindow.pageSize}
            pageSizeOptions={paged.gridShell.pageSizeOptions}
            totalRows={paged.gridShell.paginationWindow.totalRows}
            onChange={paged.handlePaginationChange}
          />
        ) : null))
      : undefined

  const serverApi = useMemo<BcServerGridApi<TRow>>(() => {
    // Resolve the active row-model mode via the heuristic helper.
    // Today most consumers pass an explicit `rowModel`; once the
    // mode-switch RFC stage 3 lands, omitted `rowModel` derives
    // from `groupBy` per `resolveActiveRowModelMode`.
    const mode = resolveActiveRowModelMode({
      rowModel: props.rowModel,
      groupBy: props.groupBy,
    })

    return {
      scrollToRow(rowId, opts) {
        gridApiRef.current?.scrollToRow(rowId, opts)
      },
      scrollToCell(position, opts) {
        gridApiRef.current?.scrollToCell(position, opts)
      },
      focusCell(position) {
        gridApiRef.current?.focusCell(position)
      },
      isCellVisible(position) {
        return gridApiRef.current?.isCellVisible(position) ?? false
      },
      getRowById(rowId) {
        return gridApiRef.current?.getRowById(rowId)
      },
      getActiveCell() {
        return gridApiRef.current?.getActiveCell() ?? null
      },
      getScrollOffset() {
        return gridApiRef.current?.getScrollOffset() ?? { top: 0, left: 0 }
      },
      getSelection() {
        return gridApiRef.current?.getSelection() ?? createEmptySelection()
      },
      getRangeSelection() {
        return gridApiRef.current?.getRangeSelection() ?? emptyBcRangeSelection
      },
      getColumnState() {
        return gridApiRef.current?.getColumnState() ?? []
      },
      getFilter() {
        return gridApiRef.current?.getFilter() ?? null
      },
      getActiveFilter(columnId) {
        return gridApiRef.current?.getActiveFilter(columnId) ?? null
      },
      setColumnState(state) {
        gridApiRef.current?.setColumnState(state)
      },
      setSort(sort) {
        gridApiRef.current?.setSort(sort)
      },
      setFilter(filter) {
        gridApiRef.current?.setFilter(filter)
      },
      openFilter(columnId, opts) {
        gridApiRef.current?.openFilter(columnId, opts)
      },
      closeFilter(columnId) {
        gridApiRef.current?.closeFilter(columnId)
      },
      clearFilter(columnId) {
        gridApiRef.current?.clearFilter(columnId)
      },
      setColumnPinned(columnId, pinned) {
        gridApiRef.current?.setColumnPinned(columnId, pinned)
      },
      setColumnHidden(columnId, hidden) {
        gridApiRef.current?.setColumnHidden(columnId, hidden)
      },
      autoSizeColumn(columnId) {
        gridApiRef.current?.autoSizeColumn(columnId)
      },
      setRangeSelection(selection) {
        gridApiRef.current?.setRangeSelection(selection)
      },
      copyRange(range) {
        return gridApiRef.current?.copyRange(range) ?? Promise.resolve()
      },
      pasteTsv(params) {
        return (
          gridApiRef.current?.pasteTsv(params) ??
          Promise.resolve({
            ok: false,
            error: {
              code: "no-paste-target",
              message: "No mounted grid is available to paste into.",
            },
          })
        )
      },
      applyRowPatches(patches) {
        // Atomic bulk update — see BcGridApi.applyRowPatches docs.
        // Routes through the inner BcGrid so each cell flows through
        // the existing editing controller + onCellEditCommit →
        // onServerRowMutation pipeline (per-cell pending overlays,
        // batched server resolve). The whole point: server-row consumers
        // get the same atomic-validate-then-apply semantics as
        // BcGridApi.applyRowPatches without bypassing onServerRowMutation.
        return (
          gridApiRef.current?.applyRowPatches(patches) ??
          Promise.resolve({
            ok: false,
            failures: [],
          })
        )
      },
      clearRangeSelection() {
        gridApiRef.current?.clearRangeSelection()
      },
      expandAll() {
        gridApiRef.current?.expandAll()
      },
      collapseAll() {
        gridApiRef.current?.collapseAll()
      },
      startEdit(rowId, columnId, opts) {
        gridApiRef.current?.startEdit(rowId, columnId, opts)
      },
      commitEdit(opts) {
        gridApiRef.current?.commitEdit(opts)
      },
      cancelEdit() {
        gridApiRef.current?.cancelEdit()
      },
      discardRowEdits(rowId) {
        return gridApiRef.current?.discardRowEdits(rowId) ?? { discarded: 0 }
      },
      getVisibleSetting(key) {
        return gridApiRef.current?.getVisibleSetting(key)
      },
      setVisibleSetting(key, value) {
        gridApiRef.current?.setVisibleSetting(key, value)
      },
      getPrefetchAhead() {
        return gridApiRef.current?.getPrefetchAhead()
      },
      setPrefetchAhead(value) {
        gridApiRef.current?.setPrefetchAhead(value)
      },
      clearSelection() {
        gridApiRef.current?.clearSelection()
      },
      clearActiveCell() {
        gridApiRef.current?.clearActiveCell()
      },
      scrollToTop() {
        gridApiRef.current?.scrollToTop()
      },
      refresh() {
        gridApiRef.current?.refresh()
      },
      refreshServerRows(opts) {
        if (mode === "paged") paged.refresh(opts)
        else if (mode === "infinite") infinite.refresh(opts)
        else if (mode === "tree") tree.refresh(opts)
        else gridApiRef.current?.refresh()
      },
      invalidateServerRows(invalidation) {
        if (mode === "paged") paged.invalidate(invalidation)
        else if (mode === "infinite") infinite.invalidate(invalidation)
        else if (mode === "tree") tree.invalidate(invalidation)
      },
      invalidateRowCache(rowId) {
        const invalidation: ServerInvalidation = { scope: "rows", rowIds: [rowId] }
        if (mode === "paged") paged.invalidate(invalidation)
        else if (mode === "infinite") infinite.invalidate(invalidation)
        else if (mode === "tree") tree.invalidate(invalidation)
      },
      retryServerBlock(blockKey) {
        if (mode === "paged") paged.retryBlock(blockKey)
        else if (mode === "infinite") infinite.retryBlock(blockKey)
        else if (mode === "tree") tree.retryBlock(blockKey)
      },
      applyServerRowUpdate(update) {
        if (mode === "paged") paged.applyRowUpdate(update)
        else if (mode === "infinite") infinite.applyRowUpdate(update)
        else if (mode === "tree") tree.applyRowUpdate(update)
      },
      queueServerRowMutation,
      settleServerRowMutation,
      async scrollToServerCell(rowId, columnId, opts) {
        const gridApi = gridApiRef.current
        if (!gridApi) return { scrolled: false }
        const position = { rowId, columnId }
        const scrollOptions = opts?.align ? { align: opts.align } : undefined
        const action = resolveScrollToServerCellAction({
          rowLoaded: gridApi.getRowById(rowId) !== undefined,
          mode,
          currentPageIndex: paged.pageIndex,
          requestedPageIndex: opts?.pageIndex,
        })
        if (action === "sync") {
          gridApi.scrollToCell(position, scrollOptions)
          return { scrolled: true }
        }
        if (action === "none") return { scrolled: false }
        // Async navigate-and-await path. `awaitNextSettlement` must be
        // captured before triggering navigation so the resolver lands
        // before the load fires.
        const settlementPromise = paged.awaitNextSettlement()
        paged.handlePaginationChange({
          page: opts?.pageIndex ?? paged.pageIndex,
          pageSize: paged.pageSize,
        })
        const settlement = await settlementPromise
        if (!settlement.ok) return { scrolled: false }
        if (gridApiRef.current?.getRowById(rowId) !== undefined) {
          gridApiRef.current?.scrollToCell(position, scrollOptions)
          return { scrolled: true }
        }
        return { scrolled: false }
      },
      getServerRowModelState() {
        if (mode === "paged") {
          const state = paged.getModelState()
          return {
            ...state,
            selection: toServerSelection(gridApiRef.current?.getSelection(), paged.view),
          }
        }
        if (mode === "infinite") {
          const state = infinite.getModelState()
          return {
            ...state,
            selection: toServerSelection(gridApiRef.current?.getSelection(), infinite.view),
          }
        }
        if (mode === "tree") {
          const state = tree.getModelState()
          return {
            ...state,
            selection: toServerSelection(gridApiRef.current?.getSelection(), tree.view),
          }
        }
        return createServerRowModelState({
          mode,
          rowCount: "unknown",
          selection: toServerSelection(gridApiRef.current?.getSelection(), paged.view),
          view: paged.view,
        })
      },
      getServerDiagnostics() {
        const selection = gridApiRef.current?.getSelection()
        if (mode === "paged") return paged.getDiagnostics(selection)
        if (mode === "infinite") return infinite.getDiagnostics(selection)
        if (mode === "tree") return tree.getDiagnostics(selection)
        return paged.getDiagnostics(selection)
      },
      getActiveRowModelMode() {
        return resolveActiveRowModelMode({
          rowModel: props.rowModel,
          groupBy: props.groupBy,
        })
      },
      async whenIdle() {
        // Stage 1: each mode owns its own model instance, so route to
        // the active mode. Stage 2+ (the structural reshape per
        // server-mode-switch RFC §6) will collapse the three model
        // instances into one shared instance, at which point this
        // becomes a single `whenIdle` call.
        if (mode === "paged") return paged.whenIdle()
        if (mode === "infinite") return infinite.whenIdle()
        if (mode === "tree") return tree.whenIdle()
      },
      getLastError() {
        if (mode === "paged") return paged.error ?? null
        if (mode === "infinite") return infinite.error ?? null
        if (mode === "tree") return tree.error ?? null
        return null
      },
    }
  }, [
    gridApiRef,
    infinite,
    paged,
    props.groupBy,
    props.rowModel,
    queueServerRowMutation,
    settleServerRowMutation,
    tree,
  ])

  useEffect(() => assignRef(externalApiRef, serverApi), [externalApiRef, serverApi])

  const gridProps = props as unknown as BcGridProps<TRow>

  // Actions column auto-injection (v0.6 §1 server-grid-actions-column,
  // bsncraft P1). When the consumer wires any of the actions handlers
  // — onEdit / onDelete / onDiscardRowEdits / extraActions — and
  // hasn't opted out via `hideActions={true}`, append the pinned-right
  // `__bc_actions` column. Mirrors how `<BcEditGrid>` injects its
  // actions column today; lifting the wiring here means
  // `<BcServerGrid>` consumers don't have to hand-roll the column for
  // server-paged / infinite / tree grids (the pattern bsncraft alone
  // re-implemented in ~150 LOC for their ServerEditGrid wrapper).
  const {
    onEdit: actionsOnEdit,
    onDelete: actionsOnDelete,
    onDiscardRowEdits: actionsOnDiscardRowEdits,
    extraActions: actionsExtra,
    hideActions: actionsHide,
    canEdit: actionsCanEdit,
    canDelete: actionsCanDelete,
    editLabel: actionsEditLabel,
    deleteLabel: actionsDeleteLabel,
    discardLabel: actionsDiscardLabel,
  } = props
  const actionsColumn = useMemo(() => {
    if (
      !shouldRenderActionsColumn({
        onEdit: actionsOnEdit,
        onDelete: actionsOnDelete,
        onDiscardRowEdits: actionsOnDiscardRowEdits,
        extraActions: actionsExtra,
        hideActions: actionsHide,
      })
    )
      return null
    return createActionsColumn<TRow>({
      canDelete: actionsCanDelete,
      canEdit: actionsCanEdit,
      deleteLabel: actionsDeleteLabel ?? defaultMessages.deleteLabel,
      discardLabel: actionsDiscardLabel ?? defaultMessages.discardLabel,
      editLabel: actionsEditLabel ?? defaultMessages.editLabel,
      extraActions: actionsExtra,
      onDelete: actionsOnDelete,
      onDiscardRowEdits: actionsOnDiscardRowEdits,
      onEdit: actionsOnEdit,
    })
  }, [
    actionsCanDelete,
    actionsCanEdit,
    actionsDeleteLabel,
    actionsDiscardLabel,
    actionsEditLabel,
    actionsExtra,
    actionsHide,
    actionsOnDelete,
    actionsOnDiscardRowEdits,
    actionsOnEdit,
  ])
  const renderColumns = useMemo(() => {
    const sourceColumns = activeMode === "tree" ? tree.columns : gridProps.columns
    if (!actionsColumn) return sourceColumns
    return [...sourceColumns, actionsColumn]
  }, [actionsColumn, activeMode, gridProps.columns, tree.columns])

  const loading =
    props.loading ??
    (modeSwitchTransition ||
      (activeMode === "paged"
        ? paged.loading
        : activeMode === "infinite"
          ? infinite.loading
          : activeMode === "tree"
            ? tree.loading
            : true))
  const activeError: unknown =
    activeMode === "paged"
      ? (paged.error ?? null)
      : activeMode === "infinite"
        ? (infinite.error ?? null)
        : activeMode === "tree"
          ? (tree.error ?? null)
          : null
  const retryLoad = useCallback(() => {
    if (activeMode === "paged") paged.refresh({ purge: true })
    else if (activeMode === "infinite") infinite.refresh({ purge: true })
    else if (activeMode === "tree") tree.refresh({ purge: true })
  }, [activeMode, paged, infinite, tree])
  const errorOverlay: ReactNode =
    props.errorOverlay ??
    (activeError != null
      ? (props.renderServerError?.({ error: activeError, retry: retryLoad }) ?? (
          <BcServerGridDefaultErrorOverlay error={activeError} retry={retryLoad} />
        ))
      : undefined)
  const loadingOverlay = props.loadingOverlay ?? undefined

  return (
    <BcGrid
      {...gridProps}
      // Server-backed grids own row order/membership in every rowModel.
      // Forcing manual row processing keeps the inner grid from
      // client-sorting/filtering/searching/grouping the previously
      // accepted page while a new server query is pending. Always
      // applied after spreading consumer props.
      rowProcessingMode="manual"
      columns={renderColumns}
      data={
        activeMode === "paged"
          ? paged.gridShell.gridRows
          : activeMode === "infinite"
            ? infinite.rows
            : activeMode === "tree"
              ? tree.rows
              : []
      }
      {...(activeMode === "tree" ? { serverRowEntryOverrides: tree.serverRowEntryOverrides } : {})}
      apiRef={gridApiRef}
      {...(activeMode === "paged" ? { footer: pagedFooter } : {})}
      loading={loading}
      loadingOverlay={loadingOverlay}
      {...(errorOverlay !== undefined ? { errorOverlay } : {})}
      {...(activeMode === "infinite" && typeof infinite.rowCount === "number"
        ? { expectedRowCount: infinite.rowCount }
        : {})}
      {...(activeMode === "paged" ? { pagination: paged.gridShell.gridPagination } : {})}
      {...(cellEditCommitHandler ? { onCellEditCommit: cellEditCommitHandler } : {})}
      {...(activeMode === "paged" ? { onColumnStateChange: paged.handleColumnStateChange } : {})}
      onFilterChange={
        activeMode === "tree"
          ? tree.handleFilterChange
          : activeMode === "infinite"
            ? infinite.handleFilterChange
            : paged.handleFilterChange
      }
      {...(activeMode === "paged" ? { onGroupByChange: paged.handleGroupByChange } : {})}
      {...(activeMode === "paged" ? { onSearchTextChange: paged.handleSearchTextChange } : {})}
      onSortChange={
        activeMode === "tree"
          ? tree.handleSortChange
          : activeMode === "infinite"
            ? infinite.handleSortChange
            : paged.handleSortChange
      }
      rowId={activeMode === "tree" ? tree.rowId : gridProps.rowId}
      {...(activeMode === "infinite"
        ? { onVisibleRowRangeChange: infinite.handleVisibleRowRangeChange }
        : {})}
    />
  )
}

function useServerSortFilterState<TRow>(
  props: BcServerGridProps<TRow>,
  resetRows: () => void,
): ServerSortFilterState {
  const sortControlled = hasProp(props, "sort")
  const [uncontrolledSort, setUncontrolledSort] = useState<readonly BcGridSort[]>(
    () => props.defaultSort ?? [],
  )
  const filterControlled = hasDefinedProp(props, "filter")
  const [uncontrolledFilter, setUncontrolledFilter] = useState<BcGridFilter | null>(
    () => props.defaultFilter ?? null,
  )

  const handleSortChange = useCallback(
    (next: readonly BcGridSort[], prev: readonly BcGridSort[]) => {
      if (!sortControlled) setUncontrolledSort(next)
      resetRows()
      props.onSortChange?.(next, prev)
    },
    [props.onSortChange, resetRows, sortControlled],
  )

  const handleFilterChange = useCallback(
    (next: BcGridFilter | null, prev: BcGridFilter | null) => {
      if (!filterControlled) setUncontrolledFilter(next)
      resetRows()
      props.onFilterChange?.(next, prev)
    },
    [filterControlled, props.onFilterChange, resetRows],
  )

  return {
    filterState: filterControlled ? (props.filter ?? null) : uncontrolledFilter,
    handleFilterChange,
    handleSortChange,
    sortState: sortControlled ? (props.sort ?? []) : uncontrolledSort,
  }
}

function usePagedServerState<TRow>(props: BcServerGridProps<TRow>): PagedServerState<TRow> {
  // Mode-switch RFC stage 3.1: gate all hook activity on the resolved
  // active mode rather than the explicit `props.rowModel` literal.
  // When the heuristic activates (consumer omits `rowModel`), this
  // hook fetches iff `groupBy` is empty.
  const activeMode = resolveActiveRowModelMode({
    rowModel: props.rowModel,
    groupBy: props.groupBy,
  })
  const isPagedActive = activeMode === "paged"

  const modelRef = useRef(createServerRowModel<TRow>())
  const latestBlockKeyRef = useRef<ServerBlockKey | null>(null)
  const [refreshVersion, setRefreshVersion] = useState(0)
  const [result, setResult] = useState<ServerPagedResult<TRow> | undefined>(() =>
    isPagedActive ? props.initialResult : undefined,
  )
  const [loading, setLoading] = useState(() => isPagedActive && !props.initialResult)
  const [error, setError] = useState<unknown>(null)

  const pageControlled = hasProp(props, "page")
  const pageSizeControlled = hasProp(props, "pageSize")
  const [uncontrolledPage, setUncontrolledPage] = useState(() =>
    isPagedActive ? (props.defaultPage ?? props.initialResult?.pageIndex ?? 0) : 0,
  )
  const [uncontrolledPageSize, setUncontrolledPageSize] = useState(() =>
    isPagedActive
      ? (props.pageSize ??
        props.defaultPageSize ??
        props.initialResult?.pageSize ??
        DEFAULT_SERVER_PAGE_SIZE)
      : DEFAULT_SERVER_PAGE_SIZE,
  )
  const pageIndex = pageControlled ? (props.page ?? 0) : uncontrolledPage
  const pageSize = pageSizeControlled
    ? (props.pageSize ?? DEFAULT_SERVER_PAGE_SIZE)
    : uncontrolledPageSize

  const updatePagination = useCallback(
    (next: BcPaginationState) => {
      const prev = { page: pageIndex, pageSize }
      if (prev.page === next.page && prev.pageSize === next.pageSize) return
      if (!pageControlled) setUncontrolledPage(next.page)
      if (!pageSizeControlled) setUncontrolledPageSize(next.pageSize)
      props.onPaginationChange?.(next, prev)
    },
    [pageControlled, pageIndex, pageSize, pageSizeControlled, props.onPaginationChange],
  )

  const resetUncontrolledPage = useCallback(() => {
    if (pageIndex === 0) return
    updatePagination({ page: 0, pageSize })
  }, [pageIndex, pageSize, updatePagination])

  const { filterState, handleFilterChange, handleSortChange, sortState } = useServerSortFilterState(
    props,
    resetUncontrolledPage,
  )
  const searchControlled = hasProp(props, "searchText")
  const [uncontrolledSearchText, setUncontrolledSearchText] = useState(
    () => props.defaultSearchText ?? "",
  )
  const searchText = searchControlled ? (props.searchText ?? "") : uncontrolledSearchText
  const handleSearchTextChange = useCallback(
    (next: string, prev: string) => {
      if (!searchControlled) setUncontrolledSearchText(next)
      resetUncontrolledPage()
      props.onSearchTextChange?.(next, prev)
    },
    [props.onSearchTextChange, resetUncontrolledPage, searchControlled],
  )

  const groupByControlled = hasProp(props, "groupBy")
  const [uncontrolledGroupBy, setUncontrolledGroupBy] = useState<readonly ColumnId[]>(
    () => props.defaultGroupBy ?? [],
  )
  const groupBy = groupByControlled ? (props.groupBy ?? []) : uncontrolledGroupBy
  const handleGroupByChange = useCallback(
    (next: readonly ColumnId[], prev: readonly ColumnId[]) => {
      if (!groupByControlled) setUncontrolledGroupBy(next)
      resetUncontrolledPage()
      props.onGroupByChange?.(next, prev)
    },
    [groupByControlled, props.onGroupByChange, resetUncontrolledPage],
  )

  const columnStateControlled = hasProp(props, "columnState")
  const [uncontrolledColumnState, setUncontrolledColumnState] = useState<
    readonly BcColumnStateEntry[]
  >(() => props.defaultColumnState ?? [])
  const columnState = columnStateControlled ? (props.columnState ?? []) : uncontrolledColumnState
  const visibleColumns = useMemo(
    () => resolveServerVisibleColumns(props.columns, columnState),
    [columnState, props.columns],
  )
  // Display order — populated only when the user has dragged a
  // column to a non-default position. `null` falls back to source
  // order at the model layer (omits the field from `view`). Worker1
  // v0.6 server display column order.
  const displayColumnOrder = useMemo(
    () => resolveServerDisplayColumns(props.columns, columnState),
    [columnState, props.columns],
  )
  const handleColumnStateChange = useCallback(
    (next: readonly BcColumnStateEntry[], prev: readonly BcColumnStateEntry[]) => {
      if (!columnStateControlled) setUncontrolledColumnState(next)
      const prevVisible = resolveServerVisibleColumns(props.columns, prev)
      const nextVisible = resolveServerVisibleColumns(props.columns, next)
      if (!sameColumnIds(prevVisible, nextVisible)) resetUncontrolledPage()
      props.onColumnStateChange?.(next, prev)
    },
    [columnStateControlled, props.columns, props.onColumnStateChange, resetUncontrolledPage],
  )
  const loadPage = isPagedActive ? props.loadPage : undefined
  const view = useMemo(
    () =>
      modelRef.current.createViewState({
        filter: filterState ?? undefined,
        groupBy,
        locale: props.locale,
        searchText,
        sort: sortState,
        visibleColumns,
        ...(displayColumnOrder ? { displayColumnOrder } : {}),
      }),
    [filterState, groupBy, props.locale, searchText, sortState, visibleColumns, displayColumnOrder],
  )
  const viewKey = useMemo(() => modelRef.current.createViewKey(view), [view])
  const previousViewKeyRef = useRef(viewKey)
  const requestPageIndex = resolveServerPagedRequestPage({
    pageIndex,
    previousViewKey: previousViewKeyRef.current,
    viewKey,
  })
  const serverRowId = useCallback((row: TRow) => props.rowId(row, 0), [props.rowId])

  const refresh = useCallback((opts?: { purge?: boolean }) => {
    if (opts?.purge) modelRef.current.cache.clear()
    setRefreshVersion((version) => version + 1)
  }, [])

  const invalidate = useCallback(
    (invalidation: ServerInvalidation) => {
      modelRef.current.invalidate(invalidation, { rowId: props.rowId })
      setRefreshVersion((version) => version + 1)
    },
    [props.rowId],
  )

  const retryBlock = useCallback((blockKey: ServerBlockKey) => {
    modelRef.current.cache.delete(blockKey)
    setRefreshVersion((version) => version + 1)
  }, [])

  const syncCurrentPageFromCache = useCallback(() => {
    const blockKey = latestBlockKeyRef.current
    const block = blockKey ? modelRef.current.cache.get(blockKey) : undefined
    if (!block || (block.state !== "loaded" && block.state !== "stale")) return
    setResult((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        rows: block.rows,
        viewKey: block.viewKey,
        ...(block.revision ? { revision: block.revision } : {}),
      }
    })
  }, [])

  const queueMutation = useCallback(
    (patch: ServerRowPatch) => {
      modelRef.current.queueMutation({ patch, rowId: serverRowId })
      syncCurrentPageFromCache()
    },
    [serverRowId, syncCurrentPageFromCache],
  )

  const settleMutation = useCallback(
    (mutationResult: ServerMutationResult<TRow>) => {
      modelRef.current.settleMutation({ result: mutationResult, rowId: serverRowId })
      syncCurrentPageFromCache()
    },
    [serverRowId, syncCurrentPageFromCache],
  )

  const applyRowUpdate = useCallback(
    (update: ServerRowUpdate<TRow>) => {
      const activeViewKey = result?.viewKey ?? viewKey
      if (update.type === "viewInvalidated") {
        if (update.viewKey && update.viewKey !== activeViewKey) return
        modelRef.current.applyRowUpdate({ rowId: serverRowId, update, viewKey: activeViewKey })
        refresh({ purge: true })
        return
      }

      const updateResult = modelRef.current.applyRowUpdate({
        rowId: serverRowId,
        update,
        viewKey: activeViewKey,
      })
      const blockKey = latestBlockKeyRef.current
      const block = blockKey ? modelRef.current.cache.get(blockKey) : undefined
      setResult((prev) => {
        if (!prev) return prev
        const totalRows = nextKnownServerRowCount(prev.totalRows, updateResult)
        if (!block || (block.state !== "loaded" && block.state !== "stale")) {
          return totalRows === prev.totalRows ? prev : { ...prev, totalRows }
        }
        return {
          ...prev,
          rows: block.rows,
          totalRows,
          viewKey: block.viewKey,
          ...(block.revision ? { revision: block.revision } : {}),
        }
      })
    },
    [refresh, result?.viewKey, serverRowId, viewKey],
  )

  useEffect(() => {
    if (
      !shouldResetServerPagedPage({
        pageIndex,
        previousViewKey: previousViewKeyRef.current,
        viewKey,
      })
    ) {
      previousViewKeyRef.current = viewKey
      return
    }
    resetUncontrolledPage()
  }, [pageIndex, resetUncontrolledPage, viewKey])

  // Settlement awaiters — `scrollToServerCell` registers a one-shot
  // resolver before triggering page navigation, then awaits the next
  // active load to settle. Resolvers are drained on success, rejection,
  // and unmount so callers never see a hung Promise.
  const settlementAwaitersRef = useRef<Array<(value: PagedServerSettlement<TRow>) => void>>([])
  const drainAwaiters = useCallback((settlement: PagedServerSettlement<TRow>) => {
    const awaiters = settlementAwaitersRef.current
    settlementAwaitersRef.current = []
    for (const resolve of awaiters) resolve(settlement)
  }, [])
  const awaitNextSettlement = useCallback(
    () =>
      new Promise<PagedServerSettlement<TRow>>((resolve) => {
        settlementAwaitersRef.current.push(resolve)
      }),
    [],
  )

  useEffect(() => {
    if (!loadPage) return
    void refreshVersion

    const request = modelRef.current.loadPagedPage({
      loadPage,
      pageIndex: requestPageIndex,
      pageSize,
      view,
      viewKey,
    })
    latestBlockKeyRef.current = request.blockKey
    modelRef.current.abortExcept(request.blockKey)
    setLoading(true)
    setError(null)

    request.promise
      .then((nextResult) => {
        if (
          !isActiveServerPagedResponse({
            activeBlockKey: latestBlockKeyRef.current,
            responseBlockKey: request.blockKey,
          })
        )
          return
        setResult(nextResult)
        setLoading(false)
        drainAwaiters({ ok: true, result: nextResult })
      })
      .catch((nextError: unknown) => {
        if (
          !isActiveServerPagedResponse({
            activeBlockKey: latestBlockKeyRef.current,
            responseBlockKey: request.blockKey,
          }) ||
          modelRef.current.isAbortError(nextError)
        )
          return
        // Dev-mode surfacing (worker1 v06 bsncraft P1 #12): surface
        // `loadPage` rejections (including `validateServerPagedResult`
        // throws) immediately in the console so consumers can diagnose
        // contract violations without waiting for the error UI to
        // render. Production stays silent — `setError` already feeds
        // the error overlay path and `getLastError()`.
        if (process.env.NODE_ENV !== "production") {
          console.error("[bc-grid] paged loadPage rejected:", nextError)
        }
        setError(nextError)
        setLoading(false)
        drainAwaiters({ ok: false, error: nextError })
      })
  }, [drainAwaiters, loadPage, pageSize, refreshVersion, requestPageIndex, view, viewKey])

  useEffect(
    () => () => {
      modelRef.current.abortAll()
      drainAwaiters({ ok: false })
    },
    [drainAwaiters],
  )

  // Mode-switch RFC §5: when this hook's mode goes inactive (e.g.
  // user switches groupBy and the heuristic flips paged→tree), abort
  // in-flight requests synchronously and drop the cache + result so
  // the next reactivation starts clean. RFC §4 item 13: also schedule
  // the 100ms grace + force-settle pipeline for pending optimistic
  // mutations that didn't settle naturally before the switch.
  const wasPagedActiveRef = useRef(isPagedActive)
  useEffect(() => {
    if (wasPagedActiveRef.current && !isPagedActive) {
      modelRef.current.abortAll()
      modelRef.current.cache.clear()
      drainAwaiters({ ok: false })
      latestBlockKeyRef.current = null
      setResult(undefined)
      setLoading(false)
      setError(null)
      const model = modelRef.current
      const rowIdGetter: (row: TRow) => RowId = (row) => props.rowId(row, 0)
      const timer = setTimeout(() => {
        for (const mutationId of model.pendingMutationIds()) {
          model.settleMutation({
            result: { mutationId, reason: MODE_SWITCH_REJECT_REASON, status: "rejected" },
            rowId: rowIdGetter,
          })
        }
      }, MODE_SWITCH_MUTATION_GRACE_MS)
      wasPagedActiveRef.current = isPagedActive
      return () => clearTimeout(timer)
    }
    wasPagedActiveRef.current = isPagedActive
  }, [drainAwaiters, isPagedActive, props.rowId])

  const rows = isPagedActive ? (result?.rows ?? []) : []
  const rowCount = isPagedActive ? (result?.totalRows ?? 0) : "unknown"
  const gridShell = resolveServerPagedGridShell({
    pageIndex: requestPageIndex,
    pageSize,
    pageSizeOptions: props.pageSizeOptions,
    pagination: props.pagination,
    rows,
    totalRows: typeof rowCount === "number" ? rowCount : 0,
  })
  const getModelState = useCallback(
    () =>
      modelRef.current.getState({
        mode: "paged",
        rowCount,
        selection: toServerSelection(undefined, view),
        view,
        viewKey,
      }),
    [rowCount, view, viewKey],
  )
  const getDiagnostics = useCallback(
    (selection?: BcSelection) =>
      modelRef.current.getDiagnostics({
        mode: "paged",
        rowCount,
        selection: toServerSelection(selection, view),
        view,
        viewKey,
      }),
    [rowCount, view, viewKey],
  )

  const whenIdle = useCallback(async () => {
    while (modelRef.current.hasInFlightRequests()) {
      await modelRef.current.awaitAllSettled()
    }
  }, [])

  return {
    applyRowUpdate,
    awaitNextSettlement,
    whenIdle,
    error,
    getDiagnostics,
    gridShell,
    handleColumnStateChange,
    handleGroupByChange,
    getModelState,
    handleFilterChange,
    handlePaginationChange: updatePagination,
    handleSearchTextChange,
    handleSortChange,
    invalidate,
    loading,
    pageIndex,
    pageSize,
    queueMutation,
    refresh,
    retryBlock,
    rowCount,
    rows,
    settleMutation,
    view,
  }
}

function useInfiniteServerState<TRow>(
  props: BcServerGridProps<TRow>,
  visibleColumns: readonly ColumnId[],
): InfiniteServerState<TRow> {
  // Mode-switch RFC stage 3.1: gate all hook activity on the resolved
  // active mode. The infinite hook runs only when `rowModel` is
  // explicitly `"infinite"` (the heuristic never resolves to infinite
  // — it picks paged or tree from `groupBy`).
  const activeMode = resolveActiveRowModelMode({
    rowModel: props.rowModel,
    groupBy: props.groupBy,
  })
  const isInfiniteActive = activeMode === "infinite"

  const modelRef = useRef(createServerRowModel<TRow>())
  const inFlightCountRef = useRef(0)
  const loadedRowsRef = useRef<TRow[]>([])
  const visibleRangeRef = useRef({ endIndex: 0, startIndex: 0 })
  const [refreshVersion, setRefreshVersion] = useState(0)
  const [rows, setRows] = useState<readonly TRow[]>([])
  const [rowCount, setRowCount] = useState<number | "unknown">("unknown")
  const [loading, setLoading] = useState(() => isInfiniteActive)
  const [error, setError] = useState<unknown>(null)

  const resetInfiniteRows = useCallback(() => {
    modelRef.current.abortAll()
    modelRef.current.cache.clear()
    inFlightCountRef.current = 0
    loadedRowsRef.current = []
    setRows([])
    setRowCount("unknown")
    setError(null)
    setRefreshVersion((version) => version + 1)
  }, [])

  const { filterState, handleFilterChange, handleSortChange, sortState } = useServerSortFilterState(
    props,
    resetInfiniteRows,
  )

  // Subscribe to userSettings so the `Prefetch ahead` radio submenu
  // (DEFAULT_CONTEXT_MENU_ITEMS Server → Prefetch ahead) can flip the
  // budget without the consumer manually re-threading the prop. The
  // explicit `props.prefetchAhead` still wins per `resolvePrefetchAhead`'s
  // resolution order.
  const [userSettingsSnapshot, setUserSettingsSnapshot] = useState(() => props.userSettings?.read())
  useEffect(() => {
    const store = props.userSettings
    if (!store) {
      setUserSettingsSnapshot(undefined)
      return
    }
    setUserSettingsSnapshot(store.read())
    return store.subscribe?.((next) => setUserSettingsSnapshot(next))
  }, [props.userSettings])

  const blockSize = isInfiniteActive
    ? (props.blockSize ?? DEFAULT_SERVER_BLOCK_SIZE)
    : DEFAULT_SERVER_BLOCK_SIZE
  const maxCachedBlocks = isInfiniteActive ? props.maxCachedBlocks : undefined
  const blockLoadDebounceMs = isInfiniteActive ? props.blockLoadDebounceMs : undefined
  const maxConcurrentRequests = isInfiniteActive ? props.maxConcurrentRequests : undefined
  const prefetchAhead = isInfiniteActive
    ? resolvePrefetchAhead(props.prefetchAhead, userSettingsSnapshot?.prefetchAhead)
    : 1
  const loadBlock = isInfiniteActive ? props.loadBlock : undefined
  // Worker1 v0.6 server block error affordance — onBlockError +
  // autoRetryBlocks props gate the per-block retry pipeline. Captured
  // via refs so the catch closure inside `ensureBlock` always reads
  // the latest config without re-creating the callback on every
  // render.
  const onBlockErrorRef = useRef(props.onBlockError)
  const autoRetryConfigRef = useRef(props.autoRetryBlocks)
  useEffect(() => {
    onBlockErrorRef.current = props.onBlockError
  }, [props.onBlockError])
  useEffect(() => {
    autoRetryConfigRef.current = props.autoRetryBlocks
  }, [props.autoRetryBlocks])
  // Per-blockKey retry attempt counter. Cleared on success +
  // exhaustion. Lives in a ref so attempts persist across renders
  // without triggering re-renders themselves.
  const blockRetryAttemptsRef = useRef(new Map<string, number>())
  const searchText = props.searchText ?? props.defaultSearchText
  const groupBy = props.groupBy ?? props.defaultGroupBy ?? []
  const view = useMemo(
    () =>
      modelRef.current.createViewState({
        filter: filterState ?? undefined,
        groupBy,
        locale: props.locale,
        searchText,
        sort: sortState,
        visibleColumns,
      }),
    [filterState, groupBy, props.locale, searchText, sortState, visibleColumns],
  )
  const viewKey = useMemo(() => modelRef.current.createViewKey(view), [view])
  const serverRowId = useCallback((row: TRow) => props.rowId(row, 0), [props.rowId])

  const syncRowsFromCache = useCallback(() => {
    const nextRows = modelRef.current.collectContiguousInfiniteRows(viewKey)
    loadedRowsRef.current = nextRows
    setRows(nextRows)
  }, [viewKey])

  const trackPromise = useCallback((promise: Promise<ServerBlockResult<TRow>>) => {
    inFlightCountRef.current += 1
    setLoading(true)
    promise
      .finally(() => {
        inFlightCountRef.current -= 1
        if (inFlightCountRef.current <= 0) setLoading(false)
      })
      .catch(() => {})
  }, [])

  const ensureBlock = useCallback(
    (rowIndex: number) => {
      if (!loadBlock) return
      const blockStart = Math.max(0, Math.floor(rowIndex / blockSize) * blockSize)
      const request = modelRef.current.loadInfiniteBlock({
        blockSize,
        blockStart,
        cacheOptions: {
          ...(maxCachedBlocks ? { maxBlocks: maxCachedBlocks } : {}),
          ...(blockLoadDebounceMs ? { blockLoadDebounceMs } : {}),
          ...(maxConcurrentRequests ? { maxConcurrentRequests } : {}),
        },
        loadBlock,
        view,
        viewKey,
      })

      if (request.cached) return
      if (request.deduped) return

      trackPromise(request.promise)
      request.promise
        .then((result) => {
          setError(null)
          // Clear retry counter on success — a future re-failure of the
          // same blockKey starts fresh from attempt 1.
          blockRetryAttemptsRef.current.delete(request.blockKey)
          const nextRows = modelRef.current.mergeInfiniteRows(loadedRowsRef.current, result)
          if (nextRows) {
            loadedRowsRef.current = nextRows
            setRows(nextRows)
          } else {
            syncRowsFromCache()
          }
          if (result.totalRows != null) setRowCount(result.totalRows)
          else if (result.hasMore === false) setRowCount(result.blockStart + result.rows.length)
          else setRowCount("unknown")
        })
        .catch((nextError: unknown) => {
          if (modelRef.current.isAbortError(nextError)) return
          // Dev-mode surfacing (worker1 v06 bsncraft P1 #12): surface
          // `loadBlock` rejections (including
          // `validateServerBlockResult` throws) immediately in the
          // console so consumers can diagnose contract violations
          // without waiting for the error UI to render. Production
          // stays silent.
          if (process.env.NODE_ENV !== "production") {
            console.error("[bc-grid] infinite loadBlock rejected:", nextError)
          }
          // Per-block retry pipeline (worker1 v0.6 server block error
          // affordance, planning doc §3). Track attempt count per
          // blockKey, fire onBlockError with the willRetry decision,
          // and schedule the next attempt via setTimeout when the
          // retry budget permits. On exhaustion, clear the counter
          // + surface the error to state so the consumer sees a
          // permanent failure.
          const attempt = (blockRetryAttemptsRef.current.get(request.blockKey) ?? 0) + 1
          blockRetryAttemptsRef.current.set(request.blockKey, attempt)
          const decision = resolveBlockRetryDecision({
            attempt,
            config: autoRetryConfigRef.current,
          })
          const errorParams: BcServerBlockErrorParams = {
            blockKey: request.blockKey,
            blockStart,
            blockSize,
            error: nextError,
            attempt,
            willRetry: decision.willRetry,
            retryDelayMs: decision.retryDelayMs,
          }
          onBlockErrorRef.current?.(errorParams)
          if (decision.willRetry) {
            setTimeout(() => {
              ensureBlock(rowIndex)
            }, decision.retryDelayMs)
            return
          }
          blockRetryAttemptsRef.current.delete(request.blockKey)
          setError(nextError)
        })
    },
    [
      blockLoadDebounceMs,
      blockSize,
      loadBlock,
      maxCachedBlocks,
      maxConcurrentRequests,
      syncRowsFromCache,
      trackPromise,
      view,
      viewKey,
    ],
  )

  useEffect(() => {
    if (!loadBlock) return
    void refreshVersion
    ensureBlock(0)
  }, [ensureBlock, loadBlock, refreshVersion])

  useEffect(() => () => modelRef.current.abortAll(), [])

  // Mode-switch RFC §5: abort + clear cache when this hook's mode
  // goes inactive. RFC §4 item 13: 100ms grace then force-settle
  // remaining pending mutations as rejected with the mode-switch
  // reason.
  const wasInfiniteActiveRef = useRef(isInfiniteActive)
  useEffect(() => {
    if (wasInfiniteActiveRef.current && !isInfiniteActive) {
      modelRef.current.abortAll()
      modelRef.current.cache.clear()
      inFlightCountRef.current = 0
      loadedRowsRef.current = []
      setRows([])
      setRowCount("unknown")
      setLoading(false)
      setError(null)
      const model = modelRef.current
      const rowIdGetter: (row: TRow) => RowId = (row) => props.rowId(row, 0)
      const timer = setTimeout(() => {
        for (const mutationId of model.pendingMutationIds()) {
          model.settleMutation({
            result: { mutationId, reason: MODE_SWITCH_REJECT_REASON, status: "rejected" },
            rowId: rowIdGetter,
          })
        }
      }, MODE_SWITCH_MUTATION_GRACE_MS)
      wasInfiniteActiveRef.current = isInfiniteActive
      return () => clearTimeout(timer)
    }
    wasInfiniteActiveRef.current = isInfiniteActive
  }, [isInfiniteActive, props.rowId])

  const handleVisibleRowRangeChange = useCallback(
    (range: { startIndex: number; endIndex: number }) => {
      visibleRangeRef.current = range
      if (!loadBlock) return
      ensureBlock(range.startIndex)
      ensureBlock(range.endIndex)
      if (rowCount === "unknown" || rows.length < rowCount) {
        for (let i = 1; i <= prefetchAhead; i++) {
          ensureBlock(range.endIndex + blockSize * i)
        }
      }
    },
    [blockSize, ensureBlock, loadBlock, prefetchAhead, rowCount, rows.length],
  )

  const refresh = useCallback((opts?: { purge?: boolean }) => {
    if (opts?.purge) {
      modelRef.current.cache.clear()
      loadedRowsRef.current = []
      setRows([])
      setRowCount("unknown")
      setError(null)
    }
    setRefreshVersion((version) => version + 1)
  }, [])

  const invalidate = useCallback(
    (invalidation: ServerInvalidation) => {
      modelRef.current.invalidate(invalidation, { rowId: props.rowId })
      syncRowsFromCache()
      const range = visibleRangeRef.current
      ensureBlock(range.startIndex)
      ensureBlock(range.endIndex)
      if (rowCount === "unknown" || rows.length < rowCount) {
        for (let i = 1; i <= prefetchAhead; i++) {
          ensureBlock(range.endIndex + blockSize * i)
        }
      }
      setRefreshVersion((version) => version + 1)
    },
    [blockSize, ensureBlock, prefetchAhead, props.rowId, rowCount, rows.length, syncRowsFromCache],
  )

  const retryBlock = useCallback((blockKey: ServerBlockKey) => {
    modelRef.current.cache.delete(blockKey)
    setRefreshVersion((version) => version + 1)
  }, [])

  const queueMutation = useCallback(
    (patch: ServerRowPatch) => {
      modelRef.current.queueMutation({ patch, rowId: serverRowId })
      syncRowsFromCache()
    },
    [serverRowId, syncRowsFromCache],
  )

  const settleMutation = useCallback(
    (mutationResult: ServerMutationResult<TRow>) => {
      modelRef.current.settleMutation({ result: mutationResult, rowId: serverRowId })
      syncRowsFromCache()
    },
    [serverRowId, syncRowsFromCache],
  )

  const applyRowUpdate = useCallback(
    (update: ServerRowUpdate<TRow>) => {
      if (update.type === "viewInvalidated") {
        if (update.viewKey && update.viewKey !== viewKey) return
        modelRef.current.applyRowUpdate({ rowId: serverRowId, update, viewKey })
        refresh({ purge: true })
        return
      }

      const updateResult = modelRef.current.applyRowUpdate({ rowId: serverRowId, update, viewKey })
      syncRowsFromCache()
      setRowCount((prev) => nextServerRowCount(prev, updateResult))
    },
    [refresh, serverRowId, syncRowsFromCache, viewKey],
  )

  const getModelState = useCallback(
    () =>
      modelRef.current.getState({
        mode: "infinite",
        rowCount,
        selection: toServerSelection(undefined, view),
        view,
        viewKey,
      }),
    [rowCount, view, viewKey],
  )
  const getDiagnostics = useCallback(
    (selection?: BcSelection) =>
      modelRef.current.getDiagnostics({
        mode: "infinite",
        rowCount,
        selection: toServerSelection(selection, view),
        view,
        viewKey,
      }),
    [rowCount, view, viewKey],
  )

  const whenIdle = useCallback(async () => {
    while (modelRef.current.hasInFlightRequests()) {
      await modelRef.current.awaitAllSettled()
    }
  }, [])

  return {
    applyRowUpdate,
    whenIdle,
    error,
    getDiagnostics,
    getModelState,
    handleFilterChange,
    handleSortChange,
    handleVisibleRowRangeChange,
    invalidate,
    loading,
    queueMutation,
    refresh,
    retryBlock,
    rowCount,
    rows,
    settleMutation,
    view,
  }
}

function useTreeServerState<TRow>(
  props: BcServerGridProps<TRow>,
  visibleColumns: readonly ColumnId[],
): TreeServerState<TRow> {
  // Mode-switch RFC stage 3.1: gate all hook activity on the resolved
  // active mode. The tree hook runs when `rowModel="tree"` is explicit
  // OR when `groupBy` is non-empty under the heuristic.
  const activeMode = resolveActiveRowModelMode({
    rowModel: props.rowModel,
    groupBy: props.groupBy,
  })
  const isTreeActive = activeMode === "tree"

  const modelRef = useRef(createServerRowModel<TRow>())
  const rootLoadSequenceRef = useRef(0)
  const [refreshVersion, setRefreshVersion] = useState(0)
  const [tree, setTree] = useState<TreeSnapshot<TRow>>(() => modelRef.current.createTreeSnapshot())
  const [error, setError] = useState<unknown>(null)
  const [rootLoading, setRootLoading] = useState(() => isTreeActive)

  const resetTreeRows = useCallback(() => {
    modelRef.current.abortAll()
    modelRef.current.cache.clear()
    setTree(modelRef.current.createTreeSnapshot())
    setError(null)
    setRootLoading(isTreeActive)
    setRefreshVersion((version) => version + 1)
  }, [isTreeActive])

  const { filterState, handleFilterChange, handleSortChange, sortState } = useServerSortFilterState(
    props,
    resetTreeRows,
  )

  const expansionControlled = hasProp(props, "expansion")
  const [uncontrolledExpansion, setUncontrolledExpansion] = useState<ReadonlySet<RowId>>(
    () => props.defaultExpansion ?? new Set<RowId>(),
  )
  const expansionState = expansionControlled
    ? (props.expansion ?? new Set<RowId>())
    : uncontrolledExpansion

  const childCount = isTreeActive
    ? resolveTreeChildCount(props.childCount)
    : DEFAULT_SERVER_BLOCK_SIZE
  const maxCachedTreeBlocks = isTreeActive ? props.maxCachedBlocks : undefined
  const initialRootChildCount = isTreeActive ? props.initialRootChildCount : undefined
  const loadChildRows = isTreeActive ? props.loadChildren : undefined
  const loadRootRows = isTreeActive ? props.loadRoots : undefined
  const searchText = props.searchText ?? props.defaultSearchText
  const groupBy = props.groupBy ?? props.defaultGroupBy ?? []
  const view = useMemo(
    () =>
      modelRef.current.createViewState({
        filter: filterState ?? undefined,
        groupBy,
        locale: props.locale,
        searchText,
        sort: sortState,
        visibleColumns,
      }),
    [filterState, groupBy, props.locale, searchText, sortState, visibleColumns],
  )
  const viewKey = useMemo(() => modelRef.current.createViewKey(view), [view])
  const serverRowId = useCallback((row: TRow) => props.rowId(row, 0), [props.rowId])

  const flatNodes = useMemo(
    () => modelRef.current.flattenTreeSnapshot(tree, expansionState),
    [expansionState, tree],
  )
  const rows = flatNodes.map((node) => node.row)
  // Build the server-tree group-row override map. Bsncraft v0.6.0-
  // alpha.1 P1: server-tree rows with `kind: "group"` rendered as
  // empty data rows because `flatNodes.map((n) => n.row)` above
  // strips the metadata. The override map preserves it keyed by
  // rowId so `<BcGrid>` can synthesize the GroupRowEntry shape its
  // render loop expects. Label is derived from the latest groupKey
  // in the node's groupPath (per the server-tree contract — the
  // `groupPath` ends with the row's own groupKey for group nodes).
  const serverRowEntryOverrides = useMemo(() => {
    const map = new Map<RowId, ServerRowEntryOverride>()
    for (const node of flatNodes) {
      if (node.kind !== "group") continue
      const groupKey = node.groupPath[node.groupPath.length - 1]
      const label = groupKey ? String(groupKey.value ?? "") : ""
      const childCount = node.childCount === "unknown" ? 0 : node.childCount
      map.set(node.rowId, {
        kind: "group",
        level: node.level,
        label,
        childCount,
        childRowIds: node.childIds,
        expanded: expansionState.has(node.rowId),
      })
    }
    return map
  }, [flatNodes, expansionState])

  const setExpansion = useCallback(
    (next: ReadonlySet<RowId>) => {
      const prev = expansionState
      if (!expansionControlled) setUncontrolledExpansion(next)
      props.onExpansionChange?.(next, prev)
    },
    [expansionControlled, expansionState, props.onExpansionChange],
  )

  // §10 fix (audit P1 server-perf bundle): track the latest viewKey so
  // late tree fetches under a superseded view can be discarded at merge
  // time. `loadTreeChildren` does not call `abortExcept` (paged does);
  // without this gate, a fetch under viewKey K1 that resolves after
  // the user has changed filter to K2 would merge K1 children into a
  // K2 snapshot.
  const treeViewKeyRef = useRef(viewKey)
  useEffect(() => {
    treeViewKeyRef.current = viewKey
  }, [viewKey])

  const loadTreeChildren = useCallback(
    (node: TreeNode<TRow> | null) => {
      if (!loadChildRows) return
      const rootLoadId = node ? null : ++rootLoadSequenceRef.current
      const loader = node ? loadChildRows : (loadRootRows ?? loadChildRows)
      const parentRowId = node?.rowId ?? null
      const groupPath = node?.groupPath ?? []
      const request = modelRef.current.loadTreeChildren({
        childCount,
        childStart: 0,
        groupPath,
        loadChildren: loader,
        parentRowId,
        rowId: props.rowId,
        view,
        viewKey,
      })

      setError(null)
      if (node) {
        setTree((prev) =>
          modelRef.current.updateTreeNode(prev, node.rowId, { loading: true, error: null }),
        )
      } else {
        setRootLoading(true)
      }

      request.promise
        .then((result) => {
          // §10 fix: discard responses for a superseded viewKey. The
          // result still settles in the model cache (handy for a
          // later refetch after a re-expand under the new view), but
          // we don't merge stale children into the active snapshot.
          // `shouldMergeTreeResult` is the exported pure-helper form;
          // the contract is unit-tested independently of this React
          // path.
          if (
            !shouldMergeTreeResult({
              resultViewKey: result.viewKey,
              fallbackViewKey: viewKey,
              currentViewKey: treeViewKeyRef.current,
            })
          ) {
            return
          }
          const resultViewKey = result.viewKey ?? viewKey
          setTree((prev) =>
            modelRef.current.mergeTreeResult({
              getRowId: props.rowId,
              parentNode: node,
              result,
              snapshot: prev,
              viewKey: resultViewKey,
            }),
          )
          setError(null)
          // Tree-block LRU eviction. Tree mode has no built-in
          // cacheOptions on `loadTreeChildren` (paged + infinite drive
          // eviction through the model directly), so we trigger it
          // explicitly after each successful tree fetch when the
          // consumer opted into a cap.
          if (typeof maxCachedTreeBlocks === "number" && maxCachedTreeBlocks > 0) {
            modelRef.current.cache.evictLoadedBlocks(maxCachedTreeBlocks)
          }
        })
        .catch((nextError: unknown) => {
          if (modelRef.current.isAbortError(nextError)) return
          // Dev-mode surfacing (worker1 v06 bsncraft P1 #12): surface
          // `loadTreeChildren` rejections (most commonly
          // `validateTreeResult` throws when `childCount` doesn't echo
          // the requested size) immediately in the console so
          // consumers can diagnose contract violations without
          // waiting for the error UI to render. Production stays
          // silent — `setError` already feeds the error overlay path.
          if (process.env.NODE_ENV !== "production") {
            console.error("[bc-grid] tree loadChildren rejected:", nextError)
          }
          setError(nextError)
          if (node) {
            setTree((prev) =>
              modelRef.current.updateTreeNode(prev, node.rowId, {
                error: nextError,
                loading: false,
              }),
            )
          }
        })
        .finally(() => {
          if (rootLoadId != null && rootLoadSequenceRef.current === rootLoadId) {
            setRootLoading(false)
          }
        })
    },
    [childCount, loadChildRows, loadRootRows, maxCachedTreeBlocks, props.rowId, view, viewKey],
  )

  useEffect(() => {
    if (!loadChildRows) return
    void refreshVersion
    loadTreeChildren(null)
  }, [loadChildRows, loadTreeChildren, refreshVersion])

  useEffect(() => () => modelRef.current.abortAll(), [])

  // Mode-switch RFC §5: abort + clear cache when this hook's mode
  // goes inactive. Per RFC §4 item 7, expansion is "dropped by design"
  // on a tree→non-tree switch — but expansion is consumer-controlled
  // when supplied so the hook only resets the uncontrolled fallback.
  const wasTreeActiveRef = useRef(isTreeActive)
  useEffect(() => {
    if (wasTreeActiveRef.current && !isTreeActive) {
      modelRef.current.abortAll()
      modelRef.current.cache.clear()
      setTree(modelRef.current.createTreeSnapshot())
      setRootLoading(false)
      setError(null)
      // Drop the uncontrolled expansion set so a later re-entry into
      // tree mode starts clean (RFC §4 item 7). Controlled `expansion`
      // is consumer-owned and untouched.
      if (!expansionControlled) setUncontrolledExpansion(new Set<RowId>())
      // RFC §4 item 13: 100ms grace then force-settle remaining
      // pending mutations as rejected with the mode-switch reason.
      const model = modelRef.current
      const treeRowIdGetter = serverRowId
      const timer = setTimeout(() => {
        for (const mutationId of model.pendingMutationIds()) {
          model.settleMutation({
            result: { mutationId, reason: MODE_SWITCH_REJECT_REASON, status: "rejected" },
            rowId: treeRowIdGetter,
          })
        }
      }, MODE_SWITCH_MUTATION_GRACE_MS)
      wasTreeActiveRef.current = isTreeActive
      return () => clearTimeout(timer)
    }
    wasTreeActiveRef.current = isTreeActive
  }, [expansionControlled, isTreeActive, serverRowId])

  const toggleNode = useCallback(
    (rowId: RowId) => {
      const node = tree.nodes.get(rowId)
      if (!node || !node.hasChildren) return
      const nextExpansion = new Set(expansionState)
      if (nextExpansion.has(rowId)) {
        nextExpansion.delete(rowId)
        setExpansion(nextExpansion)
        return
      }
      nextExpansion.add(rowId)
      setExpansion(nextExpansion)
      if (!node.childrenLoaded && !node.loading) loadTreeChildren(node)
    },
    [expansionState, loadTreeChildren, setExpansion, tree.nodes],
  )

  const columns = useMemo(
    () =>
      isTreeActive
        ? createTreeColumns({
            columns: props.columns,
            expandedRowIds: expansionState,
            nodeByRowId: tree.nodes,
            toggleNode,
          })
        : props.columns,
    [expansionState, isTreeActive, props.columns, toggleNode, tree.nodes],
  )

  const rowId = useCallback(
    (row: TRow, index: number) => flatNodes[index]?.rowId ?? props.rowId(row, index),
    [flatNodes, props.rowId],
  )

  const refresh = useCallback((opts?: { purge?: boolean }) => {
    if (opts?.purge) {
      modelRef.current.cache.clear()
      setTree(modelRef.current.createTreeSnapshot())
    }
    setRefreshVersion((version) => version + 1)
  }, [])

  const invalidate = useCallback(
    (invalidation: ServerInvalidation) => {
      modelRef.current.invalidate(invalidation, { rowId: props.rowId })
      setTree(modelRef.current.createTreeSnapshot())
      setRefreshVersion((version) => version + 1)
    },
    [props.rowId],
  )

  const retryBlock = useCallback((blockKey: ServerBlockKey) => {
    modelRef.current.cache.delete(blockKey)
    setRefreshVersion((version) => version + 1)
  }, [])

  const syncTreeMutationRow = useCallback(
    (nodeRowId: RowId, dataRowId: RowId = nodeRowId) => {
      const row = findCachedServerRow(modelRef.current.cache.toMap(), dataRowId, serverRowId)
      if (row) setTree((prev) => updateTreeRow(prev, nodeRowId, row))
    },
    [serverRowId],
  )

  const queueMutation = useCallback(
    (patch: ServerRowPatch) => {
      modelRef.current.queueMutation({ patch, rowId: serverRowId })
      syncTreeMutationRow(patch.rowId)
    },
    [serverRowId, syncTreeMutationRow],
  )

  const settleMutation = useCallback(
    (mutationResult: ServerMutationResult<TRow>) => {
      const patch = modelRef.current
        .getState({
          mode: "tree",
          rowCount: rows.length,
          selection: toServerSelection(undefined, view),
          view,
          viewKey,
        })
        .pendingMutations.get(mutationResult.mutationId)
      const sourceRowId = mutationResult.previousRowId ?? patch?.rowId ?? mutationResult.rowId
      const targetRowId = mutationResult.row
        ? (mutationResult.rowId ?? serverRowId(mutationResult.row))
        : (mutationResult.rowId ?? sourceRowId)

      modelRef.current.settleMutation({ result: mutationResult, rowId: serverRowId })
      if (sourceRowId) syncTreeMutationRow(sourceRowId, targetRowId ?? sourceRowId)
      if (targetRowId && targetRowId !== sourceRowId) syncTreeMutationRow(targetRowId)
    },
    [rows.length, serverRowId, syncTreeMutationRow, view, viewKey],
  )

  const applyRowUpdate = useCallback(
    (update: ServerRowUpdate<TRow>) => {
      if (update.type === "viewInvalidated") {
        if (update.viewKey && update.viewKey !== viewKey) return
        modelRef.current.applyRowUpdate({ rowId: serverRowId, update, viewKey })
        refresh({ purge: true })
        return
      }

      modelRef.current.applyRowUpdate({ rowId: serverRowId, update, viewKey })
      if (update.type === "rowAdded") {
        const rowId = props.rowId(update.row, update.indexHint ?? 0)
        setTree((prev) => insertRootTreeRow(prev, rowId, update.row, update.indexHint))
        return
      }
      if (update.type === "rowUpdated") {
        setTree((prev) => updateTreeRow(prev, update.rowId, update.row))
        return
      }
      setTree((prev) => removeTreeRow(prev, update.rowId))
    },
    [props.rowId, refresh, serverRowId, viewKey],
  )

  const getModelState = useCallback(
    () =>
      modelRef.current.getState({
        mode: "tree",
        rowCount: rows.length,
        selection: toServerSelection(undefined, view),
        view,
        viewKey,
      }),
    [rows.length, view, viewKey],
  )
  const getDiagnostics = useCallback(
    (selection?: BcSelection) =>
      modelRef.current.getDiagnostics({
        mode: "tree",
        rowCount: rows.length,
        selection: toServerSelection(selection, view),
        view,
        viewKey,
      }),
    [rows.length, view, viewKey],
  )

  const whenIdle = useCallback(async () => {
    while (modelRef.current.hasInFlightRequests()) {
      await modelRef.current.awaitAllSettled()
    }
  }, [])

  return {
    applyRowUpdate,
    whenIdle,
    columns,
    error,
    getDiagnostics,
    getModelState,
    handleFilterChange,
    handleSortChange,
    invalidate,
    loading: rootLoading && rows.length === 0 && !error,
    queueMutation,
    refresh,
    retryBlock,
    rowCount: resolveTreeRowCount({
      mode: "tree",
      visibleRowCount: rows.length,
      initialRootChildCount,
      rootLoading,
    }),
    rowId,
    rows,
    serverRowEntryOverrides,
    settleMutation,
    view,
  }
}

function createTreeColumns<TRow>(input: {
  columns: readonly BcReactGridColumn<TRow>[]
  expandedRowIds: ReadonlySet<RowId>
  nodeByRowId: Map<RowId, TreeNode<TRow>>
  toggleNode: (rowId: RowId) => void
}): readonly BcReactGridColumn<TRow>[] {
  const treeColumnIndex = input.columns.findIndex((column) => !column.hidden)
  if (treeColumnIndex === -1) return input.columns

  return input.columns.map((column, index) => {
    if (index !== treeColumnIndex) return column
    return {
      ...column,
      cellRenderer(params) {
        const node = input.nodeByRowId.get(params.rowId)
        const content = column.cellRenderer ? column.cellRenderer(params) : params.formattedValue
        if (!node) return content
        const expanded = input.expandedRowIds.has(node.rowId)
        return (
          <span className="bc-grid-tree-cell">
            <span className="bc-grid-tree-indent" style={{ width: `${node.level * 1.25}rem` }} />
            {node.hasChildren ? (
              <button
                type="button"
                aria-expanded={expanded}
                aria-label={expanded ? "Collapse row" : "Expand row"}
                className="bc-grid-tree-toggle"
                onClick={(event) => {
                  event.stopPropagation()
                  input.toggleNode(node.rowId)
                }}
              >
                {expanded ? "v" : ">"}
              </button>
            ) : (
              <span aria-hidden="true" className="bc-grid-tree-spacer" />
            )}
            <span>{content}</span>
          </span>
        )
      },
    } satisfies BcReactGridColumn<TRow>
  })
}

function nextServerRowCount(
  rowCount: number | "unknown",
  updateResult: { insertedRowIds: readonly RowId[]; removedRowIds: readonly RowId[] },
): number | "unknown" {
  if (rowCount === "unknown") return rowCount
  return Math.max(
    0,
    rowCount + updateResult.insertedRowIds.length - updateResult.removedRowIds.length,
  )
}

function nextKnownServerRowCount(
  rowCount: number,
  updateResult: { insertedRowIds: readonly RowId[]; removedRowIds: readonly RowId[] },
): number {
  return nextServerRowCount(rowCount, updateResult) as number
}

export function createDefaultServerEditMutationPatch<TRow>(
  event: BcCellEditCommitEvent<TRow>,
  mutationId: string,
): ServerRowPatch {
  return {
    changes: { [event.columnId]: event.nextValue },
    mutationId,
    rowId: event.rowId,
  }
}

export async function commitServerEditMutation<TRow>(input: {
  createServerRowPatch?: BcServerEditPatchFactory<TRow> | undefined
  event: BcCellEditCommitEvent<TRow>
  mutationId: string
  onServerRowMutation: BcServerEditMutationHandler<TRow>
  queueServerRowMutation: (patch: ServerRowPatch) => void
  settleServerRowMutation: (result: ServerMutationResult<TRow>) => void
}): Promise<void> {
  const defaultPatch = createDefaultServerEditMutationPatch(input.event, input.mutationId)
  const patch = input.createServerRowPatch?.(input.event, defaultPatch) ?? defaultPatch
  input.queueServerRowMutation(patch)

  let settled = false
  try {
    const result = await input.onServerRowMutation({ ...input.event, patch })
    input.settleServerRowMutation(result)
    settled = true
    if (result.status !== "accepted") throw createServerEditMutationError(result)
  } catch (error) {
    if (!settled) {
      input.settleServerRowMutation({
        mutationId: patch.mutationId,
        reason: errorMessage(error),
        status: "rejected",
      })
    }
    throw error
  }
}

export function createServerEditMutationError<TRow>(result: ServerMutationResult<TRow>): Error {
  if (result.reason) return new Error(result.reason)
  if (result.status === "conflict") return new Error("Server reported an edit conflict.")
  return new Error("Server rejected the edit.")
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Server rejected the edit."
}

// Exported for unit testing (worker1 v06 server-grid error boundary).
export function serverErrorMessage(error: unknown): string {
  if (error == null) return "Failed to load."
  if (error instanceof Error) return error.message || "Failed to load."
  if (typeof error === "string") return error
  return "Failed to load."
}

// Exported for unit testing (worker1 v06 server-grid error boundary).
export function BcServerGridDefaultErrorOverlay({
  error,
  retry,
}: {
  error: unknown
  retry: () => void
}): ReactNode {
  return (
    <div
      className="bc-grid-server-error"
      style={{
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        padding: 12,
        color: "var(--bc-grid-edit-state-error-fg, #b91c1c)",
        background: "var(--bc-grid-edit-state-error-bg, transparent)",
        border: "1px solid var(--bc-grid-edit-state-error-border, currentColor)",
        borderRadius: 6,
      }}
    >
      <span>{serverErrorMessage(error)}</span>
      <button
        type="button"
        onClick={retry}
        data-bc-grid-server-error-retry="true"
        style={{
          padding: "4px 12px",
          cursor: "pointer",
          background: "transparent",
          color: "inherit",
          border: "1px solid currentColor",
          borderRadius: 4,
          font: "inherit",
        }}
      >
        Retry
      </button>
    </div>
  )
}

function findCachedServerRow<TRow>(
  blocks: ServerRowModelState<TRow>["blocks"],
  rowId: RowId,
  rowIdGetter: (row: TRow) => RowId,
): TRow | undefined {
  for (const block of blocks.values()) {
    if (block.state !== "loaded" && block.state !== "stale") continue
    const row = block.rows.find((candidate) => rowIdGetter(candidate) === rowId)
    if (row) return row
  }
  return undefined
}

function insertRootTreeRow<TRow>(
  snapshot: TreeSnapshot<TRow>,
  rowId: RowId,
  row: TRow,
  indexHint: number | undefined,
): TreeSnapshot<TRow> {
  const existing = snapshot.nodes.get(rowId)
  if (existing) return updateTreeRow(snapshot, rowId, row)

  const nodes = new Map(snapshot.nodes)
  nodes.set(rowId, {
    childCount: 0,
    childIds: [],
    childrenLoaded: true,
    error: null,
    groupPath: [],
    hasChildren: false,
    kind: "leaf",
    level: 0,
    loading: false,
    parentRowId: null,
    row,
    rowId,
  })
  const rootIds = snapshot.rootIds.slice()
  rootIds.splice(clampArrayIndex(indexHint ?? rootIds.length, 0, rootIds.length), 0, rowId)
  return { nodes, rootIds }
}

function updateTreeRow<TRow>(
  snapshot: TreeSnapshot<TRow>,
  rowId: RowId,
  row: TRow,
): TreeSnapshot<TRow> {
  const node = snapshot.nodes.get(rowId)
  if (!node) return snapshot
  const nodes = new Map(snapshot.nodes)
  nodes.set(rowId, { ...node, row })
  return { ...snapshot, nodes }
}

function removeTreeRow<TRow>(snapshot: TreeSnapshot<TRow>, rowId: RowId): TreeSnapshot<TRow> {
  if (!snapshot.nodes.has(rowId)) return snapshot

  const removed = new Set<RowId>()
  const collect = (targetRowId: RowId) => {
    if (removed.has(targetRowId)) return
    removed.add(targetRowId)
    const node = snapshot.nodes.get(targetRowId)
    if (!node) return
    for (const childId of node.childIds) collect(childId)
  }
  collect(rowId)

  const nodes = new Map(snapshot.nodes)
  for (const removedRowId of removed) nodes.delete(removedRowId)
  for (const [nodeRowId, node] of nodes) {
    const childIds = node.childIds.filter((childId) => !removed.has(childId))
    if (childIds.length !== node.childIds.length) nodes.set(nodeRowId, { ...node, childIds })
  }
  return {
    nodes,
    rootIds: snapshot.rootIds.filter((rootId) => !removed.has(rootId)),
  }
}

function clampArrayIndex(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return max
  return Math.min(max, Math.max(min, Math.floor(value)))
}

function createServerRowModelState<TRow>(input: {
  mode: ServerRowModelMode
  rowCount: number | "unknown"
  selection: ServerSelection
  view: ServerViewState
}): ServerRowModelState<TRow> {
  return {
    blocks: new Map(),
    mode: input.mode,
    pendingMutations: new Map(),
    rowCount: input.rowCount,
    selection: input.selection,
    view: input.view,
    viewKey: "react-scaffold",
  }
}

function toServerSelection(
  selection: BcSelection | undefined,
  view: ServerViewState,
): ServerSelection {
  if (!selection) return { mode: "explicit", rowIds: new Set<RowId>() }
  if (selection.mode === "filtered") {
    return {
      mode: "filtered",
      except: selection.except,
      view,
      ...(selection.viewKey ? { viewKey: selection.viewKey } : {}),
    }
  }
  return selection
}
