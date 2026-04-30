import type { AggregationResult } from "@bc-grid/aggregations"
import type {
  BcCellPosition,
  BcColumnFilter,
  BcColumnFormat,
  BcColumnStateEntry,
  BcGridColumn as BcCoreGridColumn,
  BcGridApi,
  BcGridFilter,
  BcGridIdentity,
  BcGridSort,
  BcGridStateProps,
  BcPaginationState,
  BcRowId,
  BcRowState,
  BcSelection,
  BcServerGridApi,
  BcValidationResult,
  ColumnId,
  BcRange as CoreBcRange,
  LoadServerBlock,
  LoadServerPage,
  LoadServerTreeChildren,
  RowId,
  ServerBlockQuery,
  ServerBlockResult,
  ServerLoadContext,
  ServerPagedQuery,
  ServerPagedResult,
  ServerTreeQuery,
  ServerTreeResult,
} from "@bc-grid/core"
import type { CSSProperties, ComponentType, MouseEvent, ReactNode, RefObject } from "react"

export type BcGridDensity = "compact" | "normal" | "comfortable"

export interface BcGridMessages {
  noRowsLabel: string
  loadingLabel: string
  actionColumnLabel: string
  editLabel: string
  deleteLabel: string
  statusBarLabel: string

  /**
   * Live-region announcement templates. Functions return the localised
   * string for the given event. Per `accessibility-rfc §Live Regions`.
   */
  sortAnnounce: (params: { columnLabel: string; direction: "asc" | "desc" }) => string
  sortClearedAnnounce: () => string
  filterAnnounce: (params: { visibleRows: number; totalRows: number }) => string
  filterClearedAnnounce: (params: { totalRows: number }) => string
  selectionAnnounce: (params: { count: number }) => string
  selectionClearedAnnounce: () => string

  /**
   * Cell-edit live-region templates per `editing-rfc §Live Regions`.
   * Polite announcement on commit; assertive on validation rejection
   * (so AT interrupts speech). Cancel + edit-mode-entered are silent
   * per the RFC — focus on the editor input announces itself.
   */
  editCommittedAnnounce: (params: {
    columnLabel: string
    rowLabel: string
    formattedValue: string
  }) => string
  editValidationErrorAnnounce: (params: { columnLabel: string; error: string }) => string
  editServerErrorAnnounce: (params: { columnLabel: string; error: string }) => string
}

export interface BcGridUrlStatePersistence {
  searchParam: string
}

export type BcAggregationScope = "filtered" | "all" | "selected"

export interface BcClipboardPayload {
  tsv: string
  html?: string
  custom?: Record<string, string>
}

export interface BcRangeBeforeCopyEvent<TRow> {
  range: CoreBcRange
  rows: readonly TRow[]
  api: BcGridApi<TRow>
}

export type BcRangeBeforeCopyHook<TRow> = (
  event: BcRangeBeforeCopyEvent<TRow>,
) => BcClipboardPayload | false | undefined

export interface BcRangeCopyEvent {
  range: CoreBcRange
  payload: BcClipboardPayload
  suppressed: boolean
}

export type BcRangeCopyHook = (event: BcRangeCopyEvent) => void

/**
 * Render context handed to status-bar segment renderers. Rebuilt per
 * grid render so segments always reflect current row / selection /
 * aggregation state. Per `chrome-rfc §Status bar`.
 */
export interface BcStatusBarContext<TRow = unknown> {
  /**
   * Total dataset size. `"unknown"` for server row models with
   * `rowcount=-1` (paged/infinite without a known total).
   */
  totalRowCount: number | "unknown"
  filteredRowCount: number
  selectedRowCount: number
  /**
   * Current aggregation results. Empty until `footer-aggregations`
   * wires the engine output through; the chrome RFC types this as
   * `readonly AggregationResult[]` so consumers can read it now.
   */
  aggregations: readonly AggregationResult[]
  api: BcGridApi<TRow>
}

export interface BcStatusBarCustomSegment<TRow = unknown> {
  id: string
  render: (ctx: BcStatusBarContext<TRow>) => ReactNode
  align?: "left" | "right"
}

