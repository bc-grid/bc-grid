# Vanilla + Context-Menu Customization RFC

**Status:** Draft for maintainer ratification
**Author:** coordinator (Claude)
**Reviewer:** maintainer (JohnC)
**Target releases:** v0.5.0-alpha.2/.3 (additive); v0.5.0 GA / v0.6.0 (default flip behind opt-in); post-1.0 (any breaking-default change)
**Informed by:** `docs/design/chrome-rfc.md`, `docs/design/context-menu-command-map.md`, `docs/coordination/audit-2026-05/synthesis.md`, `docs/coordination/v0.5-audit-refactor-plan.md`, `docs/coordination/ui-quality-gate.md`, `docs/api.md` §Toggle / chrome props.

---

## 1. Vision

> "I would like all grid features to be toggled on via right click context menu. most grid features are currently hidden. I would like datagrids to be vanilla by default, but allow complete customization with the context menu, then ensure there is an api where the consumer can persist all user settings."

Translated into bc-grid terms: a `<BcGrid>` mounted with no chrome props should render a quiet, AG-Grid-restraint-grade table — header, body, scroller, status-free footer, no sidebar rail, no inline filter row, no column menu kebab unless the user explicitly opens it. Every additional surface (sidebar panels, inline filter row, status-bar segments, density mode, group expand state, column visibility, pinning, autosize, flash-on-edit, row-detail expansion, sticky pinned-bottom totals, etc.) must be *reachable* from a single, hierarchical right-click menu. The user toggles surfaces on, the grid persists what they chose to a consumer-supplied `BcUserSettingsStore`, and on next mount the user's settings paint the grid back to where they left it.

This is not a feature deletion. Today's prop-driven consumer (`<BcGrid sidebar={[...]} statusBar={[...]} />`) keeps working unchanged — explicit opt-in always wins. What changes is *which surfaces appear when no prop is supplied*, and *what gestures expose them when they're not currently visible*. The right-click menu becomes the discovery channel; the user-settings store becomes the persistence channel.

This RFC ratifies (a) the vanilla defaults, (b) the context-menu hierarchy that exposes every toggleable surface, (c) the `BcUserSettingsStore` API, and (d) the migration path so existing consumers don't break and new consumers can opt in via a single `vanilla` prop today (additive) and via a default flip post-1.0.

## 2. Today's defaults audit

Every `BcGridProps` field that gates a visible surface or behavior. Sourced from `packages/core/src/index.ts` (`BcGridStateProps`), `packages/react/src/types.ts` (`BcGridProps`), and `packages/react/src/grid.tsx` defaults resolution.

| # | Prop | Today's default (no prop) | Vanilla default | Toggle category |
|---|---|---|---|---|
| 1 | `density` | `"normal"` | `"normal"` | View (density) |
| 2 | `height` / `fit` | `"auto"` (unbounded) | `"auto"` | View (layout) |
| 3 | `rowHeight` | density token | density token | View (layout) |
| 4 | `pagination` | undefined (no pager) | undefined | View (pagination) |
| 5 | `paginationMode` | `"client"` | `"client"` | View (pagination) |
| 6 | `pageSizeOptions` | built-in `[25, 50, 100]` | built-in | View (pagination) |
| 7 | `groupsExpandedByDefault` | `false` | `false` | View (group) |
| 8 | `aggregationScope` | `"filtered"` | `"filtered"` | View (aggregation) |
| 9 | `searchHotkey` | `false` | `false` | View (search) |
| 10 | `showFilterRow` (alias `showFilters`) | column-driven (visible if any column has `variant: "inline"`) | **`false`** (hidden until user toggles) | Filter |
| 11 | `showColumnMenu` | **`true`** (kebab on every header hover) | **`false`** (kebab hidden; access via right-click) | View (header chrome) |
| 12 | `checkboxSelection` | `false` | `false` | Selection |
| 13 | `flashOnEdit` | `false` | `false` | Editor (motion) |
| 14 | `sidebar` | `[]` (rail hidden) | `[]` (rail hidden) | View (sidebar) |
| 15 | `defaultSidebarPanel` | `null` | `null` | View (sidebar) |
| 16 | `sidebarWidth` | `280` | `280` | View (sidebar) |
| 17 | `statusBar` | `[]` (no footer status bar) | `[]` | View (status) |
| 18 | `toolbar` | undefined | undefined | View (toolbar) |
| 19 | `footer` | undefined | undefined | View (footer) |
| 20 | `contextMenuItems` | `DEFAULT_CONTEXT_MENU_ITEMS` (5 items: copy / copy-row / copy-with-headers / clear-selection / clear-range) | **`DEFAULT_CONTEXT_MENU_ITEMS_VANILLA`** (full hierarchical menu — see §4) | Context menu |
| 21 | `renderDetailPanel` / `detailPanelHeight` | undefined (no master-detail) | undefined | View (master-detail) |
| 22 | `urlStatePersistence` | undefined | undefined | Persistence |
| 23 | `gridId` | undefined (no localStorage) | undefined | Persistence |
| 24 | `loadingOverlay` | built-in | built-in | View |
| 25 | `groupableColumns` | derived from `column.groupable: true` | same | Group |
| 26 | `defaultGroupBy` / `groupBy` | `[]` | `[]` | Group |
| 27 | `defaultPivotState` / `pivotState` | `emptyBcPivotState` | `emptyBcPivotState` | Pivot |
| 28 | `rowProcessingMode` | `"client"` | `"client"` | Server |
| 29 | `paginationTotalRows` | undefined | undefined | Server |
| 30 | `ariaLabel` / `ariaLabelledBy` | undefined | undefined | A11y (never togglable) |
| 31 | `messages` | built-in English | built-in | A11y (never togglable) |
| 32 | `locale` | undefined | undefined | A11y (never togglable) |

