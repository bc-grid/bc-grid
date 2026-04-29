# RFC: Cell Editing (editing-rfc)

**Status:** Draft for review
**Owner:** c2 (auditor + coordinator)
**Reviewer:** fresh agent (target: c1 or x1)
**Blocks:** `editor-framework`, all 7 built-in editors (`editor-text`, `editor-number`, `editor-date`, `editor-datetime`, `editor-time`, `editor-select`, `editor-multi-select`, `editor-autocomplete`), `validation-framework`, `dirty-tracking`, `bc-edit-grid-complete`
**Informed by:** `docs/api.md §7` (editor protocol, frozen at v0.1), `docs/design.md §11` (editing-model sketch), `docs/design/accessibility-rfc.md` (Interaction/Edit Mode + Live Regions)
**Sprint context:** Track 1 of the v1 parity sprint (`docs/coordination/v1-parity-sprint.md`)

---

In-grid editing is the core of bc-grid's "Excel-feel" mission. The data shape is already pinned at v0.1 (`api.md §7` declares `BcCellEditor`, `BcCellEditorProps`, `BcCellEditorPrepareParams`, `BcCellEditCommitEvent`, `BcValidationResult`); this RFC pins the **behaviour** so the implementer agent can build the framework + 7 built-in editors in parallel.

## Goals

- A complete cell-edit lifecycle that survives virtualization, sort, filter, and selection without losing focus or dropping in-flight edits.
- Edit-cell paint < 16ms (one RAF cycle) per `design.md §3.2` smoke bar.
- Excel-feel keyboard model: F2/Enter/typing to enter; Tab/Enter/Esc to exit; arrow keys behave per APG.
- Synchronous + asynchronous validation with a single `BcValidationResult` shape.
- Optimistic-UI commit to the row model; server-commit hook with rollback on rejection.
- Per-cell dirty / pending / error visual states that compose with the existing selection / active / pinned states.
- a11y: edit mode shifts real DOM focus into the editor, exits cleanly via Esc, announces validation errors through the assertive live region.
- Custom editors are first-class: every built-in is a `BcCellEditor` factory; consumers register their own with the same shape.

## Non-Goals

- **Bulk edit** (multi-cell paste, range fill). Q3 deliverable; range-rfc owns the surface.
- **Undo/redo.** Post-1.0; needs a separate state machine RFC. The commit pipeline below is undo-friendly (immutable patches) but no UI ships in this sprint.
- **Formula editing** (Excel `=A1+B1`). Out-of-scope per `design.md §1` mission and the v1-parity-sprint scope decision.
- **Masking / format-as-you-type.** Each editor handles its own input format internally; we don't ship a generic mask-input library.
- **Cross-row validation.** Per-cell `validate(newValue, row)` runs; row-level "all required fields filled" or cross-row consistency checks are consumer-owned at commit time.

## Source standards

- WAI-ARIA APG grid pattern, edit-mode addendum: https://www.w3.org/WAI/ARIA/apg/patterns/grid/
- MDN `input` events + `beforeinput`: https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/beforeinput_event
- AG Grid public docs (cell-editing reference; **public docs only** per `AGENTS.md §3.2`): https://www.ag-grid.com/react-data-grid/cell-editing/
- Excel keyboard model: https://support.microsoft.com/en-us/office/keyboard-shortcuts-in-excel-1798d9d5-842a-42b8-9c99-9b7213f0040f

No AG Grid source code or implementation details consulted.

## Decision summary

| Topic | Decision |
|---|---|
| Edit mode entry | F2 (toggle), Enter (edit + select-all), printable char (edit + replace), double-click (edit + caret-at-position) |
| Edit mode exit | Enter (commit + move-down), Tab/Shift+Tab (commit + move-right/left), Esc (cancel + restore navigation focus), portal-aware click-outside (commit) |
| Real focus during edit | DOM focus moves into the editor's `focusRef` element. `aria-activedescendant` on the grid root is suspended (set to empty string). |
| **Row-model ownership** | **bc-grid maintains an internal `BcEditOverlay` map of patches over the immutable `data` prop.** Cell renderers read patched values transparently; consumers see the new value via `onCellEditCommit` and can opt to mirror into their own state. No `onDataChange` / `valueSetter` props at v1. |
| **`valueParser` placement** | When the editor produces a string (`editor-text`, `editor-number` raw, etc.) and the column declares a `valueParser`, the framework calls `column.valueParser(input, row)` between editor `commit(input)` and validation. Typed editors (date/select/datetime) bypass `valueParser` and pass the typed value straight to validation. |
| Validation | `column.validate(newValue, row)` runs at commit, post-`valueParser`. Sync returns `BcValidationResult`; async returns `Promise<BcValidationResult>`. Editor stays open on `valid: false`, focuses the editor, announces error through assertive region. |
| Dirty tracking | Per-cell pending/error state in a `BcEditState` nested map (`Map<RowId, Map<ColumnId, BcCellEditEntry>>` — flat-key collision-safe). Visual via `data-bc-grid-cell-state="dirty | pending | error"`. |
| Optimistic commit | The overlay map updates immediately on commit. The optional `onCellEditCommit` consumer hook fires post-overlay-update; consumers can reject with a server error which rolls back to the previous overlay state. |
| Server commit signal | `onCellEditCommit` returning a Promise sets `pending: true`; resolution clears it; rejection rolls back + shows error. |
| Concurrency | One cell can be edited at a time per grid. Activating a new edit while one is in-flight commits-and-moves (Tab semantics) or cancels (Esc semantics) per the keyboard model. Server-pending edits don't block new edits — multiple cells can have `pending: true` concurrently. |
| **Virtualizer retention** | While editing, the editor's row + column are retained via `Virtualizer.beginInFlightRow(rowIndex)` (and a sibling column-retention hook to be added). Scroll, sort, or filter that would otherwise unmount the row keeps the editor alive until commit/cancel. |
| **Portal-aware click-outside** | Click-outside commits *unless* the click target has an ancestor with `data-bc-grid-editor-root` or `data-bc-grid-editor-portal`. Editors using popovers (date / select / autocomplete) mark their portaled content with `data-bc-grid-editor-portal`. |
| Perf | Edit-cell paint < 16ms (smoke bar from `design.md §3.2`). Editor mount via `useLayoutEffect` to avoid double-paint. |
| a11y | Real focus shifts; `aria-activedescendant` suspended; commit/cancel announcements through polite region; validation errors through assertive region. |
| Reduced motion | Editor mount/unmount has no transition. Cell-flash on commit becomes a static highlight (consistent with `accessibility-rfc §Reduced Motion`). |

