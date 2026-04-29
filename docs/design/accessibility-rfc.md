# RFC: Accessibility (accessibility-rfc)

**Status:** Draft for review
**Owner:** x1
**Reviewer:** fresh agent
**Blocks:** `virtualizer-impl`, `react-impl-v0`

---

Accessibility is an architectural constraint for bc-grid. The virtualizer controls which rows and cells exist in the DOM, while the React layer controls focus, keyboard events, labels, and announcements. If those two layers do not share an explicit contract, the grid will either fail screen-reader users or need a costly rewrite.

This RFC defines the Q1 accessibility model for the vertical slice and the constraints later feature work must preserve.

## Goals

- WCAG 2.1 AA for the Q1 read-only grid slice.
- Keyboard-only operation for all Q1 interactions.
- Standards-aligned ARIA semantics for virtualized rows and columns.
- A DOM/focus model that survives row and column virtualization.
- A pinned row/column strategy that keeps the accessibility tree in visual reading order.
- Clear handoff contracts for `@bc-grid/virtualizer`, `@bc-grid/react`, `@bc-grid/theming`, and future `@bc-grid/editors`.

## Non-Goals

- Full editing semantics. Q2 owns editor-specific behavior, but this RFC defines how edit mode is entered and exited.
- Range selection semantics. Q3 owns range selection, but this RFC reserves the live-region and keyboard extension points.
- Pivot accessibility. Q5 owns pivot mode, with a default rule below.
- Mobile-first interaction. Q1 remains desktop-first; this RFC defines a touch fallback so later work does not conflict.

## Source Standards

This RFC follows:

- WAI-ARIA APG grid pattern: https://www.w3.org/WAI/ARIA/apg/patterns/grid/
- WAI-ARIA APG treegrid pattern: https://www.w3.org/WAI/ARIA/apg/patterns/treegrid/
- MDN `aria-rowcount`: https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-rowcount
- MDN `aria-rowindex`: https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-rowindex
- MDN `prefers-reduced-motion`: https://developer.mozilla.org/docs/Web/CSS/%40media/prefers-reduced-motion
- MDN `forced-colors`: https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/forced-colors
- AG Grid public accessibility docs as competitive reference only: https://www.ag-grid.com/angular-data-grid/accessibility/

No AG Grid source code or implementation details are used.

## Decision Summary

| Topic | Decision |
|---|---|
| Flat data role | `role="grid"` |
| Grouped/tree role | `role="treegrid"` when rows can expand/collapse to reveal descendants |
| Grouped-but-flat data | `grid` if groups are non-collapsible visual sections; `treegrid` if groups are expandable |
| Focus model | DOM focus stays on the grid root in navigation mode; active cell is exposed with `aria-activedescendant` |
| Focus retention | The active row and active cell must stay mounted while the grid has focus, even if outside the viewport |
| Row count | `aria-rowcount` is the full semantic row count known to the row model; `-1` when unknown |
| Row index | Every rendered semantic row has 1-based `aria-rowindex` in the full row model, not the rendered window |
| Column count/index | `aria-colcount` is the full visible-column count; every rendered cell/header has absolute `aria-colindex` |
| Pinned panes | Visual panes may be split, but the accessibility tree must expose one logical row with cells in column order |
| Live regions | One polite status region and one assertive alert region owned by `@bc-grid/react` |
| Reduced motion | Transform/scroll/reorder animations become instant; no motion-only feedback |
| Forced colors | System colors and real outlines/borders; never rely on shadows or color alone |
| Touch fallback | Coarse pointer mode uses at least 44px interactive targets and simplified gestures |

## Semantic DOM Model

The accessible surface is a single grid widget:

```html
<div
  role="grid"
  aria-label="Customers"
  aria-rowcount="100001"
  aria-colcount="12"
  aria-activedescendant="bc-grid-cell-row-42-col-balance"
  tabindex="0"
>
  <div role="rowgroup" data-bc-grid-section="header">
    <div role="row" aria-rowindex="1">
      <div role="columnheader" aria-colindex="1" id="bc-grid-header-code">Code</div>
      <div role="columnheader" aria-colindex="2" id="bc-grid-header-name">Name</div>
    </div>
  </div>
  <div role="rowgroup" data-bc-grid-section="body">
    <div role="row" aria-rowindex="43">
      <div
        role="gridcell"
        aria-colindex="1"
        aria-labelledby="bc-grid-header-code bc-grid-cell-row-42-col-code"
        id="bc-grid-cell-row-42-col-code"
      >
        C-0042
      </div>
    </div>
  </div>
</div>
```

