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

  // --- Aggregation (reserved for Q5) --------------------------------------

  /**
   * Footer / group-row aggregation for this column.
   * Q1 + Q2 do not surface aggregation in the grid; this property is
   * declared here so the API doesn't break when Q5 ships.
   * @reserved Q5
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
  type: "text" | "number" | "date" | "set" | "boolean" | "custom"
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

export type BcValidationResult =
  | { valid: true }
  | { valid: false; error: string }

export type BcScrollAlign = "start" | "center" | "end" | "nearest"

export interface BcScrollOptions {
  align?: BcScrollAlign
}
```

`BcScrollAlign` and `BcScrollOptions` are the named alias for the `opts` shape on `BcGridApi.scrollToRow` / `scrollToCell` (§6.1). They live in `@bc-grid/core` so that consumers writing their own scroll helpers can type the options without redeclaring the union.

### 1.3 React column extension (frozen at v0.1 in `@bc-grid/react`)

`@bc-grid/react` widens the framework-agnostic core column with React rendering hooks. The React package exports this type as its consumer-facing `BcGridColumn`.

```ts
export type BcReactGridColumn<TRow, TValue = unknown> =
  Omit<BcGridColumn<TRow, TValue>, "header"> & {
    /** Header label or custom React header content. */
    header: string | React.ReactNode

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
     * Cell editor component. Required when `editable` is true and the column
     * is part of a `BcEditGrid`.
     * @reserved Q2
     */
    cellEditor?: BcCellEditor<TRow, TValue>
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

### 3.1 The pairs (frozen at v0.1)

| State | Controlled prop | Change event | Uncontrolled default |
|---|---|---|---|
| Sort | `sort: BcGridSort[]` | `onSortChange(next, prev)` | `defaultSort` |
| Search text | `searchText: string` | `onSearchTextChange(next)` | `defaultSearchText` |
| Filter | `filter: BcGridFilter` | `onFilterChange(next, prev)` | `defaultFilter` |
| Selection | `selection: BcSelection` | `onSelectionChange(next, prev)` | `defaultSelection` |
| Expansion | `expansion: ReadonlySet<RowId>` | `onExpansionChange(next, prev)` | `defaultExpansion` |
| Group-by | `groupBy: ColumnId[]` | `onGroupByChange(next, prev)` | `defaultGroupBy` |
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

  filter?: BcGridFilter
  defaultFilter?: BcGridFilter
  onFilterChange?: (next: BcGridFilter, prev: BcGridFilter) => void

  selection?: BcSelection
  defaultSelection?: BcSelection
  onSelectionChange?: (next: BcSelection, prev: BcSelection) => void

  expansion?: ReadonlySet<RowId>
  defaultExpansion?: ReadonlySet<RowId>
  onExpansionChange?: (next: ReadonlySet<RowId>, prev: ReadonlySet<RowId>) => void

  groupBy?: readonly ColumnId[]
  defaultGroupBy?: readonly ColumnId[]
  onGroupByChange?: (next: readonly ColumnId[], prev: readonly ColumnId[]) => void

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

