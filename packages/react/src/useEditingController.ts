import type { BcCellPosition, BcValidationResult, ColumnId, RowId } from "@bc-grid/core"
import { useCallback, useEffect, useReducer, useRef } from "react"
import {
  type ActivationSource,
  type EditEvent,
  type EditState,
  type MoveOnSettle,
  reduceEditState,
} from "./editingStateMachine"
import type { RangeTsvPasteApplyPlan } from "./rangeClipboard"
import type {
  BcCellEditCommitEvent,
  BcCellEditCommitHandler,
  BcCellEditCommitResult,
  BcCellEditor,
  BcLatestValidationError,
  BcReactGridColumn,
} from "./types"
import { getCellValue } from "./value"

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
   *
   * Optionally resolves with `BcCellEditCommitResult<TRow>` — `{ status:
   * "rejected", reason }` rolls back the overlay (mirroring a thrown
   * exception) and `{ status: "accepted", row? }` keeps the overlay,
   * optionally replacing the cell's overlay value with the value
   * extracted from the server-confirmed `row`.
   */
  onCellEditCommit?: BcCellEditCommitHandler<TRow>

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

  // Mirror of `editState` for callbacks that need the latest value
  // without a deps-array rebuild on every state transition. Callbacks
  // that DO want to re-bind on state change keep using `editState`
  // directly via their captured closure.
  const editStateRef = useRef<EditState<unknown>>(editState)
  editStateRef.current = editState

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

  // Latest validation rejection — drives the built-in `"latestError"`
  // status-bar segment + the cell flash. Two independent timers because
  // the two surfaces have different decay windows: the cell flash is a
  // 600 ms animation pulse; the status-bar entry lingers for 8 s so the
  // user can read it after they move on. Audit P1-W3-4. The risk-note
  // from the v0.6 §1 planning doc — flash auto-clearing must not fight
  // a re-edit on the same cell — is honoured by the
  // `clearValidationErrorIfFor(rowId, columnId)` helper, called from
  // every successful commit / clearCell path so a clean re-commit
  // immediately retires both timers.
  const VALIDATION_FLASH_DURATION_MS = 600
  const VALIDATION_STATUS_TIMEOUT_MS = 8000
  const latestValidationErrorRef = useRef<BcLatestValidationError | null>(null)
  const validationStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const validationFlashCellRef = useRef<{ rowId: RowId; columnId: ColumnId } | null>(null)
  const validationFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const setLatestValidationError = useCallback((entry: BcLatestValidationError) => {
    latestValidationErrorRef.current = entry
    if (validationStatusTimerRef.current) clearTimeout(validationStatusTimerRef.current)
    validationStatusTimerRef.current = setTimeout(() => {
      latestValidationErrorRef.current = null
      validationStatusTimerRef.current = null
      forceRender()
    }, VALIDATION_STATUS_TIMEOUT_MS)
    validationFlashCellRef.current = { rowId: entry.rowId, columnId: entry.columnId }
    if (validationFlashTimerRef.current) clearTimeout(validationFlashTimerRef.current)
    validationFlashTimerRef.current = setTimeout(() => {
      validationFlashCellRef.current = null
      validationFlashTimerRef.current = null
      forceRender()
    }, VALIDATION_FLASH_DURATION_MS)
    forceRender()
  }, [])

  const clearValidationErrorIfFor = useCallback((rowId: RowId, columnId: ColumnId) => {
    const latest = latestValidationErrorRef.current
    let changed = false
    if (latest && latest.rowId === rowId && latest.columnId === columnId) {
      if (validationStatusTimerRef.current) clearTimeout(validationStatusTimerRef.current)
      latestValidationErrorRef.current = null
      validationStatusTimerRef.current = null
      changed = true
    }
    const flash = validationFlashCellRef.current
    if (flash && flash.rowId === rowId && flash.columnId === columnId) {
      if (validationFlashTimerRef.current) clearTimeout(validationFlashTimerRef.current)
      validationFlashCellRef.current = null
      validationFlashTimerRef.current = null
      changed = true
    }
    if (changed) forceRender()
  }, [])

  // Cleanup outstanding timers on unmount so an unmounted grid doesn't
  // schedule a forceRender after teardown.
  useEffect(() => {
    return () => {
      if (validationStatusTimerRef.current) clearTimeout(validationStatusTimerRef.current)
      if (validationFlashTimerRef.current) clearTimeout(validationFlashTimerRef.current)
    }
  }, [])

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

  const getLatestValidationError = useCallback(
    (): BcLatestValidationError | null => latestValidationErrorRef.current,
    [],
  )

  const isCellFlashing = useCallback((rowId: RowId, columnId: ColumnId): boolean => {
    const flash = validationFlashCellRef.current
    return flash !== null && flash.rowId === rowId && flash.columnId === columnId
  }, [])

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
        column?: BcReactGridColumn<TRow>
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
      const prepareColumn = opts?.column
      if (
        !prepare ||
        prepareRow === undefined ||
        prepareRowId === undefined ||
        prepareColumn === undefined
      ) {
        // No prepare hook (or caller didn't pass row / column context)
        // → advance straight to Mounting.
        dispatch({ type: "prepareResolved" })
        return
      }
      // Optional prepare: race-safe via a token captured at fire time.
      // If the user cancels while prepare is in flight, the machine has
      // already returned to Navigation; we suppress the late dispatch.
      const token = ++prepareTokenRef.current
      Promise.resolve()
        .then(() =>
          prepare({
            row: prepareRow,
            rowId: prepareRowId,
            columnId: cell.columnId,
            column: prepareColumn,
          }),
        )
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
        setLatestValidationError({
          rowId: candidate.rowId,
          columnId: candidate.columnId,
          columnHeader: resolveColumnHeader(candidate.column),
          error: result.error,
        })
        return
      }

      // A successful commit on a previously-rejected cell retires both
      // the status-bar segment and the flash window for that cell —
      // the user fixed the value, so the rejection signal is stale.
      // Honours the v0.6 §1 risk note: "flash class auto-clearing
      // must not fight a re-edit on the same cell."
      clearValidationErrorIfFor(candidate.rowId, candidate.columnId)

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
            const settled = await (settle as Promise<unknown>)
            // Stale-settle guard: if a newer commit superseded this
            // one, the entry's mutationId no longer matches what we
            // started with. Don't touch the entry — the newer commit
            // owns its own pending lifecycle.
            const after = editEntriesRef.current.get(candidate.rowId)?.get(candidate.columnId)
            if (!after || after.mutationId !== mutationId) return

            // Result-shaped resolution (`{ status, reason?, row? }`)
            // mirrors a thrown rejection or a server-confirmed accept.
            // Returning `void | undefined` keeps the legacy
            // fire-and-forget settle path.
            if (isCellEditCommitResult<TRow>(settled)) {
              if (settled.status === "rejected") {
                applyAsyncCommitRollback({
                  patches: overlayRef.current.patches,
                  entry: after,
                  rowId: candidate.rowId,
                  columnId: candidate.columnId,
                  reason: settled.reason,
                })
                forceRender()
                options.announce?.({
                  kind: "serverError",
                  column: candidate.column,
                  error: after.error ?? "Server rejected the edit.",
                })
                return
              }
              if (settled.row !== undefined) {
                const serverValue = getCellValue(settled.row, candidate.column)
                if (serverValue !== undefined) {
                  overlayRef.current.patches
                    .get(candidate.rowId)
                    ?.set(candidate.columnId, serverValue)
                }
              }
            }

            after.pending = false
            forceRender()
            announceCommitted()
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
            applyAsyncCommitRollback({
              patches: overlayRef.current.patches,
              entry: rollbackEntry,
              rowId: candidate.rowId,
              columnId: candidate.columnId,
              reason: err instanceof Error ? err.message : undefined,
            })
            forceRender()
            options.announce?.({
              kind: "serverError",
              column: candidate.column,
              error: rollbackEntry.error ?? "Server rejected the edit.",
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
    [
      options.validate,
      options.onCellEditCommit,
      options.announce,
      setLatestValidationError,
      clearValidationErrorIfFor,
    ],
  )

  /**
   * Programmatically clear a cell value, bypassing the editor portal.
   *
   * Mirrors Excel's Delete semantic — the user wants the cell empty
   * and stays in nav mode. Runs through `column.valueParser` (called
   * with `""`) + `validate` + the overlay update + `onCellEditCommit`,
   * so consumer column logic applies the same way as a keyboard /
   * paste commit. The state machine is not driven — no editor
   * portal mount, no Mounting / Editing / Validating transitions.
   *
   * No-ops when the controller is in any non-Navigation mode (the
   * grid is editing a different cell; respect the in-flight edit).
   *
   * Audit P1-W3-1.
   */
  const clearCell = useCallback(
    async (candidate: {
      rowId: RowId
      row: TRow
      columnId: ColumnId
      column: BcReactGridColumn<TRow, unknown>
      previousValue: unknown
    }): Promise<void> => {
      // Cancel any in-flight async validation from a superseded commit.
      validateAbortRef.current?.abort()
      const ac = new AbortController()
      validateAbortRef.current = ac

      // Empty-input convention: the column's `valueParser` decides
      // what "empty" means in its typed domain (null for text,
      // 0 for number, [] for multi-select, etc.). Without a parser
      // we land null — consistent with the column's nullable contract
      // and the v0.1 "delete clears to null" behaviour the v0.5
      // Backspace/Delete clear feature pins.
      const parser = candidate.column.valueParser
      const parsedValue: unknown = parser ? (parser("", candidate.row) as unknown) : null

      const validator = options.validate
      let result: BcValidationResult
      try {
        result = validator
          ? await Promise.resolve(
              validator(parsedValue, candidate.row, candidate.columnId, ac.signal),
            )
          : { valid: true }
      } catch (err) {
        if (ac.signal.aborted) return
        const message = err instanceof Error ? err.message : "Validation failed."
        result = { valid: false, error: message }
      }
      if (ac.signal.aborted) return
      if (validateAbortRef.current === ac) validateAbortRef.current = null

      if (!result.valid) {
        // The assertive live-region announce still informs AT users.
        // Sighted users see the cell flash + the `"latestError"` status
        // segment populated below — the v0.6 §1 visible-feedback story
        // covers what the v0.4 audit flagged as the "Delete on a
        // required field is a no-op for sighted users" gap (P1-W3-4 +
        // worker3 #378's clear-rejection follow-up).
        options.announce?.({
          kind: "validationError",
          column: candidate.column,
          error: result.error,
        })
        setLatestValidationError({
          rowId: candidate.rowId,
          columnId: candidate.columnId,
          columnHeader: resolveColumnHeader(candidate.column),
          error: result.error,
        })
        return
      }

      // Same as `commit` — a successful clear on a previously-rejected
      // cell retires both the status-bar segment and the flash window.
      clearValidationErrorIfFor(candidate.rowId, candidate.columnId)

      // Overlay update — same shape as `commit` but without the
      // state-machine dispatches. Reuses `mutationCounterRef` so
      // stale-settle guards continue to work for any subsequent
      // re-edit of the same cell.
      const rowPatch = overlayRef.current.patches.get(candidate.rowId) ?? new Map()
      rowPatch.set(candidate.columnId, parsedValue)
      overlayRef.current.patches.set(candidate.rowId, rowPatch)
      const mutationId = `m-${++mutationCounterRef.current}`
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
          source: "keyboard",
        })
        if (settle && typeof (settle as Promise<void>).then === "function") {
          // Same async-settle + stale-settle + rollback semantics as
          // `commit` so Delete-then-immediately-edit-the-same-cell
          // doesn't race the server reject of the older clear. Also
          // mirrors `commit`'s `BcCellEditCommitResult<TRow>` opt-in
          // (see `commit` for the result-shape contract).
          const entry = editEntriesRef.current.get(candidate.rowId)?.get(candidate.columnId)
          if (entry) entry.pending = true
          forceRender()
          try {
            const settled = await (settle as Promise<unknown>)
            const after = editEntriesRef.current.get(candidate.rowId)?.get(candidate.columnId)
            if (!after || after.mutationId !== mutationId) return

            if (isCellEditCommitResult<TRow>(settled)) {
              if (settled.status === "rejected") {
                applyAsyncCommitRollback({
                  patches: overlayRef.current.patches,
                  entry: after,
                  rowId: candidate.rowId,
                  columnId: candidate.columnId,
                  reason: settled.reason,
                })
                forceRender()
                options.announce?.({
                  kind: "serverError",
                  column: candidate.column,
                  error: after.error ?? "Server rejected the edit.",
                })
                return
              }
              if (settled.row !== undefined) {
                const serverValue = getCellValue(settled.row, candidate.column)
                if (serverValue !== undefined) {
                  overlayRef.current.patches
                    .get(candidate.rowId)
                    ?.set(candidate.columnId, serverValue)
                }
              }
            }

            after.pending = false
            forceRender()
            announceCommitted()
          } catch (err) {
            const rollbackEntry = editEntriesRef.current
              .get(candidate.rowId)
              ?.get(candidate.columnId)
            if (!rollbackEntry || rollbackEntry.mutationId !== mutationId) return
            applyAsyncCommitRollback({
              patches: overlayRef.current.patches,
              entry: rollbackEntry,
              rowId: candidate.rowId,
              columnId: candidate.columnId,
              reason: err instanceof Error ? err.message : undefined,
            })
            forceRender()
            options.announce?.({
              kind: "serverError",
              column: candidate.column,
              error: rollbackEntry.error ?? "Server rejected the edit.",
            })
          }
        } else {
          announceCommitted()
        }
      } else {
        announceCommitted()
      }
    },
    [
      options.validate,
      options.onCellEditCommit,
      options.announce,
      setLatestValidationError,
      clearValidationErrorIfFor,
    ],
  )

  const rollbackPasteCommit = useCallback(
    (
      commitEntry: RangeTsvPasteApplyPlan<TRow>["commits"][number],
      mutationId: string,
      err: unknown,
    ) => {
      const rollbackEntry = editEntriesRef.current.get(commitEntry.rowId)?.get(commitEntry.columnId)
      if (!rollbackEntry || rollbackEntry.mutationId !== mutationId) return

      const patches = overlayRef.current.patches.get(commitEntry.rowId)
      patches?.delete(commitEntry.columnId)
      if (patches && patches.size === 0) overlayRef.current.patches.delete(commitEntry.rowId)

      const rollbackError = err instanceof Error ? err.message : "Server rejected the edit."
      rollbackEntry.pending = false
      rollbackEntry.error = rollbackError
      forceRender()
      options.announce?.({
        kind: "serverError",
        column: commitEntry.column,
        error: rollbackError,
      })
    },
    [options.announce],
  )

  const commitFromPasteApplyPlan = useCallback(
    (plan: RangeTsvPasteApplyPlan<TRow>): void => {
      validateAbortRef.current?.abort()
      validateAbortRef.current = null

      const appliedCommits: Array<{
        commit: (typeof plan.commits)[number]
        mutationId: string
      }> = []

      for (const commitEntry of plan.commits) {
        const rowPatch = overlayRef.current.patches.get(commitEntry.rowId) ?? new Map()
        rowPatch.set(commitEntry.columnId, commitEntry.nextValue)
        overlayRef.current.patches.set(commitEntry.rowId, rowPatch)

        const mutationId = `m-${++mutationCounterRef.current}`
        const rowEntries = editEntriesRef.current.get(commitEntry.rowId) ?? new Map()
        rowEntries.set(commitEntry.columnId, {
          pending: false,
          previousValue: commitEntry.previousValue,
          mutationId,
        })
        editEntriesRef.current.set(commitEntry.rowId, rowEntries)
        appliedCommits.push({ commit: commitEntry, mutationId })
      }

      forceRender()

      const consumerHook = options.onCellEditCommit
      if (!consumerHook) return

      let pendingChanged = false
      for (const { commit: commitEntry, mutationId } of appliedCommits) {
        const event: BcCellEditCommitEvent<TRow> = {
          rowId: commitEntry.rowId,
          row: commitEntry.row,
          columnId: commitEntry.columnId,
          column: commitEntry.column,
          previousValue: commitEntry.previousValue as never,
          nextValue: commitEntry.nextValue as never,
          source: "paste",
        }

        let settle: ReturnType<typeof consumerHook>
        try {
          settle = consumerHook(event)
        } catch (err) {
          rollbackPasteCommit(commitEntry, mutationId, err)
          continue
        }

        if (!settle || typeof (settle as Promise<unknown>).then !== "function") continue

        const entry = editEntriesRef.current.get(commitEntry.rowId)?.get(commitEntry.columnId)
        if (entry) {
          entry.pending = true
          pendingChanged = true
        }

        void (settle as Promise<unknown>)
          .then((settled) => {
            const after = editEntriesRef.current.get(commitEntry.rowId)?.get(commitEntry.columnId)
            if (!after || after.mutationId !== mutationId) return

            // Result-shaped resolution mirrors `commit` / `clearCell`:
            // `{ status: "rejected", reason }` rolls back exactly like a
            // thrown error; `{ status: "accepted", row? }` keeps the
            // overlay and (when `row` is supplied) re-extracts this
            // cell's value from the server-confirmed row.
            if (isCellEditCommitResult<TRow>(settled)) {
              if (settled.status === "rejected") {
                rollbackPasteCommit(
                  commitEntry,
                  mutationId,
                  settled.reason ? new Error(settled.reason) : undefined,
                )
                return
              }
              if (settled.row !== undefined) {
                const serverValue = getCellValue(settled.row, commitEntry.column)
                if (serverValue !== undefined) {
                  overlayRef.current.patches
                    .get(commitEntry.rowId)
                    ?.set(commitEntry.columnId, serverValue)
                }
              }
            }

            after.pending = false
            forceRender()
          })
          .catch((err) => rollbackPasteCommit(commitEntry, mutationId, err))
      }

      if (pendingChanged) forceRender()
    },
    [options.onCellEditCommit, rollbackPasteCommit],
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

  /**
   * Discard every uncommitted edit on a row — the multi-cell rollback
   * the user reaches for after Tab-driven entry into 4 cells then
   * "actually, never mind, revert this row." Audit P1-W3-3.
   *
   * Walks the row's overlay patches + edit entries and drops every
   * non-pending one. Pending entries (in-flight server commits) are
   * preserved — the overlay is still load-bearing for those, and
   * dropping them mid-flight would race the server reject's
   * rollback. Error entries (server-rejected, awaiting retry /
   * dismiss) are also preserved so the user sees the failure
   * surface; consumers that want a true "discard everything"
   * (including errored cells) can call `discardRowEdits` after
   * clearing the error via re-edit.
   *
   * If the active editor is on this row, cancels it first (mirrors
   * Escape — the editor unmounts cleanly through the state machine).
   *
   * Returns `{ discarded }` so callers can announce "Reverted N
   * changes" or skip the toast when nothing actually rolled back.
   */
  const discardRowEdits = useCallback((rowId: RowId): { discarded: number } => {
    // If the active edit is on the same row, cancel it first.
    // The state machine's cancel event is absorbed in non-editing
    // modes so this is safe to call unconditionally.
    if (
      (editStateRef.current.mode === "preparing" ||
        editStateRef.current.mode === "mounting" ||
        editStateRef.current.mode === "editing" ||
        editStateRef.current.mode === "validating") &&
      editStateRef.current.cell.rowId === rowId
    ) {
      validateAbortRef.current?.abort()
      validateAbortRef.current = null
      prepareTokenRef.current++
      dispatch({ type: "cancel" })
    }

    const result = discardRowOverlayEdits(overlayRef.current.patches, editEntriesRef.current, rowId)
    if (result.discarded > 0) forceRender()
    return result
  }, [])

  return {
    editState,
    getOverlayValue,
    hasOverlayValue,
    getCellEditEntry,
    getRowEditState,
    getLatestValidationError,
    isCellFlashing,
    pruneOverlay,
    start,
    commit,
    clearCell,
    commitFromPasteApplyPlan,
    cancel,
    discardRowEdits,
    dispatchMounted,
    dispatchUnmounted,
  }
}

