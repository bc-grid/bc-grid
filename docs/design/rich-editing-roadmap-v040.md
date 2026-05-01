# Rich In-Grid Editing Roadmap for 0.4+

**Status:** Planning blueprint for post-0.4 implementation
**Last updated:** 2026-05-01
**Audience:** bc-grid implementers and consumers planning business edit grids
**Related docs:** `editing-rfc.md`, `server-edit-grid-contract.md`, `api.md`

This document turns the original editing RFC into a concrete roadmap for
feature-rich in-grid editing after 0.3. It reflects what is already wired in
`@bc-grid/react` and `@bc-grid/editors`, then defines the 0.4, 0.5, and later
implementation slices. It is intentionally a blueprint, not an implementation
PR.

## Current State

Already present:

- `BcGrid` and `BcServerGrid` accept `onCellEditCommit`.
- `BcServerGrid` also accepts `onServerRowMutation` and `createServerRowPatch`
  for the managed server mutation path.
- `useEditingController` owns edit lifecycle, overlay patches, per-cell
  `pending` / `error` / dirty state, value parsing, sync/async validation, and
  stale async settle guards.
- `BcCellRendererParams` exposes `editing`, `pending`, `editError`, and
  `isDirty`.
- Built-in editor factories exist for text, number, date, datetime, time,
  select, multi-select, and autocomplete.
- Editor props already include `seedKey`, `pointerHint`, `prepareResult`,
  `pending`, and `commit(value, { moveOnSettle })`.
- Server-row-model mutation helpers can queue, settle, reject, handle
  conflicts, remap row identity, and reconcile optimistic overlays with loaded
  or stale cache blocks.

Known gaps for rich business editing:

- No first-class checkbox/boolean editor factory.
- No full custom lookup editor pattern for server-backed lookup dialogs or
  relation pickers.
- Built-in editors are functional but intentionally native and light; richer
  shadcn/Radix popovers, keyboard roving inside option lists, and lookup
  affordances still need dedicated work.
- Server edit integration is explicit: bc-grid queues and settles mutations, but
  the consumer still owns validation copy, authorization, conflict policy,
  stale save arbitration, and reload/invalidation decisions.
- Controlled edit state is not public. Consumers can control row data, server
  loaders, and mutation callbacks, but not the internal edit overlay map.

## Goals

- Preserve the Excel-feel lifecycle: type/F2/Enter/double-click to edit,
  Enter/Tab to commit and move, Escape to cancel, and real DOM focus inside the
  editor while editing.
- Make every common business field editable without custom code: text, number,
  date, datetime, time, select, multi-select, checkbox/boolean, autocomplete,
  and lookup.
- Keep server-backed grids predictable: optimistic edit overlay first, server
  mutation queue second, explicit invalidation/reload by consumer policy.
- Keep APIs additive and compatible with the current `BcCellEditor` contract.
- Make controlled/uncontrolled boundaries explicit before adding more public
  state.

## Non-Goals

- No spreadsheet formulas.
- No full row-edit mode in 0.4.
- No batch transaction UI in 0.4.
- No undo/redo in 0.4.
- No app-specific bsncraft code in bc-grid.
- No hidden automatic server reload policy after accepted edits. Consumers must
  choose row, view, or purge refresh based on their domain.

## API Direction

### Column Editing Surface

The existing column surface remains the base:

```ts
interface BcReactGridColumn<TRow, TValue = unknown> {
  editable?: boolean | ((row: TRow) => boolean)
  cellEditor?: BcCellEditor<TRow, TValue>
  valueParser?: (input: string, row: TRow) => TValue
  validate?: (
    newValue: TValue,
    row: TRow,
    signal?: AbortSignal,
  ) => BcValidationResult | Promise<BcValidationResult>
  options?:
    | readonly { value: TValue; label: string }[]
    | ((row: TRow) => readonly { value: TValue; label: string }[])
  fetchOptions?: (
    query: string,
    signal: AbortSignal,
  ) => Promise<readonly { value: TValue; label: string }[]>
}
```

