# RFC: Public API v0 (api-rfc-v0)

**Status:** Not started
**Owner:** TBD (claim from `docs/queue.md`)
**Reviewer:** fresh agent (assigned at PR time)
**Blocks:** `core-types`, `react-impl-v0`, anything that imports from `@bc-grid/*`

---

This RFC defines the binding public API surface for bc-grid v0.1. Once landed and reviewed, the result becomes `docs/api.md` and is **frozen** — every PR thereafter runs an API-surface diff in CI; non-empty diff requires architect sign-off.

## What this RFC must cover

### 1. `BcGridColumn<TRow>` — every property
- `field: keyof TRow` (required, type-safe against the row type)
- `header: string | React.ReactNode`
- `width: number | "auto"` / `flex: number` / `minWidth` / `maxWidth`
- `align: "left" | "right" | "center"`
- `pin: "left" | "right" | undefined`
- `sortable: boolean | "asc" | "desc"`
- `comparator: (a, b) => number` (custom sort)
- `filter: { type: "text" | "number" | "date" | "set" | ... } | false`
- `valueGetter: (row) => unknown` (compute a value from the row)
- `valueFormatter: (value) => string` (display formatting)
- `valueParser: (input: string) => TValue` (for cell editing — parse user input back to typed value)
- `cellRenderer: (params) => React.ReactNode` (custom cell rendering)
- `cellEditor: CellEditor<TValue>` (which editor to use)
- `cellClassName: string | ((row) => string)`
- `aggregation: "sum" | "avg" | ... | { type, ... }` (for grouped/footer)
- `format: "currency" | "percent" | "number" | "date" | { ... }` (preset formatters)
- TODO: enumerate the rest. AG Grid `ColDef` is the upper bound — pick what bc-next actually needs (per `ag-grid-poc-audit`).

### 2. Row identity rules

- `rowId: (row: TRow) => string` (required; how the grid identifies a row across reloads / sorts / filters)
- For server-row-model: server returns row IDs that the grid trusts; consumers can override with `rowId`.
- IDs are stable across data refreshes. Rows with new IDs are treated as new (animate-in); rows whose IDs disappear animate out.

### 3. Controlled vs uncontrolled state

For each piece of state, there's a controlled (`<state>` + `on<State>Change`) and uncontrolled (`default<State>`) pair:

- Sort: `sort` / `onSortChange` / `defaultSort`
- Filter: `filter` / `onFilterChange` / `defaultFilter`
- Selection: `selection` / `onSelectionChange` / `defaultSelection`
- Expansion: `expansion` / `onExpansionChange` / `defaultExpansion`
- Column state: `columnState` / `onColumnStateChange` / `defaultColumnState`

Spec the shape of each state object.

### 4. Event names + payloads

Every event the grid fires:

- `onSortChange(newSort, prevSort)`
- `onFilterChange(newFilter, prevFilter)`
- `onCellEditCommit({ row, column, oldValue, newValue })`
- `onCellEditCancel(...)`
- `onCellFocus({ rowId, columnId })`
- `onRangeSelect(range)` (Q3)
- `onScroll({ scrollTop, scrollLeft })`
- TODO: enumerate every event and its payload type.

### 5. `BcGridApi` (imperative escape hatch)

For things callbacks can't express:

- `scrollToRow(rowId, opts)`
- `scrollToCell({ rowId, columnId }, opts)`
- `focusCell({ rowId, columnId })`
- `getSelectedRows()`
- `getActiveCell()`
- `setColumnState(columnState)`
- `expandAll()` / `collapseAll()`
- `refresh()`

### 6. Server query objects (input to `loadRows` / `loadBlock` / `loadChildren`)

```ts
interface ServerQuery {
  // pagination
  page?: number
  pageSize?: number
  // OR for infinite mode:
  blockStart?: number
  blockSize?: number
  // sort, filter, group state — typed
  sort?: ServerSort[]
  filter?: ServerFilter
  groupBy?: string[]
  groupKeys?: unknown[]  // when fetching children of a specific group path
}

interface ServerBlockResult<T> {
  rows: T[]
  totalRowsHint?: number
  hasMore?: boolean
}
```

(Server-row-model RFC defines the full shape; this RFC just pins the public-facing types.)

### 7. Public exports per package

For each package, the exhaustive list of public exports.

`@bc-grid/core`:
- Types: `BcGridColumn`, `BcRow`, `BcGridApi`, `BcCellPosition`, `BcRange`, `ServerQuery`, `ServerBlockResult`, etc.
- (No runtime exports — types only.)

`@bc-grid/react`:
- Components: `BcGrid`, `BcEditGrid`, `BcServerGrid`
- Hooks: `useBcGridApi`, `useCellEditor`
- (Re-exports types from `@bc-grid/core`.)

`@bc-grid/aggregations`:
- Functions: `sum`, `avg`, `count`, `min`, `max`
- Types: `Aggregation`, `AggregationResult`

`@bc-grid/filters`:
- Predicates: per filter type
- Serialise/parse: per filter type
- Types: `Filter`, `FilterDefinition`

`@bc-grid/export`:
- Functions: `toCsv`, `toExcel`, `toPdf`
- (Each takes rows + columns; returns Blob or string.)

`@bc-grid/server-row-model`:
- State machine: `createServerRowModel(opts)`
- Types: `ServerRowModelState`, `ServerRowModelEvent`

`@bc-grid/editors`:
- Components: `TextEditor`, `NumberEditor`, `DateEditor`, `SelectEditor`, etc.

`@bc-grid/virtualizer`:
- Class: `Virtualizer`
- Types: `VirtualItem`, `VirtualOptions`

`@bc-grid/animations`:
- Functions: `flip`, `flash`, `slide`
- Class: `AnimationBudget`

`@bc-grid/theming`:
- Tailwind preset: `bcGridPreset`
- (CSS variables defined in stylesheet.)

### 8. API design principles (binding)

- **Composition over flags** — features come from sub-components and slots.
- **Convention over config** — defaults work for 80% of cases; opt-in for the rest.
- **Fully typed** — `<BcGrid<Customer>>` is parameterised.
- **No imperative API except where necessary** — most state via props/callbacks; imperative `BcGridApi` only when callbacks can't.
- **No render props for hot paths** — cells render via column's `render` (memoised), not slot composition.
- **Stable across versions** — every API addition reviewed for consistency with the rest of the surface.

## Process

1. RFC author drafts the spec into this file (or replaces it).
2. Architect reviews + comments.
3. Fresh agent reviews (no prior context).
4. Iterate to alignment.
5. Author copies the final spec into `docs/api.md` and updates this RFC's status to `[done]` in `queue.md`.
6. Public API frozen. CI surface-diff turns on after this lands.

## Open questions to resolve in the RFC

- Should we use `field: keyof TRow` strictly, or allow `field: string` (escape hatch for nested/computed)?
- `rowId` callback or convention (`row.id`)? AG Grid uses `getRowId` callback; cleaner. Lean: callback.
- How do controlled-only props interact with `BcGridApi.refresh()`?
- Is `BcServerGrid` a separate component or a mode of `BcGrid`?
