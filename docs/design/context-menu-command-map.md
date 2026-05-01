# Design: Context-menu command map (v0.3)

**Status:** Draft for review
**Author:** worker4 (Claude)
**Reviewer:** coordinator
**Blocks:** the v0.3 follow-up implementation PR that ships the new built-in items and API additions named below.
**Informed by:** `docs/design/chrome-rfc.md`, `docs/coordination/v030-filtering-gap-map.md` (§3a), `docs/audits/ag-grid-comparison/2026-05-01-layout-server-context.md` (§3 context menu).

---

`context-menu-impl` (PR #157) shipped a deliberately lightweight context-menu layer with four built-in items (`copy`, `copy-with-headers`, `clear-selection`, `clear-range`) plus a custom-factory escape hatch. The chrome-rfc names a richer set (`copy` / `copy-with-headers` / `export-csv` / `export-xlsx`); the v0.3 filtering gap map (§3a) names a filter-discoverability set (`Filter by this value` / `Clear filter for this column` / `Clear all filters` / `Show / hide filter row`).

This doc maps the v0.3 menu surface against current state, names the typed API additions and built-in ID extensions required for renderer dispatch, and pins the implementation order so the next PR can land in one focused merge.

The doc is the deliverable; the implementation PR is the next step. **No source changes ship in this PR** beyond edge-case unit tests.

## 1. Audit — what's there today

### 1.1 Built-in items (`BcContextMenuBuiltinItem`)

`packages/react/src/types.ts:233`:

```ts
export type BcContextMenuBuiltinItem =
  | "copy"
  | "copy-with-headers"
  | "clear-selection"
  | "clear-range"
  | "separator"
```

Default item set (`packages/react/src/contextMenu.ts:9`):

```ts
export const DEFAULT_CONTEXT_MENU_ITEMS = [
  "copy",
  "copy-with-headers",
  "separator",
  "clear-selection",
  "clear-range",
] as const
```

Disabled-state predicates (`contextMenu.ts:60`):

- `copy` / `copy-with-headers` — disabled when no cell context AND no range selection.
- `clear-range` — disabled when no range selection.
- `clear-selection` — disabled when explicit selection is empty.
- Custom items — disabled per the user-provided `disabled` prop (boolean or `(ctx) => boolean`).
- Separator — always disabled (rendered, never actionable).

Renderer (`packages/react/src/internal/context-menu-layer.tsx`) is lazy-loaded; dispatch on `onSelect` for custom items, hardcoded handlers for built-ins.

### 1.2 `BcContextMenuContext` shape

`types.ts:251`:

```ts
export interface BcContextMenuContext<TRow = unknown> {
  cell: BcCellPosition | null
  row: TRow | null
  column: BcReactGridColumn<TRow> | null
  selection: BcSelection
  api: BcGridApi<TRow>
}
```

What's exposed: cell / row / column at the trigger point, current row selection, the imperative API. What's **not** exposed: current sort state, current filter state, current range selection (only via `api.getRangeSelection()`), persisted state. The API surface below is the only mutation channel.

### 1.3 `BcGridApi` commands (per `@bc-grid/core`)

```ts
interface BcGridApi<TRow = unknown> {
  // Navigation
  scrollToRow(rowId, opts?): void
  scrollToCell(position, opts?): void
  focusCell(position): void
  isCellVisible(position): boolean

  // Reads
  getRowById(rowId): TRow | undefined
  getActiveCell(): BcCellPosition | null
  getSelection(): BcSelection
  getRangeSelection(): BcRangeSelection
  getColumnState(): BcColumnStateEntry[]

  // Writes
  setColumnState(state): void
  setSort(sort): void
  setFilter(filter | null): void
  setRangeSelection(selection): void

  // Actions
  copyRange(range?): Promise<void>
  clearRangeSelection(): void
  expandAll(): void
  collapseAll(): void
  refresh(): void
}
```

Notably **missing** for context-menu commands the v0.3 doc cluster names:

- **No `getFilter()`.** Custom items can `setFilter(null)` but can't read the current filter to mutate it incrementally (e.g., "remove filter for THIS column"). They'd have to be controlled-mode and read from props.
- **No column-targeted helpers.** Pinning / hiding / autosizing a single column today goes via `setColumnState(next)` which replaces the entire array; consumers reach for it but the ergonomics are bad.
- **No export hooks.** `@bc-grid/export` ships `toCsv` / `toExcel` / `toPdf` (sources elsewhere) but the API doesn't surface them — context-menu items would have to import the package directly.

## 2. Expected v0.3 menu groups

The brief names six groups. Each row maps to: items the renderer should ship as built-ins, what's needed to make dispatch possible, and what's already there.

### 2.1 Clipboard

| Item | ID | Today | Required for v0.3 |
|---|---|---|---|
| Copy (range or active cell) | `copy` | ✓ Built-in | — |
| Copy with headers | `copy-with-headers` | ✓ Built-in | — |
| Paste from clipboard | (reserved) | Not in v0.3 — Q5 range/clipboard track | Skip |

**Status: complete for v0.3.** Existing built-ins cover the named clipboard surface.

### 2.2 Range

| Item | ID | Today | Required for v0.3 |
|---|---|---|---|
| Clear range | `clear-range` | ✓ Built-in | — |

**Status: complete for v0.3.**

### 2.3 Filter

| Item | ID | Today | Required for v0.3 |
|---|---|---|---|
| Filter by this value | `filter-by-cell-value` | Missing | NEW built-in + the per-column filter shape (text → contains; set → toggle in-list; etc.) per `filter-registry-rfc` |
| Clear filter for this column | `clear-column-filter` | Missing | NEW built-in + `BcGridApi.clearFilter(columnId)` OR `BcGridApi.getFilter()` so a custom item can compute the next filter |
| Clear all filters | `clear-all-filters` | Missing | NEW built-in; can dispatch via existing `setFilter(null)` |
| Show / hide filter row | `toggle-filter-row` | Missing | NEW built-in; dispatch via `BcGridApi.setShowFilterRow(boolean)` (or a controlled-state event hook into `showFilterRow`) |

**Required API additions for renderer dispatch:**

- `BcGridApi.getFilter(): BcGridFilter | null` — additive read. Lets custom items (and the `clear-column-filter` built-in) compute the next filter.
- `BcGridApi.clearFilter(columnId?: ColumnId): void` — additive write. When `columnId` is set, walks the current filter and removes only that column's column-filter entry (rebuilding the group). When `columnId` is omitted, equivalent to `setFilter(null)`.
- `BcGridApi.setShowFilterRow(value: boolean): void` — additive write. Controlled callers can ignore it; uncontrolled grids flip the internal state.

Each is an additive method on `BcGridApi`; the `api-surface` manifest needs to expand. None affects existing call sites.

### 2.4 Column

| Item | ID | Today | Required for v0.3 |
|---|---|---|---|
| Pin column left | `pin-column-left` | Missing | NEW built-in + `BcGridApi.setColumnPinned(columnId, "left")` |
| Pin column right | `pin-column-right` | Missing | NEW built-in + `BcGridApi.setColumnPinned(columnId, "right")` |
| Unpin column | `unpin-column` | Missing | NEW built-in + `BcGridApi.setColumnPinned(columnId, null)` |
| Hide column | `hide-column` | Missing | NEW built-in + `BcGridApi.setColumnHidden(columnId, true)` |
| Show all columns | `show-all-columns` | Missing | NEW built-in + `BcGridApi.setColumnHidden(columnId, false)` looped (or a `showAllColumns()` shortcut) |
| Autosize column to fit content | `autosize-column` | Missing | NEW built-in + `BcGridApi.autoSizeColumn(columnId)` (also queued as `column-autosize-api` in the v0.3 gap map, §5) |
| Autosize all columns | `autosize-all-columns` | Missing | NEW built-in + `BcGridApi.autoSizeAllColumns()` |

**Required API additions for renderer dispatch:**

- `BcGridApi.setColumnPinned(columnId: ColumnId, pinned: "left" | "right" | null): void` — additive. Today consumers replace `setColumnState(...)`; this shortcut walks the current state and updates only the targeted entry.
- `BcGridApi.setColumnHidden(columnId: ColumnId, hidden: boolean): void` — additive shortcut. Same shape as `setColumnPinned`.
- `BcGridApi.autoSizeColumn(columnId: ColumnId): void` and `autoSizeAllColumns(): void` — additive. Pairs with the `column-autosize-api` task in the v0.3 gap map (§5); the column-targeted method is the dispatch target for the autosize built-in.

### 2.5 Row actions

The chrome-rfc explicitly leaves row actions to consumer-supplied custom items (the `BcEditGrid` action column already covers Edit / Delete; the consumer is expected to wire bespoke actions like "View customer" / "Open invoice"). **No new built-ins needed for v0.3.**

The one gap worth naming: row context items don't have a clean way to read "what's the row I right-clicked on" beyond reading `ctx.row` (already in `BcContextMenuContext`). That's adequate.

### 2.6 Export

| Item | ID | Today | Required for v0.3 |
|---|---|---|---|
| Export CSV | `export-csv` | Missing (named in chrome-rfc) | NEW built-in; renderer-side dispatch via `@bc-grid/export.toCsv` peer-dep import |
| Export XLSX | `export-xlsx` | Missing (named in chrome-rfc) | NEW built-in; renderer-side dispatch via `@bc-grid/export.toExcel` peer-dep import |

The chrome-rfc reserves these IDs explicitly. Dispatch needs the renderer to import from `@bc-grid/export`; that's the only sensitive piece (`@bc-grid/react` shouldn't take a hard dep on `@bc-grid/export`). The conventional shape is a peer-dep + dynamic import inside the renderer:

```ts
const { toCsv } = await import("@bc-grid/export")
```

That keeps the bundle-size impact zero unless the consumer actually invokes the menu item. Same shape `charts-peer-dep-integration` uses.

**Required API additions for renderer dispatch:** none — the renderer reads from `@bc-grid/export`, which already exists.

### 2.7 Group separators

The current renderer uses `"separator"` items. The v0.3 design should keep that shape; the built-in default array gets longer:

```ts
export const DEFAULT_CONTEXT_MENU_ITEMS = [
  // Clipboard
  "copy",
  "copy-with-headers",
  "separator",
  // Filter
  "filter-by-cell-value",
  "clear-column-filter",
  "clear-all-filters",
  "separator",
  // Column
  "pin-column-left",
  "pin-column-right",
  "unpin-column",
  "hide-column",
  "autosize-column",
  "separator",
  // Range / Selection
  "clear-range",
  "clear-selection",
  "separator",
  // Export
  "export-csv",
  "export-xlsx",
] as const
```

Each item's `disabled` predicate suppresses it when the action doesn't apply (e.g., `pin-column-left` when no column context, `export-csv` when row count is zero). The renderer can hide a separator that ends up adjacent to another separator.

## 3. Implementation order

Pinning the order so the next PR can pick this up cleanly without scope creep.

