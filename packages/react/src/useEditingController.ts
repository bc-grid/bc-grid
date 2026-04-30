import type { BcCellPosition, BcValidationResult, ColumnId, RowId } from "@bc-grid/core"
import { useCallback, useReducer, useRef } from "react"
import {
  type ActivationSource,
  type EditEvent,
  type EditState,
  type MoveOnSettle,
  reduceEditState,
} from "./editingStateMachine"
import type { BcCellEditCommitEvent, BcReactGridColumn } from "./types"

/**
 * Per-cell edit metadata. Held in a nested map (RowId → ColumnId → entry)
 * to avoid the collision risk of flat string keys per `editing-rfc
 * §Dirty Tracking`.
 */
export interface BcCellEditEntry {
  /** True between commit and `onCellEditCommit` Promise resolution. */
  pending: boolean
  /** Async commit / server reject. Cleared on successful retry / cancel. */
  error?: string
  /** Original value before this edit cycle; used for rollback on server reject. */
  previousValue?: unknown
  /** Server-side mutation id once the consumer assigns one. */
  mutationId?: string
}

export type BcEditState = Map<RowId, Map<ColumnId, BcCellEditEntry>>

/**
 * Per-row patch overlay (`editing-rfc §Row-model ownership`). Cell renderers
 * read patched values transparently; consumers see commits via
 * `onCellEditCommit` and can mirror into their own state.
 */
export interface BcEditOverlay {
  patches: Map<RowId, Map<ColumnId, unknown>>
}

export interface UseEditingControllerOptions<TRow> {
  /**
   * Sync or async per-cell validator. Receives the candidate value, the
   * row, and an optional `AbortSignal` for async-cancel. Returning a
   * `BcValidationResult` (or Promise thereof) drives the state machine.
   */
  validate?: (
    value: unknown,
    row: TRow,
    columnId: ColumnId,
    signal?: AbortSignal,
  ) => BcValidationResult | Promise<BcValidationResult>

  /**
   * Consumer commit hook. Invoked after the overlay update lands. May
   * return a Promise — the cell stays `pending: true` until it settles.
   * Promise rejection rolls back the overlay and surfaces the error.
   */
  onCellEditCommit?: (event: BcCellEditCommitEvent<TRow>) => void | Promise<void>

  /**
   * Cell-edit live-region announcer per `editing-rfc §Live Regions`.
   * Called by the controller at three points:
   *   - committed: after the overlay update lands (or after an async
   *     consumer hook resolves successfully).
   *   - validationError: after `validate` returned `{ valid: false }`.
   *   - serverError: after the consumer's `onCellEditCommit` Promise
   *     rejected and the overlay rolled back.
   *
   * The grid wires this to its polite + assertive live regions; consumers
   * supplying a controller standalone can route to their own AT layer.
   */
  announce?: (
    event:
      | {
          kind: "committed"
          column: BcReactGridColumn<TRow, unknown>
          row: TRow
          rowId: RowId
          nextValue: unknown
        }
      | {
          kind: "validationError"
          column: BcReactGridColumn<TRow, unknown>
          error: string
        }
      | {
          kind: "serverError"
          column: BcReactGridColumn<TRow, unknown>
          error: string
        },
  ) => void
}

/**
 * Editing controller. Owns the lifecycle state machine, per-cell edit
 * entries, and the row-overlay patch map. Exposes a small imperative API
 * for grid.tsx to call from activation handlers and the editor portal
 * to call from commit/cancel.
 */
