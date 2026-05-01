# AG Grid parity audit — pinned columns, filters, sort motion, row chrome

**Date:** 2026-05-01
**Auditor:** worker4 (Claude)
**Scope:** Compare bc-grid against AG Grid Enterprise across four chrome-heavy surfaces: pinned columns, filters (inline row + popup + tool panel), sort motion, and row chrome (focus / selected / hover / active-cell). Output is a high-signal punch list with **v0.3 / v0.4 priority labels** and **likely bc-grid file pointers** for each finding so the queue can pick up follow-ups without re-running the audit.
**Audience:** coordinator + worker triage; v0.3 polish window and v0.4 planning.

---

## Methodology

- **AG Grid side:** public docs (`https://www.ag-grid.com/react-data-grid/`), public live demos (`https://www.ag-grid.com/example`), public configuration reference, public screenshots. **No AG Grid source code or internals were inspected**, per `AGENTS.md §3` golden rule 2 and `docs/coordination/ag-grid-clean-room-audit-plan.md`. Pattern inspiration only — never source-derived implementation.
- **bc-grid side:** read end-to-end against the named source files below (current state on `origin/main` as of the audit date). Behaviour assertions are cross-referenced against `docs/api.md`, `docs/design/*-rfc.md`, the `packages/react/tests/` suite, and the `packages/theming/tests/` suite.
- **No browser runs / no Playwright / no axe scans.** Workers do not run those locally; this audit is doc-level pattern inspection.
- **No source-level edits in this PR.** Findings are queued; product changes happen in their own task PRs (with the right owner, since some files in this audit are explicitly coordinator-owned — flagged inline below).

Severity scale (after `editing.md` precedent): **P0** ship-blocker for v0.3 release, **P1** v0.3 polish, **P2** v0.4 candidate, **P3** post-v1 backlog.

---

## 1. Pinned columns

### bc-grid today

- **Surface classes:** `.bc-grid-cell-pinned-left` / `.bc-grid-cell-pinned-right` (assigned by `pinnedClassName` in `packages/react/src/gridInternals.ts`); `.bc-grid-cell-pinned-left-edge` / `.bc-grid-cell-pinned-right-edge` on the seam edge cell.
- **Tokens:** `--bc-grid-pinned-bg`, `--bc-grid-pinned-header-bg`, `--bc-grid-pinned-row-hover-bg`, `--bc-grid-pinned-row-focused-bg`, `--bc-grid-pinned-row-selected-bg`, `--bc-grid-pinned-row-selected-hover-bg`, `--bc-grid-pinned-active-cell-bg`, `--bc-grid-pinned-selected-active-cell-bg`, `--bc-grid-pinned-boundary` — the per-row-state opacity contract.
- **Boundary shadow:** `.bc-grid-cell-pinned-left-edge::after` and `.bc-grid-cell-pinned-right-edge::before` paint a `linear-gradient(... var(--bc-grid-pinned-boundary), transparent)` seam keyed off `data-scrolled-left` / `data-scrolled-right` data-attrs on the grid root.
- **Public API:** `column.pinned: "left" | "right" | null` plus `BcGridApi.setColumnPinned(columnId, side)`. Pin state participates in `BcGridLayoutState` (`initialLayout` / `onLayoutStateChange`) and persistence (`gridId` localStorage / `urlStatePersistence`).
- **Ownership:** rendering code in `packages/react/src/grid.tsx` and `packages/react/src/bodyCells.tsx` is **coordinator-owned**; theming + audits are worker territory.

### AG Grid public-surface reference

AG Grid pins via `pinned: 'left' | 'right'` (`https://www.ag-grid.com/react-data-grid/column-pinning/`) and ships these patterns observable from public docs + the live demo:

- Pinned cells render as **fully opaque surfaces** at every row state (default / hover / selected / focused). No body-text bleed-through during horizontal scroll.
- A **"shadow on the seam"** appears only when the user has scrolled past the seam horizontally — a deliberate cue that the column is sticky, not just at the edge of the data.
- Pinned columns participate in the **column-state save/restore** model (column tool panel can drag-pin, header context menu has Pin Left / Right / Unpin items).
- **Pin while reordering** — when the user drags a column into a pinned section in the column tool panel, AG Grid live-reflows. `bc-grid` parity-checks here are mostly behavioural rather than visual.
- Header cells in pinned regions paint a different shade than body cells (`--ag-header-background-color`) but stay opaque against scrolled content the same way.