**Headline:** of 32 props that gate visible chrome or behavior, **only 2 toggle category defaults change in vanilla mode**: `showColumnMenu` flips `true → false` (kebab disappears unless user toggles it on), and `showFilterRow` flips column-driven → `false` (filter row hidden unless user opens it). Everything else is already off by default — the audit confirms today's defaults are *already mostly vanilla*; what's missing is the **discovery surface** to turn things on.

A third soft change: the `contextMenuItems` default expands from 5 items to a hierarchical menu with a "Customize…" submenu (§4). The 5 existing built-ins remain at the top; the new hierarchy lives below them.

**Recommendation:** ratify the audit. Vanilla mode is a **two-prop default flip plus a context-menu expansion**, not a deep rewrite.

## 3. Default-off proposal

### Props that flip default

- `showColumnMenu`: `true` → `false`. Kebab hidden by default. Right-click menu exposes "Customize column…" → "Show column menu" toggle that flips it back. AG Grid does this — header chrome is empty until hovered or right-clicked.
- `showFilterRow`: column-driven → `false`. Inline filter row hidden by default. Right-click → "Customize…" → "Show filter row" toggles it. Filters can still be opened per-column via right-click → "Filter by…" (lands with the `filter-by-cell-value` built-in already specified in `context-menu-command-map.md §2.3`).

### Props that stay as-is

Every other prop in §2 is already off by default. Vanilla mode does **not** change them.

A11y, locale, messages — never togglable. These are correctness, not preference.

### Migration

Default-flip is **not a breaking change** for prop-driven consumers:

- `<BcGrid showColumnMenu={true} />` keeps the kebab visible exactly as today.
- `<BcGrid showFilterRow={true} />` keeps the inline filter row visible.
- `<BcGrid showFilterRow />` (any column with `variant: "inline"`) keeps the filter row visible.
- `<BcGrid />` with no props gets the new vanilla defaults — kebab hidden, filter row hidden.

The break only affects consumers who relied on **the old default of "showColumnMenu defaults to true"** without ever passing the prop. Those consumers see the kebab disappear. The migration is one of two paths:

1. Pass `showColumnMenu` / `showFilterRow` explicitly to keep current behavior.
2. Adopt vanilla mode and let users discover features via right-click.

For the v0.5 line, we ship the default flip **gated behind a new `vanilla` prop** (additive) so no existing consumer breaks. Post-1.0 we can flip the default unconditionally and treat the old behavior as the explicit-opt-in path.