0.4 should not add a parallel `editorType: "text" | "number" | ...` shortcut.
That shortcut is attractive, but it would duplicate `cellEditor` and create
ambiguity around editor options. Instead, docs and examples should show small
factories:

```ts
import { textEditor, numberEditor, selectEditor } from "@bc-grid/editors"

const columns = [
  { field: "name", header: "Name", editable: true, cellEditor: textEditor },
  { field: "creditLimit", header: "Credit Limit", editable: true, cellEditor: numberEditor },
  {
    field: "status",
    header: "Status",
    editable: true,
    cellEditor: selectEditor,
    options: [
      { value: "active", label: "Active" },
      { value: "hold", label: "On hold" },
    ],
  },
]
```

### Grid Editing Surface

Current grid props are enough for 0.4:

```ts
interface BcGridProps<TRow> {
  onCellEditCommit?: (event: BcCellEditCommitEvent<TRow>) => void | Promise<void>
  flashOnEdit?: boolean
}
```

`onCellEditCommit` remains post-overlay. A rejected promise rolls back the edit
overlay and surfaces `editError`.

0.5 can add controlled edit-state APIs only if consumers need to externalize
pending/error state:

```ts
interface BcGridProps<TRow> {
  editState?: BcGridEditState
  defaultEditState?: BcGridEditState
  onEditStateChange?: (next: BcGridEditState, prev: BcGridEditState) => void
}
```

Do not expose `Map<RowId, Map<ColumnId, ...>>` directly. If this becomes public,
use a JSON-safe DTO:

```ts
interface BcGridEditState {
  entries: readonly BcGridEditStateEntry[]
}

interface BcGridEditStateEntry {
  rowId: RowId
  columnId: ColumnId
  pending?: boolean
  error?: string
  dirty?: boolean
  mutationId?: string
}
```

### Server Editing Surface

Current server props are the 0.4 contract:

```ts
interface BcServerEditMutationProps<TRow> {
  onServerRowMutation?: (
    event: BcServerEditMutationEvent<TRow>,
  ) => ServerMutationResult<TRow> | Promise<ServerMutationResult<TRow>>
  createServerRowPatch?: (
    event: BcCellEditCommitEvent<TRow>,
    defaultPatch: ServerRowPatch,
  ) => ServerRowPatch
}
```

`onServerRowMutation` is the managed path:

1. `BcServerGrid` creates a `ServerRowPatch`.
2. It queues the optimistic server-row-model mutation.
3. It awaits consumer persistence.
4. It settles the mutation result.
5. It rejects the edit promise for rejected/conflict results so the cell
   rollback path runs.

Bare `onCellEditCommit` on `BcServerGrid` is the manual path. It does not queue
a server mutation or reload rows unless the consumer calls the API.

## Editor Catalog

### Text

0.4 scope:

- Native input remains acceptable.
- Printable-key activation replaces the prior value through `seedKey`.
- `valueParser` runs when the editor commits a string.
- `pending` disables the input during async validation/save.

0.5 scope:

- Optional max length, trim-on-commit, and select-all-on-enter helper options if
  consumers need them.

### Number

0.4 scope:

- Keep `numberEditor` as string-on-commit plus `valueParser`.
- Document locale parsing as consumer-owned unless a parser helper is supplied.
- Validation should own min/max/precision errors.

0.5 scope:

- Add optional parser helpers for common decimal/currency cases.
- Consider a typed number editor that commits `number | null` directly.

### Date, Time, and Datetime

0.4 scope:

- Existing native date/time/datetime editors stay the default.
- Commit ISO strings.
- Consumers use `valueParser` for `Date`, timezone, or server-specific shapes.

0.5 scope:

- Rich date picker popover with portal marker, keyboard roving, and clear button.
- Explicit timezone documentation for datetime.

