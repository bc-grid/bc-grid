# AG Grid Comparison: Filtering, Search, Persistence

**Date:** 2026-05-01
**Author:** worker2 (Claude)
**Audit plan:** `docs/coordination/ag-grid-clean-room-audit-plan.md`
**Confirmation:** No AG Grid source repository was cloned, opened, or inspected. All AG Grid references are paraphrased from public documentation pages observed in the past (URL list under "Inputs" below). bc-grid claims are anchored to specific files and tests in this repository.

## Scope

Filtering, full-row search ("quick filter"), and the persistence of those two states for a v0.2 / v0.3 planning round. Out of scope (planned for sibling audits): selection / range, editing, server row model, grouping / aggregation / pivot, layout, accessibility (keyboard / a11y deep-pass), mobile / touch.

The comparison is framed against AG Grid Community + Enterprise as a product reference for "what serious data-grid users expect." It is not a feature-tick exercise. The deliverable is a triaged list of where bc-grid is already ahead, where it sits at parity, and which gaps merit queue follow-up before v0.2 / v0.3.

## Inputs

### Public AG Grid docs (URLs only — used as a behavioural reference)

- Filtering Overview — `https://www.ag-grid.com/javascript-data-grid/filtering-overview/`
- Text Filter — `https://www.ag-grid.com/javascript-data-grid/filter-text/`
- Number Filter — `https://www.ag-grid.com/javascript-data-grid/filter-number/`
- Date Filter — `https://www.ag-grid.com/javascript-data-grid/filter-date/`
- Set Filter (Enterprise) — `https://www.ag-grid.com/javascript-data-grid/filter-set/`
- Multi Filter (Enterprise) — `https://www.ag-grid.com/javascript-data-grid/filter-multi/`
- Floating Filters — `https://www.ag-grid.com/javascript-data-grid/floating-filters/`
- Filters Tool Panel — `https://www.ag-grid.com/javascript-data-grid/tool-panel-filters/`
- Quick Filter — `https://www.ag-grid.com/javascript-data-grid/filter-quick/`
- Filter API / Filter Model — `https://www.ag-grid.com/javascript-data-grid/filter-api/`
- Custom Filter Components — `https://www.ag-grid.com/javascript-data-grid/component-filter/`
- Saving and Restoring State — `https://www.ag-grid.com/javascript-data-grid/grid-state/`

### bc-grid sources reviewed

- `packages/core/src/index.ts` — `BcColumnFilter`, `BcGridFilter`, `ServerColumnFilter`, `ServerFilterGroup`.
- `packages/react/src/filter.ts` — `buildGridFilter`, `matchesGridFilter`, `matchesTextFilter`, `matchesNumberFilter`, `matchesDateFilter`, `matchesSetFilter`, all encode/decode helpers, `setFilterValueKeys`.
- `packages/react/src/headerCells.tsx` — inline `renderFilterCell`, `FilterEditorBody`, `FilterPopup`, `TextFilterControl`, `NumberFilterControl`, `NumberRangeFilterControl`, `DateFilterControl`, `DateRangeFilterControl`, `SetFilterControl`.
- `packages/react/src/search.ts` — `matchesSearchText`, `normaliseSearchText`.
- `packages/react/src/bodyCells.tsx` — `splitSearchText`, `highlightSearchText`.
- `packages/react/src/persistence.ts` — `localStorage` reader/writer + `urlStatePersistence` reader/writer.
- `packages/react/tests/filter.test.ts` — 65 unit tests across build / decode / match.
- `packages/react/tests/persistence.test.ts` — `localStorage` + URL round-trip tests.
- `packages/react/tests/search.test.ts`, `searchHighlight.test.tsx`.
- `docs/api.md §3.2` (state pairs), `§4.3` (search), `§4.4` (filter shape), `§5.1` (`<BcGrid>` props).
- `docs/design/filter-registry-rfc.md` (Track 6 spec).
- `docs/design/chrome-rfc.md §Filters tool panel` (Track 5 spec).
- `docs/queue.md` Phase 6 Track 6 entries.

