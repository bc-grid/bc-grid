import type { BcSelection, RowId } from "./index"

/**
 * Selection narrowing helpers (v0.6 §1 bcselection-narrowing).
 *
 * `BcSelection` is a discriminated union with three modes (`explicit` /
 * `all` / `filtered`). Inside an `if (selection.mode === "explicit")`
 * block TypeScript narrows the type via the discriminator, but
 * downstream helpers that take `BcSelection` directly (e.g.
 * `getSelectedRows(selection, allRows)`) can't narrow because the
 * parameter is the wide union. The result: every consumer hand-rolls
 * `if (selection.mode === "explicit") { selection.rowIds.forEach(...) }`
 * instead of writing `if (isExplicitSelection(selection)) { ... }`.
 *
 * Doc-management spike (#367) finding #3 + production-estimating
 * spike (#374) finding #6 surfaced the same ergonomic gap. These
 * type guards close it. Pure, zero-cost — they read `selection.mode`
 * and return the predicate, which TypeScript uses to narrow.
 */

/**
 * Type guard for the `"explicit"` mode of `BcSelection`. Narrows
 * the supplied selection to `{ mode: "explicit"; rowIds: ReadonlySet<RowId> }`
 * inside `if`-branches, so downstream code can `selection.rowIds.has(...)`
 * without the discriminator dance.
 */
export function isExplicitSelection(
  selection: BcSelection,
): selection is Extract<BcSelection, { mode: "explicit" }> {
  return selection.mode === "explicit"
}

/**
 * Type guard for the `"all"` mode of `BcSelection`. Narrows to
 * `{ mode: "all"; except: ReadonlySet<RowId> }` so downstream code
 * can read the `except` set directly.
 */
export function isAllSelection(
  selection: BcSelection,
): selection is Extract<BcSelection, { mode: "all" }> {
  return selection.mode === "all"
}

/**
 * Type guard for the `"filtered"` mode of `BcSelection`. Narrows to
 * `{ mode: "filtered"; except: ReadonlySet<RowId>; viewKey?: string }`
 * so downstream code can read both `except` and the optional
 * `viewKey` discriminator.
 */
export function isFilteredSelection(
  selection: BcSelection,
): selection is Extract<BcSelection, { mode: "filtered" }> {
  return selection.mode === "filtered"
}

/**
 * Iterate every selected `RowId` regardless of `BcSelection` mode.
 *
 * For `"explicit"` mode, walks the explicit `rowIds` set. For
 * `"all"` / `"filtered"` modes, walks `visibleRowIds` and skips any
 * row in the `except` set. The order matches `visibleRowIds`'s order
 * for `"all"` / `"filtered"` so the consumer sees the iteration in
 * row order; for `"explicit"`, the order is the Set's insertion
 * order (typically the order rows were clicked).
 *
 * `visibleRowIds` is the supplier-of-truth for "which rows currently
 * exist." For client grids this is the post-filter row order; for
 * server grids it's whichever block / page is loaded. Pass an empty
 * array to get just the explicit-mode rowIds (the helper short-
 * circuits for `"all"` / `"filtered"` if `visibleRowIds.length === 0`).
 *
 * Per `v06-bcselection-narrowing`. Pure (no allocations beyond the
 * callback's), so safe to call on every render.
 */
export function forEachSelectedRowId(
  selection: BcSelection,
  visibleRowIds: readonly RowId[],
  callback: (rowId: RowId) => void,
): void {
  if (selection.mode === "explicit") {
    for (const rowId of selection.rowIds) callback(rowId)
    return
  }
  // "all" / "filtered" modes: iterate visibleRowIds and skip exceptions.
  const except = selection.except
  for (const rowId of visibleRowIds) {
    if (!except.has(rowId)) callback(rowId)
  }
}