Controlled-state callbacks use React's `onXChange` naming, not AG Grid's `onXChanged` naming, because they are the setter pair for the controlled prop. Domain events that are not controlled-state setters use verb/event names (`onCellEditCommit`, `onRowClick`, `onServerError`).

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
```

When `gridId` is set, the React layer persists `columnState`, `pageSize`, `density`, and `groupBy` to `localStorage` by default. A consumer-provided storage backend via `<BcGridProvider storage={...}>` is reserved for Q2 and is not exported at v0.1.

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

### 4.4 Filter shape (frozen at v0.1)

Per-column `filter` declares **what kind of filter UI to show** and what parser to use; the actual filter state is in `BcGridFilter` (which mirrors `ServerFilter` from `server-query-rfc` for parity with server grids).

Built-in filter types: `text`, `number`, `date`, `set`, `boolean`. Custom filters register via `@bc-grid/filters` (Q2 deliverable; the registry shape is below for forward compatibility).

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
  height="auto"      // "auto" | number (px) — default fills available

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
  pagination={true}        // false to disable; default true if data > pageSize threshold
  pageSizeOptions={[25, 50, 100, 250]}

  // Grouping
  groupableColumns={[{ columnId: "region", header: "Region" }]}
  groupsExpandedByDefault={true}

  // Show / hide inactive (read-only convention)
  showInactive={false} onShowInactiveChange={setShowInactive}
  rowIsInactive={(row) => row.active === "N"}

  // Slots
  toolbar={<MyToolbar />}
  footer={<MyFooter />}

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
export interface BcGridProps<TRow> extends BcGridIdentity, BcGridStateProps {
  /** Row data (client-side). For server-side, use BcServerGrid. */
  data: readonly TRow[]
  columns: readonly BcReactGridColumn<TRow>[]
  rowId: BcRowId<TRow>

  // Layout
  density?: "compact" | "normal" | "comfortable"
  height?: "auto" | number
  rowHeight?: number   // override the density default

  // Pagination
  pagination?: boolean
  pageSizeOptions?: number[]

  // Grouping
  groupableColumns?: readonly { columnId: ColumnId; header: string }[]
  groupsExpandedByDefault?: boolean

  // Active filter convention
  showInactive?: boolean
  onShowInactiveChange?: (next: boolean) => void
  rowIsInactive?: (row: TRow) => boolean

  // Slots
  toolbar?: React.ReactNode
  footer?: React.ReactNode

  // Read-only events
  onRowClick?: (row: TRow, event: React.MouseEvent) => void
  onRowDoubleClick?: (row: TRow, event: React.MouseEvent) => void
  onCellFocus?: (position: BcCellPosition) => void
  onVisibleRowRangeChange?: (range: { startIndex: number; endIndex: number }) => void

  // Imperative
  apiRef?: React.RefObject<BcGridApi<TRow> | null>

  // i18n
  locale?: string
  messages?: Partial<BcGridMessages>

  // Loading
  loading?: boolean
  loadingOverlay?: React.ReactNode

  // Accessibility
  ariaLabel?: string
  ariaLabelledBy?: string
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
  /** Post-commit edit event. Reserved Q2. */
  onCellEditCommit?: (event: BcCellEditCommitEvent<TRow>) => void
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
  apiRef?: React.RefObject<BcServerGridApi<TRow> | null>
}

export interface BcServerInfiniteProps<TRow> extends Omit<BcGridProps<TRow>, "apiRef" | "data"> {
  rowModel: "infinite"
  blockSize?: number          // default 100
  maxCachedBlocks?: number    // default 20
  blockLoadDebounceMs?: number
  maxConcurrentRequests?: number
  loadBlock: LoadServerBlock<TRow>
  apiRef?: React.RefObject<BcServerGridApi<TRow> | null>
}

export interface BcServerTreeProps<TRow> extends Omit<BcGridProps<TRow>, "apiRef" | "data"> {
  rowModel: "tree"
  loadChildren: LoadServerTreeChildren<TRow>
  /** Required when the tree's root needs an initial fetch. */
  loadRoots?: LoadServerTreeChildren<TRow>
  apiRef?: React.RefObject<BcServerGridApi<TRow> | null>
}
```

