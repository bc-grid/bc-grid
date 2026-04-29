# Audit c2-003 — production-readiness audit

**Auditor:** c2 (Claude on `bcg-worker4`)
**Date:** 2026-04-30
**Scope:** Walk every package in `packages/`, identify what is **not production-grade** if v1.0 shipped today. Compares the public surface declared in `api.md` against the implementation on `origin/main`.
**Validation:** clean checkout green — `bun install`, `bunx tsc -b --clean`, `bun run type-check`, `bun run lint`, `bun run test` (172 unit), `bun run api-surface`.

This audit complements `audit-c2-001.md` (cross-doc / manifest drift) and `audit-c2-002.md` (post-Phase-A code review). This one is harsher: it asks "if a paying customer used this today, what would break or surprise them?"

---

## Methodology

1. Read every `packages/*/src/*` file end-to-end (~4,900 LoC of production code).
2. Spot-checked `apps/examples/src/App.tsx` and the e2e suites (`apps/examples/tests/*.pw.ts`).
3. Cross-referenced declared `BcGridProps` / `BcGridApi` / `BcServerGridProps` surface against the actual code paths that consume each prop.
4. Test inventory: counted unit + e2e tests per package and compared to `design.md §14.1` coverage gates.
5. Read the `tools/api-surface/src/manifest.ts` to identify "planned" vs "enforced" packages — six packages are still `planned`.

---

## Headline finding

**The bc-grid v0.1 public API surface is wider than its implementation.** Many props on `BcGridProps`, `BcServerGridProps`, `BcEditGridProps`, and `BcGridApi` are typed-and-frozen but unwired — passing them silently does nothing. Six declared packages are pure placeholder files. The `BcServerGrid` component is functional only in `paged` mode; `infinite` and `tree` modes return zero rows and stay permanently in loading state.

If a v1.0 release shipped today, **a consumer building against the documented API would discover broken behaviour at runtime** for: pagination, grouping, expansion, search, server-infinite, server-tree, aggregations, exports, editors, filter UIs beyond text/contains, tooltips, custom date patterns, currency locale resolution, multi-column sort UI, and `aria-disabled` rows.

