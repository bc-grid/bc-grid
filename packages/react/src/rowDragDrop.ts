import type { RowId } from "@bc-grid/core"
import type { BcSelection } from "@bc-grid/core"
import { isRowSelected } from "./selection"

/**
 * Where the dropped rows land relative to the hovered row.
 *   - "before" — insert above the hovered row
 *   - "after"  — insert below the hovered row
 *   - "into"   — drop onto the hovered row (treat it as a container —
 *                folder, parent task, status bucket)
 *   - "none"   — the consumer rejected the drop (or the hovered row
 *                is itself a source row and shouldn't accept)
 *
 * The grid surfaces the live position via `data-bc-grid-row-drop`
 * on the hovered row so consumers can paint visual indicators in
 * their own theme — top/bottom border line for `"before"` / `"after"`,
 * row highlight for `"into"`. v0.6 §1 row-drag-drop-hooks.
 */
export type BcRowDropAction = "before" | "after" | "into" | "none"

/**
 * MIME type the grid uses on `dataTransfer` to mark its own row drag.
 * Consumers wiring cross-grid DnD or external drop targets read it via
 * `event.dataTransfer.getData(BC_GRID_ROW_DRAG_MIME)` — the payload is
 * a JSON-serialised `readonly RowId[]` (parsed by `parseRowDragPayload`).
 *
 * Per `docs/recipes/row-drag-drop.md`. The "x-" prefix marks it as a
 * non-standard MIME so browsers don't try to interpret it.
 */
export const BC_GRID_ROW_DRAG_MIME = "application/x-bc-grid-rows"

/**
 * Geometry helper — given a pointer Y inside a row's bounding box,
 * decide whether the user is targeting the top edge ("before"), the
 * middle ("into"), or the bottom edge ("after"). Pure so the math is
 * unit-testable without a DOM.
 *
 * The thirds split (top 33% / middle 34% / bottom 33%) matches macOS
 * Finder, VS Code's file explorer, and Notion — common DnD UX that
 * users already have muscle memory for. "into" needs a generous middle
 * band because the user typically aims at the row body when they want
 * a drop-on-row gesture.
 */
export function computeRowDropPosition(clientY: number, rowRect: DropRowRect): BcRowDropAction {
  const height = rowRect.bottom - rowRect.top
  if (height <= 0) return "none"
  const offset = clientY - rowRect.top
  // Clamp to row bounds — fast pointer movements can fire dragOver
  // with a Y just past the edge before the next row's listener takes
  // over. Treat overflow as the nearest edge.
  if (offset <= 0) return "before"
  if (offset >= height) return "after"
  const ratio = offset / height
  if (ratio < 1 / 3) return "before"
  if (ratio > 2 / 3) return "after"
  return "into"
}

/**
 * Bounding-box subset accepted by `computeRowDropPosition`. Mirrors
 * `DOMRect`'s shape but kept minimal so unit tests don't need a JSDOM
 * polyfill — pass a plain `{ top, bottom }` object.
 */
export interface DropRowRect {
  top: number
  bottom: number
}

/**
 * Edge-zone auto-scroll math. When the pointer is within `edgeZone`
 * pixels of the viewport's top or bottom edge during a drag, return
 * a non-zero scroll delta the caller applies to `viewport.scrollTop`.
 * Returns `0` when the pointer is outside both edge zones.
 *
 * The caller usually runs this on every `dragOver` and applies the
 * delta inside a rAF — that gives smooth continuous scrolling without
 * needing a setInterval. Pure so the math is testable. v0.6 §1.
 *
 * Default `edgeZone: 48` matches the row-height range of a comfortable
 * grid (44px) — the user feels the auto-scroll engage right as the
 * pointer reaches the edge row, not earlier.
 *
 * `maxSpeed` controls how aggressive the scroll is when the pointer is
 * RIGHT at the edge. Linear ramp from 0 (just inside the zone) to
 * `maxSpeed` (at the very edge).
 */
export function computeEdgeScrollDelta(params: EdgeScrollParams): number {
  const { clientY, viewportRect, edgeZone = 48, maxSpeed = 12 } = params
  const distanceFromTop = clientY - viewportRect.top
  const distanceFromBottom = viewportRect.bottom - clientY

  if (distanceFromTop < edgeZone && distanceFromTop >= 0) {
    const intensity = 1 - distanceFromTop / edgeZone
    return -Math.ceil(intensity * maxSpeed)
  }
  if (distanceFromBottom < edgeZone && distanceFromBottom >= 0) {
    const intensity = 1 - distanceFromBottom / edgeZone
    return Math.ceil(intensity * maxSpeed)
  }
  return 0
}

export interface EdgeScrollParams {
  clientY: number
  viewportRect: DropRowRect
  /** Distance from edge to start scrolling. Default 48px. */
  edgeZone?: number
  /** Pixels per dragOver tick at the very edge. Default 12. */
  maxSpeed?: number
}

/**
 * Resolve the source rowIds for a drag that started on `originRowId`.
 * If the origin row is part of the current selection, drag the whole
 * selected set together (multi-row drag); otherwise drag just the
 * origin row. Mirrors macOS Finder / VS Code DnD UX where drag-from-
 * inside-selection drags the selection.
 *
 * Returns rowIds in the supplied `visibleRowIds` order so the consumer
 * sees the same drop order as the user's visual ordering. v0.6 §1.
 */
export function resolveDragSourceRowIds(params: {
  originRowId: RowId
  selection: BcSelection
  visibleRowIds: readonly RowId[]
}): readonly RowId[] {
  const { originRowId, selection, visibleRowIds } = params
  if (!isRowSelected(selection, originRowId)) return [originRowId]

  const selectedInOrder: RowId[] = []
  for (const rowId of visibleRowIds) {
    if (isRowSelected(selection, rowId)) selectedInOrder.push(rowId)
  }
  // Defensive: if the selection mode is "all" / "filtered" and
  // `visibleRowIds` happens to be empty (mid-virtualizer transition),
  // fall through to single-row drag rather than dragging an empty list.
  return selectedInOrder.length > 0 ? selectedInOrder : [originRowId]
}

/**
 * Serialise a rowIds list onto `dataTransfer`. Used by the grid's
 * `onDragStart` handler. The payload is `JSON.stringify(rowIds)` so a
 * cross-grid drop target can `JSON.parse` it back. Pure so consumer
 * tests don't need a DataTransfer instance.
 */
export function serializeRowDragPayload(rowIds: readonly RowId[]): string {
  return JSON.stringify(rowIds)
}

/**
 * Parse the payload back into a rowIds list. Returns `null` on any
 * malformed input — callers should treat null as "this drag did not
 * originate from a bc-grid" and fall through to their own DnD logic.
 *
 * Defensive against:
 *   - non-JSON strings (e.g. plain text drops)
 *   - JSON that isn't an array
 *   - arrays containing non-string entries (a previous version may
 *     have serialised differently)
 */
export function parseRowDragPayload(serialized: string): readonly RowId[] | null {
  if (!serialized) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(serialized)
  } catch {
    return null
  }
  if (!Array.isArray(parsed)) return null
  for (const entry of parsed) {
    if (typeof entry !== "string") return null
  }
  return parsed as readonly RowId[]
}
