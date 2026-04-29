import { useEffect } from "react"

/**
 * `gridId`-scoped localStorage persistence per `api.md §3.3`. When a
 * consumer sets `gridId`, the React layer persists `columnState`,
 * `pageSize`, `density`, and `groupBy` to localStorage by default.
 *
 * Storage key convention: `bc-grid:{gridId}:{stateName}`.
 *
 * SSR-safe — `window` checks gate every read and write so the helpers
 * are no-ops in Node environments (Astro / Next.js SSR).
 */

export type PersistedStateName = "columnState" | "pageSize" | "density" | "groupBy"

const STORAGE_PREFIX = "bc-grid"
const WRITE_DEBOUNCE_MS = 500

function storageKey(gridId: string, name: PersistedStateName): string {
  return `${STORAGE_PREFIX}:${gridId}:${name}`
}

/**
 * Read the persisted value for `gridId` + `name`, or return `fallback` if:
 *   - no `gridId` is set (caller opts out of persistence),
 *   - we're in an SSR / non-browser environment,
 *   - the storage key is empty,
 *   - the stored value can't be JSON-parsed,
 *   - the parsed value fails the supplied type predicate (defensive — in
 *     case localStorage is shared across grid versions with incompatible
 *     shapes).
 */
export function loadPersistedState<T>(
  gridId: string | undefined,
  name: PersistedStateName,
  fallback: T,
  isValid?: (parsed: unknown) => parsed is T,
): T {
  if (!gridId) return fallback
  if (typeof window === "undefined" || !window.localStorage) return fallback
  let raw: string | null
  try {
    raw = window.localStorage.getItem(storageKey(gridId, name))
  } catch {
    // Some browsers throw on storage access in private mode.
    return fallback
  }
  if (raw == null) return fallback
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return fallback
  }
  if (isValid && !isValid(parsed)) return fallback
  return parsed as T
}

/**
 * Write `value` to localStorage immediately. No-ops outside the browser
 * or when `gridId` is unset. Errors (quota exceeded, private mode) are
 * swallowed — persistence is best-effort, never blocks a render.
 */
export function persistState<T>(
  gridId: string | undefined,
  name: PersistedStateName,
  value: T,
): void {
  if (!gridId) return
  if (typeof window === "undefined" || !window.localStorage) return
  try {
    window.localStorage.setItem(storageKey(gridId, name), JSON.stringify(value))
  } catch {
    // Quota / private-mode failures are non-fatal.
  }
}

/**
 * Persist `value` whenever it changes, debounced 500ms so a rapid
 * sequence of edits (column resize drag, page-size cycling) coalesces
 * to one write. The cleanup cancels the pending write when `value`
 * changes again before the timer fires — last-write-wins.
 */
export function useGridPersistence<T>(
  gridId: string | undefined,
  name: PersistedStateName,
  value: T,
): void {
  useEffect(() => {
    if (!gridId) return
    const timer = setTimeout(() => persistState(gridId, name, value), WRITE_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [gridId, name, value])
}
