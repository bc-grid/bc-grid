# RFC: Aggregations (aggregation-rfc)

**Status:** Draft for review
**Owner:** c2 (auditor + coordinator)
**Reviewer:** fresh agent (target: x2 or x1)
**Blocks:** `aggregation-engine`, `aggregation-react-adapter`, `footer-aggregations` (Track 5), `pivot-rfc` (sibling RFC depends on this)
**Informed by:** `docs/api.md §1.1` (`column.aggregation`), `docs/api.md §1.2` (`BcAggregation`), `docs/api.md §9 (@bc-grid/aggregations)`, `docs/coordination/v1-parity-sprint.md §Track 4`
**Sprint context:** Track 4 of the v1 parity sprint

---

The aggregation framework computes per-column scalar reductions (`sum`, `count`, `avg`, `min`, `max`, custom) over rows. Track 4 has two RFCs: this one pins the **engine** + React adapter for **footer + group-row aggregations**; `pivot-rfc` (sibling) builds on this engine for the pivot table.

## Goals

- Pure functional engine in `@bc-grid/aggregations` (no React, no DOM); per `design.md §4.2`.
- Six built-in aggregations: `sum`, `count`, `avg`, `min`, `max`, plus the existing `BcAggregation.custom` slot for consumer-defined factories.
- Composable scopes: aggregate over **filtered rows** (default), **all rows**, or **selected rows** (per `BcRangeSelection` or `BcSelection`).
- Streaming-safe: incremental aggregation when rows are added/removed mid-session (Track 7's `streaming-row-updates` consumes this).
- Type-safe: `column.aggregation` declares a typed reduction; the React adapter renders the result via the column's `valueFormatter` so number formatting / currency / etc. is consistent with cell display.
- Group-row support: when grouping is enabled (Track 0 `group-by-client` or via server-row-model), each group row carries its own aggregation result, computed over rows in that group.
- Forward-compatible with pivot: pivot reuses the same `Aggregation` shape on row × column dimensions.

## Non-Goals

- **Cross-column aggregation** (e.g., "sum of (col A × col B)"). Out of scope; consumers compose this via a custom aggregation that reads multiple fields off each row.
- **Hierarchical / sub-total / grand-total layout.** That's pivot territory (`pivot-rfc`).
- **Pivot UI.** Same — `pivot-rfc`.
- **Server-side aggregation pushdown.** v1 aggregates client-side over loaded rows; server-row-model with aggregation hints is a v1.1 extension via `server-query-rfc §Aggregation across unloaded rows` (currently undeclared at v1 — leave for v1.1).
- **Async aggregations.** All v1 reductions are synchronous. A heavy reduction (e.g., percentile over 100k rows) runs on the main thread; consumer is responsible for cap/sample.

## Source standards

- `BcAggregation` shape per `api.md §1.2`.
- `@bc-grid/aggregations` exports per `api.md §9`.
- AG Grid public docs (aggregation reference; **public docs only** per `AGENTS.md §3.2`): https://www.ag-grid.com/react-data-grid/aggregation/

## Decision summary

| Topic | Decision |
|---|---|
| Engine package | `@bc-grid/aggregations` (today: stub, mode `planned` in manifest). Pure functions; no DOM, no React. |
| Aggregation shape | `Aggregation<TValue, TResult>` is a factory: takes per-column context, returns a reducer object with `init`, `step`, `merge`, `finalize`. Inspired by Java Collector / SQL aggregate. |
| Built-ins | `sum`, `count`, `avg`, `min`, `max` — six factories (incl. `count` distinct from `count-distinct` follow-up). |
| `column.aggregation` resolution | The string forms `"sum" | "count" | "avg" | "min" | "max"` map to the built-in factories; `{ type: "custom"; custom: fn }` runs the consumer's reducer. Per `api.md §1.2`. |
| Scope | `aggregationScope` prop on `BcGridProps`: `"filtered"` (default), `"all"`, or `"selected"`. |
| Streaming | Aggregations are incremental: `step(acc, row)` is called per-row append; `merge(a, b)` for parallel batching; `finalize(acc) → result`. Re-render only when finalize value changes. |
| Group rows | When grouping is active, each group has its own accumulator; row events merged into the relevant group via the row's group key. Lazy: only currently-visible groups have computed values; off-screen groups compute on demand. |
| React adapter | `@bc-grid/react/aggregations` exports `useAggregations(rows, columns, scope)` + a default footer renderer used by the status-bar `aggregations` segment (Track 5). |
| Result rendering | Default render: `column.valueFormatter(result, sentinelRow)` where `sentinelRow` is `{}` (or fall back to `String(result)`). Consumers can override per column via `column.aggregationFormatter?: (result, column) => string` (additive, NEW). |
| Locale-aware | All formatting goes through `Intl.*` via the existing `BcGridProps.locale` propagation. |
| Performance | O(n) per scope change; O(1) per row append (incremental). 100k row sum < 5ms client-side per smoke perf. |

---

## Engine

### `@bc-grid/aggregations`

```ts
// packages/aggregations/src/index.ts (currently a stub)

export interface AggregationContext<TRow = unknown, TValue = unknown> {
  /** The column the aggregation is running over. Mostly for label / format context. */
  column: BcGridColumn<TRow, TValue>
  /** Locale propagated from the grid (Intl.NumberFormat etc.). */
  locale?: string
  /** Optional column-derived: the columnId. */
  columnId: ColumnId
}

export interface Aggregation<TValue = unknown, TResult = unknown, TAcc = unknown> {
  /** Identifier; `"sum"`, `"count"`, etc. for built-ins; consumer-defined for custom. */
  id: string
  /** Initial accumulator. Called once per scope/group at the start of a reduction. */
  init: (ctx: AggregationContext) => TAcc
  /** Fold one value into the accumulator. Pure. Returns the new accumulator. */
  step: (acc: TAcc, value: TValue, row: unknown, ctx: AggregationContext) => TAcc
  /** Combine two accumulators (parallel-safe; used for streaming + parallel batching). Pure. */
  merge: (a: TAcc, b: TAcc, ctx: AggregationContext) => TAcc
  /** Convert the accumulator into the final result. */
  finalize: (acc: TAcc, ctx: AggregationContext) => TResult
}

export interface AggregationResult<TResult = unknown> {
  /** The aggregation that produced this result. Allows the renderer to look up the format. */
  aggregation: Aggregation<unknown, TResult>
  /** The result. Type erased at the boundary; consumers cast or use the formatter. */
  value: TResult
  /** Number of rows that contributed (excluding null/undefined for non-count aggregations). */
  rowCount: number
}

// Built-in factories:
export const sum: <TRow>() => Aggregation<number, number, number>
export const count: <TRow>() => Aggregation<unknown, number, number>
export const avg: <TRow>() => Aggregation<number, number, { sum: number; count: number }>
export const min: <TRow, TValue extends number | string | Date>() => Aggregation<TValue, TValue | null, TValue | null>
export const max: <TRow, TValue extends number | string | Date>() => Aggregation<TValue, TValue | null, TValue | null>

// Registry (mirrors filter-registry pattern):
export const aggregationRegistry: {
  register(definition: Aggregation): void
  get(id: string): Aggregation | undefined
}

// Default registrations on import:
// aggregationRegistry.register(sum())
// aggregationRegistry.register(count())
// ...

// Driver — applies an aggregation to a row scope, returning the result:
export function aggregate<TRow, TValue, TResult>(
  rows: readonly TRow[],
  column: BcGridColumn<TRow, TValue>,
  aggregation: Aggregation<TValue, TResult>,
  ctx?: { locale?: string },
): AggregationResult<TResult>

// Bulk variant — aggregate every column with a declared aggregation in one pass:
export function aggregateColumns<TRow>(
  rows: readonly TRow[],
  columns: readonly BcGridColumn<TRow>[],
  ctx?: { locale?: string },
): readonly AggregationResult[]
```

### Why init/step/merge/finalize and not just `(rows) => result`

- **Streaming**: `step` lets the engine fold per-row updates incrementally without re-walking the entire dataset. When a row is added or filtered out, only the affected accumulators update.
- **Parallel batching**: `merge` lets web-worker sharding (post-1.0) compute aggregates in parallel and combine.
- **Group rows**: each group gets its own `acc`; merging two adjacent groups uses `merge`.
- **Pivot**: `pivot-rfc` reuses this exact shape across row × column dimensions; without `merge`, pivot would have to redesign aggregation for cross-cuts.

The shape is borrowed from Java's `Collector` and SQL's `AGGREGATE`. AG Grid's aggregation API is similar in spirit but ours is structurally simpler (no separate `aggregateGroup` / `aggregateMultiLevel` hooks — `merge` covers both).

### Built-in semantics

| Aggregation | `init` | `step` | `merge` | `finalize` | Null handling |
|---|---|---|---|---|---|
| `sum` | `0` | `acc + value` | `a + b` | `acc` | skip null/undefined |
| `count` | `0` | `acc + 1` | `a + b` | `acc` | counts every row including null (use `column.valueGetter` to filter if needed) |
| `avg` | `{ sum: 0, count: 0 }` | `{ sum: acc.sum + value, count: acc.count + 1 }` | `{ sum: a.sum + b.sum, count: a.count + b.count }` | `acc.count === 0 ? null : acc.sum / acc.count` | skip null/undefined |
| `min` | `null` | `acc === null ? value : Math.min(acc, value)` (or string compare) | `min(a, b)` | `acc` | skip null/undefined |
| `max` | `null` | `Math.max(...)` | `max(a, b)` | `acc` | skip null/undefined |

`min` / `max` for strings use locale-aware compare (`Intl.Collator(locale).compare(a, b)`); for `Date`, compare via `getTime()`.

### Custom aggregations

Per `api.md §1.2`:
```ts
type BcAggregation = { type: "sum" | "count" | "avg" | "min" | "max" | "custom"; custom?: (rows: unknown[]) => unknown }
```

The current shape passes the full `rows` array, which violates the streaming + group invariants. **This RFC widens** `BcAggregation.custom` to accept an `Aggregation` factory directly:

```ts
// CURRENT (api.md §1.2):
type BcAggregation = {
  type: "sum" | "count" | "avg" | "min" | "max" | "custom"
  custom?: (rows: unknown[]) => unknown
}

// AFTER aggregation-engine PR lands (additive, no v0.1 break):
type BcAggregation =
  | { type: "sum" | "count" | "avg" | "min" | "max" }
  | { type: "custom"; custom: Aggregation }   // typed factory
  | { type: "custom"; custom: (rows: unknown[]) => unknown }   // legacy shape kept for back-compat
```

The legacy `(rows) => unknown` shape is retained but documented as suboptimal (no streaming, no merge). The framework wraps it into an `Aggregation` factory at registration time:

```ts
function legacyToAggregation(legacy: (rows: unknown[]) => unknown): Aggregation {
  return {
    id: "custom-legacy",
    init: () => [] as unknown[],
    step: (acc, _v, row) => { (acc as unknown[]).push(row); return acc },
    merge: (a, b) => [...(a as unknown[]), ...(b as unknown[])],
    finalize: (acc) => legacy(acc as unknown[]),
  }
}
```

This preserves v0.1 surface while letting v1 consumers opt into the typed factory shape.

---

## React adapter

### `@bc-grid/react/aggregations`

```ts
// packages/react/src/aggregations.ts (NEW)

import { aggregateColumns } from "@bc-grid/aggregations"
import type { AggregationResult } from "@bc-grid/aggregations"

export interface UseAggregationsOptions {
  scope: "filtered" | "all" | "selected"
  /** Selection state when scope === "selected"; otherwise unused. */
  selection?: BcSelection
  rangeSelection?: BcRangeSelection
}

export function useAggregations<TRow>(
  rows: readonly TRow[],
  columns: readonly BcGridColumn<TRow>[],
  options: UseAggregationsOptions,
): readonly AggregationResult[] {
  return useMemo(() => {
    const scoped = applyScope(rows, options.scope, options.selection, options.rangeSelection)
    return aggregateColumns(scoped, columns, { locale: useLocale() })
  }, [rows, columns, options.scope, options.selection, options.rangeSelection])
}
```

Plus a `<BcFooterRow>` component that renders the aggregation row (consumed by status-bar Track 5).

### Footer row rendering

When any column declares `aggregation`, the grid renders a footer row below the body. Layout:

```
┌─────────────────────────────────────┐
│ .bc-grid-canvas (body rows)         │
└─────────────────────────────────────┘
┌─────────────────────────────────────┐
│ .bc-grid-footer-row                 │
│   .bc-grid-footer-cell  Total       │
│   .bc-grid-footer-cell  $1,234,567  │
│   .bc-grid-footer-cell  -           │   <- column without aggregation
│ ...                                 │
└─────────────────────────────────────┘
```

CSS:
```css
.bc-grid-footer-row { 
  position: sticky;
  bottom: 0;
  background: hsl(var(--muted));
  border-top: 1px solid hsl(var(--border));
  font-weight: 600;
}
.bc-grid-footer-cell { /* same horizontal layout as body cells */ }
```

a11y: `role="row"` on the footer row; `role="rowheader"` on the first footer cell (typically a label like "Total"); `role="gridcell"` on aggregation cells. `aria-rowindex` continues from body rows. Per `accessibility-rfc §Semantic DOM Model` ("Header rows and footer/status rows are semantic rows if they are inside the grid accessibility tree. They count toward `aria-rowcount`.").

### Status-bar `aggregations` segment (Track 5 footer-aggregations task)

Per `chrome-rfc §Status bar`, the `"aggregations"` built-in segment displays the same `AggregationResult[]` as a horizontal strip of `column.header: result` pairs. Useful when the footer row is hidden but the consumer still wants the totals visible.

### Group-row aggregation

When `BcGridProps.groupBy` is non-empty (Track 0 `group-by-client`), each group row renders aggregation results computed over rows in that group. The aggregations engine handles groups via:

```ts
export function aggregateGroups<TRow>(
  groupedRows: ReadonlyMap<string /*groupKey*/, readonly TRow[]>,
  columns: readonly BcGridColumn<TRow>[],
  ctx?: { locale?: string },
): ReadonlyMap<string, readonly AggregationResult[]>
```

Each group key independently `init` / `step` / `finalize`. `merge` is used when a row is reassigned between groups (sort change, filter shift) to avoid re-computing both groups from scratch.

Group-row rendering: `groupRow.cellRenderer` (consumer-supplied or default) receives `params.aggregations: readonly AggregationResult[]` and renders a group header showing the aggregation results inline.

### Aggregation scope

Default scope is `"filtered"` — aggregate over rows that pass the active filter. Other scopes:

- `"all"` — aggregate over all rows in `data`, ignoring filter. Useful for "Total balance: $X (showing Y of Z)".
- `"selected"` — aggregate over rows in `selection` (row-id-keyed). When `selection` is empty, the result is empty (renderer shows "—").

Scope is configured per-grid via `BcGridProps.aggregationScope?: "filtered" | "all" | "selected"` (additive, NEW).

For per-column scope override (rare): consumers can write a custom aggregation that filters internally.

---

## Streaming + incremental updates

When `Track 7 streaming-row-updates` ships (`ServerRowUpdate` events from `server-query-rfc`):

- **Row added**: `aggregations.step(acc, row)` for each column's aggregation. The result re-finalizes; React adapter triggers a re-render of the footer row only (not the whole grid).
- **Row removed**: requires either `step-inverse` (not in `Aggregation` shape) OR full recompute. **Decision: full recompute on remove**, because invertibility complicates the API and v1's row-removal cadence is low. The recompute is O(n) per affected aggregation; for 100k rows × 5 aggregations on a typical ERP screen, this is < 10ms (within smoke perf budget).
- **Row updated** (value of a row changes): treated as remove + add. Same recompute semantics.

Future v1.x extension: declare optional `stepInverse` in `Aggregation` for invertible reductions (`sum`, `count`, `avg`); fall back to recompute when not declared (`min`, `max`).

---

## Implementation tasks (Phase 6 Track 4)

| Task | Effort | Depends on |
|---|---|---|
| `aggregation-engine` (`@bc-grid/aggregations`: 6 built-ins + driver + group + registry) | M | this RFC |
| `aggregation-react-adapter` (footer row + `useAggregations` + custom-format hook) | M | aggregation-engine |
| `footer-aggregations` (status-bar segment from chrome-rfc Track 5) | S | aggregation-engine + status-bar-impl |
| `pivot-rfc` (sibling RFC) | 1 day (c2) | this RFC |
| Pivot impl tasks (in `pivot-rfc`) | — | pivot-rfc + aggregation-engine |

`aggregation-engine` is single-owner (the engine is small + cohesive). `aggregation-react-adapter` can run in parallel with the engine after the API shape is locked.

---

## Test plan

### Unit (Vitest)

- Each built-in: `init` / `step` / `merge` / `finalize` correctness for typical input + edge cases (empty, null-only, single row, mixed types).
- `aggregate(rows, column, aggregation)` driver: walks `rows`, returns expected result.
- `aggregateColumns(rows, columns)`: bulk variant returns one result per column with `aggregation` declared.
- `aggregateGroups(grouped, columns)`: per-group results.
- Streaming: `step` invariants: `aggregate([a, b, c]) === finalize(step(step(step(init(), a), b), c))`.
- `merge` invariants: `aggregate([a, b, c]) === finalize(merge(step(init(), a), step(step(init(), b), c)))`.
- Legacy `custom: (rows) => unknown` shape: wraps correctly.

### Integration (Vitest + RTL)

- `<BcGrid columns={[{aggregation: "sum"}, ...]} />` renders a footer row with the sum.
- Changing `aggregationScope="selected"` updates the footer to selected-only sum.
- Group-row rendering: when grouping is enabled, group rows render aggregation results.
- Custom formatter: `column.aggregationFormatter` overrides default `valueFormatter`.

### E2E (Playwright × 3 browsers)

- AR Customers demo: enable footer aggregation on `balance` (sum) and `creditLimit` (max). Assert footer row content.
- Filter the grid → footer values update.
- Select 3 rows + set `aggregationScope="selected"` → footer reflects selected sum.

### Perf (smoke + nightly)

- Smoke: 10k rows × 5 aggregations: full compute < 10ms; incremental row-add < 1ms.
- Nightly: 100k rows × 10 aggregations: full compute < 50ms.

## Acceptance criteria

- `@bc-grid/aggregations` ships 6 built-ins + driver + groups + registry.
- `@bc-grid/react/aggregations` ships `useAggregations` hook + footer row component.
- Manifest updated for both packages (currently `mode: "planned"` → `mode: "enforced"` after impl).
- `BcAggregation.custom` widening lands in api.md §1.2 + manifest.
- AR Customers demo exercises sum + max with filter scope.
- axe-core clean for footer row + status-bar `aggregations` segment.

## Open questions

### `count-distinct`?
Out of v1; consumers register a custom `count-distinct` aggregation reading from a `Set` accumulator. Documented as the canonical custom-aggregation example.

### Aggregation across pinned rows?
Pinned-top + pinned-bottom rows are excluded from aggregation by default (they're typically "totals" or "subtotals" rows themselves). Consumers can opt in via `BcGridProps.includeRowsInAggregation?: (row, kind) => boolean`. Nice-to-have; not blocking.

### Server-side aggregation pushdown
Reserved for v1.1 via `server-query-rfc`. v1 aggregates client-side over loaded rows. For unloaded blocks, the result is "incomplete" and the renderer shows "—" with a tooltip explaining.

### Footer cell alignment
Inherits from `column.align`. Numeric aggregations default right-align; `count` defaults left-align; consumer can override.

## References

- `docs/api.md §1.1` (`column.aggregation`)
- `docs/api.md §1.2` (`BcAggregation`)
- `docs/api.md §9` (`@bc-grid/aggregations` exports — currently `mode: "planned"`)
- `docs/coordination/v1-parity-sprint.md §Track 4`
- `docs/design/server-query-rfc.md` (server aggregation reservations)
- `docs/design/accessibility-rfc.md §Semantic DOM Model` (footer row a11y)
