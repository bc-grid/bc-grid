# Worker2 Findings - bc-grid Audit 2026-05

**Author:** worker2
**Lane:** filters, aggregations, range/clipboard prep, and chrome consistency
**Date:** 2026-05-02

## Executive summary

This lane is strong as a polished v0.4 data-grid surface, but it is not yet ERP-grade for saved-search workflows, large distinct-value filters, or grouped financial rollups. The biggest demo risk is spreadsheet paste: the parser/planner work exists, but there is no product path from Ctrl+V or `BcGridApi` into an atomic paste apply. The biggest production risk is grouping: current group rows are page/window outline rows with counts, while the docs and ERP mental model imply full-view groups with visible subtotals.

## P0 findings

### Excel paste is helper-only, with no user or API path

- **Where:** `packages/react/src/rangeClipboard.ts:489`, `packages/core/src/index.ts:321`, `packages/react/src/grid.tsx:1428`, `packages/react/src/grid.tsx:1721`
- **What:** `buildRangeTsvPasteApplyPlan` parses TSV, plans target cells, applies `valueParser`, and validates atomically, but the grid API exposes only `copyRange`, and grid keyboard handling only wires Ctrl/Cmd+C. There is no Ctrl/Cmd+V path, no paste API, and no bridge from the apply plan into the editing controller or row mutation flow.
- **Why it matters for the BusinessCraft ERP:** Sales estimating explicitly depends on Excel-style paste. Without a visible paste path, the demo can show range copy and internal planning tests, but not the workflow users will try first when moving estimate lines from spreadsheets into the browser.
- **Recommendation:** Add a v0.5 integration slice that exposes a paste command (`pasteTsv` or equivalent), wires Ctrl/Cmd+V behind the existing range selection, feeds commits through the editing/server-edit pipeline, and returns per-cell failure metadata without partially applying failed pastes.

### Grouping is page-window only and group subtotals are not rendered

- **Where:** `packages/react/src/grid.tsx:762`, `packages/react/src/grid.tsx:777`, `packages/react/src/bodyCells.tsx:270`, `packages/react/src/grid.tsx:903`, `docs/api.md:1651`
- **What:** `leafRowEntries` paginates before `buildGroupedRowModel`, so grouped client rows are built from the current page/window, not necessarily the full client dataset. Group rows render one spanning cell with label and count only. The aggregation footer uses global `useAggregations`, but `aggregateGroups` is not wired into group-row rendering. This conflicts with the docs that say per-group subtotals paint on group rows.
- **Why it matters for the BusinessCraft ERP:** AR and production users read group labels and totals as workload statements. A "Past Due (12)" group on a paginated slice, with no subtotal beside balance or aging columns, is materially less trustworthy than an ERP outline.
- **Recommendation:** Decide the contract explicitly. For client grids, group before pagination or label grouped pagination as current-page grouping. Then wire a group aggregation map into group rows so numeric columns can show subtotals in their own cells, with tests for grouped + paginated + aggregated grids.

## P1 findings

### The filters package and custom filter registry are still placeholders

- **Where:** `packages/filters/src/index.ts:1`, `packages/filters/README.md:3`, `packages/react/src/types.ts:718`, `packages/react/src/filter.ts:154`, `packages/react/src/filter.ts:340`
- **What:** `@bc-grid/filters` is empty. React exposes `BcFilterDefinition`/`BcReactFilterDefinition`, but there is no registry implementation. A column declared with `filter: { type: "custom" }` falls through to the text editor path when building inline state, while a controlled `ServerColumnFilter` with `type: "custom"` will never match in `matchesColumnFilter`.
- **Why it matters for the BusinessCraft ERP:** ERP filters often need domain predicates: assigned-to-me, on-credit-hold, stock status, fiscal period, lookup hierarchy, and custom field logic. Today those cannot be implemented through the advertised filter extension point.
- **Recommendation:** Implement the filter registry package or remove/defer the custom contract from public docs until it is real. The React adapter should resolve registered predicates and editors, and controlled `custom` leaves should either execute registered predicates or fail loudly in development.

