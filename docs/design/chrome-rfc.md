# RFC: Grid Chrome — status bar, sidebar (tool panels), context menu (chrome-rfc)

**Status:** Draft for review
**Owner:** c2 (auditor + coordinator)
**Reviewer:** fresh agent (target: x3 or x1)
**Blocks:** `status-bar-impl`, `sidebar-impl`, `tool-panel-columns`, `tool-panel-filters`, `context-menu-impl`, `footer-aggregations`
**Informed by:** `docs/api.md §5.1` (slot pattern: `toolbar`, `footer`), `docs/design/accessibility-rfc.md` (focus model + touch fallback), `docs/coordination/v1-parity-sprint.md §Track 5`
**Sprint context:** Track 5 of the v1 parity sprint

---

This RFC pins the **slot + composition** patterns for the three pieces of grid chrome that AG Grid Enterprise consumers expect: status bar (footer aggregations), sidebar (column + filter tool panels), and right-click context menu. None of these are state-machine work; all three are React composition patterns over slots. The RFC is comparatively short because the heavy lifting is design + a11y, not state management.

## Goals

- A status bar slot that ships built-in row-count / selected-count / footer-aggregation segments and accepts custom segments.
- A right-edge sidebar that hosts named tool panels; v1 ships two built-ins (Columns, Filters); consumers register their own.
- A right-click context menu with default items (copy, copy-with-headers, paste — Q3 wires) and consumer-supplied extension items.
- All three respect the existing focus model from `accessibility-rfc`: keyboard-reachable; focusable controls inside slots manage their own focus; closing returns focus to the grid root or invocation cell.
- Touch fallback per `accessibility-rfc §Pointer and Touch Fallback`: 44px hit targets in coarse-pointer mode; long-press opens context menu (500ms threshold).
- Reduced motion: no enter/exit transitions; sidebar slides instantly under `prefers-reduced-motion`.
- Forced colors: every chrome surface uses CSS system colors per `accessibility-rfc §Forced Colors and High Contrast`.

## Non-Goals

- **Toolbar**. Already shipped via `BcGridProps.toolbar` slot. This RFC doesn't change the toolbar surface.
- **Aggregation engine.** Owned by `aggregation-rfc` (Track 4). Status-bar `aggregations` segment consumes the engine output but does not implement aggregation math.
- **Pivot drag-zone UI.** Owned by `pivot-rfc`. Pivot UI may live inside the sidebar via a Pivot tool panel — that's a Track 4 feature, not a Track 5 feature.
- **Status-bar filters / search bar.** Toolbar territory.
- **Floating action buttons / FAB.** Out of scope; not an AG Grid pattern.
- **Multi-grid status synchronization.** Out of scope.

## Source standards

- **shadcn-compatible primitives**, not a runtime dependency on shadcn. The shadcn ecosystem is copy-paste app code, not a published package — `@bc-grid/react` cannot import shadcn components from a shared library. This RFC's "shadcn-style" / "shadcn-compatible" language means: **bc-grid ships its own internal primitives** (under `packages/react/src/internal/`) that are styled to be drop-in replaceable / coexistent with a host app's shadcn primitives. The styling consumes the same CSS variables (`--background`, `--foreground`, etc. per `design.md §8`) so visual parity is automatic. Consumers wanting to use their own shadcn components in slots (e.g., a custom toolbar, a custom context-menu item icon) are free to.
- WAI-ARIA APG `menu` and `menubar` patterns (context menu): https://www.w3.org/WAI/ARIA/apg/patterns/menu/
- WAI-ARIA APG `tabs` pattern (sidebar — see Sidebar section below for the chosen pattern): https://www.w3.org/WAI/ARIA/apg/patterns/tabs/
- AG Grid public docs (status bar / sidebar / context menu reference; **public docs only** per `AGENTS.md §3.2`).

## Decision summary

