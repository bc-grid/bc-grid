import type { ReactNode } from "react"
import { XIcon } from "./internal/panel-icons"
import type { BcStatusBarContext, BcStatusBarCustomSegment, BcStatusBarSegment } from "./types"

interface BcStatusBarProps<TRow> {
  segments: readonly BcStatusBarSegment<TRow>[]
  ctx: BcStatusBarContext<TRow>
  ariaLabel: string
}

/**
 * Renders the grid's footer status bar below the scroller and above
 * any consumer `footer` slot. Per `chrome-rfc §Status bar`.
 *
 * The status bar is purely visual: announcements route through the
 * grid's central polite live region, not `aria-live` on this root.
 */
export function BcStatusBar<TRow>({ segments, ctx, ariaLabel }: BcStatusBarProps<TRow>): ReactNode {
  const visible = resolveVisibleSegments(segments, ctx)
  if (visible.length === 0) return null

  return (
    <section className="bc-grid-statusbar" aria-label={ariaLabel}>
      {visible.map((entry) => (
        <div
          key={entry.key}
          className="bc-grid-statusbar-segment"
          data-segment={entry.id}
          data-align={entry.align}
        >
          {entry.content}
        </div>
      ))}
    </section>
  )
}

interface ResolvedSegment {
  /** React key — unique per render. */
  key: string
  /** Stable id used for the DOM `data-segment` hook. */
  id: string
  align: "left" | "right"
  content: ReactNode
}

/**
 * Apply each segment's visibility rule and produce the renderable
 * list. Pure — exported for unit testing.
 *
 * Per `chrome-rfc §Status bar`:
 * - `total` — always shown when listed
 * - `filtered` — only when a filter is active (filteredRowCount differs
 *   from totalRowCount; with an `"unknown"` total we still show it
 *   because the consumer asked for the segment)
 * - `activeFilters` — only when at least one column filter is active
 * - `selected` — only when `selectedRowCount > 0`
 * - `aggregations` — only when the array is non-empty
 * - custom — always renders; consumer controls visibility
 */
export function resolveVisibleSegments<TRow>(
  segments: readonly BcStatusBarSegment<TRow>[],
  ctx: BcStatusBarContext<TRow>,
): readonly ResolvedSegment[] {
  const out: ResolvedSegment[] = []
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]
    if (segment === undefined) continue
    if (typeof segment === "string") {
      const builtIn = renderBuiltInSegment(segment, ctx, i)
      if (builtIn) out.push(builtIn)
      continue
    }
    const align = segment.align ?? "left"
    out.push({
      key: `custom-${segment.id}`,
      id: segment.id,
      align,
      content: segment.render(ctx),
    })
  }
  return out
}

function renderBuiltInSegment<TRow>(
  id: "total" | "filtered" | "activeFilters" | "selected" | "aggregations" | "latestError",
  ctx: BcStatusBarContext<TRow>,
  index: number,
): ResolvedSegment | null {
  if (id === "total") {
    return {
      key: `total-${index}`,
      id: "total",
      align: "left",
      content: <TotalSegment ctx={ctx} />,
    }
  }
  if (id === "filtered") {
    if (!isFilterActive(ctx)) return null
    return {
      key: `filtered-${index}`,
      id: "filtered",
      align: "left",
      content: <FilteredSegment ctx={ctx} />,
    }
  }
  if (id === "activeFilters") {
    if (ctx.activeFilters.length === 0) return null
    return {
      key: `activeFilters-${index}`,
      id: "activeFilters",
      align: "left",
      content: <ActiveFiltersSegment ctx={ctx} />,
    }
  }
  if (id === "selected") {
    if (ctx.selectedRowCount <= 0) return null
    return {
      key: `selected-${index}`,
      id: "selected",
      align: "left",
      content: <SelectedSegment ctx={ctx} />,
    }
  }
  if (id === "latestError") {
    // Auto-clear is handled inside `useEditingController`; the segment
    // simply hides itself when the controller has retired the entry
    // (8 s timeout or earlier on a successful commit on the same cell).
    if (!ctx.latestValidationError) return null
    return {
      key: `latestError-${index}`,
      id: "latestError",
      align: "right",
      content: <LatestErrorSegment ctx={ctx} />,
    }
  }
  if (ctx.aggregations.length === 0) return null
  return {
    key: `aggregations-${index}`,
    id: "aggregations",
    align: "right",
    content: <AggregationsSegment ctx={ctx} />,
  }
}