### Set filters do not have a scalable option model

- **Where:** `packages/react/src/grid.tsx:930`, `packages/react/src/grid.tsx:945`, `packages/react/src/grid.tsx:987`, `packages/react/src/headerCells.tsx:814`, `packages/react/src/headerCells.tsx:994`
- **What:** Opening a set filter synchronously scans all `data`, applies other filters/search, dedupes values, and sorts the full list. The menu then renders every visible option with `visibleOptions.map`, and keyboard navigation queries every checkbox in the DOM. CSS caps menu height, but there is no virtualization, paging, async option loading, result cap, or "selected outside current search" section.
- **Why it matters for the BusinessCraft ERP:** Status, region, and owner filters are fine, but item/customer/vendor/user-defined fields can have thousands of distinct values. A NetSuite-style multi-pick filter needs to stay responsive at that scale.
- **Recommendation:** Add an option provider contract with counts, async search, and a virtualized list for large distinct sets. Keep the current eager local implementation as the small-data default, but add tests around 1k/10k options and selected-value preservation.

### Named saved searches/filter views are host-only

- **Where:** `docs/api.md:651`, `packages/react/src/types.ts:47`, `packages/react/src/persistence.ts:55`, `packages/react/src/persistence.ts:94`
- **What:** `BcGridLayoutState` can store one layout snapshot and `gridId` localStorage can persist current state, but bc-grid does not model a named saved view, active view identity, ownership/scope, favorite/default flags, or filter-set list. URL persistence likewise serializes one current state blob.
- **Why it matters for the BusinessCraft ERP:** BusinessCraft users will expect saved searches/list views such as "My Past Due", "Disputed in South", or "Needs follow-up this week". If every screen reimplements naming, storage, migration, and active-view chrome, the ERP will feel inconsistent and bc-grid will look like a generic table.
- **Recommendation:** Provide a typed saved-view helper or recipe that standardizes `id`, `name`, `scope`, `layout`, `isDefault`, and migration semantics. At minimum, add first-class docs and examples for a saved-search toolbar using `BcGridLayoutState.filter`, `groupBy`, and `sort`.

### ERP filter operator coverage is still thin

- **Where:** `packages/react/src/filter.ts:19`, `packages/react/src/filter.ts:20`, `packages/react/src/filter.ts:21`, `docs/api.md:812`
- **What:** Current operators cover text contains/starts/ends/equals, number comparisons/between, date is/before/after/between, and set in/not-in/blank. Missing common ERP saved-search operators include blank/not blank for every scalar type, not equals for text/date, relative dates such as today/this week/this month/last N days, fiscal period buckets, "current user/team", and negative text operators like does-not-contain.
- **Why it matters for the BusinessCraft ERP:** AR and production users express work queues with relative and negative filters: "not blank PO date", "due this week", "not assigned", "not closed", "last invoice before 60 days". Without those, saved views need host-side custom filters before the registry is ready.
- **Recommendation:** Treat operator coverage as part of the filter registry work. Add operator metadata, editor rendering, predicate tests, and serialization for blank/not-blank and relative date presets first.

### Group selection algebra is absent

- **Where:** `packages/react/src/grouping.ts:81`, `packages/react/src/bodyCells.tsx:289`, `packages/react/src/grid.tsx:1674`, `packages/react/src/grid.tsx:1762`
- **What:** Group rows carry `childRowIds`, but clicking or pressing Enter/Space toggles expansion only. Keyboard row selection explicitly returns when the current row is not a data row, and there is no API/helper that maps a group selection to its descendant data rows.
- **Why it matters for the BusinessCraft ERP:** Production estimating and AR workflows often act on a grouped bucket: select all lines in a purchase-order group, bulk-update a status, or copy a whole customer segment. Without group selection, users must expand and select rows manually.
- **Recommendation:** Add a group-selection helper that selects visible descendants first, with a future extension for full server-view group selection. Expose the behavior through checkbox selection and keyboard selection, and add tests for collapsed groups, nested groups, disabled rows, and server-page-window limits.