The `LoadServerPage`, `LoadServerBlock`, and `LoadServerTreeChildren` types are declared in `@bc-grid/core` with the rest of the server query contract and re-exported through `@bc-grid/react`. Runtime cache/state-machine helpers live in `@bc-grid/server-row-model`.

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
  getColumnState(): BcColumnStateEntry[]

  // Mutations (controlled-state shortcuts; only effective in uncontrolled mode)
  setColumnState(state: BcColumnStateEntry[]): void
  setSort(sort: BcGridSort[]): void
  setFilter(filter: BcGridFilter): void
  expandAll(): void
  collapseAll(): void

  // Refresh
  refresh(): void
}
```

### 6.2 `BcServerGridApi<TRow>` (frozen at v0.1)

Extends `BcGridApi<TRow>` with server-row-model methods from `server-query-rfc`:

```ts
export interface BcServerGridApi<TRow = unknown> extends BcGridApi<TRow> {
  refreshServerRows(opts?: { purge?: boolean }): void
  invalidateServerRows(invalidation: ServerInvalidation): void
  retryServerBlock(blockKey: ServerBlockKey): void
  getServerRowModelState(): ServerRowModelState<TRow>
}
```

---

## 7. Editor protocol (reserved for Q2)

Cell editors live in `@bc-grid/editors` and are React components implementing `BcCellEditor`. The React protocol lives in `@bc-grid/react`; editor factories live in `@bc-grid/editors`. The protocol is declared at v0.1 so React column types can reference it; no editor factories ship until Q2.

```ts
export interface BcCellEditor<TRow, TValue = unknown> {
  /** Component that renders the editor inside the cell. */
  Component: React.ComponentType<BcCellEditorProps<TRow, TValue>>
  /** Optional async dependency (e.g., load lookup options) before the editor opens. */
  prepare?: (params: BcCellEditorPrepareParams<TRow>) => Promise<unknown>
  /** Optional preset key (text, number, date, ...) for built-in editor identification. */
  kind?: string
}

export interface BcCellEditorProps<TRow, TValue = unknown> {
  initialValue: TValue
  row: TRow
  rowId: RowId
  column: BcReactGridColumn<TRow, TValue>
  commit(newValue: TValue): void
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

The `<BcEditGrid>` and (Q2) editing variant of `<BcGrid>` consume this protocol; consumers can pass column.cellEditor as either a built-in (`textEditor()`, `numberEditor()`) or a custom implementation.

---

## 8. Server query types (location decision)

Per `server-query-rfc §Public Types`, the server-row-model types are:

`RowId`, `ColumnId`, `ServerRowModelMode`, `ServerSort`, `ServerFilter`, `ServerFilterGroup`, `ServerColumnFilter`, `ServerGroup`, `ServerViewState`, `ServerQueryBase`, `ServerLoadContext`, `ServerPagedQuery/Result`, `ServerBlockQuery/Result`, `ServerTreeQuery/Result`, `ServerTreeRow`, `ServerGroupKey`, `ServerRowIdentity`, `ServerSelection`, `ServerSelectionSnapshot`, `ServerRowPatch`, `ServerMutationResult`, `ServerInvalidation`, `ServerCacheBlock`, `ServerBlockKey`, `ServerBlockCacheOptions`, `ServerExportQuery`, `ServerExportResult`, `ServerRowUpdate` (reserved), `LoadServerPage`, `LoadServerBlock`, `LoadServerTreeChildren`, `ServerRowModelState`, `ServerRowModelEvent`.

`ServerQueryBase` is the shared shape every `ServerPagedQuery` / `ServerBlockQuery` / `ServerTreeQuery` extends (carries `view`, `requestId`, optional `viewKey`). `ServerRowIdentity` is the row-id contract (`rowId(row)` + optional `groupRowId`) the server-row-model passes to the React layer.

### 8.1 Decision: types live in `@bc-grid/core`; behaviour lives in `@bc-grid/server-row-model`

Reasoning:

- Multiple packages need the types (`react`, `server-row-model`, `filters`, `export`). Putting them in `core` avoids back-references.
- The state machine + cache + block fetcher (the *behaviour*) lives in `server-row-model` per design.md.
- `BcGridFilter` reuses `ServerFilter` directly. If types lived in `server-row-model`, `core` couldn't reference them without inverting the dependency graph.

So:

- **`@bc-grid/core` exports**: every type listed in `server-query-rfc §Public Types`.
- **`@bc-grid/server-row-model` exports**: the state machine factory, the cache, helper utilities. No types — types come from `core`.
- **`@bc-grid/react` re-exports**: `LoadServerPage`, `LoadServerBlock`, `LoadServerTreeChildren`, `BcServerGridProps`, `BcServerGridApi` for consumer convenience.

### 8.2 Resolved review-comments from server-query-rfc

These came up in the review of `server-query-rfc`; this RFC pins them:

- **`ServerRowPatch.changes` keyed by `ColumnId`**: convention is `ColumnId === field` for editable columns. When a column's `field` is unset (computed columns aren't editable), it has no `changes` entry. Documented here for clarity; `server-query-rfc` keeps `Record<ColumnId, unknown>`.
- **`ServerExportQuery.maxRows` default**: 50,000 stays for fallback `loadAllRows`. ERP grids exceeding 50k rows must provide a server-side `exportRows` handler. Documented in component prop docs at impl time.
- **Group rowId default**: `viewKey` is always present (server-issued OR client-derived from `ServerViewState`); the `?? "view"` fallback is removed. `server-query-rfc` is updated as part of the merge.
- **`ServerTreeRow.rowId?` semantics**: leaf rows always derive `rowId` from the consumer's `rowId(row)` callback; the optional field on `ServerTreeRow` is for server-overridden group IDs only.
- **Streaming**: `ServerRowUpdate` types are exported; no built-in subscription API in v1.0. Consumers handle invalidation manually.

