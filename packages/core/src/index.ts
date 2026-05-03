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
  /**
   * Mark cells in this column as required for the user. Surfaced as
   * `aria-required` on the editor input so AT announces the
   * required-ness alongside the column label. Audit P1-W3-7.
   *
   * Boolean form applies grid-wide; row-fn form lets the consumer
   * compute requiredness per-row (e.g. "qty is required when status
   * is 'open'"). Has no effect on the grid's internal validate
   * pipeline — that's still owned by `column.validate`. This flag is
   * purely the AT contract for "user must fill this in."
   */
  required?: boolean | ((row: TRow) => boolean)
  validate?: (
    newValue: TValue,
    row: TRow,
    signal?: AbortSignal,
  ) => BcValidationResult | Promise<BcValidationResult>

  aggregation?: BcAggregation

  tooltip?: string | ((row: TRow) => string | undefined)
  rowHeader?: boolean

  /**
   * Mark this column as the tree-outline column. The cell renderer
   * wraps the value with a chevron + indent + level affordance.
   * Active only when `BcGridProps.treeData` is set; ignored
   * otherwise. At most one column should be `outline: true` per grid;
   * the first wins. Per `docs/design/client-tree-rowmodel-rfc.md §4`.
   */
  outline?: boolean
}

interface BcColumnFilterBase {
  defaultValue?: unknown
  variant?: "popup" | "inline"
}

export type BcBuiltInColumnFilterType =
  | "text"
  | "number"
  | "number-range"
  | "date"
  | "date-range"
  | "set"
  | "boolean"

export type BcColumnFilterType = BcBuiltInColumnFilterType | "custom" | (string & {})

export interface SetFilterOption {
  value: string
  label: string
}

export interface SetFilterOptionLoadParams {
  columnId: ColumnId
  search: string
  selectedValues: readonly string[]
  filterWithoutSelf: BcGridFilter | null
  signal: AbortSignal
  limit: number
  offset: number
}

export interface SetFilterOptionLoadResult {
  options: readonly SetFilterOption[]
  totalCount?: number
  selectedOptions?: readonly SetFilterOption[]
  hasMore?: boolean
}

export type SetFilterOptionProvider = (
  params: SetFilterOptionLoadParams,
) => Promise<SetFilterOptionLoadResult>

export type BcColumnFilter =
  | (BcColumnFilterBase & {
      type: "text"
      caseSensitive?: boolean
      regex?: boolean
    })
  | (BcColumnFilterBase & {
      type: "number"
      precision?: number
    })
  | (BcColumnFilterBase & {
      type: "number-range"
      precision?: number
    })
  | (BcColumnFilterBase & {
      type: "date"
      granularity?: "day" | "month"
    })
  | (BcColumnFilterBase & {
      type: "date-range"
      granularity?: "day" | "month"
    })
  | (BcColumnFilterBase & {
      type: "set"
      options?: readonly (string | SetFilterOption)[]
      loadOptions?: () => Promise<readonly (string | SetFilterOption)[]>
      loadSetFilterOptions?: SetFilterOptionProvider
    })
  | (BcColumnFilterBase & {
      type: "boolean"
    })
  | (BcColumnFilterBase & {
      type: "custom" | (string & {})
    })

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
  /**
   * True when the row has any uncommitted overlay patch — at least one
   * cell has a pending edit (server commit in flight) OR a settled-but-
   * not-yet-canonical patch (the consumer's `data` prop hasn't caught
   * up to the local commit). Used by `<BcEditGrid>` to surface the
   * row-level "Discard" action button only when there's actually
   * something to discard. Audit P1-W3-3.
   */
  dirty?: boolean
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

export type BcGridPasteTsvOverflowMode = "reject" | "clip"

export interface BcGridPasteTsvParams {
  /**
   * Range anchor for the paste. When omitted, React grids use the most
   * recent active range or the active cell as a single-cell range.
   */
  range?: BcRange
  tsv: string
  /**
   * `reject` preserves strict atomic rectangle semantics. `clip` applies
   * only in-bounds cells and reports the skipped cells.
   */
  overflow?: BcGridPasteTsvOverflowMode
  signal?: AbortSignal
}

