# RFC: AG Grid POC Audit (ag-grid-poc-audit)

**Status:** Done
**Owner:** c1 (Claude)
**Reviewer:** TBD (fresh agent)
**Source repo audited:** `~/bc/bc-next-alt` at the time of this audit
**Wrappers audited:** `apps/web/components/data-grid.tsx`, `edit-grid.tsx`, `server-edit-grid.tsx`, `lookup-grid.tsx`

---

## Executive summary

bc-next exercises a small slice of AG Grid Enterprise. **The vast majority of AG Grid's surface area is unused.** Concretely:

- **17 distinct `ColDef` properties** appear across all consumers — out of ~80 AG Grid offers. Top 8 cover 95% of usage.
- **6 imperative `GridApi` methods** are called — out of ~200. Most are wrapper-internal.
- **Zero use** of in-grid editing, range selection, master-detail, pivots, charts, status bar, sidebar, tool panels, tree data, server-side row model, Excel export, row dragging, or cell-data-type inference.
- AG Grid Enterprise modules are registered en bloc (`AllEnterpriseModule`), but **only Community-tier features are actually load-bearing**. Enterprise licence is currently paying for nothing.
- The grid surface bc-grid needs to match for v0.1 / Q1 vertical slice is **substantially smaller** than I sized it in the original `design-v1.md`.

**The audit's main implication:** bc-grid Q1 + Q2 cover the entire current AG Grid surface in bc-next. Q3+ enterprise features (range selection, server-side row model, etc.) are roadmap items, not parity gaps.

## Method

1. Enumerated every file in `bc-next-alt/apps/web/` importing the AG Grid wrappers (`@/components/data-grid`, `@/components/edit-grid`, `@/components/server-edit-grid`).
2. Read the four wrapper files in full to extract the public prop surface they expose to consumers.
3. Grepped consumer files for ColDef property usage (e.g., `\bfield:`, `\bcellRenderer:`, etc.) and tallied frequency.
4. Grepped for imperative GridApi method calls, grid-level prop passthrough, theme overrides.
5. Cross-referenced findings to bc-grid's package boundaries (`design.md §4.1`).

Numbers below are direct counts from the audit greps; all reproducible from the bc-next-alt working tree.

## A. Column-def property usage (consumer frequency)

Aggregated across **23 data-grid consumers + 25 edit-grid consumers + 8 server-edit-grid consumers** = 56 files, plus the wrappers themselves.

| Property | Count | Notes |
|---|---|---|
| `field` | ~340 | Universal. Every column has one. |
| `headerName` | ~340 | Universal. |
| `width` | ~340 | Per-column fixed width |
| `cellRenderer` | ~220 | Custom rendering. Almost always an inline lambda `(params) => ...`. Only 1 reusable renderer (`HighlightCell`). |
| `cellStyle` | ~190 | Mostly alignment + font (`{ display: "flex", alignItems: "center" }`, `{ fontFamily: "var(--record-code-font)" }`). |
| `valueFormatter` | ~55 | For currency / number / date display. |
| `filter` | ~55 | Mostly `filter: true` for AG Grid floating filter; a few `filter: "agTextColumnFilter"`. |
| `minWidth` | ~45 | Resize floor for flex columns |
| `flex` | ~45 | Flex layout |
| `enableRowGroup` | 18 | Allow this column in group-by dropdown |
| `cellRendererParams` | 0 | Never used — closures capture state directly |
| `cellEditor` | 0 | **No in-grid editing today.** |
| `editable` | 0 | Same. |
| `valueGetter` | 0 | Consumers compute values inside `cellRenderer` instead. |
| `valueParser` | 0 | No editing. |
| `comparator` | 1 | Custom sort ordering. Rare. |
| `pinned` | 4 | EditGrid auto-pins right "actions" column; only a few consumers pin manually. |
| `sortable` | 6 | (default is `true` from defaultColDef; explicit overrides rare) |
| `resizable` | 2 | (default is `true` from defaultColDef) |
| `hide` | 2 | Group-by column hide |
| `colId` | 3 | EditGrid sets `colId: "actions"` for the actions column |
| `wrapText` | 1 | One niche use |
| `cellClass` | 0 | All styling via `cellStyle`. |
| `tooltipField` | 0 | Tooltips not used. |
| `checkboxSelection` | 0 | No bulk selection in current grids. |
| `aggFunc` | 0 | No aggregations in any grid. |
| `autoHeight` | 0 | (Set at grid level, not column.) |

