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
| Global search | Available | AR Customers toolbar | `searchText`, `defaultSearchText`, `searchHotkey` |
| Row grouping (client / server-page-window) | Available | Columns panel "Group by" zone, header menu, controlled `groupBy` | `groupBy`, `defaultGroupBy`, `onGroupByChange`, `groupableColumns`, `groupsExpandedByDefault` |
| Columns, filters, and pivot panels | Available | Tool panels control or `?toolPanel=columns` / `?toolPanel=filters` / `?toolPanel=pivot` | `sidebar={["columns", "filters", "pivot"]}`, `pivotState` |
| Context menu | Available | Right-click grid cells | `contextMenuItems`, `showColumnMenu` |
| Cell editing | Available | `?edit=1` | `<BcEditGrid>`, `cellEditor` |
| Checkbox selection | Available | `?checkbox=1` | `checkboxSelection` |
| Layout persistence | Available | Host-owned saved views | `initialLayout`, `layoutState`, `onLayoutStateChange` |
| URL state persistence | Available | `?urlstate=1` | `gridId`, `urlStatePersistence` |
| Pagination | Available | `?pagination=1` | `pagination`, `pageSizeOptions` |
| Aggregations | Available | `?aggregations=1` | `aggregation`, `statusBar` |
| Master detail | Available | `?masterDetail=1` | `renderDetailPanel` |
| Auto / viewport fit | Available | `?autoHeight=1` | `height="auto"`, `fit` |
| Server row model | Available | Package API | `<BcServerGrid>` |
| Pivot grid rendering | Planned | Not exposed in examples | Pivot row/column rendering integration |
| Charts | Post-1.0 | Not exposed in examples | Future charts adapter |

## Layout sizing

Use `fit` when the host wants bc-grid to choose the root height. `fit="content"`
uses page-flow sizing, `fit="viewport"` measures from the grid's top edge to the
viewport bottom, and `fit="auto"` stays page-flow until the rendered content
would exceed the available viewport height. Explicit `height` still wins.

## Global search

bc-grid leaves the global search input to the host application. Keep the input
next to your app toolbar controls and pass the value through `searchText`:

```tsx
const searchInputRef = useRef<HTMLInputElement>(null)
const [searchText, setSearchText] = useState("")

return (
  <>
    <input
      ref={searchInputRef}
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
      searchHotkey
      searchInputRef={searchInputRef}
    />
  </>
)
```

Use `defaultSearchText` for an uncontrolled initial query. For a host-owned
search input, prefer controlling the query with `searchText` as shown above. Do
not combine `defaultSearchText` with `searchText` on the same grid. Enable
`searchHotkey` with `searchInputRef` when the grid should focus and select the
host search input on Cmd/Ctrl+F.

## Row grouping

bc-grid groups rows by one or more columns through the controlled
`groupBy` / uncontrolled `defaultGroupBy` prop pair plus three built-in
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

Per-column opt-in: set `groupable: true` on a column to surface it in
the panel and the header menu. The flag only controls discoverability —
`groupBy` will group by any column id you point it at.

### Client vs server grouping

The chrome looks identical across all three modes; the difference is
**which row set the grouping engine sees**.

- **`<BcGrid data={rows}>` — client full-data grouping.** Groups every
  row in `data` after client filter / search runs. Group buckets are
  stable across pagination because the grid sees the whole dataset.
- **`<BcServerGrid>` without server-side group support — current-page
  grouping.** bc-grid runs the same client engine, but it only sees
  the rows the server has loaded for the current page or block. Group
  buckets reflect that **slice**, not the global dataset. A "Region"
  group on page 2 of an unsorted server feed is "Region within page 2",
  not "Region across all customers".
- **`<BcServerGrid>` with server-side group delegation — full-dataset
  grouping.** bc-grid forwards `groupBy` to your `loadPage` /
  `loadBlock` callback as `query.view.groupBy: ServerGroup[]`. Whether
  the rendered groups span the full dataset depends entirely on
  whether your server applies the hint and returns rows in global
  group order (or returns server-aggregated group rows). bc-grid
  doesn't fabricate group rows the server didn't return — it groups
  whatever the server hands back using the same client engine.

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

