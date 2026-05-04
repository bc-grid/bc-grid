# Body Cell Memoisation Deferral

**Status:** DEFERRED to a session with local perf bench access. Documentation-only doc explaining why and how to unblock.

**Created:** 2026-05-04 by worker1 (Claude). Companion to:
- `docs/coordination/v05-audit-followups/worker1-server-perf.md §2` (originating planning entry)
- Worker1 v0.6 handoff "Active now" pickup (2026-05-04 round 2)
- Precedent deferrals: `docs/design/v05-server-loader-generics-deferral.md` (#376), `docs/design/server-infinite-tree-dual-output-deferral.md` (#485)

---

## What was deferred

The handoff queued `v06-body-cell-memoisation` as the next active task. Spec:

> Extract a memoized `<BodyCell />` from `renderBodyCell` in `bodyCells.tsx`. Per visible cell × per render is 300-1500 invocations on a 30-row × 10-30-column grid. Memo key: `(entry.rowId, column.columnId, value, formattedValue, searchText, selected, focused, editingCell, rowEditState)`. Bench: 50k × 30 paged mode with active sort+filter+1Hz scroll churn. **Verify net positive.**

The handoff's emphasis on "verify net positive" is the binding constraint. `React.memo` adds a comparator runtime cost on every render — it's only a perf win when the comparator's overhead is consistently less than the saved render work. For body cells, the comparator must compare ~15 fields (see §3 below); a poorly designed comparator can be net negative.

## Why deferred

Three concerns combine to make this risky to ship without local perf-bench verification:

### 1. Worker rule forbids local perf bench

`docs/AGENTS.md §6`: "Workers run focused unit tests + `bun run type-check` + `bun run lint` + the affected package's build. Never run `bun run test:e2e`, `bun run test:smoke-perf`, `bun run test:perf`."

The handoff explicitly says "verify net positive" but the only way to verify locally requires `bun run test:perf` with a before/after sweep. Without that, the worker can ship a comparator that's correct (no stale renders) but slower than no-memo (negative perf delta).

### 2. Comparator surface is large + correctness-sensitive

The handoff's suggested memo key — `(rowId, columnId, value, formattedValue, searchText, selected, focused, editingCell, rowEditState)` — is the MINIMUM viable. Today's `renderBodyCell` reads from MANY more inputs that affect render output:

| Input | Source | Affects render? |
|---|---|---|
| `entry.row` | `rowEntries[idx]` | ✅ yes (cell value) |
| `entry.index` / `entry.level` | same | ✅ yes (ARIA, outline indent) |
| `column.source` | `consumerResolvedColumns` | ✅ yes (cellRenderer, format, comparator) |
| `column.align` | same | ✅ yes (cell-right class) |
| `pinnedEdge` / `pinnedLaneOffset` | per-call-site | ✅ yes (sticky positioning) |
| `virtualCol.left` / `.width` / `.pinned` | virtualizer | ✅ yes (inline style left/width) |
| `virtualRow.height` | virtualizer | ✅ yes (inline style height) |
| `locale` | grid prop | ✅ yes (formatCellValue) |
| `domBaseId` | grid prop | ✅ yes (cell ID) |
| `searchText`, `selected`, `disabled`, `expanded` | per-row | ✅ yes |
| `activeCell` (object) | grid state | computed match → ✅ yes |
| `editingCell` (object) | edit controller | computed match → ✅ yes |
| `hasOverlayValue(rowId, colId)` | edit controller | result → ✅ yes (overlayApplies) |
| `getOverlayValue(rowId, colId)` | edit controller | result → ✅ yes (value) |
| `getCellEditEntry(rowId, colId)` | edit controller | result → ✅ yes (pending/error) |
| `getRowEditState(rowId)` | edit controller | result → ✅ yes (rowState) |
| `isCellFlashing(rowId, colId)` | edit controller | result → ✅ yes (flash class) |
| `getTreeOutlineInfo(rowId)` | grid state | result → ✅ yes (chevron/indent) |

A correct comparator needs to:
- Compare ~12 primitive props (cheap — refs / strings / bools).
- Compare 3 object refs (`entry`, `column`, `virtualCol`/`virtualRow`) — these are NOT stable across renders unless additional memoisation lifts them up.
- Re-evaluate the 6 callback lookups for THIS cell (cost equivalent to running them — limits the memo savings).

If the comparator misses a field, cells render stale. If the comparator includes too much, the cost approaches just running the renderer.

### 3. Object-prop stability isn't there yet

The default `React.memo` shallow comparator would catch most cases IF all object props were referentially stable across renders. Today they're not:

- `entry` — recreated by the `rowEntries` useMemo when `rowEntriesBase` changes (any sort/filter/group/expansion shift rebuilds the array).
- `column` (`ResolvedColumn`) — recreated by the `consumerResolvedColumns` useMemo when columns / column state changes.
- `virtualCol` / `virtualRow` — recreated by the virtualizer per scroll / resize.

Without object-prop stability, the default shallow comparator effectively never short-circuits for body cells. A custom comparator is mandatory.

The deeper architectural fix — making these objects stable across renders — is itself substantive work (object-pooling for virtualizer outputs, structural-sharing for rowEntries, stable column.source references). That's a multi-PR refactor far beyond the scope of "memoize the cell".

## What ships in this PR

This deferral doc (commit-only). The body cell continues to render via the existing `renderBodyCell` function path; no behavior change.

## How to unblock

A future implementation PR should be opened by an actor with local perf bench access (the Claude coordinator in `~/work/bc-grid` is the natural candidate). Recommended sequence:

1. **Step 1 — convert `renderBodyCell` → `BcBodyCell` component, NO memo.** Pure structural refactor; same JSX output. Verify zero behavior change with the existing test suite. ~150 LOC delta.

2. **Step 2 — design the custom comparator + export it as a pure helper for unit testing.** Comparator covers the 15 fields above. Tests pin the contract: every field that affects rendering also short-circuits the memo when the field changes.

3. **Step 3 — wrap `BcBodyCell` with `React.memo(BcBodyCell, areEqual)`.** Run the bench: 50k × 30 paged mode with active sort+filter+1Hz scroll churn. Compare:
   - Cell render time per frame (target: 30%+ reduction).
   - Scroll FPS (target: ≥58 from the existing baseline).
   - Memo hit rate (target: ≥85% during steady-state scroll).
4. **Step 4 — if any metric regresses, iterate on the comparator OR back out the memo.** A faster path may be to tackle the underlying object-prop stability instead (rowEntries structural sharing, column.source stability via deeper memoisation in the columns pipeline).

## Recommended path for the coordinator

The coordinator can ship this in a single session:

1. Pick this branch up.
2. Run the conversion + memo wrap (~2-3 hours).
3. Run `bun run test:perf -- perf.perf.pw.ts` before + after.
4. If net positive, ship. If not, iterate or back out.

Alternatively, treat it as a v0.7 prep item (we don't ship perf optimizations into v0.6 alpha unless they unblock a consumer; deferred without a deadline pressure is fine).

## Open questions

1. **Object-prop stability vs custom comparator** — which is the better long-term path? Object stability fixes more things at once but requires deeper changes. Custom comparator is local but fragile. Defer to the coordinator's bench results.

2. **Should `entry` / `column` be split into primitive props at the call site to avoid object identity comparisons?** E.g. pass `rowId, row, index, level, columnId, columnSource` instead of `entry, column`. Adds prop count but each prop becomes shallow-compareable. Defer to implementation.

3. **Does the column.cellRenderer / column.cellClass / column.cellStyle function-prop pattern preclude stable column.source refs?** Consumers commonly inline these as arrow functions. If so, the comparator must skip column.source comparison and rely on column.columnId only — which means cell renderer changes don't trigger re-render. Pin in the bench scenario.

## Decision log

(empty — populated when the implementation PR opens.)
