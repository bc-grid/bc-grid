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
| Inline filters (quick filter row) | Available | AR Customers filter row — single value input per column | `filter`, `showFilterRow` |
| Popup filters (header funnel) | Available | `?filterPopup=1` — advanced operators, ranges, set pickers | `filter.variant = "popup"` |
| Global search | Available | AR Customers toolbar | `searchText`, `defaultSearchText` |
| Columns, filters, and pivot panels | Available | Tool panels control or `?toolPanel=columns` / `?toolPanel=filters` / `?toolPanel=pivot` | `sidebar={["columns", "filters", "pivot"]}`, `pivotState` |
| Context menu | Available | Right-click grid cells | `contextMenuItems`, `showColumnMenu` |
| Cell editing | Available | `?edit=1` | `<BcEditGrid>`, `cellEditor` |
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

## Choosing a filter surface

bc-grid ships three filter surfaces. They share one persistence shape
(`BcGridFilter`), so a value typed in any surface round-trips into the
others without re-encoding. Pick per column — they compose freely.

| Surface | Best for | Configure with |
| --- | --- | --- |
| **Inline filter row** (under the header) | Quick filters — type a value, watch the row set narrow. The row is the high-frequency entry point: always visible, scannable across columns. | Default for any `filter: { type: … }` without `variant: "popup"`. |
| **Popup filter** (header funnel button) | Advanced operators / modifiers that don't fit a quick-filter row — `between`, regex, case-sensitive, set-of-values. Reachable from the header, opens in place, returns focus on dismiss. | `filter: { type: …, variant: "popup" }`. |
| **Filters tool panel** (`sidebar={["filters"]}`) | Reading the active filter set at a glance + advanced editing. Each active filter renders as a card with operator + value summary. | Add `"filters"` to `sidebar`. |

Recommended shadcn-first defaults:

1. **Inline for high-frequency text / id / status columns** — leave them as `filter: { type: "text" }` (or omit `filter` for a default text filter) so users get a one-input quick-filter row.
2. **Popup variant for advanced operators or set pickers** — anything with a `between` operator, multi-value picker, regex toggle, or case-sensitive flag. `filter: { type: "set", variant: "popup" }` is the typical pattern: the inline row stays compact while the funnel button on the header surfaces the picker.
3. **Filters panel for "review what's active"** — add `"filters"` to `sidebar` whenever the grid commonly carries 3+ simultaneous filters or whenever the host needs a one-click "clear all" + per-filter editing surface.

```tsx
const columns: BcGridColumn<Customer>[] = [
  { field: "name",          header: "Name",     filter: { type: "text" } },                  // inline
  { field: "balance",       header: "Balance",  filter: { type: "number-range" } },          // inline range
  { field: "status",        header: "Status",   filter: { type: "set", variant: "popup" } }, // header funnel
  { field: "lastInvoiceAt", header: "Invoice",  filter: { type: "date", variant: "popup" } },// header funnel
  { field: "notes",         header: "Notes",    filter: false },                             // never filterable
]

<BcGrid
  columns={columns}
  data={rows}
  rowId={(row) => row.id}
  sidebar={["columns", "filters"]} // surface the Filters panel from the rail
/>
```

The popup-variant funnel button is reachable on the header even when
`showFilterRow={false}`, so a host can hide the inline row entirely
without losing access to popup filters.

See `docs/api.md` §4.4 "Choosing a filter surface — inline vs popup vs
panel" for the full decision table and persistence interop details.

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
