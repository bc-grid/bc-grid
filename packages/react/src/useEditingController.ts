import type { BcCellPosition, BcValidationResult, ColumnId, RowId } from "@bc-grid/core"
import { useCallback, useReducer, useRef } from "react"
import {
  type ActivationSource,
  type EditEvent,
  type EditState,
  type MoveOnSettle,
  reduceEditState,
} from "./editingStateMachine"
import type { BcCellEditCommitEvent, BcCellEditor, BcReactGridColumn } from "./types"

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
  /** Client-side commit id used to ignore stale async settle paths. */
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

  // Monotonic token guarding the in-flight `editor.prepare()` Promise.
  // Bumped on cancel and on each new `start()`; the prepare resolver
  // only dispatches if it still matches the current token. Per
  // `editing-rfc §Lifecycle` open question on prepare-rejection.
  const prepareTokenRef = useRef(0)

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

  /**
   * Begin an edit. Dispatches `activate` (Navigation → Preparing), then
   * fires `editor.prepare()` if the editor declared one. On resolve,
   * dispatches `prepareResolved` (Preparing → Mounting). On reject,
   * dispatches `prepareRejected` and the machine returns to Navigation.
   * Editors without a `prepare` hook skip straight to Mounting.
   *
   * Per `editing-rfc §Lifecycle` (Preparing state).
   */
  const start = useCallback(
    (
      cell: BcCellPosition,
      activation: ActivationSource,
      opts?: {
        seedKey?: string
        pointerHint?: { x: number; y: number }
        editor?: BcCellEditor<TRow>
        row?: TRow
        rowId?: RowId
      },
    ) => {
      dispatch({
        type: "activate",
        cell,
        activation,
        ...(opts?.seedKey != null ? { seedKey: opts.seedKey } : {}),
        ...(opts?.pointerHint ? { pointerHint: opts.pointerHint } : {}),
      })

      const prepare = opts?.editor?.prepare
      const prepareRow = opts?.row
      const prepareRowId = opts?.rowId
      if (!prepare || prepareRow === undefined || prepareRowId === undefined) {
        // No prepare hook (or caller didn't pass row context) → advance
        // straight to Mounting.
        dispatch({ type: "prepareResolved" })
        return
      }
      // Optional prepare: race-safe via a token captured at fire time.
      // If the user cancels while prepare is in flight, the machine has
      // already returned to Navigation; we suppress the late dispatch.
      const token = ++prepareTokenRef.current
      Promise.resolve()
        .then(() => prepare({ row: prepareRow, rowId: prepareRowId, columnId: cell.columnId }))
        .then((prepareResult) => {
          if (token !== prepareTokenRef.current) return
          dispatch({ type: "prepareResolved", prepareResult })
        })
        .catch((err) => {
          if (token !== prepareTokenRef.current) return
          const message = err instanceof Error ? err.message : "Editor failed to prepare."
          dispatch({ type: "prepareRejected", error: message })
        })
    },
    [],
  )

  const cancel = useCallback(() => {
    validateAbortRef.current?.abort()
    validateAbortRef.current = null
    // Invalidate any in-flight prepare so its late resolution is dropped.
    prepareTokenRef.current++
    dispatch({ type: "cancel" })
    // Caller dispatches `unmounted` after the editor unmounts via
    // useLayoutEffect — see editorPortal.
  }, [])

  // Monotonic counter used to stamp every successful commit with a
  // unique `mutationId`. Per `editing-rfc §Concurrency`: re-editing a
  // cell whose previous commit is still in flight supersedes it; on
  // the older commit's settle we compare the entry's mutationId against
  // the captured one and bail if they no longer match (the user has
  // moved on to a newer value, so rolling back would clobber it).
  const mutationCounterRef = useRef(0)

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
        /**
         * How the commit was triggered. Threaded into
         * `BcCellEditCommitEvent.source` for consumer audit / analytics.
         * Defaults to `"keyboard"` since that's the most common path
         * (Enter / Tab / Shift+Enter / Shift+Tab in the editor).
         */
        source?: BcCellEditCommitEvent<TRow>["source"]
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
      if (validateAbortRef.current === ac) validateAbortRef.current = null
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
      // Stamp this commit with a monotonic mutationId so a later
      // settle can detect supersedure: a re-edit of the same cell
      // overwrites the entry; the older Promise's settle handler
      // compares its captured id against the current entry and bails
      // if they differ (the newer value is now authoritative).
      const mutationId = `m-${++mutationCounterRef.current}`
      // Edit entry: clear error, no longer pending unless onCellEditCommit
      // returns a Promise (set below).
      const rowEntries = editEntriesRef.current.get(candidate.rowId) ?? new Map()
      rowEntries.set(candidate.columnId, {
        pending: false,
        previousValue: candidate.previousValue,
        mutationId,
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
          source: candidate.source ?? "keyboard",
        })
        if (settle && typeof (settle as Promise<void>).then === "function") {
          // Mark pending until the Promise settles.
          const entry = editEntriesRef.current.get(candidate.rowId)?.get(candidate.columnId)
          if (entry) entry.pending = true
          forceRender()
          try {
            await settle
            const after = editEntriesRef.current.get(candidate.rowId)?.get(candidate.columnId)
            // Stale-settle guard: if a newer commit superseded this
            // one, the entry's mutationId no longer matches what we
            // started with. Don't touch the entry — the newer commit
            // owns its own pending lifecycle.
            if (after && after.mutationId === mutationId) {
              after.pending = false
              forceRender()
              announceCommitted()
            }
          } catch (err) {
            // Roll back the overlay on server-side rejection — but only
            // if this settle still represents the cell's current state.
            // A re-edit during the in-flight Promise stamps a new
            // mutationId; rolling back would clobber the user's newer
            // value, so we silently drop the rejection per
            // `editing-rfc §Concurrency` ("on reject of the old, ignore
            // the rollback because the new value is now authoritative").
            const rollbackEntry = editEntriesRef.current
              .get(candidate.rowId)
              ?.get(candidate.columnId)
            if (!rollbackEntry || rollbackEntry.mutationId !== mutationId) return
            const patches = overlayRef.current.patches.get(candidate.rowId)
            patches?.delete(candidate.columnId)
            const rollbackError = err instanceof Error ? err.message : "Server rejected the edit."
            rollbackEntry.pending = false
            rollbackEntry.error = rollbackError
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

  /**
   * Walk the overlay and clear entries whose patched value matches the
   * canonical row value returned by `getCanonicalValue`. Per
   * `editing-rfc §Row-model ownership`: "Patches are cleared from the
   * overlay when the consumer's `data` prop updates — the assumption
   * is that a `data` prop update means the consumer accepted the edit
   * upstream and the new `data` reflects it."
   *
   * Pending entries (in-flight server commits) and entries with an
   * unresolved error are preserved — the overlay is still authoritative
   * in those cases. Only "settled to canonical" entries are dropped.
   *
   * Idempotent and safe to call on every `data` prop update.
   */
  const pruneOverlay = useCallback(
    (getCanonicalValue: (rowId: RowId, columnId: ColumnId) => unknown) => {
      const result = pruneOverlayPatches(
        overlayRef.current.patches,
        editEntriesRef.current,
        getCanonicalValue,
      )
      if (result.changed) forceRender()
    },
    [],
  )

  /**
   * Aggregate pending / error state for a single row across all its
   * edited cells. Returns `{ pending, error? }` or `null` when the row
   * has no edit entries. Used by `<BcEditGrid>` to disable destructive
   * action buttons while a row has any in-flight commit. Per
   * `editing-rfc §Server commit + optimistic UI`.
   */
  const getRowEditState = useCallback(
    (rowId: RowId): { pending: boolean; error?: string } | null => {
      return summariseRowEditState(editEntriesRef.current.get(rowId))
    },
    [],
  )

  return {
    editState,
    getOverlayValue,
    hasOverlayValue,
    getCellEditEntry,
    getRowEditState,
    pruneOverlay,
    start,
    commit,
    cancel,
    dispatchMounted,
    dispatchUnmounted,
  }
}

// ---------------------------------------------------------------------------
// Pure helpers — extracted so concurrency / cleanup semantics are
// unit-testable without mounting React.
// ---------------------------------------------------------------------------

/**
 * Remove overlay entries whose patched value equals the canonical row
 * value. Pending and error entries are preserved (the overlay is still
 * the source of truth there). Mutates the maps in place; returns
 * `{ changed }` so the caller knows whether to bump the render counter.
 */
export function pruneOverlayPatches(
  patches: Map<RowId, Map<ColumnId, unknown>>,
  entries: Map<RowId, Map<ColumnId, BcCellEditEntry>>,
  getCanonicalValue: (rowId: RowId, columnId: ColumnId) => unknown,
): { changed: boolean; cleared: number } {
  let changed = false
  let cleared = 0
  for (const [rowId, rowPatches] of patches) {
    const rowEntries = entries.get(rowId)
    for (const [columnId, overlayValue] of rowPatches) {
      const entry = rowEntries?.get(columnId)
      // Preserve in-flight or error entries — overlay is still load-bearing.
      if (entry?.pending || entry?.error) continue
      const canonical = getCanonicalValue(rowId, columnId)
      if (canonical === overlayValue) {
        rowPatches.delete(columnId)
        rowEntries?.delete(columnId)
        cleared++
        changed = true
      }
    }
    if (rowPatches.size === 0) patches.delete(rowId)
    if (rowEntries && rowEntries.size === 0) entries.delete(rowId)
  }
  return { changed, cleared }
}

/**
 * Reduce a row's per-column edit entries into a single
 * `{ pending, error? }` summary for the action column. Returns `null`
 * when the row has no edits.
 *
 *   - `pending` is true if any cell in the row has `pending: true`.
 *   - `error` is the first non-empty error encountered; if multiple
 *     cells have errors, the first wins (cells are iterated in
 *     insertion order, which matches commit order).
 */
export function summariseRowEditState(
  rowEntries: Map<ColumnId, BcCellEditEntry> | undefined,
): { pending: boolean; error?: string } | null {
  if (!rowEntries || rowEntries.size === 0) return null
  let pending = false
  let error: string | undefined
  for (const entry of rowEntries.values()) {
    if (entry.pending) pending = true
    if (!error && entry.error) error = entry.error
  }
  return error ? { pending, error } : { pending }
}

export type EditingController<TRow> = ReturnType<typeof useEditingController<TRow>>
