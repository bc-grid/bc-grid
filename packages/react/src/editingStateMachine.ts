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
