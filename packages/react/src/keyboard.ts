/**
 * Keyboard navigation matrix for `<BcGrid>`. Pure function from a key
 * event + grid extents to a next-cell action. Lives outside the React
 * component so the matrix is unit-testable without a DOM.
 *
 * Implements the WAI-ARIA grid pattern per `docs/design/accessibility-rfc.md
 * §Keyboard Model`. Q1 covers entry/exit + cell navigation. Q2-reserved
 * keys (F2, Enter, Escape, printable chars) return `"noop"` here so the
 * caller can fall through to the editor protocol when it lands. Q3-reserved
 * keys (Shift+Arrow, Ctrl+A) return `"preventDefault"` so the browser
 * doesn't trigger text selection inside the grid, without moving the
 * active cell.
 *
 * Plain `Space` toggles selection on the focused row (per
 * `accessibility-rfc §Selection Extension Points`; Space is unreserved).
 * `Shift+Space` and `Ctrl/Cmd+Space` stay Q3-reserved (range / select-all)
 * — they swallow the keystroke without acting.
 */

export interface KeyboardNavInput {
  key: string
  /** macOS uses Cmd as the "extremes" modifier; Windows/Linux use Ctrl.
   *  Caller should pass `event.ctrlKey || event.metaKey`. */
  ctrlOrMeta: boolean
  shiftKey: boolean
  currentRow: number
  currentCol: number
  /** Last valid row index. -1 if no rows. */
  lastRow: number
  /** Last valid column index. -1 if no columns. */
  lastCol: number
  /** Approx body rows per viewport, minus one for context overlap. */
  pageRowCount: number
}

export type KeyboardNavOutcome =
  | { type: "move"; row: number; col: number }
  | { type: "toggleSelection"; row: number }
  | { type: "preventDefault" }
  | { type: "noop" }

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min
  return Math.min(max, Math.max(min, value))
}

export function nextKeyboardNav(input: KeyboardNavInput): KeyboardNavOutcome {
  const { key, ctrlOrMeta, shiftKey, currentRow, currentCol, lastRow, lastCol, pageRowCount } =
    input

  if (lastRow < 0 || lastCol < 0) return { type: "noop" }

  // Q3-reserved: Shift+Arrow and Ctrl/Cmd+A. Swallow to suppress the
  // browser's text-selection default, but don't move the active cell.
  if (shiftKey && /^Arrow/.test(key)) return { type: "preventDefault" }
  if (ctrlOrMeta && (key === "a" || key === "A")) return { type: "preventDefault" }

  // Q3-reserved: Shift+Space (extend range), Ctrl/Cmd+Space (select all).
  // Swallow without acting — the Q3 range / select-all RFCs will pin
  // semantics. Plain Space falls through to the toggleSelection branch.
  if (key === " " && (shiftKey || ctrlOrMeta)) return { type: "preventDefault" }

  // Plain Space → toggle selection on the focused row.
  if (key === " ") return { type: "toggleSelection", row: currentRow }

  let row = currentRow
  let col = currentCol

  if (key === "ArrowUp") {
    row = ctrlOrMeta ? 0 : clamp(currentRow - 1, 0, lastRow)
  } else if (key === "ArrowDown") {
    row = ctrlOrMeta ? lastRow : clamp(currentRow + 1, 0, lastRow)
  } else if (key === "ArrowLeft") {
    col = ctrlOrMeta ? 0 : clamp(currentCol - 1, 0, lastCol)
  } else if (key === "ArrowRight") {
    col = ctrlOrMeta ? lastCol : clamp(currentCol + 1, 0, lastCol)
  } else if (key === "Home") {
    if (ctrlOrMeta) {
      row = 0
      col = 0
    } else {
      col = 0
    }
  } else if (key === "End") {
    if (ctrlOrMeta) {
      row = lastRow
      col = lastCol
    } else {
      col = lastCol
    }
  } else if (key === "PageUp") {
    row = clamp(currentRow - pageRowCount, 0, lastRow)
  } else if (key === "PageDown") {
    row = clamp(currentRow + pageRowCount, 0, lastRow)
  } else {
    // Q2-reserved (F2, Enter, Escape, printable) and unknown keys.
    return { type: "noop" }
  }

  if (row === currentRow && col === currentCol) {
    // Edge already — no movement, but the browser default for the arrow
    // key (window scroll) should still be suppressed. Caller treats this
    // as "preventDefault" so it doesn't no-op the event.
    return { type: "preventDefault" }
  }

  return { type: "move", row, col }
}
