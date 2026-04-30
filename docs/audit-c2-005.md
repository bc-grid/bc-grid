# audit-c2-005

**Author:** c2 (coordinator/auditor)
**Date:** 2026-04-30
**Snapshot:** `origin/main` at `2597afb` (after #62 merged)
**Predecessor:** [audit-c2-002](./audit-c2-002.md) — last code-level audit ran on the post-Phase-A snapshot at `7506979`.

This audit covers the 13 implementation merges + 6 RFC merges that landed since #55 (audit-c2-002):

| Merged since #55 | PR | Summary |
|---|---|---|
| Bundle-size CI gate | #59 | Adds 60KB combined-package gate, 5% regression allowance |
| Server-paged impl | #60 | `BcServerGrid rowModel="paged"` with abort-on-supersede + dedup |
| Smoke perf gate | #62 | cold-mount / sort / scroll-FPS smoke perf in CI |
| Search highlighting | #64 | `<mark>` highlighting in default cell renderer |
| Tooltip rendering | #69 | Portal-rendered tooltip on cell hover/focus |
| Row-select keyboard | #71 | Space-toggles-row keyboard parity |
| CSV export | #72 | `toCsv` serializer; `escapeCsvCell` quotes-on-special-chars |
| LocalStorage persistence | #73 | `gridId` triggers `bc-grid:{gridId}:{state}` writes (debounced 500ms) |
| XLSX export | #75 | `toExcel` peer-dep on ExcelJS; native numFmt on numeric/date cells |
| PDF export | #77 | `toPdf` peer-dep on jsPDF; A4 landscape with paged header repeat |
| Multi-col sort UI | #78 | Shift/Cmd+click append/remove; sort-order index visible |
| Selection checkbox column | #79 | Pinned-left synthetic `__bc-grid-selection__` column |
| Queue-sync coordination | #80 | Tags reflecting all merges + salvages |
| 6 RFCs | #46/48/49/51/52/53 | Track 5/6/2/4/4/7 design docs |

Health metrics at this snapshot:
- 218 unit tests, 673 expects, all pass in 576ms.
- 8 e2e .pw.ts files in `apps/examples/tests`.
- `bun run lint` clean (Biome 117 files).
- `bun run type-check` 0 fail.
- `bun run api-surface` 9 enforced + 3 planned packages clean.
- `bun run bundle-size` 0 over budget; combined react+virtualizer+animations+core = ~26.8 KiB / 60 KiB budget.
- `bun run test:smoke-perf` (locally, not CI): cold-mount 4.40ms / 200ms; sort 11.60ms / 50ms; scroll 60.04 fps / 58 fps. Comfortable margins.

---

## Findings

### F1 — High — `pageSize` and `groupBy` writes never persist

`packages/react/src/grid.tsx:155-170`. The grid hydrates `defaultPageSize` and `defaultGroupBy` from localStorage via `persistedGridState`, but the `useControlledState` calls discard the setters:

```ts
const [columnState, setColumnState] = useControlledState<...>(...)  // setter captured ✓
const [groupByState] = useControlledState<...>(...)                  // setter discarded ✗
const [pageSizeState] = useControlledState<...>(...)                 // setter discarded ✗
```

The persistence writer (`usePersistedGridStateWriter`) does run on every render with the current `groupBy`/`pageSize` values, but those values can only change via consumer-controlled props (`props.pageSize` / `props.groupBy`). The grid itself has no chrome for changing them at v1, so the state never mutates — meaning persistence never roundtrips for these fields.

**Why this is "high" not "blocking":** the read-on-mount path works (so a consumer that controls these props from outside sees the persisted defaults), but the typical user expectation is "I changed the page size, it should remember next reload" — that doesn't work without chrome (Track 5 sidebar / pagination control), and once chrome lands the setters need to be wired through.

**Action:** when Track 5 chrome lands, add `setGroupByState` and `setPageSizeState` setters and wire them through `BcGridApi.setPageSize(n)` / `setGroupBy(cols)` so the chrome can mutate them. Track in `queue.md` under `chrome-pagination` and `chrome-groupby-control`. Until then, the persistence layer for these fields is "load only".

### F2 — Medium — Cross-tab persistence is silent last-writer-wins

`packages/react/src/persistence.ts`. `readPersistedGridState` runs once via `useMemo([gridId])`. There's no `storage` event listener, so Tab A writing `{density: "compact"}` doesn't update Tab B's grid — Tab B will continue with its earlier loaded state, then when its own debounce fires, write its own value back, silently overwriting Tab A's change.

**Action:** non-blocking. Two options post-v1:
- (a) Listen for `window.addEventListener("storage", ...)` and rehydrate on cross-tab updates. Adds ~30 lines.
- (b) Add per-write timestamps and conflict-resolve on read.
- (c) Document the limitation. v1 ships with (c); track (a) as a queue follow-up.

### F3 — Medium — Search-highlight allocates per-cell on every render even when `searchText` is empty

`packages/react/src/bodyCells.tsx:132`:

```tsx
{column.source.cellRenderer
  ? column.source.cellRenderer(params)
  : highlightSearchText(formattedValue, searchText)}
```

When `searchText === ""`, `splitSearchText` early-returns `[{ match: false, text: value }]` and `.map` re-allocates a single-element array. For a 30-col × 50-row visible window, that's ~1500 redundant array allocations per render with no behavioural effect. Smoke perf hasn't flagged it yet (60 fps holds), but it's wasteful and shows up under React profiler when scrolling fast.

**Action:** branch at the call site:

```tsx
{column.source.cellRenderer
  ? column.source.cellRenderer(params)
  : searchText
    ? highlightSearchText(formattedValue, searchText)
    : formattedValue}
```

Should be a one-line edit. Apply it before the next `audit-c2-006`.

### F4 — Medium — `BcGridTooltip` clones the child element and silently overwrites event handlers

`packages/react/src/tooltip.tsx:83-106`. When `column.tooltip` is set, the wrapper does `cloneElement(onlyChild, { onPointerEnter, onPointerLeave, onFocus, onBlur, ref })`. It chains the existing handlers manually:

```tsx
onPointerEnter(event) {
  childProps.onPointerEnter?.(event)
  setOpen(true)
},
```

This works for the four hard-coded events the tooltip needs. But the tooltip is composed *outside* the `<div className="bc-grid-cell">` — it wraps the cell. So if a custom cell renderer (`column.source.cellRenderer`) returns its own root element with its own handlers, those continue to run unchanged (the wrapper sits one level up). However, the wrapped root element receives an injected `ref` that overwrites any `ref` the consumer attached. This is not surfaced anywhere.

**Action:** non-blocking for v1 (cellRenderers don't typically attach refs to their wrapper, and the visible cell content is rendered as the child of `<BcGridTooltip>` — but tooltip itself wraps the *whole cell*, including the `<div className="bc-grid-cell">`). Two follow-ups:
- (a) Use `mergeRefs` / `useComposedRef` so consumer-supplied refs aren't dropped.
- (b) Document the contract in api.md: "BcGridColumn.tooltip wraps the cell; if your cellRenderer attaches a ref to the cell root, that ref will be replaced."

Track as `tooltip-ref-merge` in queue.md.

### F5 — Medium — Server-row-model `getModelState` derives selection from `undefined`

`packages/react/src/serverGrid.tsx:288-298`. Inside `usePagedServerState`'s `getModelState`:

```ts
() => modelRef.current.getState({
  mode: props.rowModel,
  rowCount,
  selection: toServerSelection(undefined, view),  // ← always empty
  view,
  viewKey: result?.viewKey ?? viewKey,
})
```

The selection is hard-coded to `undefined`, which means `getServerRowModelState()` never reflects the actual `BcSelection` state from the grid api. The outer `BcServerGrid.getServerRowModelState()` overrides this correctly:

```ts
selection: toServerSelection(gridApiRef.current?.getSelection(), paged.view),
```

But anyone calling `paged.getModelState()` directly (currently nobody, but the function is exported via `usePagedServerState`'s return shape and could be) would see an empty selection.

**Action:** non-blocking. Either:
- (a) Remove `getModelState` from the inner controller's return shape and force callers to go through `BcServerGrid.getServerRowModelState()`. Cleaner.
- (b) Pass a `selection` parameter through `getModelState({ selection })`.

Track as `server-paged-getstate-cleanup`.

### F6 — Low — Auto-filter range warning on Excel export when no rows

`packages/export/src/index.ts:81-87`. `worksheet.autoFilter = { from: {row:1, column:1}, to: {row:1, column: visibleColumns.length} }` is set unconditionally when headers are included, even if `rows = []`. ExcelJS handles this fine, but the resulting workbook has an autoFilter region pointing at the (empty) header row only. It's not strictly a bug — Excel users see a filterable header row but nothing to filter — but it's mildly weird.

**Action:** non-blocking. Either guard the `autoFilter` assignment behind `rows.length > 0`, or accept it as Excel's own behaviour.

### F7 — Low — `localstorage-gridid-persistence` writes on every render commit

`packages/react/src/persistence.ts:51-61`. `usePersistedGridStateWriter` runs `useEffect` with `[gridId, state]` deps; every state change (in particular `density` toggling, `columnState` resize/reorder, etc.) re-fires the effect, scheduling a 500ms debounced write.

When `state` is the recompiled object `{ columnState, density, groupBy, pageSize }`, the **identity changes every render** because `persistenceState` is a `useMemo` that depends on `[density, groupByState, pageSizeState, persistedColumnState]`. So `state` IS stable when the values are stable. Good — but the deps array `[gridId, state]` should also be `[gridId, state]` not `[gridId, ...individualFields]`.

Actually, looking again: line 60 `[gridId, state]` is correct because `state` is memoised. The effect doesn't re-fire spuriously. **No bug.** Just noting that this depends on the upstream `useMemo` keeping `state` referentially stable.

### F8 — Low — Tooltip portal renders outside `.bc-grid` so theming tokens don't apply

`packages/react/src/tooltip.tsx:112-124`. The tooltip renders into `document.body` via `createPortal`. The CSS class `.bc-grid-tooltip-content` applies, but the CSS variables defined on `.bc-grid` (e.g. `--bc-grid-bg`, `--bc-grid-border`) are out of scope because the portal target is `document.body`, not inside the grid.

The current tooltip CSS uses shadcn-token fallbacks (`hsl(var(--popover, var(--background, ...)))`) which **do** resolve at the document root since shadcn tokens are typically declared on `:root` in a host app. So in a shadcn host app, this works.

But in a non-shadcn host (a "raw" embedding of bc-grid that only sets `.bc-grid` tokens), the tooltip will appear with the fallback hardcoded values (`hsl(214 32% 91%)` border, `hsl(0 0% 100%)` background) regardless of the grid's theme.

**Action:** non-blocking for v1 (audit-c2-004 explicitly recommends shadcn-first hosting). Two long-term options:
- (a) Render the tooltip inside the grid root (positioned absolutely with `position: fixed`) and forgo `document.body` portal. Simpler theming, but z-index battles with consumer-rendered content.
- (b) Have `BcGridTooltip` accept a `themeRoot` ref or include `.bc-grid` className on the portal element so token scoping works.

Track as `tooltip-themed-portal`.

### F9 — Low — Selection-checkbox column uses a non-namespaced columnId

`packages/react/src/selectionColumn.tsx`. The synthetic column gets `columnId: "__bc-grid-selection__"`. Other internal columns (the `groupBy` synthetic from Track 0 group-by-client; potential pivot row-header columns from Track 4) will need similar slots. If this convention isn't documented, future work will collide.

**Action:** non-blocking. Document in api.md the reserved-prefix convention `__bc-grid-*__` for synthetic columns. Add to `BcGridColumn` JSDoc: "consumer columns must NOT use a `columnId` starting with `__bc-grid-`."

### F10 — Low — `__bcGridPerf` window globals are typed but not enforced

`apps/benchmarks/tests/smoke-perf.smoke.pw.ts:7-16` declares the global, and `apps/benchmarks/src/main.ts` populates it. There's no runtime guard that prevents the smoke harness from loading the wrong app (e.g. `apps/examples` instead of `apps/benchmarks`). If someone re-points the smoke perf URL to the examples app, the test would silently fail at the `page.evaluate(() => window.__bcGridPerf.mountGrid())` line with "undefined" — which would surface as a perf-bar violation rather than a setup error.

**Action:** non-blocking. Add a clear assertion in the test setup: `expect(typeof window.__bcGridPerf?.mountGrid).toBe("function")` before the perf measurement, with a message explaining that the benchmarks app must be loaded.

---

## Cross-package boundary check

| Package | Imports from |
|---|---|
| `@bc-grid/core` | Nothing |
| `@bc-grid/virtualizer` | Nothing |
| `@bc-grid/animations` | Nothing |
| `@bc-grid/theming` | Nothing |
| `@bc-grid/aggregations` | (planned) `@bc-grid/core` |
| `@bc-grid/filters` | (planned) — empty |
| `@bc-grid/editors` | (planned) — empty |
| `@bc-grid/enterprise` | (planned) — empty |
| `@bc-grid/server-row-model` | `@bc-grid/core` ✓ |
| `@bc-grid/export` | `@bc-grid/core` ✓ |
| `@bc-grid/react` | `@bc-grid/core`, `@bc-grid/virtualizer`, `@bc-grid/animations`, `@bc-grid/server-row-model` ✓ |

No layering cycles. `react` depends on engines (correct); engines depend on `core` (correct); `core` is a leaf (correct). Pivot-rfc's pinned split (BcPivotedDataDTO in core, engine internal Map in `@bc-grid/aggregations`) is consistent with this.

---

## API surface vs. manifest

`bun run api-surface` reports clean. No drift since #55. Manifest entries that lag actual code:

- `@bc-grid/aggregations` mode is `planned` but the package has no source yet. OK.
- `@bc-grid/filters` mode is `planned` but the package has no source yet. OK.
- `@bc-grid/editors` and `@bc-grid/enterprise` are `enforced` with empty exports. OK (matches "reserved" status).
- `@bc-grid/export` declarationExports are `["ExportOptions", "ExportResult", "toCsv", "toExcel", "toPdf"]` and runtimeExports are `["toCsv", "toExcel", "toPdf"]`. All three serializers are implemented as of #75/#77. **Note** for queue.md: the manifest `note: "CSV is implemented for Q1; XLSX and PDF exports are reserved stubs until their follow-up tasks."` is now stale. Update in next PR.

### Action: F11 — refresh `tools/api-surface/src/manifest.ts` export note

Single-line edit. Could be bundled into a `queue-sync-c2-005` PR or the next pass.

---

## Test-coverage gaps (informational, full punchlist in `docs/coordination/test-coverage-punchlist.md` — to be authored)

Missing e2e coverage:
- **Tooltip a11y**: no test verifies `aria-describedby` wires up correctly; `tooltips.pw.ts` covers hover/focus open/close but not keyboard escape, not multiple tooltips coexisting, not tooltip + active-cell focus interaction.
- **Search highlighting**: no e2e at all. The unit test in `searchHighlight.test.tsx` covers `splitSearchText` correctness; no test verifies the `<mark>` element actually renders in the DOM under a real grid mount.
- **Row-select keyboard**: unit-test coverage in `keyboard.test.ts` is good; no e2e (no `row-select-keyboard.pw.ts`).
- **LocalStorage persistence cross-render**: `persistence.pw.ts` exists but I haven't verified what it covers; if it only tests one-shot writes, the multi-state-change debounce path (write-delete-write) is untested.
- **Server-paged**: the engine has 4 unit tests in `serverRowModel.test.ts`; no integration test for `<BcServerGrid>` itself + a fake `loadPage`. Adding one with deterministic abort sequencing would catch regressions in the dedup/abort logic.
- **CSV/XLSX/PDF exports**: 8 unit tests cover CSV serialization. XLSX has no tests — `toExcel` is invoked but the buffer's content isn't asserted against a fixture. PDF likewise.

---

## Recommended next-pass actions (priority order)

| # | Action | Owner | Effort |
|---|---|---|---|
| 1 | F3 — fix `searchText` empty-string allocation in `bodyCells.tsx` | any | XS (1 line) |
| 2 | F11 — refresh manifest export note for `@bc-grid/export` | any | XS |
| 3 | F1 — when `chrome-pagination` lands, wire `setPageSizeState` / `setGroupByState` setters | Track 5 owner | included in chrome impl |
| 4 | F4 + F8 — combined "tooltip-portal-polish" task: merge consumer ref + theme tokens via portal | Track 0 follow-up | S |
| 5 | F5 — drop `getModelState` from `usePagedServerState` return shape | server-row-model owner | XS |
| 6 | F6 — guard Excel autoFilter behind `rows.length > 0` | x2 | XS |
| 7 | F9 — document `__bc-grid-*__` reserved column-id prefix | any docs PR | XS |
| 8 | Test-coverage punchlist: file `docs/coordination/test-coverage-punchlist.md` covering the 6 e2e gaps above | c2 | M |
| 9 | F2 — cross-tab `storage` event listener (post-v1) | post-v1 | S |
| 10 | F10 — assert `__bcGridPerf` global before perf measurements | any | XS |

None of these are v1-alpha blockers per `docs/coordination/v0.1-alpha-release-plan.md`. They are quality-of-life fixes that should be scheduled into queue.md follow-up tasks, not gates on the alpha release.

---

## What's strong

For the record, what landed in this batch is solid and below the bar shouldn't be hidden by the findings list above:

1. **Server-paged impl (#60)**: 587 lines, clean dedup-by-blockKey, AbortController-per-request, in-flight reuse, correct cleanup on unmount. Engine is JSON-clean (`toMap()` for state snapshot). Tests cover dedup + abort.
2. **Multi-col sort (#78)**: 314 lines, post-#50 file structure, no shortcuts. Live-region announcement correctly identifies which column changed (not always sortState[0]). 5/5 e2e pass.
3. **Selection-checkbox (#79)**: synthetic column rebuilt every render to capture live state — correct invalidation pattern. 7/7 e2e pass. Persistence correctly excludes the synthetic column.
4. **Tooltip (#69)**: portal-based, listens to `resize` + `scroll` for repositioning, reduced-motion media query honoured.
5. **Persistence (#73)**: defensive parsing per field with type-validators, debounced writes, SSR-safe storage detection.
6. **CSV/XLSX/PDF (#72/#75/#77)**: peer-dep architecture for XLSX/PDF keeps the bundle clean. CSV escaping handles delimiters, quotes, newlines, leading whitespace. XLSX uses native numFmt (so spreadsheet users get re-editable numbers, not text).
7. **All 6 RFCs** landed with substantive cross-RFC alignment fixes (chrome ↔ aggregation; range ↔ virtualizer; pivot ↔ core layering; charts ↔ subscribe primitive). Implementers have actionable contracts.

The codebase is in good shape entering v0.1-alpha. The findings above are normal quality polish, not architectural debt.
