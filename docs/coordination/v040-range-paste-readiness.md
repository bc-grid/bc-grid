# v0.4 Range Paste Readiness

Owner: worker1
Branch: `agent/worker1/range-paste-readiness-v040`
Date: 2026-05-01

Doc type: planning / coordination. This is not the paste or fill-handle
implementation.

## Current State

Range copy is implemented in `packages/react/src/rangeClipboard.ts` and wired
through `BcGrid` keyboard/context-menu/API paths:

- `api.copyRange(range?)` writes TSV (`text/plain`) and table HTML
  (`text/html`).
- Copy uses the active range when no explicit range is passed.
- Context-menu copy falls back to the right-clicked cell when no range exists.
- Copy resolves the current visible row order and resolved visible column order.
- `onBeforeCopy` can suppress or replace the clipboard payload.
- `onCopy` observes the final payload and suppression state.

Paste and fill handle remain unimplemented. The v0.4 paste slice should reuse
the current range selection, active-cell, resolved-column, row-entry, edit
validation, and clipboard helper paths instead of introducing parallel state.

## Paste Scope for v0.4

Implement TSV paste from Excel / Google Sheets / plain spreadsheets first.
HTML paste can share the same matrix output shape but should not block TSV.
Fill handle remains a separate follow-up that reuses paste's validation and
atomic commit helpers.

Minimum API additions:

```ts
onBeforePaste?: (event: BcRangeBeforePasteEvent<TRow>) => boolean | void
onRangePasteCommit?: (event: BcRangePasteEvent<TRow>) => void
```

Recommended event data:

- `targetRange`: clipped range that paste will touch.
- `cells`: parsed string matrix before value parsing.
- `appliedCount`: committed cell count.
- `truncatedCount`: input cells clipped by grid bounds.
- `validationErrors`: keyed by matrix coordinate or cell position.
- `api`: grid API for before hooks.

Do not add localStorage, layout persistence, or URL coupling. Paste is an
interaction, not persisted grid state.

## Parsing Contract

1. Read clipboard text through `navigator.clipboard.readText()` or the richer
   `read()` path when the browser path is already available.
2. Prefer the future bc-grid custom MIME type only after copy writes it. Until
   then, TSV is authoritative.
3. Parse RFC-4180-style quoted cells:
   - tabs split cells outside quotes,
   - CRLF and LF split rows outside quotes,
   - doubled quotes inside quoted cells unescape to one quote,
   - embedded tabs/newlines inside quoted cells are preserved.
4. Drop a final trailing empty row when it exists only because the clipboard
   text ended in a row delimiter.
5. Preserve empty cells inside the matrix. Empty string is a valid pasted value.

The existing `normaliseClipboardPayload` has a private TSV parser for
TSV-to-HTML normalization. v0.4 should either promote that parser to a named
React-internal helper or replace it with one shared by copy normalization and
paste.

## Target Resolution

Anchor paste at:

1. the active range's top-left cell when a valid range exists,
2. otherwise the active cell,
3. otherwise no-op.

Rows and columns follow current resolved order:

- hidden columns are excluded because they are absent from `resolvedColumns`,
- pinned columns keep their resolved order and are not duplicated,
- group/detail rows are not writable targets,
- out-of-bounds cells are truncated, not wrapped.

If every parsed cell is out of bounds or non-writable, return without firing
commit events and announce a no-op.

## Value Pipeline and Editability

For each target cell:

1. Resolve the data row and column.
2. Skip group rows and synthetic detail/group/selection columns unless a column
   explicitly has an editable source.
3. Require `column.editable === true` or `column.editable(row) === true`.
4. Respect `rowIsDisabled(row)` as read-only.
5. Parse:
   - if `column.valueParser` exists, call `valueParser(input, row)`;
   - otherwise use the raw input string.
6. Validate with `column.validate(nextValue, row, signal)` using the same
   semantics as the editing controller, including async validation.
7. Build a batch of edit commits only after every parse/validation succeeds.

Parser exceptions should be treated as validation failures. The user should get
one failure summary; no partial updates should be applied.

## Atomic Commit

Paste must be all-or-rollback:

- collect every target, parsed value, validation result, and would-be edit event
  before mutating overlay/data state;
- if any target fails parse, editability, validation, or server preflight, abort
  the full batch;
- if all targets pass, apply one batch update and fire per-cell
  `onCellEditCommit` events in row-major order;
- after per-cell events settle, fire `onRangePasteCommit` once.

If any consumer `onCellEditCommit` promise rejects during commit, use the same
rollback policy as normal editing. v0.4 should keep batch rollback conservative:
failed async consumer commit means the whole paste should surface as rejected
instead of leaving some overlay values committed and some reverted.

## Server Grid Implications

`<BcServerGrid>` should delegate paste through the underlying client grid for
loaded rows only:

- no automatic server block fetches,
- no paste across unloaded rows,
- no inferred patch shape beyond existing `onCellEditCommit` /
  `onServerRowMutation`,
- invalidation / refresh remains consumer-owned.

For server grids with managed mutations, paste should queue one mutation per
cell or per row only after all client-side parse/editability/validation checks
pass. A future server batch API can optimize transport, but v0.4 should prefer
correct rollback semantics over transport batching.

## Fill Handle Dependency

Fill handle should not be implemented in the paste PR. It should reuse the
same pure helpers for:

- target matrix/range clipping,
- editability filtering,
- valueParser/validate,
- atomic batch commit,
- validation error reporting.

The fill PR only adds source-pattern generation and pointer/preview UI on top.

## Implementation Order

1. Promote/create pure helpers:
   - parse TSV to matrix,
   - resolve paste anchor,
   - clip matrix to resolved rows/columns,
   - classify target cells as writable/read-only/skipped.
2. Add focused unit tests for each helper.
3. Add React paste wiring for Ctrl/Cmd+V and context menu paste if the command
   is already exposed.
4. Route parsed targets through the existing edit validation pipeline.
5. Add `onBeforePaste` / `onRangePasteCommit` types and docs.
6. Coordinator-owned browser validation: Excel, Google Sheets, Numbers or
   LibreOffice TSV, pinned columns, filtered rows, server grid loaded rows.

## Risks

- Existing edit commit is per-cell. Batch rollback must not create a second
  divergent commit path.
- Async validation can race with data changes; use abort/cancellation semantics
  matching the editing controller.
- Non-editable cells inside a larger paste are easy to misread. v0.4 should
  abort the full paste with a clear reason rather than silently skip them.
- Copy uses formatted values; paste through TSV may not be lossless until a
  bc-grid custom MIME type lands.
- Context-menu paste needs browser permission handling and should fail softly
  when clipboard read is unavailable.

## Focused Test Targets

- TSV parser: quoted tabs/newlines, CRLF, doubled quotes, trailing row
  delimiters, empty cells.
- Anchor: active range top-left wins over active cell; stale range falls back
  to active cell.
- Clipping: hidden columns excluded; pinned order preserved; bounds truncation
  counted.
- Editability: group rows, disabled rows, read-only columns, synthetic columns.
- Atomicity: any parse/validation failure prevents every commit.
- Server grid: loaded rows only; mutation hooks not called when validation
  fails.