### Gaps + acceptance criteria

#### 1.1 [v0.3 / P1] Pinned-column boundary shadow lacks a "double-shadow at very wide pin" treatment

bc-grid's seam is one 8px gradient on the edge cell. AG Grid's wider pinned regions read deeper because the shadow is two-step (inner darker, outer fade). At narrow pin counts this difference is invisible; at >2 pinned columns on each side it reads as flat in bc-grid.

**Acceptance:** keep the existing single-gradient as the base contract; layer a softer inner shadow when the pinned region is ≥160px wide (data-attribute hook `data-pinned-deep` on the grid root, set from React based on resolved pin widths). Theming-test pins the rule.
**Likely files:** `packages/theming/src/styles.css` (additive rule), `packages/react/src/grid.tsx` (data-attr emission — coordinator-owned).
**Coordinator-owned:** rendering side. Worker can ship the CSS rule + theming test only; the React data-attr emission goes through coordinator.

#### 1.2 [v0.3 / P1] Pinned columns don't expose a `data-pinned` attribute for consumer CSS

Consumers can target `.bc-grid-cell-pinned-left` / `.bc-grid-cell-pinned-right` but not the row-level state ("this row contains a pinned cell"). Simple custom themes that want a different selected-row treatment for pinned rows have to chain selectors through the cell.

**Acceptance:** add `data-bc-grid-row-pinned="left" | "right" | "both" | "none"` on `.bc-grid-row` so consumers can target the row directly. No-op for unpinned grids. Theming-test pins the attribute presence.
**Likely files:** `packages/react/src/bodyCells.tsx` (coordinator-owned). Worker queues the design note; coordinator wires the attribute.
**Severity rationale:** P1 because consumers are working around it today by reading the cell pin classes.

#### 1.3 [v0.4 / P2] No pinned-column drag-resize affordance separate from non-pinned

Pinned columns share the resize handle behaviour with the rest of the grid. AG Grid renders a slightly stronger affordance on the *seam edge* (pinned-right column's left handle, pinned-left column's right handle) so users can rebalance the pin without scrolling. bc-grid's seam-edge handle has the same visual weight as any other.

**Acceptance:** when the resize handle sits on a pinned-edge column, render the handle with a `data-bc-grid-pin-edge` attribute and a slightly stronger `--bc-grid-pinned-boundary` colour (still subtle — see UI quality gate §2.2). Theming-test pins the attribute + a colour-not-default invariant.
**Likely files:** `packages/react/src/headerCells.tsx` (coordinator-owned), `packages/theming/src/styles.css`.

#### 1.4 [v0.4 / P2] Public API for pin-while-reordering inside the columns tool panel

`BcGridApi.setColumnPinned` exists; the columns tool panel surfaces drag-to-reorder but not drag-to-pin. AG Grid's columns tool panel ships a `pinned` drop zone where you can drag a column into "pinned left" / "pinned right" / "unpinned" buckets.

**Acceptance:** add a `pinned` drop zone to the columns tool panel with three buckets. Drop inside a bucket calls `BcGridApi.setColumnPinned(columnId, side)`. Keyboard-accessible (Space to grab, Arrow to move between buckets, Enter to drop). Tests cover the pure helper + the markup contract.
**Likely files:** `packages/react/src/columnToolPanel.tsx`, `packages/react/src/columnVisibility.tsx`. **Worker can own this** — not coordinator-owned.
**Public API:** additive (no breaking change).

#### 1.5 [v0.4 / P2] Pinned-column header context menu lacks Pin Left / Pin Right / Unpin items by default

Public column commands (`pin-column-left`, `pin-column-right`, `unpin-column`) ship via PR #234 / #281, but they're **opt-in**. AG Grid's default header context menu surfaces them automatically.

**Acceptance:** consumers can keep the opt-in default, but the docs grow a "recipe for matching AG Grid's default pin-aware column menu" snippet. Cross-link from `docs/api.md §5.1` and `packages/react/README.md` "Context menu column commands". No code change.
**Likely files:** `docs/api.md`, `packages/react/README.md`. **Worker-owned**, docs only.

---

## 2. Filters

### bc-grid today

