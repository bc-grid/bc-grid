# RFC: Pivot Tables (pivot-rfc)

**Status:** Draft for review
**Owner:** c2 (auditor + coordinator)
**Reviewer:** fresh agent (target: x2 or x1)
**Blocks:** `pivot-engine`, `pivot-ui-drag-zones`, `pivot-row-col-groups`. Reads from: `aggregation-engine` (sibling RFC `aggregation-rfc`), `chrome-rfc` (sidebar tool panel slot).
**Informed by:** `docs/design/aggregation-rfc.md` (engine reuse), `docs/design.md §2` (pivots non-goal in Q1, promoted to v1 per sprint pivot), `docs/design.md §4.2` (engine vs React split), `docs/coordination/v1-parity-sprint.md §Track 4`
**Sprint context:** Track 4 second half of the v1 parity sprint.

---

Pivot tables expose a multi-dimensional view of the dataset: row-group dimensions on the Y axis, col-group dimensions on the X axis, and one or more value aggregations at each (row × col) intersection. This RFC pins the **engine + React layers** so v1 ships **drag-to-pivot UI** that produces accurate pivoted output across all standard ERP data shapes.

## Goals

- **Engine in `@bc-grid/aggregations`** (extends the package; no separate `@bc-grid/pivots` package). Reuses the same `Aggregation` shape pinned in `aggregation-rfc`.
- **React layer** in `@bc-grid/react/pivot` ships:
  - Drag-to-pivot UI (lives in the sidebar Pivot tool panel from `chrome-rfc`)
  - Row-group + col-group axis rendering
  - Value cells at each axis intersection
  - Sub-totals + grand-totals for each axis
- **Wide-table tolerant**: handles 100+ distinct values per col-group dimension without falling over (sparse rendering + virtualization).
- **Server-row-model compatible**: when `<BcServerGrid>` is the consumer, pivot dimensions become `ServerGroup[]` (per `server-query-rfc`); the server is responsible for emitting pre-aggregated pivot rows. Client-side pivot mode stays as the default.
- **a11y**: pivot output renders inside `role="treegrid"` (per `accessibility-rfc §grid vs treegrid`); row/col groups expose `aria-level` + `aria-expanded`; aggregation cells set `aria-readonly="true"`.

## Non-Goals

- **Drill-down navigation**: clicking a pivot cell to see the underlying rows. Out of v1; consumers can wire via `onPivotCellClick`.
- **Pivot-mode editing**: cells in pivot output are read-only at v1. No `BcEditGrid` integration.
- **Pivot serialization to URL/localStorage**: pivot state is ephemeral at v1. Persistence may pair with column-state-url-persistence in v1.x.
- **OLAP-style hierarchies / measure groups / calculated members**: out of scope; v1 covers flat group-by + simple aggregations.
- **Cross-grid pivot linking**: out of scope.
- **Row-pinning + pivot**: pinned rows at v1 are top/bottom of body; in pivot mode, pinned-rows are disabled (pivot owns the row hierarchy).

## Source standards

- WAI-ARIA APG `treegrid` pattern: https://www.w3.org/WAI/ARIA/apg/patterns/treegrid/
- AG Grid public docs (pivot reference; **public docs only** per `AGENTS.md §3.2`): https://www.ag-grid.com/react-data-grid/pivoting/
- `aggregation-rfc` (engine shape: `init` / `step` / `merge` / `finalize`).

## Decision summary

