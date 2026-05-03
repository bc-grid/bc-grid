# Multi-Cell Range Delete (with Confirm)

When a user has a range selection covering more than one cell and presses `Delete` or `Backspace`, the grid can clear every editable cell in the range — optionally awaiting a consumer-supplied confirm dialog first. v0.6 §1 polish — closes the spreadsheet-native gesture for bulk clear.

**Default is opt-out**: until you wire `confirmRangeDelete`, multi-cell range Delete falls through to the v0.5 single-cell clear path (clears only the active cell). This preserves existing consumer behaviour.

## Public surface

```ts
interface BcGridProps<TRow> {
  confirmRangeDelete?:
    | boolean
    | ((range: BcRange) => boolean | Promise<boolean>)
}
```

| Value | Behaviour |
|---|---|
| `undefined` / `false` (default) | Range Delete clears just the active cell (v0.5 single-cell path). |
| `true` | Range Delete clears every editable cell in the range, no prompt. |
| Function | Grid awaits the function with the active range; on `true` resolution → multi-cell clear; on `false` → no-op. |

The check fires only when:
- `Delete` or `Backspace` is pressed.
- No modifier keys are held (Shift+Delete is the actions-column shortcut from #464; Cmd+Delete is browser back-navigation on macOS).
- The active range covers more than one cell.

Single-cell Delete (no range) always falls through to the existing single-cell clear behaviour — `confirmRangeDelete` doesn't affect it.

## Pattern: enable without prompt

For consumers who want the spreadsheet behaviour but don't need a confirm:

```tsx
<BcGrid
  data={rows}
  columns={columns}
  rowId={(r) => r.id}
  confirmRangeDelete={true}
/>
```

Range Delete now clears every editable cell in the range. Each cell flows through `column.valueParser` + `column.validate` + `onCellEditCommit` per-cell — same pipeline as a keyboard clear. Cells that fail validation surface their per-cell errors; the range as a whole isn't atomic (see "Atomicity" below).

## Pattern: prompt before clearing

The function form awaits a Promise so consumer dialogs (modal libraries, confirm shells, etc.) gate the clear:

```tsx
import { useDialog } from "@/components/dialog"

function CustomersGrid() {
  const dialog = useDialog()

  return (
    <BcGrid
      data={rows}
      columns={columns}
      rowId={(r) => r.id}
      confirmRangeDelete={async (range) => {
        const cellCount = computeRangeCellCount(range, rows, columns)
        return await dialog.confirm({
          title: "Clear contents",
          message: `Clear contents of ${cellCount} cells? This can't be undone.`,
          confirmLabel: "Clear",
          destructive: true,
        })
      }}
    />
  )
}
```

The function receives the active `BcRange` (`{ start, end }`); compute the cell count via the consumer's row + column model. Returning `false` (or a Promise that resolves false) skips the clear silently — no overlay write, no `onCellEditCommit` fires.

## Pattern: native browser confirm (zero-dependency baseline)

For prototyping or simple apps, the browser's `window.confirm` works as a one-liner:

```tsx
<BcGrid
  // ...
  confirmRangeDelete={() =>
    window.confirm("Clear contents of selected cells?")
  }
/>
```

`window.confirm` returns synchronously, so the grid skips the Promise branch and clears immediately on `true`. Most production apps want a styled modal — wire your dialog library via the async pattern above.

## Atomicity

Multi-cell range delete is **per-cell, not atomic**. Each cell goes through:

1. `column.valueParser("")` (if defined)
2. `column.validate(parsedValue, row)` (if defined)
3. Overlay write
4. `onCellEditCommit(event)` fires with `source: "keyboard"`

If a cell's `validate` rejects (e.g. required field, business rule), THAT cell stays unchanged — the others in the range still clear. The user sees per-cell error surfaces (the existing single-cell error UX). This matches Excel's behaviour: rejected cells flash their error indicator; accepted cells go blank.

For all-or-nothing semantics, use `apiRef.current?.applyRowPatches([...])` instead — see `docs/recipes/bulk-row-patch.md`. Range delete is the keyboard-driven path; bulk patch is the programmatic atomic path.

## When NOT to use

- **Read-only grids.** Skip the prop entirely; the keystroke falls through to the existing no-op (cells aren't editable, so clearCell rejects each).
- **Append-only audit grids.** If commits are immutable, leave `confirmRangeDelete` unset — the v0.5 single-cell clear surfaces the rejection on the active cell only, which is the right UX (the user expects to see why their gesture failed, not a silent no-op across N cells).
- **Single-cell only flows.** If your app has range selection enabled for copy/paste UX but doesn't want bulk clear, leave `confirmRangeDelete: undefined`. Range Delete then clears just the active cell (predictable single-cell semantics).
- **Consumer-managed bulk-edit modal.** If your app has a "Bulk edit selected" toolbar that opens its own modal for bulk operations, don't double up — the keyboard gesture and the toolbar should produce consistent UX. Either wire both through the modal, or wire neither and let users use the toolbar exclusively.