export type BcGridPasteTsvSkipReason =
  | "anchor-row-not-found"
  | "anchor-column-not-found"
  | "row-out-of-bounds"
  | "column-out-of-bounds"
  | "row-not-editable"
  | "cell-readonly"

export interface BcGridPasteTsvSkippedCell {
  sourceRowIndex: number
  sourceColumnIndex: number
  targetRowIndex?: number
  targetColumnIndex?: number
  rowId?: RowId
  columnId?: ColumnId
  value: string
  reasons: BcGridPasteTsvSkipReason[]
}

export type BcGridPasteTsvParseDiagnosticCode =
  | "empty-paste"
  | "max-cell-limit-exceeded"
  | "ragged-row"
  | "unexpected-quote"
  | "unexpected-character-after-closing-quote"
  | "unterminated-quoted-cell"

export interface BcGridPasteTsvParseDiagnostic {
  code: BcGridPasteTsvParseDiagnosticCode
  rowIndex: number
  columnIndex: number
  charIndex: number
  actualColumnCount?: number
  cellCount?: number
  expectedColumnCount?: number
  maxCells?: number
}

export type BcGridPasteTsvFailureCode =
  | "no-paste-target"
  | "edit-in-progress"
  | "parse-error"
  | "anchor-not-found"
  | "paste-out-of-bounds"
  | "row-not-found"
  | "row-not-editable"
  | "column-not-found"
  | "cell-readonly"
  | "value-parser-error"
  | "validation-error"

export interface BcGridPasteTsvFailure {
  code: BcGridPasteTsvFailureCode
  message: string
  sourceRowIndex?: number
  sourceColumnIndex?: number
  targetRowIndex?: number
  targetColumnIndex?: number
  rowId?: RowId
  columnId?: ColumnId
  rawValue?: string
  diagnostic?: BcGridPasteTsvParseDiagnostic
  skippedCell?: BcGridPasteTsvSkippedCell
  validation?: BcValidationResult
}

export interface BcGridPasteTsvCommit<TRow = unknown> {
  sourceRowIndex: number
  sourceColumnIndex: number
  targetRowIndex: number
  targetColumnIndex: number
  rowId: RowId
  row: TRow
  columnId: ColumnId
  previousValue: unknown
  nextValue: unknown
  rawValue: string
}

export interface BcGridPasteTsvRowPatch<TRow = unknown> {
  rowId: RowId
  row: TRow
  values: Record<string, unknown>
}

export interface BcGridPasteTsvSuccess<TRow = unknown> {
  ok: true
  range: BcRange
  cells: readonly (readonly string[])[]
  appliedCount: number
  commits: BcGridPasteTsvCommit<TRow>[]
  rowPatches: BcGridPasteTsvRowPatch<TRow>[]
  skippedCells: BcGridPasteTsvSkippedCell[]
}

export type BcGridPasteTsvResult<TRow = unknown> =
  | BcGridPasteTsvSuccess<TRow>
  | {
      ok: false
      range?: BcRange
      error: BcGridPasteTsvFailure
    }

/**
 * Atomic bulk-update primitive — `BcGridApi.applyRowPatches([...])`.
 * Each patch describes one row (`rowId`) and the fields to overwrite
 * on it (`fields: Partial<TRow>`, keyed by `column.field`). The grid
 * resolves each `(rowId, field)` to its column, runs that column's
 * `valueParser` (when supplied) and `validate` first; if any patch
 * fails, the operation rejects atomically (no overlay writes, no
 * `onCellEditCommit` invocations) and the result is `{ ok: false,
 * failures }`. When every patch passes, the grid applies all overlay
 * updates in a single render pass and fires `onCellEditCommit` once
 * per cell with `source: "api"`.
 *
 * The recipe doc at `docs/recipes/bulk-row-patch.md` covers the three
 * canonical patterns (fill-down, set-field-on-selection, shift-dates).
 */
export interface BcRowPatch<TRow = unknown> {
  rowId: RowId
  fields: Partial<TRow>
}

export type BcRowPatchFailureCode =
  | "row-not-found"
  | "column-not-found"
  | "cell-readonly"
  | "value-parser-error"
  | "validation-error"

