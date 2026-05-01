# @bc-grid/react

The React layer for bc-grid — high-performance shadcn-native data grid. This is the package consumers install.

## Install

bc-grid is published to a **private GitHub Packages registry**. You need a Personal Access Token with `read:packages` + `repo` scopes (Classic PAT — fine-grained tokens are not yet reliable for cross-repo private package reads).

In your consuming app, add `.npmrc`:

```
@bc-grid:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

Then:

```bash
bun add @bc-grid/react @bc-grid/theming
```

`@bc-grid/theming` carries the CSS file you'll import below. The other engine packages (`@bc-grid/core`, `@bc-grid/virtualizer`, `@bc-grid/animations`, `@bc-grid/server-row-model`, `@bc-grid/export`, `@bc-grid/aggregations`, `@bc-grid/filters`) are pulled transitively.

See the [root README](../../README.md#install-from-private-github-packages) for full PAT setup instructions.

## Peer dependencies

- `react ^19.0.0`
- `react-dom ^19.0.0`

## Quick start

```tsx
import "@bc-grid/theming/styles.css"
import { BcGrid } from "@bc-grid/react"
import type { BcGridColumn } from "@bc-grid/core"

interface Customer {
  id: string
  name: string
  balance: number
}

const columns: BcGridColumn<Customer>[] = [
  { columnId: "name", header: "Name", field: "name", width: 200 },
  { columnId: "balance", header: "Balance", field: "balance", format: "currency", width: 140 },
]

const rows: Customer[] = [
  { id: "1", name: "Acme Inc", balance: 12_345 },
  { id: "2", name: "Globex", balance: 67_890 },
]

export function CustomerGrid() {
  return <BcGrid columns={columns} data={rows} rowId={(row) => row.id} />
}
```

## What you get from this package

- `<BcGrid>` — the read-only/click-to-select grid (Q1 vertical-slice features: sort, filter, pinned columns, row selection, search highlighting, tooltips, localStorage persistence).
- `<BcEditGrid>` — the editing-capable grid (cell-edit lifecycle, validation, dirty tracking, the editor framework from `editing-rfc`).
- `<BcServerGrid>` — server-row-model wrapper supporting `rowModel="paged"` and `rowModel="infinite"` (tree mode reserved).
- `useBcGridApi()` — imperative API hook (scroll-to-row, get-selection, etc.).

## Feature discovery map

The examples app keeps advanced chrome closed by default. Use these controls, URL flags, or props to find the shipped surface without changing the baseline AR Customers demo.

| Capability | Status | Example entry | API entry point |
| --- | --- | --- | --- |
| Sort, resize, pin | Available | AR Customers headers | `sortable`, `resizable`, `pinned` |
| Inline filters | Available | AR Customers filter row | `filter`, `showFilterRow` |
| Popup filters | Available | `?filterPopup=1` | `filter.variant = "popup"` |
| Global search | Available | AR Customers toolbar | `searchText`, `defaultSearchText` |
| Columns, filters, and pivot panels | Available | Tool panels control or `?toolPanel=columns` / `?toolPanel=filters` / `?toolPanel=pivot` | `sidebar={["columns", "filters", "pivot"]}`, `pivotState` |
| Context menu | Available | Right-click grid cells | `contextMenuItems`, `showColumnMenu` |
| Cell editing | Available | `?edit=1` — text / number / date / time / select / multi-select / autocomplete / checkbox | `<BcEditGrid>`, `editable`, `cellEditor`, `valueParser`, `validate` |
| Row grouping | Available | `?groupBy=region,status` — Columns panel "Group by" zone, header menu | `groupBy`, `defaultGroupBy`, `groupableColumns`, `groupsExpandedByDefault` |
| Checkbox selection | Available | `?checkbox=1` | `checkboxSelection` |
| Layout persistence | Available | Host-owned saved views | `initialLayout`, `layoutState`, `onLayoutStateChange` |
| URL state persistence | Available | `?urlstate=1` | `gridId`, `urlStatePersistence` |
| Pagination | Available | `?pagination=1` | `pagination`, `pageSizeOptions` |
| Aggregations | Available | `?aggregations=1` | `aggregation`, `statusBar` |
| Master detail | Available | `?masterDetail=1` | `renderDetailPanel` |
| Auto height | Available | `?autoHeight=1` | `height="auto"` |
| Server row model | Available | Package API | `<BcServerGrid>` |
| Pivot grid rendering | Planned | Not exposed in examples | Pivot row/column rendering integration |
| Charts | Post-1.0 | Not exposed in examples | Future charts adapter |

## Global search

bc-grid leaves the global search input to the host application. Keep the input
next to your app toolbar controls and pass the value through `searchText`:

```tsx
const [searchText, setSearchText] = useState("")

