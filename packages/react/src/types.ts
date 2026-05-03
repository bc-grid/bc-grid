import type { AggregationResult } from "@bc-grid/aggregations"
import type {
  BcBuiltInColumnFilterType,
  BcCellPosition,
  BcColumnFilter,
  BcColumnFilterType,
  BcColumnFormat,
  BcColumnStateEntry,
  BcGridColumn as BcCoreGridColumn,
  BcGridApi,
  BcGridFilter,
  BcGridIdentity,
  BcGridPasteTsvCommit,
  BcGridPasteTsvFailure,
  BcGridPasteTsvFailureCode,
  BcGridPasteTsvOverflowMode,
  BcGridPasteTsvParams,
  BcGridPasteTsvParseDiagnostic,
  BcGridPasteTsvParseDiagnosticCode,
  BcGridPasteTsvResult,
  BcGridPasteTsvRowPatch,
  BcGridPasteTsvSkipReason,
  BcGridPasteTsvSkippedCell,
  BcGridPasteTsvSuccess,
  BcGridSort,
  BcGridStateProps,
  BcPaginationState,
  BcPivotState,
  BcRowId,
  BcRowPatch,
  BcRowPatchResult,
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
  ServerCacheDiagnostics,
  ServerLoadContext,
  ServerLoadDiagnostics,
  ServerLoadStatus,
  ServerMutationResult,
  ServerPagedQuery,
  ServerPagedResult,
  ServerQueryDiagnostics,
  ServerRowModelDiagnostics,
  ServerRowModelMode,
  ServerRowPatch,
  ServerRowUpdate,
  ServerTreeQuery,
  ServerTreeResult,
  ServerTreeRow,
  ServerViewDiagnostics,
  SetFilterOption,
  SetFilterOptionLoadParams,
  SetFilterOptionLoadResult,
  SetFilterOptionProvider,
} from "@bc-grid/core"
import type {
  BcFilterDefinition as BcEngineFilterDefinition,
  BcFilterPredicateContext as BcEngineFilterPredicateContext,
  BcFilterUserContext as BcEngineFilterUserContext,
  BcFiscalCalendar as BcEngineFiscalCalendar,
} from "@bc-grid/filters"
import type {
  CSSProperties,
  ComponentType,
  MouseEvent,
  DragEvent as ReactDragEvent,
  ReactNode,
  RefObject,
} from "react"
import type { BcClientTreeData } from "./clientTree"
import type { EditorTabWraparound } from "./editingStateMachine"
import type { BcRowDropAction } from "./rowDragDrop"

export type BcGridDensity = "compact" | "normal" | "comfortable"

export interface BcGridLayoutState {
  /**
   * Version tag for consumer-owned persisted layouts. The grid currently
   * writes and accepts version 1; consumers should store it with the DTO so
   * future migrations can branch safely.
   */
  version: 1
  columnState?: readonly BcColumnStateEntry[]
  sort?: readonly BcGridSort[]
  filter?: BcGridFilter | null
  searchText?: string
  groupBy?: readonly ColumnId[]
  density?: BcGridDensity
  pagination?: BcPaginationState
  sidebarPanel?: string | null
}

// Reserved for v0.6+. Kept so the v0.5 draft persistence shape can
// accept column-scoped settings without a breaking type rename later.
export type BcUserColumnSettings = Record<string, never>

export interface BcUserSettings {
  version: 1
  /**
   * TODO(vanilla-rfc): these draft `visible.*` field names mirror
   * `docs/design/vanilla-and-context-menu-rfc.md`; coordinator owns the
   * final naming sweep when the RFC is ratified.
   */
  visible?: {
    columnMenu?: boolean
    filterRow?: boolean
    sidebar?: boolean
    statusBar?: boolean
    activeFilterSummary?: boolean
    flashOnEdit?: boolean
    checkboxSelection?: boolean
    /**
     * Pagination chrome visibility. Mirrors the `<BcGrid showPagination>`
     * prop shape: when `false`, the pager chrome is hidden but page-window
     * slicing / `aria-rowcount` / `onPaginationChange` still fire.
     * `<BcGrid>` resolves the effective value as `props.showPagination ??
     * userSettings?.visible?.pagination ?? true`. Surfaced for the
     * `DEFAULT_CONTEXT_MENU_ITEMS` Server → Show pagination toggle.
     */
    pagination?: boolean
    /**
     * Editor toggles wired through the chrome context menu's
     * `Editor` submenu (worker3 v05-default-context-menu-wiring).
     * Each field overrides the matching `BcGridProps` default when
     * set; consumer-supplied props take precedence.
     */
    editingEnabled?: boolean
    showValidationMessages?: boolean
    showEditorKeyboardHints?: boolean
    escDiscardsRow?: boolean
  }
  density?: BcGridDensity
  /**
   * Editor activation mode persisted across remounts via the chrome
   * context menu's `Editor → Activation` submenu. Stored top-level
   * (rather than under `visible`) because the value is an enum, not
   * a boolean. Consumer-supplied `BcGridProps.editorActivation`
   * takes precedence — see `BcUserSettings.visible.editingEnabled`
   * for the locked-by-prop pattern.
   */
  editorActivation?: "f2-only" | "single-click" | "double-click"
  /**
   * Click-outside semantics for the active editor, persisted across
   * remounts via the chrome context menu's `Editor → On blur`
   * submenu. Same locked-by-prop pattern as `editorActivation`.
   */
  editorBlurAction?: "commit" | "reject" | "ignore"
  /**
   * Server-infinite prefetch budget. Number of blocks to fetch ahead
   * of the visible viewport on each `onVisibleRowRangeChange`. Mirrors
   * the `BcServerInfiniteProps.prefetchAhead` prop shape; consumer-
   * supplied prop takes precedence. Surfaced for the
   * `DEFAULT_CONTEXT_MENU_ITEMS` Server → Prefetch ahead radio submenu
   * (worker1 v06-server-perf-prefetch-budget-tuning). Allowed values
   * are 0 (off) / 1 (default) / 2 / 3.
   */
  prefetchAhead?: number
  layout?: BcGridLayoutState
  sidebarPanel?: string | null
  perColumn?: Record<ColumnId, BcUserColumnSettings>
}

export interface BcUserSettingsStore {
  read(): BcUserSettings | undefined
  write(next: BcUserSettings): void
  subscribe?(listener: (next: BcUserSettings) => void): () => void
}

export interface BcGridMessages {
  noRowsLabel: string
  loadingLabel: string
  actionColumnLabel: string
  editLabel: string
  deleteLabel: string
  /** BcEditGrid action label for the row-level discard action. */
  discardLabel: string
  statusBarLabel: string

  /**
   * Filter cell text. `filterAriaLabel` produces the accessible name
   * for filter inputs from the column header so AT announces the
   * column context; `filterPlaceholder` is the visible placeholder
   * for the inline single-input filters; `filterMinPlaceholder` /
   * `filterMaxPlaceholder` are the per-bound placeholders for
   * range-style filters (number-range / date-range). Per
   * `accessibility-rfc §Semantic DOM Model` (no hard-coded English
   * inside engine packages).
   */
  filterPlaceholder: string
  filterAriaLabel: (params: { columnLabel: string }) => string
  filterMinPlaceholder: string
  filterMaxPlaceholder: string

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
  pasteCommittedAnnounce: (params: { count: number }) => string
  pasteRejectedAnnounce: (params: { error: string }) => string
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
 * `dragover` event payload — the live position handler. Returns a
 * `BcRowDropAction` to tell the grid where the drop will land.
 *
 * `sourceRowIds` carries every dragged row id (multi-row drag — the
 * grid drags the full selection if the drag origin was inside the
 * selection). The consumer uses this to reject drops onto the source
 * row itself (`if (sourceRowIds.includes(rowId)) return "none"`)
 * or to validate cross-parent drops in tree models.
 *
 * v0.6 §1 row-drag-drop-hooks.
 */
export interface BcRowDragOverEvent<TRow> {
  row: TRow
  rowId: RowId
  sourceRowIds: readonly RowId[]
  event: ReactDragEvent<HTMLElement>
}

export type BcRowDragOverHandler<TRow> = (event: BcRowDragOverEvent<TRow>) => BcRowDropAction

/**
 * `drop` event payload. `position` is the last value returned by
 * `onRowDragOver`. Consumer reorders / re-parents and updates its own
 * state; the grid does not mutate `data` on its own (consumer-owned
 * ordering, mirrors how `<BcServerGrid>` treats the row model).
 *
 * v0.6 §1 row-drag-drop-hooks.
 */
export interface BcRowDropEvent<TRow> {
  row: TRow
  rowId: RowId
  sourceRowIds: readonly RowId[]
  position: BcRowDropAction
  event: ReactDragEvent<HTMLElement>
}

export type BcRowDropHandler<TRow> = (event: BcRowDropEvent<TRow>) => void

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
  activeFilters: readonly BcActiveFilterSummaryItem[]
  clearColumnFilter(columnId: ColumnId): void
  clearAllFilters(): void
  api: BcGridApi<TRow>
  /**
   * Most recent validation rejection on any cell. `null` until a
   * rejection fires; auto-clears 8s after a rejection or immediately
   * on a successful commit on the same cell. Drives the built-in
   * `"latestError"` segment. Audit P1-W3-4.
   */
  latestValidationError: BcLatestValidationError | null
}

