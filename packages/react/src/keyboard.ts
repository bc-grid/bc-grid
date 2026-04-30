/**
 * Keyboard navigation matrix for `<BcGrid>`. Pure function from a key
 * event + grid extents to a next-cell action. Lives outside the React
 * component so the matrix is unit-testable without a DOM.
 *
 * Implements the WAI-ARIA grid pattern per `docs/design/accessibility-rfc.md
 * §Keyboard Model`. Q1 covers entry/exit + cell navigation plus Space to
 * toggle selection on the active row. Q2-reserved keys (F2, Enter, Escape,
 * printable chars except Space) return `"noop"` here so the caller can fall
 * through to the editor protocol when it lands. Q3-reserved keys
 * (Shift+Arrow, Ctrl+A, Shift+Space, Ctrl/Cmd+Space) return
 * `"preventDefault"` so the browser doesn't trigger text selection or page
 * scrolling inside the grid, without moving the active cell.
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
  | { type: "toggleSelection" }
  | {
      type: "rangeSelection"
      action:
        | { type: "extend"; direction: "up" | "down" | "left" | "right"; toEdge?: boolean }
        | { type: "select-all" }
        | { type: "select-row" }
        | { type: "select-column" }
        | { type: "clear" }
    }
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

  if (shiftKey && /^Arrow/.test(key)) {
    const direction = arrowDirection(key)
    if (!direction) return { type: "preventDefault" }
    return {
      type: "rangeSelection",
      action: { type: "extend", direction, ...(ctrlOrMeta ? { toEdge: true } : {}) },
    }
  }
  if (ctrlOrMeta && (key === "a" || key === "A")) {
    return { type: "rangeSelection", action: { type: "select-all" } }
  }
  if (key === " " || key === "Spacebar") {
    if (shiftKey) return { type: "rangeSelection", action: { type: "select-row" } }
    if (ctrlOrMeta) return { type: "rangeSelection", action: { type: "select-column" } }
    return { type: "toggleSelection" }
  }
  if (key === "Escape") return { type: "rangeSelection", action: { type: "clear" } }

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

function arrowDirection(key: string): "up" | "down" | "left" | "right" | null {
  if (key === "ArrowUp") return "up"
  if (key === "ArrowDown") return "down"
  if (key === "ArrowLeft") return "left"
  if (key === "ArrowRight") return "right"
  return null
}