## P2 findings

### Active filter summary exists only inside the Filters panel

- **Where:** `packages/react/src/filterToolPanel.tsx:50`, `packages/react/src/filterToolPanel.tsx:52`, `packages/react/src/statusBar.tsx:96`, `packages/react/src/contextMenu.ts:109`
- **What:** Active filters are editable and removable when the Filters panel is open, header funnels show per-column state, and the status bar can show filtered row counts. There is no always-visible chip strip or compact summary that says "4 filters" with individual clear affordances when the panel is closed.
- **Why it matters for the BusinessCraft ERP:** Saved-search users need fast confidence that a list is narrowed, especially when a view is shared or restored from localStorage/URL state.
- **Recommendation:** Add a small active-filter summary surface that can live in a toolbar/status region and reuse `clearFilter(columnId)`. Keep the current Filters panel as the detailed editor.

### Chrome polish is good, but a few older surfaces still miss the current visual contract

- **Where:** `packages/react/src/headerCells.tsx:930`, `packages/react/src/columnToolPanel.tsx:114`, `packages/react/src/columnToolPanel.tsx:218`, `packages/theming/src/styles.css:1659`, `packages/theming/src/styles.css:1721`
- **What:** Filter popup, inline filter row, filters panel, and sidebar polish are mostly token-driven and shadcn-consistent. Older surfaces still show drift: set-filter uses a text caret glyph, the column panel uses text glyphs (`::`, `x`), column-menu shadow uses hard-coded `rgb(...)`, and disabled column-menu items still use `cursor: not-allowed`.
- **Why it matters for the BusinessCraft ERP:** This does not block behavior, but it makes the chrome feel stitched together when users move between filter popup, sidebar panels, and header menus.
- **Recommendation:** Do a small chrome consistency cleanup after the audit synthesis: replace text glyphs with internal SVG icons, move column-menu shadow to `--bc-grid-overlay-shadow`, and align disabled cursor treatment with the filters/pagination panels.

### Range paste planning is visible-row oriented

- **Where:** `packages/react/src/rangeClipboard.ts:50`, `packages/react/src/rangeClipboard.ts:513`, `packages/react/src/rangeClipboard.ts:539`
- **What:** The paste planner targets `visibleRowIds` and `visibleColumnIds`, then rejects or clips out-of-bounds cells. That is a good internal helper for client-visible ranges, but it does not describe server-backed paste across unloaded rows, filtered selections, or group rows beyond reject metadata.
- **Why it matters for the BusinessCraft ERP:** Large estimate and production grids may be server-backed. Users still expect paste to either fill the visible window predictably or hand off a larger patch to the server with clear feedback.
- **Recommendation:** Keep visible-window paste for v0.5, but document the limit and add a follow-up design for server-side paste planning before v1.0.

## What's already strong

- Filter predicate/serialization coverage in React is deep: `packages/react/tests/filter.test.ts` has broad tests for text, number, date, set, blank set values, array-valued cells, and round-tripping.
- The filter popup, filters panel, inline filter row, and sidebar chrome have strong token discipline and dedicated CSS contract tests.
- `@bc-grid/aggregations` has a clean pure engine with mergeable aggregators, custom aggregators, and pivot DTO groundwork.
- Range TSV parsing and paste planning already have useful diagnostics and atomic validation semantics; the missing piece is product integration, not parser correctness.

## Open questions for the coordinator

- Should v0.5 paste integration be owned by worker2 as a range/clipboard continuation, or split with worker3 because commit/validation flows through the editor controller?
- Should client grouping group before pagination, or should bc-grid intentionally document all grouped pagination as page-window grouping?
- Is saved-search UI a bc-grid component/helper, or should bc-grid only publish a canonical DTO and bsncraft own the actual named-view UX?