| Topic | Decision |
|---|---|
| Engine package | Extends `@bc-grid/aggregations` (new `pivot.ts` module). NOT a separate `@bc-grid/pivots` package — the engine surface is small (~1 module), and consumers invoking pivot already need aggregations. |
| Pivot mode toggle | `BcGridProps.pivotMode?: boolean` (additive, NEW). When true, the grid replaces its body rendering with pivot output. |
| Pivot dimensions | Three: **row groups**, **col groups**, **values**. `BcGridProps.pivotState?: BcPivotState` (controlled) + `defaultPivotState` + `onPivotStateChange`. |
| Per-column eligibility | `column.pivot?: "row" | "col" | "value"` (additive, NEW). Default row pivots on string columns, value pivots on numeric columns; consumer override. |
| Aggregation per value column | Inherits `column.aggregation` (per `api.md §1.1`). Multi-value support: same column can appear once per `aggregationFn` (e.g., sum and count of `balance`). |
| Drag UI | The sidebar Pivot tool panel (`chrome-rfc §Sidebar`) hosts row/col/values drop zones. Drag a column header → move into a zone. Drag out of a zone → return to grid. |
| Engine output shape | Internal: `BcPivotedData<TRow>` with a `Map`-backed cell index (engine-only, non-public). Public/wire: `BcPivotedDataDTO` with `cells: readonly BcPivotCellDTO[]` and tuple `keyPath` instead of composite strings — JSON-safe for `ServerPagedResult.pivotedRows`. Sparse on both shapes. |
| Sub-totals / grand-totals | Each axis has a per-level sub-total row/col + a grand-total. Toggle: `BcPivotState.subtotals: { rows: boolean; cols: boolean }`. Default: both true. |
| Sort within pivot | Row-group axis sorts by the first value column descending by default; consumer can override per dimension. Col-group axis: lexicographic on the dimension value. |
| Server-side pivot | Reserved: `<BcServerGrid pivotMode>` delegates pivot to server via `ServerPagedQuery.pivotState` (additive on `server-query-rfc` types — additive widening covered in this RFC's API surface section). |
| Performance | 10k rows × 5 row-dims × 3 col-dims × 2 values → < 100ms client-side compute (smoke perf). 100k rows: < 500ms (nightly perf). |

---

## Engine

### `BcPivotState`

**Package split (pinned):**
- `@bc-grid/core` owns all *public state and wire DTOs*: `BcPivotState`, `BcPivotValue`, `emptyBcPivotState`, plus the wire-safe DTO `BcPivotedDataDTO` (defined in §`BcPivotedData`). These appear on `BcGridProps`, `BcGridApi`, `ServerPagedQuery`, and `ServerPagedResult`, so they must live where every package can reference them without a layering cycle.
- `@bc-grid/aggregations` owns the *pure engine* (`pivot`, internal trees, the `Map`-backed `BcPivotedData`) and imports `BcPivotState` / `BcPivotValue` from core. Engine output is exported as the wire-safe DTO; the internal `Map` representation is non-public.

```ts
// In @bc-grid/core:

export interface BcPivotState {
  /** Columns to group rows by, in order (outer-most first). */
  rowGroups: readonly ColumnId[]
  /** Columns to group cols by, in order. */
  colGroups: readonly ColumnId[]
  /** Value columns + the aggregation each runs. */
  values: readonly BcPivotValue[]
  /** Sub-total / grand-total toggles. */
  subtotals?: { rows?: boolean; cols?: boolean }
}

export interface BcPivotValue {
  columnId: ColumnId
  /** When omitted: inherit the column's `column.aggregation`. */
  aggregation?: BcAggregation
  /** Optional display label override (default: `${column.header} (${aggregationLabel})`). */
  label?: string
}

// Empty pivot state — equivalent to "pivot mode off" but typed.
export const emptyBcPivotState: BcPivotState = {
  rowGroups: [], colGroups: [], values: [], subtotals: { rows: true, cols: true },
}
```

### `BcPivotedData` (internal) and `BcPivotedDataDTO` (wire / public)

The engine internally builds a sparse tree-of-trees. **The internal shape uses `Map<string, BcPivotCell>` and is non-public** (lives in `@bc-grid/aggregations`, not exported from any package's public surface). For the public surface — anything appearing on `BcGridApi`, `ServerPagedResult.pivotedRows`, or `BcGridProps` — we expose a wire-safe DTO with array cells and tuple key paths.

#### Internal (engine-only, not exported)

```ts
// Lives in @bc-grid/aggregations. Not re-exported from @bc-grid/core.
export interface BcPivotedData<TRow> {
  rowRoot: BcPivotRowNode<TRow>
  colRoot: BcPivotColNode
  /** Sparse value cells. Internal only; do NOT cross package boundaries. */
  cells: Map<string, BcPivotCell>
}
```

#### Wire-safe DTO (public; in `@bc-grid/core`)

This is the shape that crosses *every* package boundary — server adapters serialize it as JSON, the React layer renders it, consumer code passes it via props.

```ts
// In @bc-grid/core:

export interface BcPivotedDataDTO {
  /** Row-group tree. Recursive, JSON-friendly. */
  rowRoot: BcPivotRowNodeDTO
  /** Col-group tree. */
  colRoot: BcPivotColNodeDTO
  /**
   * Value cells as an explicit array (not a Map, not a composite-string key).
   * Each cell carries its row-group and col-group key paths as tuples of
   * unknown values, which the consumer formats per-column. Sparse — missing
   * intersections are simply absent from the array.
   */
  cells: readonly BcPivotCellDTO[]
}

export interface BcPivotRowNodeDTO {
  /** Per-level group values from root to this node, in order. */
  keyPath: readonly unknown[]
  /** This node's group value (last entry of keyPath, denormalised for convenience). */
  value: unknown
  children: readonly BcPivotRowNodeDTO[]
  isTotal: boolean
  level: number
}

export interface BcPivotColNodeDTO {
  keyPath: readonly unknown[]
  value: unknown
  children: readonly BcPivotColNodeDTO[]
  isTotal: boolean
  level: number
}

export interface BcPivotCellDTO {
  rowKeyPath: readonly unknown[]
  colKeyPath: readonly unknown[]
  /** One result per `BcPivotState.values`, in `values` order. */
  results: readonly AggregationResult[]
}

export interface BcPivotRowNode<TRow> extends BcPivotRowNodeDTO {
  /** Rows that fall under this node. Available at leaf nodes (post-grouping). */
  rows?: readonly TRow[]
  children: readonly BcPivotRowNode<TRow>[]
}

export interface BcPivotColNode extends BcPivotColNodeDTO {
  children: readonly BcPivotColNode[]
}

/** Internal cell shape — has tuple keyPaths *and* the cached composite string key. */
export interface BcPivotCell extends BcPivotCellDTO {
  /** Cached "{rowKeyJson}|{colKeyJson}" lookup key for the engine's internal Map. */
  cacheKey: string
}
```

**Why tuple key paths instead of composite strings on the wire:**
- `Map<string, BcPivotCell>` is not JSON-serializable; the server-paged path (`ServerPagedResult.pivotedRows`) requires a JSON-clean structure.
- Composite string keys like `"{a}|{b}"` collide silently when group values stringify the same way (`Date` vs ISO string vs number, `null` vs `"null"`, the literal `"|"` character in the underlying value). Tuple key paths preserve types and ordering without collision.
- Consumers (and the React layer) format keys per-column anyway — the engine should not pre-stringify.

The engine's internal `Map` keys are still allowed (they're a cache); they're computed from the `keyPath` via a stable JSON-encoder for lookup/dedup purposes only and never leak past the package boundary.

### Engine API

```ts
export function pivot<TRow>(
  rows: readonly TRow[],
  columns: readonly BcGridColumn<TRow>[],
  state: BcPivotState,
  ctx?: { locale?: string },
): BcPivotedData<TRow>
```

Algorithm (high level):
1. Group rows by `rowGroups` (recursive — once per nested level).
2. Group rows by `colGroups` (independent of rows). Builds a flat list of column "tuples" per leaf row-group.
3. For each (rowGroup × colGroup) intersection, compute aggregation results using `aggregation-rfc`'s `init` / `step` / `finalize` over the rows that fall in both groups.
4. Insert sub-total + grand-total nodes per axis if enabled.
5. Return `BcPivotedData`.

**Streaming**: when a row is added (`step`-able), pivot can incrementally update affected cells:
- The row's row-group key + col-group key compute in O(rowGroups + colGroups).
- The cell at that intersection's `acc` updates via `step(acc, row)`.
- Sub-totals / grand-totals re-finalize.
- React adapter re-renders only the affected cell DOM.

**Performance**:
- Single-pass row grouping: O(n × rowGroups.length).
- Single-pass col grouping: O(n × colGroups.length).
- Aggregation per cell: O(rows-in-cell × values.length).
- Total: O(n × (rowGroups + colGroups + values)). 10k rows × 5 dims × 2 values = ~150k ops per pivot — well under 100ms.

---

## React layer

### `<BcGrid pivotMode>`

When `pivotMode` is true, the grid:
1. Hides the regular column headers (replaced by col-group axis headers).
2. Hides the regular body cells (replaced by pivot value cells).
3. Renders row-group axis headers on the left (replacing the leftmost column).
4. Routes Tracks 1 (editing) / 2 (range) / 5 (chrome status bar) data through the pivot output (e.g., status bar shows "X row groups by Y col groups, Z values").
5. Disables: row selection (#37), inline editing (Track 1), filter UI (Track 6 inline filters; tool-panel filters still work). These compose with pivot in v1.x; v1 is read-only pivot.

### Pivot DOM shape

```
.bc-grid (role=treegrid in pivot mode)
├── .bc-grid-pivot-header                  (col-group axis — multi-row headers)
│   ├── .bc-grid-pivot-col-group-row       (one per col-group level)
│   │   ├── .bc-grid-pivot-col-cell        (col group label, aria-colspan = leaves under it)
│   │   ├── .bc-grid-pivot-col-cell-total  (sub-total / grand-total)
│   └── ...
├── .bc-grid-pivot-body
│   ├── .bc-grid-pivot-row                 (one per leaf row-group + sub-total + grand-total)
│   │   ├── .bc-grid-pivot-row-axis        (row-group axis cells with aria-level)
│   │   ├── .bc-grid-pivot-value-cell      (one per col-group × value combination)
│   │   └── .bc-grid-pivot-value-cell-total
│   └── ...
└── .bc-grid-statusbar                     (existing; updates per chrome-rfc)
```

a11y per `accessibility-rfc §grid vs treegrid`:
- Root: `role="treegrid"` (was `role="grid"`).
- Row-group cells expose `aria-level={depth}` + `aria-expanded` if expandable.
- Col-group cells expose `aria-colspan` reflecting the number of leaf cols under them.
- Value cells: `role="gridcell"` + `aria-readonly="true"` (pivot output is read-only at v1).
- Total rows/cols set `data-bc-grid-pivot-total="true"` for theming.

### Drag-to-pivot UI

Lives in the sidebar's **Pivot tool panel** (per `chrome-rfc §Sidebar`). The panel renders three drop zones:

```
┌────────────────────────┐
│ Pivot                  │
├────────────────────────┤
│ Available columns      │
│  • Code                │
│  • Region              │
│  • Account             │
│  ...                   │
├────────────────────────┤
│ Row Groups             │   <- drag zone 1
│  Region (drag handle)  │
│  Account               │
├────────────────────────┤
│ Col Groups             │   <- drag zone 2
│  Quarter               │
├────────────────────────┤
│ Values                 │   <- drag zone 3
│  Sum of Balance        │
│  Avg of Balance        │
└────────────────────────┘
```

Drag affordances:
- HTML5 native drag + drop API; same model as the Columns tool panel from `chrome-rfc`.
- Keyboard alternative: arrow-key navigation through zones; Space lifts; Space drops at target.
- Drag a column from the body header into a zone → adds it to that pivot dimension.
- Drag a column out of a zone → returns it to the body.
- Reorder within a zone: drag up/down within the zone.

Aggregation picker for value-zone items: each value chip has a context-menu / right-click menu to pick aggregation type (sum / count / avg / min / max / custom). Default: numeric → sum; non-numeric → count.

### Default column eligibility

Per `column.pivot` (additive prop):
- `"row"` → suggested for row-grouping (drag panel highlights).
- `"col"` → suggested for col-grouping.
- `"value"` → suggested for value aggregation.

When `column.pivot` is omitted: framework heuristic — string columns → row, numeric columns → value, date columns → row (with year/quarter/month derived).

### Pivot state lifecycle

```ts
// On BcGridProps (additive):
pivotMode?: boolean
pivotState?: BcPivotState                                         // controlled
defaultPivotState?: BcPivotState
onPivotStateChange?: (next: BcPivotState, prev: BcPivotState) => void
```

Toggle: when `pivotMode` flips false → true:
1. Default pivot state = `{ rowGroups: column.pivot==="row"[0]?, colGroups: column.pivot==="col"[0]?, values: column.pivot==="value"[0]? }`.
2. If no columns have `pivot` declared, default state is empty; the user adds dimensions via drag.
3. Re-render the grid in pivot mode.

Toggle off: discard pivot state (consumer must re-set if they want to retain it).

### `BcGridApi` additions

```ts
// Additive on BcGridApi (api.md §6.1):
getPivotState(): BcPivotState
setPivotState(next: BcPivotState): void
exportPivot(format: "csv" | "xlsx"): Promise<Blob>     // depends on Track 6 export
```

---

## Server-side pivot

When `<BcServerGrid pivotMode>` is set, pivot computation moves to the server. v1 wire shape (additive on `server-query-rfc` types):

```ts
// In @bc-grid/core (additive):
interface ServerPagedQuery extends ServerQueryBase {
  // ...existing fields...
  pivotState?: BcPivotState
}

interface ServerPagedResult<TRow> {
  // ...existing fields...
  pivotedRows?: BcPivotedDataDTO         // wire-safe; when consumer's loadPage returned pivot output
}
```

Server-side pivot at v1 is **opt-in by consumer** — bc-grid passes `pivotState` to `loadPage`; consumer's backend does the pivot; result rows arrive as a flat `pivotedRows` shape that the React layer renders directly.

For client-side pivot (default), the engine runs on `data` rows; for server-paged with pivot, the engine renders the server's `pivotedRows` directly (no recompute).

Documenting both modes makes the v1 surface forward-compatible with Q4-style server enhancements without breaking consumers who use client-side pivot.

---

## Implementation tasks (Phase 6 Track 4 second half)

| Task | Effort | Depends on |
|---|---|---|
| `pivot-engine` (`pivot.ts` in `@bc-grid/aggregations`) | M | aggregation-engine + this RFC |
| `pivot-ui-drag-zones` (Pivot tool panel + drag affordances) | M | sidebar-impl + this RFC |
| `pivot-row-col-groups` (treegrid rendering + sub-totals + grand-totals) | M | pivot-engine + grid-tsx-file-split (#50, merged) |

`pivot-engine` is single-owner. `pivot-ui-drag-zones` and `pivot-row-col-groups` can run parallel after `pivot-engine` lands.

---

## Test plan

### Unit (Vitest)

- `pivot(rows, columns, state)` driver: 1 row dim × 1 col dim × 1 value sum, asserting cell results.
- 2 row dims × 1 col dim → nested row groups.
- 0 row dims (just columns + values): single row of totals.
- Sub-totals + grand-totals: enabled / disabled per axis.
- Streaming: incremental row-add via `step` → only the affected cell re-aggregates.
- Sparse output: 100 rows × 50 distinct col groups × 5 row groups → ~5k cells in the sparse map (most empty).

### Integration (Vitest + RTL)

- `<BcGrid pivotMode>` renders treegrid output.
- Drag a column from body header to row-groups zone → pivot output updates.
- Aggregation picker on value chip: changes from sum → count, output recomputes.
- Toggle `pivotMode` off: returns to flat grid.

### E2E (Playwright × 3 browsers)

- AR Customers demo: enable pivot mode; row-group by `region`, col-group by `aging-bucket`, value `sum(balance)`. Assert pivoted cell count + a sample value.
- Drag a value column (from body) into the values zone → aggregation appears.
- Sub-totals toggle: row-group with sub-totals shows extra row per group.

### Perf (smoke + nightly)

- Smoke: 10k rows × 5 row dims × 3 col dims × 2 values → < 100ms compute.
- Nightly: 100k rows same shape → < 500ms.

## Acceptance criteria

- `@bc-grid/aggregations/pivot` module ships engine + driver.
- `@bc-grid/react/pivot` ships `<BcGrid pivotMode>` rendering + Pivot tool panel.
- AR Customers demo exercises a real pivot scenario.
- axe-core clean: treegrid roles + aria-level + aria-expanded.
- Manifest updated for both new exports.
- `BcPivotState`, `BcPivotValue`, `BcPivotedData`, `BcPivotRowNode`, `BcPivotColNode`, `BcPivotCell` added to api.md §1 (additive).

## Open questions

### Pivot + filter composition?
**Decision: filter applies first, then pivot operates on filtered rows.** Default scope is "filtered" (consistent with aggregation-rfc). `BcGridProps.pivotScope?: "filtered" | "all"` (additive) lets consumers override.

### Pivot + sort?
Sort applies to the pivot axis (row-group axis sorts by configured value column, col-group axis sorts lexicographically). Per-axis sort overrides via `BcPivotState.rowSort`/`colSort` (post-1.0).

### Pivot mode + range selection (Track 2)?
Range selection works in pivot mode but selects pivot cells (row × col group intersections), not raw rows. Copy-from-pivot serializes the value matrix as TSV with row/col headers. Implementation lands in `pivot-row-col-groups` task.

### Server-side pivot wire format
Reserved per server-query-rfc; full impl is v1.1+. v1 ships the client-side pivot + types for the server pivot wire.

### Drill-down to detail rows
Out of v1. Consumer can wire via `onPivotCellClick(cell)` → open a custom drawer showing `cell.results` source rows. Document as a recipe.

## References

- `docs/design/aggregation-rfc.md` (engine reuse — the `Aggregation` shape is identical)
- `docs/design/chrome-rfc.md §Sidebar` (Pivot tool panel slot)
- `docs/design/server-query-rfc.md` (server pivot reservations)
- `docs/design/accessibility-rfc.md §grid vs treegrid` (treegrid role decision)
- `docs/design.md §2` (pivot non-goal at Q1; promoted to v1 per sprint pivot)
- `docs/coordination/v1-parity-sprint.md §Track 4`