### Black-box demos consulted

- `apps/examples/src/App.tsx` — `?pagination=`, `?filterPopup=`, `?aggregations=`, `?edit=` flag-driven demos against the AR Customers ledger (5,000 rows × ~10 columns). No AG Grid demo was run.

### Confirmation

No AG Grid repository, fork, mirror, distribution bundle, or decompiled artefact was inspected for this audit. All AG Grid behaviour claims below are paraphrased from the public documentation URLs above.

---

## Where bc-grid is already better or more shadcn-native

These are genuine bc-grid advantages, not aspirational. Each one is rooted in an existing file or test.

### 1. Single canonical filter wire shape (`BcGridFilter = ServerFilter`)

bc-grid's client filter state and server filter wire shape are identical (`packages/core/src/index.ts:154` aliases `BcGridFilter` to `ServerFilter`). The same `ServerColumnFilter` / `ServerFilterGroup` flows through `buildGridFilter` (`packages/react/src/filter.ts:92`) into `onFilterChange` and out to a server-row-model consumer with no shape translation. Public AG Grid docs describe a separate `FilterModel` per filter type (text / number / date / set) with its own field names; consumers crossing client → server typically write a translation layer.

**Better:** zero translation; filter state is a single TypeScript discriminated union.

### 2. Modifier flags are first-class on the wire

`ServerColumnFilter.caseSensitive?: boolean` and `ServerColumnFilter.regex?: boolean` (`packages/core/src/index.ts:317-329`) live on the canonical filter shape — both flow into the predicate (`matchesTextFilter`) and into a server consumer's payload without escape encoding. Public AG Grid Text Filter docs expose `caseSensitive` as a column param and `textMatcher` as a JS callback; regex on / off is not a documented public toggle.

**Better:** flags travel through serialisation; consumers don't need a `textMatcher` callback to do regex.

### 3. JSON-encoded filter editor inputs round-trip without escape ambiguity

Filter editor state lives in `columnFilterText` as JSON-encoded `TextFilterInput` / `NumberFilterInput` / `DateFilterInput` / `NumberRangeFilterInput` / `DateRangeFilterInput` / `SetFilterInput` strings (`packages/react/src/filter.ts:23-60`). Values containing `|`, `:`, `,`, quotes, or newlines round-trip cleanly. Plain-string text inputs decode back to a `contains` shortcut for legacy callers (`decodeTextFilterInput` fallback at `packages/react/src/filter.ts:280`).

**Better:** no delimiter escape pitfalls in URL or `localStorage` payloads.

### 4. Set filter handles array-valued cells natively

`setFilterValueKeys` (`packages/react/src/filter.ts:509`) flattens array values, so a `tags: string[]` column auto-supports "match any tag in selection" without a custom comparator. AG Grid public docs cover array-of-strings cells through a `keyCreator` callback the consumer supplies.

**Better:** zero-ceremony array support; the same `keyCreator` callback is still acceptable for typed values.

### 5. shadcn-native theming, forced-colors, and 44px touch targets ship by default

`packages/theming/src/styles.css` exposes filter UI through CSS variables (`--bc-grid-filter-input`, `--bc-grid-filter-text-toggle`, etc.), maps every surface in `@media (forced-colors: active)`, and applies 44px hit targets in `@media (pointer: coarse)`. AG Grid ships its own theme system (`ag-theme-quartz`, `ag-theme-balham`); shadcn parity requires consumer CSS work or a custom theme.

**Better:** zero theme-work to slot bc-grid into a shadcn / Tailwind app.

### 6. Live-region announcements share one polite region across sort / filter / selection

