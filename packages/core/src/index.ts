import type { BcRangeSelection } from "./range"

export type ColumnId = string
export type RowId = string

export interface BcGridColumn<TRow, TValue = unknown> {
  columnId?: ColumnId
  field?: keyof TRow & string
  header: string

  width?: number
  minWidth?: number
  maxWidth?: number
  flex?: number
  align?: "left" | "right" | "center"
  pinned?: "left" | "right"
  hidden?: boolean

  sortable?: boolean
  resizable?: boolean
  filter?: BcColumnFilter | false
  groupable?: boolean
  comparator?: (a: TValue, b: TValue, rowA: TRow, rowB: TRow) => number

  valueGetter?: (row: TRow) => TValue
  valueFormatter?: (value: TValue, row: TRow) => string
  valueParser?: (input: string, row: TRow) => TValue
  format?: BcColumnFormat

  cellClass?: string | ((value: TValue, row: TRow) => string | undefined)

  editable?: boolean | ((row: TRow) => boolean)
  validate?: (
    newValue: TValue,
    row: TRow,
    signal?: AbortSignal,
  ) => BcValidationResult | Promise<BcValidationResult>

  aggregation?: BcAggregation

  tooltip?: string | ((row: TRow) => string | undefined)
  rowHeader?: boolean
}

export interface BcColumnFilter {
  type: "text" | "number" | "number-range" | "date" | "date-range" | "set" | "boolean" | "custom"
  defaultValue?: unknown
  variant?: "popup" | "inline"
}

export type BcColumnFormat =
  | "text"
  | "code"
  | "number"
  | "currency"
  | "percent"
  | "date"
  | "datetime"
  | "boolean"
  | "muted"
  | { type: "number"; precision?: number; thousands?: boolean }
  | { type: "currency"; currency?: string; precision?: number }
  | { type: "percent"; precision?: number }
  | { type: "date"; pattern?: string }
  | { type: "datetime"; pattern?: string }

export interface BcAggregation {
  type: "sum" | "count" | "avg" | "min" | "max" | "custom"
  custom?:
    | ((rows: unknown[]) => unknown)
    | {
        id: string
        init(ctx: unknown): unknown
        step(acc: unknown, value: unknown, row: unknown, ctx: unknown): unknown
        merge(a: unknown, b: unknown, ctx: unknown): unknown
        finalize(acc: unknown, ctx: unknown): unknown
      }
}

export interface BcAggregationResultDTO<TResult = unknown> {
  columnId: ColumnId
  rowCount: number
  value: TResult
}

export interface BcPivotValue {
  columnId: ColumnId
  aggregation?: BcAggregation
  label?: string
}

export interface BcPivotState {
  rowGroups: readonly ColumnId[]
  colGroups: readonly ColumnId[]
  values: readonly BcPivotValue[]
  subtotals?: { rows?: boolean; cols?: boolean }
}

export const emptyBcPivotState: BcPivotState = {
  rowGroups: [],
  colGroups: [],
  values: [],
  subtotals: { rows: true, cols: true },
}

export interface BcPivotedDataDTO {
  rowRoot: BcPivotRowNodeDTO
  colRoot: BcPivotColNodeDTO
  cells: readonly BcPivotCellDTO[]
}

export interface BcPivotRowNodeDTO {
  keyPath: readonly unknown[]
  value: unknown
  children: readonly BcPivotRowNodeDTO[]
  isTotal: boolean
  level: number
}

export interface BcPivotColNodeDTO {
  keyPath: readonly unknown[]
  value: unknown
  children: readonly BcPivotColNodeDTO[]
  isTotal: boolean
  level: number
}

export interface BcPivotCellDTO {
  rowKeyPath: readonly unknown[]
  colKeyPath: readonly unknown[]
  results: readonly BcAggregationResultDTO[]
}

export type BcValidationResult = { valid: true } | { valid: false; error: string }

export type BcRowId<TRow> = (row: TRow, index: number) => RowId

