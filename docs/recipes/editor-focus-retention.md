# Editor Focus Retention on Re-render

When an editor is mounted (the user is typing into an editor input), focus stays on the input across grid re-renders for unrelated reasons — a `data` prop swap, an unrelated state change, a server-grid re-fetch. The user's typing flow is not interrupted.

This is a contract pinned by source-shape regression guards in `packages/react/tests/editorFocusRetention.test.ts`. The contract is:

1. **`EditorMount`'s mount/unmount `useLayoutEffect` deps array excludes `rowEntry.row`, `column.source`, `initialValue`** — values that change identity on every server-grid re-fetch. Including them in the deps would re-fire the effect's cleanup, dispatching `unmounted` and triggering a spurious scroll-out commit. (This is exactly the bsncraft 0.5.0 GA P0 #451 regression — the fix is in `editorPortal.tsx`.)
2. **The cleanup reads those values from refs at cleanup time** so it sees the latest values without forcing the effect to re-run.
3. **`<EditorMount>` is rendered without an unstable `key` prop** so React reconciles it across parent re-renders by position. Adding `key={rowId}` (or any value that changes per-render) forces React to unmount + remount the editor on every render → focus drop.

Together these three guarantee that React keeps the same DOM input across re-renders, and the browser preserves focus on a continuously-mounted DOM element.

## What's covered

- Server-grid re-fetch (every `loadPage` / `loadBlock` resolution) — `data` swaps but the editor stays mounted.
- Unrelated state changes in the parent (toast renders, sidebar toggles, etc.) — propagates through `<BcGrid>` re-render but doesn't touch the editor.
- Selection / range changes that don't intersect the editing cell.
- Layout-state changes (column reorder, sort flip) for columns OTHER than the editing one.

## What's NOT covered

- **External code calling `.focus()` or `.blur()`** on a different element. Toasts that grab focus, modals that auto-focus their first input, scroll-into-view side effects from `apiRef.current?.scrollToCell(...)` — those are out-of-band focus moves the framework can't intercept. Consumer's responsibility to either avoid them while editing or restore focus afterward.
- **Editing cell scrolls out of viewport.** When the editing row leaves the virtualizer's render window, the cell DOM unmounts. The editor's `editScrollOutAction` (default `"commit"`) decides what happens — focus moves to the grid root. Set `editScrollOutAction="cancel"` if you want to discard the in-flight edit instead.
- **Column reorder where the editing column moves position.** The column's React element identity changes → editor unmounts. Bind `editorActivation` to user gestures only and discourage column reorder during edits.

## Verifying

If you suspect a regression in your own consumer, run:

```bash
bun test packages/react/tests/editorFocusRetention.test.ts
```

The tests fail loudly if `editorPortal.tsx`'s deps array shape drifts. Behavioural verification (the user's focus actually stays on the input through a forced re-render) lives in `apps/examples/tests/editor-focus-retention.pw.ts` and runs via Playwright at merge.

## When extending

If you add a new effect to `EditorMount` that needs to fire on data changes, route it through a SEPARATE `useEffect` / `useLayoutEffect` — do NOT add `rowEntry.row` / `column.source` / `initialValue` to the existing mount-effect deps. Use the cleanup-time refs (`cleanupRowRef`, `cleanupColumnSourceRef`, `cleanupInitialValueRef`) for any read-during-cleanup needs.

If you add a new path that conditionally wraps `<EditorMount>` (e.g. a new portal mode), avoid `key={...}` props that change per-render. Position-based reconciliation is what protects focus.
