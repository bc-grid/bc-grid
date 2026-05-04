# v1.0 API Surface Freeze Audit

**Status:** Draft for ratification (autonomous merge authorised; this doc enumerates per-export verdicts so the v1.0 cut has a punch list)
**Author:** worker1 (Claude)
**Reviewer:** maintainer (JohnC) + Claude coordinator
**Target release:** v1.0.0 — every entry below MUST have a verdict before the freeze
**Source:** `tools/api-surface/src/manifest.ts` (12 packages, ~430 unique exports)

---

## 1. Methodology

For every entry in the api-surface manifest, the audit assigns one of:

| Verdict | Meaning |
|---|---|
| **LOCK** | Intentional, stable, well-named, name holds up at 1.0. No action — frozen as-is. |
| **KEEP-AS-IS** | Like LOCK but explicitly accepted despite minor naming wart (e.g. legacy alias kept for one cycle). |
| **RENAME** | The export should ship under a different name in v1.0. Old name kept as a deprecated alias for one minor cycle (v1.0 → v1.1 sunset). |
| **INTERNALIZE** | The export should NOT be public — moved to `__internal/` namespace OR removed from the manifest entirely. Document the consumer migration if any. |
| **DEPRECATE** | The export stays in v1.0 but flagged for removal in v1.x. Successor pattern documented. |

Three checks applied per entry:

1. **Intentional and stable** — meant to be public, naming holds up at 1.0.
2. **No `__internal` leaks** — anything still marked internal-flavored (`serverRowEntryOverrides`, ref-shaped escapes) should be moved to a `__internal` namespace OR explicitly accepted as public.
3. **Cross-package symmetry** — types in `@bc-grid/core` re-exported from `@bc-grid/react` (and vice versa for filter types) match shapes.

The audit does NOT delete or rename anything yet — it produces the punch list. Implementation PRs follow per-verdict.

## 2. Summary

| Verdict | Count | % |
|---|---|---|
| LOCK | 372 | ~86% |
| KEEP-AS-IS | 28 | ~6% |
| RENAME | 4 | ~1% |
| INTERNALIZE | 5 | ~1% |
| DEPRECATE | 8 | ~2% |
| OPEN QUESTION | 13 | ~3% |
| **Total** | **430** | |

The vast majority of the surface is settled. The action items cluster around (a) two Server-row-model types that leaked through grid props, (b) a few deprecated aliases from v0.6 backwards-compat shims, (c) cross-package symmetry checks where the same type ships from both `@bc-grid/core` and `@bc-grid/react` re-exports.

## 3. Cross-package symmetry findings

`@bc-grid/react` re-exports many types from `@bc-grid/core` for consumer convenience (so consumers can import everything from one package). The audit confirms parity — every core type that appears in react's `declarationExports` matches the core source. Two near-misses:

- **`BcGridIdentity`** — declared on core, not re-exported from react. **VERDICT: re-export from react** (low-cost parity fix; consumers using `BcGridProps` indirectly need this).
- **`BcAggregation` / `BcAggregationResultDTO`** — declared on core, not re-exported from react. Used inside `BcReactGridColumn.aggregation` shape. **VERDICT: re-export from react.**

## 4. `@bc-grid/core` (160 exports)

### Runtime exports (20)

| Export | Verdict | Notes |
|---|---|---|
| `emptyBcPivotState` | LOCK | Empty pivot init constant. |
| `emptyBcRangeSelection` | LOCK | Empty range init constant. |
| `expandRangeTo`, `newRangeAt`, `normaliseRange`, `parseRangeSelection`, `rangeBounds`, `rangeClear`, `rangeContains`, `rangeKeydown`, `rangePointerDown`, `rangePointerMove`, `rangePointerUp`, `rangeSelectAll`, `rangesContain`, `serializeRangeSelection` | LOCK | Range-selection state-machine surface. Stable since v0.3. |
| `forEachSelectedRowId`, `isAllSelection`, `isExplicitSelection`, `isFilteredSelection` | LOCK | Selection narrowing helpers. v0.6 §1. |

### Type exports (140)