| Topic | Decision |
|---|---|
| Status bar position | Below the body, sticky-bottom. Above any consumer `footer` slot. |
| Status bar layout | Horizontal flex of named segments. Built-in: `total`, `filtered`, `selected`, `aggregations`. Consumer-supplied via `statusBar` prop. |
| Status bar height | Density-aware: 28/32/36 px (compact/normal/comfortable). Configurable via `--bc-grid-statusbar-height`. |
| Sidebar position | Right-edge collapsible. Hosts named tool panels; v1 ships `columns` and `filters` built-ins. |
| Sidebar interaction | Closed: a vertical pip rail of icons. Click an icon → opens that panel. Click the same icon again → closes. Press Esc when focused inside → closes. |
| Sidebar role | `role="tablist"` for the icon rail; `role="tab"` per icon; `role="tabpanel"` per panel (WAI-ARIA APG tabs pattern). **No focus trap** — non-modal tabpanels don't trap Tab. Esc closes the active panel and returns focus to the icon that opened it. |
| Sidebar width | Default 280px; consumer-overridable via `BcGridProps.sidebarWidth`. |
| Context menu trigger | Right-click on a body cell or row. Long-press (500ms) on coarse pointer. Shift+F10 keyboard. |
| Context menu items | Built-in: `copy`, `copy-with-headers`, `export-csv`, `export-xlsx`. Consumer extensions via `contextMenuItems` prop or factory function. |
| Context menu role | `role="menu"`; arrow-key navigation; Enter activates; Esc closes. |
| All three | Slot pattern (`statusBar`, `sidebar`, `contextMenuItems` props on `BcGridProps`); composition over flags per `design.md §10`. |

---

## Status bar

### Surface

```tsx
<BcGrid
  // ...
  statusBar={[
    "total",
    "filtered",
    "selected",
    "aggregations",
    { id: "custom-1", render: () => <span>Last sync: 2:34pm</span>, align: "right" },
  ]}
/>
```

```ts
export type BcStatusBarSegment<TRow = unknown> =
  | "total"          // Built-in: "{n} rows"
  | "filtered"       // Built-in: "{filtered} of {total} shown" (only when a filter is active)
  | "selected"       // Built-in: "{n} selected" (only when selection is non-empty)
  | "aggregations"   // Built-in: footer-aggregation row from @bc-grid/aggregations (Track 4)
  | BcStatusBarCustomSegment<TRow>

export interface BcStatusBarCustomSegment<TRow = unknown> {
  id: string
  render: (ctx: BcStatusBarContext<TRow>) => React.ReactNode
  align?: "left" | "right"
}

export interface BcStatusBarContext<TRow = unknown> {
  totalRowCount: number | "unknown"  // "unknown" for server-row-model with rowcount=-1
  filteredRowCount: number
  selectedRowCount: number
  /** Aggregation results when @bc-grid/aggregations is configured; empty array otherwise. */
  aggregations: readonly BcAggregationResult[]
  /** Pass-through to consumer for custom rendering. */
  api: BcGridApi<TRow>
}
```

### Behaviour

- Status bar lives below `.bc-grid-scroller` and above `BcGridProps.footer` (if set).
- Renders only when `statusBar` is non-empty *or* the grid has `selection` / `aggregations` semantics (default-off; consumer must opt in).
- Built-in segments are conditionally rendered:
  - `total` always shows when included.
  - `filtered` shows only when `filterState` is non-empty.
  - `selected` shows only when `selectionSize > 0`.
  - `aggregations` shows when `@bc-grid/aggregations` produces non-empty results (engine + columns with `aggregation` set).
- Custom segments render unconditionally; consumer controls their visibility.
- Live region: status bar updates announce through the polite region per `accessibility-rfc §Live Regions`. Already wired by #41 for sort/filter/selection — aggregations announcement gets added in Track 4. Status bar text changes do **not** announce on every render — only when the selected/filtered/aggregation values cross a threshold (e.g., empty → non-empty). Otherwise spam.

### a11y