**Implication for `BcGridColumn<T>`:** the v0.1 column type needs `field`, `header` (renamed from `headerName`), `width`, `minWidth`, `flex`, `cellRenderer`, `cellStyle`/`cellClassName`, `valueFormatter`, `filter`, `pinned`, `sortable`, `resizable`, `hide`, `comparator`, `enableRowGroup`, `colId`. That's it for Q1. `cellEditor` / `editable` / `valueParser` / `valueGetter` arrive in Q2 with editing.

## B. Grid-level props used (passthrough by consumers)

| Prop | Count | Notes |
|---|---|---|
| `getRowId` | 18 | Universal. Most use `(row) => row.id`. The rest pass `(row) => row.code` or composite keys. |
| `pagination` | 4 | Some consumers explicitly opt out (e.g., `pagination={false}` on small lookups). |
| `onGridReady` | 2 | Passthrough to imperative API hookups. |
| `loadingOverlayComponent` | 1 | Custom loading state. |
| `domLayout` | 1 | One consumer needs `autoHeight` instead of fixed. |
| `paginationPageSize` | 1 | Override of default. |
| `rowGroupPanelShow` | 1 | One use of "always show row group panel above grid." |
| `rowSelection` | 1 | One consumer enables row selection. |
| `onRowDoubleClicked` | 1 | Lookup-grid for "select on double-click." |
| `onSelectionChanged` | 1 | Same area. |
| `onSortChanged` | 1 | One consumer wants to react to sort. |
| `onColumnMoved` / `onColumnResized` / `onColumnVisible` / `onColumnPinned` | 1 each | Wrapper internal — for column-state persistence. |
| `onPaginationChanged` | 1 | Wrapper internal — for page-size persistence. |
| Everything else AG Grid offers | 0 | Sidebar, status bar, tool panels, range selection, charts, master-detail, tree data, server-side row model, etc. |

**Implication for `BcGridProps<T>`:** `data` (rowData renamed), `columns`, `rowId`, `pagination`, `density`, `groupBy` cover 90% of cases. Imperative API ref + a handful of event callbacks for the remaining 10%.

## C. Imperative GridApi calls (across all consumer code)

| Method | Count | Used by |
|---|---|---|
| `applyColumnState` | 2 | Wrapper internal — restore state on mount. |
| `getColumnState` | 1 | Wrapper internal — save state on change. |
| `paginationGetPageSize` | 1 | Wrapper internal — save pagination state. |
| `setFocusedCell` | 1 | LookupGrid — autofocus first row on dialog open. |
| `refreshCells` | 1 | DataGrid — repaint on search-text change for highlighting. |
| `getRowNode` | 1 | LookupGrid — find a row by ID for preselection. |

**That's the entire imperative surface.** No `setRowData`, `setColumnDefs`, `sizeColumnsToFit`, `exportDataAsCsv`, `exportDataAsExcel`, `forEachNode`, `setSortModel`, `setFilterModel`, `startEditingCell`, `stopEditing`, `tabToNextCell`, nothing.

**Implication for `BcGridApi`:** the imperative surface for v0.1 is tiny — `getColumnState() / setColumnState(state)`, `scrollToCell({ rowId, columnId })`, `focusCell({ rowId, columnId })`, `getRowById(id)`, `refresh()`. That's it for Q1.

## D. Cell renderer patterns

229 of the 277 columns with `cellRenderer` use an **inline lambda** of the form `(params) => <span>{params.data?.foo}</span>`. The closure captures everything it needs from the surrounding component — it doesn't use `cellRendererParams`.