- **Inline row:** `column.filter: { type: "text" | "number" | "date" | "set" | "boolean" }` renders inline editor cells in `.bc-grid-filter-row` with `bc-grid-filter-input` + the per-type body. Variants: `inline` (default for text / number / date with a single input) and `popup` (funnel button on header opens `<FilterPopup>` for set / advanced operators).
- **Popup:** `<FilterPopup>` in `packages/react/src/headerCells.tsx` (anchored via `computePopupPosition` from `internal/popup-position.ts`); same `FilterEditorBody` used by the filters tool panel.
- **Tool panel:** `<BcFiltersToolPanel>` in `packages/react/src/filterToolPanel.tsx` lists active filters with per-column inline editor + Clear chip + header-level Clear all. Funnel SVG empty state via `internal/panel-icons.tsx`.
- **Public API:** `column.filter`, `BcGridApi.getFilter()`, `BcGridApi.clearFilter(columnId?)`, `clear-column-filter` / `clear-all-filters` context-menu built-ins, `filter` / `defaultFilter` / `columnFilterText` / `setColumnFilterText` / `clearColumnFilterText` props, `showFilterRow` / `showFilters` toggle, `BcGridFilter` and `BcColumnFilter` types.
- **Inline-row toggle contract** is hardened via PR #284 (filter-row-toggle-contract-v040).

### AG Grid public-surface reference

AG Grid splits filters by **column-level filter** (`https://www.ag-grid.com/react-data-grid/filtering-overview/`) into three places observable from public docs:

1. **Floating filter row** — like bc-grid's inline row. One quiet input per cell. Operator dropdown / regex / case toggles live behind a popup, not crammed into the cell. Public default is a single text input or a custom floating-filter component.
2. **Filter menu / popup** — opened from the column-menu kebab or the filter-icon trigger on the header. Carries advanced operator selectors (`Equals` / `Not equals` / `Contains` / `Starts with` / `Ends with` / `Less than` / `Greater than` / `In range`), value pickers, and the Apply / Clear / Reset chrome. Public docs show the kebab and funnel icons separately — kebab opens the column menu (sort + pin + filter + columns); funnel opens the filter-only popup.
3. **Filters tool panel** — sidebar panel with one expandable card per column, mirroring the menu's controls per column. Public docs call this `agFiltersToolPanel`.

AG Grid's set filter (`https://www.ag-grid.com/react-data-grid/filter-set/`) ships virtualised value lists, search, and "Select all" / partial-tristate behaviour out of the box. Date filter and number filter expose the operator list as a `<select>` paired with one or two value inputs.

### Gaps + acceptance criteria

#### 2.1 [v0.3 / P0] Inline filter row must not regress to crammed operator dropdowns

UI quality gate §2.1 hard-rejects this. The filter row today is single-input-per-cell; verify (and pin) that the contract holds for new filter types.

**Acceptance:** add a theming-test invariant asserting `.bc-grid-filter-row .bc-grid-filter-text-toggle` (case / regex toggles) only appears inside a popup variant — never in the inline row. Same for the operator dropdown selectors. Pure CSS-string assertion; no behaviour change.
**Likely files:** `packages/theming/tests/theming.test.ts` (new invariant); pin existing markup pattern in `packages/react/src/headerCells.tsx`.
**Severity rationale:** P0 because the bar is explicit in the gate and cell crowding is the most common visual regression in filter work.

#### 2.2 [v0.3 / P1] Filter popup needs `data-bc-grid-filter-type="<type>"` attribute on the popup root

bc-grid's popup carries `data-state="open"` and `data-side` / `data-align` (per the popup-interaction-contracts work). It does **not** carry the filter type as a hook. Consumers who want to theme set-filter popups differently from text-filter popups have to inspect the children's classes — fragile across filter shape changes.

**Acceptance:** add `data-bc-grid-filter-type="text" | "number" | "date" | "set" | "boolean"` on the `<FilterPopup>` root. SSR markup test pins the attribute. No public behaviour change; theming layer can opt in.
**Likely files:** `packages/react/src/headerCells.tsx` (FilterPopup component — coordinator-owned for the markup edit). Worker queues the design note.

#### 2.3 [v0.3 / P1] Set filter ships without virtualization and without "Select all"

The current `set` filter (`packages/filters/src/index.ts` plus `packages/react/src/headerCells.tsx` `FilterEditorBody`) renders the full option list inline. For high-cardinality sets (>200 distinct values) this paints the whole list at once.

