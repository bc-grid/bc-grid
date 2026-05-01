# v0.3 Range Fill Handle Plan

Owner: worker1
Branch: `agent/worker1/v030-range-fill-handle-plan`
Date: 2026-05-01

## Audit Summary

Current `main` has the range state machine in `@bc-grid/core` and range clipboard copy in `@bc-grid/react`.

- Core range state stores inclusive `{ start, end }` cell positions by `RowId` and `ColumnId`.
- `rangePointerDown`, `rangePointerMove`, `rangeKeydown`, `rangeSelectAll`, and `rangeClear` are pure and already covered for primary transitions.
- React owns row/column model resolution, active range state, `api.copyRange`, and Ctrl/Cmd+C clipboard copy.
- Merged `main` does not include a visual range overlay or fill-handle UI yet. Any v0.3 fill work should layer on top of the overlay PR rather than duplicate overlay geometry.
- Fill handle depends on ordered range bounds, source-cell extraction, target-range calculation, and edit validation. Ordered bounds were missing as a reusable core helper; this PR adds `normaliseRange`.

## Non-Goals

- No Playwright, smoke-perf, benchmarks, release-preflight, publish, package version, changelog, lockfile, or release-status changes.
- No UI drag wiring in this planning PR.
- No server-row-model fill behavior. Fill is constrained to visible, loaded client rows in v0.3.
- No formula propagation or smart spreadsheet series beyond simple copy/linear continuation.

## Core API Shape

This PR adds the small reusable helper that later fill-handle and overlay code can share:

```ts
export interface BcNormalisedRange {
  rowStart: number
  rowEnd: number
  colStart: number
  colEnd: number
  rowSpan: number
  colSpan: number
  topLeft: BcCellPosition
  bottomRight: BcCellPosition
}

export function normaliseRange(
  range: BcRange,
  columns: readonly { columnId: ColumnId }[],
  rowIds: readonly RowId[],
): BcNormalisedRange | undefined
```

Follow-up pure helpers should live in core or a React-internal helper depending on whether they need row values:

```ts
type BcRangeFillDirection = "up" | "down" | "left" | "right"

interface BcRangeFillPreview {
  sourceRange: BcRange
  targetRange: BcRange
  fillRange: BcRange
  direction: BcRangeFillDirection
}
```

Keep value parsing, validation, and optimistic edit application in React because those depend on column definitions and `BcEditGrid` edit state.

## Mouse Interaction

1. Render an 8x8 `.bc-grid-fill-handle` on the active range bottom-right corner only when exactly one valid range is active.
2. The range overlay remains `pointer-events: none`; the handle itself opts into pointer events.
3. `pointerdown` on the handle captures the pointer and records:
   - source range normalized bounds,
   - source rows/columns,
   - initial pointer cell,
   - scroll offset and visible row/column model snapshot.
4. `pointermove` resolves the cell under the pointer and computes a preview target:
   - vertical drag extends rows when the pointer leaves the source above/below,
   - horizontal drag extends columns when it leaves left/right,
   - diagonal drags choose the axis with the larger outside distance; ties prefer vertical for Excel-style row fill.
5. During drag, render preview only. Do not mutate row data or committed range state.
6. `pointerup` applies copy/linear fill through the existing edit commit path, atomically.
7. `Escape` during an active pointer drag cancels preview and releases capture.

## Keyboard Interaction

Range selection keyboard behavior remains the existing model:

- Shift+Arrow extends by one cell.
- Ctrl/Cmd+Shift+Arrow extends to the loaded edge.
- Ctrl/Cmd+A selects all visible cells.
- Esc clears range selection.

The v0.3 fill handle should not add a tabbable control yet. Keyboard users can copy/paste ranges; keyboard fill commands should be a separate accessibility task once behavior is stable.

## Fill Behavior

Use copy-first semantics for v0.3:

- If the source range is one cell or contains non-sequential values, copy the source pattern repeatedly into the fill range.
- If the source range is a single row or single column with at least two numeric/date-like values, continue a linear sequence along the drag direction.
- Preserve per-column `valueParser` and `validate` semantics.
- If any target cell fails parse/validate, abort all writes and report validation errors.
- Do not write into group rows, disabled rows, missing rows, or non-editable columns.
- Do not fill across pinned/body boundaries in the first UI PR unless the overlay branch already gives stable segmented geometry.

## Implementation Order

1. Land pure range normalization and tests. Done in this PR.
2. Add React-internal fill helpers and tests:
   - resolve active range,
   - compute fill preview,
   - flatten source values,
   - repeat/carry linear series,
   - validate and build edit patch atomically.
3. Add visual handle rendering on top of the active range overlay.
4. Wire pointer drag preview.
5. Wire commit through the existing edit pipeline.
6. Add browser validation in coordinator-owned Playwright after the implementation PR is ready.

## Risks

- Controlled `rangeSelection` consumers may hold stale ranges across sort/filter/data changes unless the React hardening PR lands first.
- Overlay and fill-handle z-index must be coordinated so the handle stays clickable without blocking normal cell interaction.
- Auto-scroll during drag can be added later; v0.3 can initially clamp to visible cells if needed.
- Validation must stay atomic to avoid partial row edits.
- Multi-range fill should remain disabled in v0.3.

## Unit Test Targets

- `normaliseRange` returns stable ordered indexes and corner cells for reversed ranges.
- `normaliseRange` returns `undefined` for stale endpoints and empty row/column models.
- Keyboard extension clamps at upper-left and lower-right bounds.
- Fill preview rejects empty selection, multi-range, stale endpoints, group rows, and non-editable targets.
- Copy fill repeats source patterns across larger target ranges.
- Linear fill handles numeric/date sequences only when source orientation matches drag direction.
