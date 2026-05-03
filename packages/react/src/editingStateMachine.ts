import type { BcCellPosition, BcValidationResult } from "@bc-grid/core"

/**
 * Pure state machine for the cell-edit lifecycle, per
 * `docs/design/editing-rfc.md §Lifecycle`. Lives outside React so the
 * 8-state graph is unit-testable without a DOM.
 *
 * State graph:
 *
 *   Navigation
 *     │ activate (F2 / Enter / printable / dblclick)
 *     ↓
 *   Preparing                    (optional — runs editor.prepare())
 *     │ resolved (or skipped)
 *     ↓
 *   Mounting                     (component mounts; focus shifts to focusRef)
 *     │ first paint
 *     ↓
 *   Editing                      (user types)
 *     │
 *     ├─ commit ─────► Validating ─ valid ──► Committing ─► Unmounting ─► Navigation
 *     │                          ─ invalid ─► Editing (with error)
 *     ├─ cancel ─────► Cancelling ─────────► Unmounting ─► Navigation
 *     └─ click-out ──► Validating (treated as commit; portal-aware in framework wiring)
 *
 * Validation can be async; the machine treats `Validating` as a terminal
 * state until a `validateResolved` event drives it forward. Async cancel
 * is handled by the controller via `AbortSignal` — the machine itself
 * stays synchronous.
 */

export type EditMode =
  | "navigation"
  | "preparing"
  | "mounting"
  | "editing"
  | "validating"
  | "committing"
  | "cancelling"
  | "unmounting"

/** How the user landed in edit mode — drives initial editor seeding. */
export type ActivationSource = "f2" | "enter" | "printable" | "doubleclick" | "api"

/** Discriminated edit state. */
export type EditState<TValue = unknown> =
  | { mode: "navigation" }
  | {
      mode: "preparing"
      cell: BcCellPosition
      activation: ActivationSource
      seedKey?: string
      pointerHint?: { x: number; y: number }
    }
  | {
      mode: "mounting"
      cell: BcCellPosition
      activation: ActivationSource
      seedKey?: string
      pointerHint?: { x: number; y: number }
      prepareResult?: unknown
    }
  | {
      mode: "editing"
      cell: BcCellPosition
      activation: ActivationSource
      seedKey?: string
      pointerHint?: { x: number; y: number }
      prepareResult?: unknown
      error?: string
    }
  | {
      mode: "validating"
      cell: BcCellPosition
      activation: ActivationSource
      pendingValue: TValue
      /**
       * Async-validate path: how to advance the active cell after the
       * commit settles. Captured at `commit` time so the consumer's
       * intended Tab/Enter/Esc semantics survive the async boundary.
       */
      moveOnSettle: MoveOnSettle
    }
  | {
      mode: "committing"
      cell: BcCellPosition
      activation: ActivationSource
      committedValue: TValue
      moveOnSettle: MoveOnSettle
    }
  | {
      mode: "cancelling"
      cell: BcCellPosition
      activation: ActivationSource
    }
  | {
      mode: "unmounting"
      cell: BcCellPosition
      activation: ActivationSource
      next: NextActiveCell<TValue>
    }

/** What active-cell movement to apply when edit ends. */
export type MoveOnSettle = "stay" | "down" | "up" | "right" | "left"

