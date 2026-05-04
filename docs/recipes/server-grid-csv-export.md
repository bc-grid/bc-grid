# Server Grid CSV Export

Server-paged grids only have one page in memory at a time. Exporting the full result set means walking pages on the client OR sending the active view to the server and letting it stream the CSV. bc-grid v0.6 ships both helpers:

1. **`apiRef.current.getExportPlan()`** — pure read on `BcServerGridApi`. Returns `{ view, visibleColumns, columnHeaders, formatCellValue }`. Hand the `view` to your server endpoint, or feed the whole plan into `streamServerGridToCsv` for client-side walking.
2. **`streamServerGridToCsv({ plan, loadPage, onChunk, onProgress })`** — walks `loadPage` page-by-page, formats each row through `plan.formatCellValue`, emits CSV chunks via `onChunk`. Returns `{ totalRows, pagesLoaded }`.

## Server-rendered CSV (recommended)

Best when the result set is huge OR the consumer's data is already in the database — let the server stream the export. The grid hands you the active view; you POST it to your endpoint:

```tsx
import { useRef } from "react"
import { BcServerGrid, type BcServerGridApi } from "@bc-grid/react"

function CustomersGrid() {
  const apiRef = useRef<BcServerGridApi<Customer> | null>(null)

  async function handleExport() {
    const plan = apiRef.current?.getExportPlan()
    if (!plan) return
    const res = await fetch("/api/customers/export.csv", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        view: plan.view, // sort + filter + search + groupBy + visibleColumns + displayColumnOrder
        columns: plan.visibleColumns,
        headers: plan.columnHeaders,
      }),
    })
    const blob = await res.blob()
    downloadFile(blob, "customers.csv")
  }

  return (
    <>
      <button type="button" onClick={handleExport}>
        Export to CSV
      </button>
      <BcServerGrid<Customer>
        apiRef={apiRef}
        rowId={(row) => row.id}
        rowModel="paged"
        loadPage={loadCustomerPage}
        columns={customerColumns}
      />
    </>
  )
}
```

Server-side, decode `view` and run the same query you'd serve to `loadPage`, but stream rows into a CSV writer instead of paginating. The server controls the maximum row count + auth + memory.

## Client-driven export with `streamServerGridToCsv`

Use when the consumer doesn't have a server endpoint OR the result set is small enough to walk from the browser:

```tsx
import {
  streamServerGridToCsv,
  type BcServerGridApi,
} from "@bc-grid/react"

async function handleExport() {
  const plan = apiRef.current?.getExportPlan()
  if (!plan) return
  const chunks: string[] = []
  const result = await streamServerGridToCsv<Customer>({
    plan,
    loadPage: loadCustomerPage,
    pageSize: 1000, // larger than the UI's 100 to reduce round-trips
    onChunk: (chunk) => chunks.push(chunk),
    onProgress: ({ rowsLoaded, totalRows }) => {
      setProgress(totalRows ? rowsLoaded / totalRows : 0)
    },
  })
  console.log(`exported ${result.totalRows} rows in ${result.pagesLoaded} pages`)
  downloadFile(new Blob(chunks, { type: "text/csv" }), "customers.csv")
}
```

The header row is always emitted first via `onChunk`. Subsequent chunks contain one page's worth of rows ending in `\n`. Concatenate them in order to get the full CSV.

### Cancellation

```tsx
const controller = new AbortController()

streamServerGridToCsv({
  plan,
  loadPage,
  signal: controller.signal,
  onChunk,
})

// elsewhere:
controller.abort()
```

The signal is forwarded to each `loadPage` call. Aborting between pages stops the walk after the current page settles. Already-emitted chunks are kept; the consumer's CSV is truncated to the rows that landed before the abort.

### Progress UI

`onProgress` fires after each page. `totalRows` is whatever the server reported on the most recent page (typically stable from page 0). Use it to drive a determinate progress bar; fall back to indeterminate when undefined:

```tsx
const [progress, setProgress] = useState<number | "indeterminate">("indeterminate")

await streamServerGridToCsv({
  plan,
  loadPage,
  onChunk,
  onProgress: ({ rowsLoaded, totalRows }) => {
    if (typeof totalRows === "number" && totalRows > 0) {
      setProgress(rowsLoaded / totalRows)
    }
  },
})
```

## CSV escaping

`csvCell` and `csvRow` are exported separately for consumers building their own export pipelines. Both follow RFC 4180:

- Cells containing `,`, `"`, `\n`, or `\r` get wrapped in double quotes.
- Internal `"` characters are doubled (`"` → `""`).

```ts
import { csvCell, csvRow } from "@bc-grid/react"

csvCell("Acme, Inc.")       // → '"Acme, Inc."'
csvCell('Say "hi"')         // → '"Say ""hi"""'
csvRow(["Acme, Inc.", "active", "1234"])  // → '"Acme, Inc.",active,1234'
```

## When NOT to use these

- **Live spreadsheet editing** — for in-grid editing flows, use `<BcEditGrid>` + `onCellEditCommit`. Export is for read-only snapshots.
- **Cross-grid join exports** — these helpers walk one grid's `loadPage`. If the consumer needs to join across grids, the server-side path is the only sensible option.
- **PDF / XLSX** — these helpers emit CSV only. Use `ServerExportQuery` + a server-side renderer for richer formats.

## Caveats

- **`getExportPlan().view.visibleColumns` is the SET, `view.displayColumnOrder` is the SEQUENCE.** Per the v0.6 server-display-column-order PR (#487), `displayColumnOrder` is set only when the user has dragged a column to a non-default position. The export plan resolves to the display order via `view.displayColumnOrder ?? view.visibleColumns`, so the export respects the user's reorder when one is in effect.
- **`formatCellValue` runs the column's `valueFormatter` / `format`.** That means dates render in the column's locale (per the `BcGridProps.locale` prop), numbers respect `precision` / `thousands`, etc. Server-side renderers that want raw values should encode their own format from `view.locale` instead of using the plan's formatter.
- **No server-side dedup with `loadPage`'s cache.** `streamServerGridToCsv` calls `loadPage` directly with sequential `pageIndex` values starting at 0. The grid's block-cache + dedup machinery is bypassed; each export walk is a fresh server traversal. For repeated exports, the consumer should add their own throttling.
