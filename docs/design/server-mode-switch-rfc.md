# Server Mode Switch with State Carry-Over RFC

**Status:** Draft for maintainer ratification
**Author:** coordinator (Claude)
**Reviewer:** maintainer (JohnC)
**Target releases:** v0.5.0-alpha.2 (RFC + structural change); v0.5.0 GA (bsncraft customers grid migrates onto it)
**Informed by:** `docs/design.md §10`, `docs/api.md §5.3`, `docs/coordination/release-milestone-roadmap.md §v0.5.0` (alpha.2 prerequisites, 2026-05-03 entry), `docs/coordination/v0.5-audit-refactor-plan.md`, `docs/design/vanilla-and-context-menu-rfc.md` (BcUserSettings), `docs/design/server-query-rfc.md`.

Worker1 owns implementation as the next lane after the context-menu work per the roadmap.

---

## 1. Problem statement

bc-grid's server row model ships three modes — `paged`, `infinite`, `tree` — discriminated at the `<BcServerGrid rowModel>` prop. The discriminator drives three independent state hooks inside `serverGrid.tsx` (`usePagedServerState`, `useInfiniteServerState`, `useTreeServerState`, declared at `packages/react/src/serverGrid.tsx:334-336`), each of which builds its own `createServerRowModel<TRow>()` (`:717`, `:1065`, `:1324`). Every callback the inner `<BcGrid>` consumes — `onSortChange`, `onFilterChange`, `onSearchTextChange`, `onColumnStateChange`, `onGroupByChange`, `onPaginationChange` — fans out at the JSX site (`:653-672`) by checking `props.rowModel`. The three turnkey hooks (`useServerPagedGrid`, `useServerInfiniteGrid`, `useServerTreeGrid`) bake the same boundary into their public surfaces: each returns `BcServerPagedProps`/`BcServerInfiniteProps`/`BcServerTreeProps` with `rowModel` pinned to a literal (`useServerPagedGrid.ts:287`, `useServerInfiniteGrid.ts:264`, `useServerTreeGrid.ts:404`), and each owns its own `apiRef`, its own debounced view state, its own mutation-id stream, and its own controlled-state surface.