Rules:

- The grid root must have exactly one accessible role: `grid` or `treegrid`.
- The root is the only tab stop in navigation mode.
- Rows are exposed with `role="row"` and grouped by `role="rowgroup"` sections.
- Header cells use `role="columnheader"`.
- Body cells use `role="gridcell"` unless a column is explicitly a row header, in which case it uses `role="rowheader"`.
- Sortable headers set `aria-sort="ascending" | "descending" | "none" | "other"` only on the active sorted header where applicable.
- Selectable rows or cells use `aria-selected`. Focus and selection are distinct visual and semantic states.
- Read-only cells do not set `aria-readonly`. Once editing exists, non-editable cells set `aria-readonly="true"` only if editability varies within an editable grid.

## `grid` vs `treegrid`

Use `role="grid"` for:

- Flat client data.
- Server-paged or server-infinite rows that are not hierarchical.
- Master-detail rows where the detail panel is a separate nested region or nested grid, not a child row hierarchy in the same row model.
- Grouped visual sections that are always expanded and are not user-collapsible.

Use `role="treegrid"` for:

- Tree data with parent/child rows.
- Server-tree mode.
- Row grouping where group rows can expand or collapse to show descendants.
- Any row model where visible row order represents a hierarchy.

Treegrid row requirements:

- Expandable group rows set `aria-expanded="true" | "false"`.
- Group/tree rows set `aria-level` with 1 as the root level.
- Child rows set `aria-level` to their depth, even if they are leaves.
- When the row model can cheaply compute sibling position, set `aria-posinset` and `aria-setsize` on rows. If not, omit them rather than guessing.
- Group rows must have a deterministic row ID independent of their expanded state.

Runtime role changes:

- The root role is derived from the active row model.
- If the consumer switches from flat rows to grouping/tree at runtime, `@bc-grid/react` may change `role="grid"` to `role="treegrid"` and must announce the mode change through the polite status region.
- The row model must preserve active cell identity where possible; otherwise focus moves to the first visible data cell and announces the reset.

## Row Count and Row Index

`aria-rowcount` exposes the full semantic row count known to the row model, not the count currently rendered by virtualization.

Rules:

- If total row count is known, set `aria-rowcount` to that total.
- If total row count is unknown, set `aria-rowcount="-1"`.
- Header rows and footer/status rows are semantic rows if they are inside the grid accessibility tree. They count toward `aria-rowcount`.
- Q1 has one header row, so the first data row normally has `aria-rowindex="2"`.
- Each rendered row must have `aria-rowindex` reflecting its 1-based position in the full semantic row model.
- Row indexes must be monotonic within DOM reading order.
- Server row models must provide absolute row indexes for loaded blocks. If absolute indexes are unknown, the server row model must expose `rowcount=-1` and still provide best-known absolute indexes for loaded rows.

Data-row announcements:

- The standards-compliant row index may include the header offset. For user-facing row labels, `@bc-grid/react` may add `aria-label` or `aria-describedby` text such as `Data row 42 of 100000` when screen-reader testing shows the header offset is confusing.
- Do not use live regions for ordinary arrow-key movement. Assistive tech should announce focus movement from the active cell, row index, column header relationship, and cell text.

## Column Count and Column Index

`aria-colcount` exposes the full count of currently visible columns after column visibility is applied, not just columns in the horizontal virtualization window.

Rules:

- Every header and body cell rendered into the accessibility tree has `aria-colindex`.
- `aria-colindex` is 1-based within the current visible-column order.
- Hidden columns are excluded from `aria-colcount` and from `aria-colindex` numbering.
- Pinned columns keep their logical index. A left-pinned column may be `aria-colindex="1"`; a right-pinned actions column may be the last index.
- If a column spans multiple visible columns in a future grouped-header mode, use `aria-colspan` on the header cell.