export interface BcRowState {
  rowId: RowId
  index: number
  selected: boolean
  disabled?: boolean
  expanded?: boolean
  level?: number
  pending?: boolean
  error?: string
}

export interface BcGridSort {
  columnId: ColumnId
  direction: "asc" | "desc"
}

export type BcGridFilter = ServerFilter

export type BcSelection =
  | { mode: "explicit"; rowIds: ReadonlySet<RowId> }
  | { mode: "all"; except: ReadonlySet<RowId> }
  | { mode: "filtered"; except: ReadonlySet<RowId>; viewKey?: string }

export interface BcColumnStateEntry {
  columnId: ColumnId
  width?: number
  flex?: number
  hidden?: boolean
  pinned?: "left" | "right" | null
  sortDirection?: "asc" | "desc" | null
  sortIndex?: number | null
  position?: number
}

export interface BcCellPosition {
  rowId: RowId
  columnId: ColumnId
}

export interface BcRange {
  start: BcCellPosition
  end: BcCellPosition
}

export {
  emptyBcRangeSelection,
  expandRangeTo,
  newRangeAt,
  normaliseRange,
  parseRangeSelection,
  rangeBounds,
  rangeClear,
  rangeContains,
  rangeKeydown,
  rangePointerDown,
  rangePointerMove,
  rangePointerUp,
  rangeSelectAll,
  rangesContain,
  serializeRangeSelection,
} from "./range"
export type { BcNormalisedRange, BcRangeKeyAction, BcRangeSelection } from "./range"

export interface BcPaginationState {
  page: number
  pageSize: number
}

export interface BcGridStateProps {
  sort?: readonly BcGridSort[]
  defaultSort?: readonly BcGridSort[]
  onSortChange?: (next: readonly BcGridSort[], prev: readonly BcGridSort[]) => void

  searchText?: string
  defaultSearchText?: string
  onSearchTextChange?: (next: string, prev: string) => void

  filter?: BcGridFilter | null
  defaultFilter?: BcGridFilter | null
  onFilterChange?: (next: BcGridFilter | null, prev: BcGridFilter | null) => void

  selection?: BcSelection
  defaultSelection?: BcSelection
  onSelectionChange?: (next: BcSelection, prev: BcSelection) => void

  rangeSelection?: BcRangeSelection
  defaultRangeSelection?: BcRangeSelection
  onRangeSelectionChange?: (next: BcRangeSelection, prev: BcRangeSelection) => void

  expansion?: ReadonlySet<RowId>
  defaultExpansion?: ReadonlySet<RowId>
  onExpansionChange?: (next: ReadonlySet<RowId>, prev: ReadonlySet<RowId>) => void

  groupBy?: readonly ColumnId[]
  defaultGroupBy?: readonly ColumnId[]
  onGroupByChange?: (next: readonly ColumnId[], prev: readonly ColumnId[]) => void

  pivotState?: BcPivotState
  defaultPivotState?: BcPivotState
  onPivotStateChange?: (next: BcPivotState, prev: BcPivotState) => void

  columnState?: readonly BcColumnStateEntry[]
  defaultColumnState?: readonly BcColumnStateEntry[]
  onColumnStateChange?: (
    next: readonly BcColumnStateEntry[],
    prev: readonly BcColumnStateEntry[],
  ) => void

  activeCell?: BcCellPosition | null
  defaultActiveCell?: BcCellPosition | null
  onActiveCellChange?: (next: BcCellPosition | null, prev: BcCellPosition | null) => void

  page?: number
  defaultPage?: number
  pageSize?: number
  defaultPageSize?: number
  onPaginationChange?: (next: BcPaginationState, prev: BcPaginationState) => void
}

export interface BcGridIdentity {
  gridId?: string
}

export type BcScrollAlign = "start" | "center" | "end" | "nearest"

export interface BcScrollOptions {
  align?: BcScrollAlign
}