export function useEditingController<TRow>(options: UseEditingControllerOptions<TRow> = {}) {
  const [editState, dispatch] = useReducer(
    reduceEditState as (state: EditState<unknown>, event: EditEvent<unknown>) => EditState<unknown>,
    { mode: "navigation" } satisfies EditState<unknown>,
  )

  // Mutable refs hold per-cell entries + overlay patches. Mutating them
  // directly avoids the cost of cloning a nested Map on every keystroke;
  // the hook bumps a render counter when it needs the JSX to re-read.
  const editEntriesRef = useRef<BcEditState>(new Map())
  const overlayRef = useRef<BcEditOverlay>({ patches: new Map() })
  const [, forceRender] = useReducer((x: number) => x + 1, 0)

  // AbortController for the in-flight async validator. Nulled out at
  // each new commit / cancel.
  const validateAbortRef = useRef<AbortController | null>(null)

  // ------- Read API for cell renderers + grid JSX --------------------------

  const getOverlayValue = useCallback((rowId: RowId, columnId: ColumnId): unknown => {
    const rowPatch = overlayRef.current.patches.get(rowId)
    return rowPatch?.get(columnId)
  }, [])

  const hasOverlayValue = useCallback((rowId: RowId, columnId: ColumnId): boolean => {
    return overlayRef.current.patches.get(rowId)?.has(columnId) ?? false
  }, [])

  const getCellEditEntry = useCallback(
    (rowId: RowId, columnId: ColumnId): BcCellEditEntry | undefined => {
      return editEntriesRef.current.get(rowId)?.get(columnId)
    },
    [],
  )

  // ------- Imperative API for activation / commit / cancel -----------------

  const start = useCallback(
    (
      cell: BcCellPosition,
      activation: ActivationSource,
      opts?: { seedKey?: string; pointerHint?: { x: number; y: number } },
    ) => {
      dispatch({
        type: "activate",
        cell,
        activation,
        ...(opts?.seedKey != null ? { seedKey: opts.seedKey } : {}),
        ...(opts?.pointerHint ? { pointerHint: opts.pointerHint } : {}),
      })
      // No prepare hook is wired in v0.1 — the controller advances
      // straight to Mounting on the next dispatch.
      dispatch({ type: "prepareResolved" })
      // The editor portal dispatches `mounted` once the component's
      // useLayoutEffect runs and focusRef is filled.
    },
    [],
  )

  const cancel = useCallback(() => {
    validateAbortRef.current?.abort()
    validateAbortRef.current = null
    dispatch({ type: "cancel" })
    // Caller dispatches `unmounted` after the editor unmounts via
    // useLayoutEffect — see editorPortal.
  }, [])

  /**
   * Commit a candidate value. Runs `validate` (sync or async). On valid,
   * applies overlay patch + invokes `onCellEditCommit` (which may return
   * a Promise — the cell stays `pending: true` until it settles, with
   * rollback on rejection). On invalid, rejects the commit and re-enters
   * Editing with the error surfaced on the editor.
   */
  const commit = useCallback(
    async (
      candidate: {
        rowId: RowId
        row: TRow
        columnId: ColumnId
        column: BcReactGridColumn<TRow, unknown>
        value: unknown
        previousValue: unknown
      },
      moveOnSettle: MoveOnSettle,
    ): Promise<void> => {
      // Cancel any in-flight async validation from a superseded commit.
      validateAbortRef.current?.abort()
      const ac = new AbortController()
      validateAbortRef.current = ac

      // valueParser bridges string editors → typed `TValue` per
      // `editing-rfc §valueParser placement`. Runs BEFORE validation so
      // the validator sees the parsed (typed) value, not the raw string.
      // Only fires when the editor produced a string AND the column
      // declares a parser. Typed editors (date, select, etc.) bypass.
      const parser = candidate.column.valueParser
      const parsedValue =
        typeof candidate.value === "string" && parser
          ? (parser(candidate.value, candidate.row) as unknown)
          : candidate.value

      dispatch({ type: "commit", value: parsedValue, moveOnSettle })

      const validator = options.validate
      let result: BcValidationResult
      try {
        result = validator
          ? await Promise.resolve(
              validator(parsedValue, candidate.row, candidate.columnId, ac.signal),
            )
          : { valid: true }
      } catch (err) {
        if (ac.signal.aborted) return // superseded; downstream dispatch handles it
        const message = err instanceof Error ? err.message : "Validation failed."
        result = { valid: false, error: message }
      }
      if (ac.signal.aborted) return
      validateAbortRef.current = null
      dispatch({ type: "validateResolved", result })

      if (!result.valid) {
        options.announce?.({
          kind: "validationError",
          column: candidate.column,
          error: result.error,
        })
        return
      }

      // Optimistic overlay update — stored as the parsed value.
      const rowPatch = overlayRef.current.patches.get(candidate.rowId) ?? new Map()
      rowPatch.set(candidate.columnId, parsedValue)
      overlayRef.current.patches.set(candidate.rowId, rowPatch)
      // Edit entry: clear error, no longer pending unless onCellEditCommit
      // returns a Promise (set below).
      const rowEntries = editEntriesRef.current.get(candidate.rowId) ?? new Map()
      rowEntries.set(candidate.columnId, {
        pending: false,
        previousValue: candidate.previousValue,
      })
      editEntriesRef.current.set(candidate.rowId, rowEntries)
      forceRender()

      const announceCommitted = () =>
        options.announce?.({
          kind: "committed",
          column: candidate.column,
          row: candidate.row,
          rowId: candidate.rowId,
          nextValue: parsedValue,
        })

      const consumerHook = options.onCellEditCommit
      if (consumerHook) {
        const settle = consumerHook({
          rowId: candidate.rowId,
          row: candidate.row,
          columnId: candidate.columnId,
          column: candidate.column,
          previousValue: candidate.previousValue as never,
          nextValue: parsedValue as never,
          source: "keyboard",
        })
        if (settle && typeof (settle as Promise<void>).then === "function") {
          // Mark pending until the Promise settles.
          const entry = editEntriesRef.current.get(candidate.rowId)?.get(candidate.columnId)
          if (entry) entry.pending = true
          forceRender()
          try {
            await settle
            const after = editEntriesRef.current.get(candidate.rowId)?.get(candidate.columnId)
            if (after) after.pending = false
            forceRender()
            announceCommitted()
          } catch (err) {
            // Roll back the overlay on server-side rejection.
            const patches = overlayRef.current.patches.get(candidate.rowId)
            patches?.delete(candidate.columnId)
            const rollbackEntry = editEntriesRef.current
              .get(candidate.rowId)
              ?.get(candidate.columnId)
            const rollbackError = err instanceof Error ? err.message : "Server rejected the edit."
            if (rollbackEntry) {
              rollbackEntry.pending = false
              rollbackEntry.error = rollbackError
            }
            forceRender()
            options.announce?.({
              kind: "serverError",
              column: candidate.column,
              error: rollbackError,
            })
          }
        } else {
          // Sync consumer hook — announce immediately.
          announceCommitted()
        }
      } else {
        // No consumer hook — overlay update is the final state. Announce.
        announceCommitted()
      }
    },
    [options.validate, options.onCellEditCommit, options.announce],
  )

  // ------- Lifecycle dispatch shortcuts (called from editor portal) --------

  const dispatchMounted = useCallback(() => dispatch({ type: "mounted" }), [])
  const dispatchUnmounted = useCallback(() => dispatch({ type: "unmounted" }), [])

  return {
    editState,
    getOverlayValue,
    hasOverlayValue,
    getCellEditEntry,
    start,
    commit,
    cancel,
    dispatchMounted,
    dispatchUnmounted,
  }
}

export type EditingController<TRow> = ReturnType<typeof useEditingController<TRow>>