**Acceptance:** virtualise the set-filter option list (reuse `@bc-grid/virtualizer`). Add a "Select all" / "Clear" header pair inside the popup. AT-friendly: `aria-multiselectable="true"` on the listbox, per-option `aria-selected` toggles, indeterminate-state `aria-checked="mixed"` when partial.
**Likely files:** `packages/react/src/headerCells.tsx` (FilterEditorBody set body), `packages/filters/src/index.ts` (option-list helpers), `packages/react/src/filterToolPanel.tsx` (mirror in panel).
**Severity rationale:** P1 — set-filter is in v0.3 scope; perf compounds at scale.
**Tests:** virtualization measurement, the markup contract for Select all, the indeterminate state.

#### 2.4 [v0.4 / P2] Number / date filter operator UI is bare

Today the inline row supplies one input; the popup variant supplies the operator selector + one input. AG Grid's number filter offers `Equals` / `Not equals` / `Less than` / `Greater than` / `Less than or equal` / `Greater than or equal` / `In range` / `Blank` / `Not blank` with `In range` switching to two inputs. bc-grid covers `equals` + `range` (number) and `equals` (date) — gaps exist.

**Acceptance:** extend `BcColumnFilter['number']` and `['date']` to expose the AG Grid public-pattern operator set. Inline row: keep one input per cell (gate §2.1 — operator stays in popup). Popup: operator `<select>` + value inputs. Persist operator choice through `gridId` localStorage. Theming-test pins the popup operator-selector class hook.
**Likely files:** `packages/filters/src/index.ts` (predicate helpers), `packages/react/src/headerCells.tsx` (operator UI in popup), `docs/api.md` (filter type docs).
**Public API:** additive — existing filter shapes keep working.

#### 2.5 [v0.4 / P2] Filter tool panel doesn't surface "Apply later" / pending-filter UX

AG Grid's filter popup has an `applyMiniFilter` mode where the user types and the filter applies live, vs an `applyButton: true` mode where the user types into the popup and clicks Apply. bc-grid's popup applies live (everything is a single-input controlled). Some ERP workloads (large datasets, expensive filter predicates) prefer Apply-button mode.

**Acceptance:** add `column.filter.applyMode: "live" | "button"` (default `"live"`). When `"button"` the popup grows an Apply button that's the only commit point; the input stays draft until Apply. Filter-row stays live. Tests cover both paths.
**Likely files:** `packages/react/src/headerCells.tsx` (FilterEditorBody), `packages/react/src/filter.ts` (state machine), `docs/api.md`.

#### 2.6 [v0.3 / P1] Filters tool panel cards lack open/closed disclosure

`<BcFiltersToolPanel>` lists every active filter as a flat card. AG Grid's panel renders each column's filter as an *expandable* card (closed by default, click to expand and edit). For grids with 30+ filterable columns the flat list overwhelms the panel.

**Acceptance:** wrap each `.bc-grid-filters-panel-item` in a `<details>`-based disclosure (or button + `aria-expanded` pattern) keyed off the filter being active. Active filters auto-expand on render; inactive collapse. Maintain ARIA contract (Space / Enter to toggle). Theming-test pins the disclosure class + the auto-expand-when-active rule.
**Likely files:** `packages/react/src/filterToolPanel.tsx`, `packages/theming/src/styles.css`, `packages/theming/tests/theming.test.ts`. **Worker-owned.**

---

## 3. Sort motion

### bc-grid today

- **Sort state:** `BcGridSort[]` with `columnId` + `direction: "asc" | "desc"`. Multi-sort via Shift+click. Clearing via clicking through the third state (asc → desc → none).
- **Motion:** the FLIP animation lives in `packages/react/src/gridInternals.ts` (`rowFlipSnapshot`, `rowFlipCandidate`, `cancelActiveSortAnimations`, `flipBudget`). PR #290 (sort-flip-stability-v040) hardened: translate-only (no scale), stale-cancellation when sort fires again mid-FLIP, safe-skip when row identity / virtualization / size changes invalidate the snapshot.
- **Reduced-motion:** the `*` reduced-motion rule in `packages/theming/src/styles.css` zeroes transitions globally; the FLIP itself respects motion preferences.
- **Live-region:** sort changes announce through the polite-region template in `BcGridMessages` (`accessibility-rfc §Live Regions`).

### AG Grid public-surface reference

AG Grid's sort transitions (public docs + live demo):