export interface BcGridApi<TRow = unknown> {
  scrollToRow(rowId: RowId, opts?: BcScrollOptions): void
  scrollToCell(position: BcCellPosition, opts?: BcScrollOptions): void
  focusCell(position: BcCellPosition): void
  isCellVisible(position: BcCellPosition): boolean

  getRowById(rowId: RowId): TRow | undefined
  getActiveCell(): BcCellPosition | null
  getSelection(): BcSelection
  getRangeSelection(): BcRangeSelection
  getColumnState(): BcColumnStateEntry[]
  /**
   * Read the active grid filter, or `null` when no filter is set.
   * Companion to `setFilter` / `clearFilter`. Useful for context-menu
   * items and consumer-side affordances that need to reason about the
   * current filter without mounting controlled state. Per
   * `docs/design/context-menu-command-map.md §2.3`.
   */
  getFilter(): BcGridFilter | null

  setColumnState(state: BcColumnStateEntry[]): void
  setSort(sort: BcGridSort[]): void
  setFilter(filter: BcGridFilter | null): void
  /**
   * Clear the grid filter. With no `columnId` this is equivalent to
   * `setFilter(null)`. With a `columnId`, removes only that column's
   * leaf entries from the active filter and preserves the rest;
   * collapses single-child groups and returns `null` when the result
   * is empty. Per `docs/design/context-menu-command-map.md §2.3`.
   */
  clearFilter(columnId?: ColumnId): void
  /**
   * Pin a column to the left or right edge, or unpin it (`pinned: null`).
   * Convenience over `setColumnState`: walks the current state, updates
   * just the targeted entry's `pinned` property, and writes the result.
   * Per `docs/design/context-menu-command-map.md §2.4`.
   */
  setColumnPinned(columnId: ColumnId, pinned: "left" | "right" | null): void
  /**
   * Show or hide a column. Convenience over `setColumnState`: walks the
   * current state, updates just the targeted entry's `hidden` property,
   * and writes the result. Per `docs/design/context-menu-command-map.md §2.4`.
   */
  setColumnHidden(columnId: ColumnId, hidden: boolean): void
  /**
   * Autosize a column to fit the widest visible cell + its header.
   * Best-effort heuristic — measures the rendered DOM in the visible
   * window only; off-screen rows are not measured (consistent with
   * AG Grid's `autoSizeColumn` behaviour). Writes the resulting width
   * through `setColumnState`, clamped to the column's min/max bounds.
   * No-op if the grid root isn't mounted yet. Per
   * `docs/design/context-menu-command-map.md §2.4`.
   */
  autoSizeColumn(columnId: ColumnId): void
  setRangeSelection(selection: BcRangeSelection): void
  copyRange(range?: BcRange): Promise<void>
  clearRangeSelection(): void
  expandAll(): void
  collapseAll(): void

  /**
   * Programmatically activate the cell editor on `(rowId, columnId)`.
   *
   * Mirrors what the user gets from F2 / Enter / printable seed, but
   * with `activation: "api"` so consumer telemetry can distinguish
   * programmatic edits from keyboard ones. Per
   * `editing-rfc §Lifecycle`.
   *
   * No-op if any of:
   *   - the row or column id is unknown to the current row/column model;
   *   - the column has `editable: false` (or a row-aware `editable`
   *     function that returned false for this row);
   *   - the row is disabled via `rowIsDisabled`;
   *   - the grid is already in edit mode on a different cell (the
   *     existing edit takes precedence — call `cancelEdit()` first if
   *     you want to switch).
   *
   * Audit P0-7. Pairs with `focusCell` (which only moves the active
   * cell without entering edit mode).
   */
  startEdit(
    rowId: RowId,
    columnId: ColumnId,
    opts?: {
      /**
       * Seed character for printable-style activation. If supplied,
       * the editor mounts with this character pre-typed (matching the
       * F2 / printable contract). Single-character only; longer
       * strings are silently dropped.
       */
      seedKey?: string
    },
  ): void

