import type { ColumnId, RowId, ServerRowPatch } from "@bc-grid/core"
import { useCallback, useEffect, useRef, useState } from "react"

/**
 * Shared orchestration primitives for the v0.5 server-grid hooks
 * (`useServerPagedGrid`, `useServerInfiniteGrid`, future
 * `useServerTreeGrid`). Exported only within `@bc-grid/react`; the
 * package-public re-exports live next to each hook.
 *
 * The primitives here are deliberately tiny — they exist to remove
 * duplication, not to encode policy. Each hook still owns its own
 * controlled-state shape, page semantics, and prop assembly.
 */

/**
 * Minimal debounce hook. Returns the input value unchanged on the
 * first render; subsequent input changes are deferred by `delayMs`
 * and coalesced (the latest input wins). When `delayMs` is `0`, the
 * value is forwarded immediately on every change.
 *
 * Used by every server-grid hook to defer view-defining state
 * (filter, search, sort) so a typed character does not trigger a
 * server round-trip per keystroke.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState<T>(value)
  useEffect(() => {
    if (delayMs <= 0) {
      setDebounced(value)
      return
    }
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])
  return debounced
}

/**
 * Returns a function that yields a fresh deterministic mutation ID
 * each time it is called. The ID format is `<prefix>:<n>` where `n`
 * is a monotonically increasing integer scoped to the host hook
 * instance. Consumers can correlate hook-issued patches in their
 * `onServerRowMutation` settle handler by matching the prefix.
 */
export function useMutationIdStream(prefix: string): () => string {
  const counterRef = useRef(0)
  return useCallback(() => {
    counterRef.current += 1
    return `${prefix}:${counterRef.current}`
  }, [prefix])
}

/**
 * Pure helper exported for unit testing. Builds a `ServerRowPatch`
 * with a hook-provided mutation-ID prefix + sequence so consumers can
 * correlate hook-issued patches in telemetry or `onServerRowMutation`.
 */
export function buildOptimisticEditPatch(input: {
  rowId: RowId
  changes: Record<ColumnId, unknown>
  prefix: string
  sequence: number
}): ServerRowPatch {
  return {
    mutationId: `${input.prefix}:${input.sequence}`,
    rowId: input.rowId,
    changes: input.changes,
  }
}

/**
 * Pure helper exported for unit testing. Detects whether an
 * `AbortSignal` was tripped before a loader resolved. Used by the
 * server-grid hooks to avoid clearing loading state when a newer
 * request superseded the in-flight one.
 */
export function isLoadAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true
}

/**
 * Standard `AbortError` shape used by the server-grid hooks so the
 * model layer's `isAbortError` predicate identifies them as such.
 * Exported for unit testing.
 */
export function createServerLoadAbortError(): Error {
  const error = new Error("Aborted")
  error.name = "AbortError"
  return error
}