/**
 * Status-bar segment shape per `chrome-rfc §Status bar`. Strings
 * resolve to built-ins; objects render the consumer-supplied node.
 * Built-ins: `total` always shown when listed; `filtered` shows only
 * when a filter is active; `selected` shows only when selectionSize >
 * 0; `aggregations` shows when results are non-empty.
 */
export type BcStatusBarSegment<TRow = unknown> =
  | "total"
  | "filtered"
  | "selected"
  | "aggregations"
  | BcStatusBarCustomSegment<TRow>

export interface BcAggregationFormatterParams<TRow, TValue = unknown> {
  value: unknown
  formattedValue: string
  result: AggregationResult
  column: BcReactGridColumn<TRow, TValue>
  locale?: string | undefined
}

export type BcReactGridColumn<TRow, TValue = unknown> = Omit<
  BcCoreGridColumn<TRow, TValue>,
  "header"
> & {
  header: string | ReactNode
  cellRenderer?: (params: BcCellRendererParams<TRow, TValue>) => ReactNode
  cellClassName?: string | ((params: BcCellRendererParams<TRow, TValue>) => string | undefined)
  cellStyle?:
    | CSSProperties
    | ((params: BcCellRendererParams<TRow, TValue>) => CSSProperties | undefined)
  cellEditor?: BcCellEditor<TRow, TValue>
  aggregationFormatter?: (params: BcAggregationFormatterParams<TRow, TValue>) => ReactNode
  /**
   * Static or per-row option list for `editor-select` / `editor-multi-select`
   * / `editor-autocomplete` per `editing-rfc §editor-select`. Either a flat
   * array (same options on every row) or a row-fn (per-row options driven
   * by the row's other fields).
   */
  options?:
    | readonly { value: TValue; label: string }[]
    | ((row: TRow) => readonly { value: TValue; label: string }[])
  /**
   * Async option fetch for `editor-autocomplete` per
   * `editing-rfc §editor-autocomplete`. Called every time the user types
   * (debounced 200ms inside the editor). The `signal` is aborted when a
   * subsequent keystroke supersedes the request — implementations should
   * pass it to `fetch` / `AbortSignal`-aware loaders so superseded
   * requests don't waste server work or race the latest result.
   */
  fetchOptions?: (
    query: string,
    signal: AbortSignal,
  ) => Promise<readonly { value: TValue; label: string }[]>
}

export type BcGridColumn<TRow, TValue = unknown> = BcReactGridColumn<TRow, TValue>

export interface BcCellRendererParams<TRow, TValue = unknown> {
  value: TValue
  formattedValue: string
  row: TRow
  rowId: RowId
  column: BcReactGridColumn<TRow, TValue>
  searchText: string
  rowState: BcRowState
  editing: boolean
  /**
   * True between `commit` and `onCellEditCommit` Promise resolution —
   * the cell has been edited locally and the consumer hook is in
   * flight. Per `editing-rfc §Dirty Tracking`.
   */
  pending: boolean
  /**
   * Async commit / server-commit error. Validation rejection stays on
   * the mounted editor because the commit never lands. Cleared on
   * successful retry or on cancel. Per `editing-rfc §Dirty Tracking`.
   */
  editError?: string
  /**
   * True when the cell has been edited (committed locally) this
   * session, regardless of whether the consumer's commit hook has
   * settled. Per `editing-rfc §Dirty Tracking`.
   */
  isDirty: boolean
}

export interface BcDetailPanelParams<TRow> {
  row: TRow
  rowId: RowId
  rowIndex: number
}

export interface BcGridProps<TRow> extends BcGridIdentity, BcGridStateProps {
  data: readonly TRow[]
  columns: readonly BcReactGridColumn<TRow>[]
  rowId: BcRowId<TRow>

  density?: BcGridDensity
  height?: "auto" | number
  rowHeight?: number

  pagination?: boolean
  pageSizeOptions?: number[]
  aggregationScope?: BcAggregationScope