  /**
   * Programmatically commit the active editor.
   *
   * Reads the current editor input's value from the DOM (matching the
   * pointer / keyboard commit paths), runs `column.valueParser` and
   * `column.validate` through the editing controller, then applies the
   * overlay update and fires `onCellEditCommit`. Returns immediately
   * — the validation/commit is async; consumers wanting to await the
   * settle can listen on the editing announce hook or read
   * `getCellEditEntry(...).pending` from the controller.
   *
   * `opts.value` overrides the DOM read (useful when the consumer
   * computed the value programmatically).
   * `opts.moveOnSettle` controls active-cell movement after commit
   * (default `"stay"` for API path — pointer commits also use `"stay"`,
   * keyboard commits use direction-of-key).
   *
   * No-op when the grid is not currently editing a cell.
   *
   * Audit P0-7.
   */
  commitEdit(opts?: {
    value?: unknown
    moveOnSettle?: "stay" | "down" | "up" | "right" | "left"
  }): void

  /**
   * Programmatically cancel the active editor — overlay is unchanged,
   * focus returns to the grid root. Mirrors Escape from the keyboard.
   *
   * No-op when the grid is not currently editing a cell.
   *
   * Audit P0-7.
   */
  cancelEdit(): void

  refresh(): void
}

export interface BcServerGridApi<TRow = unknown> extends BcGridApi<TRow> {
  refreshServerRows(opts?: { purge?: boolean }): void
  invalidateServerRows(invalidation: ServerInvalidation): void
  retryServerBlock(blockKey: ServerBlockKey): void
  applyServerRowUpdate(update: ServerRowUpdate<TRow>): void
  queueServerRowMutation(patch: ServerRowPatch): void
  settleServerRowMutation(result: ServerMutationResult<TRow>): void
  getServerRowModelState(): ServerRowModelState<TRow>
  getServerDiagnostics(): ServerRowModelDiagnostics
}

export type ServerRowModelMode = "paged" | "infinite" | "tree"

export interface ServerSort {
  columnId: ColumnId
  direction: "asc" | "desc"
  nulls?: "first" | "last" | "server-default"
}

export type ServerFilter = ServerFilterGroup | ServerColumnFilter

export interface ServerFilterGroup {
  kind: "group"
  op: "and" | "or"
  filters: ServerFilter[]
}

export interface ServerColumnFilter {
  kind: "column"
  columnId: ColumnId
  type: "text" | "number" | "number-range" | "date" | "date-range" | "set" | "boolean" | "custom"
  op: string
  value?: unknown
  values?: unknown[]
  /**
   * Modifier flag — when true, `text` filter comparisons are
   * case-sensitive. Defaults to false (case-insensitive). Other filter
   * types ignore this field. Per `filter-registry-rfc §text`.
   */
  caseSensitive?: boolean
  /**
   * Modifier flag — when true, the `text` filter interprets `value`
   * as a regular expression pattern and tests against the formatted
   * cell value (`i` flag implied when `caseSensitive` is false).
   * Other filter types ignore this field. Per `filter-registry-rfc §text`.
   */
  regex?: boolean
}

export interface ServerGroup {
  columnId: ColumnId
  direction?: "asc" | "desc"
}

export interface ServerViewState {
  sort: ServerSort[]
  filter?: ServerFilter
  search?: string
  groupBy: ServerGroup[]
  visibleColumns: ColumnId[]
  locale?: string
  timeZone?: string
}

export interface ServerQueryBase {
  view: ServerViewState
  requestId: string
  viewKey?: string
}

export interface ServerLoadContext {
  signal: AbortSignal
}

export interface ServerPagedQuery extends ServerQueryBase {
  mode: "paged"
  /** Zero-based global page index requested from the server for this view. */
  pageIndex: number
  /** Requested page size for the current server-backed page window. */
  pageSize: number
  pivotState?: BcPivotState
}

