import type { BcColumnStateEntry, ColumnId } from "@bc-grid/core"

export interface AutosizeBounds {
  minWidth: number
  maxWidth: number
}

/**
 * Walk a column-state array and update (or append) a single entry's
 * properties. Pure — used by the imperative API methods that target a
 * single column (`setColumnPinned`, `setColumnHidden`, `autoSizeColumn`)
 * to avoid replacing the entire array.
 */
export function upsertColumnStateEntry(
  state: readonly BcColumnStateEntry[],
  columnId: ColumnId,
  patch: Partial<BcColumnStateEntry>,
): BcColumnStateEntry[] {
  if (state.some((entry) => entry.columnId === columnId)) {
    return state.map((entry) => (entry.columnId === columnId ? { ...entry, ...patch } : entry))
  }
  return [...state, { columnId, ...patch }]
}

/**
 * Take the maximum of the supplied measurements and clamp to
 * `[minWidth, maxWidth]`. Returns `null` when there are no measurements
 * — caller should treat that as a no-op (e.g., the grid hasn't rendered
 * yet, or the column has no DOM cells in the visible window).
 */
export function computeAutosizeWidth(
  measurements: readonly number[],
  bounds: AutosizeBounds,
): number | null {
  if (measurements.length === 0) return null
  let widest = 0
  for (const measurement of measurements) {
    if (measurement > widest) widest = measurement
  }
  if (widest <= 0) return null
  return Math.max(bounds.minWidth, Math.min(bounds.maxWidth, Math.ceil(widest)))
}

/**
 * Escape a column id for use inside a CSS attribute selector.
 * `CSS.escape` is in every modern browser; the fallback is for SSR /
 * jsdom contexts where the global may be absent.
 */
export function escapeColumnIdForSelector(columnId: ColumnId): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(columnId)
  }
  return columnId.replace(/(["\\])/g, "\\$1")
}

/**
 * Measure the natural content width of every DOM element with the
 * matching `data-column-id` inside `root`. Reports `scrollWidth` for
 * each element, which reflects intrinsic content width even when the
 * element uses `overflow: hidden` + `text-overflow: ellipsis`.
 *
 * Off-screen rows are not in the DOM (the virtualiser only mounts
 * visible rows), so the measurement is necessarily a snapshot of the
 * current viewport. The header cell is included via the same
 * `data-column-id` attribute.
 */
export function measureColumnWidths(root: HTMLElement, columnId: ColumnId): number[] {
  const selector = `[data-column-id="${escapeColumnIdForSelector(columnId)}"]`
  const cells = root.querySelectorAll<HTMLElement>(selector)
  const measurements: number[] = []
  for (const cell of cells) {
    if (cell.scrollWidth > 0) measurements.push(cell.scrollWidth)
  }
  return measurements
}