1. **API additions in `@bc-grid/core`.** Extend `BcGridApi` with the eight additive methods named in §2.3 / §2.4. Update the `api-surface` manifest. No behavioural changes; just typed additions.
2. **Wire the methods in `packages/react/src/grid.tsx`.** `getFilter` reads the controlled / uncontrolled state; `clearFilter(columnId)` walks the current filter and rebuilds; `setColumnPinned` / `setColumnHidden` route through `setColumnState` with a single-entry edit; `autoSizeColumn` calls into the virtualizer's measurement primitive (see §5 follow-up notes).
3. **Extend `BcContextMenuBuiltinItem` union.** Add the new IDs.
4. **Extend `contextMenuItemLabel` and `contextMenuItemDisabled` in `contextMenu.ts`.** Pure additions; no signature changes.
5. **Extend the renderer** in `packages/react/src/internal/context-menu-layer.tsx` with dispatch for each new ID.
6. **Update `DEFAULT_CONTEXT_MENU_ITEMS`** to the §2.7 list.
7. **Tests.** Per-item disabled-state coverage; renderer dispatch (Vitest if a renderer-test fixture exists; otherwise pure-state tests). Bundle-size baseline refresh after step 5 if the export dynamic-import lands.
8. **Examples + docs.** `apps/examples` showcases the new defaults; `apps/docs` adds a recipe for opting in / overriding.