- **Default = no animation.** Sort changes update row order instantly. The user re-orients via the columns and the visible header arrow, not via row motion.
- **`animateRows: true`** opts into row motion. Translate-only, ~200ms ease-out, no opacity, no scale. Grid skips animation when row count is high or rows changed structurally.
- **Sort indicator** is a small arrow in the header cell — appears on sortable columns; secondary index for multi-sort.
- **Stale-cancellation invariant** is implicit but observable: rapid sort changes don't queue or jank.

bc-grid's sort animation already matches the AG Grid pattern at the contract level. The gaps are smaller-grained.

### Gaps + acceptance criteria

#### 3.1 [v0.3 / P0] Document the public motion contract

Workers don't know whether to use `transition: transform` or `@keyframes` when adding row-related motion; PR #290 implies the answer (translate-only, FLIP-driven) but it's not in the api.md or design doc.

**Acceptance:** add a "Sort & row motion" subsection to `docs/api.md` that names the public contract: translate-only transforms, automatic stale-cancellation, safe-skip on row identity / virtualization / size changes, reduced-motion respect via the theming layer's `*` rule, polite-region announcement on sort change. No code change.
**Likely files:** `docs/api.md`. **Worker-owned**, docs only.
**Severity rationale:** P0 because workers proposing motion changes need this written down.

#### 3.2 [v0.3 / P1] Multi-sort secondary indicator missing on sort headers

AG Grid renders a small numeric badge ("1", "2", "3") next to each sorted column's arrow when multi-sort is active, so users can see which column is primary. bc-grid renders the arrow but no rank.

**Acceptance:** when `sortState.length > 1`, render a small numeric index next to the arrow on each sorted column header. Token-driven (`var(--bc-grid-muted-fg)`). SSR markup test pins the rank presence + the data attribute hook (`data-bc-grid-sort-rank`).
**Likely files:** `packages/react/src/headerCells.tsx` (coordinator-owned for the JSX edit; worker queues the design note).

#### 3.3 [v0.4 / P2] Sort animation doesn't budget for large row counts

`flipBudget` exists in `gridInternals.ts` but is internal. AG Grid's `animateRows: true` is silently disabled at very high row counts to prevent jank; bc-grid's behaviour is the same in practice but the threshold is not exposed.

**Acceptance:** expose `BcGridProps.sortAnimation: "auto" | "always" | "never"` (default `"auto"`). `"auto"` = current `flipBudget` heuristic; `"always"` = bypass budget (consumers with small grids who want consistent motion); `"never"` = disable entirely. Persist consumer choice through `gridId` localStorage. Tests cover the three modes.
**Likely files:** `packages/react/src/gridInternals.ts`, `packages/react/src/grid.tsx`, `docs/api.md`. **Coordinator-owned** (animation system).
**Public API:** additive.

#### 3.4 [v0.4 / P2] Sort animation has no `prefers-reduced-data` opt-out

The reduced-motion path is covered. `prefers-reduced-data` (the experimental media query) suggests users on low-end devices might benefit from auto-disabling FLIP regardless of motion preference.

**Acceptance:** add a media query `@media (prefers-reduced-data: reduce)` in the theming layer that mirrors reduced-motion's transition-zeroing for the FLIP-targeted classes only. Theming-test pins the media-query existence. Behaviour: FLIP becomes a no-op snap; AT users still get the polite announcement.
**Likely files:** `packages/theming/src/styles.css`, `packages/theming/tests/theming.test.ts`. **Worker-owned** (CSS only).
**Severity rationale:** P2 because `prefers-reduced-data` is not yet broadly shipped; defensive cleanup.

#### 3.5 [v0.3 / P1] Sort indicator (arrow) needs intentional design rather than a Unicode glyph

If bc-grid is rendering the arrow as `↑` / `↓` / Unicode characters, that fails UI quality gate §2.5 (no text-glyph icons — SVG via shared `internal/*` modules). Audit-only finding; verify against the current source.

**Acceptance:** if the arrow is a Unicode glyph, replace with an SVG glyph in `internal/header-icons.tsx` (the existing module). Theming-test pins the SVG presence + the rotation rule applies to the SVG only. If already SVG, log "no-op" in the next audit pass.
**Likely files:** `packages/react/src/headerCells.tsx`, `packages/react/src/internal/header-icons.tsx` (both **coordinator-owned**). Worker queues the design note + readme audit.
**Verification:** worker greps for sort indicators in `headerCells.tsx` to determine current state before queueing.

---

## 4. Row chrome (focus / selected / hover / active cell)

### bc-grid today