  groupableColumns?: readonly { columnId: ColumnId; header: string }[]
  groupsExpandedByDefault?: boolean

  showInactive?: boolean
  onShowInactiveChange?: (next: boolean) => void
  rowIsInactive?: (row: TRow) => boolean
  rowIsDisabled?: (row: TRow) => boolean

  toolbar?: ReactNode
  footer?: ReactNode
  /**
   * Footer status bar segments rendered below the body, above any
   * `footer` slot. Built-in segment IDs (`total`, `filtered`,
   * `selected`, `aggregations`) opt in to the standard renderers;
   * `BcStatusBarCustomSegment` objects render consumer-supplied
   * content. Per `chrome-rfc §Status bar`.
   */
  statusBar?: readonly BcStatusBarSegment<TRow>[]

  /**
   * Master-detail render hook. When supplied, the grid renders a pinned-left
   * disclosure column and mounts this panel below expanded rows. Expansion
   * state uses the existing `expansion` / `defaultExpansion` /
   * `onExpansionChange` controlled-state pair.
   */
  renderDetailPanel?: (params: BcDetailPanelParams<TRow>) => ReactNode
  /**
   * Fixed height for expanded detail panels. A per-row function is supported
   * for predictable variable-height panels; auto-measurement is deferred.
   */
  detailPanelHeight?: number | ((params: BcDetailPanelParams<TRow>) => number)

  onRowClick?: (row: TRow, event: MouseEvent) => void
  onRowDoubleClick?: (row: TRow, event: MouseEvent) => void
  onCellFocus?: (position: BcCellPosition) => void
  onVisibleRowRangeChange?: (range: { startIndex: number; endIndex: number }) => void
  onBeforeCopy?: BcRangeBeforeCopyHook<TRow>
  onCopy?: BcRangeCopyHook

  apiRef?: RefObject<BcGridApi<TRow> | null>

  locale?: string
  messages?: Partial<BcGridMessages>
  urlStatePersistence?: BcGridUrlStatePersistence

  loading?: boolean
  loadingOverlay?: ReactNode

  ariaLabel?: string
  ariaLabelledBy?: string

  /**
   * Render a pinned-left checkbox column. The header checkbox toggles all
   * visible rows on the current page; row checkboxes toggle a single row.
   * Coexists with the existing click-to-select gestures — clicking a
   * checkbox does not trigger the row-click selection logic.
   */
  checkboxSelection?: boolean

  /**
   * Flash the cell briefly when an edit commits, per
   * `editing-rfc §Edit-cell paint perf`. Off by default. Uses the
   * `flash` primitive from `@bc-grid/animations`, which already
   * respects `prefers-reduced-motion`.
   */
  flashOnEdit?: boolean
}

export interface BcEditGridProps<TRow> extends BcGridProps<TRow> {
  detailPath?: string
  linkField?: keyof TRow & string

  onEdit?: (row: TRow) => void
  onDelete?: (row: TRow) => void
  onCellEditCommit?: (event: BcCellEditCommitEvent<TRow>) => void | Promise<void>
  canEdit?: (row: TRow) => boolean
  canDelete?: (row: TRow) => boolean

  extraActions?: BcEditGridAction<TRow>[] | ((row: TRow) => BcEditGridAction<TRow>[])
  hideActions?: boolean

  editLabel?: string
  deleteLabel?: string
  DeleteIcon?: ComponentType<{ className?: string }>
}

export interface BcEditGridAction<TRow> {
  label: string
  onSelect: (row: TRow) => void
  icon?: ComponentType<{ className?: string }>
  destructive?: boolean
  disabled?: boolean | ((row: TRow) => boolean)
}

export type BcServerGridProps<TRow> =
  | BcServerPagedProps<TRow>
  | BcServerInfiniteProps<TRow>
  | BcServerTreeProps<TRow>

export interface BcServerPagedProps<TRow> extends Omit<BcGridProps<TRow>, "apiRef" | "data"> {
  rowModel: "paged"
  pageSize?: number
  loadPage: LoadServerPage<TRow>
  initialResult?: ServerPagedResult<TRow>
  apiRef?: RefObject<BcServerGridApi<TRow> | null>
}