Each step is small and independently mergeable; the renderer (step 5) is the only step that crosses package layers, but the dispatch is a switch statement over IDs with single API calls.

## 4. What this PR does not change

- **No source changes** beyond edge-case unit tests in §6.
- **No new IDs in the union** (those land in step 3 above).
- **No `BcGridApi` additions** (those land in step 1 above).
- **No changes to `DEFAULT_CONTEXT_MENU_ITEMS`** — current four-item set stays intact.
- **No renderer changes.**
- **No bundle-size baseline edits.**
- **No version / changelog / queue release-status edits** (per the task brief).

## 5. Open questions / followups

### 5.1 Should `filter-by-cell-value` use the existing inline-filter shape, or a new "quick filter" that bypasses the inline / popup row?

Recommended: reuse the inline-filter shape (`buildGridFilter` / `columnFilterTextFromGridFilter`) so the action's effect is visible in the inline / popup filter UI. A consumer can then refine or clear from those affordances. Implementing a separate "quick filter" channel that doesn't surface in the existing filter chrome would create two competing sources of truth for the same column.

### 5.2 Should `autoSizeColumn` measure pixel-perfectly or use a heuristic?

Pixel-perfect requires either a hidden render pass or DOM measurement of every visible cell in the column. The virtualizer already has cell-element retention; a measurement pass on the visible window is feasible, with a documented caveat that off-screen cells aren't measured (acceptable for v0.3; pixel-perfect across 100k rows is post-v1.0).

### 5.3 Do we need an `onContextMenuItemSelect` event prop?

Useful for analytics / consumer-side audit logging. Additive; can land alongside or after the implementation PR. **Recommended:** add it in step 5 of the implementation order so the renderer can fire it on every dispatched built-in.

### 5.4 Discoverability via tool panels (filtering gap map §3 cross-reference)

The v0.3 filtering gap map (§3a) names the same four filter items this doc lists in §2.3. Both docs converge on the same renderer dispatch model. Cross-link: the **filter-side gaps** (recipe doc, examples integration, multi-value filter) are tracked in the v0.3 filtering gap map; the **context-menu-side gaps** (built-in IDs, renderer dispatch, API additions) are tracked here.

## 6. Test plan

This PR adds edge-case coverage to `packages/react/tests/contextMenu.test.ts` that the current suite misses:

- **`isContextMenuSeparator`** is exported but not directly tested. Cover separator vs non-separator inputs.
- **`isCustomContextMenuItem`** is exported but not directly tested. Cover separator (false), built-in IDs (false), object-shape custom item (true).
- **`contextMenuItemKey`** is exported but not directly tested. Cover built-in (returns the ID), separator (returns indexed key), custom item (returns the `id` field).
- **`contextMenuItemLabel`** today doesn't ship a label for `separator`. Confirm it returns `""` so the renderer can detect "no label".
- **`resolveContextMenuItems`** with mixed `null` / `false` / `undefined` entries — the existing `isContextMenuItem` filter should drop them. Cover.
- **`resolveContextMenuItems`** function-form returning `[]` (custom factory wants to suppress the menu) — verify it returns `[]`, not the defaults.

The new built-ins (§2.3 / §2.4 / §2.6) and the API additions (§2.3 / §2.4) are not exercised in this PR; their tests land with the implementation PR.

## 7. References

- `packages/react/src/contextMenu.ts` — pure resolver / predicate helpers.
- `packages/react/src/contextMenuEvents.ts` — pointer / keyboard activation.
- `packages/react/src/internal/context-menu-layer.tsx` — renderer (lazy-loaded).
- `packages/react/src/types.ts:233` — `BcContextMenuBuiltinItem`, `BcContextMenuCustomItem`, `BcContextMenuContext`, `BcContextMenuItems`.
- `packages/core/src/index.ts:262` — `BcGridApi` command surface.
- `docs/design/chrome-rfc.md` §Context Menu — original surface design.
- `docs/coordination/v030-filtering-gap-map.md` §3a — filter discoverability subset.
- `docs/audits/ag-grid-comparison/2026-05-01-layout-server-context.md` §3 — clean-room observations.