- **Hover:** `.bc-grid-row:hover` paints `var(--bc-grid-row-hover)`. Pinned variant: `--bc-grid-pinned-row-hover-bg`.
- **Focused row:** `.bc-grid-row[data-bc-grid-focused-row="true"]` (the row containing the active cell). Cell-level rule: `.bc-grid-row[data-bc-grid-focused-row="true"] .bc-grid-cell` paints `color-mix(... var(--bc-grid-focus-ring) 7%, var(--bc-grid-bg))`. Pinned variant: `--bc-grid-pinned-row-focused-bg`.
- **Selected row:** `.bc-grid-row[aria-selected="true"]` paints `var(--bc-grid-row-selected)` + `color: var(--bc-grid-row-selected-fg)`. Selected + hover, selected + focused, selected + focused + active-cell all have layered variants in `packages/theming/src/styles.css`.
- **Active cell:** `.bc-grid-cell:focus-visible` / `[data-bc-grid-active-cell="true"]` paints `color-mix(... var(--bc-grid-focus-ring) 8%, ...)` + `outline: 2px solid var(--bc-grid-focus-ring)`. Pinned variants: `--bc-grid-pinned-active-cell-bg` / `--bc-grid-pinned-selected-active-cell-bg`.
- **Public API:** `selection` / `defaultSelection` / `onSelectionChange` props, `BcGridApi.getSelection() / setSelection()`, the `data-bc-grid-focused-row` / `aria-selected` / `data-bc-grid-active-cell` attribute family. Polish landed via PR #296 (row-focus-selection-chrome-v040).

### AG Grid public-surface reference

AG Grid public docs (`https://www.ag-grid.com/react-data-grid/row-selection/`, `https://www.ag-grid.com/react-data-grid/keyboard-navigation/`) and demos:

