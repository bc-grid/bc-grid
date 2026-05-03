# Editor Cell Undo / Redo

`Cmd/Ctrl+Z` reverts the most recent commit on the focused row; `Cmd+Shift+Z` (Mac) or `Ctrl+Y` (Windows) re-applies it. Per-row scope, capped at the last 10 commits per row to bound memory. v0.6 §1 polish — closes the spreadsheet-native gesture gap (the input's own undo history covers in-progress text within an editor; this covers POST-COMMIT undo across cells in a row).

The grid wires the gesture at the root keyboard handler. No consumer setup is required — undo/redo just works on any `<BcGrid>` / `<BcServerGrid>` / `<BcEditGrid>` with editing enabled. Consumer's `onCellEditCommit` fires with `source: "undo"` / `source: "redo"` so server-state mirroring stays consistent with the displayed grid.

## Gesture

| Platform | Undo | Redo |
|---|---|---|
| Mac | `Cmd+Z` | `Cmd+Shift+Z` |
| Windows | `Ctrl+Z` | `Ctrl+Y` or `Ctrl+Shift+Z` |

Triggers when:
- The grid root has keyboard focus
- The active cell is inside a data row (group rows are not affected)
- The row's history stack has at least one entry

No-op when:
- An editor is currently mounted (the input's native undo handles in-progress text)
- The focused row has no history (no prior commits)

## Semantics

- **Per-row scope.** Each row maintains its own undo stack; Cmd+Z on row A undoes A's most recent commit, not row B's. Per spreadsheet UX convention.
- **Capped at 10 entries per row.** When the cap is reached, the oldest entry shifts out. Bounds memory regardless of how aggressively the user edits a single row.
- **Redo stack clears on new commits.** Typing a new value into a cell invalidates pending redos — the user has chosen a new history branch. Same as Excel / Google Sheets.
- **Bypasses `column.valueParser` + `column.validate`.** The value being restored was already valid at original commit time. Re-validating could spuriously reject (e.g. a uniqueness check where another row now holds that value). The consumer's `onCellEditCommit` is still the gatekeeper for the round-trip.

## Source discrimination on `onCellEditCommit`

`BcCellEditCommitEvent.source` widens with `"undo"` / `"redo"`:

```ts
source: "keyboard" | "pointer" | "api" | "paste" | "fill" | "scroll-out" | "undo" | "redo"
```

Consumer can split telemetry / branch on the source:

```ts
function handleCommit(event: BcCellEditCommitEvent<Customer>): void {
  if (event.source === "undo" || event.source === "redo") {
    // The grid is restoring a previously-committed value. Mirror
    // to the server but skip secondary side-effects (audit log,
    // notification, etc.) that the original commit already triggered.
    void mirrorToServer(event.rowId, event.column.field, event.nextValue)
    return
  }
  // Normal commit path — full side-effect chain.
  void mirrorToServer(event.rowId, event.column.field, event.nextValue)
  void writeAuditLog(event)
  void notifyCollaborators(event)
}
```

If the consumer treats undo/redo identically to a normal commit (most apps do), no branching is needed.

## Imperative API

The editing controller exposes:

```ts
interface EditingController<TRow> {
  undoLastEdit(rowId: RowId): BcEditHistoryEntry | null
  redoLastEdit(rowId: RowId): BcEditHistoryEntry | null
  applyHistoryEntry(params: {
    rowId: RowId
    row: TRow
    column: BcReactGridColumn<TRow>
    entry: BcEditHistoryEntry
    mode: "undo" | "redo"
  }): void
  getEditHistoryDepth(rowId: RowId): { undo: number; redo: number }
}
```

Use `getEditHistoryDepth` to gate UI affordances (a chrome button, a context-menu item, a status segment showing "X edits to undo"):

```tsx
function RowChromeUndoButton({ apiRef, rowId }: { apiRef: RefObject<BcGridApi<TRow>>, rowId: RowId }) {
  const depth = apiRef.current?.getEditHistoryDepth?.(rowId) ?? { undo: 0, redo: 0 }
  return (
    <button disabled={depth.undo === 0} onClick={() => /* ... wire to api */ {}}>
      Undo ({depth.undo})
    </button>
  )
}
```

Note: `undoLastEdit` / `redoLastEdit` / `applyHistoryEntry` / `getEditHistoryDepth` are not yet promoted to `BcGridApi` — they live on the internal editing controller. Promotion is a follow-up if consumer demand for programmatic undo (toolbar buttons, keyboard alternative bindings) materializes.

## When NOT to use

- **Consumer-side undo systems.** If your app already has a global undo stack (e.g. Cmd+Z handled at the route level), wire `onCellEditCommit` to push entries to your stack and disable bc-grid's gesture by capturing the keydown event before it reaches the grid root. Bc-grid's undo is per-row scope; a global undo stack with cross-row + cross-route entries is the consumer's responsibility.
- **Append-only audit-style grids.** If commits cannot be reverted (e.g. each row is a financial transaction that's signed and immutable post-commit), do not wire onEdit / cellEditor — the row stays read-only and the gesture has nothing to act on.
