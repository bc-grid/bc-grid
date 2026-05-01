/**
 * Touch / coarse-pointer fallback primitives per
 * `docs/design/accessibility-rfc.md §Pointer and Touch Fallback`.
 *
 * Every helper here is a pure timing/state-machine function so the
 * timing rules can be unit-tested without a DOM. The DOM event listeners
 * live in `contextMenuEvents.ts` and the cell pointer-down handler.
 */

/** Minimum touch hit-target size in CSS pixels. WCAG 2.5.5 / Apple HIG. */
export const COARSE_POINTER_HIT_TARGET_PX = 44

/**
 * Threshold beyond which a long-press gesture is cancelled because the
 * user has started panning. Matches typical OS-level "tap slop" (Material
 * Design uses 8dp ≈ 12px; iOS uses ~10pt). 10px is conservative without
 * being so tight that small finger tremor cancels the gesture.
 */
export const LONG_PRESS_MOVE_THRESHOLD_PX = 10

/**
 * Default long-press threshold. Aligns with `accessibility-rfc §Pointer
 * and Touch Fallback` ("Long press opens the context menu... Default
 * threshold: 500ms.") and matches the existing context-menu behaviour
 * shipped in PR #157.
 */
export const LONG_PRESS_DEFAULT_THRESHOLD_MS = 500

/** Maximum gap between two taps for them to count as a double-tap. */
export const DOUBLE_TAP_DEFAULT_THRESHOLD_MS = 300

/**
 * Maximum drift between two taps for them to count as a double-tap.
 * Slightly larger than the long-press tolerance because users typically
 * double-tap with less precision than a sustained press.
 */
export const DOUBLE_TAP_MOVE_THRESHOLD_PX = 16

export interface DoubleTapState {
  timeMs: number
  x: number
  y: number
}

export interface DoubleTapOptions {
  thresholdMs?: number
  movePxThreshold?: number
}

/**
 * Decide whether the supplied tap completes a double-tap given the
 * previous tap's record (`prev`, or `null` for the first tap).
 *
 * Pure function over wall-clock time (`timeMs` from `performance.now()`)
 * and pointer coordinates. Use for touch-only double-tap detection
 * where the browser-fired `dblclick` is unreliable (notably iOS Safari
 * on non-button targets).
 */
export function isDoubleTap(
  prev: DoubleTapState | null,
  next: DoubleTapState,
  opts: DoubleTapOptions = {},
): boolean {
  if (!prev) return false
  const thresholdMs = opts.thresholdMs ?? DOUBLE_TAP_DEFAULT_THRESHOLD_MS
  const movePx = opts.movePxThreshold ?? DOUBLE_TAP_MOVE_THRESHOLD_PX
  const dt = next.timeMs - prev.timeMs
  if (dt < 0 || dt > thresholdMs) return false
  const dx = Math.abs(next.x - prev.x)
  const dy = Math.abs(next.y - prev.y)
  return dx <= movePx && dy <= movePx
}

export interface LongPressState {
  startX: number
  startY: number
}

export interface LongPressMoveOptions {
  movePxThreshold?: number
}

/**
 * Decide whether a pointermove from the long-press start point has
 * crossed the cancellation threshold. When true, the caller should
 * cancel the pending long-press timer.
 *
 * Pure function — no DOM, no state — so the cancellation rule can be
 * unit-tested without instrumenting real pointer events.
 */
export function shouldCancelLongPressOnMove(
  state: LongPressState,
  next: { x: number; y: number },
  opts: LongPressMoveOptions = {},
): boolean {
  const movePx = opts.movePxThreshold ?? LONG_PRESS_MOVE_THRESHOLD_PX
  const dx = Math.abs(next.x - state.startX)
  const dy = Math.abs(next.y - state.startY)
  return dx > movePx || dy > movePx
}

/**
 * `pointerType` strings that should be treated as "coarse" / touch.
 * Mouse is excluded; pen behaves enough like touch for the purposes
 * of long-press / double-tap fallback that we treat it the same way.
 */
export function isCoarsePointerType(pointerType: string): boolean {
  return pointerType === "touch" || pointerType === "pen"
}
