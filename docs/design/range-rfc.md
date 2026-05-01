# RFC: Range Selection (range-rfc)

**Status:** Draft for review
**Owner:** c2 (auditor + coordinator)
**Reviewer:** fresh agent (target: c1 or x1)
**Blocks:** `range-state-machine`, `visual-selection-layer`, `clipboard-copy-tsv-html`, `clipboard-paste-from-excel`, `fill-handle`. Related (independent): `master-detail`, `column-groups-multi-row-headers`, `sticky-header-polish`.
**Informed by:** `docs/api.md §reserved Q3` (`BcRange` placeholder), `docs/design.md §12` (range-selection sketch), `docs/design/accessibility-rfc.md §Selection Extension Points` (Q3-reserved keys), `docs/design/editing-rfc.md` (commit pipeline reuse for range paste), `docs/design/server-query-rfc.md` (selection over unloaded rows)
**Sprint context:** Track 2 of the v1 parity sprint (`docs/coordination/v1-parity-sprint.md`)

---

Range selection is the **hardest single thing in v1** per `design.md §12`. This RFC pins the model + state machine + clipboard contract + fill handle so Track 2 implementers can build the visual layer + clipboard + fill in parallel after the state machine lands.

## Goals

- Excel-feel: click + drag, Shift+click extends, Ctrl/Cmd+click adds new range, Shift+Arrow extends, Ctrl+Shift+Arrow extends to data edge.
- Multi-range: a `BcRange[]` represents the active selection; user sees rectangles for each.
- Copy as TSV (text/plain) + HTML (text/html) — round-trips with Excel + Google Sheets + bc-grid itself.
- Paste from Excel: tab-delimited multi-cell values land at the active anchor; per-cell `valueParser` + `validate` runs; atomic apply.
- Fill handle: drag-square at bottom-right of the active range; release to fill (linear / copy / smart-fill).
- Composes with the existing row selection (#37) — they're disjoint surfaces (row-IDs vs cell-positions) but render on the same DOM.
- Accessible: keyboard parity with mouse (Shift+Arrow / Ctrl+Shift+Arrow / Ctrl+A); range-size announcements through polite live region (debounced).
- Survives virtualization: range cells outside the render window stay in the model; visual rectangles are drawn relative to the scroll position.

## Non-Goals

- **Cell-level multi-row paste with row-level identity.** A paste-from-Excel row creates new rows if pasted past the last row; v1 does NOT auto-create rows. Out-of-bounds paste truncates.
- **Cross-grid drag-and-drop.** Out of scope; copy/paste roundtrip via clipboard is the only cross-grid mechanism.
- **Formula propagation** (Excel `=A1+1` filling adjusting refs). bc-grid is a data grid, not a spreadsheet.
- **Frozen-row aware paste.** Pinned-top / pinned-bottom rows participate in selection like normal rows; no special paste behaviour.
- **Range selection inside grouped/treegrid mode at v1.** Group rows participate as single rows (not as expandable cell ranges); the fill handle skips group rows.
- **Touch range selection** (drag with finger). Mobile fallback per `accessibility-rfc §Pointer and Touch Fallback` defers range to a future task.

## Source standards

- WAI-ARIA APG `grid` pattern range / multi-range guidance: https://www.w3.org/WAI/ARIA/apg/patterns/grid/
- TSV / HTML clipboard interop: https://html.spec.whatwg.org/multipage/dnd.html#dom-datatransfer-getdata
- Excel keyboard model: https://support.microsoft.com/en-us/office/keyboard-shortcuts-in-excel-1798d9d5-842a-42b8-9c99-9b7213f0040f
- AG Grid public docs (range-selection reference; **public docs only** per `AGENTS.md §3.2`): https://www.ag-grid.com/react-data-grid/range-selection/

## Decision summary

| Topic | Decision |
|---|---|
| Range type | `BcRange = { start: BcCellPosition; end: BcCellPosition }` (already declared `api.md §reserved Q3`). Both `start` and `end` are inclusive cell positions. |
| Multi-range | `BcRangeSelection = { ranges: readonly BcRange[]; anchor: BcCellPosition | null }`. The active range is `ranges[ranges.length - 1]`; the anchor lives outside the array (resets on plain click; preserved across Shift / Ctrl operations). |
| State location | `core/range.ts` (engine-layer state machine, no DOM) → `react/range.tsx` (render layer). Per `design.md §12`. |
| Visual rendering | Absolute-positioned overlay layer above the cell grid. One `<div>` per range. Pinned regions get cloned overlays so visual rectangles span the pinned↔body boundary correctly. |
| Click + drag | `pointerdown` on a body cell sets anchor, drag updates active range to the cell under pointer. `pointerup` finalises. Auto-scroll if pointer near viewport edge during drag. |
| Shift+click | Extend the active range from anchor to clicked cell. Anchor unchanged. |
| Ctrl+click / Cmd+click | Start a new range at the clicked cell, append to `ranges[]`. Anchor moves to clicked cell. |
| Shift+Arrow | Extend the active range one cell in arrow direction. Anchor unchanged. |
| Ctrl+Shift+Arrow / Cmd+Shift+Arrow | Extend the active range to the next non-empty data edge in arrow direction. |
| Ctrl+A / Cmd+A | Select all cells (single range from `(0,0)` to `(lastRow, lastCol)`). |
| Shift+Space | Select the active row (range = active row × all cols). Per `accessibility-rfc §Selection Extension Points` (Q3-reserved). |
| Ctrl+Space / Cmd+Space | Select the active column (range = all rows × active col). Per RFC. |
| Esc | Clear all ranges. Active cell stays put. |
| Copy (Ctrl/Cmd+C) | Active range copies as TSV + HTML to clipboard. Multi-range copies the bounding-box of the **last range** only (Excel behaviour); a future hotkey could allow disjoint copy. |
| Paste (Ctrl/Cmd+V) | TSV from clipboard splits at `\t` and `\n`; applied left-to-right, top-to-bottom from the active anchor. Out-of-bounds truncated. Per-cell `column.valueParser` + `column.validate` runs; atomic apply (all-or-rollback). |
| Fill handle | Visual square at bottom-right of the active range when single-range. Drag extends in one direction; release fills. Linear-detection: if the source range contains a numeric or date sequence (3 cells: 1,2,3 or Mon,Tue,Wed), continue the sequence. Otherwise: copy. |
| Range vs row selection | Independent. Range selection (`BcRangeSelection` cell-keyed) and row selection (`BcSelection` row-id-keyed from #37) coexist; the visual layer renders both. Same row can be in both. |

---

## Range model

### Core types (engine layer, `@bc-grid/core`)

```ts
// Already declared in api.md §reserved Q3:
export interface BcRange {
  start: BcCellPosition  // inclusive
  end: BcCellPosition    // inclusive
}

// NEW (this RFC, additive to core):
export interface BcRangeSelection {
  ranges: readonly BcRange[]
  /** The cell that anchors Shift+arrow / Shift+click extension. Null when no range is active. */
  anchor: BcCellPosition | null
}

export const emptyBcRangeSelection: BcRangeSelection = { ranges: [], anchor: null }

// Helpers (functions in @bc-grid/core/range):
export function rangeContains(range: BcRange, position: BcCellPosition, columns: readonly { columnId: ColumnId }[], rowIds: readonly RowId[]): boolean
export function rangesContain(selection: BcRangeSelection, position: BcCellPosition, columns: readonly { columnId: ColumnId }[], rowIds: readonly RowId[]): boolean
export function rangeBounds(range: BcRange, columns, rowIds): { rowSpan: number; colSpan: number }
export function expandRangeTo(active: BcRange, target: BcCellPosition, columns, rowIds): BcRange
export function newRangeAt(position: BcCellPosition): BcRange
```

The helpers take `columns` + `rowIds` because positions use `RowId` / `ColumnId` (string-stable), but range membership is index-based — the engine resolves the indices. This matches `design.md §13` "Index ↔ row ID translation is the React layer's responsibility, not the engine's" — except for range, where the **engine** does the translation in helpers (still no DOM, still no React).

### State machine actions

```ts
// All in @bc-grid/core/range:
export function rangePointerDown(state: BcRangeSelection, target: BcCellPosition, modifiers: { shift?: boolean; ctrlOrMeta?: boolean }): BcRangeSelection
export function rangePointerMove(state: BcRangeSelection, target: BcCellPosition, columns, rowIds): BcRangeSelection
export function rangePointerUp(state: BcRangeSelection): BcRangeSelection
/**
 * Core-owned key-action discriminated union. Engine packages cannot import
 * `KeyboardNavOutcome` from @bc-grid/react — that's a React-layer type. The
 * React layer translates its own keyboard-event handling into one of these
 * BcRangeKeyAction values and dispatches to rangeKeydown.
 */
export type BcRangeKeyAction =
  | { type: "extend"; direction: "up" | "down" | "left" | "right"; toEdge?: boolean }   // Shift+Arrow / Ctrl+Shift+Arrow
  | { type: "select-all" }                                                                // Ctrl/Cmd+A
  | { type: "select-row" }                                                                // Shift+Space
  | { type: "select-column" }                                                             // Ctrl/Cmd+Space
  | { type: "clear" }                                                                     // Esc

export function rangeKeydown(state: BcRangeSelection, action: BcRangeKeyAction, columns, rowIds): BcRangeSelection
export function rangeSelectAll(columns, rowIds): BcRangeSelection
export function rangeClear(state: BcRangeSelection): BcRangeSelection
```

Pure functions; unit-testable in Node.

### Public surface (`@bc-grid/react`)

```ts
// Additive to BcGridStateProps in @bc-grid/core (Q3-reserved → unblocked here):
interface BcGridStateProps {
  // ...existing fields...
  rangeSelection?: BcRangeSelection
  defaultRangeSelection?: BcRangeSelection
  onRangeSelectionChange?: (next: BcRangeSelection, prev: BcRangeSelection) => void
}
```

Plus on `BcGridProps` (additive). **State-vs-options split** — two distinct surfaces so neither overloads the other:

```ts
interface BcGridProps<TRow> {
  // ...existing fields...

  // STATE pair (extends BcGridStateProps above):
  // rangeSelection / defaultRangeSelection / onRangeSelectionChange — controlled state.

  // OPTIONS — behaviour configuration (separate from state):
  /** Enable + configure range selection. Default: undefined = disabled. true = enabled with defaults. */
  rangeSelectionOptions?: boolean | BcRangeSelectionOptions
}

interface BcRangeSelectionOptions {
  /** Allow multiple disjoint ranges. Default true. */
  multiRange?: boolean
  /** Enable the fill handle on the active range. Default true. */
  fillHandle?: boolean
  /** Cap on cell count per range to prevent runaway selections. Default 1_000_000. */
  maxCellCount?: number
  /**
   * When true, a plain mouse click on a cell starts a NEW range and does
   * NOT also affect the row-selection state (#37). Default false — at v1
   * a plain click both starts a range AND selects the row, matching Excel.
   */
  preventRowSelection?: boolean
}
```

The `rangeSelection` (state) and `rangeSelectionOptions` (behaviour) names are deliberately distinct so type-check + autocomplete disambiguate. The earlier draft conflated both under `rangeSelection` — that didn't type-check (BcGridProps extends BcGridStateProps where `rangeSelection: BcRangeSelection`).

---

## Visual selection layer

### DOM shape

A new sibling element next to `.bc-grid-canvas`:

```
.bc-grid-scroller
  ├── .bc-grid-canvas              (existing — body rows + cells)
  └── .bc-grid-range-overlay       (NEW — absolute, pointer-events: none above canvas)
        ├── .bc-grid-range-rect    (one per range)
        │   └── .bc-grid-fill-handle (only on active range when single)
        └── .bc-grid-range-rect ...
```

### Positioning

Each `.bc-grid-range-rect` is `position: absolute` with `top` / `left` / `width` / `height` computed from:
- Start cell index → cumulative offset from Fenwick tree (rows + cols) per `design.md §13`.
- Range height = sum of row heights from start to end (Fenwick prefixSum).
- Range width = sum of column widths from start to end (same).
- The overlay container shares the canvas's coordinate system so the rect moves with scroll naturally — no JS-driven scroll-sync needed for the body case.

### Pinned regions

Pinned-left / pinned-right cells use JS-driven `translate3d` per `design.md §13`. The range overlay must replicate this for cells in pinned regions:
- Pinned-left + body span: render two rectangles (one in the pinned-left region, one in the body). The pinned-left rectangle uses `translate3d(scrollLeft, 0, 0)` to stay anchored.
- Pinned-right + body span: same, mirrored.
- Pinned-top / pinned-bottom + body span: vertical equivalent.
- Corner combinations: 4-way split, one rectangle per region.

The visual layer reads the pinned-region offsets from the existing `Virtualizer` window output (`VirtualWindow` per `api.md §9`).

### Z-index

Per `design.md §13` decision: "Pinned rows render at z-index 3, pinned cells at z-index 2. Body rows + cells use the default."

Range overlay z-indices:
- `.bc-grid-range-overlay` (body region): z-index 1 — above body cells, below pinned cells.
- `.bc-grid-range-overlay-pinned-*` (pinned regions): z-index 4 — above pinned rows so the rect is visible over pinned content.

### Visual style

Range fill: 8% opacity of the host's `--ring` color (typically the focus ring blue). Border: 2px solid `--ring`, full opacity. Active range gets a slightly stronger border (3px or higher saturation). Fill handle: 8x8 px square, `--ring` colour, bottom-right of active rect.

CSS variables:
```css
.bc-grid-range-rect {
  background: hsl(var(--ring) / 0.08);
  border: 2px solid hsl(var(--ring));
}
.bc-grid-range-rect[data-active="true"] {
  border-width: 3px;
}
.bc-grid-fill-handle {
  width: 8px;
  height: 8px;
  background: hsl(var(--ring));
  cursor: crosshair;
  /*
   * The parent `.bc-grid-range-overlay` is `pointer-events: none` so the
   * canvas underneath stays interactive. The fill handle is the one
   * exception: it must receive pointer events to start fill-drag mode.
   */
  pointer-events: auto;
}
```

Forced-colors override per `accessibility-rfc §Forced Colors`:
```css
@media (forced-colors: active) {
  .bc-grid-range-rect {
    background: transparent;
    border-color: Highlight;
    forced-color-adjust: none;  /* needed for the rect outline visibility */
  }
}
```

---

## Clipboard

### Copy (Ctrl/Cmd+C)

When the user presses Ctrl/Cmd+C with at least one range active:

1. Resolve the **last range** (`ranges[ranges.length - 1]`). Multi-range disjoint copy is not supported at v1 (matches Excel default).
2. Walk the cells row-by-row:
   - For each cell: get raw value via `column.valueGetter` (or `row[field]`).
   - Format via `column.valueFormatter` (preferred) or `format` preset (fallback) or `String(value)`.
3. Build TSV: rows separated by `\n`, cells by `\t`. Quote cells containing `\t` / `\n` per RFC 4180-ish (use `"` quoting; escape internal `"` as `""`).
4. Build HTML: a `<table>` with `<tr>` / `<td>` matching the formatted text. This lets paste into Word / Outlook preserve the cell structure.
5. Write both to clipboard via `ClipboardItem`:
   ```ts
   navigator.clipboard.write([
     new ClipboardItem({
       "text/plain": new Blob([tsv], { type: "text/plain" }),
       "text/html": new Blob([html], { type: "text/html" }),
     })
   ])
   ```

Copy fires two consumer hooks. **Pure-return-value model** (no `preventDefault` / mutable event objects — easier to type, easier to test, no race conditions):

```ts
/**
 * Pre-copy hook. Returning a payload object replaces what's written to the
 * clipboard. Returning `false` suppresses the copy (clipboard untouched).
 * Returning `undefined` (or omitting the hook) accepts the default payload.
 */
type BcRangeBeforeCopyHook<TRow> = (
  event: BcRangeBeforeCopyEvent<TRow>,
) => BcClipboardPayload | false | undefined | void

interface BcRangeBeforeCopyEvent<TRow> {
  range: BcRange
  rows: readonly TRow[]                  // rows the range touches
  api: BcGridApi<TRow>
}

interface BcClipboardPayload {
  /** REQUIRED. text/plain — typically TSV. */
  tsv: string
  /** OPTIONAL. text/html — typically a <table>. Bc-grid generates a default if absent. */
  html?: string
  /** OPTIONAL. Custom MIME types — bc-grid writes these alongside text/plain + text/html. Used for the "text/x-bc-grid+json" round-trip. */
  custom?: Record<string, string>
}

/**
 * Post-copy hook (after clipboard write). Read-only.
 */
type BcRangeCopyHook<TRow> = (event: BcRangeCopyEvent<TRow>) => void

interface BcRangeCopyEvent<TRow> {
  range: BcRange
  payload: BcClipboardPayload
  /** True if onBeforeCopy returned `false` and the clipboard write was skipped. */
  suppressed: boolean
}
```

Wired via `BcGridProps`:
```ts
onBeforeCopy?: BcRangeBeforeCopyHook<TRow>
onCopy?: BcRangeCopyHook<TRow>
```

The previous draft conflated `preventDefault()`-style suppression with TSV-only substitution. This model is cleaner: TSV / HTML / custom MIME are all replaceable, and suppression is a `false` return rather than a mutation on a passed-in event object.

### Copy with headers (Ctrl/Cmd+Shift+C)

Same as copy, but prepend a header row containing each column's `header` (or `column.header` resolved if it's a ReactNode — fallback to the field name). Useful for pasting into a fresh spreadsheet.

### Paste (Ctrl/Cmd+V)

When the user presses Ctrl/Cmd+V with at least one cell focused:

1. Read clipboard via `navigator.clipboard.read()`. Prefer `text/html` if available (richer); fall back to `text/plain` (TSV).
2. Parse:
   - HTML: extract `<tr>` / `<td>` text content (strip nested HTML — paste destination is plain text values).
   - TSV: use `@bc-grid/core.parseTsvClipboard(input)`. It handles the spreadsheet TSV subset needed for Excel / Google Sheets interop: tabs split cells, CRLF/LF/CR split rows, quoted cells may contain tabs/newlines, doubled quotes unescape to one quote, trailing row delimiters do not create an extra blank row, and malformed quotes are parsed best-effort with diagnostics.
3. Apply at the active cell (or the start of the active range if a range is active):
   - Rows iterate down from anchor row.
   - Cells iterate right from anchor column.
   - Out-of-bounds (past last row / last col): truncate.
4. Per-cell pipeline (reuses `editing-rfc §Row-model ownership`):
   - If `column.valueParser`: `nextValue = column.valueParser(input, row)`.
   - Else: `nextValue = input` (raw string).
   - If `column.validate`: run; collect failures.
5. **Atomic apply**: if any per-cell `validate` returns `valid: false`, abort all changes; surface via assertive live-region + collected validation errors in the post-event. If all valid: apply all overlays simultaneously (single React state update); fire `onCellEditCommit` for each cell (consistent with single-cell editing); after all per-cell events, fire `onRangePasteCommit` once.

Hooks (additive on `BcGridProps`):

```ts
onBeforePaste?: (event: BcRangeBeforePasteEvent<TRow>) => boolean | void
onRangePasteCommit?: (event: BcRangePasteEvent<TRow>) => void
```

```ts
interface BcRangeBeforePasteEvent<TRow> {
  /** Where the paste will land, computed from the active anchor and the parsed cell matrix dimensions. */
  targetRange: BcRange
  /** Parsed input — rows × cols, post-clipboard-parse, pre-valueParser. */
  cells: readonly (readonly string[])[]
  api: BcGridApi<TRow>
}

interface BcRangePasteEvent<TRow> {
  /** Where the paste landed (clipped to grid bounds). */
  targetRange: BcRange
  /** Parsed input — same as the before event. */
  cells: readonly (readonly string[])[]
  /** How many cells were applied (after truncation). */
  appliedCount: number
  /**
   * Cells that were truncated due to out-of-bounds (past last row / last col).
   * Count only — the cells themselves are in `cells` indexed past `appliedCount`.
   */
  truncatedCount: number
  /** Validation errors keyed by `${rowIdx}:${colIdx}` within `cells`. Empty if all valid. */
  validationErrors: Record<string, string>
  /** True if onCellEditCommit fired for each successfully-applied cell. Always true at v1. */
  perCellEventsFired: true
}
```

`onBeforePaste` returning `false` aborts the paste (no clipboard read attempted on subsequent fire). Returning `void` / `undefined` accepts.

Paste from a non-bc-grid source (Excel / Google Sheets) is the same pipeline — TSV is the lowest common denominator. The `text/x-bc-grid+json` lossless format below takes precedence when available.

### Round-trip with bc-grid → bc-grid

Bc-grid's TSV format is RFC 4180-compliant + uses `column.valueFormatter` for cell formatting. Pasting back reads the same format. For a true lossless round-trip (preserving raw values, not formatted strings), bc-grid additionally writes a `text/x-bc-grid+json` clipboard type containing the raw values + column ids:

```json
{
  "version": 1,
  "columnIds": ["code", "name", "balance"],
  "rows": [["C-001", "Acme", 1234.5], ...]
}
```

Paste handler tries `text/x-bc-grid+json` first; falls back to TSV if absent. This handles the common case where copy → paste within the same grid skips the format/parse roundtrip and preserves type fidelity (e.g., dates as Date objects).

---

## Fill handle

Visible only when:
- `rangeSelectionOptions.fillHandle !== false`
- Exactly one range is active
- The range is at least 1×1 (any size)
- The range doesn't span pinned↔body boundaries (UX simplification at v1; future relax)

### Drag behaviour

1. `pointerdown` on the fill-handle square enters fill-drag mode.
2. As the pointer moves, the active range *visually extends* in the direction of the drag (preview line, not committed).
   - If drag is dominantly vertical: extend down or up; preserve column span.
   - If drag is dominantly horizontal: extend right or left; preserve row span.
   - Diagonal drag: take the larger axis.
3. `pointerup`: commit. Apply `fillStrategy` to populate the new cells.

### Fill strategies

Three strategies, auto-detected:

**`linear`** — applies when the source range contains 2+ cells with a numeric or date sequence:
- Source: `[1, 2, 3]` → fill: `[4, 5, 6, 7, ...]`
- Source: `[2026-01-01, 2026-01-02]` → fill: `[2026-01-03, 2026-01-04, ...]`
- Detection: take the first `min(3, sourceLength)` cells; if all numeric and form an arithmetic progression, use linear. If all dates and form a daily/weekly progression, use date-linear.

**`copy`** — default fallback when no sequence is detected:
- Source: `[A, B]` → fill: `[A, B, A, B, A, B, ...]` (cycling)

**`smart-fill`** (v1.1+) — uses heuristics for text patterns ("Item 1", "Item 2" → "Item 3"). Out of v1 scope; document as future.

### Per-cell pipeline

Same as paste: each filled cell runs `valueParser` + `validate`. Atomic apply. Fires `onCellEditCommit` per filled cell, then `onRangeFillCommit` once after the batch:

```ts
onRangeFillCommit?: (event: BcRangeFillEvent<TRow>) => void

interface BcRangeFillEvent<TRow> {
  /** The original (source) range that the user dragged from. */
  sourceRange: BcRange
  /** The full target range after the drag (sourceRange ∪ extension). */
  targetRange: BcRange
  /** Strategy auto-selected by the framework. */
  strategy: "linear" | "copy"
  /** Cells written to the overlay during this fill. */
  appliedCount: number
  /** Cells skipped because target ran past grid bounds. */
  truncatedCount: number
  /** Validation errors keyed by cell-position-within-targetRange. Empty if all valid. */
  validationErrors: Record<string, string>
  /** Always true at v1 — `onCellEditCommit` fired per applied cell before this event. */
  perCellEventsFired: true
  api: BcGridApi<TRow>
}
```

### Keyboard alternative

No keyboard shortcut for fill at v1 (mouse only). Excel uses Ctrl+D (fill-down) and Ctrl+R (fill-right); these remain unbound for future use. Consumer can register custom shortcuts via the existing keyboard event hooks.

---

## Keyboard model

Refines `accessibility-rfc §Selection Extension Points`. These keys were Q3-reserved; this RFC unblocks them.

| Key | Behaviour | Anchor effect |
|---|---|---|
| Shift+ArrowUp/Down/Left/Right | Extend the active range one cell in the arrow direction | Unchanged |
| Ctrl/Cmd+Shift+Arrow | Extend the active range to the next non-empty data edge | Unchanged |
| Ctrl/Cmd+A | Select all cells (one range from `(0,0)` to `(lastRow, lastCol)`) | Anchor moves to `(0,0)` |
| Shift+Space | Select the active row (range = active row × all cols) | Anchor stays |
| Ctrl/Cmd+Space | Select the active column (range = all rows × active col) | Anchor stays |
| Esc | Clear all ranges | Anchor cleared |

These integrate into the existing `nextKeyboardNav` (`packages/react/src/keyboard.ts`). Today those keys return `preventDefault` (swallowed). The Q3 unblock changes them to return `{ type: "rangeSelection"; action: "extend" | "select-all" | "select-row" | "select-col" | "clear" }` and the grid's keydown handler routes accordingly.

The "data edge" semantics of Ctrl+Shift+Arrow: starting from the active range's frontier in arrow direction, walk until either a "different non-empty / empty boundary" or the data edge. v1 simplifies: walk to the data edge (last row / last col) directly. The richer "skip empty cells" semantics is a v1.1 polish.

---

## a11y

### Live region announcements

Per `accessibility-rfc §Live Regions` (wired by #41):

| Event | Region | Message shape |
|---|---|---|
| Range size changed | Polite, debounced 250ms | `{rowCount} rows by {columnCount} columns selected.` |
| Range cleared | Polite | `Selection cleared.` |
| Copy | Polite | `Copied {rowCount} rows by {columnCount} columns.` |
| Paste committed | Polite | `Pasted {cellCount} cells.` |
| Paste rejected | Assertive | `Paste rejected. {firstError}. Nothing was changed.` |
| Fill committed | Polite | `Filled {cellCount} cells.` |

Range announcements debounce to avoid backlog during Shift+Arrow rapid-fire.

### Keyboard navigation

The grid root handles range keys at the keydown level (before they propagate to children). Active cell + range share the focus model: `aria-activedescendant` continues to point to the **anchor** cell (or the active range's frontier if mid-extend). The range itself isn't focusable — only the active cell is.

### Visual cues for screen readers

- The visual range overlay is **decorative** for screen readers (`role="presentation"` on `.bc-grid-range-overlay`). Range membership is conveyed via the per-cell `aria-selected="true"` attribute when a cell is in any active range.
- This is in addition to the row-selection `aria-selected` from #37 — a cell can be "in a selected row" AND "in an active range" simultaneously. The cell's `aria-selected` is true if either condition holds.

### Forced-colors mode

Range overlay rectangles use `Highlight` border color; the 8%-opacity fill is disabled (transparent) since forced-colors strips opacity. Per `accessibility-rfc §Forced Colors`.

---

## Coordination with row selection (#37)

Row selection and range selection are **independent** state shapes:
- Row selection: `BcSelection` keyed by `RowId` (immutable across sort/filter).
- Range selection: `BcRangeSelection` keyed by cell positions (resets if sort/filter changes the row order — anchor moves to nearest equivalent or clears).

Both render on the same DOM:
- Row-selected rows: `.bc-grid-row-selected` class + `aria-selected="true"` on the row.
- Range-selected cells: `.bc-grid-cell-in-range` class + `aria-selected="true"` on the cell.
- A cell can be in both. The cell's `aria-selected` is true if either applies (DOM accepts a single `aria-selected="true"` regardless of source).

Click on a cell with no modifier:
- If `rangeSelection` is enabled: starts a new range (clears any existing ranges).
- If row selection is also enabled: also selects the row (Excel behaviour — clicking a cell selects the row visually as a side effect).
- Implementer choice: at v1, mouse click does both unless `rangeSelectionOptions.preventRowSelection === true`. Default `false` (mouse click selects both row + range, matches Excel). Field declared in `BcRangeSelectionOptions` above.

Shift+click: extends range. Doesn't affect row selection.
Ctrl+click: starts new disjoint range. Doesn't affect row selection (unless the consumer wires the row-selection `Ctrl+click toggle row` semantics — see #37).

The two selection modes are visually distinguishable:
- Row-selected row has a tinted **row** background.
- Range-selected cells have an **outlined** rectangle overlay.

---

## Survival across virtualization

Ranges store cell positions by `(rowId, columnId)` — stable across virtualization. The virtualizer's render window only renders cells in the visual viewport; the visual range overlay computes which segments of each range fall inside the current viewport and draws them.

Anchor / active-range frontier cells **must** stay in the DOM while the user is dragging. Reuse the editing-rfc retention pattern:
- During pointer-drag: virtualizer retains the rows/columns at the active-range frontier via `Virtualizer.beginInFlightRow / beginInFlightCol`.
- After pointerup: retention is released. The range data persists; cells are rendered only when in viewport.

The active cell (anchor) follows the existing `aria-activedescendant` focus-retention pattern from `accessibility-rfc §Focus Model + §Virtualization Contract` — it's already in the DOM whenever the grid has focus.

---

## Server-side range selection

**Range selection across unloaded server blocks is OUT OF SCOPE at v1.** The earlier draft proposed inline placeholder markers (`{ kind: "unloaded-block", blockKey }`) inside `BcRange` — that doesn't fit `BcRange = { start: BcCellPosition; end: BcCellPosition }` where positions are strictly `(rowId, columnId)` strings (per `api.md §reserved Q3` + `core/src/index.ts`). There's no place to land a marker without widening `BcCellPosition` itself, which would ripple through every API consumer.

V1 behaviour:
- Range selection is constrained to **loaded rows only**. Attempting to extend a range past the last loaded row clamps at the loaded boundary (no auto-fetch, no placeholder).
- Ctrl/Cmd+Shift+End in server-paged mode jumps to the last loaded row, not the absolute last row of the dataset. Polite-region announces the clamp ("Selection clamped to loaded rows").
- Copy / paste / fill operate on the loaded subset. No silent "load and then continue" behaviour.
- For `server-row-model` modes where total rowcount is `"unknown"` (per `server-query-rfc`), the range cannot extend below the currently-rendered window in any direction.

V1.x extension (post-1.0):
- A distinct `BcServerRange` engine type can wrap `BcRange` with optional `unresolvedSegments`. Server-row-model adapter resolves segments on copy/paste by triggering `LoadServerBlock`. Out of this RFC's scope; will land via a `server-range-rfc` follow-up.

`server-query-rfc §Selection across unloaded rows` documents the wire format for richer modes — that surface is reserved at v1, not implemented.

---

## Implementation tasks (Phase 6 Track 2)

| Task | Effort | Depends on |
|---|---|---|
| `range-state-machine` | M | this RFC |
| `visual-selection-layer` | M | range-state-machine |
| `clipboard-copy-tsv-html` | S | range-state-machine |
| `clipboard-paste-from-excel` | M | clipboard-copy-tsv-html + editing-rfc validation pipeline |
| `fill-handle` | M | clipboard-copy-tsv-html (reuses linear-detection helpers) |
| `master-detail` | M | independent — runs in parallel |
| `column-groups-multi-row-headers` | M | independent — runs in parallel |
| `sticky-header-polish` | S | independent — runs in parallel |

Critical path: range-state-machine → visual-selection-layer → (clipboard-copy ‖ fill-handle) → clipboard-paste.

`master-detail`, `column-groups`, `sticky-header-polish` run in parallel — they touch different DOM regions.

---

## Test plan

### Unit (Vitest)

- `expandRangeTo`: extends correctly in 4 directions; clamps at edges.
- `newRangeAt`: produces a 1x1 range.
- `rangeContains` / `rangesContain`: positive + negative cases.
- State machine actions: every transition (pointerdown clear / pointerdown shift / pointerdown ctrl / pointermove / shift-arrow / ctrl-shift-arrow / ctrl-A / esc).
- TSV serializer: round-trip with embedded `\t`, `\n`, `"`.
- TSV parser: same.
- Linear-fill detection: numeric AP, date AP, mixed (returns null → falls to copy).

### Integration (Vitest + RTL)

- Click + drag selects cells; range overlay renders rectangles correctly.
- Shift+click extends range.
- Ctrl+click adds disjoint range.
- Ctrl+A selects all; aria-selected on every cell.
- Esc clears.
- Copy: clipboard mock receives both text/plain + text/html.
- Paste: TSV from clipboard applies to anchored cell; out-of-bounds truncated; valid validation passes; invalid rolls back atomically.
- Fill: drag the handle; numeric sequence detected and extended.
- Pinned-region range: visual rect spans pinned↔body boundary correctly (rendered as multiple rects, one per region).

### E2E (Playwright × 3 browsers)

- AR Customers demo: drag-select 5 rows × 3 cols; assert overlay rectangle bounds in DOM.
- Ctrl+C → check clipboard (Playwright clipboard read).
- Paste TSV from a string into the grid → cells update.
- Fill handle drag down 5 cells → cells fill.
- Keyboard: Shift+Arrow extends; Ctrl+A selects all; assert aria-rowcount + announcements.
- Multi-range: Ctrl+click adds disjoint range; both render.

### a11y manual

- NVDA: range size announcements debounced; Ctrl+A announces; Esc announces clear.
- VoiceOver: range overlay is decorative (no spurious "selection" announcements during normal arrow nav).
- Forced colors: range rectangle visible.

## Acceptance criteria

- `BcRangeSelection`, `BcRangeSelectionOptions`, `BcRangeCopyEvent`, `BcRangePasteEvent` shipped + manifest-listed.
- `core/range.ts` engine module ships with all helpers + state-machine actions.
- Visual layer renders ranges across all viewport regions (body + pinned-* corners).
- Copy + paste round-trips with Excel + Google Sheets + bc-grid.
- Fill handle implements linear + copy strategies.
- Keyboard parity with mouse for Shift+Arrow, Ctrl+Shift+Arrow, Ctrl+A.
- AR Customers demo: full range-selection e2e test.
- axe-core clean.

## Open questions

### `onCellEditCommit` per cell vs `onRangePasteCommit` once?
**Resolved.** Both fire, in that order, with the full payload shapes pinned in §Clipboard / §Fill handle. `BcRangePasteEvent` and `BcRangeFillEvent` carry `appliedCount` / `truncatedCount` / `validationErrors` so consumers can group per-cell events into undo entries. `perCellEventsFired: true` flag is permanent at v1 — a future `BcRangeOptions.suppressPerCellEvents` boolean could change that, but adds complexity that v1 doesn't need.

### Should range copy include hidden columns?
**Decision: no, with a future opt-in.** Hidden columns are excluded from copy at v1 (matches `aria-colcount` semantics — hidden columns aren't in the visible-column count per `accessibility-rfc §Column Count`). Consumers wanting to include hidden cols are deferred to a post-v1 `copyRange` option (`api.copyRange(range, { includeHidden?: boolean })`). Tracked as a non-blocking item in `queue.md` under the range track. **Not** part of v1's `BcGridApi` surface — only `copyRange(range?)`, `getRangeSelection`, `setRangeSelection`, and `clearRangeSelection` are guaranteed.

### Drag-auto-scroll speed
Linear with pointer distance from viewport edge: 100px from edge = 4px/frame; at edge = 16px/frame; capped at 24px/frame. Matches Excel feel.

### Range state in URL persistence?
**Decision: no.** Range selection is ephemeral (resets on sort / filter / page change). URL persistence of range positions would have surprising semantics. Skip.

### Multi-range copy (disjoint)
**Decision: not in v1.** Excel itself only allows disjoint copy in narrow cases. Defer to v1.1.

### Selection-API on `BcGridApi`
Add to `BcGridApi`:
```ts
getRangeSelection(): BcRangeSelection
setRangeSelection(next: BcRangeSelection): void
copyRange(range?: BcRange): Promise<void>     // resolves when clipboard write done
clearRangeSelection(): void
```

Lands in the `range-state-machine` PR as additive surface.

## References

- `docs/api.md §reserved Q3` (`BcRange`)
- `docs/design.md §12` (range-selection sketch)
- `docs/design/accessibility-rfc.md §Selection Extension Points` (Q3 keyboard reservations)
- `docs/design/editing-rfc.md` (commit pipeline reused for paste)
- `docs/design/server-query-rfc.md` (selection over unloaded rows)
- `docs/coordination/v1-parity-sprint.md §Track 2`
- `packages/virtualizer/src/virtualizer.ts` (Fenwick tree for cell offsets)
- `packages/react/src/keyboard.ts` (Q3-reserved keys ready for hookup)