- **Hover** is a quiet bg shift. AG Grid uses `--ag-row-hover-color`. Pinned cells follow.
- **Selected** rows paint `--ag-selected-row-background-color` (a soft accent tint, similar to bc-grid's `--bc-grid-row-selected`).
- **Active cell** (the focused single cell) paints a focus-ring outline + a slight bg shift. Identical to bc-grid's idiom.
- **Multi-row selection with checkbox column** — bc-grid ships `selectionColumn.tsx`. Parity at the visual level.
- **Range selection** — bc-grid ships range-overlay. AG Grid's range UI is similar in idiom.
- **Keyboard navigation** — Arrow keys move active cell, Shift+Arrow extends range, Home / End row-scoped. Both grids match.
- **Row hover signal does not bleed across pinned columns** — when scrolled horizontally, pinned cells maintain their pinned-row-hover bg even though they're pinned. bc-grid does this through `--bc-grid-pinned-row-hover-bg`.

### Gaps + acceptance criteria

#### 4.1 [v0.3 / P0] Row chrome state precedence is documented in code, not user-facing docs

PR #296 set the precedence (selected > focused > hover > default; selected+focused > selected; active-cell paints over the row state). The contract is in CSS comments and the theming-test invariants but isn't in `docs/api.md`. Consumers asking "what does selected vs focused look like?" have to read the stylesheet.

**Acceptance:** add a "Row & cell chrome state precedence" subsection to `docs/api.md` with a small table — state, what paints, which token. Cross-link from `packages/react/README.md`. No code change.
**Likely files:** `docs/api.md`, `packages/react/README.md`. **Worker-owned**, docs only.
**Severity rationale:** P0 because selection / focus is the most user-visible chrome and consumers asking how to override the tokens need the answer documented.

#### 4.2 [v0.3 / P1] Striped-row option missing

AG Grid offers `--ag-odd-row-background-color` and `gridOptions.rowClassRules` to alternate row backgrounds. Some ERP grids (long lists with many similar columns) read better with zebra striping. bc-grid has no striped-row token / option.

**Acceptance:** add an opt-in `BcGridProps.rowStriping?: boolean` (default `false`) plus `--bc-grid-row-stripe-bg` token. CSS rule: `.bc-grid-row:nth-of-type(even)` when the grid has `data-bc-grid-row-striping="true"`. Pinned-cell variant: `--bc-grid-pinned-row-stripe-bg` so pinned columns alternate too. Hover / selected / focused override striping (precedence). Theming-test pins the rule + the precedence.
**Likely files:** `packages/theming/src/styles.css`, `packages/theming/tests/theming.test.ts`, `packages/react/src/grid.tsx` (data-attribute emission — coordinator-owned), `docs/api.md`.
**Public API:** additive.

#### 4.3 [v0.4 / P2] No `aria-rowindex` / `aria-rowcount` on virtualised rows

AG Grid sets `aria-rowindex` on each row (the absolute row number, not the virtualizer index) and `aria-rowcount` on the grid root. Screen-reader users get the "row 47 of 200" announcement. bc-grid's accessibility-rfc covers ARIA roles (`grid`, `row`, `gridcell`) but the rowindex/rowcount are not pinned in tests as of this audit.

**Acceptance:** verify the current emission; if missing, emit `aria-rowindex` per row (1-based, accounting for header rows) and `aria-rowcount` on the grid root (= filtered row total + header row count). Tests cover the grid wrapper attribute + a sample row's attribute.
**Likely files:** `packages/react/src/grid.tsx` (coordinator-owned), `packages/react/src/bodyCells.tsx` (coordinator-owned). Worker queues the design note + verification.

#### 4.4 [v0.4 / P2] Row-level `data-bc-grid-row-state="default" | "loading" | "error"` for async row-level UX

`BcRowState` carries `pending` / `error`. Cell-level we render the per-cell-state markers (dirty / pending / invalid stripes). Row-level there's no surface that the row is in flight or errored.

**Acceptance:** add `data-bc-grid-row-state="default" | "loading" | "error" | "dirty"` attribute on the row element, computed from the per-row state aggregate. Theming layer ships a default treatment (loading: muted background pulse on `prefers-reduced-motion` no-op; error: inset 3px border on the row's leading edge using `--bc-grid-invalid`). SSR markup tests pin the attribute; theming-test pins the rules.
**Likely files:** `packages/react/src/bodyCells.tsx` (coordinator-owned), `packages/theming/src/styles.css`, `packages/theming/tests/theming.test.ts`.
**Public API:** additive (the attribute, not behaviour).

#### 4.5 [v0.4 / P3] Group-row chrome inconsistent with row chrome

Group rows (when `groupBy` is set) get their own header-like chrome (`.bc-grid-row-group`). The hover / selected / focused state precedence on group rows is inherited from the regular row rules but not explicitly tested. AG Grid's public demo shows group rows with a slightly lighter-weight hover than data rows.

**Acceptance:** explicit group-row hover / focused / selected rules with a tested precedence. Group rows shouldn't be selectable for delete-actions per existing UX, so selected-state may be a no-op — verify and pin.
**Likely files:** `packages/theming/src/styles.css`, `packages/theming/tests/theming.test.ts`. **Worker-owned**.
**Severity rationale:** P3 — defensive cleanup; not user-blocking.

---

## 5. Summary punch list

Sorted by severity within each release window. **W** = worker-ownable; **C** = coordinator-owned (animation / pinned / header rendering paths).

### v0.3 — P0 ship-blockers

| # | Finding | Owner | Files |
|---|---|---|---|
| 2.1 | Pin "no operator dropdown in inline filter row" theming-test invariant | W | `packages/theming/tests/theming.test.ts` |
| 3.1 | Document sort & row motion contract in `docs/api.md` | W | `docs/api.md` |
| 4.1 | Document row & cell chrome state precedence in `docs/api.md` | W | `docs/api.md`, `packages/react/README.md` |

### v0.3 — P1 polish

| # | Finding | Owner | Files |
|---|---|---|---|
| 1.1 | Pinned-region "deep" inner shadow at ≥160px pin width | W (CSS) + C (data-attr) | `packages/theming/src/styles.css`, `packages/react/src/grid.tsx` |
| 1.2 | `data-bc-grid-row-pinned` attribute on `.bc-grid-row` | C | `packages/react/src/bodyCells.tsx` |
| 2.2 | `data-bc-grid-filter-type` on `<FilterPopup>` root | C | `packages/react/src/headerCells.tsx` |
| 2.3 | Set-filter virtualization + Select all + indeterminate state | C + W (panel mirror) | `packages/react/src/headerCells.tsx`, `packages/filters/src/index.ts`, `packages/react/src/filterToolPanel.tsx` |
| 2.6 | Filters tool panel cards as `<details>` disclosure (auto-expand active) | W | `packages/react/src/filterToolPanel.tsx`, `packages/theming/src/styles.css`, `packages/theming/tests/theming.test.ts` |
| 3.2 | Multi-sort secondary index badge on sorted headers | C | `packages/react/src/headerCells.tsx` |
| 3.5 | Verify sort arrow is SVG glyph (not Unicode) | C | `packages/react/src/headerCells.tsx`, `packages/react/src/internal/header-icons.tsx` |
| 4.2 | Striped-row opt-in (`rowStriping` prop + `--bc-grid-row-stripe-bg` token) | W (CSS) + C (data-attr) | `packages/theming/src/styles.css`, `packages/react/src/grid.tsx`, `docs/api.md` |

### v0.4 — P2 candidates

| # | Finding | Owner | Files |
|---|---|---|---|
| 1.3 | Pinned-edge resize handle stronger affordance | C | `packages/react/src/headerCells.tsx`, `packages/theming/src/styles.css` |
| 1.4 | Columns tool panel pin drop zone (drag-to-pin) | W | `packages/react/src/columnToolPanel.tsx`, `packages/react/src/columnVisibility.tsx` |
| 1.5 | Docs recipe for "default pin-aware column menu" | W | `docs/api.md`, `packages/react/README.md` |
| 2.4 | Number / date filter operator set parity | W | `packages/filters/src/index.ts`, `packages/react/src/headerCells.tsx`, `docs/api.md` |
| 2.5 | `column.filter.applyMode: "live" | "button"` opt-in | W | `packages/react/src/headerCells.tsx`, `packages/react/src/filter.ts`, `docs/api.md` |
| 3.3 | `BcGridProps.sortAnimation: "auto" | "always" | "never"` | C | `packages/react/src/gridInternals.ts`, `packages/react/src/grid.tsx`, `docs/api.md` |
| 3.4 | `prefers-reduced-data` opt-out for FLIP | W | `packages/theming/src/styles.css`, `packages/theming/tests/theming.test.ts` |
| 4.3 | `aria-rowindex` / `aria-rowcount` audit + emission | C | `packages/react/src/grid.tsx`, `packages/react/src/bodyCells.tsx` |
| 4.4 | `data-bc-grid-row-state` + theming defaults | C (data-attr) + W (CSS) | `packages/react/src/bodyCells.tsx`, `packages/theming/src/styles.css` |

### Post-v1 / P3 backlog

| # | Finding | Owner | Files |
|---|---|---|---|
| 4.5 | Group-row chrome state precedence | W | `packages/theming/src/styles.css`, `packages/theming/tests/theming.test.ts` |

---

## 6. What this audit is *not*

- **Not a redesign.** Every finding maps to an additive or token-driven polish on the existing chrome. None proposes throwing out the bc-grid model for an AG-Grid-shaped one.
- **Not a substitute for `docs/coordination/ag-grid-clean-room-audit-plan.md`.** That doc owns the audit-process guardrails (allowed inputs, output structure under `docs/audits/ag-grid-comparison/YYYY-MM-DD-<area>.md`). This doc complements it — a *triage* across four chrome surfaces, with a punch list. Per-area deep-dives that need new files belong in `docs/audits/ag-grid-comparison/`.
- **Not a license to lift AG Grid source.** Every reference here is from public docs / public examples / public screenshots. Never run `git clone https://github.com/ag-grid/...`. If a finding requires inspecting AG Grid internals, downgrade severity and queue a behaviour-only verification instead.
- **Not actionable without the UI quality gate.** Every UI-polish item must pass `docs/coordination/ui-quality-gate.md` §2 hard rejection criteria. Findings that imply controls in narrow header cells, loud accents, or motion that morphs text fail the gate before they reach review.

---

## 7. Next steps

The coordinator picks up this punch list during v0.3 polish triage. Suggested order:

1. **Land the three P0 docs items** (2.1, 3.1, 4.1) immediately — they're worker-ownable and unblock other work.
2. **Worker-only P1 polish** (2.6 filters tool panel disclosure; 4.2 striped-row token) ship in their own PRs without coordinator gating.
3. **Coordinator-owned P1** (1.2, 2.2, 2.3, 3.2, 3.5) bundled into a "v0.3 chrome touch-ups" coordinator PR if scope permits.
4. **v0.4 candidates** triaged after v0.3 release; the `rowStriping` (4.2) and `applyMode` (2.5) probably top the priority list because they're most user-visible.

Each follow-up that ships should write a one-line update under the relevant numbered finding here (`status: shipped via #PR`), so the audit stays usable.