return (
  <>
    <input
      type="search"
      aria-label="Global search"
      value={searchText}
      onChange={(event) => setSearchText(event.currentTarget.value)}
    />
    <BcGrid
      columns={columns}
      data={rows}
      rowId={(row) => row.id}
      searchText={searchText}
    />
  </>
)
```

Use `defaultSearchText` for an uncontrolled initial query. For a host-owned
search input, prefer controlling the query with `searchText` as shown above. Do
not combine `defaultSearchText` with `searchText` on the same grid.

## Cell editing

Switch from `<BcGrid>` to `<BcEditGrid>` (or stay on `<BcGrid>` and pass
`editable: true` per column) to opt into in-grid editing. The package
ships nine built-in editors in `@bc-grid/editors` covering text,
number, date, datetime, time, single-select, multi-select,
autocomplete, and boolean checkbox cells.

```tsx
import {
  autocompleteEditor,
  checkboxEditor,
  dateEditor,
  numberEditor,
  selectEditor,
  textEditor,
} from "@bc-grid/editors"
import { BcEditGrid, type BcGridColumn } from "@bc-grid/react"

interface Customer {
  id: string
  legalName: string
  status: "prospect" | "active" | "hold"
  creditLimit: number
  lastInvoiceAt: string
  creditHold: boolean
  owner: string
}

const statusOptions = [
  { value: "prospect", label: "Prospect" },
  { value: "active", label: "Active" },
  { value: "hold", label: "On hold" },
] as const

const columns: BcGridColumn<Customer>[] = [
  {
    field: "legalName",
    header: "Legal name",
    editable: true,
    cellEditor: textEditor,
    valueParser: (input) => input.trim(),
    validate: (next) =>
      typeof next === "string" && next.length > 0
        ? { valid: true }
        : { valid: false, error: "Legal name is required." },
  },
  {
    field: "status",
    header: "Status",
    editable: true,
    cellEditor: selectEditor,
    options: statusOptions,
    // selectEditor / multiSelectEditor / checkboxEditor commit typed
    // option values directly — `valueParser` is bypassed for them.
  },
  {
    field: "creditLimit",
    header: "Credit limit",
    format: "currency",
    editable: true,
    cellEditor: numberEditor,
    valueParser: (input) => Number.parseFloat(input.replace(/,/g, "")) || 0,
    validate: (next) =>
      typeof next === "number" && next >= 0
        ? { valid: true }
        : { valid: false, error: "Credit limit must be ≥ 0." },
  },
  {
    field: "lastInvoiceAt",
    header: "Last invoice",
    format: "date",
    editable: true,
    cellEditor: dateEditor,
  },
  {
    field: "creditHold",
    header: "On hold",
    editable: true,
    cellEditor: checkboxEditor,
  },
  {
    field: "owner",
    header: "Collector",
    editable: true,
    cellEditor: autocompleteEditor,
    fetchOptions: async (query, signal) => {
      const response = await fetch(
        `/api/collectors?q=${encodeURIComponent(query)}`,
        { signal },
      )
      const items: { id: string; name: string }[] = await response.json()
      return items.map((c) => ({ value: c.id, label: c.name }))
    },
  },
]