function ActiveFiltersSegment<TRow>({ ctx }: { ctx: BcStatusBarContext<TRow> }): ReactNode {
  return (
    <ul
      className="bc-grid-statusbar-filter-list"
      aria-label={`${ctx.activeFilters.length} active ${
        ctx.activeFilters.length === 1 ? "filter" : "filters"
      }`}
    >
      {ctx.activeFilters.map((item) => (
        <li className="bc-grid-statusbar-filter-chip" key={item.columnId}>
          <span className="bc-grid-statusbar-filter-label">{item.label}</span>
          {item.summary ? (
            <span className="bc-grid-statusbar-filter-value">{item.summary}</span>
          ) : null}
          <button
            aria-label={`Clear filter on ${item.label}`}
            className="bc-grid-statusbar-filter-remove"
            type="button"
            onClick={() => ctx.clearColumnFilter(item.columnId)}
          >
            {XIcon}
          </button>
        </li>
      ))}
    </ul>
  )
}

function isFilterActive<TRow>(ctx: BcStatusBarContext<TRow>): boolean {
  if (ctx.totalRowCount === "unknown") return true
  return ctx.filteredRowCount !== ctx.totalRowCount
}

function TotalSegment<TRow>({ ctx }: { ctx: BcStatusBarContext<TRow> }): ReactNode {
  if (ctx.totalRowCount === "unknown") {
    return <span className="bc-grid-statusbar-segment-text">— rows</span>
  }
  return (
    <span className="bc-grid-statusbar-segment-text">
      {formatCount(ctx.totalRowCount)} {pluralRow(ctx.totalRowCount)}
    </span>
  )
}

function FilteredSegment<TRow>({ ctx }: { ctx: BcStatusBarContext<TRow> }): ReactNode {
  const filtered = formatCount(ctx.filteredRowCount)
  if (ctx.totalRowCount === "unknown") {
    return (
      <span className="bc-grid-statusbar-segment-text">
        {filtered} {pluralRow(ctx.filteredRowCount)} shown
      </span>
    )
  }
  return (
    <span className="bc-grid-statusbar-segment-text">
      {filtered} of {formatCount(ctx.totalRowCount)} shown
    </span>
  )
}

function SelectedSegment<TRow>({ ctx }: { ctx: BcStatusBarContext<TRow> }): ReactNode {
  return (
    <span className="bc-grid-statusbar-segment-text">
      {formatCount(ctx.selectedRowCount)} selected
    </span>
  )
}

function LatestErrorSegment<TRow>({ ctx }: { ctx: BcStatusBarContext<TRow> }): ReactNode {
  // The controller guarantees `ctx.latestValidationError` is non-null
  // when this segment renders (the renderBuiltInSegment branch above
  // gates on it) — pin the assertion locally so the JSX stays
  // unconditional.
  const err = ctx.latestValidationError
  if (!err) return null
  return (
    <span
      className="bc-grid-statusbar-segment-text bc-grid-statusbar-latest-error"
      data-bc-grid-row-id={err.rowId}
      data-bc-grid-column-id={err.columnId}
    >
      <span className="bc-grid-statusbar-latest-error-column">{err.columnHeader}</span>
      <span aria-hidden="true">: </span>
      <span className="bc-grid-statusbar-latest-error-message">{err.error}</span>
    </span>
  )
}

function AggregationsSegment<TRow>({ ctx }: { ctx: BcStatusBarContext<TRow> }): ReactNode {
  return (
    <span className="bc-grid-statusbar-segment-text">
      {ctx.aggregations.map((result, index) => (
        <span
          key={result.columnId}
          className="bc-grid-statusbar-aggregation"
          data-column-id={result.columnId}
        >
          {index > 0 ? <span aria-hidden="true"> · </span> : null}
          <span className="bc-grid-statusbar-aggregation-label">
            {result.aggregation.id} {result.columnId}
          </span>{" "}
          <span className="bc-grid-statusbar-aggregation-value">
            {formatAggregationValue(result.value)}
          </span>
        </span>
      ))}
    </span>
  )
}

function formatAggregationValue(value: unknown): string {
  if (value == null) return ""
  if (typeof value === "number") return value.toLocaleString()
  return String(value)
}

function formatCount(value: number): string {
  return value.toLocaleString()
}

function pluralRow(count: number): string {
  return count === 1 ? "row" : "rows"
}

export type { BcStatusBarCustomSegment, BcStatusBarSegment, BcStatusBarContext }