- Status bar root: `role="region"` + `aria-label="Grid status"` (or localised). **No `aria-live` on the status bar root** — announcements route through the existing centralised polite region from PR #41 (`accessibility-rfc §Live Regions`). The status bar's text is a *visual* informational surface; semantic state changes (sort applied, filter applied, selection count crossed empty↔non-empty boundary, aggregations refreshed) emit polite-region announcements via the central pipeline.
- Each segment gets a unique stable `id` so screen-reader users can navigate via the region landmark + segment headings.
- Avoiding double-speech: the status bar text and the live-region message are intentionally different shapes. Status bar shows "1,234 rows" continuously; the polite region announces "Filter applied. 1,234 of 5,000 rows shown." once per state change.

### Visual / theming

CSS hooks via theming:
```css
.bc-grid-statusbar { /* layout */ }
.bc-grid-statusbar-segment { /* common */ }
.bc-grid-statusbar-segment[data-segment="total"] { /* per-segment */ }
.bc-grid-statusbar-segment[data-align="right"] { margin-left: auto }
```

CSS variables exposed:
- `--bc-grid-statusbar-height`
- `--bc-grid-statusbar-bg`
- `--bc-grid-statusbar-fg`
- `--bc-grid-statusbar-border-top`

Forced-colors rules ship in `packages/theming/src/styles.css` — segment text uses `CanvasText`, segment dividers use `ButtonText`.

### Footer aggregations integration

When Track 4 lands `@bc-grid/aggregations`, the `aggregations` segment consumes:

```ts
import { computeFooterAggregations } from "@bc-grid/aggregations"

// inside BcGrid:
const aggregations = useMemo(
  () => computeFooterAggregations(rows, columns, { selectionScope }),
  [rows, columns, selectionScope]
)
```

The `selectionScope` defaults to "filtered" (aggregate over filtered rows only); consumers can opt to "all" or "selected" via `BcGridProps.aggregationScope?: "filtered" | "all" | "selected"`. Track 4 RFC pins the engine contract.

---

## Sidebar (tool panels)

### Surface

```tsx
<BcGrid
  // ...
  sidebar={["columns", "filters"]}
  defaultSidebarPanel="columns"     // open with Columns visible; default: closed
  sidebarWidth={320}                 // default 280
/>
```

```ts
export type BcSidebarPanel =
  | "columns"
  | "filters"
  | "pivot"          // Track 4 lights this up
  | BcSidebarCustomPanel

export interface BcSidebarCustomPanel<TRow = unknown> {
  id: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  render: (ctx: BcSidebarContext<TRow>) => React.ReactNode
}

export interface BcSidebarContext<TRow = unknown> {
  api: BcGridApi<TRow>
  columns: readonly BcReactGridColumn<TRow>[]
  columnState: readonly BcColumnStateEntry[]
  setColumnState: (state: readonly BcColumnStateEntry[]) => void
  filterState: BcGridFilter
  setFilterState: (state: BcGridFilter) => void
  /** Pivot props when Track 4 lands; null otherwise. */
  pivot?: unknown  // Track 4 fills in the type
}
```

### Layout

```
┌─────────────────────────────────────┬──┐
│                                     │📋│  ← icon rail (collapsed sidebar)
│                                     │  │
│   .bc-grid-scroller                 │🔍│
│                                     │  │
│                                     │ │
│                                     │  │
└─────────────────────────────────────┴──┘
```

When opened (clicking an icon):

```
┌──────────────────────────────────┬──────┬──┐
│                                  │      │📋│
│  .bc-grid-scroller (narrowed)    │ ─────│✓│
│                                  │ Cols │  │
│                                  │ ─────│🔍│
│                                  │ Filt │  │
│                                  │      │  │
└──────────────────────────────────┴──────┴──┘
```

The sidebar panel slides in from the icon rail. When `prefers-reduced-motion: reduce`, it appears instantly.

### Built-in: `columns` tool panel

