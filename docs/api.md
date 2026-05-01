# bc-grid Public API — v0.1 (RFC)

**Status:** Accepted with follow-up clarifications (`api-rfc-v0`)
**Owner:** c1 (Claude)
**Reviewer:** fresh agent; subsequent follow-up PRs require review
**Informed by:** `design.md`, `design/ag-grid-poc-audit.md`, `design/accessibility-rfc.md`, `design/server-query-rfc.md`
**Freeze gate:** end of Q1 (M1.8). Once merged + reviewed, every PR runs an API-surface diff in CI. Non-empty diff → architect review.

---

This document is the **binding public API surface** for bc-grid. It defines:

- Every public type, prop, callback, and exported symbol consumers will see at v0.1.
- The packages that own each surface (per `design.md §4.1`).
- Which surfaces are **frozen at v0.1** (ship-and-don't-break) vs which are **reserved for Q2+** (declared here so consumers can plan, but not implemented yet).

The spec is grounded in:

- **`ag-grid-poc-audit`** — the 17 ColDef properties bc-next actually uses, with frequency. The Q1 column surface is a strict superset of those.
- **`server-query-rfc`** — the typed server query/result/selection/edit/cache/invalidation/export surface. This RFC consumes those types verbatim; the location decision (`@bc-grid/core` vs `@bc-grid/server-row-model`) is below.
- **`accessibility-rfc`** — the role/focus/keyboard/live-region model. The component prop surface respects those constraints.
- **`design.md §3.2`** — performance bars. Column properties that would force a hot-path render-callback indirection are avoided (see §4 Value pipeline).

## 0. Conventions

- **Package scope:** every package is `@bc-grid/<name>`. Consumer-facing import is `@bc-grid/react` for components and React-aware types. `@bc-grid/core` owns framework-agnostic state, column, API, and server query types only. Engine packages (`virtualizer`, `animations`, `theming`, `aggregations`, `filters`, `export`, `server-row-model`) are workspace-internal but published; consumers wanting headless access can import them directly.
- **Framework boundary:** `@bc-grid/core` must not reference `React.*`, DOM types, JSX, browser events, or component constructors. React renderers, slots, event objects, refs, and editor components live in `@bc-grid/react` or `@bc-grid/editors`.
- **Type naming:** `Bc<Thing>` for surface types (`BcGridColumn`, `BcGridApi`, `BcRow`, `BcCellPosition`, `BcRange`). Server query types keep their `Server*` prefix (no `Bc`) per `server-query-rfc`.
- **Generics:** every component and type that touches row data is generic over `TRow`. `<BcGrid<Customer>>` is the recommended usage style. Where a useful type is row-agnostic (e.g. `BcGridApi`), the generic is `<TRow = unknown>` so untyped use compiles.
- **Optional vs required:** every required property is documented; every optional property has a stated default. Components reject unknown props at `tsc` (TypeScript's `exact` semantics).
- **Stability tiers:** every section is marked `frozen at v0.1` (locked), `reserved for Q2+` (declared but not implementable yet), or `experimental` (subject to change without major bump). Q1 ships only `frozen` items + types from `reserved` sections.

### Feature Discovery Map

The examples app keeps the main AR Customers demo non-intrusive: sidebar/tool panels remain closed unless a consumer opts into them, and URL flags are explicit. Use this map to locate shipped features and planned surfaces.

| Feature | Status | Example entry | API entry point |
| --- | --- | --- | --- |
| Sort, resize, pin | Available | AR Customers headers | `sortable`, `resizable`, `pinned` |
| Inline filters | Available | AR Customers filter row | `filter`, `showFilterRow` |
| Popup filters | Available | `?filterPopup=1` | `filter.variant = "popup"` |
| Global search | Available | AR Customers toolbar | `searchText`, `defaultSearchText` |
| Row grouping (client / server-page-window) | Available | Columns panel "Group by" zone, header menu, controlled `groupBy` | `groupBy`, `defaultGroupBy`, `onGroupByChange`, `groupableColumns`, `groupsExpandedByDefault` |
| Columns panel | Available | Tool panels control or `?toolPanel=columns` | `sidebar={["columns"]}` |
| Filters panel | Available | Tool panels control or `?toolPanel=filters` | `sidebar={["filters"]}` |
| Context menu | Available | Right-click grid cells | `contextMenuItems`, `showColumnMenu` |
| Cell editing | Available | `?edit=1` | `<BcEditGrid>`, `cellEditor` |
| Checkbox selection | Available | `?checkbox=1` | `checkboxSelection` |
| URL state persistence | Available | `?urlstate=1` | `gridId`, `urlStatePersistence` |
| Pagination | Available | `?pagination=1` | `pagination`, `pageSizeOptions` |
| Aggregations | Available | `?aggregations=1` | `aggregation`, `statusBar` |
| Master detail | Available | `?masterDetail=1` | `renderDetailPanel` |
| Auto height | Available | `?autoHeight=1` | `height = "auto"` |
| Server row model | Available | Package API | `<BcServerGrid>` |
| Pivot panel | Available | Tool panels control or `?toolPanel=pivot` | `sidebar={["pivot"]}`, `pivotState` |
| Charts | Post-1.0 | Not exposed in examples | Future charts adapter |

---

## 1. `BcGridColumn<TRow>` — column surface

### 1.1 The type (frozen at v0.1)

```ts
export interface BcGridColumn<TRow, TValue = unknown> {
  // --- Identity -----------------------------------------------------------

  /**
   * Stable column identifier. Required when `field` is omitted, or when the
   * field appears in multiple columns. Auto-derived from `field` when not set.
   */
  columnId?: ColumnId

  /**
   * Type-safe key into TRow. The column reads its value from `row[field]`
   * unless `valueGetter` is provided.
   */
  field?: keyof TRow & string

  /**
   * Plain text header label. React-aware header rendering lives in
   * `BcReactGridColumn` from `@bc-grid/react`.
   */
  header: string

  // --- Layout -------------------------------------------------------------

  /** Fixed width in px. */
  width?: number
  /** Lower bound for resize / flex calculation. */
  minWidth?: number
  /** Upper bound for resize / flex calculation. */
  maxWidth?: number
  /** Flex weight; columns split remaining horizontal space. Mutually exclusive with `width`. */
  flex?: number

  /** Visual alignment of cell content; applies to header and body cells. */
  align?: "left" | "right" | "center"

  /**
   * Pin to the left or right edge. Stays visible during horizontal scroll.
   * The accessibility tree still exposes pinned cells in column order
   * (`accessibility-rfc §Pinned Rows and Columns`).
   */
  pinned?: "left" | "right"

  /** Hide the column. Persisted in column state when `gridId` is set. */
  hidden?: boolean

  // --- Sort / filter / group ----------------------------------------------

  /** Default true. Set false to disable sort affordances on this column. */
  sortable?: boolean

  /** Default true. Set false to disable resize. */
  resizable?: boolean

  /** Filter definition; see §4.4. `false` disables filtering on this column. */
  filter?: BcColumnFilter | false

  /** Allow this column in the group-by dropdown (`groupableColumns` UI). */
  groupable?: boolean

  /**
   * Custom comparator for sorting.
   * Receives the values produced by `valueGetter` (or `row[field]`).
   * Stable compare ordering is recommended; bc-grid uses Array.sort semantics.
   */
  comparator?: (a: TValue, b: TValue, rowA: TRow, rowB: TRow) => number

  // --- Value pipeline (see §4) --------------------------------------------

  /**
   * Compute a value from a row. Defaults to `row[field]` when omitted.
   * Hot path — keep cheap.
   */
  valueGetter?: (row: TRow) => TValue

  /**
   * Format the value for display. Defaults to `String(value)`.
   * Used for: cell display, search-text matching, copy-to-clipboard, CSV export.
   * Pre-formatted strings make sort comparators cheap.
   */
  valueFormatter?: (value: TValue, row: TRow) => string

  /**
   * Parse a string back to a typed value (for cell editing). Reserved for Q2;
   * Q1 does not exercise this property.
   * @reserved Q2
   */
  valueParser?: (input: string, row: TRow) => TValue

  /**
   * Preset formatter. Equivalent to writing a `valueFormatter` by hand for
   * common cases. The preset list is below in §4.2.
   * If both `format` and `valueFormatter` are set, `valueFormatter` wins.
   */
  format?: BcColumnFormat

  // --- Styling hints ------------------------------------------------------

  /**
   * Static or row-derived semantic class token. React-specific `className`
   * callbacks live in `BcReactGridColumn`.
   */
  cellClass?: string | ((value: TValue, row: TRow) => string | undefined)

  // --- Editing (reserved for Q2) ------------------------------------------

  /**
   * Whether this column accepts cell editing. Default false.
   * @reserved Q2
   */
  editable?: boolean | ((row: TRow) => boolean)

  /**
   * Per-cell validator. Runs at edit-commit time before the value is applied.
   * @reserved Q2
   */
  validate?: (newValue: TValue, row: TRow) => BcValidationResult

  // --- Aggregation --------------------------------------------------------

  /**
   * Footer / group-row aggregation for this column.
   */
  aggregation?: BcAggregation

  // --- Misc ---------------------------------------------------------------

  /** Tooltip text (string) or accessor. Optional. */
  tooltip?: string | ((row: TRow) => string | undefined)

  /** Default false. When true, header cells use `role="rowheader"` instead of `columnheader` for accessibility purposes (rare; first-column-as-row-id pattern). */
  rowHeader?: boolean
}
```

### 1.2 Helper types (frozen at v0.1)

```ts
export type ColumnId = string
export type RowId = string

export interface BcColumnFilter {
  type:
    | "text"
    | "number"
    | "number-range"
    | "date"
    | "date-range"
    | "set"
    | "boolean"
    | "custom"
  /** Optional starting value. */
  defaultValue?: unknown
  /** Optional UI variant. */
  variant?: "popup" | "inline"
}

export type BcColumnFormat =
  | "text"
  | "code"          // monospace for record-codes
  | "number"
  | "currency"
  | "percent"
  | "date"
  | "datetime"
  | "boolean"
  | "muted"         // dim grey, em-dash for empty
  | { type: "number"; precision?: number; thousands?: boolean }
  | { type: "currency"; currency?: string; precision?: number }
  | { type: "percent"; precision?: number }
  | { type: "date"; pattern?: string }
  | { type: "datetime"; pattern?: string }

export interface BcAggregation {
  type: "sum" | "count" | "avg" | "min" | "max" | "custom"
  custom?:
    | (rows: unknown[]) => unknown
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

export const emptyBcPivotState: BcPivotState

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

export type BcValidationResult =
  | { valid: true }
  | { valid: false; error: string }

export type BcScrollAlign = "start" | "center" | "end" | "nearest"

export interface BcScrollOptions {
  align?: BcScrollAlign
}
```

`BcScrollAlign` and `BcScrollOptions` are the named alias for the `opts` shape on `BcGridApi.scrollToRow` / `scrollToCell` (§6.1). They live in `@bc-grid/core` so that consumers writing their own scroll helpers can type the options without redeclaring the union.

`BcPivotState` and the `BcPivot*DTO` types are the JSON-safe pivot contract used by the pure `@bc-grid/aggregations` engine and reserved server-side pivot results. The React sidebar pivot panel reads and writes `pivotState` for row groups, column groups, and values. Rendering a pivoted grid body from that state is still blocked on the pivot row/column rendering integration; chart previews and chart adapters remain post-1.0.

### 1.3 React column extension (frozen at v0.1 in `@bc-grid/react`)

`@bc-grid/react` widens the framework-agnostic core column with React rendering hooks. The React package exports this type as its consumer-facing `BcGridColumn`.

```ts
export type BcReactGridColumn<TRow, TValue = unknown> =
  Omit<BcGridColumn<TRow, TValue>, "header"> & {
    /** Header label or custom React header content. */
    header: string | React.ReactNode

    /**
     * Optional nested child columns for multi-row grouped headers.
     * Parent columns are header-only. Resize, reorder, pin, sort, filter,
     * edit, and aggregation behavior remains on leaf columns.
     */
    children?: readonly BcReactGridColumn<TRow>[]

    /**
     * Custom cell renderer. Receives the value (post-getter, pre-formatter)
     * plus row and column context. Memoised internally; identity changes
     * trigger re-render of all cells in the column.
     *
     * If both `cellRenderer` and `valueFormatter` are set, the renderer
     * receives the raw value and is responsible for any formatting.
     *
     * Hot path — keep cheap. Prefer `format` or `valueFormatter` when possible.
     */
    cellRenderer?: (params: BcCellRendererParams<TRow, TValue>) => React.ReactNode

    /** Static or row-derived class name on the cell `<div>`. */
    cellClassName?: string | ((params: BcCellRendererParams<TRow, TValue>) => string | undefined)

    /** Static or row-derived inline style. Prefer `cellClassName` + CSS where possible. */
    cellStyle?: React.CSSProperties | ((params: BcCellRendererParams<TRow, TValue>) => React.CSSProperties | undefined)

    /**
     * Optional React renderer for an aggregate result in the footer row.
     * Defaults to the column's preset `format`, then `String(result.value)`.
     */
    aggregationFormatter?: (params: BcAggregationFormatterParams<TRow, TValue>) => React.ReactNode

    /**
     * Cell editor component. Required when `editable` is true and the column
     * is part of a `BcEditGrid`.
     * @reserved Q2
    */
    cellEditor?: BcCellEditor<TRow, TValue>

    /**
     * Static or per-row options for select and multi-select editors.
     * Labels are display text; values are the typed commit payload.
     */
    options?:
      | readonly { value: TValue; label: string }[]
      | ((row: TRow) => readonly { value: TValue; label: string }[])

    /**
     * Async lookup options for autocomplete editors. The signal is aborted
     * when a later query supersedes this request.
     */
    fetchOptions?: (
      query: string,
      signal: AbortSignal,
    ) => Promise<readonly { value: TValue; label: string }[]>
  }

export interface BcCellRendererParams<TRow, TValue = unknown> {
  /** Raw value (post-getter, pre-formatter). */
  value: TValue
  /** Pre-formatted display string. */
  formattedValue: string
  /** The row this cell belongs to. */
  row: TRow
  /** Stable row ID. */
  rowId: RowId
  /** The column being rendered. */
  column: BcReactGridColumn<TRow, TValue>
  /** Active search text (for highlight rendering). May be empty string. */
  searchText: string
  /** Row-level UI state. */
  rowState: BcRowState
  /** Whether this cell is currently in edit mode. Reserved Q2. */
  editing: boolean
}

export interface BcAggregationFormatterParams<TRow, TValue = unknown> {
  value: unknown
  formattedValue: string
  result: AggregationResult
  column: BcReactGridColumn<TRow, TValue>
  locale?: string
}
```

Grouped headers are additive and preserve flat-column behavior. Parent header
cells render above their visible leaf columns with `aria-colspan`; leaf columns
keep the existing `columnheader` roles, resize handles, sort/menu/filter
controls, and column-state entries. Parent resize and parent reorder are not
implemented; reorder/pin leaf columns instead. If a group is split by leaf
pinning or reordering, the parent label renders once for each contiguous span.

```tsx
const columns: BcGridColumn<Customer>[] = [
  { columnId: "account", field: "account", header: "Account", pinned: "left" },
  {
    columnId: "aging",
    header: "Aging Buckets",
    children: [
      { columnId: "current", field: "current", header: "Current", align: "right" },
      { columnId: "days1to30", field: "days1to30", header: "1-30", align: "right" },
      { columnId: "daysOver60", field: "daysOver60", header: "60+", align: "right" },
    ],
  },
]
```

### 1.4 Column-level events

Columns don't fire events directly — events are surfaced at the grid level (§3, §5). A column can react to events via `cellRenderer` (which has access to `searchText`, `selected`, `editing` flags via params).

---

## 2. Row identity

Stable row IDs are mandatory for selection, animation, focus, persistence of cell positions across reloads, and server-row-model integration.

### 2.1 The `rowId` callback (frozen at v0.1)

```ts
export type BcRowId<TRow> = (row: TRow, index: number) => RowId
```

Rules:

- `rowId` is **required** on every grid (`BcGrid`, `BcEditGrid`, `BcServerGrid`). No fallback to "use row index" or "use `row.id`."
- Returned IDs must be unique across the full dataset (not just the loaded block).
- Returned IDs must be stable across sort, filter, reload, edit, and cache eviction.
- IDs must NOT encode visible index, page index, or block index (see `server-query-rfc §Row Identity`).
- Composite IDs are allowed but must be serialized as stable strings.
- IDs are the join key for animations (`design.md §7`), selection, expansion, focus retention (`accessibility-rfc §Focus Model`), and the imperative API.

Example:

```tsx
<BcGrid<Customer>
  rowId={(row) => row.id}
  data={customers}
  columns={columns}
/>
```

### 2.2 Row state passed to renderers (frozen at v0.1)

```ts
export interface BcRowState {
  rowId: RowId
  index: number       // absolute index in the row model
  selected: boolean
  disabled?: boolean
  expanded?: boolean  // tree mode only
  level?: number      // tree depth (1-based)
  pending?: boolean   // optimistic edit in flight
  error?: string      // last edit error
}
```

This is exposed to `cellRenderer` via `params.rowState` (Q2 — when editing lands; reserved at v0.1).

---

## 3. Controlled / uncontrolled state pairs

For each piece of grid state, there is a controlled (`<state>` + `on<State>Change`) form and an uncontrolled (`default<State>`) form. Mixing the two for the same state on the same grid is a runtime error.
Filter state uses `null` for "no active filter"; clearing the inline, popup, or sidebar filter controls emits `onFilterChange(null, prevFilter)`.

### 3.1 The pairs (frozen at v0.1)

| State | Controlled prop | Change event | Uncontrolled default |
|---|---|---|---|
| Sort | `sort: BcGridSort[]` | `onSortChange(next, prev)` | `defaultSort` |
| Search text | `searchText: string` | `onSearchTextChange(next)` | `defaultSearchText` |
| Filter | `filter: BcGridFilter \| null` | `onFilterChange(next, prev)` | `defaultFilter` |
| Selection | `selection: BcSelection` | `onSelectionChange(next, prev)` | `defaultSelection` |
| Range selection | `rangeSelection: BcRangeSelection` | `onRangeSelectionChange(next, prev)` | `defaultRangeSelection` |
| Expansion | `expansion: ReadonlySet<RowId>` | `onExpansionChange(next, prev)` | `defaultExpansion` |
| Group-by | `groupBy: ColumnId[]` | `onGroupByChange(next, prev)` | `defaultGroupBy` |
| Pivot | `pivotState: BcPivotState` | `onPivotStateChange(next, prev)` | `defaultPivotState` |
| Column state | `columnState: BcColumnStateEntry[]` | `onColumnStateChange(next, prev)` | `defaultColumnState` |
| Active cell | `activeCell: BcCellPosition` | `onActiveCellChange(next, prev)` | `defaultActiveCell` |
| Pagination | `page: number` + `pageSize: number` | `onPaginationChange({ page, pageSize })` | `defaultPage`, `defaultPageSize` |

### 3.2 State-shape types (frozen at v0.1)

```ts
export interface BcGridSort {
  columnId: ColumnId
  direction: "asc" | "desc"
}

/**
 * Filter shape mirrors `ServerFilter` from `server-query-rfc` so client
 * grids and server grids share one filter shape. AND/OR groupable.
 */
export type BcGridFilter = ServerFilter   // re-exported from @bc-grid/core

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
  position?: number   // 0-based order
}

export interface BcCellPosition {
  rowId: RowId
  columnId: ColumnId
}

export interface BcRange {
  start: BcCellPosition
  end: BcCellPosition
}

export interface BcNormalisedRange {
  rowStart: number
  rowEnd: number
  colStart: number
  colEnd: number
  rowSpan: number
  colSpan: number
  topLeft: BcCellPosition
  bottomRight: BcCellPosition
}

export interface BcRangeSelection {
  ranges: readonly BcRange[]
  /** The cell that anchors Shift+arrow / Shift+click extension. */
  anchor: BcCellPosition | null
}

export interface BcClipboardPayload {
  /** text/plain payload, usually TSV. */
  tsv: string
  /** text/html payload, usually a table. Generated from `tsv` when omitted. */
  html?: string
  /** Additional MIME payloads to write alongside text/plain and text/html. */
  custom?: Record<string, string>
}

export interface BcRangeBeforeCopyEvent<TRow> {
  range: BcRange
  rows: readonly TRow[]
  api: BcGridApi<TRow>
}

export type BcRangeBeforeCopyHook<TRow> = (
  event: BcRangeBeforeCopyEvent<TRow>
) => BcClipboardPayload | false | undefined

export interface BcRangeCopyEvent {
  range: BcRange
  payload: BcClipboardPayload
  suppressed: boolean
}

export type BcRangeCopyHook = (event: BcRangeCopyEvent) => void

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
  onColumnStateChange?: (next: readonly BcColumnStateEntry[], prev: readonly BcColumnStateEntry[]) => void

  activeCell?: BcCellPosition | null
  defaultActiveCell?: BcCellPosition | null
  onActiveCellChange?: (next: BcCellPosition | null, prev: BcCellPosition | null) => void

  page?: number
  defaultPage?: number
  pageSize?: number
  defaultPageSize?: number
  onPaginationChange?: (next: BcPaginationState, prev: BcPaginationState) => void
}
```

The `BcSelection` shape mirrors `ServerSelection` from `server-query-rfc` so that client-side selection and server-side selection share one type. Bulk-operation handlers (delete-selected, export-selected) consume the same snapshot regardless of mode.

Range-selection engine helpers exported from `@bc-grid/core`: `emptyBcRangeSelection`, `newRangeAt`, `normaliseRange`, `expandRangeTo`, `rangeContains`, `rangesContain`, `rangeBounds`, `rangePointerDown`, `rangePointerMove`, `rangePointerUp`, `rangeKeydown`, `rangeSelectAll`, `rangeClear`, `serializeRangeSelection`, and `parseRangeSelection`. These are pure state-machine helpers. React renders a pointer-inert active range overlay and clipboard copy consumes the active range to write TSV (`text/plain`) and table HTML (`text/html`); paste and fill handle behavior remain separate Track 2 implementation tasks.

Controlled-state callbacks use React's `onXChange` naming, not AG Grid's `onXChanged` naming, because they are the setter pair for the controlled prop. Domain events that are not controlled-state setters use verb/event names (`onCellEditCommit`, `onRowClick`, `onServerError`).

### 3.2.1 Consumer-owned layout persistence

For app-level saved views, the React grid exposes a JSON-safe layout DTO. The
grid applies the DTO through the same state paths listed above; it does not read
or write browser storage for this API. Consumers own storage, naming, migration,
and user-profile scoping.

```ts
export interface BcGridLayoutState {
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

export interface BcGridProps<TRow> {
  initialLayout?: BcGridLayoutState
  layoutState?: BcGridLayoutState
  onLayoutStateChange?: (next: BcGridLayoutState, prev: BcGridLayoutState) => void
}
```

Use `initialLayout` for a one-time restore at mount. Use `layoutState` when a
host "apply saved view" action needs to push a new snapshot into the grid. The
grid emits `onLayoutStateChange` after user-driven changes to any included
layout field. Individual controlled props (`columnState`, `sort`, `filter`,
`groupBy`, `page` / `pageSize`, `sidebarPanel`, `searchText`) remain the source
of truth when supplied; applying a layout in that mode invokes the matching
controlled callbacks.

Unknown columns in a saved layout are ignored. Known columns missing from a
partial saved layout keep their current/default state, so consumers can restore
a subset safely after adding or removing columns. Grouping is represented by the
public `groupBy` state. Pivot layout is intentionally not included until a public
pivot state contract lands.

Compact example:

```tsx
const [layout, setLayout] = useState<BcGridLayoutState | undefined>(() =>
  readSavedCustomerLayout(),
)

return (
  <BcGrid
    columns={columns}
    data={rows}
    rowId={(row) => row.id}
    initialLayout={layout}
    onLayoutStateChange={(next) => setLayout(next)}
  />
)
```

### 3.3 Grid identity for persistence (frozen at v0.1)

```ts
export interface BcGridIdentity {
  /**
   * Stable identifier for this grid instance. Used as the storage key for
   * column state, density, page size, search history, etc.
   * Convention: `{module}.{screen}` (e.g., `accounts-receivable.customers`).
   */
  gridId?: string
}

export interface BcGridUrlStatePersistence {
  /**
   * Search parameter that stores a JSON payload containing columnState, sort,
   * and filter. Example: `?grid={...}`.
   */
  searchParam: string
}
```

When `gridId` is set, the React layer persists seven state keys to `localStorage` by default — `columnState`, `pageSize`, `density`, `groupBy`, `pivotState`, `filter`, and `sidebarPanel`. Each key is stored under `bc-grid:{gridId}:{state}` (e.g., `bc-grid:accounts-receivable.customers:filter`); they round-trip independently so consumers can clear or inspect a single key without touching the others. `sidebarPanel` distinguishes `null` ("explicitly closed", round-trips as JSON `"null"`) from `undefined` ("no preference, fall back to `defaultSidebarPanel`"); the same `null` vs `undefined` distinction applies to `filter`. Per-column sort direction is carried by `columnState[i].sortDirection` / `sortIndex`, so `sort` does not appear as a separate localStorage key. A consumer-provided storage backend via `<BcGridProvider storage={...}>` is reserved for Q2 and is not exported at v0.1.

When `urlStatePersistence` is set, the React layer reads and writes a JSON payload containing `columnState`, `sort`, and `filter` to the configured URL search parameter via `history.replaceState`. This is opt-in because URL state is shareable and user-visible. **On mount, URL state takes precedence over `localStorage`** for every key the URL carries — `columnState`, `sort`, and `filter`. Without `initialLayout`, the cascade per state key is `props.default<X> ?? urlPersistedGridState.<x> ?? persistedGridState.<x> ?? <empty>`. When `initialLayout` is supplied, explicit `default<X>` props still win; otherwise layout fields apply before URL/localStorage fallbacks. `columnState` restore is merged over the backend fallback so known columns omitted from a partial layout keep their fallback/default state. The URL writer drops the search param entirely when all three URL keys are `undefined`; an explicit empty array (`[]`) is preserved as "explicit empty" and is distinct from `undefined`.

Both backends silently drop malformed or unsupported persisted entries (best-effort restore — a corrupted blob from an older bc-grid version, or hand-edited storage / URL, never breaks the grid). Both writers are debounced by 500ms (`GRID_STATE_WRITE_DEBOUNCE_MS`) so a column drag or filter typing settles into a single trailing write.

---

## 4. Value pipeline

The value pipeline runs once per cell render. Stages:

1. `valueGetter(row)` → raw `value`. Default: `row[field]`.
2. `valueFormatter(value, row)` or `format` → `formattedValue: string`. Default: `String(value)`.
3. `cellRenderer(params)` → `ReactNode` in `@bc-grid/react`. Default: `formattedValue`.
4. (Edit mode, Q2) `valueParser(input, row)` → next raw value, then `validate`.

### 4.1 Hot-path rules (frozen at v0.1)

- `valueGetter`, `valueFormatter`, `comparator` run on every render of the cell. Must be cheap.
- `cellRenderer` runs only for visible cells (post-virtualisation). Can be more expensive but should not allocate per-call when possible.
- Identity stability: passing a different function reference for any of these triggers re-render of every cell in the column. Memoise or define outside the component.

### 4.2 `format` preset semantics (frozen at v0.1)

| Preset | Renders | Empty value renders |
|---|---|---|
| `"text"` | `String(value)` | `""` |
| `"code"` | monospace, `text-foreground` | `""` |
| `"muted"` | grey text | em dash `—` |
| `"number"` | locale-formatted number (no thousands) | `""` |
| `{ type: "number", thousands: true }` | locale-formatted number with thousands separator | `""` |
| `"currency"` | locale-formatted currency, default `Intl.NumberFormat` style | `""` |
| `"percent"` | value × 100 with `%` suffix | `""` |
| `"date"` | `Intl.DateTimeFormat({ dateStyle: "medium" })` | `""` |
| `"datetime"` | `Intl.DateTimeFormat({ dateStyle: "medium", timeStyle: "short" })` | `""` |
| `"boolean"` | `"Yes"` / `"No"` | `""` |

`Intl.NumberFormat` and `Intl.DateTimeFormat` consume the grid's `locale` prop (default: browser locale). Currency code defaults to `view.locale.currency` if set; otherwise `"USD"`. Custom: `{ type: "currency", currency: "AUD" }`.

### 4.3 Search-text matching (frozen at v0.1)

When `searchText` is set on the grid, every visible row is matched against the search by joining `formattedValue` for each searchable column. A column is searchable when `column.filter !== false`. Matching is case-insensitive substring by default.

The matched substring is exposed to `cellRenderer` via `params.searchText` so the renderer can highlight matches. The default renderer (when `cellRenderer` is omitted) handles highlighting automatically.

bc-grid does not render a built-in global search box. Host apps own the input
and pass its value into the grid:

```tsx
function CustomerGrid() {
  const [searchText, setSearchText] = useState("")

  return (
    <>
      <label>
        <span>Global search</span>
        <input
          type="search"
          value={searchText}
          onChange={(event) => setSearchText(event.currentTarget.value)}
        />
      </label>

      <BcGrid
        data={rows}
        columns={columns}
        rowId={(row) => row.id}
        searchText={searchText}
      />
    </>
  )
}
```

Use `defaultSearchText` only for an uncontrolled initial query. For a host-owned
search input, prefer controlling the query with `searchText` as shown above. Do
not pass `searchText` and `defaultSearchText` to the same grid.

### 4.4 Filter shape (frozen at v0.1)

Per-column `filter` declares **what kind of filter UI to show** and what parser to use; the actual filter state is in `BcGridFilter` (which mirrors `ServerFilter` from `server-query-rfc` for parity with server grids).

Built-in filter types: `text`, `number`, `number-range`, `date`, `date-range`, `set`, `boolean`. The React grid includes inline and popup editors for these built-ins. The `text` type emits `op: "contains" | "starts-with" | "ends-with" | "equals"` plus optional modifier flags `caseSensitive?: true` and `regex?: true` on the resulting `ServerColumnFilter`. The default `op: "contains"` with no modifiers is case-insensitive substring matching (the v0.1 / v0.2 behaviour, preserved); `caseSensitive: true` matches the input casing exactly; `regex: true` interprets `value` as a JavaScript regex pattern (the regex flag overrides `op`, and patterns that fail to compile are dropped at both build time and match time so partial typing of an unfinished pattern doesn't blank the row set). Consumers driving controlled `filter` / `onFilterChange` get the canonical `BcGridFilter` shape with `caseSensitive` / `regex` carried directly on each `ServerColumnFilter` leaf — no encode / decode is required at the host-app boundary. The internal `columnFilterText` editor map uses a plain needle string for the default `contains` + no-modifier case (legacy compat) and a JSON payload for non-default operator / modifier state; both shapes round-trip through `BcGridFilter` so persisted state from v0.2 still rehydrates correctly. The `number-range` type is a convenience over `number` `between` that renders two `inputMode="decimal"` fields and always emits `op: "between"`; partial input (only one bound filled, or non-numeric content) is treated as inactive so typing doesn't narrow the row set mid-keystroke. The `date-range` type mirrors `number-range` for ISO 8601 dates: two `<input type="date">` fields separated by an em-dash, no operator dropdown, and `op: "between"` with the bounds normalised so consumers can type either edge first. Set filters are multi-select editors over distinct column values, loaded on first open, and emit `op: "in" | "not-in" | "blank"` (`values` is present for `in` / `not-in`). The popover surface includes a search input that narrows the option list (matching either the rendered label or the underlying value, case-insensitive), a "Select all / Clear all" affordance scoped to the visible (search-narrowed) options so typing never silently unselects off-screen choices, and a "Clear selection" footer action. Selections for options hidden by the active search query are preserved when toggling all-visible. The trigger button carries `data-active="true"` whenever the filter is active (`op === "blank"` or `values.length > 0`) so themes can style applied-filter state without parsing `filterText`. For array-valued cells, each array item is indexed and matched independently. Custom filters register via `@bc-grid/filters` (Q2 deliverable; the registry shape is below for forward compatibility).

```ts
// from @bc-grid/filters (engine)
export interface BcFilterDefinition<TValue = unknown> {
  type: string
  predicate: (value: TValue, criteria: unknown) => boolean
  serialize: (criteria: unknown) => string
  parse: (serialized: string) => unknown
}

// from @bc-grid/react (Q2)
export interface BcReactFilterDefinition<TValue = unknown> extends BcFilterDefinition<TValue> {
  /** UI component (Q2). */
  Editor?: React.ComponentType<BcFilterEditorProps<TValue>>
}

export interface BcFilterEditorProps<TValue = unknown> {
  value: TValue | null
  commit(next: TValue | null): void
  clear(): void
  locale?: string
}
```

---

## 5. Components

### 5.1 `<BcGrid>` (frozen at v0.1, read-only feature set)

```tsx
<BcGrid<TRow>
  data={rows}
  columns={columns}
  rowId={(row) => row.id}

  // Identity / persistence
  gridId="accounts-receivable.customers"

  // Layout
  density="normal"   // "compact" | "normal" | "comfortable"
  height="auto"      // "auto" → page-flow; number → fixed scroller; undefined → fills parent flex

  // State (controlled)
  sort={sort} onSortChange={setSort}
  searchText={searchText} onSearchTextChange={setSearchText}
  filter={filter} onFilterChange={setFilter}
  selection={selection} onSelectionChange={setSelection}
  expansion={expansion} onExpansionChange={setExpansion}
  groupBy={groupBy} onGroupByChange={setGroupBy}
  columnState={columnState} onColumnStateChange={setColumnState}
  activeCell={activeCell} onActiveCellChange={setActiveCell}
  page={page} pageSize={pageSize} onPaginationChange={setPagination}

  // OR uncontrolled (default*)
  defaultSort={[{ columnId: "code", direction: "asc" }]}

  // Pagination
  pagination={true}        // false → never paginate; undefined → auto when rows > pageSize
  pageSizeOptions={[25, 50, 100, 250]}

  // Aggregations
  aggregationScope="filtered" // "filtered" | "all" | "selected"

  // Grouping
  groupableColumns={[{ columnId: "region", header: "Region" }]}
  groupsExpandedByDefault={true}

  // Show / hide inactive (read-only convention)
  showInactive={false} onShowInactiveChange={setShowInactive}
  rowIsInactive={(row) => row.active === "N"}

  // Slots
  toolbar={<MyToolbar />}
  footer={<MyFooter />}
  renderDetailPanel={({ row }) => <CustomerDetailPanel row={row} />}
  detailPanelHeight={144}

  // Events (read-only)
  onRowClick={(row, ev) => ...}
  onRowDoubleClick={(row, ev) => ...}
  onCellFocus={(pos) => ...}

  // Imperative
  apiRef={apiRef}

  // i18n
  locale="en-AU"
  messages={{ noRowsLabel: "No customers" }}

  // Loading state
  loading={false}
  loadingOverlay={<MyLoadingOverlay />}
/>
```

#### `<BcGrid>` props summary (frozen at v0.1)

```ts
export interface BcDetailPanelParams<TRow> {
  row: TRow
  rowId: RowId
  rowIndex: number
}

export type BcSidebarBuiltInPanel = "columns" | "filters" | "pivot"

export type BcSidebarPanel<TRow = unknown> =
  | BcSidebarBuiltInPanel
  | BcSidebarCustomPanel<TRow>

export interface BcSidebarCustomPanel<TRow = unknown> {
  id: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  render: (ctx: BcSidebarContext<TRow>) => React.ReactNode
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
  pivot?: unknown // legacy placeholder; use pivotState / setPivotState
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
  id: string
  label: string
  onSelect: (ctx: BcContextMenuContext<TRow>) => void
  disabled?: boolean | ((ctx: BcContextMenuContext<TRow>) => boolean)
  /**
   * Visual treatment hint. `"destructive"` matches shadcn DropdownMenu's
   * destructive convention — the renderer emits `data-variant="destructive"`
   * on the row and the bundled theme paints text + hover background using
   * the `--bc-grid-invalid` token. Use sparingly for irreversible actions
   * like "Delete row" or "Discard changes". Omitting the field (or
   * setting `"default"`) keeps the regular menu-row treatment.
   */
  variant?: "default" | "destructive"
}

export type BcContextMenuItem<TRow = unknown> =
  | BcContextMenuBuiltinItem
  | BcContextMenuCustomItem<TRow>
```

**Built-in IDs at a glance** (full table below):

- **Clipboard** — `copy`, `copy-cell`, `copy-row`, `copy-with-headers`.
- **Filter** — `clear-column-filter`, `clear-all-filters`.
- **Column** — `pin-column-left`, `pin-column-right`, `unpin-column`, `hide-column`, `show-all-columns`, `autosize-column`, `autosize-all-columns`.
- **Range / selection** — `clear-range`, `clear-selection`.
- **Layout** — `separator` (collapses adjacent separators automatically).

For a worked recipe combining these built-ins with a custom destructive item, see [`apps/docs/src/pages/context-menu-recipe.astro`](https://github.com/bc-grid/bc-grid/blob/main/apps/docs/src/pages/context-menu-recipe.astro) (rendered at `/context-menu-recipe/` in the docs site).

The default `contextMenuItems` set is `["copy", "copy-row", "copy-with-headers", "separator", "clear-selection", "clear-range"]`. Every other built-in below is **consumer-opt-in** — pass it explicitly via `contextMenuItems` to surface it. See `docs/design/context-menu-command-map.md` for the full v0.3 command map.

The opt-in groups consumers most often layer on top of the defaults are:

- **Filter-clearing** — `clear-column-filter`, `clear-all-filters`. Wired to `BcGridApi.clearFilter`.
- **Column shape** — `pin-column-left`, `pin-column-right`, `unpin-column`, `hide-column`, `show-all-columns`, `autosize-column`, `autosize-all-columns`. Wired to `BcGridApi.setColumnPinned` / `setColumnHidden` / `setColumnState` / `autoSizeColumn`.
- **Explicit single-cell copy** — `copy-cell`, for consumers who want a copy item that ignores the active range.

These groups never need extra runtime dependencies or a custom factory — the bundled grid already owns the dispatch path and the icon set. See [`packages/react/README.md`](../packages/react/README.md#context-menu-column-commands) for an end-to-end recipe wiring these alongside the defaults.

| Built-in id | Action | Disabled when |
|---|---|---|
| `copy` | Copies the active range, falling back to the right-clicked cell when no range exists. TSV format, no headers. | No cell context AND no range selection |
| `copy-cell` | Explicit single-cell copy — ignores any active range. | No cell context |
| `copy-row` | Copies every visible-column cell of the right-clicked row, joined as a TSV line. | No cell or row context |
| `copy-with-headers` | Same shape as `copy` but prepends the column-header row. | No cell context AND no range selection |
| `clear-all-filters` | Calls `BcGridApi.clearFilter()` (clears every column filter) | No filter is active |
| `clear-column-filter` | Calls `BcGridApi.clearFilter(columnId)` for the right-clicked cell | No cell context, or that column has no filter entry |
| `pin-column-left` | Calls `BcGridApi.setColumnPinned(columnId, "left")` | No column context, or the column is already pinned left |
| `pin-column-right` | Calls `BcGridApi.setColumnPinned(columnId, "right")` | No column context, or the column is already pinned right |
| `unpin-column` | Calls `BcGridApi.setColumnPinned(columnId, null)` | No column context, or the column is not pinned |
| `hide-column` | Calls `BcGridApi.setColumnHidden(columnId, true)` | No column context, the column is already hidden, or it's the last visible column (UX guard — the user would need the column chooser to recover) |
| `show-all-columns` | Walks the column state and writes every entry's `hidden` flag to `false` in a single `setColumnState` write. | Every column is already visible |
| `autosize-column` | Calls `BcGridApi.autoSizeColumn(columnId)` | No column context, or the column is hidden (no DOM to measure) |
| `autosize-all-columns` | Loops `BcGridApi.autoSizeColumn(columnId)` over every visible column. | Every column is hidden (nothing to measure) |

**Disabled-state pattern.** Every built-in disables itself when (1) the trigger context lacks the data the action needs (e.g. `pin-column-left` needs a column; `copy-row` needs a row), or (2) the action would be a no-op against current state (already pinned to the target side, no filter to clear, every column already visible, etc.). The grid re-evaluates each item's `disabled` predicate every time the menu opens, so consumers don't need to gate the IDs manually based on selection or column state — they can list every command they care about and trust the per-trigger evaluation. The full per-id rules are in the **Disabled when** column above; the rule of thumb is "ID is enabled iff dispatching it would change something visible."

The icon set rendered next to these items is shipped by `@bc-grid/react` itself
— consumers don't need to install lucide / heroicons / radix-icons to get the
default look.

To extend the default menu without rewriting it from scratch, spread the default
list and append column / filter built-ins or a custom item factory:

```ts
import { DEFAULT_CONTEXT_MENU_ITEMS } from "@bc-grid/react"

const contextMenuItems: BcContextMenuItems<Customer> = [
  ...DEFAULT_CONTEXT_MENU_ITEMS,
  "separator",
  "clear-column-filter",
  "clear-all-filters",
  "separator",
  "pin-column-left",
  "pin-column-right",
  "unpin-column",
  "hide-column",
  "show-all-columns",
  "autosize-column",
  "autosize-all-columns",
]
```

For row-action commands ("View customer", "Open invoice"), pass a factory and
return a custom item with the active row already captured from `ctx.row`:

```ts
const contextMenuItems: BcContextMenuItems<Customer> = (ctx) => [
  ...DEFAULT_CONTEXT_MENU_ITEMS,
  "separator",
  ctx.row && {
    id: "open-customer",
    label: `Open ${ctx.row.name}`,
    onSelect: () => navigate(`/customers/${ctx.row?.id}`),
  },
]
```

`null` / `false` / `undefined` entries are filtered out, so a row-conditional
item can be returned as `ctx.row && { ... }` without an extra check.

```ts
export interface BcContextMenuContext<TRow = unknown> {
  cell: BcCellPosition | null
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

export interface BcGridProps<TRow> extends BcGridIdentity, BcGridStateProps {
  /** Row data (client-side). For server-side, use BcServerGrid. */
  data: readonly TRow[]
  columns: readonly BcReactGridColumn<TRow>[]
  rowId: BcRowId<TRow>
  /**
   * Controls whether `<BcGrid>` applies client-side row transforms
   * (filter/search/sort/grouping) to `data`.
   *
   * `"client"` is the default. `"manual"` treats `data` as already
   * processed by the host/server and is used by `<BcServerGrid>` so refreshes
   * keep current rows stable while the next server result loads.
   */
  rowProcessingMode?: "client" | "manual"

  // Layout
  density?: "compact" | "normal" | "comfortable"
  /**
   * `number` — the grid root takes that pixel height; the body scroller
   *   owns its own scrollbar and rows virtualize against it. The right
   *   default for in-page lookup tables, modal pickers, and any grid
   *   that should never push surrounding chrome off-screen.
   * `"auto"` — page-flow mode. The grid grows to its rendered canvas
   *   height and gives the scrollbar back to the document; the page
   *   scrolls naturally through the rows. The header sticks to the top
   *   of the viewport via `position: sticky`, while the body scroller
   *   still owns horizontal overflow so wide tables keep a standard
   *   horizontal scrollbar. This is the right default when the grid is
   *   the primary surface on a long-form page.
   *   Trade-off: virtualization no longer windows on row scroll — the
   *   ResizeObserver expands the virtualizer's viewport to the full
   *   canvas height, so every row is in the DOM. Use a numeric height
   *   for datasets where row-level virtualization matters.
   * `undefined` (default) — the scroller fills whatever flex space its
   *   parent gives it, with internal vertical scroll.
   */
  height?: "auto" | number
  rowHeight?: number   // override the density default

  // Pagination
  /**
   * `true` — force the built-in pager on, even for small datasets.
   * `false` — never paginate, regardless of dataset size.
   * `undefined` (default) — auto-enable when row count exceeds the
   *   effective page size (pageSize / defaultPageSize / first
   *   pageSizeOption / `100` fallback).
   */
  pagination?: boolean
  pageSizeOptions?: number[]

  // Aggregations
  aggregationScope?: "filtered" | "all" | "selected"

  // Grouping
  groupableColumns?: readonly { columnId: ColumnId; header: string }[]
  groupsExpandedByDefault?: boolean

  // Active filter convention
  showInactive?: boolean
  onShowInactiveChange?: (next: boolean) => void
  rowIsInactive?: (row: TRow) => boolean
  rowIsDisabled?: (row: TRow) => boolean

  // Slots
  toolbar?: React.ReactNode
  footer?: React.ReactNode
  /**
   * Footer status-bar segments rendered below the body and above any
   * `footer` slot. Built-in IDs (`total`, `filtered`, `selected`,
   * `aggregations`) opt in to the standard renderers; objects matching
   * `BcStatusBarCustomSegment` render consumer-supplied content. Per
   * `docs/design/chrome-rfc.md §Status bar`.
   */
  statusBar?: readonly BcStatusBarSegment<TRow>[]
  sidebar?: readonly BcSidebarPanel<TRow>[]
  defaultSidebarPanel?: string | null
  sidebarPanel?: string | null
  onSidebarPanelChange?: (next: string | null, prev: string | null) => void
  sidebarWidth?: number
  contextMenuItems?: BcContextMenuItems<TRow>

  // Master-detail
  renderDetailPanel?: (params: BcDetailPanelParams<TRow>) => React.ReactNode
  detailPanelHeight?: number | ((params: BcDetailPanelParams<TRow>) => number)

  // Read-only events
  onRowClick?: (row: TRow, event: React.MouseEvent) => void
  onRowDoubleClick?: (row: TRow, event: React.MouseEvent) => void
  onCellFocus?: (position: BcCellPosition) => void
  onVisibleRowRangeChange?: (range: { startIndex: number; endIndex: number }) => void
  /**
   * Fires after the editing overlay commits a value. Client grids can mirror
   * into local state; server grids can convert the event into a ServerRowPatch.
   */
  onCellEditCommit?: (event: BcCellEditCommitEvent<TRow>) => void | Promise<void>
  onBeforeCopy?: BcRangeBeforeCopyHook<TRow>
  onCopy?: BcRangeCopyHook

  // Imperative
  apiRef?: React.RefObject<BcGridApi<TRow> | null>

  // i18n
  locale?: string
  messages?: Partial<BcGridMessages>
  urlStatePersistence?: BcGridUrlStatePersistence

  // Loading
  loading?: boolean
  loadingOverlay?: React.ReactNode

  // Accessibility
  ariaLabel?: string
  ariaLabelledBy?: string

  /**
   * Override the inline filter row's visibility independent of the
   * per-column filter configuration. Lets host apps wire a filter
   * toggle button without touching column definitions.
   *
   * - `undefined` (default) — column-driven: row renders iff at least
   *   one column has an inline-variant filter configured. Same
   *   behavior consumers see today.
   * - `true` — force visible. Columns with `filter: false` or
   *   `variant: "popup"` still render empty filter cells in the row.
   * - `false` — force hidden. Active filter state (`columnFilterText`
   *   / `BcGridFilter`) is preserved across the toggle; only the
   *   editor row is suppressed. Popup-variant filter funnels stay
   *   reachable from each column header.
   */
  showFilterRow?: boolean
  showFilters?: boolean
  showColumnMenu?: boolean
}
```

`showFilters` is a compatibility alias for `showFilterRow`; prefer
`showFilterRow` in new code. If both are supplied, `showFilterRow` wins.
The grid resolves the prop pair as `props.showFilterRow ?? props.showFilters`
on every render — so a host can pass either prop without re-wiring the
column definitions.

#### Filter-row toggle contract

The filter row is a **visible editor surface**, not the storage for the
active filter. Toggling it does not change which rows the grid shows:

- Active filter state lives in the controlled `filter` /
  `defaultFilter` props (or, internally, the `columnFilterText` map
  for uncontrolled grids). Setting `showFilterRow={false}` hides the
  editor row but **does not clear** the active filter.
- Setting `showFilterRow={true}` again restores the editor row with
  the previously-typed values still populated.
- `BcGridApi.setFilter(null)` / `clearFilter()` is the **only** path
  that clears active filter state. The visibility flag never side-
  effects it.

This separation means a host toolbar "Show filters" button can be a
pure visibility toggle. Keep the toggle's local boolean in host
state and thread it into the prop:

```tsx
const [filtersOpen, setFiltersOpen] = useState(true)

return (
  <>
    <button
      type="button"
      aria-pressed={filtersOpen}
      onClick={() => setFiltersOpen((open) => !open)}
    >
      {filtersOpen ? "Hide filters" : "Show filters"}
    </button>
    <BcGrid
      columns={columns}
      data={rows}
      rowId={(row) => row.id}
      showFilterRow={filtersOpen}
      // …
    />
  </>
)
```

`showFilterRow` is **not** persisted by `gridId` / `urlStatePersistence`
— a toolbar toggle never accidentally round-trips the visibility
decision into localStorage or URL state. Visibility is per-mount;
filter state is what the consumer wires through `gridId` /
`urlStatePersistence` (see §3.3 below).

`showColumnMenu` controls the built-in header column-menu button and header
right-click menu. It defaults to `true`; pass `false` when a host app provides
its own column/settings surface. Individual columns can opt out with
`columnMenu: false`, which is how built-in selection, detail, and action
columns avoid rendering a column menu.

When `renderDetailPanel` is supplied, `<BcGrid>` renders a small pinned-left
disclosure column. Expanding a row mounts the returned React node below that
row, using the existing `expansion` state pair. Detail panels are fixed-height
by default (`144px`) or per-row via `detailPanelHeight`; auto-measured detail
height is deferred so virtualization remains deterministic.

The built-in panel surface is intentionally plain and compact so host apps can
compose their own content. `@bc-grid/theming` ships optional utility classes for
common child-panel states: `bc-grid-detail-section`,
`bc-grid-detail-nested-grid`, `bc-grid-detail-empty`,
`bc-grid-detail-loading`, and `bc-grid-detail-error`.

Recommended child-grid pattern: keep detail content inside one or more
`bc-grid-detail-section` blocks, give nested tables/grids their own heading via
`aria-labelledby`, and use stable keys from the child records. Avoid autofocus
on mount; the disclosure button remains the user's focus anchor after
expand/collapse. Use `bc-grid-detail-empty`, `bc-grid-detail-loading`, and
`bc-grid-detail-error` for async states instead of resizing text or animating
row height.

For host-owned async child data, keep the detail row mounted at its declared
`detailPanelHeight` while data loads. Use `role="status"` + `aria-live="polite"`
for loading text, `role="alert"` for failed child loads, and stable title/body
children via `bc-grid-detail-state-title` and
`bc-grid-detail-state-description`. Retry buttons can live in
`bc-grid-detail-state-actions`; avoid autofocus so keyboard users return to the
same disclosure control after collapse.

Production expansion contract: the row layout state changes immediately so the
virtualizer can recalculate row positions without a height tween. The only
built-in reveal motion is a short opacity/translate on the detail content
region, with `prefers-reduced-motion` disabling that animation. Consumers should
not animate `height`, `max-height`, or apply `scale()` to row/detail text. For
async child views, keep the panel mounted at a predictable `detailPanelHeight`
and swap compact empty/loading/error content in place.

```tsx
<BcGrid<Customer>
  // ...
  detailPanelHeight={188}
  renderDetailPanel={({ row }) => (
    <div className="customer-detail-panel">
      <section className="bc-grid-detail-section">
        <p className="bc-grid-detail-kicker">Collector Notes</p>
        <p>{row.collectorNotes}</p>
      </section>
      <section className="bc-grid-detail-section">
        <div className="bc-grid-detail-section-header">
          <p className="bc-grid-detail-kicker">Customer Contacts</p>
          <span>{row.contacts.length} contacts</span>
        </div>
        {row.contactsState === "loading" ? (
          <div className="bc-grid-detail-loading" role="status" aria-live="polite">
            <span className="bc-grid-detail-state-title">Loading contacts</span>
            <span className="bc-grid-detail-state-description">
              Fetching contacts without changing the row height.
            </span>
          </div>
        ) : row.contactsError ? (
          <div className="bc-grid-detail-error" role="alert">
            <span className="bc-grid-detail-state-title">Contacts unavailable</span>
            <span className="bc-grid-detail-state-description">
              Retry from the host customer screen.
            </span>
            <div className="bc-grid-detail-state-actions">
              <button type="button" onClick={row.reloadContacts}>
                Retry
              </button>
            </div>
          </div>
        ) : row.contacts.length > 0 ? (
          <div className="bc-grid-detail-nested-grid" role="grid">
            <div role="row">
              <span role="columnheader">Name</span>
              <span role="columnheader">Role</span>
              <span role="columnheader">Email</span>
            </div>
            {row.contacts.map((contact) => (
              <div role="row" key={contact.id}>
                <span role="cell">{contact.name}</span>
                <span role="cell">{contact.role}</span>
                <span role="cell">{contact.email}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="bc-grid-detail-empty">
            <span className="bc-grid-detail-state-title">No contacts on file</span>
            <span className="bc-grid-detail-state-description">
              Add an AP contact before scheduling follow-up.
            </span>
          </div>
        )}
      </section>
    </div>
  )}
/>
```

The `statusBar` slot accepts an array of segment descriptors. Built-in IDs hide
themselves when their content is irrelevant: `filtered` only appears once a
filter narrows the row count, `selected` only when a selection is active, and
`aggregations` only when at least one aggregation result is available. Custom
segments render unconditionally — visibility is the consumer's responsibility.

The `sidebar` prop registers right-edge tool panel tabs by id. For primary grid
demos, prefer an explicit control (or a URL flag) over `defaultSidebarPanel` so
the panel rail is discoverable without covering pointer-heavy grid workflows on
first paint:

```tsx
const [toolPanel, setToolPanel] = useState<"columns" | "filters" | "pivot" | null>(null)

<BcGrid
  // ...
  sidebar={["columns", "filters", "pivot"]}
  sidebarPanel={toolPanel}
  onSidebarPanelChange={(next) =>
    setToolPanel(next === "columns" || next === "filters" || next === "pivot" ? next : null)
  }
  sidebarWidth={320}
/>
```

`defaultSidebarPanel` remains available for dedicated tool-panel demos that
should open a panel immediately. `sidebarWidth` controls the open panel width in
pixels and falls back to `280`. Passing `defaultSidebarPanel={null}` explicitly
starts collapsed, even when a persisted sidebar panel exists. The examples app
uses `?toolPanel=columns`, `?toolPanel=filters`, or `?toolPanel=pivot` as its
opt-in URL path.

```ts
type BcStatusBarSegment<TRow = unknown> =
  | "total"
  | "filtered"
  | "selected"
  | "aggregations"
  | BcStatusBarCustomSegment<TRow>

interface BcStatusBarCustomSegment<TRow = unknown> {
  id: string
  render: (ctx: BcStatusBarContext<TRow>) => React.ReactNode
  align?: "left" | "right"
}

interface BcStatusBarContext<TRow = unknown> {
  totalRowCount: number | "unknown"
  filteredRowCount: number
  selectedRowCount: number
  aggregations: readonly AggregationResult[]
  api: BcGridApi<TRow>
}
```

### 5.2 `<BcEditGrid>` (frozen at v0.1 surface; editing is Q2)

Composes `<BcGrid>` plus a first-column detail link and a pinned-right actions column. The actions column auto-renders Edit / Delete dropdown items, gated by per-row permission callbacks.

In Q1, `<BcEditGrid>` is `<BcGrid>` + the actions column + the link column. In Q2, the same component gains in-grid editing.

```tsx
<BcEditGrid<TRow>
  // ... all BcGrid props plus:
  detailPath="/accounts-receivable/customers"
  linkField="code"

  onEdit={(row) => openEditDialog(row)}
  onDelete={(row) => confirmDelete(row)}
  canEdit={(row) => perms.canEditRow(row)}
  canDelete={(row) => perms.canDeleteRow(row)}

  extraActions={(row) => [
    { label: "View history", onSelect: () => ..., icon: HistoryIcon },
  ]}

  hideActions={false}
  editLabel="Edit"
  deleteLabel="Delete"
/>
```

```ts
export interface BcEditGridProps<TRow> extends BcGridProps<TRow> {
  detailPath?: string
  linkField?: keyof TRow & string

  onEdit?: (row: TRow) => void
  onDelete?: (row: TRow) => void
  // `onCellEditCommit` is inherited from BcGridProps.
  canEdit?: (row: TRow) => boolean
  canDelete?: (row: TRow) => boolean

  extraActions?: BcEditGridAction<TRow>[] | ((row: TRow) => BcEditGridAction<TRow>[])
  hideActions?: boolean

  editLabel?: string
  deleteLabel?: string
  DeleteIcon?: React.ComponentType<{ className?: string }>
}

export interface BcEditGridAction<TRow> {
  label: string
  onSelect: (row: TRow) => void
  icon?: React.ComponentType<{ className?: string }>
  destructive?: boolean
  disabled?: boolean | ((row: TRow) => boolean)
}
```

### 5.3 `<BcServerGrid>` (frozen at v0.1)

Server-side row model. Three modes (paged, infinite, tree) discriminated by `rowModel`. All three modes share the same `BcGridProps` surface for state + columns; the only difference is how rows are fetched.

```tsx
// Paged mode
<BcServerGrid<TRow>
  rowModel="paged"
  columns={columns}
  rowId={(row) => row.id}
  pageSize={50}
  loadPage={async (query, ctx) => {
    const res = await fetch("/api/customers", { signal: ctx.signal, ... })
    return res.json()
  }}
  // ... + all BcGrid props
/>

// Infinite mode
<BcServerGrid<TRow>
  rowModel="infinite"
  columns={columns}
  rowId={(row) => row.id}
  blockSize={100}
  maxCachedBlocks={20}
  loadBlock={async (query, ctx) => ...}
/>

// Tree mode
<BcServerGrid<TRow>
  rowModel="tree"
  columns={columns}
  rowId={(row) => row.id}
  loadChildren={async (query, ctx) => ...}
/>
```

```ts
export type BcServerGridProps<TRow> =
  | BcServerPagedProps<TRow>
  | BcServerInfiniteProps<TRow>
  | BcServerTreeProps<TRow>

export interface BcServerPagedProps<TRow> extends Omit<BcGridProps<TRow>, "apiRef" | "data"> {
  rowModel: "paged"
  pageSize?: number
  loadPage: LoadServerPage<TRow>
  /** Optional first page rendered server-side. */
  initialResult?: ServerPagedResult<TRow>
  onServerRowMutation?: BcServerEditMutationHandler<TRow>
  createServerRowPatch?: BcServerEditPatchFactory<TRow>
  apiRef?: React.RefObject<BcServerGridApi<TRow> | null>
}

export interface BcServerInfiniteProps<TRow> extends Omit<BcGridProps<TRow>, "apiRef" | "data"> {
  rowModel: "infinite"
  blockSize?: number          // default 100
  maxCachedBlocks?: number    // default 20
  blockLoadDebounceMs?: number
  maxConcurrentRequests?: number
  loadBlock: LoadServerBlock<TRow>
  onServerRowMutation?: BcServerEditMutationHandler<TRow>
  createServerRowPatch?: BcServerEditPatchFactory<TRow>
  apiRef?: React.RefObject<BcServerGridApi<TRow> | null>
}

export interface BcServerTreeProps<TRow> extends Omit<BcGridProps<TRow>, "apiRef" | "data"> {
  rowModel: "tree"
  loadChildren: LoadServerTreeChildren<TRow>
  /** Required when the tree's root needs an initial fetch. */
  loadRoots?: LoadServerTreeChildren<TRow>
  onServerRowMutation?: BcServerEditMutationHandler<TRow>
  createServerRowPatch?: BcServerEditPatchFactory<TRow>
  apiRef?: React.RefObject<BcServerGridApi<TRow> | null>
}
```

```ts
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
```

Paged mode is a server-owned pagination contract. `loadPage` receives
`query.pageIndex`, `query.pageSize`, and `query.view` (`sort`, `filter`,
`search`, `groupBy`, `visibleColumns`, and optional locale/time zone). It must
return only the rows for that page plus `totalRows` for the full matching server
view. `<BcServerGrid rowModel="paged">` uses `totalRows` for the built-in pager
and passes the returned page rows straight to the body; it does not apply
client-side pagination or slice the page again. This is intentionally different
from client pagination: in server-paged grids the server is the source of truth
for the global page window and the grid renders only the returned slice. Sort,
filter, search, group, and visible-column changes reset the requested server
page to `0`. Pagination,
refresh, and active-view invalidation preserve the active query model and
request the intended global server page. If an older load resolves after a newer
view/page request starts, `<BcServerGrid>` ignores the stale response and
diagnostics continue to describe the active request view.

The returned `rows` are the **loaded page window**, not the full result set.
`totalRows` is the count for the full server view after the server has applied
the query's sort/filter/search/group/visible-column model. Diagnostics preserve
that distinction: `rowCount` / `lastLoad.rowCount` describe the server total,
while `cache.loadedRowCount` describes only cached row payloads that bc-grid has
actually loaded.

#### Client vs server / current-page grouping

The same `groupBy` shape covers three execution modes that look identical
in the chrome but differ in **which row set the grouping engine sees**.
Be explicit about which one your grid uses — they have very different
correctness implications.

- **`<BcGrid data={rows}>` — client full-data grouping.** Group buckets
  cover every row in `data` after client filter / search runs. Stable
  across pagination because the grid sees the full dataset.
- **`<BcServerGrid>` — server-owned query view.** bc-grid forwards
  `groupBy` to the consumer-supplied `loadPage` / `loadBlock` callback
  as `query.view.groupBy: ServerGroup[]` and renders the returned rows
  with manual row processing. The React layer does not client-sort,
  client-filter, client-search, client-group, or play row FLIP/enter
  animations against stale rows while the next server result is loading.
  Whether rendered rows reflect global grouping depends on whether the
  server applies the hint and returns the intended grouped/windowed row
  set. bc-grid does not synthesise server-aggregated group rows the
  server didn't return.

For bsncraft-style customer grids, the expected server-backed path is
to treat `query.view` as the source of truth, apply search / filter /
sort and any global grouping on the server, return the current page
rows plus `totalRows`, and use
`apiRef.current?.getServerDiagnostics()` to verify the active request
while integrating the endpoint.

A grouping change on the client resets the requested server page to
`0` (same reset rule as sort / filter / search / visible columns).
`query.viewKey` includes the group set so a stale response that
arrives after a user changes the grouping is dropped.

When `onServerRowMutation` is used with paged mode, optimistic edit patches are
tracked by row identity in the server-row-model mutation queue, not by the
current visible page. Changing pages, refetching the current page, or changing
sort/filter/search/group/visible-column state must not drop a pending edit; if
the edited row is loaded again before the mutation settles, the pending patch is
overlaid on the freshly returned server row. Accepted results clear the pending
patch and reconcile cached rows with the server result; rejected or conflict
results clear the pending patch and roll back cached rows to the last canonical
server value. The consumer still owns persistence, rejection/conflict policy, and
any explicit refresh after commit, while bc-grid owns preserving the pending
optimistic row state across page and view transitions.

The `LoadServerPage`, `LoadServerBlock`, and `LoadServerTreeChildren` types are declared in `@bc-grid/core` with the rest of the server query contract and re-exported through `@bc-grid/react`. Runtime cache/state-machine helpers live in `@bc-grid/server-row-model`.

`ServerPagedQuery.pivotState?: BcPivotState` and `ServerPagedResult.pivotedRows?: BcPivotedDataDTO` are reserved for server-side pivot pushdown. Client-side pivot uses the pure `@bc-grid/aggregations` engine; server-side pivot consumers can return the same JSON-safe DTO shape without exposing the engine's internal lookup maps.

Editable server-backed business grids use the same edit commit event as
`<BcGrid>` / `<BcEditGrid>`. If a consumer passes only `onCellEditCommit`,
`<BcServerGrid>` forwards the normal edit commit promise and does not queue a
server mutation, reload rows, or infer invalidation. That manual path is useful
when the application wants to call `BcServerGridApi.queueServerRowMutation`,
`settleServerRowMutation`, `invalidateServerRows`, or `refreshServerRows`
itself. If a consumer passes `onServerRowMutation`, bc-grid uses the managed
server edit path: it converts the edit into a `ServerRowPatch`, queues the
optimistic server-row-model mutation, awaits the consumer's persistence result,
settles the mutation, and rejects the edit overlay for rejected/conflict
results. The consumer still owns server validation copy, permission/conflict
policy, and deciding when an accepted edit should invalidate or reload the
current server view. The contract is documented in
[`docs/design/server-edit-grid-contract.md`](./design/server-edit-grid-contract.md).
The consumer-facing guide is in
[`apps/docs/src/pages/server-edit-grid.astro`](../apps/docs/src/pages/server-edit-grid.astro),
with a live example in `apps/examples/#server-edit-grid`.

### 5.4 Touch and coarse-pointer behaviour

Per [`docs/design/accessibility-rfc.md` §Pointer and Touch Fallback](./design/accessibility-rfc.md):

- **Coarse-pointer hit targets** — under `@media (pointer: coarse)`, every interactive surface in the grid (cells with action affordances, header column-menu / filter buttons, group + detail toggles, pagination controls, sidebar tabs, tool-panel chips, context-menu items, column chooser items, filter editor toggles, column-resize handle, and Q3 range-selection handles) is sized to a 44px minimum hit-target via the `--bc-grid-hit-target-min` CSS variable. The visible icon stays at its design size — only the touch area grows.
- **Tap delay disabled** — interactive surfaces ship with `touch-action: manipulation` so single-tap selection responds immediately (no 350ms tap delay) and `dblclick` fires reliably for two quick taps. This is a no-op on mouse pointers.
- **Single tap** focuses + selects the cell (same as a mouse click).
- **Double tap** activates edit mode on editable cells. Internally this routes through the same `onDoubleClick` handler the desktop double-click path uses; with `touch-action: manipulation` the browser fires `dblclick` after two quick taps. The pure timing primitive `isDoubleTap(prev, next, opts)` lives in `packages/react/src/touchInteraction.ts` (default thresholds: 300ms between taps, 16px movement tolerance) and is available for follow-up work that needs a JS-level fallback on platforms where browser-fired `dblclick` is unreliable.
- **Long press** (default 500ms) opens the context menu on coarse pointers (touch / pen). The press is cancelled if the pointer drifts more than 10px from the start, so a finger-drag flips cleanly into a scroll instead of firing a context menu. Mouse continues to use the native `contextmenu` event.
- **Compact density on a coarse pointer** lifts row + header heights to the `normal` density values so cells meet the 44px guideline, while font-size and padding keep their compact look. This is automatic — no consumer opt-in.
- **Header column-menu button** is hover-revealed on fine pointers; on coarse pointers it is always visible (touch has no hover signal to discover the affordance).
- **Pointer selection handles** introduced by the Q3 range-selection track are pre-styled to the 44px minimum via the `.bc-grid-range-handle` selector — they ship at the correct hit-target size from day one.

### 5.5 Master / detail and group-row disclosure motion (binding)

Master/detail row expansion and tree group expand/collapse follow a deliberately restrained motion contract. The visible "open" / "closed" state changes layout instantly; any accompanying animation is restricted to the disclosure chevron and the detail-panel content's first paint.

The contract:

- **No text scaling.** No `transform: scale()` ever runs over rows, cells, the toggle button, the toggle icon, or the detail panel — text glyphs must never grow / shrink during expansion. The shared `<DisclosureChevron>` component (`packages/react/src/internal/disclosure-icon.tsx`) is an inline SVG vector, so the rotation animation runs on a vector path, not on a text glyph. Replaces the previous `&gt;` text-character chevron and the CSS-pseudo-element border-arrow constructions, both of which exposed visible text or text-shaped pixels to the rotation transform.
- **No font-size morph.** The CSS rules for `.bc-grid-group-toggle`, `.bc-grid-detail-toggle`, `.bc-grid-detail-panel`, and `.bc-grid-row-expanded` never animate or transition `font-size`.
- **No height / max-height transitions.** The detail panel sets its `height` inline from `resolveDetailPanelHeight()`; no CSS transition or animation interpolates the height. Rows snap from `rowHeight` to `rowHeight + detailHeight` instantly.
- **Allowed motion (translate-only, gated by reduced-motion):** the detail-panel content (`.bc-grid-detail-panel-region`) fades in via the `@keyframes bc-grid-detail-panel-content-in` keyframe, which interpolates only `opacity` and `translateY(2px) → translateY(0)`. The chevron icons (`.bc-grid-group-toggle-icon`, `.bc-grid-detail-toggle-icon`) rotate via `transition: transform var(--bc-grid-motion-duration-fast) var(--bc-grid-motion-ease-standard)` when the parent toggle reports `aria-expanded="true"`. Both motions are zeroed out under `@media (prefers-reduced-motion: reduce)`.
- **ARIA labelling.** Every disclosure toggle carries `aria-expanded` (mirroring the open/closed state), `aria-controls` (linking to the panel id, when applicable), and `aria-label` ("Expand …" / "Collapse …"). The visible label / count text always renders **outside** the rotation target so the SVG transform never touches surrounding text.

The contract is enforced by tests in `packages/theming/tests/theming.test.ts` (CSS invariants) and `packages/react/tests/masterDetail.test.tsx` + `packages/react/tests/groupToggle.markup.test.tsx` (rendered markup). Adding a new disclosure surface (chevron-driven row expansion, tree node, etc.) should reuse `<DisclosureChevron>` and follow the same translate-only motion contract — pin a CSS invariant in `theming.test.ts` if the new surface needs its own selector.

---

## 6. Imperative API

For things that callbacks can't express. `apiRef` is provided by the consumer; bc-grid populates it on mount.

### 6.1 `BcGridApi<TRow>` (frozen at v0.1)

```ts
export interface BcGridApi<TRow = unknown> {
  // Scroll / focus
  scrollToRow(rowId: RowId, opts?: BcScrollOptions): void
  scrollToCell(position: BcCellPosition, opts?: BcScrollOptions): void
  focusCell(position: BcCellPosition): void
  isCellVisible(position: BcCellPosition): boolean

  // Lookups
  getRowById(rowId: RowId): TRow | undefined
  getActiveCell(): BcCellPosition | null
  getSelection(): BcSelection
  getRangeSelection(): BcRangeSelection
  getColumnState(): BcColumnStateEntry[]
  getFilter(): BcGridFilter | null

  // Mutations (controlled-state shortcuts; only effective in uncontrolled mode)
  setColumnState(state: BcColumnStateEntry[]): void
  setSort(sort: BcGridSort[]): void
  setFilter(filter: BcGridFilter | null): void
  clearFilter(columnId?: ColumnId): void
  setColumnPinned(columnId: ColumnId, pinned: "left" | "right" | null): void
  setColumnHidden(columnId: ColumnId, hidden: boolean): void
  autoSizeColumn(columnId: ColumnId): void
  setRangeSelection(selection: BcRangeSelection): void
  copyRange(range?: BcRange): Promise<void>
  clearRangeSelection(): void
  expandAll(): void
  collapseAll(): void

  // Refresh
  refresh(): void
}
```

`getFilter()` returns the current `BcGridFilter` (or `null` if no filter is
active). It is the read counterpart to `setFilter` and is the way the
`clear-column-filter` / `clear-all-filters` context-menu built-ins decide whether
they should be enabled.

`clearFilter(columnId?)` is a convenience wrapper around `setFilter`. With no
argument it clears the entire filter tree (same as `setFilter(null)`). With a
`columnId`, it removes only the leaves for that column from the filter tree,
collapsing surrounding `and` / `or` groups when only one branch survives.
Designed for surface-level "clear this column's filter" UX (context menu,
column header menu) without touching neighbouring columns. See
`docs/design/context-menu-command-map.md` §2.3.

`setColumnPinned(columnId, pinned)` walks the current `BcColumnStateEntry[]`
and updates only the targeted entry's `pinned` property. Convenience over
`setColumnState`: the rest of the column state is left untouched. Pass `null`
to unpin. See `docs/design/context-menu-command-map.md` §2.4.

`setColumnHidden(columnId, hidden)` walks the current column state and updates
only the targeted entry's `hidden` property. Same single-entry-edit shape as
`setColumnPinned`. See `docs/design/context-menu-command-map.md` §2.4.

`autoSizeColumn(columnId)` measures the rendered DOM cells in the column's
visible window (header + body) and writes the resulting width back through
`setColumnState`. Best-effort heuristic — off-screen rows are not measured
(consistent with AG Grid's `autoSizeColumn` behaviour, since the virtualizer
only mounts visible rows). The result is clamped to the column's `minWidth` /
`maxWidth` (defaulting to `[48, 800]`). No-op if the grid root is unmounted or
the column has no DOM cells. See `docs/design/context-menu-command-map.md`
§2.4 / §5.2.

### 6.2 `BcServerGridApi<TRow>` (frozen at v0.1)

Extends `BcGridApi<TRow>` with server-row-model methods from `server-query-rfc`:

```ts
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
```

Consumers with a websocket/SSE source can bridge push events into the grid with
`useServerRowUpdates(apiRef, subscribe)`. The hook subscribes to
`ServerRowUpdate<TRow>` events and forwards them to `applyServerRowUpdate`.
`rowAdded`, `rowUpdated`, and `rowRemoved` apply to loaded or stale cached
server rows by row identity. Visible insertions reuse the existing row-insertion
FLIP wiring; removal animation remains part of `animation-polish`.

For support/debug logging, call `apiRef.current?.getServerDiagnostics()` from a
developer panel or request logger. The returned snapshot includes the current
`ServerViewState`, summarized search/filter/sort/group/visible-column counts,
known row count, cache block states, pending mutation count, and the last
paged/block/tree load status plus request metadata. This is the recommended
way for bsncraft-style customer grids to verify exactly what bc-grid asked the
server for before debugging endpoint behavior. Diagnostics intentionally avoid
cached row payloads; call `getServerRowModelState()` only when you need the full
state snapshot.

---

## 7. Editor protocol

Cell editors live in `@bc-grid/editors` and are React components implementing `BcCellEditor`. The React protocol lives in `@bc-grid/react`; built-in editor definitions live in `@bc-grid/editors` and can be assigned directly to `column.cellEditor`.

```ts
export interface BcCellEditor<TRow, TValue = unknown> {
  /** Component that renders the editor inside the cell. */
  Component: React.ComponentType<BcCellEditorProps<TRow, TValue>>
  /** Optional async dependency (e.g., load lookup options) before the editor opens. */
  prepare?: (params: BcCellEditorPrepareParams<TRow>) => Promise<unknown>
  /** Optional preset key (text, number, date, ...) for built-in editor identification. */
  kind?: string
}

/**
 * Active-cell move directive applied after the editor unmounts. Mirrors
 * the keyboard model in `editing-rfc §Keyboard model in edit mode`.
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
   * values (number, date, select) can take ownership of keystroke
   * interception and pass the resolved move directly; editors that
   * defer to the wrapper's onKeyDown should call `commit(value)` with
   * no opts.
   */
  commit(newValue: TValue, opts?: { moveOnSettle?: BcEditMove }): void
  cancel(): void
  /** True after a `validate` call returned an error; the editor surfaces it. */
  error?: string
  /** Set focus on the editor's input; called by the grid on open. */
  focusRef?: React.RefObject<HTMLElement | null>
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
```

`<BcGrid>`, `<BcEditGrid>`, and `<BcServerGrid>` consume this protocol;
consumers can pass column.cellEditor as either a built-in (`textEditor`,
`numberEditor`, `checkboxEditor`, etc.) or a custom implementation.
`checkboxEditor` is a native `<input type="checkbox">` boolean editor:
Space toggles while editing through browser-native checkbox semantics, Enter /
Tab / Shift+Enter / Shift+Tab / Escape remain grid-owned by the editor portal,
and commit reads `input.checked` so the value emitted to `onCellEditCommit` is
a boolean. Tri-state checkbox editing is not part of the initial v0.4 slice.

### 7.1 Lookup, select, autocomplete, and checkbox editor guidance

Lookup-style editors are intentionally native-control based: `selectEditor`
renders `<select>`, `multiSelectEditor` renders `<select multiple>`,
`autocompleteEditor` renders `<input list>` + `<datalist>`, and
`checkboxEditor` renders `<input type="checkbox">`. They use the same editor
portal commit/cancel keys as other editors and expose the shared
`bc-grid-editor-input`, `data-bc-grid-editor-kind`, and
`data-bc-grid-editor-state` hooks for pending/error/disabled styling.

`selectEditor` and `multiSelectEditor` read `column.options`, either as a static
array or a row function:

```ts
import type { BcCellEditor, BcReactGridColumn } from "@bc-grid/react"
import { selectEditor } from "@bc-grid/editors"

type CustomerStatus = "prospect" | "active" | "hold"

interface CustomerRow {
  id: string
  status: CustomerStatus
}

const statusOptions: readonly { value: CustomerStatus; label: string }[] = [
  { value: "prospect", label: "Prospect" },
  { value: "active", label: "Active" },
  { value: "hold", label: "On hold" },
]

export const statusColumn: BcReactGridColumn<CustomerRow, CustomerStatus> = {
  field: "status",
  header: "Status",
  editable: true,
  cellEditor: selectEditor as unknown as BcCellEditor<CustomerRow, CustomerStatus>,
  options: statusOptions,
  validate: (next) =>
    statusOptions.some((option) => option.value === next)
      ? { valid: true }
      : { valid: false, error: "Choose a known status." },
}
```

The option `label` is display text. The option `value` is the committed value.
For `selectEditor` the committed value is a single typed option value; for
`multiSelectEditor` it is a typed array of selected option values. These editors
produce typed values directly, so `column.valueParser` is bypassed. Use
`valueParser` on string-producing editors such as `textEditor`, `numberEditor`,
the date/time editors, and `autocompleteEditor`.

`autocompleteEditor` calls `column.fetchOptions(query, signal)` after mount and
as the user types. Implementations should pass `signal` through to `fetch` or
equivalent request APIs so superseded lookups abort cleanly. A failed lookup is
not itself a validation error: bc-grid leaves the current suggestions as-is and
allows free-text editing to continue. Use `valueParser` and `validate` when the
typed string must resolve to a known domain value.

`checkboxEditor` commits a boolean and only treats the literal boolean `true` as
checked on mount. String and numeric lookalikes (`"true"`, `1`) stay unchecked,
so consumers that persist non-boolean values should map them before they reach
the editor or in `onCellEditCommit`.

Accessible names come from `column.header` when it is a plain string, then
`field`, then `columnId`. If a column uses a React header node, keep `field` or
`columnId` human-readable or provide a custom editor with its own label. Pending
async validation/server commit disables the native control; validation errors
surface through `aria-invalid`, `aria-describedby`, and the assertive live
region owned by the React editor protocol.

Server-backed consumers can use
`<BcServerGrid onServerRowMutation>` for the built-in patch/queue/settle path,
or wire `onCellEditCommit` manually with `BcServerGridApi.queueServerRowMutation`
and `BcServerGridApi.settleServerRowMutation`.

---

## 8. Server query types (location decision)

Per `server-query-rfc §Public Types`, the server-row-model types are:

`RowId`, `ColumnId`, `ServerRowModelMode`, `ServerSort`, `ServerFilter`, `ServerFilterGroup`, `ServerColumnFilter`, `ServerGroup`, `ServerViewState`, `ServerViewDiagnostics`, `ServerQueryBase`, `ServerLoadContext`, `ServerPagedQuery/Result`, `ServerBlockQuery/Result`, `ServerTreeQuery/Result`, `ServerQueryDiagnostics`, `ServerTreeRow`, `ServerGroupKey`, `ServerRowIdentity`, `ServerSelection`, `ServerSelectionSnapshot`, `ServerRowPatch`, `ServerMutationResult`, `ServerInvalidation`, `ServerCacheBlock`, `ServerCacheDiagnostics`, `ServerBlockKey`, `ServerBlockCacheOptions`, `ServerExportQuery`, `ServerExportResult`, `ServerRowUpdate`, `LoadServerPage`, `LoadServerBlock`, `LoadServerTreeChildren`, `ServerRowModelState`, `ServerRowModelDiagnostics`, `ServerRowModelEvent`, `ServerLoadDiagnostics`, `ServerLoadStatus`, `BcPivotState`, `BcPivotedDataDTO`.

`ServerQueryBase` is the shared shape every `ServerPagedQuery` / `ServerBlockQuery` / `ServerTreeQuery` extends (carries `view`, `requestId`, optional `viewKey`). `ServerRowIdentity` is the row-id contract (`rowId(row)` + optional `groupRowId`) the server-row-model passes to the React layer.

### 8.1 Decision: types live in `@bc-grid/core`; behaviour lives in `@bc-grid/server-row-model`

Reasoning:

- Multiple packages need the types (`react`, `server-row-model`, `filters`, `export`). Putting them in `core` avoids back-references.
- The state machine + cache + block fetcher (the *behaviour*) lives in `server-row-model` per design.md.
- `BcGridFilter` reuses `ServerFilter` directly. If types lived in `server-row-model`, `core` couldn't reference them without inverting the dependency graph.

So:

- **`@bc-grid/core` exports**: every type listed in `server-query-rfc §Public Types`.
- **`@bc-grid/server-row-model` exports**: the state machine factory, the cache, and pure diagnostics helpers (`summarizeServerViewState`, `summarizeServerQuery`, `summarizeServerCache`, `summarizeServerRowModelState`). Types come from `core`.
- **`@bc-grid/react` re-exports**: `LoadServerPage`, `LoadServerBlock`, `LoadServerTreeChildren`, `ServerRowPatch`, `ServerMutationResult`, `ServerRowUpdate`, `ServerRowModelDiagnostics`, `ServerQueryDiagnostics`, `ServerLoadDiagnostics`, `BcServerGridProps`, `BcServerGridApi`, `BcServerEditMutationEvent`, `BcServerEditMutationHandler`, `BcServerEditMutationProps`, `BcServerEditPatchFactory`, and `useServerRowUpdates` for consumer convenience.

### 8.2 Resolved review-comments from server-query-rfc

These came up in the review of `server-query-rfc`; this RFC pins them:

- **`ServerRowPatch.changes` keyed by `ColumnId`**: convention is `ColumnId === field` for editable columns. When a column's `field` is unset (computed columns aren't editable), it has no `changes` entry. Documented here for clarity; `server-query-rfc` keeps `Record<ColumnId, unknown>`.
- **`ServerExportQuery.maxRows` default**: 50,000 stays for fallback `loadAllRows`. ERP grids exceeding 50k rows must provide a server-side `exportRows` handler. Documented in component prop docs at impl time.
- **Group rowId default**: `viewKey` is always present (server-issued OR client-derived from `ServerViewState`); the `?? "view"` fallback is removed. `server-query-rfc` is updated as part of the merge.
- **`ServerTreeRow.rowId?` semantics**: leaf rows always derive `rowId` from the consumer's `rowId(row)` callback; the optional field on `ServerTreeRow` is for server-overridden group IDs only.
- **Streaming**: `ServerRowUpdate` types are exported; `BcServerGridApi.applyServerRowUpdate` applies them to loaded server-row-model state. `useServerRowUpdates` provides the consumer subscription bridge.

---

## 9. Public exports per package (frozen at v0.1)

Every export listed here is the v0.1 public API. CI runs `tools/api-surface-diff` after this RFC merges.

### `@bc-grid/core`

```ts
export {
  emptyBcPivotState,
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
}

// Framework-agnostic column/state/API types (§1.1-1.2, §3, §4, §6).
// All Server* types from server-query-rfc (§8).
// Helpers: ColumnId, RowId, BcCellPosition, BcRange, BcNormalisedRange,
//   BcRangeSelection, BcRangeKeyAction,
//   BcScrollAlign, BcScrollOptions, BcAggregation, BcGridIdentity, BcRowState,
//   BcPivotState, BcPivotValue, BcPivotedDataDTO, BcPivot*DTO.
// Excludes React component props, React renderers, refs, DOM events, and editor components.
```

The machine-checkable manifest for this package lives in `tools/api-surface/src/manifest.ts`. The manifest is the binding enforcement surface; this prose section is for reading.

### `@bc-grid/react`

```ts
// Components
export { BcGrid, BcEditGrid, BcServerGrid, BcStatusBar }

// Hooks
export { useBcGridApi, useAggregations, useServerRowUpdates }

// Helpers
export { resolveVisibleSegments }

// React-aware types plus @bc-grid/core re-exports for consumer convenience.
// (Re-exports let consumers import every column / state / loader type from one place.)
export type {
  // React-specific
  BcReactGridColumn as BcGridColumn,
  BcGridProps, BcEditGridProps, BcServerGridProps,
  BcGridStateProps, BcPaginationState,
  BcGridApi, BcServerGridApi,
  BcCellRendererParams, BcGridMessages, BcClipboardPayload,
  BcAggregationFormatterParams, BcAggregationScope, UseAggregationsOptions,
  BcCellEditor, BcCellEditorProps, BcCellEditorPrepareParams, BcCellEditCommitEvent,
  BcServerEditMutationEvent, BcServerEditMutationHandler,
  BcServerEditMutationProps, BcServerEditPatchFactory,
  BcEditGridAction,
  BcRangeBeforeCopyEvent, BcRangeBeforeCopyHook, BcRangeCopyEvent, BcRangeCopyHook,
  BcServerRowUpdateHandler, BcServerRowUpdateSubscribe, BcServerRowUpdateUnsubscribe,
  BcContextMenuBuiltinItem, BcContextMenuContext, BcContextMenuCustomItem,
  BcContextMenuItem, BcContextMenuItems,
  BcReactFilterDefinition, BcFilterEditorProps, BcFilterDefinition,
  BcSidebarBuiltInPanel, BcSidebarContext, BcSidebarCustomPanel, BcSidebarPanel,

  // Re-exports from @bc-grid/core
  BcCellPosition, BcSelection, BcRange, BcNormalisedRange, BcRangeSelection, BcRangeKeyAction,
  BcGridSort, BcGridFilter,
  BcColumnFilter, BcColumnFormat, BcColumnStateEntry,
  BcValidationResult, ColumnId, RowId,
  ServerRowPatch, ServerMutationResult,

  // Re-exports from @bc-grid/theming
  BcGridDensity,

  // Server row model types (re-exported from @bc-grid/core)
  LoadServerPage, LoadServerBlock, LoadServerTreeChildren,
  ServerLoadContext,
  ServerPagedQuery, ServerPagedResult,
  ServerBlockQuery, ServerBlockResult,
  ServerTreeQuery, ServerTreeResult,
  ServerRowUpdate,
}

// Reserved Q2 runtime exports, not shipped at v0.1:
// BcGridProvider, useBcGridContext, useCellEditor
```

The full enforced surface is in `tools/api-surface/src/manifest.ts`.

### `@bc-grid/virtualizer`

The consumer-facing core surface — what `@bc-grid/react` consumes and what every other package boundary respects:

```ts
export { Virtualizer }
export type {
  VirtualItem, VirtualOptions,
  VirtualizerA11yInput, VirtualRowA11yMeta, VirtualColumnA11yMeta,
}
```

Plus a small additional surface used by the React layer's renderer wiring (these are public so `@bc-grid/react` can import them without reaching into `dist/internals`, but consumers should treat them as engine-internals unless they're building their own renderer):

```ts
export { DOMRenderer }
export type {
  DOMRendererOptions, RenderCellParams,
  InFlightHandle, ScrollAlign,
  VirtualRow, VirtualCol, VirtualWindow,
  VirtualizerOptions, // @deprecated alias for VirtualOptions
}
```

The full enforced surface is in `tools/api-surface/src/manifest.ts`.

### `@bc-grid/animations`

The consumer-facing primitives — what the React layer wires up for sort / filter / row-flash:

```ts
export { flip, flash, slide, AnimationBudget }
export type { AnimationOptions, MotionPolicy }
```

The package additionally exports the FLIP building blocks (used by the React layer's sort animation and by anyone composing their own animations), the keyframe factories, and the budget constants. These are public so the React layer can avoid duplicating them, but the four primitives + two types above are the v0.1 consumer-facing API:

```ts
// Primitive helpers + budget constants
export {
  playFlip, calculateFlipDelta, readFlipRect, shouldAnimateDelta,
  createFlipKeyframes, createFlashKeyframes, createSlideKeyframes,
  resolveMotionPolicy, prefersReducedMotion,
  DEFAULT_ANIMATION_MAX_IN_FLIGHT, HARD_ANIMATION_MAX_IN_FLIGHT,
}
export type {
  FlipTarget, FlipOptions, FlipRect, FlipDelta,
  SlideOptions, SlideDirection,
  AnimationBudgetOptions,
}
```

The full enforced surface is in `tools/api-surface/src/manifest.ts`.

### `@bc-grid/theming`

```ts
export {
  bcGridDensities,
  bcGridDensityClasses,
  bcGridThemeVars,
  bcGridPreset,
  getBcGridDensityClass,
  getBcGridDensityVars,
  createBcGridThemeVars,
}

export type {
  BcGridDensity,
  BcGridCssVar,
  BcGridCssVars,
}

// CSS file (imported as side-effect)
import "@bc-grid/theming/styles.css"
```

The shipped CSS treats host shadcn tokens as complete CSS colors, so Tailwind v4
/ current shadcn OKLCH values work directly. Override `--bc-grid-*` tokens with
complete CSS colors (`oklch(...)`, `hsl(...)`, hex, or system colors) when grid
chrome needs to differ from the host app.

Row chrome precedence is intentionally layered: hover and the focused row use
soft backgrounds, selected rows use the selection background/foreground, the
active cell keeps its `--bc-grid-focus-ring` outline above row selection, and
dirty/pending/error cell side markers remain visible on active or selected
cells. Themes can target `data-bc-grid-focused-row="true"`,
`data-bc-grid-active-cell="true"`, and `data-bc-grid-cell-state`.

Column resize affordances use `--bc-grid-column-resize-affordance`,
`--bc-grid-column-resize-affordance-hover`, and
`--bc-grid-column-resize-affordance-active`. Resizable headers expose
`data-bc-grid-resizable="true"` and their drag targets expose
`data-bc-grid-resize-handle="true"`; while a resize drag is in flight the handle
sets `data-bc-grid-resizing="true"`.

### `@bc-grid/aggregations`

```ts
export {
  aggregate,
  aggregateColumns,
  aggregateGroups,
  aggregationRegistry,
  sum,
  count,
  avg,
  min,
  max,
  pivot,
  registerAggregation,
}
export type {
  AggregateOptions,
  Aggregation,
  AggregationContext,
  AggregationResult,
  PivotOptions,
  BcPivotedData,
  BcPivotRowNode,
  BcPivotColNode,
  BcPivotCell,
}
```

### `@bc-grid/filters`

```ts
export {
  textFilter, numberFilter, dateFilter, setFilter, booleanFilter,
  registerFilter,
  matchesFilter,
}
export type { BcFilterDefinition }
```

### `@bc-grid/export`

```ts
export { exportServerRows, toCsv, toExcel, toPdf }
export type {
  ExportOptions,
  ExportResult,
  LoadAllServerExportRows,
  ServerExportContext,
  ServerExportFlowOptions,
  ServerExportHandler,
  ServerExportRowsResult,
}
```

### `@bc-grid/server-row-model`

```ts
export { createServerRowModel, ServerBlockCache, defaultBlockKey }
// Types come from @bc-grid/core; not re-exported here.
```

`createServerRowModel({ onEvent })` emits `ServerRowModelEvent` values for diagnostics. The returned controller also exposes `getMetrics()` / `resetMetrics()` for benchmark instrumentation: cache hit rate, deduped requests, block fetch latency, queue wait time, queued request count, max queue depth, and eviction count. These metrics are diagnostic only; the public server query types still live in `@bc-grid/core`.

### `@bc-grid/editors`

```ts
export {
  textEditor,
  numberEditor,
  dateEditor,
  datetimeEditor,
  timeEditor,
  selectEditor,
  multiSelectEditor,
  autocompleteEditor,
  checkboxEditor,
}
```

### `@bc-grid/enterprise`

Reserved (Q5). No v0.1 exports.

---

## 10. API design principles (binding)

Re-stated from `design.md §9` and confirmed here:

- **Composition over flags.** Features come from sub-components / slots, not boolean props that toggle dozens of behaviours. (Counterexample: AG Grid's `enableRangeSelection` flag toggles half the feature set.)
- **Convention over config.** Defaults work for 80% of cases. Opt-in for the rest. Examples: `pagination={true}` is implicit when `data.length > pageSize`; `sortable: true` is the default per column.
- **Type-safe everywhere.** `<BcGrid<Customer>>` is parameterised; `field` autocompletes against `keyof Customer`; events carry typed payloads.
- **No imperative API except where necessary.** Most state via props/callbacks. `BcGridApi` only for things callbacks can't express (scroll-to, focus-cell, lookups).
- **No render props for hot paths.** Cells render via the column's `cellRenderer` (memoised). No slot composition per cell.
- **Stable across versions.** Every API addition reviewed for "is this consistent with the rest of the surface?" Breaking changes require a major version bump and a migration guide.
- **Engine packages have no React.** `core`, `virtualizer`, `animations`, `theming`, `aggregations`, `filters`, `export`, `server-row-model` are all framework-agnostic. `react` is the only React-knowing package (besides `editors` which is React-specific).

---

## 11. Resolved / deferred questions

1. **`BcGridProvider`**: a context provider for grid-wide config (locale, theme, storage backend, animation policy). Q2 deliverable. **Answer:** v0.1 uses `localStorage` for `gridId` persistence and does not export a provider. Provider override is reserved for Q2.
2. **Density and `rowHeight`**: are these mutually exclusive? **Proposal:** `density` sets a rowHeight via theming token; explicit `rowHeight` overrides. Density still affects header height + paddings even when `rowHeight` is overridden.
3. **`groupableColumns` redundancy with `groupable: true` per column**: the per-column `groupable` is the source of truth; `groupableColumns` (in `BcGridProps`) is reserved if/when we want UI-side filtering of which groupables appear in the dropdown. **Decision:** keep both; `groupableColumns` defaults to `columns.filter(c => c.groupable)`.
4. **Locale sources of truth**: grid `locale` prop vs `view.locale` (in `ServerViewState`) — for client grids, `BcGridProps.locale` is canonical. For server grids, `view.locale` is what the server sees; the grid copies the prop into the view state.
5. **`onCellEditCommit` event timing**: pre-commit (with cancel option) or post-commit only? **Decision:** post-commit only. Pre-commit validation is `column.validate`; cancelled edits do not emit `onCellEditCommit`.
6. **`BcRange` (range selection)**: declared in `core` for Q3. Does the v0.1 surface need to mention it at all? **Answer:** Track 2 unblocked the core state machine: `BcRangeSelection` and pure range helpers are exported from `@bc-grid/core`. React renders the active range overlay; clipboard paste and fill handle behavior remain separate implementation tasks.
7. **i18n message keys**: which strings are localizable at v0.1? **Proposal:** `BcGridMessages` covers loading state, no-rows, search placeholder, page-size label, group-by label, action-column label, action-menu items, sort-direction labels, accessibility live-region templates from `accessibility-rfc §Live Regions`.

---

## 12. Acceptance criteria

- ✅ Every property type-checked against `ag-grid-poc-audit §A` (column-property usage in bc-next): all 17 properties covered.
- ✅ Cross-references `accessibility-rfc` (focus model, role, ARIA hooks) — no contradictions.
- ✅ Consumes `server-query-rfc` types verbatim; pins location to `@bc-grid/core`.
- ✅ Public exports listed per package (§9).
- ✅ Stability tier marked on every property/type (frozen / reserved / experimental).
- ✅ Fresh-agent sign-off completed on the original RFC; follow-up API clarifications require their own review before merge.

## Process

1. RFC reviewed by a fresh agent.
2. Once merged, `docs/api.md` (this file) is the binding contract.
3. CI runs `tools/api-surface-diff` (built in `repo-foundation`) on every subsequent PR; non-empty diff → architect review.
4. Q2+ extensions append to this file; never edit a `frozen at v0.1` section without major version bump.