export interface ServerPagedResult<TRow> {
  /** Rows for the requested page window only, not the full matching result set. */
  rows: TRow[]
  /** Total rows in the full server view after applying query.view. */
  totalRows: number
  /** Zero-based page index represented by rows. */
  pageIndex: number
  /** Page size used to produce rows. */
  pageSize: number
  pivotedRows?: BcPivotedDataDTO
  viewKey?: string
  revision?: string
}

export type LoadServerPage<TRow> = (
  query: ServerPagedQuery,
  context: ServerLoadContext,
) => Promise<ServerPagedResult<TRow>>

export interface ServerBlockQuery extends ServerQueryBase {
  mode: "infinite"
  blockStart: number
  blockSize: number
}

export interface ServerBlockResult<TRow> {
  rows: TRow[]
  blockStart: number
  blockSize: number
  totalRows?: number
  hasMore?: boolean
  viewKey?: string
  revision?: string
}

export type LoadServerBlock<TRow> = (
  query: ServerBlockQuery,
  context: ServerLoadContext,
) => Promise<ServerBlockResult<TRow>>

export interface ServerTreeQuery extends ServerQueryBase {
  mode: "tree"
  parentRowId: RowId | null
  groupPath: ServerGroupKey[]
  childStart: number
  childCount: number
}

export interface ServerGroupKey {
  columnId: ColumnId
  value: unknown
  rowId?: RowId
}

export interface ServerTreeRow<TRow> {
  data: TRow
  rowId?: RowId
  kind: "leaf" | "group"
  groupKey?: ServerGroupKey
  childCount?: number
  hasChildren?: boolean
}

export interface ServerTreeResult<TRow> {
  rows: ServerTreeRow<TRow>[]
  parentRowId: RowId | null
  groupPath: ServerGroupKey[]
  childStart: number
  childCount: number
  totalChildCount?: number
  viewKey?: string
  revision?: string
}

export type LoadServerTreeChildren<TRow> = (
  query: ServerTreeQuery,
  context: ServerLoadContext,
) => Promise<ServerTreeResult<TRow>>

export interface ServerRowIdentity<TRow> {
  rowId(row: TRow): RowId
  groupRowId?(group: ServerGroupKey, path: ServerGroupKey[]): RowId
}

export type ServerSelection =
  | { mode: "explicit"; rowIds: ReadonlySet<RowId> }
  | { mode: "all"; except: ReadonlySet<RowId> }
  | {
      mode: "filtered"
      view: ServerViewState
      viewKey?: string
      except: ReadonlySet<RowId>
    }

export interface ServerSelectionSnapshot {
  mode: "explicit" | "all" | "filtered"
  rowIds: RowId[]
  except: RowId[]
  view?: ServerViewState
  viewKey?: string
}

export interface ServerRowPatch {
  rowId: RowId
  changes: Record<ColumnId, unknown>
  baseRevision?: string
  mutationId: string
}

export interface ServerMutationResult<TRow> {
  mutationId: string
  status: "accepted" | "rejected" | "conflict"
  row?: TRow
  previousRowId?: RowId
  rowId?: RowId
  revision?: string
  reason?: string
}

export type ServerBlockKey = string

export interface ServerCacheBlock<TRow> {
  key: ServerBlockKey
  viewKey: string
  start: number
  size: number
  rows: TRow[]
  state: "queued" | "fetching" | "loaded" | "stale" | "error" | "evicted"
  loadedAt?: number
  error?: unknown
  revision?: string
}

export interface ServerBlockCacheOptions {
  blockSize: number
  maxBlocks: number
  blockLoadDebounceMs: number
  maxConcurrentRequests: number
  staleTimeMs: number
}

export type ServerInvalidation =
  | { scope: "all" }
  | { scope: "view"; viewKey?: string }
  | { scope: "blocks"; blockKeys: ServerBlockKey[] }
  | { scope: "rows"; rowIds: RowId[] }
  | { scope: "tree"; parentRowId: RowId | null; recursive?: boolean }