UI elements:
- Search box at top (filters columns by header name).
- Drag-handle for each column → reorder.
- Visibility checkbox.
- Pin dropdown: none / left / right.
- Group-by drop zone at the bottom (drag a column here to add to `groupBy`; drag out to remove). Reserved for Track 4 group-by — the drop zone exists at v1 but is "coming-soon" labelled until aggregation ships.

State: reads + writes `columnState` via `BcGridApi.setColumnState`. Honours the controlled/uncontrolled distinction from `api.md §3`.

a11y:
- Panel root: `role="tabpanel"` + `aria-labelledby={iconDomId}` (icon serves as the tab name).
- Search box: `<input type="search" aria-label="Filter columns" />`.
- Column list: `role="list"`; each item `role="listitem"` with internal controls (checkbox, drag-handle button, pin dropdown).
- Drag affordance: keyboard-accessible via Up/Down to reorder when the drag-handle has focus + Space to lift / Space to drop. Per WAI-ARIA APG `listbox` rearrangement pattern.

### Built-in: `filters` tool panel

UI elements:
- Active-filter list (one row per active column filter, with clear-this-filter X).
- Inline editing for each: re-uses the filter UI from Track 6 (text/number/date/set/boolean variants).
- "Clear all" button.

State: reads + writes `filterState` via `BcGridApi.setFilter`.

a11y:
- Panel root: `role="tabpanel"` + `aria-labelledby={iconDomId}`.
- Each active filter is a `role="region"` with the column header as its accessible name.
- Clear buttons: standard buttons with `aria-label="Clear filter on {column.header}"`.

### Built-in: `pivot` tool panel (Track 4)

Reserved. Lights up when `@bc-grid/aggregations` is configured AND `pivotMode` is on. The panel hosts row/col/values drop zones. RFC owned by `pivot-rfc`.

### Custom panels

Consumer-defined `BcSidebarCustomPanel` objects:
```tsx
<BcGrid
  sidebar={[
    "columns",
    "filters",
    {
      id: "audit",
      label: "Audit Log",
      icon: HistoryIcon,
      render: ({ api }) => <AuditLogPanel api={api} />,
    },
  ]}
/>
```

Renders identically to built-ins (icon in rail, opens via click, tabpanel semantics).

### Sidebar state

Three states: `collapsed`, `panel-open: <panelId>`. Stored locally; persisted via `gridId` localStorage when set.

```ts
// BcGridProps additions (additive to api.md §5.1, in @bc-grid/react):
sidebar?: readonly BcSidebarPanel[]
defaultSidebarPanel?: string | null   // null = collapsed (default)
sidebarPanel?: string | null          // controlled
onSidebarPanelChange?: (next: string | null, prev: string | null) => void
sidebarWidth?: number                 // default 280
```

### Keyboard

- Tab order: grid root → sidebar icon rail (each icon is `tabindex=0`) → if a panel is open, focus enters it after pressing Enter / Space on the icon.
- Inside an open panel: standard Tab/Shift+Tab navigation through the panel's interactive controls. **No focus trap** — Tabbing past the last control in the panel moves focus to the next tabbable element after the sidebar (typical browser flow). To return focus to the icon rail, press Esc; to keep working in the grid, click into it. This matches the WAI-ARIA APG tabs pattern for non-modal tabpanels.
- Esc closes the active panel; focus returns to the icon that opened it.
- Arrow keys on the icon rail navigate up/down the icon stack.

### a11y

- Icon rail root: `role="tablist"` + `aria-orientation="vertical"` + `aria-label="Sidebar tools"`.
- Each icon: `role="tab"` + `aria-selected={panelId === activePanel}` + `aria-controls={panelDomId}`.
- Each panel root: `role="tabpanel"` + `aria-labelledby={iconDomId}`.
- **Why tablist, not dialog:** panels are non-modal, persistent, exclusive (one open at a time). `tablist` is the WAI-ARIA APG match. Dialog would imply modality + focus trap, neither of which fits the always-visible icon rail UX.

