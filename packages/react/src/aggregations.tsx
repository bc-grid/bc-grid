import { type AggregationResult, aggregateColumns } from "@bc-grid/aggregations"
import type {
  BcGridColumn as BcCoreGridColumn,
  BcRowId,
  BcSelection,
  ColumnId,
} from "@bc-grid/core"
import type { CSSProperties, ReactNode } from "react"
import { useMemo } from "react"
import {
  type ResolvedColumn,
  cellStyle,
  classNames,
  pinnedClassName,
  pinnedEdgeClassName,
  pinnedEdgeFor,
} from "./gridInternals"
import { isRowSelected } from "./selection"
import type { BcAggregationScope, BcReactGridColumn } from "./types"
import { formatPresetValue } from "./value"

export interface UseAggregationsOptions<TRow> {
  scope?: BcAggregationScope
  allRows?: readonly TRow[] | undefined
  rowId?: BcRowId<TRow> | undefined
  selection?: BcSelection | undefined
  locale?: string | undefined
}

export interface BcGridAggregationFooterRowProps<TRow> {
  columns: readonly ResolvedColumn<TRow>[]
  results: readonly AggregationResult[]
  locale?: string | undefined
  position?: "top" | "bottom"
  rowHeight: number
  rowIndex: number
  scrollLeft: number
  totalWidth: number
  viewportWidth: number
}

export function useAggregations<TRow>(
  rows: readonly TRow[],
  columns: readonly BcReactGridColumn<TRow>[],
  options: UseAggregationsOptions<TRow> = {},
): readonly AggregationResult[] {
  const scopedRows = useMemo(
    () =>
      resolveAggregationRows({
        allRows: options.allRows ?? rows,
        rowId: options.rowId,
        rows,
        scope: options.scope ?? "filtered",
        selection: options.selection,
      }),
    [options.allRows, options.rowId, options.scope, options.selection, rows],
  )

  return useMemo(
    () =>
      aggregateColumns(
        scopedRows,
        columns as readonly BcCoreGridColumn<TRow>[],
        options.locale ? { locale: options.locale } : {},
      ),
    [columns, options.locale, scopedRows],
  )
}

export function BcGridAggregationFooterRow<TRow>({
  columns,
  results,
  locale,
  position = "bottom",
  rowHeight,
  rowIndex,
  scrollLeft,
  totalWidth,
  viewportWidth,
}: BcGridAggregationFooterRowProps<TRow>): ReactNode {
  const resultsByColumnId = aggregationResultsByColumnId(results)
  if (resultsByColumnId.size === 0 || columns.length === 0) return null

  return (
    // biome-ignore lint/a11y/useSemanticElements: The virtualized grid uses ARIA grid roles on positioned divs.
    <div className="bc-grid-aggregation-footer-viewport" data-position={position} role="rowgroup">
      <AggregationFooterRowCells
        columns={columns}
        locale={locale}
        resultsByColumnId={resultsByColumnId}
        rowHeight={rowHeight}
        rowIndex={rowIndex}
        scrollLeft={scrollLeft}
        totalWidth={totalWidth}
        viewportWidth={viewportWidth}
      />
    </div>
  )
}