return (
  <BcEditGrid
    columns={columns}
    data={rows}
    rowId={(row) => row.id}
    onCellEditCommit={async (event) => {
      // event.previousValue, event.nextValue, event.column, event.row
      // are typed against the column's TValue.
      await persistCellChange(event)
    }}
  />
)
```

### Value pipeline

For string-producing editors (`textEditor`, `numberEditor`, the
date / time editors, `autocompleteEditor`):

1. The editor commits a **string** — what the user typed.
2. `column.valueParser(input, row)` turns that string into the
   typed `TValue` (e.g. `Number.parseFloat`, ISO normalisation).
3. `column.validate(next, row)` returns
   `{ valid: true }` to commit or `{ valid: false, error }` to reject.
4. `onCellEditCommit({ row, column, previousValue, nextValue, source })`
   fires with the typed value. Return a Promise to gate the commit
   on a server round-trip.

For typed-value editors (`selectEditor`, `multiSelectEditor`,
`checkboxEditor`) `valueParser` is **bypassed** — the editor commits
the typed value directly.

### Pending, error, and dirty state

The grid surfaces edit lifecycle states through DOM hooks the editor
chrome reads:

| State | Cell hook | When |
| --- | --- | --- |
| Editing | `data-bc-grid-cell-state="editing"` | Editor portal mounted. |
| Pending | `data-bc-grid-cell-state="pending"` | Async `validate` or `onCellEditCommit` Promise in flight. Native control is disabled. |
| Error | `data-bc-grid-cell-state="error"` | `validate` returned an error or `onCellEditCommit` rejected. Editor stays mounted; the error string surfaces via `aria-invalid` and the assertive live region. |
| Dirty | `data-bc-grid-cell-state="dirty"` | Server-grid optimistic patch waiting on the server to settle. |

`@bc-grid/theming` styles every state through `--bc-grid-*` tokens; a
host re-tinting focus rings or destructive backgrounds gets the right
look without re-implementing the editor chrome.

### Server grids

`<BcServerGrid onServerRowMutation>` wires the built-in
patch / queue / settle path: bc-grid converts the edit into a
`ServerRowPatch`, queues the optimistic mutation, awaits the
consumer's persistence result, and reconciles on accept / reject.
Hosts that prefer to manage the queue themselves can pass
`onCellEditCommit` and call `BcServerGridApi.queueServerRowMutation` /
`settleServerRowMutation` directly.

### Custom editors

When a built-in editor isn't enough, implement `BcCellEditor`
directly — picker dialogs, multi-step forms, async pre-load. The
protocol is fully exported from `@bc-grid/react`:

```tsx
import type { BcCellEditor } from "@bc-grid/react"

const taxRegionEditor: BcCellEditor<Customer, string> = {
  kind: "tax-region",
  Component({ initialValue, commit, cancel, focusRef }) {
    return (
      <TaxRegionPicker
        ref={focusRef}
        defaultValue={initialValue}
        onSelect={(region) => commit(region, { moveOnSettle: "down" })}
        onDismiss={cancel}
      />
    )
  },
  async prepare({ row, signal }) {
    return { regions: await loadTaxRegions(row.country, signal) }
  },
}
```

See [`@bc-grid/editors` README](../../packages/editors/README.md)
for the per-editor catalog and the full
[Editor protocol §7](../../docs/api.md) reference.

## Row grouping

bc-grid groups rows by one or more columns through the controlled
`groupBy` / uncontrolled `defaultGroupBy` prop pair, plus three built-in
entry points so users can add a group without host code:

```tsx
<BcGrid
  columns={columns}
  data={rows}
  rowId={(row) => row.id}
  // Initial grouping (uncontrolled).
  defaultGroupBy={["region", "status"]}
  // Auto-expand new group rows so the grid reads as an organisational
  // view rather than a manual drill-down. Honoured only when the host
  // does NOT control `expansion`.
  groupsExpandedByDefault
  // Restrict the Columns-tool-panel "Group by" dropdown to this list.
  // Defaults to every column with `groupable: true`.
  groupableColumns={[
    { columnId: "region", header: "Region" },
    { columnId: "status", header: "Status" },
  ]}
  // Surface the Columns panel so users can add / remove groups.
  sidebar={["columns"]}
