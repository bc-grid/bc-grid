# Client Tree Row Model RFC

**Status:** Draft for ratification (autonomous merge authorised; this RFC documents design + open questions, it does not gate ship)
**Author:** worker1 (Claude)
**Reviewer:** maintainer (JohnC) + Claude coordinator
**Target release:** v0.6.0
**Implementation lane:** worker1 (single PR sequence; can split if scope creep emerges)
**Informed by:** `apps/examples/src/production-estimating.example.tsx` (lines 380-420 — finding #1 + finding #3 production-estimating spike workaround), `docs/coordination/handoff-worker1.md` v0.6 headline spec, `packages/react/src/grouping.ts` (existing client-side grouping pattern), `packages/server-row-model/src/index.ts` (server tree node + snapshot shape for the API parity reference), `packages/react/src/grid.tsx` (`expansionState` controlled-state plumbing).

---

## 1. Problem statement

bc-grid ships server tree (`<BcServerGrid rowModel="tree">`, surface in `BcServerTreeProps` at `packages/react/src/types.ts:1144`) for consumers who fetch parent/child data lazily from a server. Consumers with **client-side** parent/child data have no comparable primitive. They have two workarounds today:

1. **Flatten + use grouping** — `BcGridProps.groupableColumns` + `groupBy` (built via `packages/react/src/grouping.ts:31` `buildGroupedRowModel`) creates synthetic group-header rows from a column's value buckets. This LOSES the parent ID model: a PO row becomes a "group header" with an aggregate label, not a real row that can render its own status / vendor / scheduled date / notes columns. Parent rows that need to edit, render rich cells, or carry their own rowState collide with the synthesised `kind: "group"` shape (see `production-estimating.example.tsx:399-411`).

2. **Wire a fake server endpoint** — wrap the client data in a synthetic `loadChildren` that filters by `parentRowId` and use `<BcServerGrid rowModel="tree">`. Adds React state + an in-memory loader the consumer wouldn't otherwise need; pulls in the server-row-model dependency chain; loses the simple `data` prop contract.

The production-estimating spike (#374) finding #1 explicitly flagged this gap and worked around it by carrying `parentId?` on the row type, hand-filtering visible rows against `state.expansion`, and indenting via a `cellRenderer` (~22 LOC of workaround per `production-estimating.example.tsx:389-391`). The doc-management spike (#367) hit the same shape on a different domain (folder tree). Two-spike-confirmed.

The right primitive is **a client-side tree row model** that mirrors `BcServerTreeProps`'s contract over data the consumer already holds in `BcGridProps.data`. AG Grid ships this as `treeData: true` + `getDataPath`; bc-grid's natural shape is `treeData: { getRowParentId }` because it composes with our existing `BcRowId<TRow>` identity primitive.

## 2. Scope and non-goals

**In scope (v0.6.0):**

- `BcGridProps.treeData?: BcClientTreeData<TRow>` opt-in prop. When set, the grid builds a parent → children adjacency map from `data` and renders rows with hierarchical indentation per the user's `expansionState`.
- `BcClientTreeData<TRow>.getRowParentId: (row: TRow) => RowId | null` — required when `treeData` is set; returns the parent's `RowId` (resolved via the grid's `rowId` getter on the candidate parent row) or `null` for root rows.
- `BcClientTreeData<TRow>.getRowChildCount?: (row: TRow) => number | undefined` — optional; when supplied, lets parent rows declare a child count even before children render (e.g. while the data prop is still streaming). Defaults to "computed from children present in `data`".
- **Outline column variant** — opt-in via `BcGridColumn.outline?: true`. The cell renderer for that column wraps the consumer's value (or the default formatted value) in a chevron + indent + level affordance. Reuses `DisclosureChevron` from `packages/react/src/internal/disclosure-icon`.
- **Sort + filter through the tree** — sort applies to siblings under each parent (preserving hierarchy); filter that hides a row hides its descendants by default, with a `treeData.keepAncestors?: boolean` opt-out (default `true` so users see filtered context).
- **Aggregations integration** — when a column has `aggregation`, parent rows aggregate their descendants' values via the existing `@bc-grid/aggregations` engine. Reuses `BcAggregationFooterRow`'s engine path (we don't add new aggregation primitives).
- **Expansion state** — uses the existing `expansion` / `defaultExpansion` / `onExpansionChange` controlled-state pair on `BcGridProps` (declared at `packages/core/src/index.ts:439`). Tree rowIds participate in the same set master-detail uses today; consumers can drive both interchangeably.
- **`apiRef.expandAll()` / `collapseAll()`** — already exist on `BcGridApi`; they walk `expansionState` and toggle every parent rowId. With tree mode active, the parent rowIds come from the tree's adjacency map.

**Out of scope:**

- **Server tree changes.** `<BcServerGrid rowModel="tree">` keeps its current shape. The two paths are independent; `treeData` on `<BcGrid>` does not interact with `loadChildren`.
- **Lazy-loading client tree.** All rows live in `data`. Consumers with lazy/paged client trees should use `<BcServerGrid>`. No client-side `loadChildren` callback on `<BcGrid>`.
- **Drag-to-reparent.** Row drag/drop is the separate `v06-row-drag-drop-hooks` task; tree mode composes with it once that ships, but this RFC ships read-only tree.
- **Per-column outline cell tweaks.** Indent width, chevron size, level badge are theming tokens (`--bc-grid-tree-indent-step`, etc.); consumers customise via theming, not per-cell renderer override.
- **Tree-aware selection algebra.** "Select a parent → also select descendants" semantics. This is a distinct behavior worth its own ratification — defer to v0.7 unless a consumer asks. Default: selecting a parent selects only the parent row.
- **Pivot / aggregation footer changes.** The grid-level aggregation footer (`BcGridAggregationFooterRow`) keeps its current shape. Tree row aggregations live on the parent rows themselves; the footer is independent.

## 3. Architectural shape

Today's data → render pipeline (simplified):

```
data: TRow[]
  └── client transforms (filter → sort → search → group)
      └── DataRowEntry[] / GroupRowEntry[]  (kind: "data" | "group")
          └── pagination slice
              └── virtualizer rows
                  └── renderBodyCell / renderGroupRowCell
```

Adding tree mode:

```
data: TRow[]
  └── treeData ? buildClientTree(data, getRowParentId, rowId) → ClientTreeIndex
  ├── client transforms (filter → sort)         ┐
  │   └── filter / sort apply per-subtree        │ tree mode replaces the
  │       (preserve hierarchy)                   │ `groupBy` branch when
  ├── flatten via expansionState                 │ treeData is set
  │   (only render rows whose ancestors are     │
  │    expanded; root rows always render)        │
  └── DataRowEntry[] (kind: "data", level)      ┘
      └── ... (rest of the pipeline unchanged)
```

`ClientTreeIndex` is the in-memory adjacency representation:

```ts
interface ClientTreeIndex<TRow> {
  /** All rows in `data`, keyed by rowId. */
  byId: ReadonlyMap<RowId, TRow>
  /** Root rowIds (rows with no parent). */
  rootIds: readonly RowId[]
  /** rowId → ordered list of child rowIds. */
  childrenByParent: ReadonlyMap<RowId, readonly RowId[]>
  /** rowId → parent rowId (or null for roots). */
  parentByChild: ReadonlyMap<RowId, RowId | null>
  /** rowId → tree depth (0 = root). */
  levelById: ReadonlyMap<RowId, number>
}

function buildClientTree<TRow>(
  data: readonly TRow[],
  getRowParentId: (row: TRow) => RowId | null,
  rowId: BcRowId<TRow>,
): ClientTreeIndex<TRow>
```

Built once per `data` change via `useMemo([data, treeData?.getRowParentId, rowId])`. O(N) construction, O(1) per-row lookup. Cycles (`A.parent = B`, `B.parent = A`) detected during build and broken by demoting the late-arriving back-edge to `null` (root) with a `console.error`; cycle behaviour matches AG Grid's "warn and treat as orphan."

The `ClientTreeIndex` is fed into a new `flattenClientTree` step that, given the index + `expansionState`, produces an ordered `DataRowEntry[]`:

```ts
function flattenClientTree<TRow>(input: {
  index: ClientTreeIndex<TRow>
  expansionState: ReadonlySet<RowId>
  visibleRowIds?: ReadonlySet<RowId> | undefined
}): readonly DataRowEntry<TRow>[]
```

Walks `rootIds` in order, recursing into each root's children only if the root is in `expansionState`. Emits `DataRowEntry` with `kind: "data"`, the row, the rowId, the row's `level` (depth), and the canonical `index` (DOM order in the rendered list).

`DataRowEntry.level` already exists on the type (`packages/react/src/gridInternals.ts:95` — `level?: number`). We just populate it instead of leaving it `undefined`.

**Why not extend `GroupRowEntry`?** A tree row IS a real data row that needs to render columns, edit, carry rowState, etc. `GroupRowEntry.kind = "group"` is a *synthetic* row (no underlying TRow); using it for tree parents collides with edit/render paths that branch on `isDataRowEntry`. Tree parents are real `DataRowEntry`s with `level > 0`; the chevron + indent are an OUTLINE COLUMN concern, not a row-kind concern.

## 4. Outline column variant

`BcGridColumn.outline?: true` opts the column into the outline cell variant. The cell renderer (a small helper at the renderBodyCell layer) wraps the column's value with:

1. A leading indent of `level * indentStep` pixels (token: `--bc-grid-tree-indent-step`, default 20px).
2. A `<DisclosureChevron>` (or empty span if the row is a leaf — `index.childrenByParent.get(rowId)` is empty/missing). Chevron click toggles `expansionState` for that rowId.
3. The consumer's `cellRenderer(params)` output (or default formatted value).

The outline column composes with all other column features (sortable, filterable, pinned, editable). Only one column should be `outline: true` per grid; if multiple are set, the first wins and a `console.warn` fires (matches AG Grid's `cellRenderer: "agGroupCellRenderer"` ergonomics).

CSS: `.bc-grid-cell-outline` carries the indent + flex layout; `.bc-grid-tree-toggle` is the chevron button (mirrors `.bc-grid-group-toggle` from group rows). Both classes get added to the existing theming sweep.

**Outline + group rows interplay:** when both `treeData` is set AND `groupBy` is non-empty, `groupBy` wins (the grid groups the tree's flat data, hiding the tree). This isn't a useful combination but is well-defined; log a `console.warn` so consumers notice the override.

## 5. Sort + filter through the tree

**Sort** — when active, applies WITHIN each subtree level. Roots are sorted; each parent's children are sorted independently. Hierarchy is preserved. Implementation: in `flattenClientTree`, sort the `rootIds` and each `childrenByParent` list before recursing. Sort comparator comes from the existing `applySort` (re-exported from `packages/react/src/sort.ts`); we just call it per-subtree instead of over the flat data.

**Filter** — two modes, controlled by `treeData.keepAncestors?: boolean` (default `true`):

- `keepAncestors: true` — when filtering hides row R, R's children are also hidden, but R's ancestors are KEPT visible (so the user sees the parent context that R lives under). This is the AG Grid default and matches user expectations for "find the row in this tree." Implementation: build the visible set as the union of (rows that pass the filter) + (their ancestors).
- `keepAncestors: false` — when filtering hides row R, R's children are hidden AND R's ancestors are hidden if no other descendant matches. Implementation: visible set is rows that pass the filter; ancestors are visible only if at least one of their descendants is visible.

Search uses the same filter pipeline (`packages/react/src/search.ts` produces a `searchVisibleRowIds` set that feeds the filter step). Same `keepAncestors` semantics apply.

## 6. Aggregations integration

When a column has `aggregation` set (e.g. `aggregation: { type: "sum" }`), tree parent rows display the aggregated value of their descendants in that column. Reuses `@bc-grid/aggregations`'s `aggregateColumns` engine — for each parent row, aggregate over its descendants (filtered by visibility). The aggregated value renders via the column's `aggregationFormatter` (or default formatter) at the parent row's cell.

**Where aggregation runs:** parent rows participate in the body cell renderer's value lookup. A new helper `resolveTreeAggregatedValue(params)` checks if the row is a tree parent (`index.childrenByParent.get(rowId)?.length > 0`) AND if the column has `aggregation`, and if so returns the aggregated value over descendants. Otherwise falls through to `getCellValue(row, column.source)` as today.

**Performance:** aggregations memoised per `(data, filter, sort, treeData)` tuple. O(N) per change because each row is visited once during aggregate accumulation.

**Edit + aggregation:** when the user edits a leaf cell in an aggregated column, the parent's aggregate refreshes via the existing edit overlay → re-render path. No special edit handling needed.

## 7. Public API delta

Diff against `docs/api.md §3.1` (BcGridProps):

```ts
export interface BcGridProps<TRow> extends BcGridIdentity, BcGridStateProps {
  // ... existing fields
  /**
   * Opt-in client-side tree row model. When supplied, the grid builds
   * a parent → children adjacency from `data` via `getRowParentId`
   * and renders rows with hierarchical indentation per the
   * `expansion` controlled state. Independent of `<BcServerGrid
   * rowModel="tree">` (which fetches children lazily).
   */
  treeData?: BcClientTreeData<TRow>
}

export interface BcClientTreeData<TRow> {
  /**
   * Parent rowId for `row`, or `null` if `row` is a root. Resolved
   * against the grid's `rowId` getter — the returned RowId must
   * match the rowId of some other row in `data`. Cycles are detected
   * at index-build time and broken by demoting the late edge to a
   * root with a `console.error`.
   */
  getRowParentId: (row: TRow) => RowId | null
  /**
   * Optional declared child count. When set, the chevron + count
   * affordances on parent rows render this number even before their
   * children appear in `data` (useful when `data` streams in pages).
   * When omitted, the count is computed from children present in
   * `data`.
   */
  getRowChildCount?: (row: TRow) => number | undefined
  /**
   * Filter behaviour. When `true` (default), filtering preserves
   * ancestors of matching rows so users see the tree context. When
   * `false`, filtering hides ancestors whose subtrees have no
   * matches (compact view, like a flat filter).
   */
  keepAncestors?: boolean
}
```

Diff against `docs/api.md §3.2` (BcGridColumn):

```ts
export interface BcGridColumn<TRow, TValue = unknown> {
  // ... existing fields
  /**
   * Mark this column as the tree-outline column. The cell renderer
   * wraps the value with a chevron + indent + level affordance.
   * Active only when `BcGridProps.treeData` is set; ignored
   * otherwise. At most one column should be `outline: true` per grid;
   * the first wins.
   */
  outline?: boolean
}
```

`BcGridApi.expandAll()` / `collapseAll()` already exist; their semantics extend to tree-mode parent rowIds without API change.

`docs/api.md §5.1` (`<BcGrid>`) gets a new subsection documenting tree mode + the outline column. Migration: none — `treeData` is opt-in and additive.

## 8. Performance budget

- **Tree index build:** O(N) over `data.length`. Memoised per `(data, getRowParentId, rowId)`. Production-estimating's spike runs ~5k rows comfortably; bc-grid's perf bar is 100k rows for client-side.
- **Tree flatten:** O(visible_rows). Re-runs when `expansionState` or filter visibility changes. Sort runs per-subtree on flatten.
- **Tree aggregations:** O(N) per filter/sort change. Memoised per `(data, filter, sort, treeData, columns)` tuple.
- **Bench cases (coordinator runs at merge):**
  - `tree-build at 100k rows × max-depth 5` — index build under 50ms.
  - `tree-flatten with all expanded` — flatten under 30ms.
  - `tree aggregation across 100k rows` — sum-by-column under 80ms.
- Add cases to `apps/benchmarks/tests/perf.perf.pw.ts` + a harness function `clientTreeBuild` mirroring the existing `serverRowModelBlocks` shape.

## 9. Test plan

**Unit tests (this PR ships):**

- `clientTree.test.ts` (new) — `buildClientTree` correctness:
  - root-only data (no `getRowParentId` matches) → all rows are roots.
  - simple parent/child (one parent + 3 children).
  - deep tree (5 levels).
  - cycle detection (A→B→A) — break with console.error.
  - orphan handling (child references missing parent) — treat as root with console.warn.
  - stable child ordering (children appear in `data`-array order under each parent).
- `flattenClientTree.test.ts` (new) — flatten correctness:
  - all expanded → entire tree visible.
  - none expanded → only roots.
  - partial expansion → only descendants of expanded rows.
  - sort applied per-subtree (siblings sort within each parent).
  - filter with `keepAncestors: true` → ancestors preserved.
  - filter with `keepAncestors: false` → ancestors hidden if no descendants match.
- `treeAggregations.test.ts` (new) — aggregation correctness:
  - sum aggregation on a parent matches sum of descendants.
  - count aggregation matches count of leaf descendants.
  - filter affects aggregation (parent shows sum of visible descendants only).
  - mixed leaf + parent columns (aggregation only for parent rows that have descendants).

**Playwright (1 happy-path; coordinator runs at merge):**

- `tests/client-tree-rowmodel.pw.ts` — production-estimating-style outline grid:
  - Mount with `?clientTree=1` (new URL flag mounting an `apps/examples/src/client-tree.example.tsx` demo).
  - Assert root rows render with chevrons; click chevron expands.
  - Assert child rows indent visibly (computed `padding-left` on outline cell > root's).
  - Apply a filter → assert `keepAncestors` keeps parent visible while child matches.
  - `apiRef.expandAll()` from the demo's button → all rows visible.

## 10. PR sequencing

Recommendation: **single PR**. The 5 deliverables are tightly coupled (the outline column needs the tree index; aggregations need the tree index; sort/filter through tree needs the flatten step). Splitting buys nothing because each split needs unfinished pieces from the others to be testable.

Estimated scope: ~700-1000 LOC implementation + ~300-400 LOC tests. ~1-2 days of focused work. Branch `agent/worker1/v06-client-tree-rowmodel`.

Coordinator can request a split into (a) tree index + outline column + flatten + 1 demo + tests; (b) sort/filter through tree + tree aggregations + remaining tests if the PR ends up larger than 1500 LOC at review time.

## 11. Open questions for ratification

1. **`getRowParentId` shape — `RowId | null` or `RowId | undefined`?** Today's `BcRowId<TRow>` returns `RowId` (always defined). Recommendation: `RowId | null` (explicit "no parent" sentinel; matches `BcServerGridApi.parentRowId: RowId | null`).

2. **Cycle handling — error or silent ignore?** Recommendation: `console.error` and demote the back-edge to `null` (treat the cycle-creating row as a root). Failing loudly makes broken consumer data visible; not crashing keeps a misconfigured ERP grid usable.

3. **`outline: true` collision with `groupBy` non-empty.** Recommendation: `groupBy` wins (groups the tree's flat data, suppressing tree mode). `console.warn` so consumers notice. Alternative: throw at mount; rejected as too aggressive for a configuration overlap users may hit during refactors.

4. **`keepAncestors` default.** Recommendation: `true` (preserves ancestors during filter, matches AG Grid). Alternative: `false`. Pick once and document.

5. **Tree-aware selection.** Out of scope here. Recommendation: explicit deferral to v0.7 with a queue entry.

6. **Should `buildClientTree` ship from `@bc-grid/core` or stay in `@bc-grid/react`?** Recommendation: `@bc-grid/react` for now (the rendering layer is the only consumer). Move to `@bc-grid/core` if a future `<BcServerGrid>` mode wants to compose client-side parent ID resolution on a server-fetched flat list.

7. **Naming: `treeData` vs `clientTreeData`?** AG Grid uses `treeData: true` (and a separate `getDataPath`); we're picking up `treeData: { ... }` as the object form. Recommendation: `treeData` (matches AG Grid naming users already know; the prop type makes it clear it's the client variant). Alternative: `clientTreeData` for unambiguous distinction from `BcServerTreeProps`. Pick once and document.