function AggregationFooterRowCells<TRow>({
  columns,
  locale,
  resultsByColumnId,
  rowHeight,
  rowIndex,
  scrollLeft,
  totalWidth,
  viewportWidth,
}: Omit<BcGridAggregationFooterRowProps<TRow>, "results"> & {
  resultsByColumnId: ReadonlyMap<ColumnId, AggregationResult>
}): ReactNode {
  return (
    <div
      className="bc-grid-aggregation-footer-row"
      // biome-ignore lint/a11y/useSemanticElements: This row is rendered inside the grid's ARIA tree by BcGrid.
      role="row"
      aria-rowindex={rowIndex}
      tabIndex={-1}
      style={aggregationFooterRowStyle(totalWidth, rowHeight, scrollLeft)}
    >
      {columns.map((column, index) => {
        const result = resultsByColumnId.get(column.columnId)
        const first = index === 0
        const formatted = result ? formatAggregationResult(result, column.source, locale) : ""
        const content = result
          ? renderAggregationValue(result, column.source, formatted, locale)
          : first
            ? "Total"
            : ""
        return (
          <div
            key={column.columnId}
            className={classNames(
              "bc-grid-cell",
              "bc-grid-aggregation-footer-cell",
              pinnedClassName(column.pinned),
              pinnedEdgeClassName(pinnedEdgeFor(columns, index)),
              column.align === "right" ? "bc-grid-cell-right" : undefined,
            )}
            role={first ? "rowheader" : "gridcell"}
            aria-colindex={index + 1}
            data-column-id={column.columnId}
            data-bc-grid-aggregation-cell={result ? "true" : undefined}
            style={{
              ...cellStyle({
                align: column.align,
                height: rowHeight,
                left: column.left,
                pinned: column.pinned,
                width: column.width,
                zIndex: column.pinned ? 3 : 2,
              }),
              transform: aggregationPinnedTransform(
                column.pinned,
                scrollLeft,
                totalWidth,
                viewportWidth,
              ),
            }}
          >
            {content}
          </div>
        )
      })}
    </div>
  )
}

export function resolveAggregationRows<TRow>({
  allRows,
  rowId,
  rows,
  scope,
  selection,
}: {
  allRows: readonly TRow[]
  rows: readonly TRow[]
  scope: BcAggregationScope
  rowId?: BcRowId<TRow> | undefined
  selection?: BcSelection | undefined
}): readonly TRow[] {
  if (scope === "all") return allRows
  if (scope !== "selected") return rows
  if (!selection || !rowId) return []

  return allRows.filter((row, index) => isRowSelected(selection, rowId(row, index)))
}

export function aggregationResultsByColumnId(
  results: readonly AggregationResult[],
): ReadonlyMap<ColumnId, AggregationResult> {
  return new Map(results.map((result) => [result.columnId, result]))
}

export function formatAggregationResult<TRow>(
  result: AggregationResult,
  column: BcReactGridColumn<TRow>,
  locale: string | undefined,
): string {
  if (column.format) return formatPresetValue(result.value, column.format, locale)
  if (result.value == null) return ""
  return String(result.value)
}

function renderAggregationValue<TRow>(
  result: AggregationResult,
  column: BcReactGridColumn<TRow>,
  formattedValue: string,
  locale: string | undefined,
): ReactNode {
  if (!column.aggregationFormatter) return formattedValue
  return column.aggregationFormatter({
    column,
    formattedValue,
    locale,
    result,
    value: result.value,
  })
}

// Aggregation totals render inside `bc-grid-aggregation-footer-viewport`
// siblings of the unified body viewport. Until the v0.7 follow-up migrates
// the bottom row into the main viewport, totals rows + pinned cells need to
// scroll-sync with the body horizontally via JS transform. The body scroll
// handler updates `scrollOffset.left`, which threads in here as `scrollLeft`
// and drives both transforms below.
function aggregationFooterRowStyle(
  width: number,
  height: number,
  scrollLeft: number,
): CSSProperties {
  return {
    height,
    minWidth: "100%",
    position: "relative",
    transform: `translate3d(${-scrollLeft}px, 0, 0)`,
    width: Math.max(width, 1),
  }
}

function aggregationPinnedTransform(
  pinned: "left" | "right" | null,
  scrollLeft: number,
  totalWidth: number,
  viewportWidth: number,
): string | undefined {
  if (pinned === "left") return `translate3d(${scrollLeft}px, 0, 0)`
  if (pinned === "right") {
    return `translate3d(${scrollLeft + viewportWidth - totalWidth}px, 0, 0)`
  }
  return undefined
}