---

## Row-model ownership

`BcGrid` consumes immutable `data: readonly TRow[]` props (`api.md §5.1`). Editing introduces mutation; this RFC pins how that mutation is owned.

### The choice

Three plausible designs:

1. **Overlay patches (chosen for v1).** bc-grid maintains an internal `BcEditOverlay` map keyed by `RowId` → partial-row patch. Cell renderers read patched values transparently via the value pipeline (`api.md §4`). Consumer's `data` prop is untouched. Consumer learns about edits via `onCellEditCommit`; if they want to mirror the edit into their own state, they do so in the handler.
2. **Consumer-controlled data setter.** Add `onDataChange?: (next: readonly TRow[]) => void` to `BcGridProps`. Consumer mutates their own state. Strong contract; requires every consumer to opt in.
3. **Column-level `valueSetter`.** Each column declares `valueSetter?: (row: TRow, value: TValue) => TRow`; framework calls it on commit, replaces the row in the row model, calls `onCellEditCommit`. Mid-ground; column-by-column flexibility.

**Decision: overlay patches (option 1).** Reasons:
- No new required prop on `BcGridProps`. Consumers using `<BcEditGrid>` opt in via `onCellEditCommit` (already declared `api.md §5.2`); consumers without that handler get optimistic-only edits that roll back when navigating away.
- Server-row-model integration (Track 3) already needs an overlay layer for `pendingMutations` (per `server-query-rfc`); the editing overlay reuses the same shape, no duplicate plumbing.
- Range-paste (Track 2) emits batched overlay patches for the same path — single mutation pipeline.
- Future migration to option 3 (`valueSetter`) is non-breaking — we add the optional prop, framework prefers it when set, falls back to the overlay otherwise.

### Overlay shape

```ts
interface BcEditOverlay<TRow> {
  /** Map<RowId, partial row patch>. Patch is { [columnId]: nextValue } where columnId === field for editable columns. */
  patches: Map<RowId, Partial<TRow>>
  /** Read pipeline: when a cell renders, the framework looks up `patches.get(rowId)?.[field]` and uses it instead of `row[field]` if defined. */
}
```

Implementation lives in `packages/react/src/grid.tsx` (or wherever `grid-tsx-file-split` lands the value pipeline; likely `packages/react/src/value.ts` extension). Patches are cleared from the overlay when the consumer's `data` prop updates — the assumption is that a `data` prop update means the consumer accepted the edit upstream and the new `data` reflects it.

### `valueParser` placement

`column.valueParser` (already declared `api.md §1.1`, reserved Q2) bridges editor output → typed value. Pipeline:

```
editor.commit(input)
  → if input is string AND column.valueParser is set:
        nextValue = column.valueParser(input, row)
     else:
        nextValue = input  // editor produced typed value directly
  → column.validate?.(nextValue, row)         // sync or async
  → if valid: overlay.set(rowId, { [columnId]: nextValue })
  → onCellEditCommit({ ...event, previousValue, nextValue })
  → if Promise: pending=true until resolve; on reject: rollback overlay
```

Built-in editors that produce strings (`editor-text`, `editor-number` when used with parse-on-commit semantics) call `commit(stringInput)`; built-in typed editors (`editor-date`, `editor-select`) call `commit(typedValue)`. Custom editors document their semantics via the `kind` discriminator.

### Server-row-model integration

When the consumer is `<BcServerGrid>` and an edit commits:
1. Overlay updates locally (optimistic).
2. `onCellEditCommit` fires; consumer typically converts the event into a `ServerRowPatch` and dispatches to the server-row-model's `pendingMutations` (Track 3).
3. On `ServerMutationResult.status === "rejected"`: roll back the overlay; surface error via assertive region.
4. On `"accepted"`: the next `data`/`block` refetch carries the canonical value; framework clears the patch from the overlay (since the source-of-truth now contains it).