`useLiveRegionAnnouncements` (`packages/react/src/gridInternals.ts`) drives a single `role="status"` element. `filterAnnounce(visibleRows, totalRows)` and `filterClearedAnnounce(totalRows)` (`packages/react/src/types.ts:52-53`) emit consistent text and dedupe rapid changes. Public AG Grid docs describe per-feature announcements; the central pipeline is a bc-grid choice that prevents over-talking screen readers when several filters change in quick succession.

**Better:** one polite region, debounced, deterministic message templates.

### 7. Empty-needle short-circuit at predicate level

`matchesTextFilter` (`packages/react/src/filter.ts:208`) returns `true` immediately when the needle is empty, regardless of operator / regex / case-sensitivity. No regex compile, no string lower-casing — the row is treated as a match without further work. Coupled with the build-time trim guard, blank inputs cost nothing to filter through.

**Better:** zero-cost cleared filters; no surprise narrowing on whitespace input.

### 8. Defense-in-depth on bad regex

A regex pattern that fails to compile is dropped at build time (`parseTextFilterInput` at `packages/react/src/filter.ts:372`) AND at match time (`matchesTextFilter` `try`/`catch` at line 213). A consumer that hand-builds a filter with a malformed pattern gets `false` from the predicate, never an exception.

**Better:** filter never throws; partial typing of an unfinished pattern doesn't blank out the row set.

### 9. Custom filter recipe + extension example shipped at v1

`apps/docs/src/pages/custom-filters.astro` ships a worked recipe for registering a consumer-defined filter type (`filter-custom-extension-example` task `[review: worker1 #177]` in `docs/queue.md:215`). AG Grid public docs cover custom filter components but the equivalent recipe lives in their docs site, not bundled with the framework.

**Better:** recipe is part of the bc-grid docs deployment.

### 10. Search highlighting is on by default

`splitSearchText` + `highlightSearchText` (`packages/react/src/bodyCells.tsx:341-365`) wrap matched substrings in `<mark data-bc-grid-search-match>` automatically when the consumer renders the default cell. AG Grid's public Quick Filter docs do not document a built-in match-highlighter for cell renderers — consumers wire their own.

**Better:** zero-config highlight from the moment `searchText` is non-empty.

---

## Parity (close enough for ERP workloads)

These behaviours match public AG Grid docs at the level v1.0 ERP consumers care about. Cosmetic differences exist; functional outcome is equivalent.

### Text filter operators

- bc-grid: `contains`, `starts-with`, `ends-with`, `equals`. Plus `caseSensitive` and `regex` modifier toggles.
- AG Grid public docs: `contains`, `not-contains`, `equals`, `not-equals`, `starts-with`, `ends-with`, `blank`, `not-blank`.
- **Parity status:** match for the four positional ops + case-sensitivity. **Gap:** bc-grid lacks `not-contains`, `not-equals`, `blank`, `not-blank` for text. (Filed as P2 below.)

### Number filter operators

- bc-grid: `=`, `!=`, `<`, `<=`, `>`, `>=`, `between`. Plus `number-range` convenience type that always emits `between`.
- AG Grid public docs: `equals`, `not-equals`, `less-than`, `less-than-or-equal`, `greater-than`, `greater-than-or-equal`, `in-range`, `blank`, `not-blank`.
- **Parity status:** match on all numeric comparisons. **Gap:** `blank` / `not-blank`. (P2.)

### Date filter operators

