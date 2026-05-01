import type { BcColumnStateEntry, BcGridApi, ColumnId } from "@bc-grid/core"

/**
 * Single-column context-menu command IDs that route to a `BcGridApi`
 * column-state mutation. Bulk variants (`show-all-columns`,
 * `autosize-all-columns`) live alongside in `BcContextMenuBuiltinItem`
 * but go through their own dispatch path because they read whole-grid
 * state before writing.
 */
export type ColumnCommandId =
  | "pin-column-left"
  | "pin-column-right"
  | "unpin-column"
  | "hide-column"
  | "autosize-column"

/**
 * Route a column-context built-in to the matching `BcGridApi` method.
 * Pure dispatch — given a command and a target column id, calls the
 * single side-effecting api method. Lives outside the renderer so the
 * mapping can be unit-tested with a mock api stub (the renderer
 * itself is exercised via Playwright + the SSR markup contract; the
 * activate switch needs a regression net the unit suite can run).
 *
 * Bulk variants (`show-all-columns`, `autosize-all-columns`) are NOT
 * handled here — they need to read `api.getColumnState()` first to
 * decide what to write, and the BcGridContextMenu renderer keeps that
 * logic inline so the read-modify-write happens against the most
 * recent column state every activation.
 */
export function dispatchColumnCommand<TRow>(
  api: BcGridApi<TRow>,
  command: ColumnCommandId,
  columnId: ColumnId,
): void {
  switch (command) {
    case "pin-column-left":
      api.setColumnPinned(columnId, "left")
      return
    case "pin-column-right":
      api.setColumnPinned(columnId, "right")
      return
    case "unpin-column":
      api.setColumnPinned(columnId, null)
      return
    case "hide-column":
      api.setColumnHidden(columnId, true)
      return
    case "autosize-column":
      api.autoSizeColumn(columnId)
      return
  }
}

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