export interface BcActiveFilterSummaryItem {
  columnId: ColumnId
  filterText: string
  label: string
  summary: string
  type: BcColumnFilter["type"]
}

export interface BcStatusBarCustomSegment<TRow = unknown> {
  id: string
  render: (ctx: BcStatusBarContext<TRow>) => ReactNode
  align?: "left" | "right"
}

/**
 * Most recent validation rejection on any cell. Surfaced through
 * `BcStatusBarContext` so the built-in `"latestError"` segment can
 * render "{column header}: {error}" without the consumer wiring its
 * own announce listener. Auto-clears 8s after the rejection or
 * immediately on a successful commit on the same cell — see
 * `useEditingController` for the lifecycle. Audit P1-W3-4.
 */
export interface BcLatestValidationError {
  rowId: RowId
  columnId: ColumnId
  /**
   * Pre-resolved column header for status-bar rendering. Pulled from
   * `column.header` when it's a string; falls back to
   * `column.field` / `column.columnId` for non-string headers
   * (consumer-supplied React nodes can't render inside the segment
   * text). Lets the built-in segment stay dependency-free.
   */
  columnHeader: string
  error: string
}

/**
 * Status-bar segment shape per `chrome-rfc §Status bar`. Strings
 * resolve to built-ins; objects render the consumer-supplied node.
 * Built-ins: `total` always shown when listed; `filtered` shows only
 * when a filter is active; `activeFilters` shows removable filter
 * chips when any column filter is active; `selected` shows only when
 * selectionSize > 0; `aggregations` shows when results are non-empty;
 * `latestError` shows the most recent validation rejection (audit
 * P1-W3-4) and auto-clears via the editing controller.
 */
export type BcStatusBarSegment<TRow = unknown> =
  | "total"
  | "filtered"
  | "activeFilters"
  | "selected"
  | "aggregations"
  | "latestError"
  | BcStatusBarCustomSegment<TRow>

export interface BcBulkActionUndoableAction<TRow = unknown> {
  /**
   * Short user-facing label for the committed action, e.g. "Marked 12
   * invoices paid". The default undo toast renders this text beside
   * the Undo button.
   */
  label: string
  /**
   * Consumer-precomputed inverse patches. `undo()` applies these
   * through `BcGridApi.applyRowPatches`, preserving parser/validation
   * and commit-event semantics.
   */
  inversePatches: readonly BcRowPatch<TRow>[]
}

export interface BcBulkActionUndoContext<TRow = unknown> {
  undoableAction: BcBulkActionUndoableAction<TRow>
  undo(): Promise<BcRowPatchResult<TRow>>
  dismiss(): void
}

export interface BcBulkActionsContext<TRow = unknown> {
  /**
   * Selected row IDs resolved against rows currently known to this
   * client grid. For explicit selection this is the selected set; for
   * all/filtered selection modes it is the known row population minus
   * `selection.except`.
   */
  selectedRowIds: readonly RowId[]
  selectedRowCount: number
  clearSelection(): void
  showUndo(action: BcBulkActionUndoableAction<TRow>): void
}

export interface BcAggregationFormatterParams<TRow, TValue = unknown> {
  value: unknown
  formattedValue: string
  result: AggregationResult
  column: BcReactGridColumn<TRow, TValue>
  locale?: string | undefined
}

export type BcFillSeriesPreset = "literal" | "linear" | "exponential" | "weekday" | "month"

export interface BcFillSeriesSourceCell {
  position: BcCellPosition
  rowIndex: number
  columnIndex: number
  value: unknown
}

export interface BcFillSeriesTargetCell {
  position: BcCellPosition
  rowIndex: number
  columnIndex: number
}

export type BcFillSeriesResolver = (
  sourceCells: readonly BcFillSeriesSourceCell[],
  fillCells: readonly BcFillSeriesTargetCell[],
) => readonly unknown[]

export type BcFillSeries = BcFillSeriesPreset | BcFillSeriesResolver

export type BcReactGridColumn<TRow, TValue = unknown> = Omit<
  BcCoreGridColumn<TRow, TValue>,
  "header"
