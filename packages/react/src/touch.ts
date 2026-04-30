/**
 * Coarse-pointer / touch fallback helpers per
 * `accessibility-rfc §Pointer and Touch Fallback`.
 *
 * Two pure primitives:
 *
 *   - `isDoubleTap(current, previous, maxIntervalMs?)` — caller-owned
 *     state for detecting two pointer-up events on the same cell within
 *     `DOUBLE_TAP_MAX_INTERVAL_MS` (300ms by default). Used by the grid
 *     to drive double-tap-to-edit on touch where the native `dblclick`
 *     event is unreliable.
 *
 *   - `createLongPressTracker({ onLongPress, delayMs?, moveTolerancePx? })`
 *     — pointer-event lifecycle helpers (`start` / `move` / `end`)
 *     that fire `onLongPress` after a configurable delay (500ms per
 *     accessibility-rfc) when the pointer stays roughly still. Cancels
 *     on move > `LONG_PRESS_MOVE_TOLERANCE_PX` or on `end`. Reusable
 *     primitive for `context-menu-impl` (Track 5) once that PR lands;
 *     this module ships the detector but the grid does not yet wire
 *     it to body cells — context menu integration is the integration
 *     point owned by that task.
 *
 * Both helpers are framework-agnostic so they're trivial to unit-test
 * without rendering a grid.
 */

/** 300ms — Apple HIG / Material Design "double-tap" window. */
export const DOUBLE_TAP_MAX_INTERVAL_MS = 300

/** 500ms — accessibility-rfc context-menu long-press threshold. */
export const LONG_PRESS_DEFAULT_MS = 500

/**
 * 8px — slack to allow finger micro-movement during a long press.
 * Larger movements treat the gesture as a drag/scroll and cancel.
 */
export const LONG_PRESS_MOVE_TOLERANCE_PX = 8

export interface TapTarget {
  /** Identifier of the row tapped — typically `RowId` cast to string. */
  rowId: string
  /** Identifier of the column tapped, when the gesture is cell-scoped. */
  columnId?: string
  /** Wall-clock timestamp (ms). Use `event.timeStamp` or `performance.now()`. */
  time: number
}

/**
 * True when `current` is the second tap of a double-tap on the same
 * row/column within `maxIntervalMs`. The caller stores `previous`
 * (typically a mutable ref) and replaces it with the latest tap.
 *
 * Pure — no DOM or pointer-event coupling so the predicate can be
 * exercised from a Vitest unit test without a browser.
 */
export function isDoubleTap(
  current: TapTarget,
  previous: TapTarget | null,
  maxIntervalMs: number = DOUBLE_TAP_MAX_INTERVAL_MS,
): boolean {
  if (previous === null) return false
  if (previous.rowId !== current.rowId) return false
  if ((previous.columnId ?? "") !== (current.columnId ?? "")) return false
  const interval = current.time - previous.time
  if (interval < 0) return false
  return interval < maxIntervalMs
}

export interface LongPressTrackerOptions {
  onLongPress: (event: PointerLikeEvent) => void
  delayMs?: number
  moveTolerancePx?: number
  /**
   * Optional override for `setTimeout` / `clearTimeout`. Tests inject
   * a manual scheduler to avoid waiting on real time.
   */
  scheduler?: TimerScheduler
}

export interface TimerScheduler {
  setTimeout(handler: () => void, ms: number): TimerHandle
  clearTimeout(handle: TimerHandle): void
}

export type TimerHandle = unknown

/**
 * Subset of the DOM `PointerEvent` shape the tracker depends on. Lets
 * tests construct plain objects without a browser, and lets callers
 * pass a synthetic React `PointerEvent` directly.
 */
export interface PointerLikeEvent {
  pointerType: string
  clientX: number
  clientY: number
}

export interface LongPressTracker {
  /** Begin tracking a potential long press. Call from `onPointerDown`. */
  start(event: PointerLikeEvent): void
  /** Update tracker on movement. Cancels if the pointer moves too far. */
  move(event: PointerLikeEvent): void
  /** Cancel the in-flight long press. Call from `onPointerUp` / `onPointerCancel`. */
  end(): void
}

/**
 * Build a long-press tracker. The tracker only arms when
 * `event.pointerType === "touch"` so mouse interactions never trigger
 * accidental long-press menus — mouse users get the right-click +
 * Shift+F10 paths from `chrome-rfc §Context menu`.
 */
export function createLongPressTracker(opts: LongPressTrackerOptions): LongPressTracker {
  const delayMs = opts.delayMs ?? LONG_PRESS_DEFAULT_MS
  const moveTolerancePx = opts.moveTolerancePx ?? LONG_PRESS_MOVE_TOLERANCE_PX
  const scheduler = opts.scheduler ?? defaultScheduler

  let timer: TimerHandle | null = null
  let origin: { x: number; y: number } | null = null

  const cancel = (): void => {
    if (timer !== null) {
      scheduler.clearTimeout(timer)
      timer = null
    }
    origin = null
  }

  return {
    start(event) {
      if (event.pointerType !== "touch") return
      cancel()
      origin = { x: event.clientX, y: event.clientY }
      timer = scheduler.setTimeout(() => {
        timer = null
        opts.onLongPress(event)
      }, delayMs)
    },
    move(event) {
      if (timer === null || origin === null) return
      const dx = event.clientX - origin.x
      const dy = event.clientY - origin.y
      if (dx * dx + dy * dy > moveTolerancePx * moveTolerancePx) cancel()
    },
    end() {
      cancel()
    },
  }
}

const defaultScheduler: TimerScheduler = {
  setTimeout(handler, ms) {
    return globalThis.setTimeout(handler, ms)
  },
  clearTimeout(handle) {
    if (handle !== null && handle !== undefined) {
      globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>)
    }
  },
}