### Select and Multi-Select

0.4 scope:

- Existing native select/multi-select are sufficient for small option sets.
- `options` can be static or row-derived.
- Typed values commit from options without `valueParser`.

0.5 scope:

- Searchable popover select for larger option sets.
- Empty/clear affordance and disabled option support.
- Better keyboard roving for option lists.

### Checkbox / Boolean

0.4 scope:

- Add `checkboxEditor` as a small factory if implementation starts.
- Commit `true`, `false`, or `null` only if the column opts into tri-state.
- Space toggles in edit mode. Enter commits and moves.

Proposed factory:

```ts
interface CheckboxEditorOptions {
  triState?: boolean
  trueLabel?: string
  falseLabel?: string
  nullLabel?: string
}

declare function checkboxEditor(options?: CheckboxEditorOptions): BcCellEditor<unknown, boolean>
```

0.5 scope:

- Header/filter/editor consistency for boolean fields.
- Accessible indeterminate state in tri-state mode.

### Autocomplete

0.4 scope:

- Existing autocomplete fetches options with `fetchOptions(query, signal)`.
- It is a field editor, not a relation picker. It may commit free text.
- Async races are owned by the editor through `AbortSignal`.

0.5 scope:

- Add "must match option" mode if consumers need strict value selection.
- Add loading and empty states in the option list.

### Custom Lookup

0.4 scope:

- Document the custom editor pattern, but do not ship a full lookup dialog.
- A lookup editor is a custom `BcCellEditor` whose `prepare()` can preload the
  current display value and whose component opens a consumer-owned modal or
  popover.
- The portal root must carry `data-bc-grid-editor-portal`.
- The editor commits the selected row ID or relation DTO according to the
  column's value contract.

0.5 scope:

- Provide a recipe using `BcServerGrid` inside a lookup popover/dialog.
- Define optional helper types only after at least one real consumer integration
  proves the needed shape.

Later:

- Shared lookup primitives, recent items, keyboard typeahead across unloaded
  results, and relation display caching.

## Validation

0.4 should keep validation per cell:

- `validate(value, row, signal?)` runs after `valueParser` and before overlay
  commit.
- Sync and async results use `BcValidationResult`.
- Async validation receives an `AbortSignal`; superseded commits abort older
  validation.
- Invalid results keep the editor open, surface `error`, and announce the error.

Consumer-owned validation:

- Cross-row uniqueness checks.
- Permission checks.
- Server business rules.
- Conflict copy.

bc-grid-owned validation mechanics:

- Calling validators in the right order.
- Cancelling stale async validators.
- Keeping focus in the editor on invalid results.
- Rolling back overlay on rejected async save.
- Exposing `editError` and `pending` to renderers.

## Async Save States

Cell states should remain:

- `editing`: editor is mounted and owns DOM focus.
- `dirty`: local overlay differs from source row and is not pending/error.
- `pending`: consumer commit promise or server mutation is in flight.
- `error`: validation/server save rejected and the overlay rolled back or stayed
  blocked.

Row states aggregate cell states:

- Any pending cell makes row actions that can destroy data disabled by default.
- First error message is exposed to row action renderers.

0.4 should not add a global save queue UI. Consumers can build one from
renderer params and `BcServerGridApi.getServerDiagnostics()`.

## Keyboard Flow

0.4 keyboard contract:

- F2 starts editing without replacing the current value.
- Enter starts editing from navigation mode; inside edit mode it commits and
  moves down.
- Shift+Enter commits and moves up.
- Tab commits and moves right; Shift+Tab commits and moves left.
- Escape cancels and keeps focus on the current cell.
- Printable characters start edit mode and replace the current value.
- Double-click starts edit mode with pointer hint.
- Editors can intercept arrows, Home/End, and typeahead while focused.

The grid owns commit/cancel/move keys at the editor wrapper boundary. Editors
that parse and commit typed values themselves can pass `moveOnSettle`.