**Recommendation:** add `vanilla?: boolean` (additive, default `false`) in v0.5. When `true`, the grid applies vanilla defaults to `showColumnMenu` and `showFilterRow` *unless explicitly overridden*, and uses the expanded `DEFAULT_CONTEXT_MENU_ITEMS_VANILLA`. Defer the unconditional default flip to v1.1+ (a major version reserves the right to flip a default; we don't need to spend the v1.0 surface budget on this).

## 4. Context menu architecture

### Existing surface (recap)

`packages/react/src/types.ts`:

```ts
type BcContextMenuItem<TRow> =
  | BcContextMenuBuiltinItem  // string union, ~17 IDs
  | BcContextMenuCustomItem<TRow>  // { id, label, onSelect, disabled?, variant? }
  | "separator"
```

The renderer already supports built-in IDs, custom items, separators, disabled-state predicates, and `variant: "destructive"`. What's missing is **submenu** and **toggle** item shapes.

### New item shapes required

```ts
type BcContextMenuItem<TRow> =
  | BcContextMenuBuiltinItem
  | BcContextMenuCustomItem<TRow>
  | BcContextMenuToggleItem<TRow>     // NEW
  | BcContextMenuSubmenuItem<TRow>    // NEW
  | "separator"

interface BcContextMenuToggleItem<TRow = unknown> {
  kind: "toggle"
  id: string
  label: string
  /**
   * Read the current state. Pure — read from `ctx.api.getColumnState`,
   * `getFilter`, etc. Returning `undefined` paints the item as
   * indeterminate (used for column-scoped toggles when no column is
   * targeted, e.g. Shift+F10 with no active cell).
   */
  checked: (ctx: BcContextMenuContext<TRow>) => boolean | undefined
  onSelect: (ctx: BcContextMenuContext<TRow>) => void
  disabled?: boolean | ((ctx: BcContextMenuContext<TRow>) => boolean)
}

interface BcContextMenuSubmenuItem<TRow = unknown> {
  kind: "submenu"
  id: string
  label: string
  items:
    | readonly (BcContextMenuItem<TRow> | false | null | undefined)[]
    | ((ctx: BcContextMenuContext<TRow>) =>
        readonly (BcContextMenuItem<TRow> | false | null | undefined)[])
  disabled?: boolean | ((ctx: BcContextMenuContext<TRow>) => boolean)
}
```

`kind` is a discriminator so the renderer can switch on `typeof item` for the string IDs and `"kind" in item` for the new objects (existing custom items keep their flat shape — they pre-date the discriminator and we don't churn the type).

### `DEFAULT_CONTEXT_MENU_ITEMS_VANILLA` (annotated tree)

```
─ Copy                            (existing built-in: copy)
─ Copy row                        (existing built-in: copy-row)
─ Copy with headers               (existing built-in: copy-with-headers)
─ ─────────────────
─ Filter by this value            (built-in: filter-by-cell-value, per CMCM §2.3)
─ Clear filter for this column    (built-in: clear-column-filter, per CMCM §2.3)
─ Clear all filters               (built-in: clear-all-filters, per CMCM §2.3)
─ ─────────────────
─ Customize…                      (NEW SUBMENU — vanilla discovery surface)
   ├─ View
   │   ├─ ☐ Show column menu          (toggle: showColumnMenu)
   │   ├─ ☐ Show filter row           (toggle: showFilterRow)
   │   ├─ ☐ Show sidebar              (toggle: defaultSidebarPanel)
   │   ├─ ☐ Show status bar           (toggle: statusBar; flips between [] and ["total","filtered","selected"])
   │   ├─ ☐ Flash on edit             (toggle: flashOnEdit)
   │   ├─ ─────
   │   ├─ Density   ▶
   │   │   ├─ ◉ Compact
   │   │   ├─ ◉ Normal
   │   │   └─ ◉ Comfortable
   │   └─ ☐ Checkbox selection        (toggle: checkboxSelection)
   ├─ Column   ▶                      (when triggered with column context)
   │   ├─ Pin left                    (existing built-in: pin-column-left)
   │   ├─ Pin right                   (existing built-in: pin-column-right)
   │   ├─ Unpin                       (existing built-in: unpin-column)
   │   ├─ Hide                        (existing built-in: hide-column)
   │   ├─ Show all columns            (existing built-in: show-all-columns)
   │   ├─ Autosize                    (existing built-in: autosize-column)
   │   └─ Autosize all                (existing built-in: autosize-all-columns)
   ├─ Group   ▶                       (when groupable columns exist)
   │   ├─ ☐ Group by this column      (NEW toggle: group-by-column)
   │   ├─ Expand all groups           (NEW: expand-all-groups, dispatches api.expandAll())
   │   └─ Collapse all groups         (NEW: collapse-all-groups, dispatches api.collapseAll())
   └─ Reset…   ▶
       ├─ Reset column layout         (NEW: reset-column-state)
       ├─ Reset filters               (existing: clear-all-filters)
       ├─ Reset sort                  (NEW: clear-sort)
       └─ Reset all preferences       (NEW: reset-user-settings — clears the BcUserSettingsStore)
─ ─────────────────
─ Clear selection                 (existing built-in)
─ Clear range                     (existing built-in)
```

### Visual contract (per `ui-quality-gate.md` §2)

- Renderer builds on the existing shadcn-Radix `DropdownMenu` primitives already in use by `internal/context-menu-layer.tsx`. Submenus map to Radix `DropdownMenuSub` / `DropdownMenuSubTrigger` / `DropdownMenuSubContent`.
- Toggle items render with the shadcn `DropdownMenuCheckboxItem` affordance: 16×16 leading checkbox area, no colored fill on hover, `data-state="checked" | "unchecked"` for token-driven check icon.
- Density submenu is a `DropdownMenuRadioGroup` — exactly one option is selected at a time.
- Keyboard nav: ArrowRight opens submenu, ArrowLeft closes, Enter activates toggle, Escape closes the entire chain. Inherits from existing `usePopupDismiss` + `useRovingFocus` helpers.
- All state painted via `data-*` attribute selectors, not class toggles (`§3.2` of UI gate).

### Hard-rule compliance check (`ui-quality-gate.md` §2)

- §2.1 Cell density / overlap: submenu lives in a popup, not in a header cell — passes.
- §2.4 Motion: shadcn DropdownMenu opens with the existing token-driven `--bc-grid-motion-duration-fast` transition; no morph, no scale on text — passes.
- §2.5 Icon buttons: toggle indicators are SVG icons (`Check`, `Chevron`) from the existing icon modules — passes.
- §2.6 Density consistency: every menu item reads `--bc-grid-context-menu-bg` / `--bc-grid-card-bg` and the existing density tokens — passes.
- §2.7 Token discipline: all chrome reads `--bc-grid-*`; no direct shadcn token reads — passes.

**Recommendation:** ratify the menu tree shape. Implementation is two type additions (`BcContextMenuToggleItem`, `BcContextMenuSubmenuItem`), three new built-in IDs (`group-by-column`, `expand-all-groups`, `reset-user-settings` etc.), and a renderer extension to dispatch through `kind`. Each submenu item already maps to an existing or RFC'd `BcGridApi` method.

## 5. Persistence API

### Today

`useBcGridState({ persistTo: "local:gridId" })` (PR #359, v0.5.0-alpha.1) seeds initial state from `localStorage` keyed by `gridId`. The grid then writes through on every change. Persisted dimensions: `sort`, `filter`, `groupBy`, `pivotState`, `columnState`, `pageSize`, `sidebarPanel`. Not persisted: `selection`, `rangeSelection`, `searchText`, `expansion`, `activeCell`, `page`.

This covers **layout** (what the columns / filters / groups look like). It does **not** cover **visibility toggles** (whether the sidebar / status bar / filter row / kebab is showing) — those today aren't persisted at all.

### New: `BcUserSettingsStore`

```ts
export interface BcUserSettings {
  /**
   * v1 = today's release line. Future versions migrate via a
   * `migrate(old: BcUserSettings) => BcUserSettings` helper exported
   * from `@bc-grid/react`. Persisting consumers store the version
   * alongside the payload so they can branch in their `read` handler.
   */
  version: 1
  /**
   * Visibility toggles — every flag the right-click menu can flip.
   * Each is optional; absence means "use the prop default".
   */
  visible?: {
    columnMenu?: boolean
    filterRow?: boolean
    sidebar?: boolean
    statusBar?: boolean
    flashOnEdit?: boolean
    checkboxSelection?: boolean
  }
  /**
   * Density override. Same shape as `BcGridDensity`. Absence falls
   * through to the `density` prop or the built-in normal default.
   */
  density?: BcGridDensity
  /**
   * Layout snapshot — exact reuse of the existing `BcGridLayoutState`
   * type. Every field is optional; missing fields fall through to the
   * grid's own controlled-prop / persistence path.
   */
  layout?: BcGridLayoutState
  /**
   * Active sidebar panel id. Mirrors `BcGridProps.sidebarPanel` —
   * persisted here so the panel re-opens on next mount.
   */
  sidebarPanel?: string | null
  /**
   * Reserved for v0.6+ when the right-click menu can persist
   * column-level overrides (e.g., per-column "always treat as wrap").
   */
  perColumn?: Record<ColumnId, BcUserColumnSettings>
}

export interface BcUserColumnSettings {
  // Reserved for v0.6+. Kept here so the v0.5 persistence shape is
  // forward-compatible with column-scoped settings.
}

export interface BcUserSettingsStore {
  /**
   * Read settings synchronously. Called once on mount. Return
   * `undefined` when no settings exist yet (first session). Async
   * stores SHOULD seed a synchronous cache via the consumer's data
   * layer (React Query, SWR) and return that cache here; the grid
   * does not block render on a Promise.
   */
  read(): BcUserSettings | undefined
  /**
   * Write settings. Called whenever the user flips a toggle or
   * changes a layout dimension that's covered by `BcUserSettings`.
   * The grid debounces calls to ~200ms to avoid flooding a backend
   * during rapid toggling (e.g. resize-then-pin).
   */
  write(next: BcUserSettings): void
  /**
   * Optional: subscribe to external changes (multi-tab sync, server
   * push). When the listener fires, the grid re-applies the new
   * settings without remount.
   */
  subscribe?(listener: (next: BcUserSettings) => void): () => void
}
```

`BcGridProps` gains:

```ts
interface BcGridProps<TRow> {
  // ...existing fields
  /**
   * Persistent user-preference store. When supplied, the grid reads
   * settings on mount, applies them to the matching props (visible.*,
   * density, layout, sidebarPanel), and writes through on every
   * user-driven toggle change. Composes with `useBcGridState`'s
   * `persistTo: "local:..."`: persistTo handles browser-local cache;
   * userSettings is the cross-device / cross-session source of truth.
   */
  userSettings?: BcUserSettingsStore
}
```

### Composition with `persistTo`

`useBcGridState({ persistTo: "local:customers" })` already handles browser-local cache. `userSettings` handles cross-session / cross-device persistence. Recommended composition (one of two):

1. **Both supplied** — `userSettings` wins on read, `persistTo` is a write-through cache for offline / fast-load. The grid writes to `localStorage` on every change (instant) and to `userSettings.write` debounced 200ms. On mount, prefer `userSettings.read()` if it returns a value; fall back to `localStorage`; fall back to defaults.
2. **Only one supplied** — that one is the source of truth.

Behavioral rule: `userSettings.read()` returning `undefined` is **not** the same as it returning an empty object. `undefined` means "first session, no preferences yet" — grid uses prop defaults. Empty object means "user explicitly reset" — grid still uses prop defaults but suppresses any localStorage fallback (so "Reset all preferences" doesn't accidentally re-apply stale local cache).

**Recommendation:** ratify the API shape. Implementation is one `userSettings?` prop, one `BcUserSettingsStore` interface, and a `useUserSettings()` internal hook in `@bc-grid/react` that bridges the store to the existing controlled-state callbacks.

## 6. Migration path

### For consumers who pass props today (bsncraft, demo apps, examples)

**No change.** Every prop-driven consumer continues to render exactly as today. The vanilla defaults only apply when (a) no prop is supplied AND (b) `vanilla` is set on the grid (v0.5 path) or post-1.0 default flip lands.

### For consumers who relied on old defaults

A consumer doing `<BcGrid columns={…} data={…} />` with no chrome props today gets:

- `showColumnMenu` defaulted to `true` → kebab visible on every header on hover.
- `showFilterRow` column-driven → if any column has `filter: { variant: "inline" }`, filter row visible.

In v0.5 with the additive `vanilla` prop, that consumer still gets the same behavior unless they opt in:

- `<BcGrid vanilla columns={…} data={…} />` → kebab hidden, filter row hidden, but right-click → "Customize…" exposes both as toggles. User can turn them on; toggles persist via `userSettings`.
- `<BcGrid columns={…} data={…} />` → unchanged.

Post-1.0 default flip (v1.1+ tentative): `<BcGrid />` becomes vanilla; consumers wanting old behavior pass `showColumnMenu showFilterRow="any"` or `vanilla={false}` (TBD on the explicit opt-out spelling).

### Recommended one-prop opt-in

```tsx
<BcGrid vanilla {...rest} />
```

`vanilla` is a single boolean prop that flips the two defaults (§3) and uses the expanded `DEFAULT_CONTEXT_MENU_ITEMS_VANILLA`. Equivalent to:

```tsx
<BcGrid
  showColumnMenu={false}
  showFilterRow={false}
  contextMenuItems={DEFAULT_CONTEXT_MENU_ITEMS_VANILLA}
  {...rest}
/>
```

Explicit prop overrides win as always.

**Recommendation:** ship `vanilla` in v0.5.0-alpha.2 as additive. Land bsncraft customers grid migration on `vanilla` mode in v0.5 GA as the migration validation (fits the existing v0.5 gate "bsncraft migrates one CRUD grid to turnkey hooks; -100 LOC").

## 7. v0.5 vs v0.6 scope split

### v0.5.0-alpha.2 (next worker train)

- `BcContextMenuToggleItem` + `BcContextMenuSubmenuItem` types in `@bc-grid/react`.
- Renderer support for `kind: "toggle" | "submenu"` in `internal/context-menu-layer.tsx`.
- New built-in IDs: `filter-by-cell-value`, `clear-all-filters`, `clear-column-filter` (already specified in `context-menu-command-map.md §2.3` — landed alongside this RFC ratification).
- `BcUserSettingsStore` interface + `BcGridProps.userSettings` prop, **read-only path only** (mount-time apply; no write-through yet).
- `vanilla` prop wired to flip `showColumnMenu` and `showFilterRow` defaults; emits `DEFAULT_CONTEXT_MENU_ITEMS_VANILLA`.

### v0.5.0-alpha.3 / v0.5.0 GA

- Full `userSettings.write` debounce + composition with `persistTo`.
- Density toggle via right-click (already a chrome dimension; this wires it through the menu).
- Group-by-this-column built-in (`group-by-column`); expand-all / collapse-all built-ins.
- Reset submenu (`reset-column-state`, `reset-user-settings`).
- bsncraft customers grid migrated to `vanilla` + `userSettings` (proof of -100 LOC stays the v0.5 gate).

### v0.6.0

- Range / clipboard / paste built-ins land in the menu (already on the v0.6 plan; this RFC just reserves the menu real estate).
- Group subtotals toggle (paired with the existing v0.6 group-subtotals work).
- Filter registry toggles (per-column "Filter type ▶ Text / Set / Number" submenu — depends on filter discriminated union from worker2's stretch lane).

### Post-1.0

- Default flip — `<BcGrid />` with no `vanilla` prop renders the vanilla defaults. Reserved for v1.1+ so the major-version contract stays clean.
- Per-column user-settings (`BcUserColumnSettings`) — cell wrap, color override, header rename. Reserved field already shipped in v0.5.

**Recommendation:** ratify the split. v0.5 is additive only — no consumer breaks. The maintainer can override the alpha.2 vs alpha.3 boundary based on what fits one PR pair vs two.

## 8. Worker lane assignment proposal

| Lane | Owner | Scope |
|---|---|---|
| RFC ratification + types | Coordinator | Land this RFC, then ship the type additions (`BcContextMenuToggleItem`, `BcContextMenuSubmenuItem`, `BcUserSettings`, `BcUserSettingsStore`, `BcGridProps.userSettings`, `BcGridProps.vanilla`) as one PR. Updates `api.md`. |
| Persistence wiring | Coordinator | `useUserSettings` internal hook; debounce; compose with `persistTo`; the read-on-mount apply path; tests. One PR. |
| Renderer extension | Worker3 (Claude) | `internal/context-menu-layer.tsx` extended with submenu + toggle dispatch. Ships the `Customize…` submenu skeleton with the View toggles wired. |
| Filter built-ins | Worker2 (Codex) | `filter-by-cell-value`, `clear-column-filter`, `clear-all-filters` per `context-menu-command-map.md §2.3`. Ships under the existing `Filter` group above the `Customize…` submenu. |
| Editor / lookup toggles + density | Worker3 (Claude) | Density radio submenu, `flashOnEdit` toggle, group-by-column toggle. Ships once the renderer extension lands. |
| Server-side toggles | Worker1 (Claude) | Tree expand-all / collapse-all built-ins for server-tree grids, paginate-mode toggle (client ↔ manual) reserved for v0.6 once the maintainer confirms the user-facing shape. |
| bsncraft migration | Coordinator | Customers grid → `vanilla` + `userSettings` backed by their existing user-preferences table. Validation that -100 LOC holds. |

Each worker lane is one focused PR; coordinator owns the integration order (types → renderer → built-ins → persistence wire-through → migration).

**Recommendation:** ratify lanes. Adjust if a worker is mid-flight on something incompatible.

## 9. Open questions for the maintainer

1. **Should `vanilla` be a single boolean prop, or should the defaults flip unconditionally in v0.5?** This RFC recommends *additive* for v0.5, *unconditional flip* deferred to v1.1+. Confirm.
2. **Should `userSettings` and `persistTo` compose, or be mutually exclusive?** This RFC recommends *compose* (userSettings wins on read; persistTo is fast-load cache). Alternative: error if both supplied. Confirm.
3. **`Customize…` as a single submenu, or merge with the existing `View` chrome-rfc area?** This RFC recommends *single submenu* so the discoverability is clear. Alternative: merge into existing built-in groups (no submenu, flat menu grows by ~10 items). Confirm.
4. **Should density live in `BcUserSettings.density` (as proposed) or in `BcUserSettings.layout.density` (matches today's `BcGridLayoutState.density` shape)?** This RFC proposes **top-level** for the persistence API but the toggle still writes through to `BcGridLayoutState.density` for prop-driven consumers. Two paths, same value. Confirm one or both.
5. **Should `vanilla` mode hide the column menu kebab on hover *and* on focus, or hide only on hover and keep focus-discoverable?** AG Grid hides on both. shadcn dropdown patterns expose on focus. This RFC recommends *hide on both*; right-click is the discovery channel. Confirm.
6. **Should "Reset all preferences" call `userSettings.write({ version: 1 })` (empty) or `userSettings.write(undefined)` (delete)?** This RFC recommends *empty object* — preserves "this user has been here" signal vs "first session." Confirm.
7. **Should the menu render grouped (separators between View / Column / Group / Reset) or flat?** This RFC recommends *grouped via submenus*. Alternative: flat top-level with separators (more clicks, less hierarchy). Confirm.
8. **Should `userSettings.subscribe` be required or optional?** This RFC has it optional — multi-tab sync is a power-user feature. Server-push consumers (live preferences) will want it. Confirm optional is acceptable.
9. **Should `BcUserSettings.version` be enforced at the type level (literal `1`) or weak (`number`)?** This RFC uses literal `1` so future migrations are explicit. Confirm.
10. **Should v0.5 ship the `vanilla` prop *before* or *after* the bsncraft customers migration?** This RFC recommends *before* — the migration validates the API. Alternative: ship migration first as a private branch, then publish vanilla. Confirm.

## 10. References

- `docs/design.md` — architecture invariants; §13 decision log
- `docs/api.md` — current `BcGridProps`, `BcGridStateProps`, `BcGridApi`, `BcContextMenuItem` types
- `docs/design/chrome-rfc.md` — original chrome surface design
- `docs/design/context-menu-command-map.md` — context-menu built-in IDs and dispatch protocol (this RFC builds on §2.3 / §2.4 / §2.7)
- `docs/coordination/audit-2026-05/synthesis.md` — audit findings; vanilla mode addresses the discoverability gap surfaced under the "API ergonomics" P0 cluster
- `docs/coordination/v0.5-audit-refactor-plan.md` — current v0.5 scope; this RFC slots into alpha.2 / alpha.3
- `docs/coordination/release-milestone-roadmap.md` — release gates
- `docs/coordination/ui-quality-gate.md` — binding visual rules; §2 hard rejection criteria
- `packages/react/src/contextMenu.ts` — existing resolver / predicate helpers
- `packages/react/src/internal/context-menu-layer.tsx` — existing renderer (lazy-loaded)
- `packages/react/src/types.ts` — current `BcContextMenuItem` / `BcGridProps` / `BcGridLayoutState` shapes
- `packages/react/src/useBcGridState.ts` — existing localStorage persistence path (`persistTo: "local:..."`)
- AG Grid public docs: column menu pattern (`https://www.ag-grid.com/react-data-grid/column-menu/`); context menu pattern (`https://www.ag-grid.com/react-data-grid/context-menu/`) — pattern reference only; no source inspection.
- shadcn DropdownMenu blocks (`https://ui.shadcn.com/docs/components/dropdown-menu`) — submenu / checkbox-item / radio-group patterns; we mirror via Radix primitives already imported.
