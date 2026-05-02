# Worker2 v0.5 → v0.6 Grouping + Filter Follow-ups

**Author:** worker2 (Codex in `~/work/bcg-worker2`)
**Date:** 2026-05-03
**Lane:** filters, aggregations, range/clipboard prep, and grouping chrome
**Branch:** `agent/worker2/v05-grouping-followups-planning-doc`
**Source audit:** `docs/coordination/audit-2026-05/worker2-findings.md` (#351)

This is a **read-only planning pass**, not implementation. Each item names the v0.6 task, where it manifests in code today, what's wrong, the suggested fix shape, and the affected packages. Items are ordered so the coordinator can copy them straight into the v0.6 backlog.

The v0.5 worker2 lane shipped the critical-path items: filter-side `apiRef` methods (#377), paste listener + `apiRef.pasteTsv` + editor-controller paste commit (#380), and the `BcColumnFilter` discriminated union (#384). What follows are the grouping and filter maturity items the audit flagged that the now-shipped v0.5 surface still does not address.

## Status of #351 audit findings after v0.5

| #351 finding | Status after v0.5 | v0.6 task entry |
|---|---|---|
| **P0-1** Excel paste helper exists but is not wired | Closed for visible client paste by #380. Server-side / unloaded-row paste planning remains open. | **§8 below — `v06-server-side-paste-planning`** |
| **P0-8** grouping is page-window only and group subtotals are not rendered | Still open. The synthesis chose group-before-paginate for v0.6. | **§1 below — `v06-client-group-before-paginate-subtotals`** |
| **P1-W2-1** `@bc-grid/filters` and custom filter registry are placeholders | Still open. #384 improved type narrowing but did not implement the registry. | **§3 below — `v06-filter-registry-implementation`** |
| **P1-W2-2** set filters do not have a scalable option model | Still open. The current set filter scans local `data` and renders all matching options. | **§4 below — `v06-set-filter-option-provider`** |
| **P1-W2-3** named saved searches / filter views are host-only | Still open. `BcGridLayoutState` exists, but there is no canonical saved-view DTO. | **§5 below — `v06-saved-view-dto-recipe`** |
| **P1-W2-4** ERP filter operator coverage is thin | Still open. Built-ins miss blank / not blank, negative text/date, relative dates, fiscal periods, and current-user/team predicates. | **§6 below — `v06-erp-filter-operators`** |
| **P1-W2-5** group selection algebra is absent | Still open. Group rows carry descendants but selection only targets data rows. | **§2 below — `v06-group-selection-algebra`** |
| **P2** active filter summary exists only inside the Filters panel | Still open outside the panel. #355 shipped the panel chip summary, not a toolbar/status strip. | **§7 below — `v06-active-filter-chip-strip`** |
| **P2** chrome polish drift on older filter/sidebar surfaces | Mostly handled by the v0.4/v0.5 chrome polish train; not queued here. | not queued in this doc |
| **P2** range paste planning is visible-row oriented | Still open for server-backed / unloaded-row planning. | **§8 below — `v06-server-side-paste-planning`** |

The handoff (`docs/coordination/handoff-worker2.md`) also explicitly named these to convert:

| Handoff item | Status | v0.6 task entry |
|---|---|---|
| Group-before-paginate + group subtotals | covers P0-8 | §1 |
| Group selection algebra | covers P1-W2-5 | §2 |
| Filter registry implementation | covers P1-W2-1 | §3 |
| Set filter virtualization + async | covers P1-W2-2 | §4 |
| Saved-view DTO + recipe | covers P1-W2-3 | §5 |
| ERP filter operator coverage | covers P1-W2-4 | §6 |
| Active filter chip strip in toolbar | covers P2 active-filter summary | §7 |
| Range paste server-side support | covers P2 range paste planning | §8 |

## v0.6 task proposals

### §1 — `v06-client-group-before-paginate-subtotals`

- **Where:** `packages/react/src/grid.tsx:833-869` builds `leafRowEntries` by slicing `allRowEntries` before `buildGroupedRowModel`; `packages/react/src/grid.tsx:903` computes only global aggregation rows; `packages/react/src/bodyCells.tsx:262-310` renders a group row as one spanning label/count cell; `packages/aggregations/src/aggregate.ts:160-170` already exposes `aggregateGroups`; `docs/design/aggregation-rfc.md:264-278` and `:333-335` describe group-row aggregation as intended; `docs/api.md:1743-1770` documents the current client/server grouping split and `docs/api.md:1797-1801` says per-group subtotals paint on the group row. The audit and synthesis call this out at `docs/coordination/audit-2026-05/worker2-findings.md:20-25`, `docs/coordination/audit-2026-05/synthesis.md:90-96`, and the coordinator decision is explicit at `docs/coordination/audit-2026-05/synthesis.md:183`. The production-estimating spike also clarifies that row grouping's job is field-value totals like "show me totals by region," not parent/child rows (`apps/examples/src/production-estimating.example.tsx:399-410`).
- **What's wrong:** Client grouping currently runs after pagination, so a paged `<BcGrid data={rows}>` shows group labels, counts, and expansion structure for the current page slice only. That contradicts the docs that present client grouping as full-data grouping across pagination. Group rows also cannot show numeric subtotals because the render path has only one spanning cell and the only wired aggregation input is the global `allRowEntries` set. For AR and production grids, a group such as "Past Due (12)" with no `balance` subtotal reads as a workload statement even when it is only a page-window artifact.
- **Fix shape:** Split grouping into a full-data grouped model and a paginated display model. The full model should be built from `allRowEntries` after filter/search/sort and before pagination. The visible model can still respect page size, but group metadata (`childCount`, descendant ids, and aggregations) must come from the full grouped buckets, not the current page. Include a short design note in the PR on whether pagination counts display rows or data rows plus ancestor group headers.
- **Fix shape:** Wire group aggregations into the grouped row model. The simplest path is to extend `GroupRowEntry` with a stable group key/path plus `aggregations: readonly AggregationResult[]`, then render group rows with real per-column cells so numeric subtotal columns line up with body/footer cells. The existing label treatment can remain in the first visible cell, but the row should no longer be a single spanning cell if subtotals and group selection need independent layout, a11y, and tests.
- **Affected:** `@bc-grid/react` (`grid.tsx`, `grouping.ts`, `bodyCells.tsx`, types, tests), `@bc-grid/aggregations` only if group-key helpers need to move, docs/API examples. No server-row-model ownership except documenting that `<BcServerGrid>` still needs server-delegated grouping for unloaded datasets.
- **Dependency:** This should land before §2 because group selection depends on a stable full-group descendant map and likely the same group-row rendering refactor.
- **Risk note:** Changing grouped pagination semantics is observable. The synthesis already picked group-before-paginate for v0.6, but the PR should call out the migration note and include grouped + paginated + aggregated tests.

### §2 — `v06-group-selection-algebra`

- **Where:** `packages/react/src/grouping.ts:76-85` stores `childRowIds` on each group row; `packages/react/src/grid.tsx:2489-2502` uses group-row click only for focus + expansion; `packages/react/src/grid.tsx:2128-2135` returns early for keyboard selection on non-data rows; `packages/react/src/grid.tsx:2539-2559` handles selection only in data-row clicks; `packages/react/src/selection.ts:21-123` has row-id helpers but no group-descendant operation; `packages/react/src/selectionColumn.tsx:38-57` toggles the header or individual data-row checkbox only. The audit finding is at `docs/coordination/audit-2026-05/worker2-findings.md:57-62`, and both hero spikes repeat selection ergonomics pain at `apps/examples/src/document-management.example.tsx:287-298` and `apps/examples/src/production-estimating.example.tsx:454-460`.
- **What's wrong:** Group rows know which data rows are in the bucket, but users cannot select the bucket. Mouse and keyboard interactions only expand/collapse the group, and the synthetic checkbox column cannot express a group tri-state because group rows render as one spanning cell. This forces ERP users to expand the group and manually select rows for common actions such as "select all lines in this customer/status bucket."
- **Fix shape:** Add pure selection helpers that operate over a descendant row-id list: `selectGroupDescendants`, `toggleGroupDescendants`, and `groupSelectionState`. They should skip disabled rows, work with collapsed groups, and preserve the existing `explicit`/`all`/`filtered` `BcSelection` semantics. The v0.6 behavior should target visible/client descendants first; the server-side extension can be a future `mode: "filtered"` group selection scoped by view key and group path.
- **Fix shape:** Surface the behavior through checkbox selection and keyboard access. Once §1 gives group rows real cells, render a group checkbox in the synthetic selection column and keep the disclosure control in the label cell. Suggested keyboard split: Enter toggles expansion; Space toggles selection when `checkboxSelection` is enabled. Add tests for nested groups, collapsed groups, disabled descendants, shift/range anchors after group toggles, and server-page-window limitations.
- **Affected:** `@bc-grid/react` (`selection.ts`, `selectionColumn.tsx`, `grouping.ts`, `grid.tsx`, `bodyCells.tsx`, CSS/theming for group checkbox alignment), docs and tests.
- **Dependency:** Depends on §1 for correct full-group descendant metadata and group-row cell layout.

### §3 — `v06-filter-registry-implementation`

- **Where:** `packages/filters/src/index.ts:1` is still a placeholder; `packages/filters/README.md:3-11` says the real implementation lands later and names the intended exports; `packages/react/src/types.ts:847-863` exposes `BcFilterDefinition`, `BcReactFilterDefinition`, and editor props; `packages/react/src/filter.ts:334-362` hard-codes built-in predicate dispatch and returns `false` for unknown non-text filter types; `packages/react/src/headerCells.tsx:1074-1220` hard-codes built-in editor rendering and falls through to a text input. The RFC's registry widening and lookup shape are at `docs/design/filter-registry-rfc.md:188-206`, with composition/test expectations at `docs/design/filter-registry-rfc.md:423-436` and `:459-467`.
- **What's wrong:** Public types advertise custom filter definitions, but there is no registry, no built-in package exports, no predicate dispatch for registered filters, and no React editor lookup. A controlled custom filter can silently fail to match in the predicate path, while a column-level custom filter has no real editor contract beyond the fallback input. #384 made the built-in union safer; it did not make the extension point real.
- **Fix shape:** Implement `@bc-grid/filters` with built-in definitions, `matchesFilter`, and a registration API. Keep the built-ins as first-class definitions so React uses the same registry path for text/number/date/set/boolean and registered filters. The core data shape can remain additive: built-in discriminants stay narrow, and registered keys use the RFC's branded string escape hatch.
- **Fix shape:** Add a React adapter that resolves the column filter definition to an editor + parse/serialize + predicate. Unknown filter types should fail loudly in development and produce a safe no-match in production rather than silently pretending to be text. Add tests for registry lookup, duplicate registration, built-in parity, unknown type behavior, custom editor rendering, controlled filter evaluation, and URL/localStorage round trips.
- **Affected:** `@bc-grid/filters`, `@bc-grid/react`, possibly `@bc-grid/core` for public filter type widening, api-surface manifest, docs.
- **Dependency:** §6 should land after or with this. The operator-metadata work is much cleaner once built-ins are registry definitions instead of scattered switches.

### §4 — `v06-set-filter-option-provider`

- **Where:** `packages/react/src/grid.tsx:1074-1134` synchronously scans `data`, applies other filters/search, dedupes values, and sorts options when a set filter opens; `packages/react/src/headerCells.tsx:742-816` stores a synchronous `options` array and calls `getSetFilterOptions` during menu open; `packages/react/src/headerCells.tsx:790-793` filters options in memory; `packages/react/src/headerCells.tsx:841-866` keyboard navigation queries every checkbox in the menu; `packages/react/src/headerCells.tsx:988-1011` renders every visible option with `visibleOptions.map`; `packages/react/src/filter.ts:537-573` only covers local search and toggle-all semantics.
- **What's wrong:** The current implementation is fine for status/region/owner fields, but it does not scale to thousands of customers, vendors, items, or user-defined values. Opening the menu is synchronous, option search is local only, the list is not virtualized, and there is no loading/error/abort state. Selected values hidden by search are preserved internally, but the UI does not present them as a distinct "selected outside current search" section.
- **Fix shape:** Add a set-filter option provider contract. Proposed shape: `loadSetFilterOptions({ columnId, search, selectedValues, filterWithoutSelf, signal, limit, offset }) => Promise<{ options, totalCount?, selectedOptions?, hasMore? }>` with a small-data sync adapter preserving today's behavior. The provider should support counts, server-backed search, aborting stale searches, selected-value hydration, and a result cap message.
- **Fix shape:** Virtualize the menu body for large option sets and keep keyboard semantics stable. `Select all` should clearly mean "all loaded/matching options" unless the provider declares support for all matching values. Tests need 1k and 10k option cases, async race handling, selected-value preservation, and `not-in`/`blank` behavior.
- **Affected:** `@bc-grid/react` set filter control, filter types, docs, tests. Optional future tie-in to `@bc-grid/filters` if set filters become registry-provided editors.
- **Dependency:** Can start independently, but the final API should align with §3's registry definition shape so the set editor does not need a second extension model.

### §5 — `v06-saved-view-dto-recipe`

- **Where:** `packages/react/src/types.ts:59-74` defines a single `BcGridLayoutState`; `packages/react/src/persistence.ts:23-42` models current persisted state and URL state only; `packages/react/src/persistence.ts:55-91` reads/writes one current localStorage snapshot per `gridId` key; `packages/react/src/persistence.ts:341-350` parses only column state, sort, and filter from URL state; `docs/api.md:798-827` documents applying a layout snapshot; `docs/api.md:830-855` documents grid identity, localStorage, and URL persistence. The audit and synthesis open questions are at `docs/coordination/audit-2026-05/worker2-findings.md:43-48` and `docs/coordination/audit-2026-05/synthesis.md:184`.
- **What's wrong:** The grid can persist "the current layout," but it does not define what a named saved view is. Consumers have to invent `id`, `name`, owner/scope, favorite/default flags, migration/version rules, active-view identity, and share URL semantics. That guarantees divergent ERP saved-search implementations even though all of them wrap the same `BcGridLayoutState` fields.
- **Fix shape:** Publish a canonical DTO and recipe, not a full saved-view UI. Suggested DTO: `BcSavedView { id, name, gridId, version, layout, scope, ownerId?, isDefault?, isFavorite?, createdAt?, updatedAt?, description? }`, plus helpers such as `createSavedView`, `applySavedViewLayout`, and `migrateSavedViewLayout`. The DTO should nest `BcGridLayoutState` rather than duplicating its fields.
- **Fix shape:** Document a toolbar recipe for "saved searches/list views" using controlled `layoutState`, `onLayoutStateChange`, `urlStatePersistence`, and host storage. Include examples for "My Past Due" and "Region South / Disputed"; specify that bsncraft owns the UX but bc-grid owns the DTO and migration semantics. Decide whether URL state should carry only the current layout blob or also `activeSavedViewId`.
- **Affected:** `@bc-grid/react` types/helpers, docs/API examples, possible `@bc-grid/core` export if the DTO is not React-specific. No runtime UI required for v0.6.
- **Dependency:** Should align with §3/§6 filter serialization so saved views do not lock in a pre-registry filter payload.

### §6 — `v06-erp-filter-operators`

- **Where:** `packages/react/src/filter.ts:19-29` defines current operator unions; `packages/react/src/filter.ts:374-395` supports text contains/starts-with/ends-with/equals; `packages/react/src/filter.ts:785-807` supports date is/before/after/between; `packages/react/src/filter.ts:810-824` supports set in/not-in/blank; `packages/react/src/filter.ts:826-847` supports number comparisons/between. The audit finding is at `docs/coordination/audit-2026-05/worker2-findings.md:50-55`.
- **What's wrong:** ERP saved searches need negative and relative predicates that are not present: blank/not blank for every scalar type, text/date not equals, does-not-contain, today/this week/this month/last N days, fiscal period buckets, and current user/team. Without those, consumers have to encode domain predicates outside the grid or abuse custom filters before the registry exists.
- **Fix shape:** Add operator metadata to built-in registry definitions: label, value shape, editor controls, serializer/parser, predicate, and optional server translation hint. Start with blank/not-blank for text/number/date/boolean, text does-not-contain/not-equals, date not-equals, and relative date presets. Fiscal periods and current user/team need host context; model them as parameterized registry filters rather than hard-coded global state.
- **Fix shape:** Keep server filter payloads explicit. Relative dates should serialize as relative tokens (`last-n-days`, `this-week`) plus parameters, not resolved dates, so saved views remain evergreen. The client predicate can resolve relative tokens with a clock/context object for local rows; server-backed grids pass the same structured operator to the endpoint.
- **Affected:** `@bc-grid/filters`, `@bc-grid/react`, `@bc-grid/core` filter payload types, docs, tests.
- **Dependency:** Depends on §3 unless v0.6 intentionally accepts another round of hard-coded switch expansion. My recommendation is to land it with the registry.

### §7 — `v06-active-filter-chip-strip`

- **Where:** `packages/react/src/filterToolPanel.tsx:36-75` renders removable active-filter chips only inside the Filters panel header; `packages/react/src/statusBar.tsx:96-125` can show that filtering is active only as a row-count status segment; `packages/react/src/grid.tsx:2274-2292` exposes filter state/clear helpers only through sidebar context, not through a toolbar/status chip primitive. The audit finding is at `docs/coordination/audit-2026-05/worker2-findings.md:66-71`.
- **What's wrong:** When the Filters panel is closed, users can see per-column funnels and possibly a filtered row count, but they cannot scan "which filters are active" or clear one filter from a persistent toolbar/status region. Saved views make this more important because restored/shared views need an always-visible trust signal.
- **Fix shape:** Extract the active-filter item builder used by `filterToolPanel.tsx` into a reusable helper and ship a small `<BcActiveFilterChips>` primitive or status-bar segment. It should render compact chips with labels, clear-one buttons, and clear-all. It should accept placement-friendly props (`density`, `maxVisible`, `overflowLabel`) so hosts can put it in a toolbar without opening the sidebar.
- **Fix shape:** Keep the Filters panel as the detailed editor; the chip strip is a summary/action surface only. Tests should cover label rendering for built-ins, custom/registered filters once §3 lands, clear-one behavior, clear-all behavior, overflow summarization, and a11y labels.
- **Affected:** `@bc-grid/react` helper/component, theming CSS, docs/examples. No `@bc-grid/filters` dependency unless label formatting moves into registry metadata.
- **Dependency:** Can land before §3 using current built-ins, but final custom labels should integrate with registry metadata.

### §8 — `v06-server-side-paste-planning`

- **Where:** `packages/react/src/rangeClipboard.ts:50-56` defines paste planning around `visibleRowIds` and `visibleColumnIds`; `packages/react/src/rangeClipboard.ts:419-446` computes target indexes inside those visible arrays; `packages/react/src/rangeClipboard.ts:513-520` applies the visible row/column model; `packages/react/src/rangeClipboard.ts:539-550` rejects overflow outside visible bounds by default; `packages/react/src/grid.tsx:1540-1583` wires `apiRef.pasteTsv` to the visible apply plan and editor controller; `docs/api.md:610-617` documents `BcGridPasteTsvParams`. The audit finding is at `docs/coordination/audit-2026-05/worker2-findings.md:80-85`, and #380 closed the visible paste integration.
- **What's wrong:** Visible-window paste is the right v0.5 behavior, but it does not describe server-backed paste across unloaded rows, filtered selections, grouped rows, or large spreadsheet ranges that exceed the current viewport/page. Today the only outcomes are apply to visible rows, clip, or reject. ERP users working in large estimate or production grids will eventually expect a server-confirmed paste plan that can target unloaded rows or return precise rejection metadata.
- **Fix shape:** Document the current limit first: `apiRef.pasteTsv` is a visible model operation. Then add a design contract for server-side paste planning, likely owned by `<BcServerGrid>` or a hook: `onServerPastePlan({ tsv, anchor, range, view, overflow, signal }) => Promise<{ patches, rejectedCells, diagnostics }>` or a lower-level `loadPasteTargets` callback that resolves row identities before applying edits. The contract must make row ordering explicit under sort/filter/group and must define how grouped rows are skipped.
- **Fix shape:** Keep client atomicity semantics. A server plan should either return a complete patch set for the intended target range or structured failure metadata before any commit. It should route accepted patches through the existing edit/server mutation pipeline rather than bypassing validation. Tests can be pure unit/contract tests in v0.6; coordinator-owned Playwright can cover browser paste later.
- **Affected:** `@bc-grid/react` API/types/docs, possibly `@bc-grid/server-row-model` if patch planning needs model helpers. No local Playwright required; coordinator owns those gates.
- **Dependency:** Should wait until bsncraft migration surfaces the real server-paste shape. It does not block v0.6 grouping/filter work.

## Ranking suggestion

If v0.6 capacity is tight, the priority order is:

1. **§1** (group-before-paginate + subtotals) — synthesis-picked v0.6 correctness gap and the biggest worker2 grouping task.
2. **§2** (group selection algebra) — natural companion to §1; requires the same group metadata and row rendering work.
3. **§3** (filter registry implementation) — unblocks real custom filters and gives §6 a durable home.
4. **§4** (set-filter option provider) — high-impact for ERP cardinality and can progress in parallel with registry design.
5. **§6** (ERP filter operators) — important saved-view expressiveness, but should land with/after registry metadata.
6. **§5** (saved-view DTO + recipe) — mostly types/docs, but should wait until filter serialization direction is clear.
7. **§7** (active filter chip strip) — useful P2 surface, low risk, can fill a small slot.
8. **§8** (server-side paste planning) — design follow-up; wait for bsncraft migration to confirm the real contract.

## Open questions for the coordinator

1. **§1 pagination semantics** — after grouping before pagination, should page size count data rows only, or display rows including group headers? My recommendation is data rows plus required ancestor group headers, with group counts/subtotals computed from the full filtered dataset.
2. **§1 group-row rendering** — should group rows become real per-column cells in v0.6, or keep a spanning label cell plus aggregate chips? I recommend real cells so subtotals, selection checkbox, keyboard focus, and a11y align with the rest of the grid.
3. **§2 server group selection** — is v0.6 limited to visible/client descendants, or should it introduce a `filtered`/view-key group selection shape for unloaded server groups? My recommendation is visible/client in v0.6 and explicit server extension later.
4. **§3 registry type shape** — keep `custom` as a special discriminant plus branded registered strings, or move all custom filters to registered string keys? #384 makes the built-ins safe; the registry should avoid reopening a loose union accidentally.
5. **§4 set-filter provider** — does "select all" mean all loaded options, all matching provider results, or all distinct values for the current filter-without-self query? This needs explicit UI copy and callback capability.
6. **§5 saved-view scope** — should `BcSavedView` live in `@bc-grid/core` for server/shared consumers, or `@bc-grid/react` because it wraps React layout state? My read is core if the DTO is framework-neutral.
7. **§8 server paste ownership** — should the first contract live in `BcServerGrid` or remain a docs-only recipe until bsncraft implements a concrete server-paste endpoint?