/>
```

Three ways a user can change the active groups:

1. **Columns tool panel** (`sidebar={["columns"]}`) — drag a column into the "Group by" zone, click the per-row "Group" button, or pick from the "Add group" dropdown.
2. **Column header menu** (the kebab on the right of every header) — "Group by this column" / "Remove from groups" for `groupable` columns.
3. **Controlled `groupBy`** — a host toolbar applies a saved view by setting the controlled prop directly.

Per-column opt-in: set `groupable: true` on a column to surface it in the panel and the header menu. The flag only controls discoverability — `groupBy` will group by any column id you point it at.

### Client vs server grouping

`<BcGrid data={rows}>` groups the **loaded client row model** — with
client data that's every row, so groups are stable across pagination.
With a server adapter the loaded client model is only the
already-fetched page / block, so client grouping reflects that slice,
not the global dataset.

`<BcServerGrid>` always sends `groupBy` in the query as
`query.view.groupBy: ServerGroup[]`. **True full-dataset grouping
depends on the server**: if your back end groups before returning, the
chrome shows the global rollup; if it ignores the hint, the client
engine groups only the loaded page and the chrome still paints group
rows but they're a slice, not the global view. For production server
grids prefer **query delegation** — read `query.view.groupBy` in your
loader and return rows already grouped server-side.

```ts
const loadPage: LoadServerPage<Customer> = async (query, { signal }) => {
  const params = new URLSearchParams({
    page: String(query.pageIndex),
    pageSize: String(query.pageSize),
    groupBy: query.view.groupBy.map((g) => g.columnId).join(","),
  })
  const response = await fetch(`/api/customers?${params}`, { signal })
  const { rows, totalRows } = await response.json()
  return { rows, totalRows }
}
```

Grouping changes reset the requested server page to `0`, the same
reset that fires on sort / filter / search / visible-column changes.

See `docs/api.md` §4.5 "Grouping" for the full decision table (client
full-data vs server page-window vs server query delegation),
persistence behaviour, and group-row chrome details.

## Filter row toggle

Some host apps want a toolbar "Show filters" button that hides the inline
filter row without losing the active filter state. The grid splits the two
concerns: `showFilterRow` controls whether the editor row paints,
`columnFilterText` (and the controlled `filter` / `defaultFilter` pair)
holds the actual filter that decides which rows show. Toggling visibility
never clears state.

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
    />
  </>
)
```

Resolution rules:

- `showFilterRow={true}` — force the inline row visible, even if every
  configured column is `filter: { variant: "popup" }`. Popup-variant cells
  render empty in the row; the per-column funnel button on the header stays
  reachable in either visibility state.
- `showFilterRow={false}` — force the row hidden. The grid keeps the active
  filter applied to the row set; `BcGridApi.clearFilter()` is the only
  operation that resets filter state.
- `showFilterRow={undefined}` (default) — column-driven: the row paints when
  at least one column declares an inline-variant filter, otherwise it stays
  hidden so popup-only grids don't carry an empty filter row.

`showFilters` is a back-compat alias accepted alongside `showFilterRow`. The
grid resolves them as `props.showFilterRow ?? props.showFilters`, so a host
that already passes `showFilters` keeps working; new code should prefer
`showFilterRow`. If both are supplied, `showFilterRow` wins.

Visibility is **never persisted** through `gridId` localStorage or
`urlStatePersistence`. A toolbar toggle is per-mount host state, while filter
state (and column state, density, page size, sidebar panel) is what the
persistence layer round-trips. Reload the page and the row visibility
follows the toolbar's default; the active filter survives.

## Context menu column commands

The `contextMenuItems` prop accepts an array of built-in IDs (or a factory
that returns one). The bundled defaults cover clipboard + range:

```ts
import { DEFAULT_CONTEXT_MENU_ITEMS } from "@bc-grid/react"

DEFAULT_CONTEXT_MENU_ITEMS
// ["copy", "copy-row", "copy-with-headers",
//  "separator", "clear-selection", "clear-range"]
```

