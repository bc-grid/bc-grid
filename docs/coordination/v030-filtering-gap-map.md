# v0.3.0 Filtering / Search / Persistence — Gap Map

**Date:** 2026-05-01
**Author:** worker4 (Claude)
**Doc type:** **planning / coordination only — not an implementation task.**
**Audience:** coordinator triage when v0.2 closes out and v0.3 planning starts.

This doc maps the v0.3.0 milestone (per `release-milestone-roadmap.md`) against the current `main` after `#200` / `#202` / `#203` / `#157` / `#204` and the still-open filtering / search / persistence PRs.

The v0.3 milestone goal: **complete the day-to-day data finding workflow.** Six gates from the roadmap:

1. Text, number/range, date/range, boolean, set, and multi-value filters are implemented and covered.
2. Popup filter variant and filters tool panel are merged, accessible, and documented.
3. Filter state persists through URL and `localStorage` where configured.
4. Search applies to the row model and highlights matches without breaking virtualization.
5. Custom filter extension recipe is published in docs.
6. `bsncraft` can exercise the common customer/vendor/invoice filter flows without local patches.

## 1. Already done on `main`

Filter / search / persistence work that has merged into `main` and is covered by tests where the package coverage gate applies.

### Filter types & UI

- **Text filter** (inline `bc-grid-filter-input`, `op: "contains"` only) — original `column-filter` (#32). Still default in `buildGridFilter`.
- **Number filter UI** (#109) — operators `=` / `!=` / `<` / `<=` / `>` / `>=` / `between`.
- **Number-range filter** (`f6a5c52`) — dedicated min/max inline UI.
- **Date filter UI** (#116) — operators `is` / `before` / `after` / `between`. Locale-safe (#125).
- **Date-range filter** (`62606a0`) — dedicated from/to inline UI with shadcn date picker.
- **Boolean filter UI** (#91) — three-state any / yes / no.
- **Set filter** (`0da721f` + `6612ade` for array values) — multi-select distinct values, lazy-loaded on first open. Covers `op: "in"` / `"not-in"` / `"blank"`.

### Filter chrome

- **Popup filter variant** (#145) — `column.filter.variant === "popup"` swaps the inline-row input for a header funnel + floating popover that reuses the inline editor body. Active state, clear, click-outside, Escape-to-close.
- **Filter row visibility prop** (#203) — `BcGridProps.showFilterRow?: boolean` to hide the inline filter row entirely (e.g., when every column is popup-variant).
- **Filters tool panel rescue** (#204) — sidebar panel listing active filters with inline-editable variants and a clear-all button.
- **Filter clear state** (#200) — `onFilterChange` correctly emits `null` when the user clears the filter.

### Search

- **Search-highlighting** (#64) — default cell renderer wraps matched runs in `<mark data-bc-grid-search-match>` (case-insensitive substring on `formattedValue`).
- **Search-complete** (#98) — `searchText` actually filters the row model (case-insensitive substring across `valueFormatter` results for searchable columns per `api.md §4.3`).

### Persistence

- **localStorage gridId persistence** (#73) — `columnState` / `pageSize` / `density` / `groupBy` / `sidebarPanel` persist by `gridId`.
- **URL state for column-state + sort** (#97) — encoded into `urlStatePersistence.searchParam`.
- **Filter persistence** (#193, rescue) — `filter` joins the persistence schema for both URL and `localStorage`. URL takes precedence over `localStorage` on mount; the cell renderer's inline filter inputs rehydrate via `columnFilterTextFromGridFilter`.

### Localisation / a11y

- **Filter strings localised through `BcGridMessages`** (#191 wcag-code-pass) — `filterPlaceholder`, `filterMinPlaceholder`, `filterMaxPlaceholder`, `filterAriaLabel({ columnLabel })`. No hardcoded English in `headerCells.tsx` for the filter row.

## 2. In review (open PRs)

Filtering / search / persistence PRs awaiting coordinator review or rebase.

| PR | Title | Status | v0.3 gate touched |
|---|---|---|---|
| **#208** `filter-text-impl-extend` | rescue: operators (`contains` / `starts-with` / `ends-with` / `equals`) + `caseSensitive` toggle + `regex` toggle | UNSTABLE CI | Gate 1 — text filter completeness |
| **#196** AG Grid filtering audit | `2026-05-01-filtering.md` | UNSTABLE CI | (audit / planning input) |
| **#211** docs: tool panel discoverability | onboarding doc for filters + columns tool panels | UNSTABLE CI | Gate 2 — documented |
| **#170** `feat: extend text filter operators` | older worker2 branch | DIRTY | **Likely superseded by #208;** coordinator decides which one to merge |
| **#206** rescue tool panel examples polish | examples app integration | DIRTY | Gate 6 — bsncraft / examples readiness |
| **#184** wire tool panels into examples | examples app integration | DIRTY | Gate 6 |
| **#179** add filters tool panel | older worker5 branch | DIRTY | **Likely superseded by #204** (already merged) |
| **#177** filter custom extension example | recipe in apps/docs | (queue: review) | Gate 5 — custom filter recipe |

**Coordinator triage recommended on the four DIRTY PRs** (#170, #206, #184, #179). At least #170 and #179 look superseded; #206 and #184 may also be superseded by #204's tool panel rescue path.

## 3. Still missing

Surface that's neither merged nor open as a PR. Each item maps to a v0.3 gate.

### Filter types

- **Text-filter operator extension** (gate 1) — `contains` is the only text op live on main. `#208` covers the extension (operators + caseSensitive + regex). **Until #208 merges, gate 1 is open.**
- **Multi-value (array column) filter** (gate 1) — distinct from the set filter (which displays distinct *values* of a string/scalar column). Multi-value operates on rows whose value is itself an array (e.g., `tags: ["urgent", "billable"]`), with `in` / `not-in` / `intersects` / `contains-all`. The queue lists `filter-multi-impl` (#175 in review per queue, but not visible as a current open PR — needs verification). **Probably needs reclaim.**
- **Custom filter type registration** (gate 5) — `BcReactFilterDefinition` declared in `filter-registry-rfc` (PR #48, merged) but no consumer-facing recipe lives in `apps/docs` yet. #177 is queued for review; verify still mergeable.

### Filter chrome

- **Filters tool panel coverage in examples** (gate 6) — the rescue (#204) ships the panel; #184 / #206 are example-app integration. Until those merge, the examples site doesn't actually mount the panel.
- **Filter "clear all" affordance outside the tool panel** (gate 2) — the tool panel has a clear-all button. The popup-variant has a clear-`×` per filter. The inline filter row has no global clear-all today. Minor; not necessarily a v0.3 blocker.

### Search

- **Searchable-column scoping prop** (gate 4) — `api.md §4.3` says "across `valueFormatter` results for searchable columns". `column.filter !== false` is the current proxy for "searchable"; consumers can't yet pick a different scope without setting `filter: false` (which also hides the filter input). A dedicated `column.searchable?: boolean` would close this. **Documented gap; not yet a queue task.**
- **Search debounce / async-aware search** (gate 4) — `searchText` is consumer-controlled; bc-grid filters synchronously on each prop change. For server-mode grids that want "debounce 250ms then refetch with the search text", the consumer wires their own debounce today. Acceptable for v0.3; document.

### Persistence

- **URL + localStorage `searchText`** (gate 3 / 4 intersection) — `searchText` is a controlled prop today; bc-grid does not persist it. Filter / sort / column-state persist; search doesn't. ERPs commonly bookmark "this customer search". **Recommend a `search-persistence` queue task.**
- **Per-grid search-param namespacing** (gate 3) — `urlStatePersistence.searchParam` is one key holding a JSON blob. Consumers wanting one-key-per-state (e.g., `?customers_filter=...&customers_sort=...`) for shareability / readability don't have an option today. Documented gap; could be follow-up after v0.3.
- **Persistence schema migration** (gate 3) — when the persistence shape changes between bc-grid versions, the read path silently drops malformed entries. There's no migration step / version stamp on the persisted JSON. **Recommend a small `persistence-schema-version` queue task** before more state lands in v0.4+.

### Custom filter extension

- **Recipe doc** (gate 5) — see the `filter-custom-extension-example` queue entry; verify #177 is still alive. If it's stale, write fresh.
- **Filter registry tests** (gate 5) — the registry RFC is merged but the registry isn't unit-tested at the React layer beyond the built-ins. Adding a "register, validate, persist, restore" round-trip test for a custom filter type would harden the surface for v0.4 consumers.

### bsncraft validation

- **bsncraft filter cutover smoke** (gate 6) — the v0.3 gate explicitly says "bsncraft can exercise the common customer/vendor/invoice filter flows without local patches". Until the consumer integration runs, this gate isn't satisfied — this is the kind of step the coordinator (or maintainer) runs after merging the v0.3 work, not something a worker can validate.

## 4. v0.3 blockers — recommended cut

Of the open / missing items above, here is the recommended set that **must merge** before v0.3 can be cut:

| # | Item | PR | Gate |
|---|---|---|---|
| 1 | Text-filter operator extension (operators + caseSensitive + regex) | **#208** (open, rebase pending) | 1 |
| 2 | Filter custom extension recipe in `apps/docs` | **#177** (verify) | 5 |
| 3 | Filters tool panel actually mounted in the examples app | **#184** + **#206** (verify; one of them likely supersedes the other) | 2, 6 |
| 4 | Tool panel discoverability docs | **#211** | 2 |
| 5 | Multi-value (array column) filter | `filter-multi-impl` queue task — verify #175 | 1 |
| 6 | bsncraft filter cutover smoke | (coordinator-driven) | 6 |

**Not blockers for v0.3** (acceptable as v0.4+ follow-ups, documented in §3):

- Search-text URL + localStorage persistence — doesn't block the v0.3 milestone gate as written. Consumer can do this themselves.
- Per-grid search-param namespacing — niche.
- Persistence schema migration — preventative; recommend before v0.4 not for v0.3.
- Searchable-column scoping prop — column.filter:false works as a proxy.
- Inline-row "clear all" affordance — popup + tool panel both have clear paths.
- Async-aware search debounce — consumer-owned today; document and move on.

## 5. Concrete next tasks

Suggested queue.md entries, sized + suggested-owner per the existing convention.

### Filters

- **`filter-text-impl-extend-rescue`** (P0, **S**) — coordinator decision to either rebase + merge **#208** or write a fresh implementation. **Owner:** worker2 (filter-adjacent expertise) or coordinator if #208 just needs a rebase. **Closes gate 1.**
- **`filter-multi-impl-rescue`** (P1, **M**) — verify the state of #175; if dead, restart on a fresh branch. Multi-value (array column) filter with `in` / `not-in` / `intersects` operators. **Owner:** worker1 (filter-set-impl history). **Closes gate 1's multi-value bullet.**
- **`filter-custom-extension-example-rescue`** (P1, **S**) — verify #177; refresh if stale. Recipe in `apps/docs/src/pages/` (sibling to `editor-custom-recipe.astro`). Walks the `BcReactFilterDefinition` registration path end-to-end including persistence shape. **Owner:** worker4 (recipe-doc convention from `editor-custom-recipe`) or worker3 (chrome / docs). **Closes gate 5.**
- **`filter-clear-all-inline-row`** (P3, **XS**) — small icon-button at the end of the inline filter row that clears every active filter at once. Pairs with the existing tool-panel and popup clears. **Owner:** worker5 (filter-adjacent UX work).

### Search

- **`search-persistence`** (P1, **S**) — extend `PersistedGridState` and `UrlPersistedGridState` to include `searchText`. Same shape / precedence rules as the existing `filter` persistence (URL > localStorage on mount; consumer-controlled wins). **Owner:** worker4 (filter-persistence-rescue history). Mirror the test pattern from `packages/react/tests/persistence.test.ts` already in place.
- **`column-searchable-scope`** (P2, **XS**) — additive `BcReactGridColumn.searchable?: boolean` (default: `column.filter !== false`). Decouples "searchable" from "filterable". **Owner:** worker2 (column-state expertise).
- **`search-debounce-docs`** (P3, **XS**) — docs note in `apps/docs` describing the recommended consumer pattern for debounced search against a server-mode grid. No code; pure docs. **Owner:** any.

### Persistence

- **`persistence-schema-version`** (P1, **S**) — version-stamp the persisted JSON; add a migration helper that reads the legacy unstamped shape, returns a stamped one, drops nothing silently. Pairs with the `tools/release-preflight` discipline (catch breaking changes at release time). **Owner:** worker4 (release-preflight + persistence rescue history).
- **`persistence-namespace-mode`** (P3, **M**) — opt-in per-state-key URL params (`?customers_filter=...&customers_sort=...`). Additive prop on `BcGridProps.urlStatePersistence`. **Owner:** worker2 (URL-state expertise). Out of scope for v0.3.

### Tool panel / examples

- **`tool-panel-examples-integration`** (P0, **S**) — coordinator decision between #184 and #206; merge whichever is alive. **Owner:** worker5 (tool-panel rescue history). **Closes gate 6's "examples mount the panel" bullet.**
- **`tool-panel-discoverability-docs`** (P1, **S**) — verify **#211** still applies after the rescue stack landed; rebase if needed. **Owner:** worker3 or worker5.

### bsncraft validation

- **`bsncraft-v030-filter-smoke`** (P0, coordinator-driven) — once v0.3 candidate is built, install in `~/work/bsncraft`, exercise the customer/vendor/invoice filter flows that the v0.3 milestone names. Document any patches required; if any are still required, cycle back. **Owner:** coordinator (cross-repo work; not a worker task).

## 6. v0.3 readiness call (today)

**Not ready.** Of the recommended blockers in §4:

- #208 has UNSTABLE CI; needs rebase or fresh rescue.
- #177 needs verification (queue says review; not visible in current `gh pr list` snapshot).
- #184 / #206 need coordinator triage (one likely supersedes the other; both DIRTY).
- #211 needs rebase (UNSTABLE CI).
- `filter-multi-impl` (#175 per queue) needs verification.
- bsncraft smoke can't run until the candidate is built.

When the recommended blocker set in §4 lands and bsncraft validation passes, the v0.3 milestone is closeable. Until then this is documentation, not a release recommendation.

## 7. Inputs

- `docs/coordination/release-milestone-roadmap.md` (v0.3 milestone definition).
- `docs/queue.md` (current task ownership / status).
- `gh pr list` snapshot (open PR titles + merge status as of 2026-05-01).
- Git log for `packages/react/src/{filter.ts, headerCells.tsx, persistence.ts, search.ts}` (merged history on `main`).
- bc-grid source: `packages/react/src/filter.ts` (filter type coverage), `packages/react/src/persistence.ts` (filter / column-state persistence), `packages/react/src/headerCells.tsx` (filter chrome).

This doc does **not** look at AG Grid behaviour — `2026-05-01-filtering.md` (PR #196) owns that comparison.

## 8. What this doc is NOT

- **Not a v0.3 readiness call.** §6 says "not ready"; the cut belongs to a future coordination session.
- **Not an implementation PR.** Docs only; no source / test / theming changes.
- **Not authoritative on PR triage.** §2's "likely superseded" calls are coordinator decisions; the verifications in §5 ("verify #X") flag them.
- **Not a substitute for the AG Grid filtering audit.** PR #196 owns that. This doc cross-references public AG Grid expectations only via the milestone gates.