export interface NextActiveCell<TValue = unknown> {
  /** What movement to apply next; computed by the controller from MoveOnSettle + grid extents. */
  move: MoveOnSettle
  /** Final value committed to the row model — undefined for cancel paths. */
  committedValue?: TValue
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export type EditEvent<TValue = unknown> =
  | {
      type: "activate"
      cell: BcCellPosition
      activation: ActivationSource
      seedKey?: string
      pointerHint?: { x: number; y: number }
    }
  | { type: "prepareResolved"; prepareResult?: unknown }
  | { type: "prepareRejected"; error: string }
  | { type: "mounted" }
  | { type: "commit"; value: TValue; moveOnSettle: MoveOnSettle }
  | { type: "cancel" }
  | { type: "validateResolved"; result: BcValidationResult }
  | { type: "unmounted" }

// ---------------------------------------------------------------------------
// Transition function
// ---------------------------------------------------------------------------

/**
 * Pure transition. Returns the next state OR the same state if the event
 * is invalid in the current mode. Invalid transitions are silently
 * absorbed — the controller is the source of truth for "is this gesture
 * meaningful right now".
 */
export function reduceEditState<TValue>(
  state: EditState<TValue>,
  event: EditEvent<TValue>,
): EditState<TValue> {
  switch (state.mode) {
    case "navigation":
      if (event.type === "activate") {
        return {
          mode: "preparing",
          cell: event.cell,
          activation: event.activation,
          ...(event.seedKey != null ? { seedKey: event.seedKey } : {}),
          ...(event.pointerHint ? { pointerHint: event.pointerHint } : {}),
        }
      }
      return state

    case "preparing":
      if (event.type === "prepareResolved") {
        return {
          mode: "mounting",
          cell: state.cell,
          activation: state.activation,
          ...(state.seedKey != null ? { seedKey: state.seedKey } : {}),
          ...(state.pointerHint ? { pointerHint: state.pointerHint } : {}),
          ...(event.prepareResult !== undefined ? { prepareResult: event.prepareResult } : {}),
        }
      }
      if (event.type === "prepareRejected") {
        // Graceful degradation (audit P1-W3-2 follow-up). A prepare
        // failure used to abort activation and bounce back to
        // Navigation. For vendor-lookup ERPs on flaky networks that
        // meant a network blip silently blocked edit. We now mount the
        // editor with no preload so the synchronous `column.options` /
        // first-keystroke `fetchOptions` paths still work — the user
        // gets a working editor, just without the prepare-resolved
        // initial state. The error message is still surfaced via the
        // controller's announce hook so AT users hear the failure.
        return {
          mode: "mounting",
          cell: state.cell,
          activation: state.activation,
          ...(state.seedKey != null ? { seedKey: state.seedKey } : {}),
          ...(state.pointerHint ? { pointerHint: state.pointerHint } : {}),
        }
      }
      if (event.type === "cancel") {
        return { mode: "navigation" }
      }
      return state

    case "mounting":
      if (event.type === "mounted") {
        return {
          mode: "editing",
          cell: state.cell,
          activation: state.activation,
          ...(state.seedKey != null ? { seedKey: state.seedKey } : {}),
          ...(state.pointerHint ? { pointerHint: state.pointerHint } : {}),
          ...(state.prepareResult !== undefined ? { prepareResult: state.prepareResult } : {}),
        }
      }
      if (event.type === "cancel") {
        return { mode: "cancelling", cell: state.cell, activation: state.activation }
      }
      return state

    case "editing":
      if (event.type === "commit") {
        return {
          mode: "validating",
          cell: state.cell,
          activation: state.activation,
          pendingValue: event.value,
          moveOnSettle: event.moveOnSettle,
        }
      }
      if (event.type === "cancel") {
        return { mode: "cancelling", cell: state.cell, activation: state.activation }
      }
      return state

    case "validating":
      if (event.type === "validateResolved") {
        if (event.result.valid) {
          return {
            mode: "committing",
            cell: state.cell,
            activation: state.activation,
            committedValue: state.pendingValue,
            moveOnSettle: state.moveOnSettle,
          }
        }
        return {
          mode: "editing",
          cell: state.cell,
          activation: state.activation,
          error: event.result.error,
        }
      }
      if (event.type === "cancel") {
        return { mode: "cancelling", cell: state.cell, activation: state.activation }
      }
      return state

    case "committing":
      // The controller transitions Committing → Unmounting after the
      // overlay-update render lands. No event drives this from inside the
      // pure machine; the controller dispatches `unmounted` (treated as a
      // terminator below) once the editor element is removed.
      if (event.type === "unmounted") {
        return {
          mode: "unmounting",
          cell: state.cell,
          activation: state.activation,
          next: { move: state.moveOnSettle, committedValue: state.committedValue },
        }
      }
      return state

    case "cancelling":
      if (event.type === "unmounted") {
        return {
          mode: "unmounting",
          cell: state.cell,
          activation: state.activation,
          next: { move: "stay" },
        }
      }
      return state

    case "unmounting":
      // The controller dispatches the implicit "back to navigation" after
      // applying the next-active-cell move. We model that as another
      // `unmounted` event from the controller's perspective.
      if (event.type === "unmounted") return { mode: "navigation" }
      return state
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function isEditingMode(mode: EditMode): boolean {
  return mode !== "navigation"
}

/**
 * Whether the editor element should be in the DOM right now. True from
 * Mounting through Unmounting (inclusive) so the editor can hand off
 * focus cleanly back to the grid root before the DOM node disappears.
 */
export function isEditorMounted(mode: EditMode): boolean {
  return (
    mode === "mounting" ||
    mode === "editing" ||
    mode === "validating" ||
    mode === "committing" ||
    mode === "cancelling" ||
    mode === "unmounting"
  )
}

/**
 * Whether keyboard arrow / Home / End / PageUp/Down should be intercepted
 * by the grid's navigation handler. False once the editor takes ownership.
 */
export function isGridKeyboardActive(mode: EditMode): boolean {
  return mode === "navigation"
}

/**
 * Compute the post-edit active cell index from the move-on-settle hint
 * and grid extents. Pure so the wrap behaviour is unit-testable without
 * mounting the grid. Per `editing-rfc §Keyboard model in edit mode`:
 *
 *   - "down" / "up" advance one row, clamped at extents.
 *   - "right" advances one column; at last column, wraps to next row's
 *     first column. At the absolute last cell, stays put.
 *   - "left" advances one column back; at first column, wraps to
 *     previous row's last column. At the absolute first cell, stays put.
 *   - "stay" or unrecognised → no movement.
 *
 * Returns `{ row, col }` indices into the row + column lists.
 */
export function nextActiveCellAfterEdit(
  rowIndex: number,
  colIndex: number,
  lastRow: number,
  lastCol: number,
  move: MoveOnSettle,
): { row: number; col: number } {
  if (move === "down" && rowIndex < lastRow) return { row: rowIndex + 1, col: colIndex }
  if (move === "up" && rowIndex > 0) return { row: rowIndex - 1, col: colIndex }
  if (move === "right") {
    if (colIndex < lastCol) return { row: rowIndex, col: colIndex + 1 }
    if (rowIndex < lastRow) return { row: rowIndex + 1, col: 0 }
  }
  if (move === "left") {
    if (colIndex > 0) return { row: rowIndex, col: colIndex - 1 }
    if (rowIndex > 0) return { row: rowIndex - 1, col: lastCol }
  }
  return { row: rowIndex, col: colIndex }
}

/**
 * Tab/Shift+Tab edge-handling mode. v0.6 follow-up to #431 driven
 * by bsncraft consumer feedback: should Tab from the last editable
 * cell of the last row wrap to the first editable of the first
 * row? Excel + Google Sheets default YES (wraparound). The grid
 * exposes the choice via `BcGridProps.editorTabWraparound`.
 *
 *   - `"none"`: clamp at edge (the original v0.6 behaviour) — Tab
 *     past the last editable cell stays put.
 *   - `"row-wrap"` (default): scan all rows freely; at the trailing
 *     edge wrap forward to (0, 0); at the leading edge wrap
 *     backward to (lastRow, lastCol). Matches Excel / Google
 *     Sheets default.
 *   - `"selection-wrap"`: when an explicit selection of ≥2 rows is
 *     active AND the editing row is part of it, restrict Tab/
 *     Shift+Tab traversal to selected rows only — wraparound stays
 *     within the selection. The "data-entry across the selected
 *     rows" pattern from spreadsheet apps. Falls through to
 *     `"row-wrap"` when the gating conditions aren't met (the user
 *     is editing outside the selection, or fewer than 2 rows are
 *     selected) so Tab still works.
 */
export type EditorTabWraparound = "none" | "row-wrap" | "selection-wrap"

/**
 * Like `nextActiveCellAfterEdit` but skips non-editable cells for
 * Tab / Shift+Tab moves. Down / up keep the same-column behaviour
 * (mirrors AG Grid — the user pressed Enter / Shift+Enter so they
 * want vertical motion regardless of editability).
 *
 * For `"right"` (Tab): scans forward through cells in linear order
 * (across columns then rows) starting from the naive next cell;
 * first editable cell wins. For `"left"` (Shift+Tab): same but
 * backward. Edge behaviour depends on `options.wraparound`:
 *
 *   - `"none"`: stays put when the scan runs off the trailing /
 *     leading edge (original behaviour).
 *   - `"row-wrap"` (default): wraps to the opposite end of the
 *     grid and continues scanning. Matches Excel / Google Sheets.
 *   - `"selection-wrap"`: restricts the scan to selected rows
 *     only and wraps within the selection. Falls through to
 *     `"row-wrap"` when the editing row is outside the selection
 *     or the selection has fewer than 2 rows (so Tab still works
 *     on the editing row).
 *
 * The `isCellEditableAt(rowIndex, colIndex)` callback encapsulates
 * the editable / disabled / row-kind checks. `isRowSelected` is
 * only consulted when `wraparound === "selection-wrap"`. Returns
 * `{ row, col }` of the destination, or the original cell when no
 * editable cell exists anywhere in the scan range (avoids stranding
 * the user at a non-editable cell).
 *
 * Worker3 v06-editor-keyboard-navigation-polish (#431) +
 * v06-editor-tab-wraparound-polish.
 */
export function nextEditableCellAfterEdit(
  rowIndex: number,
  colIndex: number,
  lastRow: number,
  lastCol: number,
  move: MoveOnSettle,
  isCellEditableAt: (rowIndex: number, colIndex: number) => boolean,
  options?: {
    wraparound?: EditorTabWraparound | undefined
    isRowSelected?: ((rowIndex: number) => boolean) | undefined
    selectedRowCount?: number | undefined
  },
): { row: number; col: number } {
  // Down / up stay in the same column even when the target row's
  // cell at that column isn't editable. Same as pre-v0.6 behaviour
  // and matches AG Grid's vertical-Enter semantics.
  if (move !== "right" && move !== "left") {
    return nextActiveCellAfterEdit(rowIndex, colIndex, lastRow, lastCol, move)
  }

  const wraparound = options?.wraparound ?? "row-wrap"
  // selection-wrap gating: requires ≥2 selected rows AND the editing
  // row to be one of them. Otherwise fall through to row-wrap so the
  // user isn't stranded — editing a non-selected row should still
  // wrap somewhere instead of doing nothing.
  const useSelectionWrap =
    wraparound === "selection-wrap" &&
    options?.isRowSelected != null &&
    (options.selectedRowCount ?? 0) >= 2 &&
    options.isRowSelected(rowIndex)
  const isRowEligible = useSelectionWrap
    ? (r: number) => options.isRowSelected?.(r) ?? false
    : () => true

  const direction = move === "right" ? 1 : -1
  let r = rowIndex
  let c = colIndex
  // Iteration cap to guard against pathological "no editable cell
  // anywhere in scope" inputs (or scope shrinking to 1 row that
  // happens to be the active one with no editable cells).
  const maxIterations = (lastRow + 1) * (lastCol + 1) + 1
  let iterations = 0

  for (;;) {
    iterations++
    if (iterations > maxIterations) return { row: rowIndex, col: colIndex }

    if (direction === 1) {
      if (c < lastCol) {
        c += 1
      } else if (r < lastRow) {
        r += 1
        c = 0
      } else if (wraparound === "none") {
        return { row: rowIndex, col: colIndex }
      } else {
        // row-wrap or selection-wrap: continue from the start.
        r = 0
        c = 0
      }
    } else {
      if (c > 0) {
        c -= 1
      } else if (r > 0) {
        r -= 1
        c = lastCol
      } else if (wraparound === "none") {
        return { row: rowIndex, col: colIndex }
      } else {
        // row-wrap or selection-wrap: continue from the end.
        r = lastRow
        c = lastCol
      }
    }

    // We've wrapped all the way back to the origin without finding
    // an editable cell — bail. This is the post-wrap symmetry of the
    // pre-wrap "stays put" behaviour.
    if (r === rowIndex && c === colIndex) return { row: rowIndex, col: colIndex }

    if (!isRowEligible(r)) continue
    if (isCellEditableAt(r, c)) return { row: r, col: c }
  }
}