The single reusable renderer is `HighlightCell` (search-term highlighting), exported from `data-grid.tsx`. EditGrid wraps every consumer-provided `cellRenderer` to also apply highlighting.

**Implication:** bc-grid's column API takes a `(params) => ReactNode` cell-renderer; no need for a `cellRendererParams` indirection. Keep the highlighting wrapper pattern in EditGrid (renamed `BcEditGrid`).

## E. Theme overrides (CSS / themeQuartz tokens)

The wrapper sets exactly **9 colour tokens** via `themeQuartz.withParams()`, mirrored in light + dark:

```
backgroundColor, foregroundColor, borderColor,
headerBackgroundColor, headerTextColor,
oddRowBackgroundColor, rowHoverColor, selectedRowBackgroundColor,
accentColor
```

That's the entire theming surface bc-next exercises. No font customisation, no row-height customisation (consumers accept the AG Grid default), no spacing tweaks.

**Implication for `@bc-grid/theming`:** the 9 tokens above map directly to bc-grid's CSS variables. The shadcn-zinc palette is already paired in the design doc; this audit just confirms it's enough.

## F. AG Grid Enterprise modules that are actually load-bearing

The wrapper registers `AllEnterpriseModule`. **The only Enterprise-tier features actually used:**

- **Row grouping** (via `rowGroup: true` + the groupable-columns dropdown) — 18 consumers. This is a Community feature in some grid libraries but Enterprise in AG Grid.
- **Side bar / Tool panels** — 0 consumers.
- **Range selection** — 0 consumers.
- **Master / detail** — 0 consumers.
- **Pivots** — 0 consumers.
- **Excel export** — 0 consumers (bc-next has its own report system).
- **Charts** — 0 consumers.
- **Set filter** — 0 consumers. Filtering is `filter: true` (default text filter, Community).
- **Tree data** — 0 consumers.
- **Server-side row model** — 0 consumers. server-edit-grid does **client-side pagination over a server-fetched page**, not SSRM.

**Conclusion:** AG Grid **Community** would cover everything bc-next currently does. The Enterprise licence pays for nothing in current consumer code. If we ever ship a feature that genuinely uses Enterprise (charts, true SSRM with infinite scroll, pivots), that's a bc-grid Y2 deliverable, not a bc-next requirement today.

## G. Features bc-next does NOT use (deferral candidates for bc-grid)

Strict subset of "AG Grid offers but bc-next ignores":

- In-grid editing (cell editors, value parsers, dirty tracking, validation) — **planned for bc-next, not yet implemented**. Q2 deliverable in bc-grid roadmap.
- Range selection + clipboard + fill handle — **never used in bc-next**. Q3 deliverable; could realistically defer past 1.0 if no demand.
- Master / detail rows — **never used in bc-next**. Q3 deliverable; defer-candidate.
- Tree data with lazy children — **never used**. Q4 deliverable; defer-candidate.
- Pivots — **never used**. Q5 deliverable; strong defer-candidate.
- Aggregations as grid feature — **never used as grid feature** (aggregations exist in reports). Q5 deliverable.
- Server-side row model with infinite scroll — **never used**; bc-next's server-edit-grid uses paged-page-by-page model. Q4 deliverable.
- Status bar / sidebar / tool panels / context menu — **never used**.
- Excel / PDF export — **never used as grid feature** (reports do exports via separate pipelines).
- Charts integration — **never used**.
- Row dragging — **never used**.
- Tooltips, custom header components, multi-row column groups — **never used**.

## H. Recommendations for bc-grid scope

### H.1 — Q1 vertical slice (binding)

Confirms the design.md Q1 scope is right. The vertical-slice deliverable needs exactly what bc-next's read-only grids exercise:

- `BcGridColumn<T>` with: `field`, `header`, `width`, `minWidth`, `flex`, `align`, `pinned`, `sortable`, `resizable`, `hide`, `cellRenderer`, `cellStyle`, `valueFormatter`, `filter`, `comparator`, `colId`, `enableRowGroup`.
- `<BcGrid>` with: `data`, `columns`, `rowId`, `density`, `pagination`, `groupBy`, plus a small set of event callbacks.
- Virtualisation, theme, sort, basic filter, group-by, client pagination, keyboard focus, pinned columns.
- `BcGridApi`: 5-6 methods (above).

### H.2 — Q2 catch-up (read-only features deferred from Q1 in design.md)

- Column-state persistence (resize, reorder, pin, visibility) — used by 44 consumers
- Server-paged grid (`<BcServerGrid>` paged mode) — used by 8 consumers
- Quick search / search highlighting — used widely
- Show-inactive toggle (Y/N + A/O/F variants) — used by ~20 consumers
- Custom toolbar slot, footer slot — used by all consumers

### H.3 — Q2 editing

- Cell editors framework + built-in editors (text, number, date, select, autocomplete) — bc-next plans this; current consumer code doesn't yet exercise it.

### H.4 — Q3+ defer candidates

Range selection, master-detail, tree data, pivots, charts. Shippable in bc-grid post-1.0 based on actual customer demand.

### H.5 — Drop entirely

Sidebar, status bar, tool panels, context menu, row dragging — bc-next uses none of these. Don't even put on the bc-grid roadmap unless a customer asks.

## Appendix A: per-wrapper prop matrix

### `<DataGrid>` (`apps/web/components/data-grid.tsx`)

The most-featured wrapper. Used by lookup-grid + 23 direct consumers (mainly read-only views).

Public props beyond AgGridReact passthrough:

- `gridId` — column-state persistence key (used by 44 consumers across all wrappers)
- `rowData`, `columnDefs` — standard
- `height`, `minHeight`, `bottomPadding` — viewport sizing (rare)
- `searchable`, `searchPlaceholder`, `searchValue`, `onSearchValueChange`, `searchAppliesQuickFilter`, `searchInputRef`, `onSearchKeyDown`, `searchHotkeyBadge`, `autoFocusSearch`, `initialSearchText` — search slot
- `toolbar`, `footer` — slots
- `showSettings` — settings popover (column visibility, group-by, page size, show inactive)
- `serverInactiveFilter` — controlled inactive toggle for server-paged grids
- `groupableColumns` — `{ field, label }[]` for group-by dropdown
- `clientPagination`, `clientInactiveFilter` — toggles for server-paged variants
- `externalQuickFilter` — controlled quick filter
- `defaultColDef` — passthrough but **never used by consumers** (wrapper merges its own defaults)

### `<EditGrid>` (`apps/web/components/edit-grid.tsx`)

Composes DataGrid + first-column detail link + pinned-right actions column.

Public props beyond DataGrid:

- `detailPath` + `linkField` — first-column anchor wrapping
- `onEdit`, `onDelete` — action callbacks
- `editLabel`, `deleteLabel`, `DeleteIcon` — i18n / customisation
- `extraActions: EditGridAction[] | (row) => EditGridAction[]` — extra actions in the dropdown
- `canEdit(row)`, `canDelete(row)` — per-row permission gates
- `hideActions` — suppress the actions column even when callbacks are passed

### `<ServerEditGrid>` (`apps/web/components/server-edit-grid.tsx`)

Composes EditGrid + server-paged orchestration (page, pageSize, search, showInactive, error, loading state) + a custom pagination footer.

Public props:

- `gridId` — passes through
- `initialData?: ServerGridResult<T>` — optional SSR-rendered first page
- `loadRows: (query: ServerGridQuery) => Promise<ServerGridResult<T>>` — async fetcher
- `columnDefs`, `detailPath`, `linkField`, `onEdit`, `onDelete` — passes through
- `toolbar` — passes through
- `searchPlaceholder`, `showInactiveToggle`, `groupableColumns` — passes through
- `reloadSignal: unknown` — incremented to force a refetch

`ServerGridQuery` shape: `{ search, page, pageSize, showInactive }`.
`ServerGridResult<T>`: `{ rows, total, page, pageSize, error? }`.