### Current limitations (v0.4-alpha)

Honest list so consumers don't plan against features that aren't here
yet:

- **No imperative `setGroupBy` on `BcGridApi`.** Drive grouping
  through the controlled `groupBy` / `onGroupByChange` pair or
  `defaultGroupBy` for one-shot host-toolbar wiring. (Reserved for
  Q2.)
- **`<BcServerGrid>` does not synthesise server-aggregated group
  rows.** When the server returns rows already grouped (e.g. one
  payload per group with subtotals embedded), bc-grid renders them
  as ordinary rows. The expected production path is to return the
  rows in group order and let the client engine layer in group-row
  chrome over the loaded page; full server-aggregated group rows
  with subtotal payloads are a Q2 surface.
- **No drag-to-reorder of active group chips.** Users can add and
  remove groups from the Columns tool panel and the header menu,
  but reordering an existing chip means removing it and re-adding.
- **`groupsExpandedByDefault` is uncontrolled-only.** When the host
  controls `expansion` / `defaultExpansion`, the consumer's
  expansion set is the source of truth and the auto-expand pass is
  skipped.
- **Group-row aggregations cascade automatically; pivoted aggregations
  do not.** `aggregation: { type: "sum" }` reports a per-group
  subtotal and the global total in the status bar. A column's
  `aggregation` is independent of `pivotState`; pivoted rendering
  is reserved for a later slice.

### How to test grouping in the examples app

The `apps/examples` AR Customers demo wires `groupableColumns` to
`region`, `owner` (Collector), `terms`, and `status`. A focused
walkthrough:

1. **Surface the Columns tool panel.** Open the examples app at
   `?toolPanel=columns`. The right-rail panel shows every column with
   a "Group" button next to the four groupable rows and an "Add
   group" dropdown at the bottom of the "Group by" zone.
2. **Add a group.** Click "Group" next to *Region*, or pick *Region*
   from the "Add group" dropdown. The grid switches to `treegrid`
   role, group rows render with disclosure chevrons, and the data
   rows fold under the matching group bucket.
3. **Add a second group.** Repeat with *Status* — group rows now
   nest, with *Status* buckets inside *Region* buckets in the
   nesting order they were added.
4. **Verify the aggregation cascade.** With `?aggregations=1`, the
   `Balance` column's `sum` aggregation shows a global total in the
   status bar and a per-group subtotal painted on each group row's
   *Balance* cell. Collapse a group — the cascade keeps reporting
   the totals because aggregation runs over `data`, not visible rows.
5. **Verify expansion-state persistence.** With `?urlstate=1` or a
   `gridId` set, the expanded / collapsed state of each group row
   round-trips through the configured persistence backend; reload
   and the previously expanded groups stay open. (Visibility of
   the inline filter row never persists — see "Filter row toggle"
   below.)
6. **Switch to a server grid.** The `Server Edit Grid` example is
   the closest path to validating `query.view.groupBy` — open the
   network tab and watch the request fire when you add a group; the
   group set goes out as part of the view diagnostics. The server
   stub doesn't apply the group hint, so the rendered group buckets
   are page-window-scoped — useful for confirming the wire format
   without standing up a real server-side group endpoint.

See `docs/api.md` §3.1 (state pairs), §3.2 (state-shape types), and
§5.3 (server grid) for the typed surfaces.

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

Current main baseline for `core+virtualizer+animations+react`: ~99 KiB gzipped (post-v0.5 audit-refactor + v0.6 layout/in-cell-editor train). Enforced under a 150 KiB hard cap (raised 2026-05-03 from 100 KiB to absorb v0.6+ feature surface) with a 10% per-PR drift guard from the latest accepted main baseline by `tools/bundle-size`.

## Documentation

- API reference: `docs/api.md` in the bc-grid repo.
- Design RFCs: `docs/design/*.md`.
- Examples: `apps/examples/` (a 5,000-row AR Customers ledger demonstrating every shipped feature).

## License

UNLICENSED — proprietary, see [LICENSE](../../LICENSE).