- bc-grid: `is`, `before`, `after`, `between`. Plus `date-range` convenience type.
- AG Grid public docs: `equals`, `not-equals`, `less-than` (before), `greater-than` (after), `in-range`, `blank`, `not-blank`.
- **Parity status:** match on the core comparisons. **Gap:** `blank` / `not-blank` and dynamic-date presets (`today`, `this-week`, etc. — RFC notes these but they're not implemented yet). (P2 / P3.)

### Set filter

- bc-grid: multi-select of distinct values; `in` / `not-in` / `blank` operators; lazy load on first open; array-valued cells supported natively.
- AG Grid public Set Filter docs: multi-select with "Select All" toggle (functionally equivalent to `in`), inverted selection (functionally `not-in`), and "(Blanks)" entry (functionally `blank`). Includes a "mini filter" search box inside the set-options popup.
- **Parity status:** functional parity on the operators. **Gap:** mini-filter search-within-options. (P1 below — the set filter on a column with thousands of distinct values is hard to navigate without it.)

### Boolean filter

- bc-grid: 3-state (`any` / `yes` / `no`).
- AG Grid public docs: handled via custom filter component (no built-in boolean filter type in Community).
- **Parity status:** bc-grid is slightly ahead — built-in.

### Floating filter / filter row

- bc-grid: inline filter row beneath the header is the default. Per-column popup variant via `column.filter.variant === "popup"` — header funnel button opens a `<FilterPopup>` with the same editor (`packages/react/src/headerCells.tsx:209-223`).
- AG Grid public docs: floating filters are an opt-in row beneath the header; popup filters are the default and floating filters mirror them.
- **Parity status:** match on both modes. bc-grid's two surfaces share editors; AG Grid's mirror them.

### Filter composition (multi-column)

- bc-grid: implicit AND across columns via `ServerFilterGroup { op: "and", filters: [...] }` when more than one column has an active filter. OR / nested groups are reachable through the `BcGridFilter` shape — consumers can hand-build groups.
- AG Grid public docs: implicit AND across columns; OR / mixed groups via the Filters Tool Panel or by setting the filter model directly.
- **Parity status:** match for the implicit-AND default; gaps in bc-grid's tool-panel UI (filed below).

### Quick filter (full-row search)

- bc-grid: `searchText` prop, controlled or uncontrolled; case-insensitive substring across `formattedValue` for every column with `column.filter !== false`. `<mark>` highlights inside the default cell renderer.
- AG Grid public Quick Filter docs: `quickFilterText` API; `cacheQuickFilter: true` opt-in for memoising the row's joined string; case-insensitive substring across cell display values.
- **Parity status:** match. AG Grid documents an opt-in cache for hot-path memoisation; bc-grid recomputes per row but the per-row cost is `String#includes` over a single concatenated string, which is fast enough at ~5,000 rows. (P3 perf hardening below.)

### Filter API (programmatic read / set)

- bc-grid: `BcGridApi.setFilter(filter)`, `props.filter` / `defaultFilter` / `onFilterChange` controlled-state pair. `filter` is a single `BcGridFilter` value.
- AG Grid public Filter API docs: `gridApi.setFilterModel(model)` / `getFilterModel()`. Per-column `gridApi.getFilterInstance(col).setModel(...)`.
- **Parity status:** match for read/set on the whole grid. Per-column filter-instance access is not a separate bc-grid API surface — consumers drive per-column state through `BcGridFilter`'s tree directly. That is a deliberate simplification, not a gap, but a consumer migration guide should call it out.

---

## Gaps

Triaged P0 → P3 with concrete bc-grid-native task suggestions. None of these reference AG Grid implementation; each is a behaviour observed in public docs that bc-grid hasn't matched yet.

### P0 — Demo / migration blockers

#### G-P0-1. Filter state persistence (URL + `localStorage`)

**Observed in public docs:** AG Grid Grid State docs cover `getState()` / `setState()` capturing filter model + sort + columns; the URL-state pattern is left to consumers but is widely documented in community examples.

**bc-grid current state:** `packages/react/src/persistence.ts` persists `columnState`, `pageSize`, `density`, `groupBy`, `sidebarPanel` only. Filter state is excluded. `urlStatePersistence` covers `columnState` + `sort` only. `docs/queue.md:216` lists `filter-persistence` as `[ready]`; coordinator's `coordinator/release-roadmap-and-clean-room-audits` branch (commits `3b3f455` and `5f24817`) is the rescue PR.

**Severity:** P0. Without persistence, consumer apps that already rely on AG Grid's `setFilterModel` round-trip will visibly regress when migrating.

**Proposed bc-grid-native task:** `filter-persistence` (already queued). Implement two backends in `packages/react/src/persistence.ts`:
- `localStorage` key `bc-grid:{gridId}:filter`, JSON-encoded `BcGridFilter`.
- URL search-param backend reusing the same `urlStatePersistence` opt-in.
Add a focused round-trip test in `packages/react/tests/persistence.test.ts`.

#### G-P0-2. Filters tool panel (sidebar UI)

**Observed in public docs:** AG Grid Filters Tool Panel docs describe a sidebar tab listing every column filter, with collapse/expand per column, a "Clear All" button, and inline editors mirroring the floating filter editor.

**bc-grid current state:** `docs/design/filter-registry-rfc.md:436` documents the design. `coordinator/release-roadmap-and-clean-room-audits` branch (commit `e3c9e76 feat: add filters tool panel`) ships the implementation, but it's not yet on `origin/main`.

**Severity:** P0 once `coordinator/release-roadmap-and-clean-room-audits` merges; will downgrade to "done" automatically. Tracking here so the audit is honest about main-branch state.

**Proposed bc-grid-native task:** none (in flight). If the in-flight PR slips, file `tool-panel-filters-rescue` on top of the existing `tool-panel-filters` task in `docs/queue.md:204`.

### P1 — High value before v0.2

#### G-P1-1. Set filter mini-filter (search within options)

**Observed in public docs:** AG Grid Set Filter docs describe an in-popup search box that filters the options list itself. Critical when a column has thousands of distinct values (e.g., customer name) — without it the popup becomes a wall of options.

**bc-grid current state:** `SetFilterControl` (`packages/react/src/headerCells.tsx`) renders the option list directly; no in-popup search.

**Severity:** P1. ERP workloads with high-cardinality categorical columns (tags, customer names, SKUs) will hit this immediately.

**Proposed bc-grid-native task:** `filter-set-mini-filter`. Add a `<input type="search">` at the top of `SetFilterControl`'s popover; filter the rendered options client-side by case-insensitive substring against the option's `label` (or `value` if `label` is absent). No public API change required — internal to the editor. Add 4 unit tests in `packages/react/tests/filter.test.ts` plus a focused render assertion. **Effort:** S.

#### G-P1-2. Multi-instance filter on the same column (two conditions joined by AND/OR)

**Observed in public docs:** AG Grid Text/Number/Date Filter docs describe a default of one condition per column with an opt-in to a second condition joined by AND or OR — surfaced via two adjacent editor instances and a small AND/OR toggle between them.

**bc-grid current state:** Every column filter is a single `ServerColumnFilter`. Composing two conditions on the same column requires consumer code to hand-build a `ServerFilterGroup`.

**Severity:** P1 for ERP. "Date is between 2026-01-01 and 2026-03-31 OR is between 2026-07-01 and 2026-09-30" (Q1 OR Q3) is a real ERP query.

**Proposed bc-grid-native task:** `filter-multi-condition`. Extend the inline + popup editors to optionally render a second editor for the same filter type plus an `AND` / `OR` joiner. The output goes into a `ServerFilterGroup` (already supported). Public-API addition is a per-column `column.filter.maxConditions?: 1 | 2` opt-in (default 1). **Effort:** M.

#### G-P1-3. Date dynamic / preset operators

**Observed in public docs:** AG Grid does not ship preset dynamic-date operators in Community; `filter-registry-rfc §date` lists `today`, `yesterday`, `this-week`, `this-month`, `this-year` as bc-grid intent.

**bc-grid current state:** Only `is`, `before`, `after`, `between` are implemented. Presets are documented in the RFC but no task in `docs/queue.md`.

**Severity:** P1 for ERP — "today's invoices" / "this week's open orders" is a daily filter shape.

**Proposed bc-grid-native task:** `filter-date-presets`. Add `today`, `yesterday`, `this-week`, `this-month`, `this-year`, `last-7-days`, `last-30-days` operators to `DateFilterOperator` and `DateFilterInput`. The operators carry no value (the predicate computes the window from `Date.now()`). The editor surfaces them in the operator dropdown above the value input; selecting a preset hides the value input. Locale-aware week boundaries via `Intl`. Add unit tests with a frozen `Date.now()`. **Effort:** S–M.

#### G-P1-4. Filter "buttons" mode (Apply / Reset / Clear / Cancel)

**Observed in public docs:** AG Grid Text/Number/Date Filter docs describe a `buttons` filter param that adds Apply / Reset / Clear / Cancel buttons inside the popup; without it (default) every keystroke immediately re-runs.

**bc-grid current state:** Filters apply on every editor change. There is no "stage and apply" mode.

**Severity:** P1. With server row models, every filter keystroke fires `loadPage` / `loadBlock` — without an Apply button the consumer has to debounce upstream. Already an issue in `BcServerGrid` consumers per `bsncraft` user reports we should solicit.

**Proposed bc-grid-native task:** `filter-apply-button-mode`. Per-grid prop `filterApplyMode?: "instant" | "manual"` (default `"instant"`). When `"manual"`, the editor's commit calls a staging callback and the popup grows an "Apply" + "Cancel" + "Clear" footer. Inline filter row gains the same footer when any column filter is staged. Live-region announces "Filter staged" on commit and "Filter applied" on apply. **Effort:** M.

### P2 — Polish before v0.3

#### G-P2-1. `not-contains` / `not-equals` for text; `blank` / `not-blank` for text / number / date

**Observed in public docs:** Standard AG Grid filter ops cover negation and blank testing across text / number / date.

**bc-grid current state:** None of these operators exist yet for the simple filter types. `set` already has `blank`.

**Severity:** P2. Workarounds exist (regex `^(?!.*needle)`, range bounds), but they're awkward.

**Proposed bc-grid-native task:** `filter-negation-and-blank`. Extend the operator unions:
- `TextFilterOperator`: add `"not-contains"`, `"not-equals"`, `"blank"`, `"not-blank"`.
- `NumberFilterOperator`: add `"blank"`, `"not-blank"`.
- `DateFilterOperator`: add `"is-not"`, `"blank"`, `"not-blank"`.
Predicates inside `matchesTextFilter` / `matchesNumberFilter` / `matchesDateFilter`. The blank predicate uses `value == null || (typeof value === "string" && value.trim() === "")`. **Effort:** S.

#### G-P2-2. `searchText` persistence

**Observed in public docs:** AG Grid's Quick Filter is included in `gridState`'s `quickFilter` field per Grid State docs.

**bc-grid current state:** `searchText` is a controlled prop; `defaultSearchText` exists but neither the URL nor `localStorage` backend persists it.

**Severity:** P2. Consumers can persist it themselves via `onSearchTextChange`, but it should round-trip alongside filter / column state for shareable links.

**Proposed bc-grid-native task:** `search-text-persistence`. Extend `urlStatePersistence` to include `searchText` under the same search param object; extend `localStorage` writer to include `bc-grid:{gridId}:searchText`. **Effort:** XS.

#### G-P2-3. Active-filter chip strip / status summary

**Observed in public docs:** AG Grid does not ship a built-in chip strip; the Filters Tool Panel surfaces active filters. The pattern is widely seen in shadcn-aware product apps.

**bc-grid current state:** No top-of-grid chip strip; the inline filter row shows active state per column. The status bar shows "{n} of {total}" via the `filtered` segment but doesn't enumerate which columns.

**Severity:** P2. shadcn-aware ERP apps often expect chips above the grid. Consumer can build one by reading `BcGridFilter`.

**Proposed bc-grid-native task:** `filter-chip-strip`. Optional `BcStatusBarSegment` `"activeFilters"` that renders a list of small chips, one per active `ServerColumnFilter`, with `×` to clear that column. Reuses the existing `BcStatusBarContext.filteredRowCount`. **Effort:** S.

#### G-P2-4. Per-filter `debounceMs`

**Observed in public docs:** AG Grid `filter-text` allows a `debounceMs` param.

**bc-grid current state:** Editor changes commit synchronously; consumers debounce upstream of `onFilterChange`.

**Severity:** P2. Useful for server-row-model consumers without an Apply button.

**Proposed bc-grid-native task:** `filter-debounce`. Per-column `column.filter.debounceMs?: number` (default 0). Implementation: a `setTimeout`-backed wrapper on the editor's `onFilterChange` callback inside `FilterEditorBody`. Cleared on unmount or operator change. **Effort:** S.

### P3 — Nice to have

#### G-P3-1. Quick-filter caching / per-row memoisation

**Observed in public docs:** AG Grid `cacheQuickFilter: true` memoises the joined formatted-value string per row to avoid recomputation when only the search needle changes.

**bc-grid current state:** `matchesSearchText` (`packages/react/src/search.ts:1`) recomputes the joined string on every row × search change.

**Severity:** P3. At 5,000 rows × ~10 columns the recompute is well under one frame; matters at 50k+ rows.

**Proposed bc-grid-native task:** `quick-filter-cache`. Memoise per-row `formattedValues.join(" ").toLowerCase()` keyed by `rowId` and the column-format snapshot; invalidate on row identity change. **Effort:** S; defer until a benchmark shows it's needed.

#### G-P3-2. Quick-filter cross-column tokenisation ("multi-word AND")

**Observed in public docs:** AG Grid Quick Filter docs describe whitespace-separated tokens that must each match somewhere in the joined string (logical AND).

**bc-grid current state:** `normaliseSearchText` lowercases and trims; `matchesSearchText` is a single `String#includes` call against the joined haystack — multi-word search behaves as a single substring match (typing "acme inc" matches only when the rendered text contains exactly "acme inc").

**Severity:** P3. Consumers typing two words separated by a space will be surprised when nothing matches.

**Proposed bc-grid-native task:** `quick-filter-tokens`. Split the trimmed needle on whitespace; require every non-empty token to appear in the joined haystack (`tokens.every(t => haystack.includes(t))`). Empty needle and quoted-phrase fallbacks unchanged. Update `matchesSearchText` test cases. **Effort:** XS.

#### G-P3-3. Per-column include-in-search opt-out (granularity)

**Observed in public docs:** AG Grid `getQuickFilterText` callback returns the searchable text per column, defaulting to the formatted value but consumers can omit columns from the search by returning empty.

**bc-grid current state:** A column is in the search iff `column.filter !== false` (`packages/react/src/grid.tsx:608`). There is no separate "filterable but not searchable" or "searchable but not filterable" toggle.

**Severity:** P3. Workaround: set `filter: false` and add the column back via custom `valueGetter`-driven derived columns.

**Proposed bc-grid-native task:** `column-search-opt-out`. Per-column `column.searchable?: boolean` defaulting to `column.filter !== false`. Decoupled from filterability. **Effort:** XS.

---

## Bugs found in bc-grid

None during this audit. The following are noted in case they help triage other audits:

- The empty-needle short-circuit in `matchesTextFilter` is correct (returns `true`) and verified by `packages/react/tests/filter.test.ts` "empty needle matches every row regardless of operator or modifier flags".
- `setFilterValueKeys` correctly handles arrays, objects with `rawValue`, and primitives; `packages/react/tests/filter.test.ts` "set filters match any raw array item for multi-value columns" covers the array case.
- Regex compile failure is rejected at both build time and match time; `packages/react/tests/filter.test.ts` "matchesTextFilter swallows regex compile errors at match time (defense-in-depth)" guards the latter.

---

## Non-goals / deferred

These are bc-grid choices that public AG Grid docs cover but bc-grid does not need for v1.0 / v0.3 ERP workloads.

- **Per-column `IFilterComp` interface lookalike.** bc-grid uses `column.filter.type` + a registry (`filter-registry-rfc.md`) — not a class-instance per column. Custom filters register a definition once; AG Grid's class-per-column model is a different architecture, not a feature we're missing.
- **`gridApi.getFilterInstance(col)` per-column handle.** Consumers manipulate filters through `BcGridFilter` (a JSON-shaped tree) rather than per-column imperative handles. Documenting this in the migration guide is enough.
- **Free-form filter expression language (`balance > 1000 AND status = "Open"` as a string).** Out of scope at v1; the `BcGridFilter` tree is the contract.
- **Cross-column filters (`columnA > columnB`).** Out of scope at v1 per `filter-registry-rfc §Non-Goals`. Custom filter type can do it via `valueGetter`.
- **Excel-style `=A1>5` formulas.** Out of scope per RFC.
- **Server-side custom filter predicates registered at runtime.** The `custom` filter type runs client-side at v1; server-side custom filters are a server-consumer contract, not bc-grid's responsibility.
- **AG Grid bug-for-bug compatibility.** Not a goal. Where AG Grid behaviour diverges from intuitive UX (e.g., set filter "Select All" inside a small dropdown without a search box on huge datasets), bc-grid will pick the better-UX choice.

---

## Recommended queue follow-ups

Concrete tasks to file once the coordinator agrees triage. Each is bc-grid-native and uses no AG Grid source-derived logic.

| Severity | Task slug | Files touched | Effort |
|---|---|---|---|
| P0 | `filter-persistence` (already queued; coordinator branch in flight) | `packages/react/src/persistence.ts` + tests + api.md §3.3 | S |
| P0 | `tool-panel-filters` (already queued; coordinator branch in flight) | `packages/react/src/sidebar.tsx` + new `filtersToolPanel.tsx` | M |
| P1 | `filter-set-mini-filter` | `packages/react/src/headerCells.tsx` `SetFilterControl` + tests | S |
| P1 | `filter-multi-condition` | `BcColumnFilter.maxConditions`, `FilterEditorBody`, predicate composition | M |
| P1 | `filter-date-presets` | `DateFilterOperator`, `DateFilterControl`, `matchesDateFilter` + tests | S–M |
| P1 | `filter-apply-button-mode` | `BcGridProps.filterApplyMode`, `FilterEditorBody`, `FilterPopup` | M |
| P2 | `filter-negation-and-blank` | All of `matchesTextFilter` / `matchesNumberFilter` / `matchesDateFilter` + ops + tests | S |
| P2 | `search-text-persistence` | `persistence.ts` + tests + api.md §3.3 | XS |
| P2 | `filter-chip-strip` | New `BcStatusBarSegment` "activeFilters" + render | S |
| P2 | `filter-debounce` | `BcColumnFilter.debounceMs`, `FilterEditorBody` wrapping | S |
| P3 | `quick-filter-cache` | `search.ts` memo cache | S |
| P3 | `quick-filter-tokens` | `matchesSearchText` token split | XS |
| P3 | `column-search-opt-out` | `BcColumnFilter` / column shape, search wiring | XS |

If the coordinator accepts this triage, P0 + P1 land in v0.2; P2 + P3 land in v0.3.

---

## Language discipline confirmation

The audit uses "match observed behavior", "implement a bc-grid-native approach", "public docs describe", "black-box behavior shows" throughout. It does not reference AG Grid implementation details, internal class names, or source-derived logic. Every gap proposes a bc-grid-native fix grounded in bc-grid types and files.