/**
 * Stringify a column's header for the `latestValidationError` status
 * segment. Pulled from `column.header` when it's a string; falls back
 * to `column.field` then `column.columnId` for non-string headers
 * (consumer-supplied React nodes can't render as plain text). Pure so
 * the resolution can be unit-tested without React.
 */
export function resolveColumnHeader<TRow>(column: BcReactGridColumn<TRow, unknown>): string {
  if (typeof column.header === "string") return column.header
  if (typeof column.field === "string") return column.field
  if (typeof column.columnId === "string") return column.columnId
  return ""
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

/**
 * Drop every non-pending overlay patch + edit entry for a single row.
 * Pending entries (in-flight server commits) and error entries
 * (server-rejected, awaiting consumer dismissal) are preserved — both
 * are still load-bearing per `editing-rfc §Concurrency` (rolling them
 * back would race the server reject's own rollback for pending,
 * and would silently swallow the surface for errored).
 *
 * Mutates the maps in place; returns `{ discarded }` so callers can
 * skip the announce when nothing actually rolled back. Pure so the
 * concurrency semantics can be unit-tested without React.
 *
 * Audit P1-W3-3.
 */
export function discardRowOverlayEdits(
  patches: Map<RowId, Map<ColumnId, unknown>>,
  entries: Map<RowId, Map<ColumnId, BcCellEditEntry>>,
  rowId: RowId,
): { discarded: number } {
  const rowPatches = patches.get(rowId)
  const rowEntries = entries.get(rowId)
  if (!rowPatches || !rowEntries) return { discarded: 0 }

  let discarded = 0
  for (const [columnId, entry] of [...rowEntries]) {
    if (entry.pending || entry.error) continue
    rowPatches.delete(columnId)
    rowEntries.delete(columnId)
    discarded++
  }
  if (rowPatches.size === 0) patches.delete(rowId)
  if (rowEntries.size === 0) entries.delete(rowId)
  return { discarded }
}

export type EditingController<TRow> = ReturnType<typeof useEditingController<TRow>>

/**
 * Discriminator for the opt-in `BcCellEditCommitResult<TRow>` async-settle
 * shape. A consumer hook that returns `Promise<{ status, reason?, row? }>`
 * lets `<BcGrid>` run the same optimistic / rollback / overlay lifecycle
 * `<BcServerGrid>` already runs through `onServerRowMutation` — see
 * `BcCellEditCommitResult` JSDoc. Pure so concurrency edge cases stay
 * unit-testable without React.
 */
export function isCellEditCommitResult<TRow>(
  value: unknown,
): value is BcCellEditCommitResult<TRow> {
  if (!value || typeof value !== "object") return false
  const status = (value as { status?: unknown }).status
  return status === "accepted" || status === "rejected"
}

/**
 * Roll back a single overlay patch + flip its entry into the error state.
 * Shared by `commit` / `clearCell` between the catch-block (thrown
 * exception) and the `BcCellEditCommitResult<TRow>` rejected path so both
 * touch the entry in lockstep — same patch deletion, same `pending=false`,
 * same default error message. Pure (mutates in place); the calling hook
 * runs `forceRender()` and the `serverError` announce after this returns.
 */
export function applyAsyncCommitRollback(args: {
  patches: Map<RowId, Map<ColumnId, unknown>>
  entry: BcCellEditEntry
  rowId: RowId
  columnId: ColumnId
  reason: string | undefined
}): void {
  const rowPatches = args.patches.get(args.rowId)
  rowPatches?.delete(args.columnId)
  if (rowPatches && rowPatches.size === 0) args.patches.delete(args.rowId)
  args.entry.pending = false
  args.entry.error = args.reason ?? "Server rejected the edit."
}