Column commands (pin / hide / autosize) and filter-clearing are
**consumer-opt-in** — they're not in the defaults because every grid has a
slightly different idea of what belongs in the right-click menu. Spread the
defaults and append the column commands you want; everything below is wired
to existing `BcGridApi` methods and renders through the same
`BcGridMenuItem` primitive as the bundled items, so no extra install or
custom item is needed:

```tsx
import {
  BcGrid,
  DEFAULT_CONTEXT_MENU_ITEMS,
  type BcContextMenuItems,
} from "@bc-grid/react"

const contextMenuItems: BcContextMenuItems<Customer> = [
  ...DEFAULT_CONTEXT_MENU_ITEMS,
  "separator",
  "clear-column-filter",
  "clear-all-filters",
  "separator",
  "pin-column-left",
  "pin-column-right",
  "unpin-column",
  "separator",
  "hide-column",
  "show-all-columns",
  "autosize-column",
  "autosize-all-columns",
]

return (
  <BcGrid
    columns={columns}
    data={rows}
    rowId={(row) => row.id}
    contextMenuItems={contextMenuItems}
  />
)
```

Adjacent separators are collapsed automatically, so consumers can group
freely without worrying about doubled dividers when an item list happens to
land empty in a particular trigger context.

### Disabled-state expectations

Column commands disable themselves when the action would be a no-op or
when the trigger context is missing — consumers don't need to gate them
manually. The grid re-evaluates each item every time the menu opens.

- `pin-column-left` / `pin-column-right` — disabled when the column is
  already in the target pin state, or when the right-click didn't land on
  a column (e.g. the menu was opened from a body cell with no column
  context).
- `unpin-column` — disabled when the column isn't pinned.
- `hide-column` — disabled when the column is already hidden, when there's
  no column context, **and** when the column is the last visible one (so a
  user can't strand themselves out of the chooser).
- `show-all-columns` — disabled when every column is already visible.
- `autosize-column` — disabled when the column has no DOM to measure (no
  context or hidden).
- `autosize-all-columns` — disabled when every column is hidden.
- `clear-column-filter` — disabled when there's no cell context, or when
  that column has no active filter entry.
- `clear-all-filters` — disabled when no filter is active across the grid.
- `copy` / `copy-with-headers` — disabled when there's neither a cell
  context nor an active range selection.
- `copy-cell` — disabled when there's no cell context.
- `copy-row` — disabled when there's no cell or row context.

For row-conditional custom items (e.g. "Open customer", "Deactivate"),
pass `contextMenuItems` as a factory and gate on `ctx.row` directly —
falsy entries are filtered, so `ctx.row && { … }` reads cleanly. See
`docs/api.md §5.1` for the full ID table and the
`@bc-grid/react` docs site for an end-to-end recipe.

## Layout persistence

Use `initialLayout` for a one-time saved-view restore and
`onLayoutStateChange` to capture the current JSON-safe layout. Consumers own
storage; bc-grid does not write localStorage for this API.

```tsx
import type { BcGridLayoutState } from "@bc-grid/react"

const [layout, setLayout] = useState<BcGridLayoutState | undefined>(() =>
  loadCustomerGridLayout(),
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

The layout snapshot covers column order, width/flex, pinning, visibility,
sort, filter, search text, group-by, density, sidebar panel, and public
pagination state. Unknown columns are ignored on restore; missing columns keep
their current/default state.

## Bundle size

Current main baseline for `core+virtualizer+animations+react`: 72.75 KiB gzipped. Enforced under a 100 KiB hard cap with a 10% per-PR drift guard from the latest accepted main baseline by `tools/bundle-size`.

## Documentation

- API reference: `docs/api.md` in the bc-grid repo.
- Design RFCs: `docs/design/*.md`.
- Examples: `apps/examples/` (a 5,000-row AR Customers ledger demonstrating every shipped feature).

## License

UNLICENSED — proprietary, see [LICENSE](../../LICENSE).