> & {
  header: string | ReactNode
  /**
   * Optional nested child columns for multi-row grouped headers. Group
   * parents are header-only; sorting, filtering, resizing, reordering,
   * pinning, editing, and aggregation apply to visible leaf columns.
   */
  children?: readonly BcReactGridColumn<TRow>[]
  cellRenderer?: (params: BcCellRendererParams<TRow, TValue>) => ReactNode
  cellClassName?: string | ((params: BcCellRendererParams<TRow, TValue>) => string | undefined)
  cellStyle?:
    | CSSProperties
    | ((params: BcCellRendererParams<TRow, TValue>) => CSSProperties | undefined)
  /**
   * Spreadsheet fill-handle series hint for this column. Omit for automatic
   * detection, `"literal"` to force copy semantics, or provide a resolver
   * that maps the selected source cells to the projected fill cells.
   */
  fillSeries?: BcFillSeries
  /**
   * Opt this column out of the built-in header menu while leaving the grid
   * level `showColumnMenu` setting enabled for other columns.
   */
  columnMenu?: boolean
  /**
   * Cell editor for this column. Accepts either:
   *   - `BcCellEditor<TRow, TValue>` — row-aware editor (consumer-supplied,
   *     reads `props.row` for typed access to other columns of the same row)
   *   - `BcCellEditor<unknown, TValue>` — row-agnostic editor (the built-in
   *     `textEditor` / `numberEditor` / `selectEditor` / etc., which only
   *     consume `props.initialValue` and don't introspect the row shape)
   *
   * The second arm exists because TypeScript's strict variance treats
   * `BcCellEditor<unknown>` as not assignable to `BcCellEditor<CustomerRow>`
   * (the React component prop position is contravariant). Built-in editors
   * are intentionally row-agnostic; declaring them with `<unknown>` and
   * accepting that arm here means consumers can drop them straight into
   * typed columns without a cast at every column site. Surfaced 2026-05-03
   * by bsncraft v0.5 alpha.1 consumer editing-pass review.
   */
  cellEditor?: BcCellEditor<TRow, TValue> | BcCellEditor<unknown, TValue>
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

export type BcContextMenuBuiltinItem =
  | "copy"
  | "copy-cell"
  | "copy-row"
  | "copy-with-headers"
  | "clear-selection"
  | "clear-range"
  | "clear-all-filters"
  | "clear-column-filter"
  | "pin-column-left"
  | "pin-column-right"
  | "unpin-column"
  | "hide-column"
  | "show-all-columns"
  | "autosize-column"
  | "autosize-all-columns"
  | "separator"

export interface BcContextMenuCustomItem<TRow = unknown> {
  kind?: "item"
  id: string
  label: string
  onSelect: (ctx: BcContextMenuContext<TRow>) => void
  disabled?: boolean | ((ctx: BcContextMenuContext<TRow>) => boolean)
  /**
   * Visual treatment hint. Matches shadcn DropdownMenu's
   * `data-[variant=destructive]` convention: when set to
   * `"destructive"`, the renderer emits `data-variant="destructive"`
   * on the row and the bundled theme paints text with the
   * `--bc-grid-invalid` token plus a 12 %-opacity destructive hover
   * background. Use sparingly — destructive items should describe
   * irreversible actions like "Delete row" or "Discard changes".
   */
  variant?: "default" | "destructive"
}

export interface BcContextMenuToggleItem<TRow = unknown> {
  kind: "toggle"
  id: string
  label: string
  selection?: "checkbox" | "radio"
  checked: boolean | ((ctx: BcContextMenuContext<TRow>) => boolean)
  onToggle: (ctx: BcContextMenuContext<TRow>, next: boolean) => void
  disabled?: boolean | ((ctx: BcContextMenuContext<TRow>) => boolean)
}

export interface BcContextMenuSubmenuItem<TRow = unknown> {
  kind: "submenu"
  id: string
  label: string
  items:
    | readonly (BcContextMenuItem<TRow> | false | null | undefined)[]
    | ((
        ctx: BcContextMenuContext<TRow>,
      ) => readonly (BcContextMenuItem<TRow> | false | null | undefined)[])
  disabled?: boolean | ((ctx: BcContextMenuContext<TRow>) => boolean)
}

export type BcContextMenuItem<TRow = unknown> =
  | BcContextMenuBuiltinItem
  | BcContextMenuCustomItem<TRow>
  | BcContextMenuToggleItem<TRow>
  | BcContextMenuSubmenuItem<TRow>

export interface BcContextMenuContext<TRow = unknown> {
  cell: BcCellPosition | null
  columnId?: ColumnId | undefined
  row: TRow | null
  rowId?: RowId | undefined
  rowIndex?: number | undefined
  column: BcReactGridColumn<TRow> | null
  selection: BcSelection
  api: BcGridApi<TRow>
}

export type BcContextMenuItems<TRow = unknown> =
  | readonly (BcContextMenuItem<TRow> | false | null | undefined)[]
  | ((
      ctx: BcContextMenuContext<TRow>,
    ) => readonly (BcContextMenuItem<TRow> | false | null | undefined)[])

export interface BcDetailPanelParams<TRow> {
  row: TRow
  rowId: RowId
  rowIndex: number
}

export interface BcGridRowParams<TRow> {
  row: TRow
  rowId: RowId
  rowIndex: number
  selected: boolean
  focused: boolean
  disabled: boolean
}

export type BcSidebarBuiltInPanel = "columns" | "filters" | "pivot"

export type BcSidebarPanel<TRow = unknown> = BcSidebarBuiltInPanel | BcSidebarCustomPanel<TRow>

export interface BcSidebarCustomPanel<TRow = unknown> {
  id: string
  label: string
  icon: ComponentType<{ className?: string }>
  render: (ctx: BcSidebarContext<TRow>) => ReactNode
}

export interface BcSidebarContext<TRow = unknown> {
  api: BcGridApi<TRow>
  columns: readonly BcReactGridColumn<TRow>[]
  columnState: readonly BcColumnStateEntry[]
  setColumnState: (state: readonly BcColumnStateEntry[]) => void
  filterState: BcGridFilter | null
  setFilterState: (state: BcGridFilter | null) => void
  groupBy: readonly ColumnId[]
  setGroupBy: (state: readonly ColumnId[]) => void
  pivotState: BcPivotState
  setPivotState: (state: BcPivotState) => void
  groupableColumns: readonly { columnId: ColumnId; header: string }[]
  columnFilterText: Readonly<Record<ColumnId, string>>
  setColumnFilterText: (columnId: ColumnId, value: string) => void
  clearColumnFilterText: (columnId?: ColumnId) => void
  getSetFilterOptions?: (columnId: ColumnId) => readonly SetFilterOption[]
  loadSetFilterOptions?: (
    params: Omit<SetFilterOptionLoadParams, "filterWithoutSelf">,
  ) => Promise<SetFilterOptionLoadResult>
  messages: BcGridMessages
  /**
   * Legacy placeholder retained for custom panels created before the pivot
   * state API. New code should use `pivotState` / `setPivotState`.
   */
  pivot?: unknown
}

export interface BcRangeSelectionOptions {
  /**
   * Allow multiple disjoint ranges. The current interaction layer only
   * renders the active range; the option is reserved for the range RFC's
   * multi-range path.
   */
  multiRange?: boolean
  /**
   * Show the active-range fill handle. Defaults to true when range
   * selection is otherwise active.
   */
  fillHandle?: boolean
  /**
   * Cap future pointer-created range selections. Keyboard-created ranges
   * already clamp to the current row/column model.
   */
  maxCellCount?: number
  /**
   * Future pointer-range option: when true, pointer range selection will
   * not also update row selection.
   */
  preventRowSelection?: boolean
}

/**
 * Group-row metadata for `BcGridProps.serverRowEntryOverrides`. Internal
 * shape used by `<BcServerGrid rowModel="tree">` to pass server-supplied
 * group rows through to `<BcGrid>`'s render pipeline without losing the
 * `kind: "group"` discriminator + `level` / `label` / `childCount` data.
 * Mirrors `GroupRowEntry` from `gridInternals.ts` (excluding the `index`
 * field — `<BcGrid>` re-stamps that during entry construction so DOM
 * order stays contiguous after expansion-state changes).
 */
export interface ServerRowEntryOverride {
  kind: "group"
  level: number
  label: string
  childCount: number
  childRowIds: readonly RowId[]
  expanded: boolean
}

export interface BcGridProps<TRow> extends BcGridIdentity, BcGridStateProps {
  data: readonly TRow[]
  columns: readonly BcReactGridColumn<TRow>[]
  rowId: BcRowId<TRow>

  /**
   * Opt-in client-side tree row model. When supplied, the grid builds
   * a parent → children adjacency from `data` via `getRowParentId`
   * and renders rows with hierarchical indentation per the
   * `expansion` controlled state. Independent of `<BcServerGrid
   * rowModel="tree">` (which fetches children lazily). Per
   * `docs/design/client-tree-rowmodel-rfc.md`.
   *
   * Implementation status: pure helpers + types ship in
   * v06-client-tree-rowmodel-phase-1; full `<BcGrid>` integration
   * (outline column rendering, sort + filter through the tree,
   * aggregations on parent rows) follows in phase 2. Setting
   * `treeData` before phase 2 lands has no rendering effect.
   */
  treeData?: BcClientTreeData<TRow>

  /**
   * Internal escape hatch for `<BcServerGrid rowModel="tree">` to
   * pass pre-built group-row entries through to the render pipeline.
   * In server-tree mode the response carries `kind: "group"` rows
   * with `groupKey` / `level` / `childCount` metadata; the React
   * adapter strips that metadata when mapping `flatNodes` to the
   * flat `data` array. This map preserves the metadata keyed by
   * rowId — when a row's id is in this map, `<BcGrid>` builds a
   * `GroupRowEntry` for it (in manual row processing mode) instead
   * of a `DataRowEntry`. Surfaced 2026-05-04 by bsncraft v0.6.0-
   * alpha.1 — server-tree group rows rendered as empty data rows
   * because the render loop only saw `kind: "data"`.
   *
   * Internal — not part of the consumer-facing API. `<BcServerGrid>`
   * sets this from its tree-mode `flatNodes` array; consumers should
   * not pass this directly. Will move to a `__internal` namespace
   * in v0.7 once the broader tree-render contract is reviewed.
   */
  serverRowEntryOverrides?: ReadonlyMap<RowId, ServerRowEntryOverride>

  density?: BcGridDensity
  height?: "auto" | number
  /**
   * Convenience layout policy for host apps that do not want to duplicate
   * grid-height math.
   *
   * - `"content"` — page-flow mode, equivalent to `height="auto"`.
   * - `"viewport"` — fixed height from the grid's top edge to the viewport
   *   bottom, with the body owning vertical scroll.
   * - `"auto"` — page-flow while content fits, viewport-fit once content
   *   would exceed the available viewport height.
   *
   * Explicit `height` wins when both are supplied.
   */
  fit?: "content" | "viewport" | "auto"
  rowHeight?: number

  pagination?: boolean
  pageSizeOptions?: number[]
  /**
   * Source of truth for the pager's page count + slicing.
   *
   * - `"client"` (default) — `data` carries the full row set; the grid
   *   slices the current page from `data.length` rows. Sorting,
   *   filtering, search, and grouping all run client-side over `data`.
   * - `"manual"` — `data` carries **only the rows for the current
   *   page** (typically driven by a server-paged source). The grid
   *   sources `pageCount` / `totalRows` from `paginationTotalRows`,
   *   does NOT slice `data` again, and surfaces page changes through
   *   `onPaginationChange` so the host can call its loader. Pair with
   *   controlled `page` / `pageSize`. `aria-rowcount` reflects the
   *   server total when manual + `paginationTotalRows` is finite.
   *
   * Default is `"client"` so existing consumers of `<BcGrid>` are
   * unaffected.
   */
  paginationMode?: "client" | "manual"
  /**
   * Total dataset row count when `paginationMode === "manual"`. Required
   * for the manual pager to render `pageCount` and "Rows X-Y of Z".
   * Ignored in `"client"` mode (the grid uses `data.length`). When
   * `BcServerGrid` is wrapping `<BcGrid>` in paged rowModel, the server
   * total comes from `ServerPagedResult.totalRows`.
   */
  paginationTotalRows?: number
  /**
   * Controls whether `<BcGrid>` applies client-side row transforms
   * (sort, filter, search, grouping) and row-motion animations to
   * `data`.
   *
   * - `"client"` (default) — `data` is the full client row set; the
   *   grid sorts, filters, searches, and groups it before render and
   *   plays row FLIP/enter animations on layout change.
   * - `"manual"` — the host (typically `<BcServerGrid>`) owns row
   *   order and membership. The grid renders `data` in the order
   *   provided and skips the four client transforms. Header sort
   *   indicators, filter editors, search highlighting, grouping
   *   controls, callbacks, and `BcGridApi` state continue to reflect
   *   the controlled chrome props so the visible chrome stays in
   *   sync with the host's pending server query. Row FLIP/enter
   *   animations are also disabled because server responses can
   *   replace row identity/order in ways that break row-motion
   *   assumptions.
   *
   * Independent of `paginationMode`: `"manual"` row processing only
   * affects row transforms; `paginationMode="manual"` only affects
   * client-side page slicing. Server-backed grids typically want
   * both.
   */
  rowProcessingMode?: "client" | "manual"
  aggregationScope?: BcAggregationScope
  /**
   * Placement for the aggregation totals row when at least one column
   * declares `aggregation`. Defaults to `"bottom"` to preserve the
   * existing footer-row behavior; use `"top"` or `"both"` for ERP
   * screens that need the grand total pinned near the header.
   */
  pinnedTotals?: "top" | "bottom" | "both"

  groupableColumns?: readonly { columnId: ColumnId; header: string }[]
  groupsExpandedByDefault?: boolean

  /**
   * When true, `<BcGrid>` handles Cmd/Ctrl+F while mounted and focuses the
   * host-owned global search input supplied via `searchInputRef`.
   */
  searchHotkey?: boolean
  searchInputRef?: RefObject<HTMLInputElement | null>

  /**
   * Initial JSON-safe layout snapshot to restore when the grid mounts.
   * Consumers own storage; the grid only applies the supplied state to the
   * existing controlled/uncontrolled state paths.
   */
  initialLayout?: BcGridLayoutState
  /**
   * External layout snapshot to apply after mount. Individual controlled
   * props (`sort`, `filter`, `columnState`, etc.) remain the source of truth
   * when supplied; in that case applying a layout invokes the matching
   * controlled callbacks.
   */
  layoutState?: BcGridLayoutState
  onLayoutStateChange?: (next: BcGridLayoutState, prev: BcGridLayoutState) => void

  /**
   * Context used by built-in filter predicates that intentionally stay
   * relative or user-scoped in their persisted `BcGridFilter` payloads:
   * relative dates (`today`, `last-n-days`), fiscal periods, and
   * current-user/team predicates. Server grids should pass the same
   * structured filter payload to the endpoint; this context is only for
   * client-side row matching.
   */
  filterPredicateContext?: BcFilterPredicateContext

  showInactive?: boolean
  onShowInactiveChange?: (next: boolean) => void
  rowIsInactive?: (row: TRow) => boolean
  rowIsDisabled?: (row: TRow) => boolean

  toolbar?: ReactNode
  /**
   * Consumer-owned action slot rendered as a grid-supplied bulk-actions
   * bar whenever one or more rows are selected. The grid owns the bar,
   * selected-count label, and clear-selection button; the slot supplies
   * domain actions such as "Mark paid", "Move to folder", or "Delete".
   */
  bulkActions?: ReactNode | ((ctx: BcBulkActionsContext<TRow>) => ReactNode)
  /**
   * Optional renderer for the transient undo toast shown after a bulk
   * action calls `ctx.showUndo(...)`. Omit to use the built-in label +
   * Undo + dismiss controls.
   */
  bulkActionUndoSlot?: ReactNode | ((ctx: BcBulkActionUndoContext<TRow>) => ReactNode)
  /**
   * Auto-dismiss delay for the bulk-action undo toast. Defaults to 5000.
   * Pass `0` to keep the toast visible until Undo or dismiss is clicked.
   */
  bulkActionUndoTimeoutMs?: number
  footer?: ReactNode
  /**
   * Footer status bar segments rendered below the body, above any
   * `footer` slot. Built-in segment IDs (`total`, `filtered`,
   * `activeFilters`, `selected`, `aggregations`) opt in to the
   * standard renderers; `BcStatusBarCustomSegment` objects render
   * consumer-supplied content. Per `chrome-rfc §Status bar`.
   */
  statusBar?: readonly BcStatusBarSegment<TRow>[]
  /**
   * Render a compact active-filter chip strip in the status-bar region
   * whenever column filters are active. Defaults to `"status-bar"` so
   * restored/shared ERP views expose their active filters even when the
   * Filters sidebar is closed. Set `"off"` to keep the status bar fully
   * consumer-owned.
   */
  activeFilterSummary?: "status-bar" | "off"
  sidebar?: readonly BcSidebarPanel<TRow>[]
  defaultSidebarPanel?: string | null
  sidebarPanel?: string | null
  onSidebarPanelChange?: (next: string | null, prev: string | null) => void
  sidebarWidth?: number
  contextMenuItems?: BcContextMenuItems<TRow>
  /**
   * Draft v0.5 user-preference store for context-menu driven chrome
   * toggles. TODO(vanilla-rfc): coordinator owns final field names and
   * debounce/composition semantics when the RFC is ratified.
   */
  userSettings?: BcUserSettingsStore

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

  /**
   * Conditional row className. Applied to data rows only (not group
   * rows or detail panels). Function form receives the row's render
   * context and returns a class name string (or `undefined` to skip).
   * Composes with the framework's built-in row classes via
   * `classNames(...)` — your class wins on collisions.
   *
   * Common pattern: tint overdue rows red, archived rows muted, etc.
   * Surfaced 2026-05-03 by bsncraft consumer feedback.
   */
  rowClassName?: string | ((params: BcGridRowParams<TRow>) => string | undefined)

  /**
   * Conditional row inline style. Applied to data rows only. Composes
   * with the framework's dimensional `top` / `height` / `width` row
   * styling — your fields override on collision via spread order.
   * Function form receives the row's render context.
   */
  rowStyle?: CSSProperties | ((params: BcGridRowParams<TRow>) => CSSProperties | undefined)

  onRowClick?: (row: TRow, event: MouseEvent) => void
  onRowDoubleClick?: (row: TRow, event: MouseEvent) => void

  /**
   * Fires on every `dragover` over a row while a row drag is in
   * flight. Return a `BcRowDropAction` to tell the grid where the
   * drop will land relative to the hovered row — `"before"`,
   * `"after"`, `"into"`, or `"none"` to reject. The grid surfaces
   * the live position via `data-bc-grid-row-drop="<position>"` on
   * the hovered row so consumers can paint indicators in their
   * theme (top/bottom border for before/after, row highlight for
   * into).
   *
   * Returning `"none"` (or omitting the handler) prevents drop on
   * this row. Defaults to `"none"` when only `onRowDrop` is wired
   * without `onRowDragOver` — consumers must opt into the position
   * UX by returning a non-none action.
   *
   * `event.sourceRowIds` carries every dragged row id (multi-row
   * drag — the grid drags the full selection together if the drag
   * origin was inside the selection). v0.6 §1 row-drag-drop-hooks
   * (two-spike-confirmed: doc-mgmt #1 + production-estimating #5).
   */
  onRowDragOver?: BcRowDragOverHandler<TRow>
  /**
   * Fires on `drop` after `onRowDragOver` last returned a non-`"none"`
   * action. Consumer reorders rows / re-parents the source rows /
   * updates whatever consumer-owned state ranks the data; the grid
   * does not mutate `data` on its own.
   *
   * `event.sourceRowIds` is the dragged set; `event.position` is
   * the last position returned by `onRowDragOver` (so a tree drop
   * onto a folder fires with `position: "into"`).
   *
   * v0.6 §1 row-drag-drop-hooks.
   */
  onRowDrop?: BcRowDropHandler<TRow>
  /**
   * Fires on `dragstart`, before any `dragover` events. Useful for
   * snapshotting consumer state, custom drag images, or telemetry.
   * The grid sets `dataTransfer.effectAllowed = "move"` and writes
   * the source rowIds into `dataTransfer` automatically; consumers
   * customising the drag preview can call `event.dataTransfer.setDragImage`
   * here.
   *
   * v0.6 §1 row-drag-drop-hooks.
   */
  onRowDragStart?: (
    row: TRow,
    sourceRowIds: readonly RowId[],
    event: ReactDragEvent<HTMLElement>,
  ) => void
  onCellFocus?: (position: BcCellPosition) => void
  /**
   * Fires after the editing overlay commits a cell value. Client grids can
   * mirror the value into their own state; server grids can convert the event
   * into a `ServerRowPatch` and settle it after persistence completes.
   *
   * Returning `Promise<BcCellEditCommitResult<TRow>>` opts the cell into
   * the same optimistic / rollback / overlay lifecycle `<BcServerGrid>`
   * already runs through `onServerRowMutation` — `{ status: "rejected",
   * reason }` rolls back the overlay and surfaces `reason` as the cell
   * error; `{ status: "accepted", row? }` keeps the overlay and (when
   * `row` is provided) re-extracts the cell's overlay value from the
   * server-confirmed row. Returning `void | Promise<void>` keeps
   * fire-and-forget behaviour unchanged.
   */
  onCellEditCommit?: BcCellEditCommitHandler<TRow>
  onVisibleRowRangeChange?: (range: { startIndex: number; endIndex: number }) => void

  /**
   * Restore the viewport's scroll position once at mount. Mirrors the
   * `initialLayout` pattern — the prop is read on first render only;
   * subsequent updates are ignored. Pair with `onScrollChange` (and
   * `apiRef.current?.getScrollOffset()`) to persist + restore the
   * exact pixel position the user left the grid at.
   *
   * v0.6.0-alpha.1 critical (maintainer ask 2026-05-03): "would it be
   * possible for a consumer to maintain the state of bc-grid, such as
   * where it is scrolled at, and what child panels are open, so when
   * they click back onto a page containing a bc-grid, it looks exactly
   * the same as when navigating away?" Per
   * `docs/recipes/grid-state-persistence.md` for the full state-restore
   * pattern.
   */
  initialScrollOffset?: { top: number; left: number }
  /**
   * Fires when the user scrolls. Debounced ~120ms so the consumer can
   * persist without firing on every scroll tick. Receives the current
   * `{ top, left }` pixel position.
   *
   * Pair with `initialScrollOffset` to round-trip scroll position
   * across mounts. Per `docs/recipes/grid-state-persistence.md`.
   */
  onScrollChange?: (next: { top: number; left: number }) => void
  /**
   * Behaviour flags for range-selection affordances. Existing keyboard
   * range selection remains available by default; set
   * `rangeSelectionOptions={false}` or `{ fillHandle: false }` to hide
   * the spreadsheet-style fill handle.
   */
  rangeSelectionOptions?: boolean | BcRangeSelectionOptions
  onBeforeCopy?: BcRangeBeforeCopyHook<TRow>
  onCopy?: BcRangeCopyHook

  apiRef?: RefObject<BcGridApi<TRow> | null>

  locale?: string
  messages?: Partial<BcGridMessages>
  urlStatePersistence?: BcGridUrlStatePersistence

  loading?: boolean
  loadingOverlay?: ReactNode
  /**
   * Render slot for an error state. When set AND `loading` is false,
   * the grid renders this in place of the no-rows / loading overlay
   * so consumers can surface a "failed to load + retry" UI without
   * fighting the overlay precedence. `<BcServerGrid>` populates this
   * automatically from `props.renderServerError` (or a minimal default
   * "Failed to load. Retry" fallback) when the active mode's loader
   * rejects. Worker1 v0.6 server-grid error boundary.
   */
  errorOverlay?: ReactNode

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
   * Override the inline filter row's visibility independent of the
   * per-column filter configuration. Lets host apps wire a "filter
   * toggle" button without touching column definitions.
   *
   * - `undefined` (default) — column-driven: the row renders when at
   *   least one column has an inline-variant filter configured. Same
   *   behavior consumers see today.
   * - `true` — force the row visible. Columns with `filter: false` or
   *   `variant: "popup"` still render empty filter cells in the row.
   * - `false` — force the row hidden. Active filter state is **preserved**
   *   (the underlying `columnFilterText` map is unaffected); only the
   *   editor row is suppressed. Popup-variant filter funnels stay
   *   reachable from each column header.
   */
  showFilterRow?: boolean

  /**
   * Compatibility alias for host apps that migrated from an earlier
   * wrapper-level "show filters" toggle. Prefer `showFilterRow` for new
   * code; when both are supplied, `showFilterRow` wins.
   */
  showFilters?: boolean

  /**
   * Controls the built-in header column menu button and header
   * right-click menu. Defaults to true.
   */
  showColumnMenu?: boolean

  /**
   * Controls the built-in pagination footer chrome
   * (`<BcGridPagination>`). Default `undefined` — chrome shows
   * automatically when pagination is enabled. Set to `false` to hide
   * the pager UI without disabling pagination semantics: page-window
   * slicing, `paginationMode`, `aria-rowcount`, and the
   * `onPaginationChange` callback all continue to work. Useful for
   * vanilla / chromeless layouts and for the future right-click
   * `View → Show pagination` toggle (vanilla-and-context-menu RFC
   * §4 and §3 default-off proposal).
   *
   * Mirrors `showFilterRow` / `showColumnMenu` shape so consumer
   * code reads consistently across visibility toggles.
   */
  showPagination?: boolean

  /**
   * Flash the cell briefly when an edit commits, per
   * `editing-rfc §Edit-cell paint perf`. Off by default. Uses the
   * `flash` primitive from `@bc-grid/animations`, which already
   * respects `prefers-reduced-motion`.
   */
  flashOnEdit?: boolean

  /**
   * Grid-level editing master switch. When `false`, every editor
   * activation path is suppressed regardless of `column.editable`:
   * keyboard (F2 / Enter / printable / Backspace / Delete), pointer
   * (double-click), and the `apiRef.startEdit` programmatic path.
   * Validation, server commit, and the editing controller remain
   * available so that paste-in-flight or pending-mutation rollback
   * paths still settle.
   *
   * Defaults to `true` (current behaviour). Forward-compatible with
   * the v0.5 vanilla-and-context-menu RFC's "Edit mode" toggle —
   * the right-click menu will read / write this prop through the
   * `BcUserSettings` persistence layer once that ratifies.
   */
  editingEnabled?: boolean

  /**
   * Show the visible inline validation popover (introduced in #356)
   * under the editor input on validation rejection. When `false`,
   * the popover is suppressed; the AT contract (assertive live
   * region announce + `aria-invalid` on the input) is unchanged so
   * screen-reader users still get the rejection signal.
   *
   * Defaults to `true`. Forward-compatible with the RFC's View →
   * "Show validation messages" toggle.
   */
  showValidationMessages?: boolean

  /**
   * Render a small dim caption at the bottom of the editor portal
   * showing the keyboard contract — `F2 / Enter / Esc / Tab` — for
   * users learning the bc-grid edit model. Off by default; turning
   * on adds ~20px of vertical chrome inside the portal. Forward-
   * compatible with the RFC's Editor → "Show keyboard hints"
   * toggle.
   */
  showEditorKeyboardHints?: boolean

  /**
   * Pointer-driven editor activation mode. Keyboard activation
   * (`F2` / `Enter` / printable / `Backspace` / `Delete`) is
   * unaffected — this prop controls only mouse-driven entry.
   *
   *   - `"double-click"` (default) — today's behaviour; double-click
   *     on an editable cell opens the editor. Mirrors the AG-Grid
   *     default and is the right call for table-of-data screens
   *     where accidental clicks shouldn't enter edit.
   *   - `"single-click"` — single-click activates edit on editable
   *     cells. The common pattern for forms-style ERP screens.
   *   - `"f2-only"` — pointer never activates edit; keyboard only.
   *     Right for read-mostly grids where the rare edit is
   *     deliberately keyboard-driven.
   */
  editorActivation?: "f2-only" | "single-click" | "double-click"

  /**
   * Click-outside semantics for the active editor.
   *
   *   - `"commit"` (default) — clicking outside commits via the same
   *     path as Tab / Enter (validate + onCellEditCommit).
   *   - `"reject"` — clicking outside cancels the edit (mirrors Esc).
   *   - `"ignore"` — clicking outside neither commits nor cancels;
   *     editor stays open until explicit Tab/Enter or Escape.
   */
  editorBlurAction?: "commit" | "reject" | "ignore"

  /**
   * When `true`, Escape inside the active editor cancels the active
   * edit AND calls `editController.discardRowEdits(rowId)` — rolling
   * back every uncommitted overlay patch on the row including cells
   * edited via prior Tab progressions. `<BcEditGrid>` overrides this
   * default to `true` since its action column already exposes the
   * row-discard surface; the keyboard shortcut completes the symmetry.
   * Audit P1-W3-3 follow-up to #381.
   */
  escDiscardsRow?: boolean

  /**
   * Tab/Shift+Tab edge-handling mode for in-cell editors. v0.6
   * follow-up to #431 (`v06-editor-tab-wraparound-polish`).
   *
   *   - `"none"`: clamp at the trailing/leading edge — Tab past
   *     the last editable cell stays put.
   *   - `"row-wrap"` (default): wrap from the trailing edge to
   *     `(0, 0)` and from the leading edge to `(lastRow, lastCol)`.
   *     Matches Excel + Google Sheets default; bsncraft requested
   *     this as the spreadsheet-native behaviour.
   *   - `"selection-wrap"`: when an explicit selection of ≥2 rows
   *     is active AND the editing row is part of it, restrict Tab/
   *     Shift+Tab traversal to selected rows only and wrap within
   *     the selection. The "data-entry across the selected rows"
   *     pattern. Falls through to `"row-wrap"` when the gating
   *     conditions aren't met (editing outside selection, or
   *     selection size <2).
   */
  editorTabWraparound?: EditorTabWraparound

  /**
   * What happens to an in-flight in-cell edit when the editing row
   * scrolls out of the virtualizer's render window. Only applies to
   * editors mounted in-cell (`editor.popup !== true`). Popup editors
   * are unaffected by row scroll-out — their DOM lives in the editor-
   * portal sibling and is held alive by the virtualizer's retention
   * contract regardless.
   *
   *   - `"commit"` (default): read the editor's current value, commit
   *     it. Matches AG Grid's behaviour and the user's mental model
   *     ("I scrolled away, my edit is done"). Validation runs as on
   *     any other commit; rejection is announced via the assertive
   *     live region.
   *   - `"cancel"`: discard the pending value, return the cell to its
   *     previous overlay or data value. Useful for grids where partial
   *     edits are dangerous (financial entry, etc.).
   *   - `"preserve"`: deferred to v0.7. Currently behaves as
   *     `"commit"`; the RFC reserves the name for an auto-promote-
   *     to-popup-mid-edit follow-up.
   *
   * Per `in-cell-editor-mode-rfc.md` §5.
   */
  editScrollOutAction?: "commit" | "cancel" | "preserve"
}

/**
 * Actions-column prop set shared by `<BcEditGrid>` and `<BcServerGrid>`.
 * When any of these handlers is set (and `hideActions !== true`), the
 * grid auto-injects the pinned-right `__bc_actions` column. Lifted out
 * of `BcEditGridProps` 2026-05-03 so server grids can present the
 * same row-action affordances without forcing consumers to hand-roll
 * the column. Per `v06-server-grid-actions-column` (bsncraft P1).
 *
 * The typical wiring for `onDiscardRowEdits` is `(rowId) =>
 * apiRef.current?.discardRowEdits(rowId)` which routes the rollback
 * through `editController.discardRowEdits` — pending and errored
 * cells are preserved per `editing-rfc §Concurrency`. Omit to skip
 * the Discard action entirely.
 */
export interface BcActionsColumnProps<TRow> {
  onEdit?: ((row: TRow) => void) | undefined
  onDelete?: ((row: TRow) => void) | undefined
  canEdit?: ((row: TRow) => boolean) | undefined
  canDelete?: ((row: TRow) => boolean) | undefined
  /**
   * Multi-cell row rollback handler — surfaced as a "Discard" action
   * in the action column **only when the row is dirty** (any cell has
   * uncommitted edits). Audit P1-W3-3.
   */
  onDiscardRowEdits?: ((rowId: RowId, row: TRow) => void) | undefined
  extraActions?: BcEditGridAction<TRow>[] | ((row: TRow) => BcEditGridAction<TRow>[]) | undefined
  hideActions?: boolean | undefined
  editLabel?: string | undefined
  deleteLabel?: string | undefined
  /** Discard-action label. Defaults to "Discard". */
  discardLabel?: string | undefined
}

export interface BcEditGridProps<TRow> extends BcGridProps<TRow>, BcActionsColumnProps<TRow> {
  detailPath?: string
  linkField?: keyof TRow & string

  onInsertRow?: (params: BcEditGridInsertRowParams<TRow>) => void
  onDuplicateRow?: (params: BcEditGridRowActionParams<TRow>) => void
  confirmDelete?: (params: BcEditGridRowActionParams<TRow>) => boolean | Promise<boolean>

  DeleteIcon?: ComponentType<{ className?: string }>
}

export interface BcEditGridRowActionParams<TRow> {
  row: TRow
  rowId: RowId
  rowIndex: number
}

export interface BcEditGridInsertRowParams<TRow> extends BcEditGridRowActionParams<TRow> {
  at: number
  placement: "above" | "below"
}

export interface BcEditGridAction<TRow> {
  label: string
  onSelect: (row: TRow) => void
  icon?: ComponentType<{ className?: string }>
  destructive?: boolean
  disabled?: boolean | ((row: TRow) => boolean)
}

export interface BcServerEditMutationEvent<TRow> extends BcCellEditCommitEvent<TRow> {
  patch: ServerRowPatch
}

export type BcServerEditMutationHandler<TRow> = (
  event: BcServerEditMutationEvent<TRow>,
) => ServerMutationResult<TRow> | Promise<ServerMutationResult<TRow>>

export type BcServerEditPatchFactory<TRow> = (
  event: BcCellEditCommitEvent<TRow>,
  defaultPatch: ServerRowPatch,
) => ServerRowPatch

export interface BcServerEditMutationProps<TRow> {
  /**
   * Server-backed edit commit adapter. When present, `<BcServerGrid>`
   * converts cell edits into `ServerRowPatch` values, queues the optimistic
   * server-row-model mutation, awaits this callback, settles the mutation, and
   * rejects the edit overlay for rejected/conflict results.
   *
   * **Rollback ≠ invalidate (worker1 audit P1 §11).** When this
   * handler resolves with `{ status: "rejected" }`, the grid restores
   * the affected row from the model's snapshot at queue time — it
   * does NOT refetch from the server. If the server has accepted
   * other changes for the same row during the rejected mutation's
   * lifetime (e.g. another user's commit landed via a separate
   * `invalidate` cycle), the rollback's snapshot may be stale
   * relative to the server's current state. Consumers who care about
   * post-rollback server-truth should call
   * `apiRef.current?.invalidateRowCache(rowId)` from their rejection
   * branch — the next fetch will refetch the canonical state.
   */
  onServerRowMutation?: BcServerEditMutationHandler<TRow>
  /**
   * Optional patch factory for adding base revisions or custom mutation IDs.
   * The default patch uses `{ [columnId]: nextValue }` and an internal
   * monotonic mutation ID.
   */
  createServerRowPatch?: BcServerEditPatchFactory<TRow>
}

/**
 * Single converged interface for `<BcServerGrid>` props per
 * `docs/design/server-mode-switch-rfc.md §6` stage 2 collapse. Every
 * mode-specific field is now optional at the type level; the runtime
 * contract is "the loader matching the active row-model mode is
 * required." A dev-only mount assertion in `<BcServerGrid>` fires a
 * `console.error` when the active mode's loader is missing.
 *
 * The legacy three interfaces (`BcServerPagedProps`,
 * `BcServerInfiniteProps`, `BcServerTreeProps`) remain exported as
 * **type aliases** that narrow `rowModel` to a literal and require
 * the matching loader, so existing consumers' explicit type
 * annotations keep type-checking. Stage 2 (this PR) is purely
 * additive at the consumer level — code that previously satisfied
 * `BcServerPagedProps<TRow>` still satisfies it.
 *
 * Stage 3 of the RFC enables runtime mode polymorphism: when
 * `rowModel` is omitted, the active mode is derived from the
 * controlled `groupBy` via `resolveActiveRowModelMode` (already
 * shipped in stage 1, currently dormant because `rowModel` is
 * effectively required by every consumer's loader pairing).
 */
export interface BcServerGridProps<TRow>
  extends Omit<BcGridProps<TRow>, "apiRef" | "data">,
    BcServerEditMutationProps<TRow>,
    BcActionsColumnProps<TRow> {
  /**
   * Active row-fetching strategy. Optional — when omitted, the grid
   * derives the mode from the controlled `groupBy` prop:
   *   - `groupBy.length === 0` → `"paged"`
   *   - `groupBy.length > 0`   → `"tree"`
   * Pass an explicit `rowModel` to override the heuristic (e.g.
   * force `"infinite"` while keeping `groupBy` empty, or force
   * `"paged"` with a server-grouped query that the server flattens).
   */
  rowModel?: ServerRowModelMode

  /** Required when the active mode is `"paged"`. */
  loadPage?: LoadServerPage<TRow>
  /**
   * Current server page size for paged mode. The server receives this
   * as `ServerPagedQuery.pageSize`; the grid renders only the
   * returned page rows and uses `ServerPagedResult.totalRows` for the
   * footer/page count.
   */
  pageSize?: number
  initialResult?: ServerPagedResult<TRow>

  /** Required when the active mode is `"infinite"`. */
  loadBlock?: LoadServerBlock<TRow>
  blockSize?: number
  maxCachedBlocks?: number
  blockLoadDebounceMs?: number
  maxConcurrentRequests?: number
  /**
   * Number of blocks to fetch ahead of the visible viewport on each
   * `onVisibleRowRangeChange`. Default 1; `0` disables prefetch.
   */
  prefetchAhead?: number

  /** Required when the active mode is `"tree"`. */
  loadChildren?: LoadServerTreeChildren<TRow>
  /**
   * Optional separate loader for root rows. Defaults to `loadChildren`
   * when omitted.
   */
  loadRoots?: LoadServerTreeChildren<TRow>
  /**
   * Children fetched per `loadChildren` / `loadRoots` request. Tree
   * mode default 100. Lower values reduce per-fetch payload at the
   * cost of more round-trips for groups with many children.
   */
  childCount?: number
  /**
   * Optional pre-seed for the chrome's known root child count for
   * tree mode. Reported as `rowCount` before the first
   * `loadChildren({ parentRowId: null })` resolves so scrollbar /
   * status-bar affordances render at the right size; replaced by the
   * actual count once the first fetch settles. Does not skip the
   * fetch.
   */
  initialRootChildCount?: number

  /**
   * View-change reset opt-out (worker1 audit P1 §1). When the
   * resolved viewKey changes (filter / sort / search / groupBy /
   * visibleColumns), `<BcServerGrid>` resets scroll-to-top by default
   * so users see the new query result from row 0 — matches the
   * NetSuite / Salesforce LWC datatable / Excel-table convention.
   * Set to `true` to preserve scroll position across view changes.
   */
  preserveScrollOnViewChange?: boolean
  /**
   * View-change reset opt-out for selection (worker1 audit P1 §1).
   * When the viewKey changes, `<BcServerGrid>` clears the row
   * selection by default so the prior view's selected rowIds don't
   * become "ghost selection" (rowIds that may not exist in the new
   * query result). Set to `true` to preserve selection across view
   * changes; consumers wanting per-view selection persistence should
   * mirror the selection into their own state keyed by viewKey.
   */
  preserveSelectionOnViewChange?: boolean
  /**
   * View-change reset opt-out for active cell focus (worker1 audit P1
   * §1). When the viewKey changes, `<BcServerGrid>` clears the active
   * cell by default so the prior view's focused cell (whose row may
   * not be in the new query result) doesn't strand. Set to `true` to
   * preserve focus across view changes.
   */
  preserveFocusOnViewChange?: boolean

  /**
   * Render slot for the most-recent failed-load error (worker1 v0.6
   * server-grid error boundary). When the active mode's loader (paged
   * `loadPage` / infinite `loadBlock` / tree `loadChildren`) rejects,
   * `<BcServerGrid>` calls this with the rejected error + a `retry`
   * thunk that re-fires the active fetch. The returned `ReactNode`
   * replaces the default loadingOverlay error string.
   *
   * When omitted, the grid renders a minimal "Failed to load. Retry"
   * fallback using `--bc-grid-edit-state-error-*` tokens for theme
   * consistency. Both paths surface `BcServerGridApi.getLastError()`
   * for consumers that want imperative access.
   */
  renderServerError?: (params: {
    error: unknown
    retry: () => void
  }) => ReactNode

  apiRef?: RefObject<BcServerGridApi<TRow> | null>
}

/**
 * Legacy paged-mode interface kept as a type alias of the converged
 * `BcServerGridProps`. Narrows `rowModel` to `"paged"` and makes
 * `loadPage` required so existing consumer code that explicitly
 * annotates against this type continues to type-check.
 */
export type BcServerPagedProps<TRow> = BcServerGridProps<TRow> & {
  rowModel: "paged"
  loadPage: LoadServerPage<TRow>
}

/**
 * Legacy infinite-mode interface kept as a type alias of the
 * converged `BcServerGridProps`. Narrows `rowModel` to `"infinite"`
 * and makes `loadBlock` required.
 */
export type BcServerInfiniteProps<TRow> = BcServerGridProps<TRow> & {
  rowModel: "infinite"
  loadBlock: LoadServerBlock<TRow>
}

/**
 * Legacy tree-mode interface kept as a type alias of the converged
 * `BcServerGridProps`. Narrows `rowModel` to `"tree"` and makes
 * `loadChildren` required.
 */
export type BcServerTreeProps<TRow> = BcServerGridProps<TRow> & {
  rowModel: "tree"
  loadChildren: LoadServerTreeChildren<TRow>
}

export interface BcCellEditor<TRow, TValue = unknown> {
  Component: ComponentType<BcCellEditorProps<TRow, TValue>>
  prepare?: (params: BcCellEditorPrepareParams<TRow>) => Promise<unknown>
  kind?: string
  /**
   * Optional reader for the editor's current value. Called by the
   * framework's click-outside / Tab / Enter commit paths in place of
   * the built-in tag-dispatch fallback (`<input>` / `<select>` /
   * `<textarea>` / shadcn-Combobox `<button>`). Audit P1-W3-6.
   *
   * Custom editors that expose any other element via `focusRef`
   * (a `<div role="combobox">`, a popover-anchored editor that
   * focuses a child input not directly stamped with
   * `data-bc-grid-editor-input`, a typed wrapper that holds its
   * value in module-level state, etc.) should set this so commit
   * paths read the typed value instead of falling through to
   * `undefined`.
   *
   * Receives the element currently held by `focusRef.current`
   * (which the framework also uses for focus). Return the typed
   * value to commit; return `undefined` to defer to the tag-dispatch
   * fallback. Pure — no side effects expected.
   */
  getValue?: (focusEl: HTMLElement | null) => unknown
  /**
   * Mount the editor outside the cell's DOM, anchored by absolute
   * coordinates from the editor portal. Default `false` — the editor
   * renders inline inside the cell box (audit `in-cell-editor-mode-rfc`
   * §4). Set `true` for editors whose UI overflows the cell —
   * dropdowns, chip lists, async option panels.
   *
   * Hybrid editors that need an overflowing popover but a fitting
   * trigger (date / datetime pickers) should keep `popup: false` and
   * render the overlay via a Radix `Popover` anchored to the trigger;
   * stamp the overlay content with `data-bc-grid-editor-portal` so the
   * framework's click-outside handler treats it as in-the-editor.
   *
   * Per `in-cell-editor-mode-rfc.md` §6.
   */
  popup?: boolean
}

export interface BcCellEditorPrepareParams<TRow> {
  row: TRow
  rowId: RowId
  columnId: ColumnId
  /**
   * Resolved column metadata. Lets `prepare` callbacks branch on
   * column-level configuration (e.g. read `column.options` for
   * synchronous lookups, or invoke `column.fetchOptions` to preload
   * the first page of an async lookup so the dropdown paints with
   * options on first frame). Audit P1-W3-2.
   *
   * Pre-existing `prepare` consumers that didn't read `column` see
   * no behaviour change — this is an additive surface widening.
   */
  column: BcReactGridColumn<TRow>
}

/**
 * Active-cell move directive applied after the editor unmounts. Mirrors
 * the keyboard model in `editing-rfc §Keyboard model in edit mode`:
 *   - `down` / `up`: advance one row, clamped at extents
 *   - `right`: next column; at last column wraps to next row's first
 *   - `left`: previous column; at first column wraps to prior row's last
 *   - `stay`: no movement (used for click-outside, Esc-aware paths)
 *
 * Editors that internally parse to typed values can pass `moveOnSettle`
 * via `BcCellEditorProps.commit(value, { moveOnSettle })` to honour
 * the user's keystroke (Enter → "down", Tab → "right", etc.) while
 * bypassing the framework's wrapper key handler. Editors that defer
 * keystroke handling to the wrapper should call `commit(value)` and
 * let the wrapper choose the move directive — the default is "down".
 */
export type BcEditMove = "stay" | "down" | "up" | "right" | "left"

export interface BcCellEditorProps<TRow, TValue = unknown> {
  initialValue: TValue
  row: TRow
  rowId: RowId
  column: BcReactGridColumn<TRow, TValue>
  /**
   * Commit the candidate value. Optional `opts.moveOnSettle` overrides
   * the framework's default `"down"` next-active-cell directive — pass
   * `"right"` from a Tab handler, `"up"` from Shift+Enter, `"stay"`
   * from a click-outside, etc. Editors that internally parse to typed
   * values (number, date, select) own their own keypress interception
   * and should pass the resolved move directly; editors that defer to
   * the wrapper's onKeyDown should call `commit(value)` and let the
   * wrapper compute the move from the captured keystroke.
   *
   * Per `editing-rfc §editor-typed-commit` follow-up.
   */
  commit(newValue: TValue, opts?: { moveOnSettle?: BcEditMove }): void
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

  /**
   * Resolved column-level required-ness for this cell. Default editors
   * surface as `aria-required` on their input element. Audit P1-W3-7.
   *
   * The framework resolves `column.required` (boolean or row-fn)
   * before passing to the editor — custom editors don't need to read
   * the column themselves, just honor the prop.
   */
  required?: boolean

  /**
   * Resolved column-level read-only state. Today the framework only
   * mounts editors on cells where `column.editable` resolves to true,
   * so this is currently always `false` — the prop is part of the
   * contract for future "edit a cell with read-only sub-fields" use
   * cases (a date+time editor where the date is locked, etc.).
   * Default editors surface as `aria-readonly`. Audit P1-W3-7.
   */
  readOnly?: boolean

  /**
   * Resolved column-level disabled state. Mirrors `pending` today
   * (the framework computes this and forwards) but stays a separate
   * prop so editors can distinguish "the server is settling my
   * commit" (pending) from "this cell can't be edited right now"
   * (disabled). Default editors surface as `aria-disabled` on the
   * input element. Audit P1-W3-7.
   */
  disabled?: boolean
}

export interface BcCellEditCommitEvent<TRow, TValue = unknown> {
  rowId: RowId
  row: TRow
  columnId: ColumnId
  column: BcReactGridColumn<TRow, TValue>
  previousValue: TValue
  nextValue: TValue
  /**
   * How the commit was triggered. `"scroll-out"` (added in v0.6 with
   * the in-cell editor mode RFC) fires when the editing row scrolls
   * out of the virtualizer's render window AND the grid's
   * `editScrollOutAction === "commit"` (the default for in-cell
   * editors). `"undo"` / `"redo"` (v0.6 §1) fire when the user
   * presses Cmd/Ctrl+Z (or Cmd+Shift+Z / Ctrl+Y) on a focused row to
   * revert / re-apply the most recent commit on that row — see
   * `docs/recipes/editor-undo-redo.md`. Consumer telemetry can split
   * scroll-out / undo / redo commits from deliberate keyboard /
   * pointer commits via this discriminator.
   */
  source: "keyboard" | "pointer" | "api" | "paste" | "fill" | "scroll-out" | "undo" | "redo"
}

/**
 * Optional result-shaped resolution for `BcGridProps.onCellEditCommit`.
 * Returning `Promise<BcCellEditCommitResult<TRow>>` from the commit hook
 * opts the cell into the same optimistic / rollback / overlay lifecycle
 * `<BcServerGrid>` already runs through `onServerRowMutation` —
 * surfaced 2026-05-03 by the bsncraft v0.5 alpha.1 editing-pass review
 * (ERP child-CRUD grids that re-implement the optimistic dance for
 * every server-action commit).
 *
 * Returning `void | Promise<void>` keeps fire-and-forget behaviour
 * unchanged — this is purely an opt-in widening of the handler.
 *
 *   - `status: "rejected"`: the optimistic overlay rolls back; `reason`
 *     surfaces as the cell's `error` entry (the existing assertive
 *     announce + cell-level error styling).
 *   - `status: "accepted"`: the overlay stays. When `row` is provided,
 *     the cell's overlay value is replaced with the value extracted
 *     from `row` via `column.valueGetter` / `column.field` — useful when
 *     the server normalised the input ("1.5 " → 1.5), computed derived
 *     fields, or assigned a server-side id. Other cells on the row are
 *     not touched (each cell owns its own overlay; server-derived
 *     fields on different columns are the consumer's responsibility to
 *     mirror via the `data` prop).
 */
export interface BcCellEditCommitResult<TRow> {
  status: "accepted" | "rejected"
  reason?: string
  row?: TRow
}

/**
 * Public signature for `BcGridProps.onCellEditCommit`. The outer `void`
 * arm keeps sync `(event) => {}` consumers working. Async consumers
 * resolve with `undefined` (legacy fire-and-forget — `async () => {}`
 * which returns `Promise<void>` flows through transparently because the
 * grid only inspects the resolved value when it discriminates on the
 * `BcCellEditCommitResult` shape). The result-shape opt-in is the third
 * arm. Surfaced 2026-05-03 by the bsncraft v0.5 alpha.1 editing-pass
 * review.
 */
export type BcCellEditCommitHandler<TRow> = (
  event: BcCellEditCommitEvent<TRow>,
) => void | Promise<undefined | BcCellEditCommitResult<TRow>>

export type BcFilterDefinition<TValue = unknown> = BcEngineFilterDefinition<TValue>
export type BcFilterPredicateContext = BcEngineFilterPredicateContext
export type BcFilterUserContext = BcEngineFilterUserContext
export type BcFiscalCalendar = BcEngineFiscalCalendar

export interface BcReactFilterDefinition<TValue = unknown> extends BcFilterDefinition<TValue> {
  Editor?: ComponentType<BcFilterEditorProps<TValue>>
}

export interface BcFilterEditorProps<TValue = unknown> {
  value: TValue | null
  commit(next: TValue | null): void
  clear(): void
  column?: unknown
  locale?: string
}

export type {
  BcCellPosition,
  BcBuiltInColumnFilterType,
  BcColumnFilter,
  BcColumnFilterType,
  BcColumnFormat,
  BcColumnStateEntry,
  BcGridApi,
  BcGridFilter,
  BcGridPasteTsvCommit,
  BcGridPasteTsvFailure,
  BcGridPasteTsvFailureCode,
  BcGridPasteTsvOverflowMode,
  BcGridPasteTsvParams,
  BcGridPasteTsvParseDiagnostic,
  BcGridPasteTsvParseDiagnosticCode,
  BcGridPasteTsvResult,
  BcGridPasteTsvRowPatch,
  BcGridPasteTsvSkipReason,
  BcGridPasteTsvSkippedCell,
  BcGridPasteTsvSuccess,
  BcGridSort,
  BcGridStateProps,
  BcPaginationState,
  BcSelection,
  BcServerGridApi,
  BcValidationResult,
  ColumnId,
  SetFilterOption,
  SetFilterOptionLoadParams,
  SetFilterOptionLoadResult,
  SetFilterOptionProvider,
  LoadServerBlock,
  LoadServerPage,
  LoadServerTreeChildren,
  RowId,
  ServerBlockQuery,
  ServerBlockResult,
  ServerCacheDiagnostics,
  ServerLoadContext,
  ServerLoadDiagnostics,
  ServerLoadStatus,
  ServerMutationResult,
  ServerPagedQuery,
  ServerPagedResult,
  ServerQueryDiagnostics,
  ServerRowModelDiagnostics,
  ServerRowModelMode,
  ServerRowPatch,
  ServerRowUpdate,
  ServerTreeQuery,
  ServerTreeResult,
  ServerTreeRow,
  ServerViewDiagnostics,
}

export type { BcNormalisedRange, BcRange, BcRangeKeyAction, BcRangeSelection } from "@bc-grid/core"
export type { BcRowDropAction } from "./rowDragDrop"
export { BC_GRID_ROW_DRAG_MIME } from "./rowDragDrop"
export type { EditorTabWraparound } from "./editingStateMachine"
export type {
  BcRowPatch,
  BcRowPatchFailure,
  BcRowPatchFailureCode,
  BcRowPatchResult,
} from "@bc-grid/core"