---

## 9. Public exports per package (frozen at v0.1)

Every export listed here is the v0.1 public API. CI runs `tools/api-surface-diff` after this RFC merges.

### `@bc-grid/core`

```ts
// Types only (no runtime exports).
// Framework-agnostic column/state/API types (§1.1-1.2, §3, §4, §6).
// All Server* types from server-query-rfc (§8).
// Helpers: ColumnId, RowId, BcCellPosition, BcRange (Q3-reserved),
//   BcScrollAlign, BcScrollOptions, BcAggregation, BcGridIdentity, BcRowState.
// Excludes React component props, React renderers, refs, DOM events, and editor components.
```

The machine-checkable manifest for this package lives in `tools/api-surface/src/manifest.ts`. The manifest is the binding enforcement surface; this prose section is for reading.

### `@bc-grid/react`

```ts
// Components
export { BcGrid, BcEditGrid, BcServerGrid }

// Hooks
export { useBcGridApi }

// React-aware types plus @bc-grid/core re-exports for consumer convenience.
// (Re-exports let consumers import every column / state / loader type from one place.)
export type {
  // React-specific
  BcReactGridColumn as BcGridColumn,
  BcGridProps, BcEditGridProps, BcServerGridProps,
  BcGridStateProps, BcPaginationState,
  BcGridApi, BcServerGridApi,
  BcCellRendererParams, BcGridMessages,
  BcCellEditor, BcCellEditorProps, BcCellEditorPrepareParams, BcCellEditCommitEvent,
  BcEditGridAction,
  BcReactFilterDefinition, BcFilterEditorProps, BcFilterDefinition,

  // Re-exports from @bc-grid/core
  BcCellPosition, BcSelection, BcGridSort, BcGridFilter,
  BcColumnFilter, BcColumnFormat, BcColumnStateEntry,
  BcValidationResult, ColumnId, RowId,

  // Re-exports from @bc-grid/theming
  BcGridDensity,

  // Server row model types (re-exported from @bc-grid/core)
  LoadServerPage, LoadServerBlock, LoadServerTreeChildren,
  ServerLoadContext,
  ServerPagedQuery, ServerPagedResult,
  ServerBlockQuery, ServerBlockResult,
  ServerTreeQuery, ServerTreeResult,
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
  registerAggregation,
}
export type { AggregateOptions, Aggregation, AggregationContext, AggregationResult }
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
export { toCsv, toExcel, toPdf }
export type { ExportOptions, ExportResult }
```

### `@bc-grid/server-row-model`

```ts
export { createServerRowModel, ServerBlockCache, defaultBlockKey }
// Types come from @bc-grid/core; not re-exported here.
```

### `@bc-grid/editors`

```ts
// No v0.1 runtime exports. Reserved Q2 export shape:
// export {
//   textEditor, numberEditor, dateEditor, datetimeEditor,
//   selectEditor, multiSelectEditor, autocompleteEditor,
// }
// Each future export is a `BcCellEditor` factory.
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
6. **`BcRange` (range selection)**: declared in `core` for Q3. Does the v0.1 surface need to mention it at all? **Answer:** declared as `@reserved Q3`, not implemented; consumers can't use it but the type exists so future component props can reference it.
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
