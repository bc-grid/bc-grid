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
| Columns and filters panels | Available | Tool panels control or `?toolPanel=columns` / `?toolPanel=filters` | `sidebar={["columns", "filters"]}` |
| Context menu | Available | Right-click grid cells | `contextMenuItems`, `showColumnMenu` |
| Cell editing | Available | `?edit=1` | `<BcEditGrid>`, `cellEditor` |
| Checkbox selection | Available | `?checkbox=1` | `checkboxSelection` |
| URL state persistence | Available | `?urlstate=1` | `gridId`, `urlStatePersistence` |
| Pagination | Available | `?pagination=1` | `pagination`, `pageSizeOptions` |
| Aggregations | Available | `?aggregations=1` | `aggregation`, `statusBar` |
| Master detail | Available | `?masterDetail=1` | `renderDetailPanel` |
| Auto height | Available | `?autoHeight=1` | `height="auto"` |
| Server row model | Available | Package API | `<BcServerGrid>` |
| Pivot panel and charts | Planned | Not exposed in examples | Pivot UI and charts adapter |

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
      onSearchTextChange={(next) => setSearchText(next)}
    />
  </>
)
```

Use `defaultSearchText` for an uncontrolled initial query. Do not combine it
with `searchText` on the same grid.

## Bundle size

Current main baseline for `core+virtualizer+animations+react`: 64.05 KiB gzipped. Enforced under a 100 KiB hard cap with a 10% per-PR drift guard from the latest accepted main baseline by `tools/bundle-size`.

## Documentation

- API reference: `docs/api.md` in the bc-grid repo.
- Design RFCs: `docs/design/*.md`.
- Examples: `apps/examples/` (a 5,000-row AR Customers ledger demonstrating every shipped feature).

## License

UNLICENSED — proprietary, see [LICENSE](../../LICENSE).
