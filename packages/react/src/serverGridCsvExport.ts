import type {
  BcExportPlan,
  ColumnId,
  LoadServerPage,
  ServerLoadContext,
  ServerPagedQuery,
} from "@bc-grid/core"

/**
 * Per-page progress event fired by `streamServerGridToCsv` after
 * each page settles successfully. Worker1 v0.6 CSV export
 * server-page-stream.
 */
export interface StreamServerGridToCsvProgress {
  pageIndex: number
  rowsLoaded: number
  totalRows: number | undefined
}

export interface StreamServerGridToCsvInput<TRow> {
  /** Plan from `apiRef.current.getExportPlan()`. Carries `view` + visible columns + per-cell formatter. */
  plan: BcExportPlan<TRow>
  /** Same loader the grid is using. Walked page-by-page from page 0 until the server returns 0 rows or `totalRows` is reached. */
  loadPage: LoadServerPage<TRow>
  /**
   * Page size for the export walk. Default `1000` — larger than the
   * UI's typical 100 to reduce round-trips on big exports.
   * Independent of the grid's currently-rendered pageSize.
   */
  pageSize?: number
  /**
   * Optional abort signal. Forwarded to each `loadPage` call;
   * aborting between pages stops the walk after the current page
   * settles.
   */
  signal?: AbortSignal
  /**
   * Receives the CSV header row first, then one chunk per loaded
   * page. Each chunk ends with a trailing newline so consumers can
   * concatenate without delimiter-tracking. Synchronous — write to
   * a stream / file / memory string here.
   */
  onChunk: (chunk: string) => void
  /** Optional progress callback fired after each page settles. */
  onProgress?: (progress: StreamServerGridToCsvProgress) => void
}

export interface StreamServerGridToCsvResult {
  totalRows: number
  pagesLoaded: number
}

const DEFAULT_EXPORT_PAGE_SIZE = 1000

/**
 * Walks `loadPage` page-by-page, formats each row through
 * `plan.formatCellValue`, and emits CSV string chunks via
 * `onChunk`. Returns the total rows + pages loaded after the walk
 * completes.
 *
 * Use after `apiRef.current.getExportPlan()` to drive a CSV
 * download from the consumer side without server-side rendering:
 *
 * ```ts
 * const plan = apiRef.current.getExportPlan()
 * const chunks: string[] = []
 * await streamServerGridToCsv({
 *   plan,
 *   loadPage,
 *   onChunk: (chunk) => chunks.push(chunk),
 *   onProgress: ({ rowsLoaded, totalRows }) =>
 *     setProgress(totalRows ? rowsLoaded / totalRows : 0),
 * })
 * downloadFile(new Blob(chunks, { type: "text/csv" }), "export.csv")
 * ```
 *
 * The header row is always emitted first, even when the export
 * resolves zero rows. Worker1 v0.6 CSV export server-page-stream.
 */
export async function streamServerGridToCsv<TRow>(
  input: StreamServerGridToCsvInput<TRow>,
): Promise<StreamServerGridToCsvResult> {
  const pageSize = input.pageSize ?? DEFAULT_EXPORT_PAGE_SIZE
  // Header row first.
  input.onChunk(
    `${csvRow(input.plan.visibleColumns.map((id) => input.plan.columnHeaders[id] ?? id))}\n`,
  )

  let pageIndex = 0
  let totalRowsSeen = 0
  let totalRows: number | undefined
  while (true) {
    if (input.signal?.aborted) break
    const query: ServerPagedQuery = {
      mode: "paged",
      view: input.plan.view,
      pageIndex,
      pageSize,
      requestId: `csv-export-${pageIndex}`,
    }
    // Use the consumer's AbortSignal when supplied; otherwise feed
    // a fresh controller's signal so the loader's `ctx.signal` always
    // exists (per `ServerLoadContext.signal: AbortSignal` non-optional
    // contract).
    const ctx: ServerLoadContext = {
      signal: input.signal ?? new AbortController().signal,
    }
    const result = await input.loadPage(query, ctx)
    totalRows = typeof result.totalRows === "number" ? result.totalRows : totalRows

    if (result.rows.length > 0) {
      const lines = result.rows.map((row) =>
        csvRow(
          input.plan.visibleColumns.map((columnId) => input.plan.formatCellValue(columnId, row)),
        ),
      )
      input.onChunk(`${lines.join("\n")}\n`)
      totalRowsSeen += result.rows.length
    }

    input.onProgress?.({ pageIndex, rowsLoaded: totalRowsSeen, totalRows })

    // Stop conditions: empty page, or we've reached/exceeded the
    // server-reported totalRows.
    if (result.rows.length === 0) break
    if (typeof totalRows === "number" && totalRowsSeen >= totalRows) break
    pageIndex += 1
  }

  return { totalRows: totalRowsSeen, pagesLoaded: pageIndex + 1 }
}

/**
 * Formats a row of cell strings as a single CSV line. Quotes
 * cells that contain `,`, `"`, `\n`, or `\r`; doubles internal
 * `"` per RFC 4180. Exported for unit testing.
 */
export function csvRow(cells: readonly string[]): string {
  return cells.map(csvCell).join(",")
}

/**
 * RFC 4180 CSV cell escaping. Exported for unit testing.
 */
export function csvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

/** Re-export for consumers that want both helpers from one path. */
export type { BcExportPlan, ColumnId }