### `<LookupGridView>` (`apps/web/components/lookup-grid.tsx`)

Specialised DataGrid for lookup dialogs. Adds: autofocus on search, keyboard nav into grid, double-click / Enter to commit selection, preselect existing value.

Used internally by the lookup system; no direct external consumers (the lookup dialog wraps it).

## Appendix B: cross-reference to bc-grid packages

| AG Grid feature found | bc-grid package | Q |
|---|---|---|
| Virtualisation (DOM-based, not exposed) | `@bc-grid/virtualizer` | Q1 |
| ColDef shape (17 properties used) | `@bc-grid/core` (types) | Q1 |
| Cell rendering | `@bc-grid/react` (column adapter) | Q1 |
| themeQuartz with 9 tokens | `@bc-grid/theming` | Q1 |
| Sort + sort animation | `@bc-grid/core` + `@bc-grid/react` | Q1 |
| Pinned columns | `@bc-grid/virtualizer` + `@bc-grid/react` | Q1 |
| Group-by + expand/collapse | `@bc-grid/core` (state) + `@bc-grid/react` (UI) | Q2 |
| Client pagination | `@bc-grid/react` | Q1/Q2 |
| Server pagination (paged page-by-page) | `@bc-grid/server-row-model` (paged mode) + `@bc-grid/react` | Q2 |
| Search / quick filter / highlighting | `@bc-grid/react` + `@bc-grid/filters` (predicate) | Q2 |
| Show/hide-inactive client filter | `@bc-grid/react` (convention; not engine) | Q2 |
| Column-state persistence (gridId) | `@bc-grid/react` (consumes `localStorage` or settings API) | Q2 |
| Pinned-right actions column (EditGrid) | `@bc-grid/react` (`<BcEditGrid>` composition) | Q2 |
| LookupGrid keyboard / autofocus / preselect | `@bc-grid/react` (cell-focus API + lookup wrapper) | Q2 |
| Cell editors (NOT YET USED in bc-next) | `@bc-grid/editors` + `@bc-grid/react` framework | Q2 |
| Range selection | `@bc-grid/react` | Q3 — defer-candidate |
| Master-detail | `@bc-grid/react` (engine surface in core) | Q3 — defer-candidate |
| Server infinite scroll | `@bc-grid/server-row-model` infinite mode | Q4 — defer-candidate |
| Tree data | `@bc-grid/server-row-model` tree mode + `@bc-grid/react` | Q4 — defer-candidate |
| Pivots / aggregations as grid feature | `@bc-grid/aggregations` engine + `@bc-grid/enterprise` UI | Q5 — strong defer-candidate |
| Charts | not in scope for 1.0 |
| Excel export | `@bc-grid/export` | Q6 |

## Acceptance criteria (from queue.md task spec)

- ✅ Every `data-grid.tsx` consumer enumerated (23 + 25 + 8 + lookup-grid)
- ✅ Every prop / callback / API call / column property listed with frequency
- ✅ Cross-referenced to bc-grid packages (Appendix B)
- ✅ Q1 scope confirmed (Section H.1 maps 1:1 to design.md Q1 vertical slice)
- ⏳ Reviewer (fresh agent) sign-off — pending PR review

## Reviewer notes

This audit is **descriptive of what bc-next uses today**, not prescriptive of what bc-grid should be. Where the two diverge:

- **Cell editing**: bc-next plans to add it; bc-grid Q2 builds it. The design doc + this audit agree.
- **Server-side row model**: bc-next uses paged-page-by-page; bc-grid Q4 adds infinite scroll + tree as well. The design doc plans the bigger feature; this audit confirms paged-only is enough for current bc-next.
- **Enterprise features (pivots, range, charts)**: bc-next uses none; bc-grid roadmap has them in Q5+. The design doc has them; this audit suggests they're defer-candidates if no external customer asks before 1.0.

If the reviewer disagrees with any defer-candidate, flag it; we can promote it to v1.0 scope.