## Controlled and Uncontrolled APIs

0.4:

- Editing is uncontrolled inside bc-grid.
- Consumers control row data by updating `data` after commits.
- Server consumers control persistence through `onServerRowMutation`.
- Consumers can observe state through renderer params and server diagnostics.

0.5:

- Consider JSON-safe controlled edit state if consumers need external pending
  badges or global save bars.
- Consider `onEditStart`, `onEditCancel`, and `onEditStateChange` if they are
  needed by real app integrations.

Later:

- Full transaction/batch APIs.
- Undo/redo APIs.
- Row edit mode.

## Server Integration

For server-backed edit grids, 0.4 should document these expectations:

- Use `rowId` from the server entity ID, never visible index.
- Use `columnId === field` for persisted fields when possible.
- Use `createServerRowPatch` to attach `baseRevision`, custom `mutationId`, or
  column-to-API-field mapping.
- Return accepted results with the canonical row when possible.
- Return rejected results for validation/permission failures.
- Return conflict results when the server has a newer row and include the
  canonical row when the server wins.
- Invalidate rows when the edited fields can affect cached row copies.
- Invalidate the view when sort/filter/group/search membership may move the row.
- Refresh/purge only when a targeted invalidation is not enough.

bc-grid owns:

- Building and queueing the optimistic `ServerRowPatch`.
- Reconciling loaded/stale cache blocks.
- Rejecting the edit promise for rejected/conflict results.
- Exposing diagnostics for request/cache/pending mutation state.

Consumer owns:

- Persistence endpoint.
- Validation and permission messages.
- Conflict resolution policy.
- Retry affordance.
- Choosing row/view/purge invalidation.
- Ignoring or cancelling stale application-level save promises when a newer edit
  supersedes them.

## Phasing

### 0.4

- Publish this roadmap.
- Keep `BcCellEditor` and `onServerRowMutation` APIs additive.
- Add/finish checkbox editor if a small PR can do it cleanly.
- Add docs examples for text, number, date, select, checkbox, autocomplete, and
  custom lookup editor patterns.
- Add focused non-Playwright tests for:
  - keyboard commit/cancel move directives,
  - async validation cancellation,
  - pending/error renderer params,
  - server mutation queue and rollback,
  - `createServerRowPatch` customization.

### 0.5

- Rich select/date/lookup popover editors with portal markers and keyboard
  roving.
- Optional controlled edit state DTO if examples show a real need.
- Server edit UX examples with retry and conflict policies.
- Parser helper utilities for number/currency/date if repeated consumer code
  appears.
- Broader docs for lookup-driven business fields.

### Later

- Batch edit transactions.
- Undo/redo.
- Row edit mode.
- Fill handle and paste integration with validation.
- Bulk save queues.
- Relation lookup primitives shared across grids.

## Implementation Guardrails

- Keep editor factories in `@bc-grid/editors`; keep grid mechanics in
  `@bc-grid/react`.
- Prefer additive props and helper factories over large new component variants.
- Do not add a second editor declaration system until `cellEditor` proves
  insufficient.
- Avoid app-specific lookup assumptions.
- Keep pure state-machine tests close to `editingStateMachine` and
  `useEditingController` helpers.
- Browser/Playwright validation is coordinator-owned for visual/focus behavior.

## Open Questions

- Should `checkboxEditor` support tri-state by default, or require explicit
  `triState: true`?
- Do consumers need controlled edit state in 0.5, or are renderer params and
  diagnostics enough?
- Should `autocompleteEditor` get a strict "must match option" mode, or should
  strict lookup move directly to a custom lookup recipe?
- Does server edit conflict handling need a built-in cell affordance, or should
  the grid only surface `editError` and leave resolution UI to the app?
- Should parser helpers live in `@bc-grid/editors` or a new tiny package if they
  become shared across filters and editors?