## Virtualization Contract

`@bc-grid/virtualizer` must expose enough metadata and retention control for `@bc-grid/react` to build the accessibility tree.

Required virtualizer inputs:

```ts
interface VirtualizerA11yInput<RowId, ColumnId> {
  activeCell?: { rowId: RowId; columnId: ColumnId }
  retainedRows?: ReadonlySet<RowId>
  retainedColumns?: ReadonlySet<ColumnId>
  rowCount: number | "unknown"
  columnCount: number
  getRowMeta(rowId: RowId): VirtualRowA11yMeta
  getColumnMeta(columnId: ColumnId): VirtualColumnA11yMeta
}

interface VirtualRowA11yMeta {
  rowId: string
  rowIndex: number
  ariaRowIndex: number
  level?: number
  expanded?: boolean
  selected?: boolean
  disabled?: boolean
  kind: "header" | "data" | "group" | "footer" | "pinned-top" | "pinned-bottom"
}

interface VirtualColumnA11yMeta {
  columnId: string
  columnIndex: number
  ariaColIndex: number
  headerId: string
  pinned?: "left" | "right"
  hidden?: boolean
}
```

Required virtualizer behavior:

- Always render the active row and active cell while the grid has DOM focus.
- Accept retained row IDs from focus, edit mode, and animation handoff.
- Retained focus rows count against a separate budget of at most 2 rows, not the animation budget.
- Never recycle a DOM node without updating its row ID, cell IDs, `aria-rowindex`, `aria-colindex`, and labelled-by relationships in the same render commit.
- If a retained active row is outside the visual viewport, keep it in its real scroll-space position. Do not move it to a fake visible proxy row.
- Provide `scrollToCell(rowId, columnId, { align })` so keyboard navigation can keep active cells visible.
- Provide a way for the React layer to ask whether an active cell is visually visible.

Focus-retention decision:

- bc-grid keeps the active cell DOM node mounted. It does not hand focus to a placeholder.
- The grid root owns DOM focus in navigation mode and points to the active cell with `aria-activedescendant`.
- Because `aria-activedescendant` must refer to an existing element, the virtualizer must retain the active cell element even when it scrolls out of the normal render window.

## Pinned Rows and Columns

Pinned rows and columns are visually useful but risky for assistive tech because separate containers can produce a DOM order that differs from visual reading order.

Decision:

- The accessibility tree must expose a single logical row in column order.
- Pinned cells may be visually positioned with `position: sticky` inside that row.
- If the renderer must use separate visual panes for performance, only one pane may expose cells to the accessibility tree. Duplicate visual cells in other panes must be `aria-hidden="true"` and must not be focusable.
- Do not use `aria-owns` as the default way to stitch pinned containers together. It is allowed only after manual NVDA, JAWS, and VoiceOver testing proves it works for the target DOM shape.
- Pinned top/bottom rows must appear in the DOM order that matches visual order: top pinned rows, normal body rows, bottom pinned rows.
- Sticky group rows are disabled in accessible mode unless they remain in normal DOM order. A sticky clone must be `aria-hidden="true"`.

Implementation implication:

- `virtualizer-spike-v2` must test pinned left and pinned right columns with screen-reader DOM order enabled.
- `virtualizer-spike-v2` must be manually spot-checked with NVDA and VoiceOver against pinned columns before it can be accepted.
- The React layer must provide a debug assertion that no two accessible cells share the same `{rowId, columnId}`.

## Focus Model

bc-grid uses two modes.

### Navigation Mode

- DOM focus is on the grid root.
- The root has `tabindex="0"`.
- The root has `aria-activedescendant` pointing to the active cell ID.
- The active cell is visually indicated with a focus ring.
- Only one active cell exists.
- The active cell is retained in the DOM.

Why not roving `tabindex` on cells:

- Virtualization recycles cells.
- Pinned panes can split cells into multiple containers.
- DOM focus on recycled cells is fragile under fast scroll and sort.
- `aria-activedescendant` keeps browser focus stable while still exposing the active cell.

### Interaction/Edit Mode