export interface BcServerInfiniteProps<TRow> extends Omit<BcGridProps<TRow>, "apiRef" | "data"> {
  rowModel: "infinite"
  blockSize?: number
  maxCachedBlocks?: number
  blockLoadDebounceMs?: number
  maxConcurrentRequests?: number
  loadBlock: LoadServerBlock<TRow>
  apiRef?: RefObject<BcServerGridApi<TRow> | null>
}

export interface BcServerTreeProps<TRow> extends Omit<BcGridProps<TRow>, "apiRef" | "data"> {
  rowModel: "tree"
  loadChildren: LoadServerTreeChildren<TRow>
  loadRoots?: LoadServerTreeChildren<TRow>
  apiRef?: RefObject<BcServerGridApi<TRow> | null>
}

export interface BcCellEditor<TRow, TValue = unknown> {
  Component: ComponentType<BcCellEditorProps<TRow, TValue>>
  prepare?: (params: BcCellEditorPrepareParams<TRow>) => Promise<unknown>
  kind?: string
}

export interface BcCellEditorPrepareParams<TRow> {
  row: TRow
  rowId: RowId
  columnId: ColumnId
}

export interface BcCellEditorProps<TRow, TValue = unknown> {
  initialValue: TValue
  row: TRow
  rowId: RowId
  column: BcReactGridColumn<TRow, TValue>
  commit(newValue: TValue): void
  cancel(): void
  error?: string
  focusRef?: RefObject<HTMLElement | null>

  /**
   * Seed value when the editor was activated by typing a printable
   * character. Editors should treat this as the user's first keystroke,
   * replacing the cell's prior value. Per `editing-rfc §Activation`.
   */
  seedKey?: string

  /**
   * Caret-position hint when activated by double-click, in client
   * coordinates. Editors may use `document.caretPositionFromPoint` or
   * an equivalent to position the caret near the click. Per
   * `editing-rfc §Activation`.
   */
  pointerHint?: { x: number; y: number }

  /**
   * Result of `editor.prepare()` if the editor declared one. Per
   * `editing-rfc §Lifecycle`.
   */
  prepareResult?: unknown

  /**
   * True while async validation or async server commit is in flight.
   * Editors should disable their commit affordance and surface a
   * spinner / disabled state.
   */
  pending?: boolean
}

export interface BcCellEditCommitEvent<TRow, TValue = unknown> {
  rowId: RowId
  row: TRow
  columnId: ColumnId
  column: BcReactGridColumn<TRow, TValue>
  previousValue: TValue
  nextValue: TValue
  source: "keyboard" | "pointer" | "api"
}

export interface BcFilterDefinition<TValue = unknown> {
  type: string
  predicate: (value: TValue, criteria: unknown) => boolean
  serialize: (criteria: unknown) => string
  parse: (serialized: string) => unknown
}

export interface BcReactFilterDefinition<TValue = unknown> extends BcFilterDefinition<TValue> {
  Editor?: ComponentType<BcFilterEditorProps<TValue>>
}

export interface BcFilterEditorProps<TValue = unknown> {
  value: TValue | null
  commit(next: TValue | null): void
  clear(): void
  locale?: string
}

export type {
  BcCellPosition,
  BcColumnFilter,
  BcColumnFormat,
  BcColumnStateEntry,
  BcGridApi,
  BcGridFilter,
  BcGridSort,
  BcGridStateProps,
  BcPaginationState,
  BcSelection,
  BcServerGridApi,
  BcValidationResult,
  ColumnId,
  LoadServerBlock,
  LoadServerPage,
  LoadServerTreeChildren,
  RowId,
  ServerBlockQuery,
  ServerBlockResult,
  ServerLoadContext,
  ServerPagedQuery,
  ServerPagedResult,
  ServerTreeQuery,
  ServerTreeResult,
}

export type { BcRange, BcRangeKeyAction, BcRangeSelection } from "@bc-grid/core"
