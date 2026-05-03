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
  ServerRowPatch,
  ServerRowUpdate,
  ServerTreeQuery,
  ServerTreeResult,
  ServerTreeRow,
  ServerViewDiagnostics,
} from "@bc-grid/core"
import type { CSSProperties, ComponentType, MouseEvent, ReactNode, RefObject } from "react"

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
  }
  density?: BcGridDensity
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
 * Status-bar segment shape per `chrome-rfc §Status bar`. Strings
 * resolve to built-ins; objects render the consumer-supplied node.
 * Built-ins: `total` always shown when listed; `filtered` shows only
 * when a filter is active; `activeFilters` shows removable filter
 * chips when any column filter is active; `selected` shows only when
 * selectionSize > 0; `aggregations` shows when results are non-empty.
 */
export type BcStatusBarSegment<TRow = unknown> =
  | "total"
  | "filtered"
  | "activeFilters"
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
  getSetFilterOptions?: (columnId: ColumnId) => readonly { value: string; label: string }[]
  messages: BcGridMessages
  /**
   * Legacy placeholder retained for custom panels created before the pivot
   * state API. New code should use `pivotState` / `setPivotState`.
   */
  pivot?: unknown
}

export interface BcGridProps<TRow> extends BcGridIdentity, BcGridStateProps {
  data: readonly TRow[]
  columns: readonly BcReactGridColumn<TRow>[]
  rowId: BcRowId<TRow>

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

  showInactive?: boolean
  onShowInactiveChange?: (next: boolean) => void
  rowIsInactive?: (row: TRow) => boolean
  rowIsDisabled?: (row: TRow) => boolean

  toolbar?: ReactNode
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

  onRowClick?: (row: TRow, event: MouseEvent) => void
  onRowDoubleClick?: (row: TRow, event: MouseEvent) => void
  onCellFocus?: (position: BcCellPosition) => void
  /**
   * Fires after the editing overlay commits a cell value. Client grids can
   * mirror the value into their own state; server grids can convert the event
   * into a `ServerRowPatch` and settle it after persistence completes.
   */
  onCellEditCommit?: (event: BcCellEditCommitEvent<TRow>) => void | Promise<void>
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
}

export interface BcEditGridProps<TRow> extends BcGridProps<TRow> {
  detailPath?: string
  linkField?: keyof TRow & string

  onEdit?: (row: TRow) => void
  onDelete?: (row: TRow) => void
  canEdit?: (row: TRow) => boolean
  canDelete?: (row: TRow) => boolean

  /**
   * Multi-cell row rollback handler — surfaced as a "Discard" action
   * in the action column **only when the row is dirty** (any cell has
   * uncommitted edits). Audit P1-W3-3.
   *
   * The typical wiring is `onDiscardRowEdits={(rowId) =>
   * apiRef.current?.discardRowEdits(rowId)}` which routes the rollback
   * through `editController.discardRowEdits` — pending and errored
   * cells are preserved per `editing-rfc §Concurrency`. Consumers that
   * need to also clear server-mirror state (an upstream draft store,
   * etc.) can extend the handler.
   *
   * Omit to skip the Discard action entirely.
   */
  onDiscardRowEdits?: (rowId: RowId, row: TRow) => void

  extraActions?: BcEditGridAction<TRow>[] | ((row: TRow) => BcEditGridAction<TRow>[])
  hideActions?: boolean

  editLabel?: string
  deleteLabel?: string
  /** Discard-action label. Defaults to "Discard". */
  discardLabel?: string
  DeleteIcon?: ComponentType<{ className?: string }>
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
   */
  onServerRowMutation?: BcServerEditMutationHandler<TRow>
  /**
   * Optional patch factory for adding base revisions or custom mutation IDs.
   * The default patch uses `{ [columnId]: nextValue }` and an internal
   * monotonic mutation ID.
   */
  createServerRowPatch?: BcServerEditPatchFactory<TRow>
}