- Entering edit mode or widget-interaction mode moves real DOM focus into the editor or the first interactive widget inside the cell.
- The grid suspends arrow-key navigation while the editor/widget owns focus.
- `Escape` returns to navigation mode and restores `aria-activedescendant`.
- `F2` toggles between navigation mode and interaction/edit mode where the cell supports it.
- Q2 editor RFC owns commit/cancel details, but it must preserve this mode boundary.

## Keyboard Model

The Q1 keyboard model follows the WAI-ARIA APG data grid pattern.

### Entry and Exit

| Key | Behavior |
|---|---|
| `Tab` into grid | Focuses the grid root and restores the last active cell, or first data cell if none |
| `Tab` in navigation mode | Moves focus to the next tabbable element after the grid |
| `Shift+Tab` in navigation mode | Moves focus to the previous tabbable element before the grid |
| `Escape` in navigation mode | No-op unless a menu/popover is open |

### Cell Navigation

| Key | Behavior |
|---|---|
| `ArrowRight` | Move active cell one visible column right; stop at row edge |
| `ArrowLeft` | Move active cell one visible column left; stop at row edge |
| `ArrowDown` | Move active cell one visible row down; scroll if needed |
| `ArrowUp` | Move active cell one visible row up; scroll if needed |
| `Home` | Move to first visible column in current row |
| `End` | Move to last visible column in current row |
| `Ctrl+Home` / `Cmd+Home` | Move to first visible data cell |
| `Ctrl+End` / `Cmd+End` | Move to last known visible data cell; if row count unknown, move to last loaded row and announce unknown total |
| `PageDown` | Move down by the number of fully visible body rows minus one |
| `PageUp` | Move up by the number of fully visible body rows minus one |
| `Ctrl+ArrowRight` / `Cmd+ArrowRight` | Move to the next non-empty data edge in the row if the row model exposes it; otherwise last visible column |
| `Ctrl+ArrowLeft` / `Cmd+ArrowLeft` | Move to the previous non-empty data edge in the row if available; otherwise first visible column |
| `Ctrl+ArrowDown` / `Cmd+ArrowDown` | Move to the next non-empty data edge in the column if available; otherwise last known visible row |
| `Ctrl+ArrowUp` / `Cmd+ArrowUp` | Move to the previous non-empty data edge in the column if available; otherwise first data row |

Use `Meta` on macOS as an alias for `Ctrl` for data-edge movement.

### Activation and Editing

| Key | Behavior |
|---|---|
| `Enter` | If the active cell is editable, enter edit mode; otherwise perform the cell default action |
| `F2` | Toggle interaction/edit mode for editable or widget cells |
| Printable character | If editable, enter edit mode and seed the editor with the character |
| `Escape` in edit mode | Cancel edit and return to navigation mode |
| `Enter` in edit mode | Q2 editor contract decides commit behavior |
| `Tab` in edit mode | Q2 editor contract decides commit/move behavior; base grid does not trap Tab in display mode |

### Selection Extension Points

Q1 does not implement range selection. Reserve these keys for Q3:

- `Shift+Arrow`
- `Ctrl+Shift+Arrow` / `Cmd+Shift+Arrow`
- `Ctrl+A` / `Cmd+A`
- `Shift+Space`
- `Ctrl+Space` / `Cmd+Space`

Until range/row selection exists, these combinations should not trigger browser text selection inside the grid.

## Live Regions

`@bc-grid/react` owns two visually hidden live regions adjacent to the grid root:

```html
<div data-bc-grid-status role="status" aria-live="polite" aria-atomic="true" />
<div data-bc-grid-alert role="alert" aria-live="assertive" aria-atomic="true" />
```

Rules:

- Do not use live regions for ordinary arrow-key cell navigation.
- Use polite announcements for completed state changes.
- Use assertive announcements for errors that require user action.
- Debounce high-frequency announcements to avoid speech backlog.
- Live text is localized through the React layer; no hard-coded English inside engine packages.

Announcement contract:

| Event | Region | Message shape |
|---|---|---|
| Sort changed | Polite | `Sorted by {columnLabel} {direction}.` |
| Sort cleared | Polite | `Sorting cleared.` |
| Filter changed | Polite | `Filter applied. {visibleRows} of {totalRows} rows shown.` |
| Filter cleared | Polite | `Filter cleared. {totalRows} rows shown.` |
| Cell edit committed | Polite | `Updated {columnLabel} for {rowLabel} to {formattedValue}.` |
| Cell edit rejected | Assertive | `{columnLabel} was not updated. {reason}.` |
| Selection changed | Polite, debounced | `{count} rows selected.` or `Selection cleared.` |
| Range selection changed | Polite, debounced | Deferred to Q3; message must include range size |
| Group expanded | Polite | `Expanded {rowLabel}.` optionally `{childCount} rows.` |
| Group collapsed | Polite | `Collapsed {rowLabel}.` |
| Server load started | Polite | `Loading rows.` only when user-triggered or longer than 500ms |
| Server load failed | Assertive | `Rows could not be loaded. {reason}.` |

## Reduced Motion

When `prefers-reduced-motion: reduce` matches:

- Disable row reorder FLIP animations.
- Disable row insert/remove slide animations.
- Disable expand/collapse slide animations.
- Disable smooth scrolling for `scrollToCell` and `scrollToRow`.
- Disable animated selection rectangle growth.
- Replace cell flash animation with a non-motion static highlight that appears and disappears without transition.
- Keep focus rings, selection outlines, and edited-state indicators visible without motion.
- The animation package should expose a single `motionPolicy` value: `"normal" | "reduced"`.

Do not substitute transform motion with 50ms motion. Reduced motion means no movement; short color transitions are allowed only after manual testing confirms they do not create perceptible motion.

## Forced Colors and High Contrast

The theming package must provide forced-colors rules for the grid.

Rules:

- Use CSS system colors under `@media (forced-colors: active)`.
- Use `Canvas` / `CanvasText` for base surfaces and text.
- Use `Highlight` / `HighlightText` for selected rows/cells.
- Use `ButtonText` or `CanvasText` for borders where system color contrast is needed.
- Focus indicators use real outlines, not box shadows.
- Do not set `forced-color-adjust: none` globally. Use it only for rare icons that are otherwise illegible after testing.
- SVG icons use `currentColor` for stroke/fill.
- Sort direction, validation errors, dirty state, and selection state must not rely on color alone. Pair color with icon, text, border style, or shape.

Minimum forced-colors CSS contract:

```css
@media (forced-colors: active) {
  .bc-grid {
    --bc-grid-bg: Canvas;
    --bc-grid-fg: CanvasText;
    --bc-grid-border: CanvasText;
    --bc-grid-row-selected: Highlight;
    --bc-grid-row-selected-fg: HighlightText;
    --bc-grid-focus-ring: Highlight;
  }

  .bc-grid [data-bc-grid-active-cell="true"] {
    outline: 2px solid Highlight;
    outline-offset: -2px;
  }
}
```

## Pointer and Touch Fallback

Q1 is desktop-first, but touch support must not conflict with later mobile work.

Rules:

- Detect coarse pointers with `@media (pointer: coarse)` and pointer events.
- In coarse-pointer mode, interactive controls inside headers/cells must expose at least a 44px by 44px hit target, even when the visual icon is smaller.
- If density is `compact` and a coarse pointer is detected, default the grid to `normal` or `comfortable` interaction hit targets while preserving the visual density where practical.
- Single tap focuses/selects the cell.
- Double tap enters edit mode when editable.
- Long press opens the context menu once context menu exists. Default threshold: 500ms.
- Dragging on the body scrolls; range drag gestures are Q3 and must not break native scrolling.
- Pointer selection handles introduced in Q3 must have 44px hit targets.

## Package Responsibilities

### `@bc-grid/core`

- Defines accessibility-related types only, such as row/cell positions and state event payloads.
- Does not import DOM, React, or ARIA helper code.

### `@bc-grid/virtualizer`

- Computes visible rows and columns plus retained active/focus rows.
- Provides absolute row/column indexes.
- Provides `scrollToCell` and visibility queries.
- Does not set ARIA attributes itself.

### `@bc-grid/react`

