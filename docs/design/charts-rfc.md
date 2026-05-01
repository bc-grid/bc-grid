# RFC: Charts Integration (charts-rfc)

**Status:** Post-1.0 planning draft
**Owner:** c2 (auditor + coordinator)
**Reviewer:** fresh agent (target: x1 or c1)
**Blocks:** Post-1.0 `charts-peer-dep-integration`
**Informed by:** `docs/design.md §2` (charts non-goal until post-1.0), `docs/coordination/post-v1-backlog.md`, `docs/design/aggregation-rfc.md` (chart inputs reuse `AggregationResult`), `docs/design/pivot-rfc.md` (pivot output is a natural chart input)
**Release context:** Post-1.0. This is not part of the v1.0 parity sprint.

---

Charts integration is an explicit post-1.0 item. The v1.0 parity sprint is scoped to the ERP grid itself; bc-grid **does not bundle a charting library** and will not ship chart adapter code in v1.0. This RFC pins a future **adapter shape** so charts can integrate cleanly later without coupling bc-grid to any specific library.

## Goals

- **Peer-dep architecture**: zero runtime dependencies in bc-grid for charts. Consumer chooses + installs their library.
- **Recharts as the documented default**: 3 worked examples in `apps/docs` use recharts, but the adapter is library-agnostic.
- **Hook-based**: `useBcGridChartData(config)` returns chart-ready data; consumer renders with their library of choice.
- **Pivot-aware**: pivot output (`BcPivotedData`) flows naturally into multi-series charts.
- **Range-aware**: a chart can render the active range only (Track 2); auto-updates as range changes.
- **a11y**: charts default to a *labelled image* — `role="img"` + `aria-label="Chart of {description}"` on the chart container. (This is **not** decorative; consumers wanting a truly decorative chart should add `aria-hidden="true"` themselves. Consumers wanting deeper a11y like an exposed data table use the chart library's own primitives.)
- **Forward-compatible** with chart-as-renderer (drag a chart into the grid as a custom cell renderer or as a sidebar tool panel) — out of the first chart-adapter release.

## Non-Goals

- **Bundling a chart library.** Per `design.md §2.5` (no chart bundling).
- **Native charting primitives in bc-grid.** We don't ship our own charts.
- **Chart authoring UI** (drag dimensions to compose a chart). Consumers use their library's own.
- **Cross-chart interaction** (selection in chart syncs to grid; clicking a chart segment filters). Out of v1; consumers wire via the existing `onSelectionChange` + `onFilterChange` callbacks.
- **Server-side chart rendering**. Out of scope.
- **Charts in pivot tool panel UI**. The pivot tool panel handles dimensions; it doesn't preview charts. Consumers wanting that compose externally.

## Source standards

- recharts public docs: https://recharts.org/
- echarts public docs: https://echarts.apache.org/
- visx public docs: https://airbnb.io/visx/
- AG Grid public docs (chart integration reference; **public docs only** per `AGENTS.md §3.2`): https://www.ag-grid.com/react-data-grid/integrated-charts-overview/

## Library evaluation

Three candidates evaluated for **default documented integration**:

| Library | License | Bundle (gzipped) | DX | Coverage | Verdict |
|---|---|---|---|---|---|
| **recharts** | MIT | ~50KB | High (declarative React components) | Bar, line, area, pie, radar, scatter, composed | **Default** — best React-idiomatic API, mainstream choice for ERP dashboards |
| echarts (`echarts-for-react`) | Apache 2.0 | ~250KB | Medium (imperative options object) | Comprehensive (incl. heatmap, funnel, gauge, treemap, sankey) | Documented as alternative for advanced visualisations |
| visx (`@visx/*`) | MIT | ~30KB modular | Low (low-level primitives) | Build-your-own | Documented as alternative for custom-design needs |

Documented default: **recharts**. The other two are documented as drop-in alternatives in the recipe.

## Decision summary

| Topic | Decision |
|---|---|
| Adapter location | `@bc-grid/react/charts` (internal module). NOT a separate `@bc-grid/charts` package — the surface is small (one hook + a few helpers); a separate package would be over-engineered for the first post-1.0 adapter. |
| Surface | `useBcGridChartData<TConfig>(config)` hook returns chart-ready data; consumer feeds into their library of choice. Plus 3 helpers: `aggregateForChart`, `pivotForChart`, `rangeForChart`. |
| Default library | **recharts** — documented + 3 worked examples in `apps/docs/charts`. |
| Peer-dep declaration | `@bc-grid/react` does NOT depend on recharts. Examples app declares it as a dev-dep. Consumers install their chosen library. |
| Data flow | Grid → adapter hook → chart-data shape → consumer's chart component. Reactive via React state — when grid filter/sort/range/selection changes, chart data updates without manual sync. |
| Pivot-aware | Pivot output (`BcPivotedData`) maps naturally to multi-series charts. The adapter's `pivotForChart` helper produces a series-per-row-group + categories-per-col-group shape. |
| Range-aware | Active range (per `range-rfc`) can be the chart's data scope. `rangeForChart(range)` produces the data subset within the range. |
| a11y | Default: `role="img"` + `aria-label="Chart of {description}"` on the chart container — a *labelled image*, not decorative. Consumers wanting "exposed data table" mode wire their library's a11y option (recharts has `<text>` accessibility, echarts has SVG accessibility plugins). |
| Output coordination with grid | A chart rendered as a sidebar panel (Track 5 chrome) gets the same `useBcGridChartData` data; lifecycle + render are owned by the consumer. |

---

## Adapter API

### `@bc-grid/react/charts`

```ts
// packages/react/src/charts.ts (NEW)

export type BcChartScope = "rows" | "filtered" | "selected" | "range" | "pivot"

export interface BcChartConfig<TRow> {
  /** Where the data comes from. Default: "filtered". */
  scope?: BcChartScope
  /** When scope === "rows", these rows; otherwise inferred from grid state. */
  rows?: readonly TRow[]
  /**
   * Column id used as the X-axis category for line / bar / area charts.
   * For pivot scope: ignored — col-group axis is the X axis automatically.
   */
  categoryColumn?: ColumnId
  /**
   * Columns whose values are plotted as series (Y-axis).
   * For pivot scope: ignored — values dimension drives series.
   */
  valueColumns?: readonly ColumnId[]
  /**
   * Optional aggregation per value column. Defaults to the column's own
   * aggregation (per `column.aggregation` from api.md §1.1) or `sum`.
   */
  aggregations?: Partial<Record<ColumnId, BcAggregation>>
  /** Optional limit on category count (top-N). Default: 50. */
  maxCategories?: number
}

export interface BcChartData {
  /** Categories in axis order. e.g., ["Jan", "Feb", "Mar"]. */
  categories: readonly string[]
  /** Series in z-order. */
  series: readonly BcChartSeries[]
  /** True if the data was truncated to maxCategories. */
  truncated: boolean
  /** When chart was sourced from pivot, the underlying pivoted data. */
  pivotData?: BcPivotedData<unknown>
}

export interface BcChartSeries {
  /** Display label, e.g., "Sum of Balance". */
  label: string
  /** Numeric series values, aligned to `categories[]` indices. */
  values: readonly (number | null)[]
  /** Stable id for chart-library keying. */
  id: string
  /** When this series came from a pivot col-group, the original group key. */
  groupKey?: string
}

/**
 * Subscribe to grid state changes for reactive consumption.
 * Added to BcGridApi as part of the charts-peer-dep-integration task.
 *
 * The listener is invoked synchronously after any of:
 *   filter, sort, data, selection, range, pivot state, or row model
 * is updated. The grid de-bounces this internally so listeners are not
 * called during the same render commit twice.
 *
 * Returns an unsubscribe function.
 */
export interface BcGridApi<TRow> {
  // ...existing methods...
  subscribe(listener: () => void): () => void
}

export function useBcGridChartData<TRow>(
  apiRef: React.RefObject<BcGridApi<TRow>>,
  config: BcChartConfig<TRow>,
): BcChartData
```

**Reactivity model (pinned):** the hook accepts the `apiRef` *ref object* (not the imperative `apiRef.current`, which is `BcGridApi<TRow> | null` until mount). Internally it uses `useSyncExternalStore` against `api.subscribe`:

```ts
function useBcGridChartData<TRow>(
  apiRef: React.RefObject<BcGridApi<TRow>>,
  config: BcChartConfig<TRow>,
): BcChartData {
  const subscribe = useCallback(
    (listener: () => void) => apiRef.current?.subscribe(listener) ?? (() => {}),
    [apiRef],
  )
  const snapshot = useSyncExternalStore(subscribe, () => apiRef.current?.getRowModelStamp() ?? 0)
  return useMemo(() => deriveChartData(apiRef.current, config), [snapshot, config])
}
```

`api.subscribe(listener)` is the new primitive added to `BcGridApi` for charts (and is reusable for any other reactive consumer that needs to mirror grid state). `getRowModelStamp(): number` increments on any state change so React's `useSyncExternalStore` can detect changes via referential identity.

The hook re-derives `BcChartData` when:
- the snapshot changes (filter, sort, data, selection, range, pivot — anything that triggers a `subscribe` notification)
- `config` shallow-equality changes

### Helpers

```ts
/** Pure helper — derive chart data from a flat row set + config. */
export function rowsToChartData<TRow>(
  rows: readonly TRow[],
  columns: readonly BcGridColumn<TRow>[],
  config: BcChartConfig<TRow>,
  ctx?: { locale?: string },
): BcChartData

/** Pure helper — derive from a range. */
export function rangeForChart<TRow>(
  range: BcRange,
  rows: readonly TRow[],
  columns: readonly BcGridColumn<TRow>[],
): BcChartData

/** Pure helper — derive from pivot output. */
export function pivotForChart<TRow>(
  data: BcPivotedData<TRow>,
  config?: { categoryAxis?: "rows" | "cols" },   // default: "cols"
): BcChartData
```

Pure helpers are used internally by `useBcGridChartData`; exposed for consumers who want chart data without the React hook (e.g., for a server-side render).

### Chart component composition

bc-grid does **not** ship a `<BcGridChart>` component. The recipe (in `apps/docs/charts`):

```tsx
import { BcGrid, useBcGridApi } from "@bc-grid/react"
import { useBcGridChartData } from "@bc-grid/react/charts"
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from "recharts"

function CustomerBalanceByQuarter({ rows, columns }) {
  const apiRef = useBcGridApi()
  const chartData = useBcGridChartData(apiRef, {
    scope: "filtered",
    categoryColumn: "quarter",
    valueColumns: ["balance"],
    aggregations: { balance: { type: "sum" } },
  })

  return (
    <div role="img" aria-label="Customer balance by quarter">
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={recharts(chartData)}>
          <XAxis dataKey="category" />
          <YAxis />
          <Tooltip />
          <Legend />
          {chartData.series.map((s) => <Bar key={s.id} dataKey={s.id} name={s.label} />)}
        </BarChart>
      </ResponsiveContainer>
      <BcGrid data={rows} columns={columns} apiRef={apiRef} />
    </div>
  )
}

// Helper: bc-grid's BcChartData → recharts data shape
function recharts(d: BcChartData) {
  return d.categories.map((category, i) => {
    const obj: Record<string, unknown> = { category }
    for (const s of d.series) obj[s.id] = s.values[i]
    return obj
  })
}
```

The 5-line `recharts()` shape-converter lives in the docs example. Similar 5-line converters for echarts and visx land in the same recipe.

## Pivot → chart

When `BcPivotedData` is the source, the natural chart shape is:
- **Rows axis**: row-group keys → chart **categories** (X-axis).
- **Cols axis**: col-group keys → chart **series** (one bar/line per col group).
- **Cells**: aggregation values → series Y values.

`pivotForChart(data, { categoryAxis: "cols" })` (default) produces this shape.
`pivotForChart(data, { categoryAxis: "rows" })` swaps: col-groups become categories, row-groups become series. Useful for "compare regions across quarters" vs "compare quarters across regions".

## Range → chart

When the consumer drags a range and wants to chart "just this selection":

```tsx
const range = api.getRangeSelection().ranges[0]   // last range
const chartData = useBcGridChartData(api, { scope: "range" })
// Renders a chart of just the cells in the active range.
```

The adapter computes:
- **Categories**: row-positions within the range (or the categoryColumn if it's in-range).
- **Series**: one per column in the range with `valueColumns` filtering.

For a 5-cell-tall × 3-cell-wide range, this produces a 3-series × 5-category chart.

## Server-side considerations

When the grid is a `<BcServerGrid>`, the adapter:
1. Reads from the loaded server rows only — chart shows the visible window's data.
2. For pivot scope: uses the server's `pivotedRows` if present (per `pivot-rfc`); else falls back to client-side pivot of the loaded subset.
3. Does NOT trigger a server fetch on chart re-render (otherwise chart interaction would hammer the server).

Post-1.0 extension: `<BcServerGrid>` consumers can compute a separate "chart data fetch" using `loadPage` with a chart-specific query — that's a consumer pattern, not a bc-grid feature.

## Implementation tasks (post-1.0)

The single task in the prior draft conflated four distinct dependency sets. Splitting by scope so each piece can land in its track's natural order:

| Task | Effort | Depends on |
|---|---|---|
| `charts-api-subscribe` (add `BcGridApi.subscribe` + `getRowModelStamp` + integration tests; the reactive primitive used by the chart hook and any future external store consumer) | S | core grid (already shipped) |
| `charts-peer-dep-integration` (`@bc-grid/react/charts` module: `BcChartConfig`, `BcChartData`, `useBcGridChartData`, `rowsToChartData`, `aggregateForChart`; flat-row / aggregated / `scope: "filtered" \| "selected" \| "all"` modes; 1 recharts worked example in `apps/docs/charts`) | M | `charts-api-subscribe` + `aggregation-engine` (Track 4) + this RFC |
| `charts-range-helper` (`rangeForChart` helper + `scope: "range"` support in `useBcGridChartData` + worked example) | S | `charts-peer-dep-integration` + `range-state-machine` (Track 2) |
| `charts-pivot-helper` (`pivotForChart` helper + `scope: "pivot"` support in `useBcGridChartData` + worked example) | S | `charts-peer-dep-integration` + `pivot-engine` / `pivot-row-col-groups` (Track 4 second half) |

Splitting unblocks the flat-row chart from waiting on range/pivot support in a future post-1.0 release.

## Test plan

### Unit (Vitest)

- `rowsToChartData`: 100 rows × 1 category col × 2 value cols → 2 series, N categories.
- `rangeForChart`: 5×3 range → 3 series × 5 categories.
- `pivotForChart`: small pivot fixture (2 row groups × 3 col groups × 1 value) → 3 series × 2 categories (or swap with `categoryAxis: "rows"`).
- Aggregation override: per-column `aggregations` map overrides default.
- `maxCategories` truncation: top-N selection by series-sum descending.

### Integration (Vitest + RTL)

- `useBcGridChartData` re-renders on filter change.
- `useBcGridChartData` re-renders on selection change with scope="selected".
- `useBcGridChartData` re-renders on range change with scope="range".
- recharts example renders without errors.

### E2E (Playwright × 3 browsers)

- AR Customers demo: enable filter, scroll to the chart panel below the grid, assert chart series count + bar count.
- Toggle pivot mode → chart re-renders from pivot data.
- Range-select 3 columns × 5 rows → chart shows 3 series × 5 categories.

### a11y manual

- Chart container has `role="img"` + `aria-label`.
- For consumers wanting deeper a11y, recharts/echarts/visx-specific options documented in the recipe.

## Acceptance criteria

- `@bc-grid/react/charts` ships with `useBcGridChartData` + 3 helpers.
- 3 worked examples in `apps/docs/charts/` (one each for recharts, echarts, visx).
- Manifest updated for the new exports.
- post-1.0 `charts-peer-dep-integration` task marked done.
- AR Customers demo includes one chart embedded above/beside the grid.
- axe-core clean for the chart container's `role="img"` + label.

## Open questions

### Should bc-grid emit a `BcGridChartData` event when chart data computes?
**Decision: no.** The hook is the API. Events would create double-handling (the hook already triggers re-render).

### What about real-time chart updates from streaming row-updates?
The adapter consumes `api.getRowModel()` which already reflects streaming updates per `Track 7 streaming-row-updates`. Chart updates "for free" when streaming is wired.

### Chart-as-cell-renderer
Out of v1. A consumer can already pass an arbitrary `cellRenderer` that renders a small chart per row (sparkline). bc-grid doesn't add a built-in here; the recipe references existing `cellRenderer` API.

### Chart-in-sidebar
A consumer can put a chart in a custom sidebar panel (per `chrome-rfc §Sidebar` custom panels). The adapter hook works inside any React tree. Documented as a recipe.

### Forced colors mode?
Charts are rendered by the consumer's library; their forced-colors handling is outside bc-grid's scope. The chart container's `role="img"` + `aria-label` ensures the chart is at minimum perceivable as "a chart" in forced-colors mode.

## References

- `docs/design.md §2` (charts non-goal until post-1.0)
- `docs/design/aggregation-rfc.md` (engine reused for chart aggregations)
- `docs/design/pivot-rfc.md` (pivot output is a natural chart input)
- `docs/design/range-rfc.md` (range-aware chart scope)
- `docs/coordination/post-v1-backlog.md`
- recharts: https://recharts.org/
- echarts: https://echarts.apache.org/
- visx: https://airbnb.io/visx/
