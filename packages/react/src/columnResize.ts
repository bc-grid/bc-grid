import type { BcColumnStateEntry, ColumnId } from "@bc-grid/core"

/**
 * In-flight column-resize session. Captured on pointer-down at the column
 * boundary; updated on every pointer-move; resolved on pointer-up. Lives
 * outside the BcGrid component so the geometry math is unit-testable.
 */
export interface ColumnResizeSession {
  columnId: ColumnId
  /** Pointer X at the moment resize started, in client coordinates. */
  startClientX: number
  /** Column width at the moment resize started. */
  startWidth: number
  /** Lower bound from `column.minWidth` (defaulted by the caller). */
  minWidth: number
  /** Upper bound from `column.maxWidth` (defaulted by the caller). */
  maxWidth: number
}

/**
 * Compute the new column width given a resize session and the current
 * pointer X. Clamps to `[minWidth, maxWidth]`. Pure function — no DOM,
 * no state.
 */
export function computeResizedWidth(session: ColumnResizeSession, currentClientX: number): number {
  const delta = currentClientX - session.startClientX
  const target = session.startWidth + delta
  return Math.max(session.minWidth, Math.min(session.maxWidth, target))
}

/**
 * Commit a fixed width for one column. A manual width commit converts a flex
 * column to fixed-size by writing `flex: null`, the explicit column-state
 * marker for "ignore the column definition's flex weight".
 */
export function commitColumnWidthState(
  state: readonly BcColumnStateEntry[],
  columnId: ColumnId,
  width: number,
): BcColumnStateEntry[] {
  const patch = { width, flex: null } satisfies Partial<BcColumnStateEntry>
  if (state.some((entry) => entry.columnId === columnId)) {
    return state.map((entry) => (entry.columnId === columnId ? { ...entry, ...patch } : entry))
  }
  return [...state, { columnId, ...patch }]
}