This keeps the editing pipeline server-shape-agnostic at v1 — consumers stitch the two together in their `onCellEditCommit` handler. Track 3 may add a higher-level adapter that does this stitching automatically; that's a Q4-style polish task, not in this RFC's scope.

---

## Lifecycle

The cell editor lives through eight states:

```
        ┌─────────────┐
        │ Navigation  │  ← grid root has focus, aria-activedescendant active
        └──────┬──────┘
               │ activate (F2 / Enter / type / dbl-click)
               ↓
        ┌─────────────┐
        │  Preparing  │  ← optional; editor.prepare(params) runs
        └──────┬──────┘
               │ prepare resolved (or skipped)
               ↓
        ┌─────────────┐
        │  Mounting   │  ← editor component mounts; focus shifts to focusRef
        └──────┬──────┘
               │ first paint
               ↓
        ┌─────────────┐
        │   Editing   │  ← editor owns input; user edits
        └──────┬──────┘
               │
       ┌───────┴───────┬────────────────┐
       │ commit        │ cancel         │ click-outside
       ↓               ↓                ↓
┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│ Validating  │ │ Cancelling  │ │ Validating  │
└──────┬──────┘ └──────┬──────┘ └──────┬──────┘
       │               │               │
   valid │             │           valid │
       ↓               │               ↓
┌─────────────┐        │       ┌─────────────┐
│ Committing  │        │       │ Committing  │
└──────┬──────┘        │       └──────┬──────┘
       │               │               │
       ↓               ↓               ↓
        ┌──────────────────────────────┐
        │     Unmounting               │  ← editor unmounts; focus returns
        └──────────────┬───────────────┘
                       │
                       ↓
                 Navigation
```

State transitions:

| From | Trigger | To | Side effects |
|---|---|---|---|
| Navigation | `keydown` Enter / F2 / printable; `dblclick` | Preparing | Capture initial value; emit `editStart` event |
| Preparing | `editor.prepare()` resolves; or skipped if undefined | Mounting | Pass `prepareResult` to component |
| Preparing | `editor.prepare()` rejects | Navigation | Announce error through assertive region |
| Mounting | first paint | Editing | Move DOM focus to `focusRef.current`; suspend `aria-activedescendant`; **acquire virtualizer retention via `Virtualizer.beginInFlightRow(rowIndex)` and (NEW) `beginInFlightColumn(columnIndex)` so scroll/sort/filter can't unmount the editor mid-edit** |
| Editing | `commit(newValue)` from editor | Validating | Capture pending value |
| Editing | `cancel()` from editor; Esc keydown | Cancelling | Discard pending value |
| Editing | portal-aware click-outside | Validating | Treat as commit (see "Portal click-outside rules" below) |
| Validating | `validate()` returns `valid: true` (or no validator) | Committing | Apply value to overlay (per "Row-model ownership" above) |
| Validating | `validate()` returns `valid: false` | Editing | Set `error`; refocus editor; announce assertive |
| Committing | overlay updated | Unmounting | If `onCellEditCommit` returns Promise, set `pending: true` (retention persists until Promise settles); emit `editCommit` event |
| Cancelling | discard | Unmounting | Emit `editCancel` event |
| Unmounting | editor unmounted | Navigation | **Release virtualizer retention handles** (row + column); restore focus to grid root + `aria-activedescendant` to active cell; honour the keyboard-model "next-cell" target (e.g., move down on Enter) |

### Virtualizer retention contract

Per `design.md §13` ("In-flight retention is reference-counted, index-keyed, idempotent"), entering edit mode acquires:

```ts
const rowHandle = virtualizer.beginInFlightRow(rowIndex)
const colHandle = virtualizer.beginInFlightColumn(colIndex)  // NEW — sibling API
// ...edit...
rowHandle.release()
colHandle.release()
```