- Owns roles, ARIA attributes, IDs, labels, focus management, keyboard event handling, and live regions.
- Owns `aria-activedescendant` state.
- Owns screen-reader announcement text.
- Owns debug assertions that catch duplicate accessible cells, missing labels, or stale active descendants.

### `@bc-grid/theming`

- Owns CSS variables for focus, selection, validation, hover, and forced-colors states.
- Owns `prefers-reduced-motion` CSS defaults.

### `@bc-grid/editors`

- Q2 editors must implement the edit-mode contract from this RFC.
- Editors must expose labels and validation errors through `aria-labelledby`, `aria-describedby`, and `aria-invalid` as appropriate.

## Acceptance Criteria for Q1 Implementation

- `virtualizer-spike-v2` demonstrates 100k rows with correct `aria-rowcount` and `aria-rowindex` on a subset of rows.
- Active cell remains mounted and `aria-activedescendant` remains valid while scrolling.
- Focus-retained rows stay within the 2-row retention budget.
- Pinned left and right columns do not create duplicate accessible cells.
- Pinned column DOM order is spot-checked with NVDA and VoiceOver.
- Keyboard navigation passes the table in this RFC for flat data.
- `Tab` exits the grid in navigation mode.
- `Enter`, `F2`, and `Escape` mode transitions are implemented at the grid shell level, even before real editors exist.
- Sort changes update `aria-sort` and announce through the polite region.
- `prefers-reduced-motion` disables transform and smooth-scroll motion.
- Forced-colors mode shows visible borders, focus ring, and selection.
- axe-core has no violations for the Q1 demo.

## Test Plan

### Automated

- Unit tests for keyboard state transitions in `@bc-grid/react`.
- Unit tests for row/column index metadata from `@bc-grid/virtualizer`.
- Integration tests for:
  - root role and counts,
  - active descendant validity,
  - retained active row after scroll,
  - pinned column accessible order,
  - sort `aria-sort`,
  - selection/focus distinction once selection exists.
- Playwright tests for:
  - keyboard navigation,
  - `Tab` entry/exit,
  - reduced motion via `page.emulateMedia({ reducedMotion: "reduce" })`,
  - forced colors where browser support allows,
  - axe-core scan on every Q1 example.

### Manual

Run before Q1 exit:

- macOS VoiceOver + Safari current.
- macOS VoiceOver + Chrome current.
- Windows NVDA + Firefox current.
- Windows NVDA + Chrome current.
- Windows JAWS + Chrome current.

Manual script:

1. Tab into the grid.
2. Move across and down cells with arrows.
3. Page down/up through virtualized rows.
4. Jump to first/last rows and columns.
5. Sort a column and confirm announcement.
6. Scroll with pointer so active row leaves the visible viewport, then press an arrow key and confirm the grid recovers predictably.
7. Confirm pinned columns are announced in visual order.
8. Enable reduced motion and confirm sort/scroll animations stop.
9. Enable forced colors and confirm focus/selection remain visible.

## Resolved Open Questions

### Is the cell-focused state announced on every arrow movement?

No live-region announcement on ordinary arrow movement. The active cell itself provides the announcement through focus semantics, labelled headers, row/column indexes, and cell text. Page jumps and data-edge jumps may announce the new data row range only if manual screen-reader testing shows the jump is otherwise unclear.

### How do we announce range size to screen readers?

Deferred to Q3 range-selection RFC. Constraint: range selection must use the existing polite live region and must debounce messages. The minimum message shape is `{rowCount} rows by {columnCount} columns selected` plus start/end cell labels where practical.

### Pivot mode: `treegrid` or something else?

Deferred to Q5 pivot RFC. Default rule: use `treegrid` if pivot output exposes expandable row or column group hierarchy; otherwise use `grid`. Pivot mode must not introduce a third root role.

## Review Checklist

- Does this preserve a single logical accessibility tree for pinned/virtualized content?
- Does the virtualizer contract expose enough metadata without importing React or ARIA code?
- Does the keyboard model match APG for a data grid?
- Are all live-region messages necessary and bounded?
- Can Q1 implement this without building Q2 editing or Q3 range selection early?
- Are any requirements likely to break the 60fps virtualizer spike?
