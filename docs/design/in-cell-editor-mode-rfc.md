# In-Cell Editor Mode with Popup Opt-In RFC

**Status:** Draft for consumer-testing feedback (autonomous merge authorised; this RFC documents design + open questions, it does not gate ship)
**Author:** coordinator (Claude)
**Reviewer:** maintainer (JohnC)
**Target release:** v0.6.0
**Implementation lane:** worker3 (editor + a11y track)
**Informed by:** `docs/design.md §11` (editing model), `docs/api.md §7` (editor protocol — frozen), `docs/design/editing-rfc.md` (lifecycle, retention, click-outside contract), `docs/design/server-mode-switch-rfc.md` (RFC tone reference), commit `628949c` (DOM-rect editor positioning fix, 2026-05-03).

---

## 1. Problem statement

Today every editor mounts via the `EditorPortal` overlay outside the row's DOM, anchored by absolute coordinates from `editorCellRect`. The overlay is **not** a `React.createPortal` — it is an absolute-positioned `<div>` at `packages/react/src/grid.tsx:2993-3005`, sibling to the body row container, positioned by the `editorCellRect` `useMemo` at `grid.tsx:1601-1643`. The math has just been refactored to source position from the DOM rather than the virtualizer's cumulative offset (`628949c`, 2026-05-03 — `bsncraft` consumer reproduced the bug with `renderDetailPanel` + editable cells: the editor portal landed offset upward by the cumulative panel height because `virtualizer.scrollOffsetForRow` math assumes uniform row heights and doesn't account for detail-panel offsets).

The DOM-rect approach is robust, but it is structurally wrong for most editors:

1. The `useMemo` still depends on an invalidation-only dep (`expansionState` at `grid.tsx:1642`) that has no value contribution — only "tell me to recompute when detail panels above the editor row toggle." Every future positioning surface that shifts the editor cell's screen position (sticky-left detail panels, group rows, master/detail nesting, sticky headers, container resizes, pinned-cell composites, range-paste affordances) must wire its own invalidation hint into this dep array. That's a maintenance scar that compounds with every layout feature.
2. The `editorPortal.tsx` mount path (`packages/react/src/editorPortal.tsx:69-132`) reads the `cellRect` prop and stamps `position: absolute` + `top` / `left` / `width` / `height` (`editorPortal.tsx:411-425`). The cell is *already* positioned by the body cell renderer (`packages/react/src/bodyCells.tsx:209-263`) — we are recomputing what the cell already knows.
3. Virtualization scroll-out is the historical justification for the overlay (in `<BcServerGrid>` infinite/tree mode the editing row can scroll out of the virtualizer's render window; if the editor lived inside the cell, scroll-out would unmount the editor → uncommitted value lost). The editor-rfc solved this with index-keyed in-flight retention (`Virtualizer.beginInFlightRow(rowIndex)` + `beginInFlightCol(colIndex)` at `editorPortal.tsx:199-213`), and that same retention contract is available to *any* mount path that holds the row+col indices — overlay or in-cell.

The bsncraft consumer thread surfaced the framing on the 2026-05-03 design call: "the source of truth for where this cell is on screen right now is the DOM, not a position calculator." This RFC takes the next step: **for cells whose editor fits inside the cell box, the source of truth should be the cell itself.** Eliminate the position calculator, eliminate the invalidation deps, eliminate the overlay sibling. Render the editor where the cell already is.

For the editors that genuinely overflow the cell box (autocomplete dropdowns, multi-select chip lists, calendar overlays, the validation popover from #356), the existing overlay path stays — opt-in via a per-editor `popup: boolean` flag. AG Grid lands at the same shape with `cellEditorPopup: boolean` per column (public docs: https://www.ag-grid.com/react-data-grid/cell-editing-start-stop/#popup-cell-editor). Default is in-cell; popup is opt-in for editors that need overflow.

## 2. Scope and non-goals

**In scope (v0.6.0):**

- New `popup?: boolean` flag on `BcCellEditor` (default `false`).
- Cell-renderer integration that mounts the editor inline when active and `popup !== true`.
- Categorisation of all 8 built-in editors (`textEditor`, `numberEditor`, `checkboxEditor`, `selectEditor`, `multiSelectEditor`, `autocompleteEditor`, `dateEditor`, `datetimeEditor`, `timeEditor`) — see §4.
- Behaviour contract for virtualization scroll-out in in-cell mode, with a configurable `BcGridProps.editScrollOutAction` opt (§5).
- Hybrid editor recipe (in-cell trigger + Radix `Popover.Anchor` overlay) for the date / datetime built-ins.

**Out of scope:**

- Editor activation paths. F2 / Enter / printable / double-click / single-click stays exactly as wired today (`grid.tsx` body-cell click handlers; `keyboard.ts` for keys). The recently-shipped `editorActivation` prop from #398 stays unchanged.
- The `editingController` state machine (`packages/react/src/editingStateMachine.ts`). The state graph (`navigation → preparing → mounting → editing → validating → committing → cancelling → unmounting`) is unchanged.
- `BcCellEditorProps` shape. Editors do not learn whether they are mounted in-cell or in-popup — the framework picks the mount point based on `editor.popup`, the editor renders the same component either way.
- Validation popover (#356, `EditorValidationPopover` at `editorPortal.tsx:398-409`). Stays anchored to the cell. In in-cell mode it floats below the cell box exactly as it does today (the cell *is* the editor wrapper); in popup mode the existing path is unchanged.
- Click-outside contract (`editorPortal.tsx:250-262`, `data-bc-grid-editor-root` / `data-bc-grid-editor-portal`). Both attributes survive — the in-cell mount stamps `data-bc-grid-editor-root` on the cell wrapper, popup overlays continue to stamp `data-bc-grid-editor-portal`. The `editorBlurAction` and `escDiscardsRow` props from #398 work the same in both modes.

## 3. Architectural shape

Today's render graph:

```
<BcGrid>
  └── body
      ├── row
      │   └── cell  ← bc-grid-cell, rendered via renderBodyCell()
      ├── row…
      └── (sibling)
          <EditorPortal cellRect={editorCellRect} …>
            └── absolute-positioned <div data-bc-grid-editor-root>
                └── <editor.Component …>
```

Proposed for v0.6 (in-cell editor):

```
<BcGrid>
  └── body
      ├── row
      │   └── cell  ← bc-grid-cell
      │       ├── (when editing && !editor.popup) <EditorMount>  ← stamps data-bc-grid-editor-root
      │       │     └── <editor.Component …>
      │       └── (otherwise) cell-renderer output
      └── (sibling, popup-only)
          <EditorPortal cellRect={editorCellRect} …>  ← only mounted when active editor is popup
            └── absolute-positioned wrapper
                └── <editor.Component …>
```

Implementation shape:

1. **Cell-renderer becomes editor-aware.** `renderBodyCell` already receives `editingCell`, `getOverlayValue`, `getCellEditEntry`. Add the editing controller's `editor` resolution + the editor `popup` flag. When `editingCell?.rowId === entry.rowId && editingCell.columnId === column.columnId && !resolvedEditor.popup`, replace the cell renderer's `formattedValue` output with an `<EditorMount>` slot.
2. **`<EditorMount>` becomes a public-internal component, exported from `editorPortal.tsx` (or moved to a new `editorMount.tsx`).** It already exists as the inner component at `editorPortal.tsx:148-343`. Lift it to a named export, take a `mountStyle: "in-cell" | "popup"` prop. The "in-cell" branch drops the `position: absolute` wrapper style — the cell is already positioned. The "popup" branch keeps it. Everything else (focusRef wiring, retention handles, click-outside, key intercept, the new `blurAction`/`escDiscardsRow` plumbing from #398) is shared.
3. **The outer `<EditorPortal>` shrinks to popup-mode only.** It guards on `editorSpec.popup === true` and returns `null` otherwise. Same JSX site at `grid.tsx:2993`. Same `editorCellRect` math — but the `useMemo` only fires in popup mode, so the invalidation deps (`expansionState`, etc.) only matter when a popup editor is active.
4. **`editorCellRect` is opt-out.** The `useMemo` shrinks: when the active editor is in-cell, return `null` immediately and skip the DOM lookup + math entirely. Net effect: text/number/checkbox/time/date editing stops calling `getBoundingClientRect` on every state change; only select/multi-select/autocomplete editing pays that cost. For grids with no popup editors at all, the dep array is unused.

The change is **localised to three files**: `grid.tsx` (cell-renderer wiring), `bodyCells.tsx` (the editor slot inside the cell), and `editorPortal.tsx` (the mount-style branch). No state-machine change. No `editingController` shape change. No editor-component change.

## 4. Popup categorisation for the 8 built-ins

| Editor | Mode | Reason |
|---|---|---|
| `textEditor` | in-cell | fits the box; single-line input |
| `numberEditor` | in-cell | fits |
| `checkboxEditor` | in-cell | trivial fit |
| `selectEditor` (Combobox) | popup | dropdown listbox overflows |
| `autocompleteEditor` | popup | dropdown + async option list overflows |
| `multiSelectEditor` | popup | dropdown + chip list overflows |
| `dateEditor` | hybrid (input in-cell, calendar overlay popup) | input fits, calendar doesn't |
| `datetimeEditor` | hybrid (input in-cell, picker overlay popup) | same |
| `timeEditor` | in-cell | input fits |

### Notes on the hybrid case

`dateEditor` and `datetimeEditor` are currently native `<input type="date">` / `<input type="datetime-local">` — the browser owns the calendar popover. The native popover is *not* a React DOM child, so it is unreachable to `data-bc-grid-editor-portal` markings. Today this happens to work (the click-outside listener treats the native picker as in-the-input because the native picker is OS-chrome, not document children) but it is fragile and has known cross-browser variance (Safari/Firefox open the picker on focus; Chrome only on click).

The hybrid path is what lets the editor stay native-input but gain a real Radix popover when needed:
- The editor's *trigger* element (the `<input>`) renders in-cell. It is the cell's editor wrapper.
- The editor's *overlay* (the calendar / time picker) is a Radix `Popover.Content` rendered into a Radix portal, anchored to the trigger via `Popover.Anchor`.
- The overlay stamps `data-bc-grid-editor-portal` on its content root. The framework's existing click-outside contract treats clicks inside the overlay as in-the-editor.

The hybrid editors do **not** set `popup: true`. They use the in-cell mount path (their input fits the cell), and they layer their overlay via Radix's positioning primitives. The architecture supports this without special-casing — the framework only cares about where the editor *root element* lives; it does not own the overlay relationship.

Whether the v0.6 PR migrates date/datetime to a Radix-backed picker (gaining cross-browser parity) or keeps them native (smaller bundle, no library dep) is an implementation choice for worker3 — not an RFC decision. Recommend keeping native for v0.6.0 and revisiting if cross-browser variance breaks a customer.

## 5. Virtualisation scroll-out semantics for in-cell editors

This is the only behavioural change consumers will notice.

**Today (popup overlay):** the editor lives outside the row's DOM. `Virtualizer.beginInFlightRow(rowIndex)` + `beginInFlightCol(colIndex)` retain the row+col index inside the virtualizer; the editor's value is preserved across scroll because the overlay never unmounted.

**Proposed for in-cell mode, default:** the editor lives inside the cell's DOM. When the row scrolls past the virtualizer's render window, the cell unmounts → React unmounts the editor inside it → the editor's `useLayoutEffect` cleanup fires. To preserve the user's in-flight value across scroll-out, the framework must do something with the value before the editor disappears. Three plausible options, expressed as a new `BcGridProps.editScrollOutAction`:

- `"commit"` (default in-cell) — read the editor's current value via `readEditorInputValue(focusRef.current, editor)` (already exists in `editorPortal.tsx`), call `editingController.commit({ ... value: currentValue, source: "scroll-out" })`. Matches AG Grid's behaviour and matches the user's mental model: "I scrolled away, my edit is done." Validation runs as on any other commit; if the value is invalid, the validation rejection is announced via the assertive live region.
- `"cancel"` — call `editingController.cancel()`. The user's pending value is dropped; the cell reverts to its previous overlay value (or original `data` value). Useful for grids where partial edits are dangerous (financial entry, etc.).
- `"preserve"` — auto-promote the editor to popup mode for the duration of this edit. The `EditorMount` is unmounted from the cell DOM, an `EditorPortal` is mounted at the overlay sibling site with the editor's current state. This preserves today's behaviour but pays the per-cell positioning cost only when scroll-out actually happens.

Default is `"commit"` because: (a) it is what AG Grid does (consumers migrating from AG Grid see no behavioural surprise); (b) it is what the user's mental model expects when they scroll away from an in-progress edit; (c) `"preserve"` is implementable but adds complexity (re-mount-as-popup mid-edit needs to re-thread `editState`, focusRef, retention handles) for a behaviour most consumers do not need.

**Where the unmount-detection hook lives:** the `useLayoutEffect` cleanup in `EditorMount` already runs on cell-unmount. It currently calls `dispatchUnmounted()` + releases retention. The change adds a check: if the cleanup is firing because of cell unmount (vs. because of explicit commit/cancel), and the active mount style is `"in-cell"`, run the configured `editScrollOutAction`. The signal that distinguishes "cell unmounted out from under us" vs. "we are unmounting because of a state-machine transition" is the editing-controller's mode at cleanup time: if the controller is still in `editing` / `mounting` / `validating`, the cell unmounted under an in-flight edit; if it is in `committing` / `cancelling` / `unmounting`, the unmount is intentional. Read `editStateRef.current.mode`.

For popup-mode editors, `editScrollOutAction` does nothing (the popup is unaffected by row scroll-out — same as today). The retention handles still hold the row+col index inside the virtualizer for popup editors so scroll-back returns the cell at the right position.

## 6. Public API delta

Diff against `docs/api.md §7`.

### `BcCellEditor` — new `popup` field

```ts
export interface BcCellEditor<TRow, TValue = unknown> {
  Component: React.ComponentType<BcCellEditorProps<TRow, TValue>>
  prepare?: (params: BcCellEditorPrepareParams<TRow>) => Promise<unknown>
  kind?: string
  getValue?: (focusEl: HTMLElement | null) => unknown

  /**
   * Mount the editor outside the cell's DOM, anchored by absolute
   * coordinates. Default `false` (the editor renders inside the cell
   * box). Set `true` for editors whose UI overflows the cell —
   * dropdowns, chip lists, async option panels. Hybrid editors that
   * need an overflowing popover but a fitting trigger (date pickers)
   * should keep `popup: false` and render the overlay via a Radix
   * `Popover` anchored to the trigger; mark the overlay content with
   * `data-bc-grid-editor-portal` so the framework's click-outside
   * handler treats it as in-the-editor.
   */
  popup?: boolean
}
```

### `BcGridProps` — new `editScrollOutAction` field

```ts
export interface BcGridProps<TRow> {
  // ...existing fields...

  /**
   * What happens to an in-flight edit when the editing row scrolls
   * out of the virtualizer's render window. Only applies to in-cell
   * editors (`editor.popup !== true`). Popup editors are unaffected
   * by row scroll-out.
   *
   * - "commit" (default): read the editor's current value, commit it.
   * - "cancel": discard the pending value, return the cell to its
   *   previous overlay or data value.
   * - "preserve": auto-promote the editor to popup mode for the rest
   *   of the edit, preserving today's behaviour (pre-v0.6).
   */
  editScrollOutAction?: "commit" | "cancel" | "preserve"
}
```

### `BcCellEditorProps` — unchanged

The editor component does not learn whether it is mounted in-cell or in-popup. The framework picks the mount point based on `editor.popup`; the editor renders the same `<editor.Component>` either way. This keeps the existing 8 built-ins working without any prop-shape change.

### `EditorPortal` rename — recommend keep

`EditorPortal` is exported from `@bc-grid/react`. After v0.6 it only mounts popup-mode editors, so `EditorPopup` would be more accurate. Recommend keep the name for back-compat — the export is part of the v0.5 surface, and renaming forces consumers' import statements to churn for a cosmetic change. Add a JSDoc note that the component now only mounts when the active editor is popup-mode.

### api-surface manifest delta

`tools/api-surface/src/manifest.ts`:
- Add `popup` to the `BcCellEditor` declaration export shape (no change to the export name list — the type is already exported; the new field is structural).
- Add `editScrollOutAction` to `BcGridProps` (same — no new export name, structural addition).

Both deltas are optional + additive, matching the api-rfc-v0 freeze rules.

## 7. Migration path

Three classes of consumer code:

1. **Custom in-cell editor (fits the box).** Set `popup: false` (default; no change required). Existing editors that rendered fine in the overlay will render fine in the cell — they were always sized to the cell by the overlay's `width: cellRect.width / height: cellRect.height` style; in-cell mounting gets the same dimensions for free from the cell's CSS box.
2. **Custom popup editor (overflows the box).** Set `popup: true`. The editor opts into the existing portal path; today's `editorCellRect` math applies; click-outside contract via `data-bc-grid-editor-portal` works exactly as before.
3. **Custom hybrid editor (in-cell trigger + popover overlay).** Set `popup: false`. Render the trigger element via `focusRef`. Render the overlay via Radix `Popover` with `Popover.Anchor` on the trigger; stamp `data-bc-grid-editor-portal` on `Popover.Content`. The click-outside handler treats clicks inside the overlay as in-the-editor; the trigger lives in the cell DOM and inherits cell positioning automatically.

**PR sequence — three PRs, worker3 lane:**

1. **(a) Framework + flag + scroll-out semantics + text/number/checkbox/time migration.** Land the in-cell mount path, the `popup` flag (default false), the `editScrollOutAction` prop, and migrate the four trivially-fitting editors. ~8-10 hours.
2. **(b) Date/datetime migration to in-cell with hybrid overlays.** Keep native `<input type="date">` / `<input type="datetime-local">` for v0.6.0 (their popovers are OS-chrome, not React DOM, so they don't need `data-bc-grid-editor-portal`). ~3-4 hours.
3. **(c) Verify select/autocomplete/multiSelect work as popup-mode.** Should be near-zero change since today's portal path already works for them — set `popup: true` on each, run their tests. ~3-4 hours.

The three PRs split clean: (a) is the structural change; (b) and (c) are categorisation moves with no shared code path.

## 8. Performance

**In-cell editor mount.** A single `<editor.Component>` rendered inline inside the cell renderer's output, replacing the read-only `formattedValue` output. Same React render cost as the read-only cell. No `getBoundingClientRect`, no `useMemo` recomputation, no overlay sibling, no absolute-positioning wrapper.

**Popup editor mount.** Slightly *lower* cost than today because the `editorCellRect` `useMemo` only fires when the active editor is popup-mode. Grids with no popup editors at all skip the DOM lookup entirely.

**Net cost in v0.6 should be slightly lower than today since most editors stop paying the portal cost.**

**Smoke perf bar.** Per `design.md §3.2`, edit-cell paint < 16ms (commit → next paint) is the existing bar. In-cell editing should *improve* this number — the commit path is shorter.

**New benchmark case.** Add to `apps/benchmarks/tests/perf.perf.pw.ts`: edit 100 cells in rapid succession by Tab-typing through a row's cells. Bar: < 16ms p99. Expected on the perf-spike rig: < 8ms in-cell, vs. ~12ms today.

## 9. Test plan

**Unit tests (worker3 writes; coordinator runs at merge):**

- `popup: false` editor mounts inside the cell DOM.
- `popup: true` editor mounts in the overlay sibling.
- `editScrollOutAction = "commit"` / `"cancel"` / `"preserve"` — each verified via programmatic scroll-out.
- All 8 built-in editors round-trip in their assigned mode (table in §4); categorisation regression guard.
- Hybrid date editor: trigger in-cell, popover content stamps `data-bc-grid-editor-portal`, click on a date in the overlay does not trigger click-outside commit.

**Playwright spec (worker3 writes one happy-path; coordinator runs at merge):**

`tests/in-cell-editor.pw.ts`:
1. Mount `<BcGrid>` with a `renderDetailPanel` configured + `textEditor` on column "name".
2. Expand a detail panel above row 5.
3. Double-click the cell at (rowId=5, columnId='name') to enter edit.
4. Assert the editor renders inside the cell box.
5. Type, Tab, scroll out, assert commit fires.
6. Mount a second grid with `selectEditor` on a column, verify the listbox overflows the cell box (popup mode).

**Perf (coordinator runs at merge):** the benchmark case from §8.

## 10. Open questions for the consumer-testing loop

1. **Should `editScrollOutAction` default differ for read-only-with-edit-action grids vs always-editable grids?** Recommendation: ship a single default (`"commit"`); revisit if a consumer surfaces the gap.
2. **Should hybrid date/datetime editors expose their overlay anchor as a public `BcEditorOverlay.Anchor` primitive?** Recommendation: defer to v0.7; the Radix recipe is documented and the wrapper would not save much code.
3. **Validation popover anchor semantics when an in-cell editor's input wraps to multi-line:** anchor to the cell box (taller, includes wrapped lines) or to the input (shorter, only first line)? Recommendation: ship the cell-anchored behaviour; revisit if a consumer reports overlap.
4. **Pinned columns + in-cell editor:** the editor inherits the pinned cell's `position: sticky` automatically. The state-tint composition from `5341af3` (opaque base + tint layer for pinned cells) likewise composes automatically because it lives on the cell, not on the editor. Validate at merge via Playwright: edit a cell in a left-pinned column with horizontal scroll; verify the editor stays pinned with the cell.
5. **`popup: "auto"` for select / autocomplete / multi-select:** the trigger button itself fits the cell; only the dropdown listbox overflows. A future `popup: "auto"` mode could mount the trigger in-cell and lazily promote to popup-overlay-positioning *only when the dropdown opens*. Recommendation: v0.7 follow-up.

## 11. Estimated scope

Single worker3 lane spanning 3 PRs as in §7. Total ~16-22 hours of code + tests + docs.

- **PR (a) — framework + flag + scroll-out + 4-editor migration:** ~8-10 hours.
- **PR (b) — date/datetime migration:** ~3-4 hours.
- **PR (c) — verify popup editors:** ~3-4 hours.
- **Docs:** ~2-3 hours.

PR (a) is the structural one and should be reviewed first. (b) and (c) are categorisation work with no shared logic and can land in either order.

---

**This RFC documents the design and the open questions for the consumer-testing feedback loop. Implementation may proceed under the maintainer's autonomous-decisions authorisation; the RFC's job is to record the shape so worker3 + bsncraft can validate against it.**