export interface BcRowPatchFailure {
  rowId: RowId
  field: string
  columnId?: ColumnId
  code: BcRowPatchFailureCode
  message: string
  rejectedValue?: unknown
}

export type BcRowPatchResult<_TRow = unknown> =
  | { ok: true; applied: number; rowsAffected: number }
  | { ok: false; failures: readonly BcRowPatchFailure[] }

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
export {
  forEachSelectedRowId,
  isAllSelection,
  isExplicitSelection,
  isFilteredSelection,
} from "./selection"

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

  filter?: BcGridFilter | null | undefined
  defaultFilter?: BcGridFilter | null
  onFilterChange?: ((next: BcGridFilter | null, prev: BcGridFilter | null) => void) | undefined

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
  /**
   * Read the active filter entries for a single column. Returns `null`
   * when that column has no active filter.
   */
  getActiveFilter(columnId: ColumnId): BcGridFilter | null

  setColumnState(state: BcColumnStateEntry[]): void
  setSort(sort: BcGridSort[]): void
  setFilter(filter: BcGridFilter | null): void
  /**
   * Open the filter UI for a column. The default variant follows the
   * column definition: popup-variant filters open their popup, otherwise
   * the inline filter editor is focused when it is currently rendered.
   */
  openFilter(columnId: ColumnId, opts?: { variant?: "popup" | "inline" }): void
  /**
   * Close the open popup filter. When `columnId` is supplied, only closes
   * if that column's popup is currently open. Inline filters are a
   * persistent row surface, so there is nothing to unmount for them.
   */
  closeFilter(columnId?: ColumnId): void
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
  /**
   * Paste a TSV matrix into the grid at `range.start`, or at the active
   * range / active cell when no range is supplied. The operation is
   * atomic for parse, parser, and validation failures: no overlay writes
   * occur unless every target cell can be applied.
   */
  pasteTsv(params: BcGridPasteTsvParams): Promise<BcGridPasteTsvResult<TRow>>
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

  /**
   * Atomic bulk update — apply many patches across many rows in a
   * single render pass. Each patch is `{ rowId, fields: Partial<TRow> }`.
   *
   * Pipeline (per `docs/coordination/v06-task-plans/bulk-row-patch.md`):
   *
   *   1. Resolve each `(rowId, field)` pair: locate the row by id and
   *      the column by `field`. Missing rows / columns produce a
   *      `row-not-found` / `column-not-found` failure.
   *   2. Run `column.editable` (function form receives the row); a
   *      false result is `cell-readonly`.
   *   3. Run `column.valueParser` when the supplied value is a string.
   *      A throw is `value-parser-error`.
   *   4. Run `column.validate` (sync or async). `valid: false` is
   *      `validation-error`.
   *   5. **Atomic gate.** If any cell failed any of steps 1–4, return
   *      `{ ok: false, failures }` and apply NOTHING. Otherwise apply
   *      every patch in one render pass and fire one
   *      `onCellEditCommit` per cell with `source: "api"`.
   *
   * The whole point: every "fill down", "shift dates", "set status to
   * Approved" toolbar in an ERP wants this primitive — iterating
   * `setRow` loses atomicity, fires N validates, N renders, and skips
   * the existing pending-overlay rollback path. With `applyRowPatches`,
   * partial-failure scenarios surface as one rejection envelope so the
   * consumer can show a single toast + the offending fields.
   *
   * Returns `{ ok: true, applied, rowsAffected }` on success — `applied`
   * is the cell count, `rowsAffected` is the unique-row count.
   *
   * v0.6 §1 headline (HEADLINE / two-spike-confirmed: doc-mgmt #6 +
   * production-estimating #4).
   */
  applyRowPatches(patches: readonly BcRowPatch<TRow>[]): Promise<BcRowPatchResult<TRow>>

  /**
   * Discard every uncommitted edit on a row — the multi-cell rollback
   * the user reaches for after Tab-driven entry into 4 cells then
   * "actually, never mind, revert this row." Mirrors a row-scoped
   * Esc (Escape only cancels the active editor; this drops the
   * overlay patches for every cell on the row).
   *
   * Pending entries (in-flight server commits) and error entries
   * (server-rejected, awaiting consumer dismissal) are preserved —
   * both are still load-bearing per `editing-rfc §Concurrency`. If
   * the active editor is on this row, it is cancelled first.
   *
   * Returns `{ discarded }` so callers can announce "Reverted N
   * changes" or skip the toast when nothing actually rolled back.
   *
   * Audit P1-W3-3.
   */
  discardRowEdits(rowId: RowId): { discarded: number }

  /**
   * Read a chrome-visibility user setting (e.g. `"pagination"`,
   * `"filterRow"`, `"statusBar"`). Returns `undefined` when no
   * `userSettings` store is wired or the setting hasn't been written
   * yet — callers should fall through to their default. Surfaced for
   * `DEFAULT_CONTEXT_MENU_ITEMS` toggle items that need to read +
   * write the persisted visibility shape directly.
   */
  getVisibleSetting(key: string): boolean | undefined
  /**
   * Write a chrome-visibility user setting. No-op when no
   * `userSettings` store is wired (the toggle still flips the live
   * UI state via the same mutator the writer feeds, so the visibility
   * change takes effect even without persistence).
   */
  setVisibleSetting(key: string, value: boolean): void

  /**
   * Clear the row selection — sets selection to an empty explicit set.
   * Surfaced for view-change reset flows on `<BcServerGrid>` (worker1
   * audit P1 §1) where the prior view's selected rowIds become "ghost
   * selection" once a filter / sort / search / groupBy change shifts
   * the visible row set. Consumers can also call this from custom
   * "Clear selection" affordances.
   */
  clearSelection(): void
  /**
   * Clear the active cell focus — sets the active cell to `null` and
   * blurs any cell-level focus indicator. Use after a view change when
   * the previously-focused cell's row no longer participates in the
   * new query result. Pairs with `focusCell` (which sets a position).
   * Worker1 audit P1 §1.
   */
  clearActiveCell(): void
  /**
   * Scroll the grid viewport to the top — sets `scrollTop` to 0 on the
   * scroll container. Companion to `scrollToRow` (which scrolls to a
   * specific rowId) for the "scroll to top of view" flow that doesn't
   * need a row identifier. Surfaced for view-change reset on
   * `<BcServerGrid>` per worker1 audit P1 §1.
   */
  scrollToTop(): void

  /**
   * Read the persisted server-infinite prefetch budget (number of
   * blocks to fetch ahead of the visible viewport on each
   * `onVisibleRowRangeChange`). Returns `undefined` when no
   * `userSettings` store is wired or the setting hasn't been written
   * yet — `<BcServerGrid>`'s `resolvePrefetchAhead` then falls through
   * to the consumer-supplied prop or the default `1`. Surfaced for
   * the `DEFAULT_CONTEXT_MENU_ITEMS` Server → Prefetch ahead radio
   * submenu.
   */
  getPrefetchAhead(): number | undefined
  /**
   * Write the persisted server-infinite prefetch budget. The next
   * `<BcServerGrid rowModel="infinite">` re-render reads it via
   * `resolvePrefetchAhead`. Clamped to non-negative integers.
   */
  setPrefetchAhead(value: number): void

  refresh(): void
}