### Visual / theming

CSS variables:
- `--bc-grid-sidebar-width`
- `--bc-grid-sidebar-rail-width`
- `--bc-grid-sidebar-bg`
- `--bc-grid-sidebar-border`

---

## Context menu

### Surface

```tsx
<BcGrid
  // ...
  contextMenuItems={[
    "copy",
    "copy-with-headers",
    "export-csv",
    "separator",
    {
      id: "view-history",
      label: "View History",
      onSelect: (ctx) => openHistoryFor(ctx.row),
      icon: HistoryIcon,
    },
  ]}
/>
```

```ts
export type BcContextMenuItem =
  | "copy"
  | "copy-with-headers"
  | "export-csv"
  | "export-xlsx"
  | "paste"           // Q3 — wired by range-rfc
  | "separator"
  | BcContextMenuCustomItem

export interface BcContextMenuCustomItem<TRow = unknown> {
  id: string
  label: string
  icon?: React.ComponentType<{ className?: string }>
  onSelect: (ctx: BcContextMenuContext<TRow>) => void
  disabled?: boolean | ((ctx: BcContextMenuContext<TRow>) => boolean)
  destructive?: boolean
  shortcut?: string  // displayed as "Ctrl+C" — not bound by bc-grid; consumer wires
}

export interface BcContextMenuContext<TRow = unknown> {
  /** Cell that was right-clicked; null if the menu was triggered on the grid root. */
  cell: BcCellPosition | null
  row: TRow | null
  column: BcReactGridColumn<TRow> | null
  /** Selected rows at the time of trigger. */
  selection: BcSelection
  api: BcGridApi<TRow>
}
```

Consumers can also pass a factory function:
```tsx
<BcGrid
  contextMenuItems={(ctx) => [
    "copy",
    ctx.column?.field === "balance" && {
      id: "view-statement",
      label: "View Statement",
      onSelect: () => openStatement(ctx.row),
    },
  ].filter(Boolean)}
/>
```

This pattern (factory function) lets the menu adapt to the right-clicked cell.

### Triggers

- **Right-click** (`onContextMenu`): default trigger; cell coordinates from `event.clientX/Y`.
- **Long-press** (`pointerdown` held 500ms in coarse-pointer mode): touch fallback per `accessibility-rfc §Pointer and Touch Fallback`.
- **Shift+F10**: keyboard fallback per WAI-ARIA APG. Opens the menu anchored to the active cell.

### Built-in items

| Item | Behaviour | Track |
|---|---|---|
| `copy` | Copies the active cell's `formattedValue` to clipboard (text/plain). | This RFC, ships v1 |
| `copy-with-headers` | Copies the column header + the active cell's value. | This RFC, ships v1 |
| `export-csv` | Calls `toCsv(rows, columns)` from `@bc-grid/export` and triggers download. | Depends on Track 6 export; placeholder until then |
| `export-xlsx` | Same with `toExcel`. | Track 6 |
| `paste` | Range-paste from clipboard. | Track 2 (range-rfc) |
| `separator` | Renders a `role="separator"`. | This RFC |

When a built-in's dependency hasn't shipped yet, the item renders disabled with a "coming soon" tooltip.

### Behaviour

- Menu opens at the pointer position (or for keyboard, anchored to the active cell).
- Position adjusts to stay within viewport (flips above the trigger if no room below).
- Click an item → execute `onSelect(ctx)` → close menu.
- Click outside / Esc / scroll → close menu.
- Selection-aware: when right-clicked on an unselected cell with non-empty selection, the cell joins the selection (Excel behaviour). Consumers can disable this via `contextMenuSelectionMode?: "preserve" | "extend"` (default: `extend`).

### Keyboard

- Up/Down: navigate items.
- Home/End: first / last item.
- Enter / Space: activate.
- Esc: close.
- Type-ahead: typing a letter jumps to the next item starting with that letter.