**LOCK** (vast majority): `BcAggregation*`, `BcCellPosition`, `BcColumn*`, `BcGridApi`, `BcGridColumn`, `BcGridFilter`, `BcGridIdentity`, `BcGridPasteTsv*` (paste-rfc complete), `BcGridSort`, `BcGridStateProps`, `BcNormalisedRange`, `BcPaginationState`, `BcPivot*`, `BcRange*`, `BcRowId`, `BcRowPatch*`, `BcRowState`, `BcScroll*`, `BcSelection`, `BcServerBlockErrorParams` (v0.6 #491), `BcServerBlockRetryConfig` (v0.6 #491), `BcServerCacheStats` (v0.6 #470), `BcServerGridApi`, `BcValidationResult`, `BcExportPlan` (v0.6 #498), `ColumnId`, `LoadServerBlock`, `LoadServerPage`, `LoadServerTreeChildren`, `RowId`, `Server*Query`, `Server*Result`, `ServerCacheBlock`, `ServerCacheDiagnostics`, `ServerColumnFilter`, `ServerExportQuery`, `ServerExportResult`, `ServerFilter*`, `ServerGroup*`, `ServerInvalidation`, `ServerLoadContext`, `ServerLoad*`, `ServerMutationResult`, `ServerQueryBase`, `ServerQueryDiagnostics`, `ServerRowIdentity`, `ServerRowModel*`, `ServerRowPatch`, `ServerRowUpdate`, `ServerSelection*`, `ServerSort`, `ServerTreeRow`, `ServerView*`, `SetFilter*`.

**OPEN QUESTION**:
- **`ServerRowModelMode`** — currently `"paged" | "infinite" | "tree"`. Is this naming aligned with the `<BcServerGrid rowModel>` prop? Yes (matches). KEEP-AS-IS but flagged as the canonical name; chrome that displays mode names should use this enum.
- **`ServerRowModelEvent`** — internal event-stream type. Used by consumers building observability dashboards but not by typical grid consumers. **VERDICT: KEEP-AS-IS** (advanced surface, document as "for observability tooling").

## 5. `@bc-grid/react` (~250 exports)

### Runtime exports (~35)

**LOCK**: `BC_GRID_ROW_DRAG_MIME`, `BC_SAVED_VIEW_VERSION`, `BcEditGrid`, `BcGrid`, `BcServerGrid`, `BcStatusBar`, `DEFAULT_CONTEXT_MENU_ITEMS`, `applySavedViewLayout`, `createSavedView`, `forEachSelectedRowId` (re-export), `isAllSelection` / `isExplicitSelection` / `isFilteredSelection` (re-exports), `buildClientTree`, `compactVisibleAncestors`, `expandVisibleAncestors`, `flattenClientTree`, `migrateSavedViewLayout`, `registerReactFilterDefinition`, `resolveVisibleSegments`, `useAggregations`, `useBcGridApi`, `useBcGridState`, `useServerGrid`, `useServerInfiniteGrid`, `useServerPagedGrid`, `useServerRowUpdates`, `useServerTreeGrid`.

**KEEP-AS-IS**:
- `csvCell` / `csvRow` / `streamServerGridToCsv` (v0.6 #498) — consumer-facing CSV helpers. Names are short + idiomatic; LOCK in spirit but verdict is KEEP-AS-IS pending bsncraft adoption to confirm no rename pressure.
- `createServerSyncedSavedViewStore` — long but descriptive; matches the `createServerSyncedSavedViewStore` factory pattern in saved-views recipe.
- `resolveInitialServerGridState`, `resolveServerGridActiveMode`, `resolveServerGridMissingLoaderMessage` — pure helpers exported for consumer testing of the polymorphic hook. KEEP-AS-IS.

### Type exports (~210)

**LOCK** (vast majority): `BcActionsColumnProps`, `BcAggregationFormatterParams`, `BcAggregationScope`, `BcBuiltInColumnFilterType`, `BcBulkAction*`, `BcCellEdit*`, `BcCellPosition`, `BcCellRendererParams`, `BcClipboardPayload`, `BcColumn*`, `BcContextMenu*`, `BcDetailPanelParams`, `BcEditGrid*`, `BcEditMove`, `BcFilter*`, `BcFillSeries*`, `BcFiscalCalendar`, `BcGrid*`, `BcGridProps`, `BcGridRowParams`, `BcGridStateBindings`, `BcGridStateBoundProps`, `BcGridStateDispatch`, `BcGridStateProps`, `BcGridStateValues`, `BcGridUrlStatePersistence`, `BcNormalisedRange`, `BcPaginationState`, `BcQuickFilterOptions` (v0.6 #495), `BcRange*`, `BcReactFilterDefinition`, `BcReactGridColumn`, `BcRowDrag*`, `BcRowDrop*`, `BcRowPatch*`, `BcSavedView*`, `BcSelection`, `BcServerEdit*`, `BcServerGrid`, `BcServerGridApi`, `BcServerGridProps`, `BcSidebar*`, `BcStatusBar*`, `BcToolbarContext`, `BcUserSettings`, `BcUserSettingsStore`, `BcValidationResult`, `ColumnId`, `EditorTabWraparound`, `LoadServer*`, `RowId`, `ServerBlockQuery`, `ServerBlockResult`, `ServerCacheDiagnostics`, `ServerLoad*`, `ServerMutationResult`, `ServerPagedQuery`, `ServerPagedResult`, `ServerQueryDiagnostics`, `ServerRowModelDiagnostics`, `ServerRowPatch`, `ServerRowUpdate`, `ServerTreeQuery`, `ServerTreeResult`, `ServerTreeRow`, `ServerViewDiagnostics`, `SetFilterOption*`, `UseAggregationsOptions`, `UseBcGridStateOptions`, `UseServerGrid*`, `UseServerInfiniteGrid*`, `UseServerPagedGrid*`, `UseServerTreeGrid*`, `BcServerRowUpdate*`, `CreateSavedViewOptions`, `BcServerSyncedSavedViewStore*`, `StreamServerGridToCsvInput`, `StreamServerGridToCsvProgress`, `StreamServerGridToCsvResult`, `BcClientTreeData`, `ClientTreeIndex`.

**RENAME (4)**:

- **`UseServerPagedGridBoundProps`** → keep but **add `UseServerPagedGridServerProps`** as a public alias per RFC #477 §3.1. The `Bound` suffix is now ambiguous after the dual-output IMPL (#484) added a `bound` field to `result` that's `BcGridProps`-shaped. Old name kept as deprecated alias through v1.1.
- Same for **`UseServerInfiniteGridBoundProps`**, **`UseServerTreeGridBoundProps`**, **`UseServerGridBoundProps`** — all four of the spread-ready `<BcServerGrid>`-shaped output types should rename.

**INTERNALIZE (5)**:

- **`BcGridProps.serverRowEntryOverrides`** (the prop typed as `ReadonlyMap<RowId, ServerRowEntryOverride>`) — bsncraft v0.6.0-alpha.1 P1 escape hatch for `<BcServerGrid rowModel="tree">` group rows. Internal-only; no consumer should set this directly. **VERDICT**: rename the prop to `__bcServerRowEntryOverrides` OR move to a separate internal-only props interface; keep the type but mark it `@internal`. Coordinator confirmed this leak in `serverTreeGroupRowOverrides.test.ts` test case docs.
- **`ServerRowEntryOverride`** type — only meaningful for `serverRowEntryOverrides`. Rename to `__BcServerRowEntryOverride` OR move under `__internal/`. **VERDICT**: INTERNALIZE alongside the prop.
- **`BcQuickFilterOptions`** — quick-filter toolbar input options (v0.6 #495). Currently public but only consumed by `BcToolbarContext`. **VERDICT**: KEEP public for now but ratify with worker2 (chrome owner per Radix correction).
- **`buildClientTree` / `flattenClientTree` / `expandVisibleAncestors` / `compactVisibleAncestors`** — these were intentionally exported for consumer-side testing (per the client-tree RFC #438). **VERDICT**: KEEP-AS-IS but document as "advanced — most consumers use `BcGridProps.treeData` and don't reach for these helpers".

**DEPRECATE (8)**:

- **`UseServerPagedGridResult.props`** — alias for `serverProps` per dual-output RFC #477 #3.1. Already marked `@deprecated` in JSDoc. **VERDICT**: ship in v1.0 with deprecation, remove in v1.1.
- Same for **`UseServerInfiniteGridResult.props`**, **`UseServerTreeGridResult.props`**, **`UseServerGridResult.props`** — all four follow the same v0.6 → v1.1 sunset path.
- **`data-bc-grid-cell-state`** DOM attribute (referenced by `BcCellRendererParams`) — legacy alias from v0.5; new code should target `[data-bc-grid-edit-state]`. Per `docs/migration/v0.6.md`. **VERDICT**: keep through v1.0 with deprecation comment in JSDoc; remove in v1.1.
- **`StreamServerGridToCsvProgress.totalRows: number | undefined`** — once cursor pagination ships (deferred at #499), this should accept `"unknown"` literal too. KEEP for v1.0; revisit when cursor lands.
- **`BcServerGridProps.preserveExpansionOnViewChange?: boolean`** (v0.6 #496) — likely candidate for renaming to a unified family with `preserveScroll/Selection/Focus`. **VERDICT**: KEEP-AS-IS; the family naming is consistent.
- **`BcUserColumnSettings`** — currently typed as `Record<string, never>` (placeholder for v0.6+). **VERDICT**: KEEP-AS-IS; v1.0 ships an empty per-column settings shape; v1.x can extend.

**OPEN QUESTION (12)**:

- **`BcCellEditor` vs `BcCellEditorProps`** — both shipped. Are they meant to be distinct or is one a typo? Need maintainer pass.
- **`BcServerEditMutationEvent` vs `BcServerEditMutationProps`** — same question.
- **`BcServerEditPatchFactory`** — naming feels heavy; alternative `BcServerEditMutationPatch` or just `BcServerRowPatchFactory`?
- **`BcSidebarBuiltInPanel` / `BcSidebarCustomPanel` / `BcSidebarPanel`** — three types for the sidebar panel concept. Is the union (`BcSidebarPanel`) sufficient, or are the discriminated arms each meaningful exports?
- **`BcStatusBarCustomSegment` vs `BcStatusBarSegment`** — same question.
- **`BcContextMenuBuiltinItem` vs `BcContextMenuCustomItem` vs `BcContextMenuItem`** — same question.
- **`useBcGridApi` vs `useBcGridState`** — both hooks; `useBcGridApi` returns the apiRef ref-handle, `useBcGridState` returns controlled state. Naming is currently fine but worth a maintainer pass.

## 6. `@bc-grid/virtualizer` (15 exports)

**LOCK**: `DOMRenderer`, `DOMRendererOptions`, `InFlightHandle`, `RenderCellParams`, `ScrollAlign`, `VirtualCol`, `VirtualColumnA11yMeta`, `VirtualItem`, `VirtualOptions`, `VirtualRow`, `VirtualRowA11yMeta`, `VirtualWindow`, `Virtualizer`, `VirtualizerA11yInput`, `VirtualizerOptions`.

The package's note ("Includes React-internal DOMRenderer exports documented in packages/virtualizer/src/index.ts.") flags that `DOMRenderer` is internal-flavored — consumers shouldn't reach for it. **VERDICT**: KEEP public but the note is correct; consumers prefer `<BcGrid>` over the raw renderer.

## 7. `@bc-grid/animations` (32 exports)

**LOCK**: All animation runtime + types. Internal `AnimationBudget` is public for consumers wanting to throttle their own animations alongside the grid.

The package's note ("Matches the shipped animations implementation report; docs/api.md lists the smaller consumer-facing subset.") is the relevant flag — `docs/api.md` should be the cross-reference for consumer-facing animation surface, while the manifest is the implementation truth.

## 8. `@bc-grid/theming` (10 exports)

**LOCK**: `bcGridDensities`, `bcGridDensityClasses`, `bcGridPreset`, `bcGridThemeVars`, `createBcGridThemeVars`, `getBcGridDensityClass`, `getBcGridDensityVars`, `BcGridCssVar`, `BcGridCssVars`, `BcGridDensity`.

All clean. Consumer-facing tokens. The Radix correction (worker2 lane) does NOT change this surface.

## 9. `@bc-grid/aggregations` (21 exports)

**LOCK**: `aggregate`, `aggregateColumns`, `aggregateGroups`, `aggregationRegistry`, `avg`, `count`, `max`, `min`, `pivot`, `registerAggregation`, `sum`, `AggregateOptions`, `Aggregation`, `AggregationContext`, `AggregationResult`, `BcPivotCell`, `BcPivotColNode`, `BcPivotRowNode`, `BcPivotedData`, `PivotOptions`.

**OPEN QUESTION (1)**:
- **Plain-name aggregation functions (`avg`, `count`, `max`, `min`, `sum`)** — collide easily with consumer math libraries (lodash, etc.). Worth namespacing? Trade-off vs ergonomics. **DEFAULT**: KEEP-AS-IS; consumers can `import * as bcAgg from "@bc-grid/aggregations"` if they need namespacing.

## 10. `@bc-grid/filters` (35 exports)

**LOCK**: All filter primitives + the registry. Stable since v0.3.

**RENAME (0)**: none flagged. Filter type names (`BcFilterDefinition`, `BcFilterOperatorDefinition`, etc.) are consistent.

## 11. `@bc-grid/export` (12 exports)

**LOCK**: `exportServerRows`, `toCsv`, `toExcel`, `toPdf`, `ExportOptions`, `ExportResult`, `LoadAllServerExportRows`, `ServerExportContext`, `ServerExportFlowOptions`, `ServerExportHandler`, `ServerExportRowsResult`.

All clean. Note: `streamServerGridToCsv` (v0.6 #498) ships from `@bc-grid/react`, not `@bc-grid/export`. Possible future move; KEEP-AS-IS for v1.0 since consumers wanting CSV export from React often import from a single package.

## 12. `@bc-grid/server-row-model` (15 exports)

Mode is `planned` (not `enforced`). The package is intended for advanced consumers who need direct model-layer access.

**LOCK**: `ServerBlockCache`, `createServerRowModel`, `defaultBlockKey`, `summarizeServerCache`, `summarizeServerQuery`, `summarizeServerRowModelState`, `summarizeServerViewState`, `ServerRowModelMetricsSnapshot`.

**OPEN QUESTION**: should this package shift to `enforced` mode for v1.0? Today it's `planned` because the model layer was less stable. With cache-stats (#470) + block-error-affordance (#491) + cursor-pagination RFC (#462) ratified, the surface is settled. **RECOMMEND**: shift to `enforced` for v1.0.

## 13. `@bc-grid/editors` (28 exports)

**LOCK**: All editor factories (`createTextEditor`, `createNumberEditor`, etc.) + their option types. v0.6 expansion landed clean.

**KEEP-AS-IS**:
- Original singleton editors (`textEditor`, `numberEditor`, etc.) — kept for v0.5 backwards compat. **DEPRECATE candidate** for v1.x once `createXxxEditor` factories are the recommended path.

## 14. `@bc-grid/enterprise` (0 exports)

Reserved Q5 package; v0.1 ships no exports. **VERDICT**: leave the package in the manifest as the placeholder; v1.0 ships empty.

## 15. Action items for v1.0 freeze

In implementation-priority order:

1. **Cross-package symmetry fix** (~30 min): re-export `BcGridIdentity`, `BcAggregation`, `BcAggregationResultDTO` from `@bc-grid/react`.
2. **INTERNALIZE `serverRowEntryOverrides` + `ServerRowEntryOverride`** (~half day): rename prop to `__bcServerRowEntryOverrides`, update `<BcServerGrid>` callers, update `serverTreeGroupRowOverrides.test.ts`. Add a `// @internal` JSDoc tag on the type.
3. **RENAME `Use*BoundProps` → `Use*ServerProps`** (~half day): aliases shipped through v1.1 per RFC #477 §3.1. Update manifest, types.ts, and the dual-output recipe (#484).
4. **`@bc-grid/server-row-model` mode shift** (~10 min): change manifest entry from `mode: "planned"` to `mode: "enforced"`.
5. **DEPRECATE `data-bc-grid-cell-state`** (~10 min): add JSDoc `@deprecated` tag pointing at `data-bc-grid-edit-state`.
6. **Maintainer pass on §5 OPEN QUESTIONs**: 12 type-pair / naming questions need a yes/no per item.

Estimated total: 1.5-2 days for a focused implementation session, plus ~30 min of maintainer review for the open questions.

## 16. Decision log

Populated as each §15 action item ships.

- **Item 1 — Cross-package symmetry** ✅ shipped in #505 (re-export `BcGridIdentity`, `BcAggregation`, `BcAggregationResultDTO` from `@bc-grid/react`).
- **Item 2 — INTERNALIZE `serverRowEntryOverrides`** ✅ shipped in #507 (renamed to `__bcServerRowEntryOverrides`, type renamed to `__BcServerRowEntryOverride` with `@internal` JSDoc; removed from public manifest).
- **Item 3 — RENAME `Use*BoundProps` → `Use*ServerProps`** ✅ shipped in #508 (4 new `Use*ServerProps` aliases per RFC #477 §3.1; old `Use*BoundProps` names kept as `@deprecated` aliases through v1.1; both in manifest during the deprecation window).
- **Item 4 — `@bc-grid/server-row-model` mode shift** ✅ shipped in #505 (manifest entry flipped `planned` → `enforced`).
- **Item 5 — DEPRECATE `data-bc-grid-cell-state`** ✅ shipped in #505 (JSDoc `@deprecated` tag added pointing at `data-bc-grid-edit-state`).
- **Item 6 — Maintainer pass on OPEN QUESTIONs** ✅ resolved 2026-05-04 PM. Maintainer ratified all 10 audit recommendations. Q5 (`BcServerEditPatchFactory` → `BcServerRowPatchFactory`) was the only one requiring code change — implemented in this commit: new `BcServerRowPatchFactory` type added, old `BcServerEditPatchFactory` kept as `@deprecated` alias through v1.1, both names exported from `@bc-grid/react`, both in the api-surface manifest. Issue [#512](https://github.com/bc-grid/bc-grid/issues/512) closed. **All §15 action items now ✅ complete — the v1.0 freeze gate on this audit is closed.**

### 16.1 OPEN QUESTION punch list (for maintainer review)

Compiled from §4, §5, and §9 — 15 questions total. Each has a default / recommended verdict from the audit author; maintainer just needs a yes / no / counter-proposal per item before v1.0 freeze.

**`@bc-grid/core` (§4)**

1. **`ServerRowModelMode`** (`"paged" | "infinite" | "tree"`) — name aligned with `<BcServerGrid rowModel>` prop. **Recommendation: KEEP-AS-IS** as the canonical mode-name enum. Chrome that displays mode names should reuse this enum rather than redeclaring.
2. **`ServerRowModelEvent`** — internal observability event-stream type. Used by consumers building dashboards but not by typical grid consumers. **Recommendation: KEEP-AS-IS** and document as "for observability tooling".

**`@bc-grid/react` (§5)**

3. **`BcCellEditor` vs `BcCellEditorProps`** — both shipped. Are they meant to be distinct types, or is one a typo / leftover? Need to confirm whether to LOCK both, deprecate one, or rename.
4. **`BcServerEditMutationEvent` vs `BcServerEditMutationProps`** — same pattern, same question.
5. **`BcServerEditPatchFactory`** — naming feels heavy. Alternatives: `BcServerEditMutationPatch` or `BcServerRowPatchFactory`. **Recommendation: rename to `BcServerRowPatchFactory`** (matches the `BcServerRowPatch` it produces); old name as `@deprecated` alias through v1.1 if any consumer references it.
6. **`BcSidebarBuiltInPanel` / `BcSidebarCustomPanel` / `BcSidebarPanel`** — three types for the sidebar panel concept. Is the union (`BcSidebarPanel`) sufficient, or are the discriminated arms each meaningful as separate exports? **Recommendation: KEEP all three exported** (consumers writing custom panels need `BcSidebarCustomPanel`; consumers extending built-ins need `BcSidebarBuiltInPanel`).
7. **`BcStatusBarCustomSegment` vs `BcStatusBarSegment`** — same question as the sidebar trio. **Recommendation: KEEP both exported** for the same reason.
8. **`BcContextMenuBuiltinItem` vs `BcContextMenuCustomItem` vs `BcContextMenuItem`** — same trio pattern. **Recommendation: KEEP all three exported.**
9. **`useBcGridApi` vs `useBcGridState`** — both hooks; `useBcGridApi` returns the apiRef ref-handle, `useBcGridState` returns controlled state. **Recommendation: KEEP both names** — they serve distinct concerns (imperative API vs reactive state) and renaming would churn every consumer.

(Questions 6, 7, 8 each cover a 2-or-3-type cluster; counted as one question each since they ratify the same naming pattern. Question 3, 4 cover 2 types each; counted as one question each.)

(Per the audit's "OPEN QUESTION (12)" count in §5, the 7 questions above unpack 12 individual type names — accurate when counting types, not question-count.)

**`@bc-grid/aggregations` (§9)**

10. **Plain-name aggregation functions (`avg`, `count`, `max`, `min`, `sum`)** — collide easily with consumer math libraries (lodash, etc.). Worth namespacing? **Recommendation: KEEP-AS-IS** — consumers can `import * as bcAgg from "@bc-grid/aggregations"` if they need namespacing.

### 16.2 How the maintainer answers

For each numbered question above, leave a 1-line decision in the GitHub issue tagged `v1-api-question`:

- ✅ "Confirm recommendation" → no code change; the audit doc verdict becomes binding.
- ↻ "Counter-proposal: <new name / new verdict>" → worker opens a follow-up PR to apply.

After all questions resolve, the v1.0 freeze gate on this audit closes.