**The current main is v0.1-alpha quality.** It validated the architecture (Q1 gate cleared via #42 AR Customers demo) — but the gap from "architecture validates" to "ship v1.0" is the in-flight v1 parity sprint (Phase 6 Tracks 0-7). Until those merge, calling this v1.0 would create real consumer surprises.

---

## Findings (severity-tagged)

Severity legend: **H** = production-blocking for v1.0 release; **M** = declared-but-unwired surface (typed prop / method does nothing); **L** = quality / style / coverage.

### H1 — `BcServerGrid` is a paged-only stub

`packages/react/src/serverGrid.tsx`:
- `infinite` and `tree` modes return **zero rows**: `serverRows()` line 108: `return []`. (`paged` mode reads `props.initialResult?.rows ?? []`.)
- `loading` is **forced true** for any non-`paged` mode: line 101: `loading={props.loading ?? props.rowModel !== "paged"}`. Combined with empty rows, the component is a permanent loading overlay.
- `invalidateServerRows(_invalidation)` is **`{}`** — empty no-op (line 80).
- `retryServerBlock(_blockKey)` is **`{}`** — empty no-op (line 81).
- `refreshServerRows()` aliases to `gridApiRef.current?.refresh()` — doesn't refetch / purge cache (line 77-79).
- `getServerRowModelState()` returns a synthesised state with hardcoded `viewKey: "react-scaffold"` (line 141).
- `loadPage` / `loadBlock` / `loadChildren` props are typed (`api.md §5.3`) but **never invoked** anywhere in the codebase.
- `view: createServerViewState(visibleColumns, locale)` always returns `{ groupBy: [], sort: [], visibleColumns, locale }` — never reflects actual sort / filter / group state.
- Type cast `as unknown as BcGridProps<TRow>` (line 95) papers over a real typing gap between server-grid props and base-grid props.

**Severity: H** — the `<BcServerGrid>` component is the v1 Q4 deliverable's entire React surface. Today it ships in the package but only `paged` mode does anything useful, and even that mode is one-shot (renders `initialResult` and never refetches).

### H2 — `BcGridApi.expandAll()` and `collapseAll()` are empty no-ops

`packages/react/src/grid.tsx:391-392`:
```ts
expandAll() {},
collapseAll() {},
```

Per `api.md §6.1` these are public methods. Calling them produces no error, no behaviour, no warning. Consumer using `apiRef.current?.expandAll()` for grouped / tree data sees nothing happen.

**Severity: H** — silently-broken public API method.

### H3 — Six packages are pure placeholders

Each is a 1-line file:
- `packages/aggregations/src/index.ts` → `// @bc-grid/aggregations — placeholder`
- `packages/editors/src/index.ts` → `// @bc-grid/editors — placeholder`
- `packages/enterprise/src/index.ts` → `// @bc-grid/enterprise — placeholder`
- `packages/export/src/index.ts` → `// @bc-grid/export — placeholder`
- `packages/filters/src/index.ts` → `// @bc-grid/filters — placeholder`
- `packages/server-row-model/src/index.ts` → `// @bc-grid/server-row-model — placeholder`

All six are listed in `tools/api-surface/src/manifest.ts` with `mode: "planned"` so CI doesn't fail. But:
- `api.md §9` declares public exports for each (`sum`/`count`/`avg`/etc. for aggregations; `textFilter`/`numberFilter`/etc. for filters; `toCsv`/`toExcel`/`toPdf` for export; `createServerRowModel` etc. for server-row-model).
- The `tools/api-surface` tool's `planned` mode prevents drift errors but doesn't surface to consumers that the package is empty.
- A consumer running `bun install @bc-grid/filters` and `import { textFilter } from "@bc-grid/filters"` gets a TypeScript error AND a runtime error — the import doesn't exist.

**Severity: H** — six packages declared as v0.1 surface but ship zero implementation. Either they need to be removed from the documented v0.1 surface, or the v1 parity sprint Tracks 4 (aggregations + pivots), 6 (filters + export), Q2 (editors), and Q4 (server-row-model) need to ship before v1 release.

### H4 — Filter matcher silently filters out all rows on unrecognised filter shapes

`packages/react/src/filter.ts:42-47`:
```ts
function matchesColumnFilter(formattedValue: string, filter: ServerColumnFilter): boolean {
  if (filter.type !== "text") return false
  if (filter.op !== "contains") return false
  ...
}
```

If a consumer uses the controlled `filter` prop with anything other than `{ type: "text", op: "contains" }` — e.g., the `number`, `date`, `set`, `boolean`, or `custom` filter types declared in `api.md §1.2` — `matchesColumnFilter` returns `false` for every row, and the grid silently filters out all rows.

No console warning. No fallback. No grace period. The grid just goes empty.

**Severity: H** — silent footgun. Either the matcher should fall through to "match" for unsupported types (with a console.warn), or the type system should constrain `BcColumnFilter.type` to only `"text"` until the other types ship. Today it's the worst of both worlds.

---

### M1 — Many `BcGridProps` are typed but no code consumes them

Searching `grep "props\.<prop>"` across `packages/react/src/`:

| Prop | Declared in | Status | Effect of using it |
|---|---|---|---|
| `pagination`, `pageSizeOptions` | `api.md §5.1` | Never read | No-op |
| `groupableColumns`, `groupsExpandedByDefault` | `api.md §5.1` | Never read | No-op |
| `expansion`, `defaultExpansion`, `onExpansionChange` | `api.md §3.2` | Never read | No-op |
| `groupBy`, `defaultGroupBy`, `onGroupByChange` | `api.md §3.2` | Never read | No-op |
| `page`, `pageSize`, `defaultPage`, `defaultPageSize`, `onPaginationChange` | `api.md §3.2` | Never read | No-op |
| `gridId` | `api.md §3.3` | Used for DOM-base-id only — `localStorage` persistence per §3.3 not implemented | Partial |

13 controlled-state pairs and behaviour props are declared in the v0.1 frozen surface but completely unwired. The surface has been frozen with the implementation lagging behind.

**Severity: M** — the type system promises something the runtime doesn't deliver. Documentable / fixable per the v1 parity sprint Phase 5.5 + Phase 6 Track 0 tasks (column-state-url-persistence, search-complete, group-by-client, pagination-client-ui — all currently `[ready]` in queue.md).

### M2 — `column.tooltip` declared but never rendered

`packages/react/src/bodyCells.tsx` doesn't read `column.source.tooltip`. The `tooltip?: string | ((row) => string | undefined)` declared on `BcGridColumn` (api.md §1.1) is silently ignored.

Phase 5.5 task `tooltip-rendering` ([ready] in queue.md) covers this.

### M3 — `searchText` controlled-state passes through but doesn't filter

`grid.tsx:643` passes `searchText` to `BcCellRendererParams.searchText` (so cell renderers can highlight matches). But the filtering per `api.md §4.3` ("matched against the search by joining `formattedValue` for each searchable column. Matching is case-insensitive substring by default") is **not implemented**. Setting `searchText="foo"` on the grid does nothing to row visibility.

Phase 6 Track 0 task `search-complete` ([ready]) covers this.

### M4 — Default cell renderer doesn't highlight search matches

`bodyCells.tsx:122` returns `formattedValue` raw. Per `api.md §4.3`: "The default renderer (when `cellRenderer` is omitted) handles highlighting automatically." It doesn't.

Phase 5.5 task `search-highlighting` ([ready]) covers this.

### M5 — Assertive live region rendered but unwired

(Already documented as `audit-c2-002 §F1`.)

`grid.tsx:688-694` renders the assertive `<div>` per `accessibility-rfc §Live Regions`, but `useLiveRegionAnnouncements` (`gridInternals.ts:436-512`) only returns `{ politeMessage, announcePolite }`. No `announceAssertive` plumbing. The DOM is correct; the announce path is missing.

Folded into the `editor-framework` task description in #54 (queue-sync-2).

### M6 — `aria-disabled` not rendered on rows

`accessibility-rfc §VirtualRowA11yMeta.disabled` declares a `disabled` flag on row metadata. Today no `BcGridProps.rowIsDisabled` predicate exists; only `rowIsInactive` (which filters rows out, not disables them visually + interactively).

Phase 5.5 task `aria-disabled-rows` ([ready]) covers this.

### M7 — `BcEditGrid.onCellEditCommit` typed but unused

The component declared in `editGrid.tsx` uses no editor framework — no in-grid editing exists at v0.1. Consumers passing `onCellEditCommit` get no callbacks because no edit-commit path fires.

Track 1 (editing-rfc, merged in #45 + impl tasks `[ready]`) addresses this.

### M8 — `BcEditGrid.DeleteIcon` typed but unused

`types.ts:133` declares `DeleteIcon?: ComponentType<{ className?: string }>` but `editGrid.tsx` never reads it. The actions column renders `action.icon` per-action (which works), but the prop-level `DeleteIcon` for the default delete action is unwired.

### M9 — Filter input placeholder hardcoded English "Filter"

`packages/react/src/headerCells.tsx:205`: `placeholder="Filter"`. Not localised. Bypasses `BcGridMessages`. Should be `messages.filterPlaceholder` (which doesn't exist on the messages type either).

Phase 6 Track 6 (filter-registry-rfc impl tasks) covers richer filter UI; this should be folded in.

### M10 — Filter input style hardcodes light-mode colour fallbacks

`headerCells.tsx:213-224` inlines:
```ts
border: "1px solid hsl(var(--border, 220 13% 91%))",
background: "hsl(var(--background, 0 0% 100%))",
```

The fallbacks `220 13% 91%` (light grey) and `0 0% 100%` (white) lock to a light theme if the consumer's CSS variables aren't set. Dark-mode renders break for consumers who haven't fully wired shadcn tokens.

Should be a CSS class with proper variable fallback chain.

### M11 — Filter cell `aria-rowindex` numbering

(Already addressed by `audit-c2-001` + #39.) The filter row counts toward `aria-rowcount`. Per `accessibility-rfc §Row Count`, header rows + footer/status rows count toward the rowcount. Filter row is in the gray area — not header, not data. `grid.tsx:710` adds 2 to `rowEntries.length` (1 for header, 1 for filter). Consistent.

### M12 — `column.format` `pattern` field unused

`packages/react/src/value.ts:59-60`:
```ts
if (format.type === "date") return formatDate(value, locale, { dateStyle: "medium" })
return formatDate(value, locale, { dateStyle: "medium", timeStyle: "short" })
```

Both branches ignore `format.pattern`. The typed-format `{ type: "date"; pattern?: string }` declares the field (api.md §1.2) but the impl never passes it to `Intl.DateTimeFormat` (and `Intl` doesn't take a string pattern; would need a different formatter library — `date-fns` per `design.md §3.3` allowed deps).

Custom date patterns silently dropped at runtime.

### M13 — Virtualizer is recreated on most state changes

`grid.tsx:275-298`:
```ts
const virtualizer = useMemo(() => {
  const next = new Virtualizer({...})
  resolvedColumns.forEach((column, index) => next.setColWidth(index, column.width))
  next.setScrollTop(scrollOffsetRef.current.top)
  next.setScrollLeft(scrollOffsetRef.current.left)
  return next
}, [defaultRowHeight, fallbackBodyHeight, pinnedLeftCols, pinnedRightCols, resolvedColumns, rowEntries.length])
```

The `Virtualizer` class is **mutable by design** — `setScrollTop`, `setRowHeight`, `setColWidth`, `retainRow`, `beginInFlightRow` all mutate. But `useMemo` recreates the entire instance whenever any of 6 dependencies change. **In-flight retention state is lost on every recreation** — a row mid-FLIP-animation has its `inFlightRows` Map zeroed when the virtualizer is rebuilt.

This is both a **perf concern** (allocate a new instance + Fenwick trees + viewport state per change) and a **correctness concern** (animation handoff per `design.md §13` "in-flight retention is reference-counted, idempotent" — but the count goes to zero when the holder is replaced).

**Severity: M** — works in the common case (no animation in flight when state changes) but breaks cleanly at the edges. Refactor: hold the virtualizer in a `useRef`, mutate via setters, request render via the existing `requestRender` callback.

### M14 — Hardcoded `viewportWidth: 800`

`grid.tsx:282` initializes the Virtualizer with `viewportWidth: 800` regardless of the actual viewport. Real width arrives via `useViewportSync` after first render — but the first render uses 800.

Symptom: brief flash on initial mount where columns may render with wrong widths if the actual viewport differs significantly from 800px. Not a regression bug; just sloppy initialization.

---

### L1 — Test coverage well below `design.md §14.1` gates

| Package | Gate | Test files | Tests | Production LoC | Estimated coverage |
|---|---|---|---|---|---|
| `core` | 90% | 0 | 0 | 448 (types-only) | n/a |
| `virtualizer` | 85% | 2 | 12 | ~1,170 | ~70%? math-heavy, well-tested |
| `animations` | 85% | 1 | 3 | ~250 | ~50%? |
| `theming` | 70% | 1 | 1 | ~120 | ~80% (config-only) |
| `react` | 75% | 5 | 18 | ~2,400 | **~10%** unit; ~70% e2e |
| `aggregations` / `editors` / `enterprise` / `export` / `filters` / `server-row-model` | 70% | 0 | 0 | 1 (placeholder) | n/a |

`react`'s 5 unit-test files cover ~213 lines of utility logic (sort, columnResize, filter, selection, keyboard). The 2,109-line component layer (grid.tsx + gridInternals.ts + headerCells / bodyCells / editGrid / serverGrid) has **no direct unit tests**. E2E (~18 tests × 3 browsers) covers integration but not branch coverage.

**Severity: L** — covered indirectly by Phase 5.5 task `react-hooks-unit-tests` (suggested in audit-c2-002). Without unit tests, regression risk is concentrated in the e2e suite, which is slower + more brittle.

### L2 — `bc-grid-link` class on detail-link cells has no theming

`editGrid.tsx:29` outputs `<a className="bc-grid-link">` for the detail-path link column, but `packages/theming/src/styles.css` (built from theming-impl) doesn't define `.bc-grid-link`. Style falls back to browser defaults (blue + underline).

### L3 — `grid.tsx` 697 lines + `gridInternals.ts` 763 lines

(Already documented as `audit-c2-002 §F2`.) Both exceed the ≤400 line guideline from queue.md `grid-tsx-file-split` task. Defensible at current scale; opportunistic cleanup recommended.

### L4 — Currency locale resolution unwired

`api.md §4.2`: "Currency code defaults to `view.locale.currency` if set; otherwise `"USD"`." But `BcGridProps.locale` is a string (`"en-AU"`), not an object — there's no `.currency` field to read. `value.ts:76` defaults to `"USD"` directly.

Either api.md needs to drop the `view.locale.currency` reference, or the impl needs a `BcGridProps.currency` separate prop, or a `view.locale` object overload.

### L5 — `cellRenderer` identity-stability warning not enforced

`api.md §1.3` warns: "Memoised internally; identity changes trigger re-render of all cells in the column." The grid does NOT in fact memoise `cellRenderer` — passing a fresh inline function on every render rebuilds the row tree. The api.md claim is aspirational.

Today: not catastrophic (React reconciliation handles it), but the api.md text is inaccurate.

---

## What IS production-grade today

To be fair: a substantial body of code is genuinely solid:

- **`@bc-grid/core`** — pure types, well-organized, comprehensive. v0.1 frozen surface is honoured.
- **`@bc-grid/virtualizer`** — Fenwick offsets, reference-counted in-flight retention, pinned-row + pinned-col support, ARIA metadata input, 60fps perf demonstrated by `apps/benchmarks` 100k×30 e2e + nightly perf harness (#38).
- **`@bc-grid/animations`** — FLIP + flash + slide with budget tracking (default 100, hard cap 200), `prefers-reduced-motion` honored. Spec'd against animation-perf-spike measurements.
- **`@bc-grid/theming`** — CSS variables, Tailwind preset, density tokens (compact/normal/comfortable), forced-colors mode CSS, prefers-reduced-motion CSS. Production-quality.
- **Read-only React grid (the parts that work)** — sort + FLIP animation, single-column keyboard nav (WAI-ARIA grid pattern), pinned columns left + right, scroll-shadow indicators, column resize, text filter (single op), row selection (click / Ctrl+click / Shift+click), polite live-region announcements (sort/filter/selection), AR Customers ledger demo.
- **Test infrastructure** — Playwright e2e × 3 browsers, nightly perf harness with smoke + nightly bars, api-surface CI gate, type-check / lint / unit on every PR.

The architecture is sound. The Q1 vertical-slice gate (#42) demonstrably proved that. The v0.1 read-only-grid story is solid for the narrow subset that actually works.

---

## Recommendations

For a "production-ready v1.0" given the current state, three options:

### Option A — Re-name what's shipped today as v0.1-alpha; keep v1.0 as the in-flight sprint goal

What to do:
- Stop calling main "v0.1 frozen". The `tools/api-surface` enforced types are stable, but the *behaviour* surface isn't ready for a 1.0 stamp.
- Annotate every unwired prop in `api.md` with `@unimplemented Q2` / `@unimplemented Q4` / etc. — clear to any consumer that these are placeholders.
- Console-warn when an unwired prop is set non-default on a `<BcGrid>` instance (cheap; runs once per mount).
- Drop the six placeholder packages from `package.json` workspaces' published list until they have implementations. Or ship them with explicit "throw new Error('@bc-grid/<name> is not implemented at v0.1-alpha')" instead of empty stubs — discoverable failure beats silent.
- Continue with the v1 parity sprint as planned.

### Option B — Ship a smaller v0.5 / v0.x with a tighter surface

What to do:
- Strip every unwired prop from `BcGridProps` and `BcServerGridProps`. Re-add when implemented.
- `BcServerGridProps` becomes paged-only at v0.5; `infinite` and `tree` modes drop from the prop union until shipped.
- Filter type narrows to `"text"` until other types ship.
- Six placeholder packages don't get published.
- Document v0.5 as "read-only client-side grid with text filtering, single-column sort, pinned columns, theme-aware rendering, accessibility-compliant ARIA / live regions, demonstrated 60fps at 100k rows."

That's a meaningful v0.5 product. It's narrower than what's currently typed but it's honest about what works.

### Option C — Sprint to fill the gaps, then ship v1.0

What to do:
- Land Phase 6 Track 0-7 work (the v1 parity sprint).
- Track 1 closes editing.
- Track 3 makes BcServerGrid actually work for infinite + tree.
- Track 4 implements aggregations + pivots (the package becomes real).
- Track 5 implements chrome (status-bar / sidebar / context menu).
- Track 6 implements filters (the package becomes real) + export (the package becomes real).
- Track 7 ships streaming + mobile + WCAG deep-pass + animation polish + charts adapter.
- Then — and only then — call this v1.0.

The sprint is already in flight (queue.md Phase 6 has 70+ tasks). The 7 RFCs are filed (PRs #46, #48, #49, #51, #52, #53 — all awaiting review/merge as of this audit). Once those land + the implementer agents pick up the impl tasks, v1.0 is roughly 2-3 weeks of focused parallel work away. **This is the path the project has explicitly chosen** (per the sprint pivot in `design.md §13` 2026-04-29 entry).

---

## My recommendation

**Option C, with explicit re-naming until it lands.** Specifically:

1. **Rename main's quality stamp from "v0.1 frozen" to "v0.1-alpha"** in `api.md`'s status block. The `tools/api-surface` enforced surface stays frozen — that's about export drift, which IS real. But "frozen" is misleading when the implementation lags. v0.1-alpha communicates "the API shape is locked but the implementation is in flight."

2. **Annotate unwired props.** Either `@unimplemented` JSDoc on each, or a `// TODO(track-N): wire this` comment, or both. Searchable; documentable.

3. **Add a runtime console.warn for un-wired props on first mount.** Cheap; surfaces the gap to consumers who set them. Removable once the prop is wired.

4. **Don't publish the 6 placeholder packages to npm at v0.1-alpha.** Strip them from `bun publish` or whatever the publish mechanism is. They re-appear when their impl tasks complete.

5. **Continue the v1 parity sprint.** The 7 RFCs and ~70 impl tasks are the path to a real v1.0. Each track that lands (editing, range, server-row-model, aggregations, pivots, chrome, filters/export, charts) closes a category of M/H findings here.

6. **Do another audit pass per ~10 merged PRs.** The findings here are based on a snapshot. As impl tasks land, F1-F14 get retired and new ones may surface.

---

## Test plan for closing the H findings

For agents picking up the work, here's a rough order-of-attack to retire the H-severity findings:

| Finding | Closes when |
|---|---|
| H1 BcServerGrid stub | Track 3 `server-paged-impl` + `infinite-mode-block-cache` + `server-tree-mode` + `mutation-pipeline` + `invalidation-impl` all merge |
| H2 expandAll/collapseAll no-ops | Track 0 `group-by-client` merges (provides the expand/collapse machinery) |
| H3 6 placeholder packages | Tracks 1 (editors), 4 (aggregations), 6 (filters + export), 3 (server-row-model) close. Enterprise stays placeholder until Q5+ — exclude from v1 publish. |
| H4 silent filter footgun | Track 6 `filter-registry-impl` merges (lookup by registry; unregistered types throw) |

For M-severity, ~10 of the 14 findings retire when their corresponding Phase 5.5 / Phase 6 Track 0 tasks merge.

For L-severity, all are folded into existing Track 5 / Track 7 / wcag-deep-pass scope.

---

## What this audit pass does NOT contain

- Specific CSS / shadcn token coverage review — left for `wcag-deep-pass` Track 7.
- Bundle-size budget review — `bundle-size-ci-gate` (Phase 5.5 [ready]) lands the gate; this audit doesn't run a one-time bundle-size measurement.
- Cross-browser perf measurement beyond what nightly-perf-harness covers — that's the existing nightly's responsibility.
- Security audit (XSS / prototype pollution in cellRenderer) — separate audit pass; defer to a `security-audit` task.

## References

- Every `packages/*/src/*.ts` and `*.tsx` file on `origin/main` (commit `201d213` at audit time)
- `docs/api.md` (frozen v0.1 surface)
- `docs/design.md §14.1` (coverage gates)
- `docs/audit-c2-001.md` (cross-doc audit)
- `docs/audit-c2-002.md` (post-Phase-A code review)
- `docs/coordination/v1-parity-sprint.md` (the path to v1.0)
- `tools/api-surface/src/manifest.ts` (planned vs enforced packages)