The discriminator is therefore not "a mode flag on a unified component" — it is a hard boundary between three independent state machines. When a consumer wraps `<BcServerGrid rowModel="paged">` and `<BcServerGrid rowModel="tree">` in a ternary on `groupBy.length` (which is exactly what bsncraft's `apps/web/components/data-grid.tsx:536-553` does today), React unmounts one machine and mounts the other on the toggle. Everything that lived inside the unmounted instance is gone:

- the `createServerRowModel<TRow>()` cache (block keys, in-flight controllers, pending mutations, last `viewKey`);
- the controlled-state surrogates the inner hook held when consumers used uncontrolled props (`uncontrolledSort`, `uncontrolledFilter`, `uncontrolledColumnState`, `uncontrolledGroupBy`, `uncontrolledPage`, `uncontrolledPageSize` in `serverGrid.tsx:682-799`);
- the inner `<BcGrid>`'s scroll position, range selection, focused row, view-key generation, and persisted column-state writers;
- both `apiRef` instances. The consumer's `apiRef.current` is the new mode's API; the previous mode's imperative state is discarded.

bsncraft is the canonical case. A 36k-row customers grid driven by `useServerPagedGrid`-style state runs in paged mode by default; flipping a "Group by Customer Type" select reroutes it to `useServerTreeGrid`-style state. Today the consumer wraps the discriminated mount with ~120 LOC of ceremony in `data-grid.tsx` (the file is 599 LOC; the discriminated-mount + shared-prop assembly + groupBy reset flow adds up to roughly that across the JSX, the prop assembly, and the host's `gridSettings` plumbing). Even with that wrapper, every state dimension listed above is lost on the toggle. From the user's seat: filters disappear, scroll snaps to top, the row they were focused on is unfocused, and the tree mode re-fetches its root from scratch.

This is **structural**, not ergonomic. No amount of consumer code can preserve carry-over while two independent state machines mount and unmount under it. The hooks land *outside* the consumer; the discriminator runs *inside* JSX. The 2026-05-03 maintainer call recorded in the roadmap ("this should have been day-1 functionality when server mode + grouping shipped") names dual-output as the "more important deliverable" before v0.5.0 stable.

## 2. Scope and non-goals

**In scope (v0.5.0):**

- Paged ⇄ tree mode switch with state carry-over driven by a controlled `groupBy` prop on a single `<BcServerGrid>` (or successor) instance.
- Carry-over of every dimension enumerated in §4 across the switch.
- Server contract on switch (§5): one in-flight request per mode at a time; the previous mode's request is aborted; the new mode's first query carries the carried-over `view`.
- Public-API surface delta in `api.md` (§6).
- Composition with `BcUserSettings` from `vanilla-and-context-menu-rfc §5` so the toggle is a setting that round-trips with the rest of the user-preference store.

**In scope if cheap (v0.5.0 stretch):**

- Paged ⇄ infinite switch driven by a `rowModel` prop on the same component. Same carry-over contract. Surfaces the AG Grid SSRM "viewport mode" pattern that bsncraft is starting to ask for.

**Out of scope:**

- Server-contract changes. Each mode's `loadPage` / `loadBlock` / `loadChildren` shape stays exactly as it is in `docs/api.md §5.3`. The switch is a *client-side orchestration* concern — no new query types, no new server endpoints, no new payload shapes.
- New row models (e.g. "viewport-windowed paged"). Three modes remain; the change is in how they compose, not what they are.
- Tree-to-tree group-by changes (already supported via controlled `groupBy` inside tree mode; this RFC does not alter that path).
- `BcEditGrid` / `BcGrid` (client-side) — both already share state across re-renders without unmounting; they are unaffected.

## 3. Two architectural shapes

### Shape A — `<BcServerGrid>` wraps the hook trio internally

The component grows a controlled `groupBy` (and optionally `rowModel`) prop. Internally it always holds **all three** state hooks alive (or, more subtle, only the active one plus a parked snapshot of the others' carry-over state). When `groupBy` flips, the component:

1. Computes the next active mode from `groupBy.length` plus `props.rowModel`.
2. Aborts the previous mode's in-flight request.
3. Hydrates the next mode's controlled-state surrogate from the carry-over snapshot (filter, sort, search, columnState, page/pageSize, viewKey).
4. Fires the next mode's first query under the new view.

Consumers see one component, one `apiRef`, one set of callbacks. The controlled-state surface (`sort`, `filter`, `searchText`, `columnState`, `groupBy`, `page`, `pageSize`, `expansion`) is mode-agnostic: every prop applies to whichever mode is active, and the unaffected dimensions (e.g. `expansion` while `groupBy` is `[]`) are simply unused.

**Cost:** the component grows from ~1880 LOC to roughly ~2200. The three internal hooks need a shared "view" extraction (filter/sort/search/columnState/groupBy) so the carry-over snapshot is a structural concept rather than three separate state copies. The `BcServerGridApi` ref-shape stays as-is — `mode` is internal state, surfaced through `getServerRowModelState().mode`.

### Shape B — new `useServerGrid` polymorphic hook

A unified state machine. Consumers pass either `{ loadPage }`, `{ loadBlock }`, or `{ loadChildren }` (a discriminated union of the three loader shapes), plus a `mode` discriminator they can flip at any time. The hook returns `{ props, state, actions }` where `props` is spread-ready for a *single* `<BcGrid>` (not `<BcServerGrid>` — the hook owns the server orchestration directly, the inner component is the chrome). Closer to AG Grid SSRM's polymorphic shape: one server-side row model with a runtime-tunable strategy.

**Cost:** larger surface change. New public hook, new top-level component (or the existing `<BcServerGrid>` becomes the polymorphic shell). Migration story for the three turnkey hooks is "deprecate them in v0.6, reimplement on top of the new primitive". Higher chance the API is wrong on first cut and needs a v0.6 follow-up — the existing turnkey hooks landed in v0.5.0-alpha.1 (#363/#368/#371) on this exact pattern; flipping the layering on the same release line burns API trust.

### Recommendation: Shape A

Three reasons.

1. **bsncraft's actual usage pattern is "one grid, two modes."** The discriminated wrapper at `data-grid.tsx:536-553` is the consumer pain point. Shape A removes that wrapper without touching anything else in `data-grid.tsx`. Shape B requires bsncraft to migrate from `<BcServerGrid>` + `useServerPagedGrid` to a brand-new `useServerGrid` API — which contradicts the v0.5.0 thesis (`v0.5-audit-refactor-plan.md §"Why now"`: "Ergonomics changes are mostly additive (new hooks, new apiRef methods) and don't break existing consumers").
2. **The design.md §10 invariant ("All three modes share the underlying state machine; only the row-fetching strategy differs") is already what we want — but the React adapter doesn't realise it.** Shape A is the change that *makes the invariant visible at the React layer*. Shape B re-architects the layer rather than aligning it.
3. **Public API surface is sacred (`AGENTS.md §3.3`).** Shape A is additive: one new prop pair, one mode-agnostic controlled-state contract, one new field on `BcServerGridApi`. Shape B introduces a parallel hook that consumers will adopt and the existing hooks then become legacy — that's the kind of churn the v1.0 freeze should not absorb.

**Honest trade-off:** Shape A bakes the three-mode topology into `<BcServerGrid>` more deeply than today. If post-1.0 we ever want a fourth mode (e.g. "viewport-windowed infinite", an AG Grid SSRM viewport pattern), it slots into the same internal switch but the component grows further. Shape B would have absorbed that fourth mode more cleanly because consumers would write the loader shape, not pick a mode. The view here is: cross that bridge if/when a fourth mode ships, by which point we have the SSRM viewport patterns and the four-spike findings to design against.

## 4. State carry-over contract

Every dimension that survives the mode switch, with its host-controlled / grid-controlled status today and the carry-over rule. "Hydrated" means the new mode's first server query carries this dimension verbatim; "preserved" means the inner `<BcGrid>` keeps the dimension across re-render without re-firing the server query.

| # | Dimension | Source today | Carry-over rule |
|---|---|---|---|
| 1 | `sort` (`readonly BcGridSort[]`) | controlled or `useState` in each turnkey hook | **hydrated.** Same shape across all three modes; passed verbatim. |
| 2 | `filter` (`BcGridFilter | null`) | controlled or `useState` in each turnkey hook | **hydrated.** Filter shape is mode-agnostic. |
| 3 | `searchText` (`string`) | controlled or `useState` in each turnkey hook | **hydrated.** |
| 4 | `groupBy` (`readonly ColumnId[]`) | controlled prop (`BcGridStateProps.groupBy`); the **driver** of the switch | **hydrated.** Becomes the discriminator. `[]` ⇒ paged/infinite; non-empty ⇒ tree (default rule, overridable by explicit `rowModel`). |
| 5 | `columnState` (visibility, order, widths, pinning) | controlled or `useState` | **preserved.** `<BcGrid>`'s persistence layer (`bc-grid:<gridId>:columnState`) keeps writing through. The new mode's first query receives `view.visibleColumns` derived from this. |
| 6 | `pagination` (`page`, `pageSize`) | paged-only today | **mode-conditional.** `pageSize` carries across all modes (tree's `childCount` / infinite's `blockSize` are *separate* props). `page` resets to 0 when entering a non-paged mode (tree has no concept of page); when re-entering paged mode, `page` is also reset to 0 because the underlying view changed (matches `serverGrid.tsx:929` `resetUncontrolledPage` invariants). |
| 7 | `expansion` (`ReadonlySet<RowId>`) | tree-only today | **dropped by design.** When leaving tree mode, the expansion set becomes meaningless (no tree). When re-entering tree mode, expansion starts empty unless the consumer controls it. Document: "expansion does not survive a paged → tree switch; consumers who want it must control the prop and re-supply it." |
| 8 | `selection` (`BcSelection`) — row-id-keyed | grid-internal (apiRef-only; no controlled prop today) | **preserved with caveat.** The selection set carries verbatim across the switch *because rows are addressed by `RowId` and `rowId` does not change*. The visible reflection of selection (which row currently has the active "selected" affordance) only paints if the new mode loads the row. For rows not yet in the new mode's working set, selection persists in state but renders as "selected, off-screen." |
| 9 | `rangeSelection` | grid-internal (apiRef-only) | **dropped by design.** Range is anchored to row-index *positions*, not row-ids; positions are mode-specific. Document: "range selection is dropped on mode switch; restore via `apiRef.current.setRangeSelection(…)` from a host listener if needed." |
| 10 | `focusedRowId` / `activeCell` (`{ rowId, columnId }`) | grid-internal (apiRef getter `getActiveCell`; setter via `focusCell` / `startEdit`) | **preserved.** The active cell is row-id keyed; the new mode resolves it to a position via `getRowById` once the row loads. If the row is not in the new mode's first window, active cell falls back to `{ rowId, columnId }` with `getActiveCell()` returning the rowId but the visible focus ring not yet painted (consistent with how scroll-to-cell behaves in paged mode at `serverGrid.tsx:524-555`). |
| 11 | scroll position | grid-internal (virtualizer) | **conditional.** Same scroll offset carries; once the new mode's first response lands, the virtualizer re-measures and may clamp. Recommend pairing with focusedRowId — scroll-to-active-cell is a saner default than literal pixel offset. |
| 12 | `viewKey` generation | per-hook `modelRef.current.createViewKey(view)` | **regenerated per mode.** The new mode computes its own viewKey from the carried `view`. The previous mode's viewKey is dropped (not relevant under the new server contract). |
| 13 | mutation queue (pending optimistic edits) | per-`createServerRowModel` instance | **dropped on switch.** Pending mutations belong to the previous block-cache; carrying them is wrong (they were queued against the previous query). Document: "in-flight optimistic edits are settled or aborted before the switch proceeds." Implementation: the switch awaits `pendingMutations.size === 0` for ≤ 100ms; if non-empty after that, it settles them as `{ status: "rejected", reason: "mode switch" }`. |
| 14 | block cache | per-`createServerRowModel` instance | **dropped on switch.** Block keys include mode in their stringification (`server-row-model/src/index.ts:34-53`), so a paged block key cannot be reused as a tree block key. Aborting in-flight requests + dropping the cache is sound; the new mode rebuilds its cache from scratch. The carried `view` ensures the first new-mode request is the correct one. |

Items 5, 8, 10 are the carry-over wins consumers actually feel. Items 7, 9, 13 are explicit drops — calling them out on the switch contract prevents bug reports later.

## 5. Server contract on the switch

The maintainer's stated worry is right: the switch is the spot most likely to break perf. Recommendation is conservative.

**Paged → tree (`groupBy: []` → `['customerType']`):**

1. **Synchronously** abort the in-flight paged request via `modelRef.current.abortAll()` on the paged hook.
2. **Synchronously** drop the paged result (`setResult(undefined)`), drop the paged cache, render the inner `<BcGrid>` with `loading={true}` and `data={[]}` for one frame.
3. **Asynchronously** fire the tree mode's `loadChildren({ parentRowId: null, … })` with the carried view. Use the existing tree-mode `rootLoading` gate so the chrome paints "Loading X rows" if `initialRootChildCount` is supplied.
4. On settle, paint the tree.

Reject the alternative ("fetch tree in parallel and reconcile with the paged result"): the paged result is a flat list of customer rows; the tree result is grouped roots. Reconciling them client-side would require synthesising a single root group from paged rows, which is a separate feature ("client-side group materialisation from a paged page") and not in scope. It's also wrong for the dataset size — a 36k-row server grid will never have all 36k rows on the client to group from; the current paged window is at most one page.

**Tree → paged (`groupBy: ['customerType']` → `[]`):**

Mirror image. Abort in-flight tree fetches (`abortAll`), drop the tree snapshot, paint loading, fire the paged `loadPage({ pageIndex: 0, view, … })` with the carried view, paint on settle. `page` resets to 0 (the carried view changed; the existing `resetUncontrolledPage` rule already does this for sort/filter/group changes within paged mode).

**Paged → infinite (stretch):**

Abort, drop block cache, paint loading, fire the infinite mode's `loadBlock({ blockStart: 0, blockSize, view, … })`. `blockSize` is its own prop; `pageSize` does not carry into it.

**Latency budget:**

- Synchronous part (abort + state hydration + render the loading frame): **< 16 ms** (one frame).
- Asynchronous part (server response): bounded by the consumer's loader latency, not by us. We don't ask for a budget on the round-trip.
- Total observable "ghost frame" with no rows: **one frame**. Consumers that want a smoother handoff supply `loadingOverlay` (already a `BcGridProps` field).

**No flash mitigation by data synthesis.** Earlier drafts considered "synthesise a one-group root from the paged window so the user sees a half-loaded tree instantly." Rejected: the paged window is not the full dataset and the synthesised tree would be wrong as soon as the user expands a group. Better to render a clean loading state for one frame than a wrong tree for the duration of the round-trip. If the maintainer disagrees, this becomes open question §10.Q3.

## 6. Public API delta

Diff against `docs/api.md §5.3`.

### `BcServerGridProps` — converge the discriminated union

Today, `BcServerGridProps` is `BcServerPagedProps | BcServerInfiniteProps | BcServerTreeProps` and `rowModel` is a *required* literal on each. Proposed:

```ts
export interface BcServerGridProps<TRow>
  extends Omit<BcGridProps<TRow>, "apiRef" | "data">,
          BcServerEditMutationProps<TRow> {
  /**
   * Active row-fetching strategy. Optional; when omitted, the grid
   * derives the mode from the controlled `groupBy` prop:
   *   - groupBy.length === 0  → "paged"
   *   - groupBy.length > 0    → "tree"
   * Pass an explicit `rowModel` to override the heuristic (e.g. force
   * "infinite" while keeping groupBy empty, or force "paged" with a
   * server-grouped query that the server flattens for you).
   */
  rowModel?: ServerRowModelMode

  /** Required when the active mode is "paged" or when rowModel is omitted and groupBy is []. */
  loadPage?: LoadServerPage<TRow>
  pageSize?: number
  initialResult?: ServerPagedResult<TRow>

  /** Required when the active mode is "infinite". */
  loadBlock?: LoadServerBlock<TRow>
  blockSize?: number
  maxCachedBlocks?: number
  blockLoadDebounceMs?: number
  maxConcurrentRequests?: number
  prefetchAhead?: number

  /** Required when the active mode is "tree" or when rowModel is omitted and groupBy is non-empty. */
  loadChildren?: LoadServerTreeChildren<TRow>
  loadRoots?: LoadServerTreeChildren<TRow>
  childCount?: number
  initialRootChildCount?: number

  /** Mode-conditional cache cap. */
  maxCachedBlocks?: number  // shared between infinite and tree

  apiRef?: RefObject<BcServerGridApi<TRow> | null>
}
```

Three loader fields, all optional at the type level; the runtime contract is "the loader matching the active mode is required." A dev-only assertion in `<BcServerGrid>` mount fires a `console.error` when the mode is `tree` but `loadChildren` is missing (matches the existing `console.error` pattern from #65464d0 noted in the alpha.2 prerequisites).

The three legacy interfaces (`BcServerPagedProps`, `BcServerInfiniteProps`, `BcServerTreeProps`) remain exported as **type aliases** — `type BcServerPagedProps<TRow> = BcServerGridProps<TRow> & { rowModel: "paged"; loadPage: LoadServerPage<TRow> }` — so existing consumers' explicit type annotations keep type-checking. The discriminated union as the **value** of `BcServerGridProps` collapses to the broader interface above.

### `BcServerGridApi` — one new method

```ts
export interface BcServerGridApi<TRow = unknown> extends BcGridApi<TRow> {
  // ...existing fields
  /**
   * Returns the currently active row-fetching strategy. Reflects the
   * resolved mode (rowModel prop || groupBy heuristic). Consumers that
   * route imperative calls per mode should branch on this.
   */
  getActiveRowModelMode(): ServerRowModelMode
}
```

`getServerRowModelState().mode` already returns this; `getActiveRowModelMode()` is a one-line shortcut for callers that don't want the full state snapshot.

### Turnkey hooks — keep them, mark as escape hatches (see §7)

No signature changes to `useServerPagedGrid` / `useServerInfiniteGrid` / `useServerTreeGrid`. They remain the simple-case path for grids that don't switch modes.

A new turnkey hook lands alongside:

```ts
export function useServerGrid<TRow>(
  opts: UseServerGridOptions<TRow>,
): UseServerGridResult<TRow>
```

Where `UseServerGridOptions<TRow>` accepts `loadPage?` / `loadBlock?` / `loadChildren?` (consumer supplies the loaders for the modes they want to support), plus the same `gridId` / `rowId` / `initial` shape from the existing turnkey hooks. The hook owns one debounce, one mutation-id stream, one `apiRef`, and a `groupBy` controlled-state pair; on `groupBy` change it routes to the matching loader.

### `BcUserSettings` interaction (`vanilla-and-context-menu-rfc §5`)

The mode toggle is a user-settings dimension. `BcUserSettings.layout.groupBy` already exists (`BcGridLayoutState.groupBy: readonly ColumnId[]`). The carry-over contract here piggybacks on the existing persistence — `useBcGridState({ persistTo: "local:gridId" })` already round-trips `groupBy` through `localStorage` (`api.md:851`). No new persistence keys.

Open question (10.Q5): should `BcUserSettings.preferredRowModel` ride along so consumers can pin "always use infinite even when groupBy is empty"? Defer.

## 7. Migration path

**Recommendation: option (a) — keep the three turnkey hooks as escape-hatches, mark `useServerGrid` (the new polymorphic hook) as the recommended path. Do not deprecate.**

Reasons:

- The three turnkey hooks landed in v0.5.0-alpha.1 (PRs #363, #368, #371). Deprecating them in v0.5.0 alpha.2 — same release line — burns API trust hard. AGENTS.md §3.3 reads "Public API is sacred"; flipping recommended-path on a alpha.x bump is the kind of churn that rule exists to prevent.
- Each turnkey hook is genuinely simpler than `useServerGrid` for the single-mode case. A grid that's *always* tree (e.g. a BOM viewer) doesn't need the mode-switch machinery; `useServerTreeGrid` stays the right tool.
- Reimplementing the three hooks on top of `useServerGrid` (option c) is structurally cleaner but doubles the implementation surface for one PR. Worker1's task is the structural switch, not a hook-layer refactor. Defer to v0.6 if it ever earns its way in.

Documentation pivot in `api.md` and `apps/examples/`: the mode-switching examples (sales-estimating, customers) are written with `useServerGrid`; the single-mode hero spikes (production-estimating tree, etc.) keep their existing `useServerTreeGrid` style.

## 8. Performance budget

The switch itself is one synchronous frame plus the new mode's first server response.

**Synchronous-frame budget: ≤ one 16ms frame** for the abort + state hydration + render-with-loading transition. Measured against a 36k-row paged grid switching to tree mode — same scale as bsncraft's actual customers grid.

**Async budget: not bounded by us.** First-paint of the new mode is bounded by the consumer's loader. We do *not* chase a "tree shows in < N ms" budget — that's a server-side concern.

**Benchmark addition:** new case in `apps/benchmarks/tests/perf.perf.pw.ts`, modeled on the existing sort/filter cases. Scenario: server-paged grid mounted, view stable for 200ms (warm-up), `groupBy` controlled-prop flips to `['customerType']`, measure end-to-end (`groupBy` change → next paint with rendered tree skeleton + loading overlay). Expected number on the perf-spike rig: < 30ms. Bar set at **< 50ms** to leave headroom.

A separate Playwright spec covers the full happy-path including the async server settle (§9). The perf bench measures only the synchronous flip frame.

## 9. Test plan

**Unit tests** (worker1 writes; coordinator runs at merge):

One test per dimension in §4 — 14 cases covering both directions (paged→tree and tree→paged) where a direction matters. Specifically:

- `sort` carries verbatim across paged↔tree.
- `filter` carries verbatim.
- `searchText` carries verbatim.
- `groupBy` becomes the driver; flipping `[]→['x']` resolves mode to `tree` (heuristic), `['x']→[]` resolves to `paged`. Explicit `rowModel` overrides the heuristic.
- `columnState` carries verbatim and the new mode's first query receives the correct `view.visibleColumns`.
- `pageSize` carries; `page` resets to 0.
- `expansion` does **not** carry tree→paged→tree; the second tree mount starts empty unless controlled.
- `selection` (rowId-keyed) carries verbatim.
- `rangeSelection` is dropped.
- `focusedRowId` carries verbatim; `getActiveCell()` returns the rowId after the switch.
- Pending mutations: a queued mutation at switch time is settled `{ status: "rejected", reason: "mode switch" }` after the 100ms grace.
- Block cache is dropped (the previous mode's block keys no longer resolve).
- The previous mode's in-flight controller is `aborted === true` after the switch.
- `getActiveRowModelMode()` returns the resolved mode synchronously.

**Playwright** (worker1 writes one happy-path; coordinator runs):

`apps/examples/src/customers-server-grid.example.tsx` (a new spike grid in the v0.5 hero-spike spirit, or extended from an existing example). One spec at `tests/server-mode-switch.pw.ts`:

1. Mount the grid in paged mode with a non-trivial `filter` and `sort`.
2. Scroll to row 200, focus a cell at (rowId=200, columnId='balance').
3. Flip `groupBy` to `['customerType']` via the host's UI.
4. Assert: filter chip still visible; sort indicator still on the same column; loading state painted ≤ one frame after the click; tree mode renders root groups within the loader's resolved time; the focused cell's rowId still reads correct via `apiRef.current.getActiveCell()`.
5. Flip `groupBy` back to `[]`. Assert paged mode returns and `page === 0`.

**Perf** (coordinator runs at merge):

The bench case from §8.

## 10. Open questions for maintainer ratification

1. **Sync or async API for the switch?** Today's hooks are fully sync — the host sets `groupBy` via React state and the new query fires on the next render. The proposed contract preserves that. AG Grid SSRM exposes a Promise from `setRowGroupColumns`. *Recommendation: stay sync. Consumers that want a "switching…" spinner already have `state.loading` from the carried hook. Confirm.*
2. **Should the heuristic `groupBy.length > 0 ⇒ tree` be hard-coded, or a `resolveMode` callback?** A consumer with a server-grouped paged query (`groupBy: ['region']` + `loadPage` returns flat rows in group order) wants `groupBy.length > 0 ⇒ paged`. Today's flat-server-grouping workflow exists in `api.md §"Client vs server / current-page grouping"`. *Recommendation: hard-coded heuristic with explicit `rowModel` prop as the override; no `resolveMode` callback in v0.5. Consumers who need the override pass `rowModel="paged"` explicitly. Confirm.*
3. **Synthesise a single-root tree from paged data on the switch to avoid the loading frame?** *Recommendation: no, per §5. Ratify or override.*
4. **Pending mutations on switch — settle as rejected, or carry to the new cache?** *Recommendation: settle as `{ status: "rejected", reason: "mode switch" }` after a 100 ms grace. Carrying them is wrong (they were queued against the previous viewKey). Confirm.*
5. **`BcUserSettings.preferredRowModel`** — pin a mode override across sessions? *Recommendation: defer to v0.6. No new persistence key in v0.5. Confirm.*
6. **`useServerGrid` (the new polymorphic hook) lands in v0.5.0-alpha.2 or v0.5.0 GA?** Alpha.2 is tighter scope; GA is more polish room. *Recommendation: structural change in alpha.2 (component-level), polymorphic hook in alpha.3 / GA. The three legacy hooks remain canonical until then. Confirm.*
7. **Component naming.** `<BcServerGrid>` stays as the polymorphic shell? Or do we rename to `<BcServerDataGrid>` and `<BcServerGrid>` becomes a thin alias? *Recommendation: keep `<BcServerGrid>`. Renaming during alpha.2 burns the v0.5 freeze. Confirm.*
8. **Selection scope.** §4 item 8 carries selection by rowId. Does the maintainer want a "selection clears on mode switch" opt-in for security-sensitive grids (e.g. an audit-log grid where carrying a selection across a re-grouped view is wrong)? *Recommendation: no opt-in; consumers who want it call `apiRef.current.clearRangeSelection()` from a `groupBy` listener. Adding a prop here is API surface for a niche. Confirm.*

## 11. Estimated scope

Single PR by worker1, three artefacts.

- **Code:** ~10–14 hours.
  - `serverGrid.tsx` reshape (~6 hours): the three internal hooks each surface a "carry-over snapshot" + "hydrate from snapshot" pair; the top-level component owns mode resolution and the abort-on-switch flow. Net add: ~250–350 LOC. Net change to existing code: ~150 LOC churn (callback fan-out at `:653-672` becomes a single mode-aware dispatcher).
  - New `useServerGrid` polymorphic hook (~3 hours, if landing in same PR — defer to alpha.3 if scope tight). ~250 LOC.
  - `types.ts` reshape (~1 hour): `BcServerGridProps` collapse to single interface; legacy aliases.
  - `BcServerGridApi.getActiveRowModelMode()` plumbing (~30 min).
  - Dev-only loader-missing assertions (~30 min).
- **Tests:** ~6–8 hours.
  - 14 unit cases (§9). ~400 LOC test code.
  - 1 Playwright spec. ~80 LOC.
  - 1 perf bench case. ~60 LOC harness.
- **Docs:** ~2–3 hours.
  - `api.md §5.3` rewrite for the converged `BcServerGridProps` and the new heuristic.
  - Migration note in the v0.5.0-alpha.2 section of `release-milestone-roadmap.md`.
  - One example update (or new example) demonstrating the switch.

**Total: ~18–25 hours** for one worker. This is a structural change; the estimate is honest.

The PR should split if it grows past 1500 LOC of net diff: structural change first (alpha.2), polymorphic hook second (alpha.3). The split point is clean — the structural change is `<BcServerGrid>`'s internal reshape; the polymorphic hook composes on top.

---

**This RFC is ready for ratification. Open questions in §10 are the conscious "ask the maintainer" surface; everything else is recommended with conviction.**
