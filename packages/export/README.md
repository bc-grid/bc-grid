# @bc-grid/export

CSV / XLSX / PDF export serializers for bc-grid.

## Install

```bash
bun add @bc-grid/export
```

XLSX and PDF use peer dependencies — install only the formats you need:

```bash
# For XLSX
bun add exceljs

# For PDF
bun add jspdf
```

CSV is dependency-free.

## Use

```ts
import { exportServerRows, toCsv, toExcel, toPdf } from "@bc-grid/export"

const csvText = toCsv(rows, columns, { delimiter: "," })

const xlsxBuffer = await toExcel(rows, columns, { sheetName: "Customers" })
//   { content: Uint8Array, mimeType, extension: "xlsx" }

const pdfBuffer = await toPdf(rows, columns, { title: "Customer ledger" })
//   { content: Uint8Array, mimeType, extension: "pdf" }

const serverResult = await exportServerRows(query, columns, {
  exportRows: (query, { signal }) => fetchServerExport(query, signal),
  loadAllRows: (query, { signal }) => loadEveryMatchingRow(query, signal),
})
//   { kind: "blob", blob } | { kind: "url", url } | { kind: "job", jobId }
```

## What each does

- **`toCsv`**: pure serializer. Quotes fields containing the delimiter, newlines, quotes, or leading/trailing whitespace. Optional UTF-8 BOM (`bom: true`) for legacy Excel.
- **`toExcel`**: ExcelJS-backed. Native `numFmt` on numeric/currency/percent/date cells (so spreadsheet users get re-editable numbers, not text). Frozen header row with autoFilter.
- **`toPdf`**: jsPDF-backed. A4 landscape by default, paged with header repeat, content-width-aware column sizing.
- **`exportServerRows`**: server-mode export coordinator. It prefers a consumer-supplied `exportRows(query)` handler that can return a blob, URL, or async job id. If no server export handler is supplied, it calls `loadAllRows(query)` up to `maxRows` (default 50,000) and serializes locally through the format-specific exporters.

Each respects the column's `valueGetter` / `valueFormatter` / `format` chain so the exported value matches what's rendered in the grid.

## License

UNLICENSED — proprietary, see [LICENSE](../../LICENSE).