The row hook already exists (PR #22). The column hook is **NEW work for the editor-framework PR** — `Virtualizer` already retains active columns in viewport but doesn't expose a hook for explicit retention beyond the viewport. `editor-framework` adds the symmetric `beginInFlightColumn(colIndex): InFlightHandle` method to `Virtualizer` (additive, additive to manifest).

Without retention, scrolling the editor row out of viewport would unmount it mid-edit, dropping focus and leaving the user with a black-hole cell. With retention, the row + column stay in DOM until the editor unmounts; viewport scrolling continues normally around it.

Async commit (`pending: true`) keeps retention through the Promise resolution — even though the editor has unmounted, the overlay's `pending` cell is still in flight. The retention handles release only when `pending: false` AND the editor is unmounted.

### Portal click-outside rules

Editors that use shadcn popovers (date picker, select, multi-select, autocomplete) render their dropdown content into a React portal at `document.body`. A naive document-level click handler treats clicks inside the portal as "click-outside the cell" and commits early.

**Rule:** click-outside commits **unless** the click target has an ancestor matching `[data-bc-grid-editor-root], [data-bc-grid-editor-portal]`.

- The editor's primary input/cell wrapper is marked `data-bc-grid-editor-root` (set by the framework, not the editor component).
- Portaled popover content is marked `data-bc-grid-editor-portal` by the editor component (each built-in editor that uses portals attaches the attribute to its popover root).
- Test: `clickTarget.closest('[data-bc-grid-editor-root], [data-bc-grid-editor-portal]')` — if non-null, ignore. Otherwise, commit.

shadcn primitives commonly accept a `ref` or `data-*` props on the popover root; the editor passes the marker through. Built-in editor specs (below) call this out per editor.

Custom editors that use portals **must** apply `data-bc-grid-editor-portal` to their portal root, or the framework will commit prematurely on user interactions inside the portal. Documented in `editor-custom-recipe`.

## Activation

Three entry paths from Navigation mode, each landing in Preparing state:

### F2 / Enter (toggle)
- Captured by the grid root's `onKeyDown` (already wired in `packages/react/src/keyboard.ts`; today returns `noop` for these keys per the Q2-reserved comment — this RFC is the unblock).
- Initial editor selection: full text selected (Excel default).
- Caret position: end of selection.

### Printable character (replace)
- Any key with `key.length === 1` and not `Ctrl` / `Cmd`-modified.
- Initial editor value: the typed character. Existing cell value discarded.
- Caret position: end of input.
- The key event is *consumed* — the grid swallows it and forwards to the editor as the seed value, not as a real keystroke (avoids duplicate input).

### Double-click (point-edit)
- `onDoubleClick` on a body cell.
- Initial editor selection: empty (no auto-select).
- Caret position: closest to the click `clientX/Y` (use `document.caretPositionFromPoint` if available, else end).

### Activation guards
- `column.editable` must be truthy (or pass `editable(row)` if function).
- `row` must not satisfy `rowIsDisabled(row)` if defined.
- The grid must not currently be in Edit/Validating/Committing/Mounting/Preparing state. Multi-edit is not supported (one cell at a time per grid).

## Editor component contract

Refining `api.md §7` to behavioural specifics:

```ts
export interface BcCellEditor<TRow, TValue = unknown> {
  Component: React.ComponentType<BcCellEditorProps<TRow, TValue>>
  prepare?: (params: BcCellEditorPrepareParams<TRow>) => Promise<unknown>
  kind?: string
}

export interface BcCellEditorProps<TRow, TValue = unknown> {
  initialValue: TValue
  row: TRow
  rowId: RowId
  column: BcReactGridColumn<TRow, TValue>
  commit(newValue: TValue): void
  cancel(): void
  error?: string
  focusRef?: React.RefObject<HTMLElement | null>

  /**
   * NEW (this RFC): seed value when activated by typing a printable char.
   * Editor should treat this as the user's first keystroke.
   */
  seedKey?: string

  /**
   * NEW (this RFC): caret position hint for double-click activation.
   * { x, y } in client coordinates; editor may use to position caret.
   */
  pointerHint?: { x: number; y: number }

  /**
   * NEW (this RFC): the prepareResult from editor.prepare(), if any.
   */
  prepareResult?: unknown

  /**
   * NEW (this RFC): true while async validation or async server commit is
   * in flight. Editors should disable their commit affordance and surface
   * a spinner / disabled state. Optional; absent on sync flows.
   */
  pending?: boolean
}
```

Implementation rules:
- The component must call `commit()` or `cancel()` exactly once in its lifetime — multiple calls are no-ops.
- The component must attach the `focusRef` to its primary input element. The grid will focus that element after mount.
- The component must not call `commit()` synchronously inside its first render — that would create a re-render before mount finishes.
- The component should avoid heavy effects on every keystroke; throttle or debounce internal validation if needed.
- The component should respect `prefers-reduced-motion` for any internal transitions (e.g., dropdown open animations).

The four new fields (`seedKey`, `pointerHint`, `prepareResult`, `pending`) extend `BcCellEditorProps`. Per `api.md` v0.1 freeze rules, this is an *addition*, not a breaking change — they're all optional. The `tools/api-surface/src/manifest.ts` will need to be updated in the editor-framework PR to reflect the new shape; api.md §7 will get a clarifying note.

## Keyboard model in edit mode

Refines `accessibility-rfc §Keyboard Model` Activation/Editing table:

| Key | Behaviour |
|---|---|
| Enter | Commit. Move active cell **down** one row (Excel default). At last row: stay. |
| Shift+Enter | Commit. Move active cell **up** one row. At first row: stay. |
| Tab | Commit. Move active cell **right** one column. At last column: wrap to next row's first column. At last cell: stay. |
| Shift+Tab | Commit. Move active cell **left** one column. At first column: wrap to previous row's last column. At first cell: stay. |
| Escape | Cancel. Stay on current cell. |
| F2 | Toggle "select inside editor" sub-mode (advanced; reserved for editors that opt in via `kind`). Default: noop. |
| ArrowUp / ArrowDown | Default: editor-specific (e.g., date picker may want them; text editor passes through to caret movement). The editor decides. The grid does **not** intercept these in edit mode. |
| ArrowLeft / ArrowRight | Same — editor-specific. |
| Home / End | Editor-specific (typically caret to start/end of input). |
| Ctrl+Z / Ctrl+Y | Editor-specific (typically input undo/redo). Grid does not intercept. Bulk undo/redo deferred to post-1.0. |

The grid root's `onKeyDown` handler routes to either the navigation-mode matrix (`packages/react/src/keyboard.ts::nextKeyboardNav`) or the edit-mode handler depending on grid state. In edit mode, only Enter, Shift+Enter, Tab, Shift+Tab, and Escape are intercepted at the grid level; all other keys propagate to the editor.

`Tab` wrap: at the last cell of the last row, behaviour is "stay on cell, commit, exit edit mode" — Tab does **not** exit the grid in edit mode (that's navigation mode behaviour per `accessibility-rfc §Entry and Exit`).

## Validation framework

Validators are per-column and run at commit time, after the value is captured but before it lands in the row model:

```ts
type SyncValidator<TRow, TValue> = (newValue: TValue, row: TRow) => BcValidationResult
type AsyncValidator<TRow, TValue> = (newValue: TValue, row: TRow) => Promise<BcValidationResult>
type Validator<TRow, TValue> = SyncValidator<TRow, TValue> | AsyncValidator<TRow, TValue>
```

`column.validate` accepts either shape. The framework awaits the result before transitioning to Committing.

### Validation flow

1. Editor calls `commit(newValue)`.
2. Grid transitions to Validating.
3. If `column.validate` is undefined: skip to Committing (treat as `{ valid: true }`).
4. Call `column.validate(newValue, row)`. Wrap in `Promise.resolve` to handle both sync + async.
5. If `valid: true`: transition to Committing.
6. If `valid: false`:
   - Set `error` in `BcEditState[rowId:columnId]`.
   - Pass `error` to the editor via `BcCellEditorProps`.
   - Re-focus the editor (`focusRef.current?.focus()`).
   - Announce assertive: `{column.header} was not updated. {error}.` (per `accessibility-rfc §Live Regions`).
   - Transition back to Editing.

### Async validation guards

- During Validating, the editor receives `pending: true` (NEW prop) and should disable its commit affordance + show a spinner.
- If the user presses Esc during async validation: cancel both the validator (best-effort via `AbortController`) and the edit. The validator should accept an `AbortSignal` via a 3rd argument:
  ```ts
  validate?: (newValue: TValue, row: TRow, signal?: AbortSignal) => Promise<BcValidationResult>
  ```
- If a second commit fires while the first validator is pending: treat the first as superseded; cancel its signal; run the new validator. The most recent commit wins.

The async signature extension is additive to `api.md §1.1`'s declared `validate?: (newValue: TValue, row: TRow) => BcValidationResult` (currently sync-only).

### Validation result conventions

`BcValidationResult` is already declared:
```ts
type BcValidationResult = { valid: true } | { valid: false; error: string }
```

Conventions for the `error` string:
- User-facing, plain text, no markup.
- Localised via `BcGridMessages` (the editor framework looks up by error code if needed; default: pass through verbatim).
- Single-line, < 200 chars (Excel-style).
- Multiple errors → join with `". "` and let the editor's UI wrap.

## Dirty tracking

A `BcEditState` map tracks per-cell state:

```ts
export interface BcCellEditEntry {
  /** True between commit and onCellEditCommit Promise resolution. */
  pending: boolean
  /** Set on validation rejection or server commit failure. Cleared on successful retry / cancel. */
  error?: string
  /** Original value before this edit cycle; used for rollback on server rejection. */
  previousValue?: unknown
  /** Mutation ID when the consumer's onCellEditCommit returns one (for ServerRowPatch correlation). */
  mutationId?: string
}

/**
 * Nested map keyed by RowId then ColumnId. NOT a flat
 * `${rowId}:${columnId}` template-string key — both are
 * unconstrained strings, so a flat key has collision risk
 * (e.g. rowId="a:b" + columnId="c" collides with rowId="a"
 * + columnId="b:c"). The nested form is unambiguous and
 * is also faster for "all dirty cells in this row" queries.
 */
export type BcEditState = Map<RowId, Map<ColumnId, BcCellEditEntry>>
```

Lives in the React layer's grid component state. NOT exposed in the public API at v0.1 (consumers read state via cell-renderer params, not directly).

### Cell renderer params extension

`BcCellRendererParams.editing: boolean` already exists (`api.md §1.3`). This RFC adds (next to `editing`):

```ts
interface BcCellRendererParams<TRow, TValue> {
  // ...existing fields...
  editing: boolean
  pending: boolean       // NEW: true during async commit
  editError?: string     // NEW: present when validation rejected the last commit
  isDirty: boolean       // NEW: true when the cell has been edited this session (compared to the original prop value)
}
```

Additive, not breaking; manifest update in editor-framework PR.

### Visual contract

Cells expose state via `data-bc-grid-cell-state` data attribute:

| State | `data-bc-grid-cell-state` | CSS hook |
|---|---|---|
| Default | (absent) | `.bc-grid-cell` |
| Editing (this cell) | `"editing"` | `.bc-grid-cell[data-bc-grid-cell-state="editing"]` |
| Pending server commit | `"pending"` | + spinner via theming |
| Error after validation/server reject | `"error"` | + `aria-invalid="true"` + assertive announcement |
| Dirty (committed locally, optionally pending server) | `"dirty"` | subtle highlight, default theming |

Theming (`packages/theming/src/styles.css`) ships defaults; consumers override via `--bc-grid-cell-*` variables.

## Server commit + optimistic UI

`BcEditGridProps.onCellEditCommit` (already declared in `api.md §5.2`) is the consumer hook:

```ts
onCellEditCommit?: (event: BcCellEditCommitEvent<TRow>) => void | Promise<void>
```

Behaviour:

1. **Sync return / no return value:** the local commit is final. No `pending` state. No rollback path.
2. **Promise return, resolves:** `pending: true` from commit until resolution. On resolve: clear pending, leave `dirty: true` (cell was edited this session).
3. **Promise return, rejects:** `pending: true` until rejection. On reject:
   - Roll back: restore `previousValue` to the row model.
   - Set `error` from the rejection (string-coerce if Error; use `error.message` if Error instance; else `"Server rejected the edit."`).
   - Announce assertive via live region.
   - Set `data-bc-grid-cell-state="error"` + `aria-invalid="true"`.

`BcCellEditCommitEvent` already includes `previousValue`, `nextValue`, `source` — sufficient for consumer-side audit logging or undo-stack persistence.

### Server-row-model integration

When the consumer is using `<BcServerGrid>` (Q4 implementation), the commit pipeline emits a `ServerRowPatch` (already declared in `core` per `server-query-rfc`):
```ts
{ rowId, changes: { [columnId]: nextValue }, mutationId, baseRevision? }
```

Wired through the existing `pendingMutations` map in `ServerRowModelState`. Track 3 (server-row-model impl) consumes this.

### Concurrency

- Multiple cells can have `pending: true` concurrently (different `mutationId`s). The grid does not serialise.
- A cell whose `pending: true` can still be re-edited; the new edit supersedes the in-flight one (cancel the old `mutationId`'s AbortSignal if the consumer accepts one; otherwise, on reject of the old, ignore the rollback because the new value is now authoritative).
- The framework does not deduplicate or batch; consumers wanting that should debounce in their `onCellEditCommit`.

## Edit-cell paint perf

Per `design.md §3.2` smoke bar: edit-cell paint < 16ms (commit → next paint).

Implementation rules:
- Editor mount via `useLayoutEffect`, not `useEffect` — avoids double-paint.
- Editor unmount is also `useLayoutEffect`.
- Commit value applies to row model in the same render cycle as unmount. The cell's display value re-renders with the new value in one pass.
- No FLIP animation on edit-cell (FLIP is for sort/filter row reordering).
- Cell flash on commit: optional, off by default. Opt in via `BcGridProps.flashOnEdit?: boolean`. When on: 160ms opacity flash via `flash()` from `@bc-grid/animations`. Disabled when `prefers-reduced-motion`.

The smoke perf harness (Phase 5.5 task `smoke-perf-ci`) will exercise this via:
1. Activate edit on cell at row 50 (mid-window).
2. Type "X".
3. Press Enter.
4. Measure: from `keydown.Enter` to `requestAnimationFrame` callback — must be < 16ms.

## a11y for edit mode

### Focus model

Edit mode breaks the navigation-mode rule that DOM focus stays on the grid root. The editor's `focusRef.current` receives real focus.

Sequence on activation:
1. Grid sets `editingCell = { rowId, columnId }` in state.
2. React renders the editor component into the cell's DOM position.
3. After `useLayoutEffect`: `focusRef.current?.focus()`.
4. Grid root sets `aria-activedescendant=""` (suspend; can't point to a cell that's now an editor input).
5. Grid root remains `tabIndex=0` so Shift+Tab from inside the editor lands on the grid root, then exits the grid.

Sequence on exit:
1. Editor calls `commit()` or `cancel()`.
2. Grid awaits validation if needed.
3. Grid sets `editingCell = null`.
4. React unmounts the editor; cell renders display content again.
5. After `useLayoutEffect`: grid root focuses (`rootRef.current?.focus()`).
6. Grid sets `aria-activedescendant` back to the new active cell DOM ID.

Tab-out during edit: per WAI-ARIA grid pattern, Tab in edit mode commits + moves to next cell, **does not exit the grid**. Tab from the last cell stays on the cell (commit fires, no move). Shift+Tab from the first cell same. To exit the grid, press Esc first, then Tab.

### Live region announcements

Per `accessibility-rfc §Live Regions` (now implemented as of PR #41):

| Event | Region | Message shape |
|---|---|---|
| Cell edit committed (sync or post-server-resolve) | Polite | `Updated {column.header} for {rowLabel} to {formattedNewValue}.` |
| Cell edit rejected by validator | Assertive | `{column.header} was not updated. {error}.` |
| Cell edit rejected by server | Assertive | `{column.header} update failed. {error}. Reverted.` |
| Cell edit cancelled | (silent) | No announcement — cancel is the user's intent |
| Edit mode entered | (silent) | Focus on the editor input announces itself via the input's accessible name |

The polite-region announcement is debounced 250ms to avoid backlog when the user commits rapidly (Tab through 10 cells). Assertive announcements are not debounced — errors are individually important.

`rowLabel` resolution: `row[column.linkField]` if `linkField` set on `BcEditGridProps`; else `row[firstFieldColumn.field]`; else `${rowId}` as fallback.

### ARIA states on the cell

| State | Attribute |
|---|---|
| Editing this cell | `aria-current="true"` (in addition to `aria-selected` / `data-bc-grid-active-cell`) |
| Validation error | `aria-invalid="true"` + `aria-describedby="{cellId}-error"` pointing to the error message element |
| Read-only column in an editable grid | `aria-readonly="true"` (per `accessibility-rfc §Semantic DOM Model`) |
| Editor input | inherits `aria-labelledby` from the cell's existing `aria-labelledby` chain (`{headerId} {cellId}`) so the column header context is preserved |

## Built-in editor specifications

Each editor is a `BcCellEditor<TRow, TValue>` factory. Implemented as separate Track 1 tasks; this section is the spec.

### `editor-text`
- `kind: "text"`
- Component: `<input type="text" />` wrapped in shadcn `Input` primitive.
- `seedKey`: replaces full content; caret at end.
- F2 sub-mode: noop (no advanced state).
- Accepts string. `commit(value: string)`.
- **String editor:** if `column.valueParser` is set, the framework calls it post-`commit` to convert string → `TValue` before validation. Otherwise the string lands in the overlay as-is (caller's responsibility to ensure `TValue extends string`).
- No portal — single inline input.

### `editor-number`
- `kind: "number"`
- Component: `<input inputMode="decimal" />` (locale-aware decimal separator).
- Internal parse: `parseFloat` after stripping locale thousands separators.
- `seedKey`: only digits, `.`, `,`, `-` accepted as seeds; other keys ignored.
- `validate` extension: editor adds a built-in "must be a number" check before consumer `column.validate` runs.
- Min/max via `column.format` if `{ type: "number", min?, max? }` (extends `BcColumnFormat` — additive).
- **String editor (commit-side):** internal parse produces `number`; calls `commit(number)` directly (does not produce string), so `column.valueParser` is bypassed.
- No portal.

### `editor-date`
- `kind: "date"`
- Component: shadcn date-picker primitive (calendar popover) + text input.
- Format: ISO 8601 `YYYY-MM-DD` for `commit`. Display via `Intl.DateTimeFormat` with `dateStyle: "medium"` per `column.format`.
- `seedKey`: typing `1` opens picker pre-focused on day-1 of current month.
- F2 sub-mode: opens calendar popover.
- **Portal marker:** the calendar popover (rendered into a portal) MUST set `data-bc-grid-editor-portal` on its root so click-outside doesn't fire while the user picks a date.
- Bypasses `column.valueParser` — the editor produces a typed `string` (ISO date) directly.

### `editor-datetime`
- `kind: "datetime"`
- Component: date picker + time-of-day input.
- Format: ISO 8601 `YYYY-MM-DDTHH:mm` for commit.
- Time picker: 12h or 24h based on `column.format` / locale.
- **Portal marker:** date popover sets `data-bc-grid-editor-portal` (inherited from `editor-date`).

### `editor-time`
- `kind: "time"`
- Component: `<input type="time" />` styled with shadcn `Input`.
- Format: `HH:mm` (24h) for commit; display per `Intl.DateTimeFormat` with `timeStyle: "short"`.

### `editor-select`
- `kind: "select"`
- Component: shadcn `Select` primitive.
- Options: provided via `column.options` (NEW prop on `BcReactGridColumn`, additive). Either `readonly { value, label }[]` or `(row) => readonly { value, label }[]`.
- `seedKey`: typing characters narrows the visible option list (open + filter).
- F2 sub-mode: opens the dropdown.
- **Portal marker:** the dropdown popover sets `data-bc-grid-editor-portal`.
- Bypasses `column.valueParser` — produces typed `TValue` directly.

### `editor-multi-select`
- `kind: "multi-select"`
- Component: shadcn multi-select primitive (chip input + dropdown).
- Value: `readonly TValue[]`.
- `seedKey`: same narrow behaviour as single select.
- **Portal marker:** dropdown popover sets `data-bc-grid-editor-portal`.
- Bypasses `column.valueParser` — produces typed `readonly TValue[]` directly.

### `editor-autocomplete`
- `kind: "autocomplete"`
- Component: shadcn `Combobox` primitive.
- Options resolution: async via `column.fetchOptions(query: string, signal: AbortSignal): Promise<{value, label}[]>` (NEW prop, additive).
- Debounced 200ms.
- Keyboard: Up/Down navigates options; Enter commits the highlighted option.
- **Portal marker:** options popover sets `data-bc-grid-editor-portal`.
- Bypasses `column.valueParser` — produces typed `TValue` directly.

### Custom editors

Consumers register a custom editor via `column.cellEditor: BcCellEditor<TRow, TValue>`. The framework treats it identically to built-ins — same lifecycle, same keyboard, same a11y. Recipe doc lives in `apps/docs` (separate task: `editor-custom-recipe`).

## Implementation tasks (Phase 6 Track 1)

These land in `docs/queue.md` once the coordination PR (#43) merges. Listed here so the implementer agent has the full task graph:

| Task | Effort | Depends on |
|---|---|---|
| `editor-framework` | M | this RFC |
| `editor-text` | S | editor-framework |
| `editor-number` | S | editor-framework |
| `editor-date` | M | editor-framework |
| `editor-datetime` | M | editor-date |
| `editor-time` | S | editor-framework |
| `editor-select` | M | editor-framework |
| `editor-multi-select` | M | editor-select |
| `editor-autocomplete` | M | editor-framework |
| `validation-framework` | S | editor-framework (can be concurrent with editor-text) |
| `dirty-tracking` | S | validation-framework |
| `bc-edit-grid-complete` | M | all of the above |
| `editor-custom-recipe` (docs) | S | bc-edit-grid-complete |

Editors after `editor-framework` lands run **fully in parallel** — different files, different packages (`@bc-grid/editors` per `design.md §4.2`).

## Test plan

### Unit (Vitest in Node — no DOM)

- State machine transitions: every from→to edge.
- Activation guards: column.editable, rowIsDisabled, already-editing.
- Validation flow: sync valid, sync invalid, async valid, async invalid, async cancelled, async race (second commit supersedes).
- Dirty tracking: pending lifecycle, error lifecycle, isDirty boolean.

### Integration (Vitest + React Testing Library)

- Editor mount: focus shifts to focusRef; `aria-activedescendant` suspended.
- Commit: row model updates; cell display reflects new value next render.
- Cancel: row model unchanged; focus returns to grid root.
- Tab/Shift+Tab/Enter/Esc keyboard transitions.
- Async validation: pending state visible; resolves to commit or error.
- Server commit: `pending: true` during Promise; rollback on reject.
- Multi-cell concurrent pending: two cells `pending: true` simultaneously, no interference.

### E2E (Playwright across 3 browsers)

- F2 / Enter / typing / double-click activation paths.
- Tab moves to next cell with commit; Shift+Tab to previous.
- Esc cancels.
- Async validation with 200ms simulated latency.
- Reject server commit; assert rollback + assertive announcement (live region content).
- Editor types: every built-in has at least one happy-path e2e test.

### Perf (smoke + nightly)

- **Smoke** (`smoke-perf-ci`): edit-cell paint < 16ms (Phase 5.5 task wires this).
- **Nightly**: 100 cells edited in sequence, verify no memory leak (heap growth < 1MB after GC).

## a11y test additions

Per `accessibility-rfc §Test Plan`:
- axe-core scan in edit mode: no violations.
- Manual NVDA / VoiceOver / JAWS: edit a cell, listen for the focus announcement (input's accessible name) and the commit announcement (polite region content).
- Manual: validation rejection produces an assertive announcement that interrupts speech.

## Open questions

### How does multi-row paste-into-editing-cell interact with range selection?
Deferred to **range-rfc** (Track 2). Range paste is its own commit pipeline; won't reuse this RFC's single-cell flow. May share the validation framework.

### Server-side validation cache
A consumer may want to cache "I already validated this value last keystroke". Out of scope for this RFC; consumers can implement via memoisation in their own `validate` function.

### Mobile touch activation
Per `accessibility-rfc §Pointer and Touch Fallback`: double-tap enters edit mode. Wired by `mobile-touch-fallback` (Track 7), not this RFC.

### Should `prepare()` Promise rejection re-enter Navigation, or stay in Preparing with retry?
**Decision:** re-enter Navigation. Announce assertive. Consumer can retry by re-activating. Simpler than a Preparing-with-error sub-state.

### Multi-line text editor (Excel Alt+Enter)?
Out of v1 scope. Single-line text input only. Multi-line cell rendering is supported (rowHeight + word-wrap CSS) but the editor is single-line. Can add `editor-textarea` post-1.0.

### What if `onCellEditCommit` returns a Promise that never resolves?
The cell stays `pending: true` forever; consumer's bug. We don't time out — that's the consumer's responsibility (use `Promise.race` with a timer in their handler if they want timeout semantics).

## Acceptance criteria

- All 7 built-in editors implemented and pass unit + integration + e2e tests.
- Edit-cell paint < 16ms in smoke perf.
- axe-core clean in edit mode for every built-in editor.
- `BcEditGrid` end-to-end flow on the AR Customers vertical slice demo: select row → click Edit action → row enters edit mode (Q1 demo currently has this row-action pattern; Q2 lights it up).
- `apps/docs` API page (PR #35) updated: editor types move from `reserved` to `implemented`.
- `tools/api-surface/src/manifest.ts` updated to reflect the additive prop changes (`seedKey`, `pointerHint`, `prepareResult`, `pending`, `editError`, `isDirty`).
- `docs/api.md §7` annotated with the additive fields and a link to this RFC.

## References

- `docs/api.md §7` (editor protocol — frozen surface)
- `docs/api.md §1.1` (column `editable`, `validate`, `valueParser`)
- `docs/api.md §5.2` (`BcEditGridProps.onCellEditCommit`)
- `docs/design.md §11` (editing-model sketch)
- `docs/design/accessibility-rfc.md §Interaction/Edit Mode + §Live Regions`
- `docs/coordination/v1-parity-sprint.md §Track 1`
- `packages/react/src/keyboard.ts` (Q2-reserved keys ready for hookup)