### a11y

- Menu root: `role="menu"`.
- Each item: `role="menuitem"` (or `role="menuitemcheckbox"` for toggleable items, post-1.0).
- Disabled items: `aria-disabled="true"`.
- Separators: `role="separator"`.

### Visual / theming

Implemented on bc-grid's internal context-menu primitive (under `packages/react/src/internal/context-menu.tsx`), styled shadcn-compatible per the source-standards note above. Consumes the host app's CSS variables for visual parity with shadcn-themed apps. Custom CSS variables for icons + destructive item colour:
- `--bc-grid-context-menu-bg`
- `--bc-grid-context-menu-border`
- `--bc-grid-context-menu-destructive-fg`

---

## Implementation tasks (Phase 6 Track 5)

These land in `docs/queue.md` Track 5 section after coordination PR #43 merges:

| Task | Effort | Depends on |
|---|---|---|
| `status-bar-impl` | M | this RFC |
| `sidebar-impl` (icon rail + open/close + tablist plumbing) | M | this RFC |
| `tool-panel-columns` | M | sidebar-impl |
| `tool-panel-filters` | M | sidebar-impl + filter-registry-rfc |
| `context-menu-impl` (built-in items + custom extension) | M | this RFC |
| `footer-aggregations` (status-bar `aggregations` segment) | S | aggregation-rfc + status-bar-impl |

All three top-level tasks (`status-bar-impl`, `sidebar-impl`, `context-menu-impl`) can run **fully in parallel** — different surfaces, different files. Tool panels stack on top of sidebar.

## Test plan

### Unit (Vitest)

- Status bar segment visibility logic (filtered/selected only when active).
- Context menu item factory function evaluation.
- Sidebar state machine: `collapsed` ↔ `panel-open` transitions.

### Integration (Vitest + RTL)

- Status bar renders correct text from row count + filter + selection state.
- Sidebar opens on icon click, closes on second icon click + Esc.
- Open sidebar panel: standard Tab/Shift+Tab cycles through panel controls (no focus trap); Esc closes the panel and returns focus to the icon that opened it.
- Context menu opens on right-click, closes on outside-click / Esc.

### E2E (Playwright × 3 browsers)

- Status bar updates with sort/filter/selection changes.
- Sidebar Columns panel reorders columns; assert column order in DOM.
- Context menu copy → assert clipboard content.
- Context menu shortcut: keyboard arrow-down + Enter activates the second item.
- Long-press touch trigger (Playwright's `dispatchEvent` for `pointerdown` + 500ms wait + `pointerup`).

### a11y manual

- NVDA: open sidebar, navigate via tab/arrow; assert tab/tabpanel announcements.
- VoiceOver: right-click a cell, navigate menu via VO+Down; assert menuitem announcements.
- Forced colors mode: every chrome surface visible.

## Acceptance criteria

- Status bar renders 4 built-in segments + accepts custom segments.
- Sidebar with 2 built-in panels (Columns, Filters); custom panels register and render.
- Context menu with 4+ built-in items (copy, copy-with-headers, export-csv, export-xlsx); custom items via factory function.
- All three keyboard-accessible per WAI-ARIA APG.
- All three pass axe-core in light + dark + forced-colors modes.
- `apps/docs` API page (PR #35) updated: chrome props move from `reserved` to `implemented`.
- `tools/api-surface/src/manifest.ts` updated for the additive `BcGridProps` fields (`statusBar`, `sidebar`, `contextMenuItems`, etc.).

## References

- `docs/api.md §5.1` (existing slot pattern: `toolbar`, `footer`)
- `docs/design/accessibility-rfc.md §Focus Model + §Pointer and Touch Fallback + §Forced Colors`
- `docs/coordination/v1-parity-sprint.md §Track 5`
- shadcn-compatible primitives shipped internally under `packages/react/src/internal/` (no runtime shadcn dependency)
