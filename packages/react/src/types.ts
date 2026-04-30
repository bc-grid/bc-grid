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
}

export interface BcGridUrlStatePersistence {
  searchParam: string
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

  groupableColumns?: readonly { columnId: ColumnId; header: string }[]
  groupsExpandedByDefault?: boolean

  showInactive?: boolean
  onShowInactiveChange?: (next: boolean) => void
  rowIsInactive?: (row: TRow) => boolean
  rowIsDisabled?: (row: TRow) => boolean

  toolbar?: ReactNode
  footer?: ReactNode

  onRowClick?: (row: TRow, event: MouseEvent) => void
  onRowDoubleClick?: (row: TRow, event: MouseEvent) => void
  onCellFocus?: (position: BcCellPosition) => void
  onVisibleRowRangeChange?: (range: { startIndex: number; endIndex: number }) => void

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
}

export interface BcEditGridProps<TRow> extends BcGridProps<TRow> {
  detailPath?: string
  linkField?: keyof TRow & string

  onEdit?: (row: TRow) => void
  onDelete?: (row: TRow) => void
  onCellEditCommit?: (event: BcCellEditCommitEvent<TRow>) => void
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