export interface BcServerGridApi<TRow = unknown> extends BcGridApi<TRow> {
  refreshServerRows(opts?: { purge?: boolean }): void
  invalidateServerRows(invalidation: ServerInvalidation): void
  /**
   * Convenience wrapper around `invalidateServerRows({ scope: "rows",
   * rowIds: [rowId] })`. Surfaces the single-row invalidate path so
   * `onServerRowMutation` rejection branches (worker1 audit P1 §11)
   * can mark a row's cache stale without constructing the
   * `ServerInvalidation` shape inline.
   *
   * **Rollback ≠ invalidate.** The grid's managed-overlay rollback
   * (which fires when `onServerRowMutation` resolves with
   * `{ status: "rejected" }`) restores the canonical row from the
   * model's snapshot at queue time — it does NOT refetch from the
   * server. If the server has accepted other changes for the same row
   * during the rejected mutation's lifetime (e.g. another user's
   * commit landed), the rollback's snapshot is stale relative to the
   * server's current state. Consumers who care about post-rollback
   * server-truth should call `invalidateRowCache(rowId)` from their
   * rejection branch — the next `loadPage` / `loadBlock` /
   * `loadChildren` for the affected row's page will refetch the
   * canonical state, and the rollback's snapshot will be replaced.
   */
  invalidateRowCache(rowId: RowId): void
  retryServerBlock(blockKey: ServerBlockKey): void
  applyServerRowUpdate(update: ServerRowUpdate<TRow>): void
  queueServerRowMutation(patch: ServerRowPatch): void
  settleServerRowMutation(result: ServerMutationResult<TRow>): void
  getServerRowModelState(): ServerRowModelState<TRow>
  getServerDiagnostics(): ServerRowModelDiagnostics
  /**
   * Returns the currently active row-fetching strategy. Today this
   * mirrors the explicit `BcServerGridProps.rowModel` literal because
   * `rowModel` is required. Once `rowModel` becomes optional in a
   * future stage of the server-mode-switch RFC (per
   * `docs/design/server-mode-switch-rfc.md §6`), this resolves the
   * heuristic: `groupBy.length > 0` ⇒ `"tree"`, else `"paged"`.
   * Consumers branching imperative calls per mode read this rather
   * than the prop directly.
   */
  getActiveRowModelMode(): ServerRowModelMode
  /**
   * Resolves when there are no in-flight server requests AND no
   * pending state-change debounces. Consumers wanting `await`
   * semantics after a sync state setter (e.g. a controlled `groupBy`
   * change, `setSort`, `setFilter`) can:
   *
   * ```ts
   * setGroupBy(["customerType"])
   * await apiRef.current?.whenIdle()
   * // model is settled; new mode's first response has landed.
   * ```
   *
   * General-purpose, not mode-switch-specific: works after any state
   * change. Resolves immediately if already idle. Resolves (does not
   * reject) if the grid unmounts before settling — consumers don't
   * need to wrap calls in try/catch.
   *
   * Per `docs/design/server-mode-switch-rfc.md §6` Q1 hybrid
   * resolution.
   */
  whenIdle(): Promise<void>
  /**
   * Scroll to a cell whose row may not currently be loaded. Returns a
   * Promise that resolves with `{ scrolled: true }` when the row was
   * found and scrolled into view, or `{ scrolled: false }` when the
   * row was not found in the loaded data after the optional navigation
   * step.
   *
   * Behavior by row model:
   *
   * - **paged** — if the row is in the current loaded page, scrolls
   *   synchronously and resolves true. If the row is not loaded and
   *   `opts.pageIndex` is provided, navigates to that page, awaits the
   *   next loadPage settlement, then re-attempts the scroll and
   *   resolves based on whether the row appears in the new page. If
   *   `opts.pageIndex` is omitted and the row is not loaded, resolves
   *   `{ scrolled: false }` without navigating.
   * - **infinite / tree** — best-effort sync: if the row is in the
   *   currently loaded blocks, scrolls and resolves true; otherwise
   *   resolves false. The hook does not automatically fetch additional
   *   blocks for the target row.
   *
   * Use this from search → ArrowDown-into-grid, save-and-next, and
   * scroll-to-error / validation-flash workflows where the consumer
   * knows the global pageIndex of the row.
   *
   * Audit-2026-05 P0-7. v0.5 server-side imperative API surface.
   */
  scrollToServerCell(
    rowId: RowId,
    columnId: ColumnId,
    opts?: BcScrollOptions & { pageIndex?: number },
  ): Promise<{ scrolled: boolean }>
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
  type: BcColumnFilterType
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
  /**
   * Post-update canonical row, same shape as `LoadServerPage.rows[number]` /
   * `LoadServerBlock.rows[number]` / `LoadServerTreeChildren.rows[number].data`.
   * Merged into the block cache with **replacement semantics** — the value
   * entirely supplants the cached row at this `rowId`, not a partial patch.
   * Hosts that only want to update changed columns should still return the
   * full row (re-fetched or merged client-side from the prior cached row +
   * the patch). Omit when the mutation didn't change the row (e.g. a
   * `status: "rejected"` result with `reason` but no new row data).
   */
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
