import type { BcPaginationState } from "@bc-grid/core"
import {
  ChevronLeftDoubleIcon,
  ChevronLeftIcon,
  ChevronRightDoubleIcon,
  ChevronRightIcon,
} from "./internal/pagination-icons"

export const DEFAULT_CLIENT_PAGE_SIZE = 100
const DEFAULT_PAGE_SIZE_OPTIONS = [25, 50, 100, 250] as const

export interface PaginationWindow {
  page: number
  pageSize: number
  pageCount: number
  totalRows: number
  startIndex: number
  endIndex: number
}

interface BcGridPaginationProps {
  page: number
  pageCount: number
  pageSize: number
  pageSizeOptions: readonly number[]
  totalRows: number
  onChange: (next: BcPaginationState) => void
}

/**
 * Resolve `BcGridProps.pagination` per `api.md §5.1`. Convention over
 * config:
 * - `true` — force the built-in pager on, even for small datasets.
 * - `false` — never paginate, regardless of dataset size.
 * - `undefined` — auto-enable when `rowCount > pageSize`. Below the
 *   threshold the row set fits without paging, so the pager UI is
 *   suppressed to avoid the empty-pager footer churn.
 *
 * Pure function so the threshold is straightforward to unit-test
 * without rendering a grid.
 */
export function isPaginationEnabled(
  pagination: boolean | undefined,
  rowCount: number,
  pageSize: number,
): boolean {
  if (pagination === true) return true
  if (pagination === false) return false
  return rowCount > pageSize
}

/**
 * Resolve the row count the pager should reason from. Manual mode
 * (typically `BcServerGrid` paged rowModel) feeds the grid one page
 * of pre-sliced rows + the dataset total via `paginationTotalRows`;
 * the pager uses that total so "Rows X-Y of Z" reflects the server,
 * not the loaded slice. Falls back to the loaded slice length if the
 * consumer set `paginationMode="manual"` without supplying a finite
 * total — keeps the pager rendering rather than throwing.
 */
export function resolvePaginationRowCount(
  mode: "client" | "manual",
  paginationTotalRows: number | null | undefined,
  loadedRowCount: number,
): number {
  if (mode === "manual" && paginationTotalRows != null && Number.isFinite(paginationTotalRows)) {
    return Math.max(0, Math.floor(paginationTotalRows))
  }
  return loadedRowCount
}

/**
 * Resolve whether the pager should render. Manual mode forces the
 * pager on whenever `pagination !== false` so a server-paged source
 * gets visible page controls even if the loaded slice is smaller than
 * the threshold (e.g., the last page of a 36 k-row dataset has 2
 * rows). Client mode delegates to the threshold-based default.
 */
export function resolvePaginationEnabled(
  mode: "client" | "manual",
  pagination: boolean | undefined,
  rowCount: number,
  pageSize: number,
): boolean {
  if (mode === "manual") return pagination !== false
  return isPaginationEnabled(pagination, rowCount, pageSize)
}

export function normalisePageSizeOptions(options: readonly number[] | undefined): number[] {
  const values = options
    ?.map((value) => Math.floor(value))
    .filter((value) => Number.isFinite(value) && value > 0)

  const source = values && values.length > 0 ? values : DEFAULT_PAGE_SIZE_OPTIONS
  return [...new Set(source)].sort((a, b) => a - b)
}

export function getPaginationWindow(
  totalRows: number,
  requestedPage: number,
  requestedPageSize: number,
): PaginationWindow {
  const safeTotalRows = Math.max(0, Math.floor(totalRows))
  const pageSize = Math.max(1, Math.floor(requestedPageSize))
  const pageCount = Math.max(1, Math.ceil(safeTotalRows / pageSize))
  const page = clamp(Math.floor(requestedPage), 0, pageCount - 1)
  const startIndex = safeTotalRows === 0 ? 0 : page * pageSize
  const endIndex = Math.min(safeTotalRows, startIndex + pageSize)

  return {
    page,
    pageSize,
    pageCount,
    totalRows: safeTotalRows,
    startIndex,
    endIndex,
  }
}

export function BcGridPagination({
  page,
  pageCount,
  pageSize,
  pageSizeOptions,
  totalRows,
  onChange,
}: BcGridPaginationProps) {
  const canGoBack = page > 0
  const canGoForward = page < pageCount - 1
  const firstRow = totalRows === 0 ? 0 : page * pageSize + 1
  const lastRow = Math.min(totalRows, (page + 1) * pageSize)

  return (
    <nav className="bc-grid-pagination" aria-label="Pagination">
      <div className="bc-grid-pagination-summary" aria-live="polite">
        Rows {firstRow.toLocaleString()}-{lastRow.toLocaleString()} of {totalRows.toLocaleString()}
      </div>
      <div className="bc-grid-pagination-controls">
        <button
          type="button"
          className="bc-grid-pagination-button"
          disabled={!canGoBack}
          onClick={() => onChange({ page: 0, pageSize })}
          aria-label="First page"
        >
          {ChevronLeftDoubleIcon}
        </button>
        <button
          type="button"
          className="bc-grid-pagination-button"
          disabled={!canGoBack}
          onClick={() => onChange({ page: page - 1, pageSize })}
          aria-label="Previous page"
        >
          {ChevronLeftIcon}
        </button>
        <span className="bc-grid-pagination-page">
          Page {(page + 1).toLocaleString()} of {pageCount.toLocaleString()}
        </span>
        <button
          type="button"
          className="bc-grid-pagination-button"
          disabled={!canGoForward}
          onClick={() => onChange({ page: page + 1, pageSize })}
          aria-label="Next page"
        >
          {ChevronRightIcon}
        </button>
        <button
          type="button"
          className="bc-grid-pagination-button"
          disabled={!canGoForward}
          onClick={() => onChange({ page: pageCount - 1, pageSize })}
          aria-label="Last page"
        >
          {ChevronRightDoubleIcon}
        </button>
        <label className="bc-grid-pagination-size">
          <span>Rows</span>
          {/*
           * The wrapper is `position: relative` and an `::after`
           * chevron sits on the right edge, so the native `<select>`
           * gets right-padding to clear the affordance. Keeping the
           * native control here is intentional — it preserves the
           * platform dropdown UX (keyboard typeahead, OS-native scrim,
           * etc.) without bundling a popover primitive just for the
           * page-size knob.
           */}
          <span className="bc-grid-pagination-size-control">
            <select
              value={pageSize}
              onChange={(event) =>
                onChange({ page: 0, pageSize: Number(event.currentTarget.value) })
              }
            >
              {pageSizeOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </span>
        </label>
      </div>
    </nav>
  )
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