export type BcServerGridProps<TRow> =
  | BcServerPagedProps<TRow>
  | BcServerInfiniteProps<TRow>
  | BcServerTreeProps<TRow>

export interface BcServerPagedProps<TRow>
  extends Omit<BcGridProps<TRow>, "apiRef" | "data">,
    BcServerEditMutationProps<TRow> {
  rowModel: "paged"
  /**
   * Current server page size. The server receives this as
   * `ServerPagedQuery.pageSize`; the grid renders only the returned page rows
   * and uses `ServerPagedResult.totalRows` for the footer/page count.
   */
  pageSize?: number
  /**
   * Loads one server-owned page window for the active `ServerViewState`.
   * The result's `rows` are the current page payload; `totalRows` is the
   * count for the full matching server view.
   */
  loadPage: LoadServerPage<TRow>
  initialResult?: ServerPagedResult<TRow>
  apiRef?: RefObject<BcServerGridApi<TRow> | null>
}

export interface BcServerInfiniteProps<TRow>
  extends Omit<BcGridProps<TRow>, "apiRef" | "data">,
    BcServerEditMutationProps<TRow> {
  rowModel: "infinite"
  blockSize?: number
  maxCachedBlocks?: number
  blockLoadDebounceMs?: number
  maxConcurrentRequests?: number
  /**
   * Number of blocks to fetch ahead of the visible viewport on each
   * `onVisibleRowRangeChange`. Default 1 — matches the prior implicit
   * behavior of fetching exactly one block past `range.endIndex`.
   * Higher values reduce scroll-cliff jank for fast scrollers at the
   * cost of more bandwidth; `0` disables prefetch entirely. Clamped
   * to a non-negative integer at the React boundary.
   */
  prefetchAhead?: number
  loadBlock: LoadServerBlock<TRow>
  apiRef?: RefObject<BcServerGridApi<TRow> | null>
}

export interface BcServerTreeProps<TRow>
  extends Omit<BcGridProps<TRow>, "apiRef" | "data">,
    BcServerEditMutationProps<TRow> {
  rowModel: "tree"
  loadChildren: LoadServerTreeChildren<TRow>
  loadRoots?: LoadServerTreeChildren<TRow>
  apiRef?: RefObject<BcServerGridApi<TRow> | null>
  /**
   * Children fetched per `loadChildren` / `loadRoots` request. Default
   * 100. Promotes the implicit block size to an explicit prop so
   * consumers with deep trees can tune fetch granularity. Lower values
   * reduce per-fetch payload at the cost of more round-trips when a
   * group has many children.
   */
  childCount?: number
  /**
   * LRU cap on loaded tree blocks. When set, the model evicts the
   * least-recently-used loaded blocks after each successful tree
   * fetch so memory stays bounded for users who expand many groups
   * across deep trees. Omit (default) for unbounded retention —
   * appropriate when the tree fits comfortably in memory.
   */
  maxCachedBlocks?: number
  /**
   * Optional pre-seed for the chrome's known root child count. When
   * supplied, `<BcServerGrid>` reports `rowCount` as this value before
   * the first `loadChildren({ parentRowId: null, ... })` resolves so
   * the scrollbar / status-bar / "Loading X rows" affordances can
   * render immediately. Replaced by `result.totalChildCount` once the
   * first fetch settles. Does not skip the fetch — the model still
   * needs the actual root rows.
   */
  initialRootChildCount?: number
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
}

export interface BcCellEditorPrepareParams<TRow> {
  row: TRow
  rowId: RowId
  columnId: ColumnId
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
  source: "keyboard" | "pointer" | "api" | "paste"
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
  ServerRowPatch,
  ServerRowUpdate,
  ServerTreeQuery,
  ServerTreeResult,
  ServerTreeRow,
  ServerViewDiagnostics,
}

export type { BcNormalisedRange, BcRange, BcRangeKeyAction, BcRangeSelection } from "@bc-grid/core"