export interface ServerExportQuery {
  view: ServerViewState
  viewKey?: string
  selection?: ServerSelectionSnapshot
  columns: ColumnId[]
  format: "csv" | "xlsx" | "pdf"
  maxRows?: number
}

export interface ServerExportResult {
  kind: "blob" | "url" | "job"
  blob?: Blob
  url?: string
  jobId?: string
}

export type ServerRowUpdate<TRow> =
  | {
      type: "rowAdded"
      row: TRow
      indexHint?: number
      viewKey?: string
      revision?: string
    }
  | { type: "rowUpdated"; rowId: RowId; row: TRow; revision?: string }
  | { type: "rowRemoved"; rowId: RowId; revision?: string }
  | { type: "viewInvalidated"; viewKey?: string; reason?: string }

export interface ServerRowModelState<TRow> {
  mode: ServerRowModelMode
  view: ServerViewState
  viewKey: string
  rowCount: number | "unknown"
  blocks: Map<ServerBlockKey, ServerCacheBlock<TRow>>
  pendingMutations: Map<string, ServerRowPatch>
  selection: ServerSelection
}

export interface ServerViewDiagnostics {
  sortCount: number
  filterActive: boolean
  searchActive: boolean
  groupByCount: number
  visibleColumnCount: number
  locale?: string
  timeZone?: string
}

export type ServerQueryDiagnostics =
  | {
      mode: "paged"
      requestId: string
      viewKey?: string
      view: ServerViewDiagnostics
      pageIndex: number
      pageSize: number
    }
  | {
      mode: "infinite"
      requestId: string
      viewKey?: string
      view: ServerViewDiagnostics
      blockStart: number
      blockSize: number
    }
  | {
      mode: "tree"
      requestId: string
      viewKey?: string
      view: ServerViewDiagnostics
      parentRowId: RowId | null
      groupPath: ServerGroupKey[]
      childStart: number
      childCount: number
    }

export type ServerLoadStatus =
  | "idle"
  | "queued"
  | "loading"
  | "success"
  | "error"
  | "cached"
  | "deduped"
  | "aborted"

export interface ServerLoadDiagnostics {
  status: ServerLoadStatus
  blockKey?: ServerBlockKey
  query?: ServerQueryDiagnostics
  rowCount?: number | "unknown"
  error?: string
}

export interface ServerCacheDiagnostics {
  blockCount: number
  blockKeys: ServerBlockKey[]
  loadedRowCount: number
  states: Record<ServerCacheBlock<unknown>["state"], number>
}

export interface ServerRowModelDiagnostics {
  mode: ServerRowModelMode
  view: ServerViewState
  viewKey: string
  viewSummary: ServerViewDiagnostics
  rowCount: number | "unknown"
  cache: ServerCacheDiagnostics
  pendingMutationCount: number
  lastLoad: ServerLoadDiagnostics
}

export type ServerRowModelEvent<TRow> =
  | { type: "viewChanged"; viewKey: string; view: ServerViewState }
  | { type: "blockQueued"; blockKey: ServerBlockKey }
  | { type: "blockFetching"; blockKey: ServerBlockKey; requestId: string }
  | { type: "blockLoaded"; blockKey: ServerBlockKey; rowCount: number | "unknown" }
  | { type: "blockError"; blockKey: ServerBlockKey; error: unknown }
  | {
      type: "blockEvicted"
      blockKey: ServerBlockKey
      reason: "lru" | "invalidate"
    }
  | { type: "rowsInvalidated"; rowIds: RowId[] }
  | { type: "mutationQueued"; mutationId: string; rowId: RowId }
  | { type: "mutationSettled"; result: ServerMutationResult<TRow> }
  | {
      type: "rowUpdateApplied"
      update: ServerRowUpdate<TRow>
      affectedBlockKeys: ServerBlockKey[]
      insertedRowIds: RowId[]
      updatedRowIds: RowId[]
      removedRowIds: RowId[]
      invalidated: boolean
    }
