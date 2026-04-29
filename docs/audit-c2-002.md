# Audit c2-002 — code-level audit on main post-Phase-A

**Auditor:** c2 (Claude on `bcg-worker4`)
**Date:** 2026-04-30
**Scope:** post-Phase-A code-level audit on `origin/main` after the rapid-fire merge train of `#39` (filter-cell role), `#40` (FF e2e flake), `#41` (live regions), `#42` (q1 vertical slice demo), `#43` (sprint pivot coordination), `#45` (editing-rfc), `#47` (queue expansion), `#50` (`grid.tsx` file split). The first audit (`audit-c2-001.md`) ran end-of-Q1; this one runs **after the v1-parity-sprint-pivot landed and Phase A cleared.**
**Validation:** clean checkout green — `bun install`, `bunx tsc -b --clean`, `bun run type-check`, `bun run lint`, `bun run test` (172 unit), `bun run build`, `bun run api-surface`.

---

## Methodology

1. Walked `packages/react/src/` post-`grid-tsx-file-split` to verify the 6-file partition is internally cohesive and didn't introduce subtle regressions.
2. Verified `live-regions` (#41) implementation against `accessibility-rfc §Live Regions`. Read `useLiveRegionAnnouncements`, default `BcGridMessages`, root-level live-region DOM in `grid.tsx`.
3. Cross-checked `BcGridMessages` template strings against the canonical RFC table.
4. Re-ran `bun run api-surface` to confirm the manifest still aligns with `dist/index.d.ts` after #45 + #50.
5. Spot-checked the AR Customers vertical-slice demo (#42) for the breadth of the value-pipeline / styling props it exercises.
6. Walked the Track 1-7 task graph in `docs/queue.md` against the merged-RFC + RFC-in-flight states.

---

## Findings

Severity legend: **H** = production / spec-binding regression, **M** = quality / standards-strict, **L** = doc / process / readability.

### F1 (M) — Assertive live region rendered but unwired

`packages/react/src/grid.tsx:688-694` renders the assertive region per `accessibility-rfc §Live Regions`:

```tsx
<div
  data-bc-grid-alert="true"
  role="alert"
  aria-live="assertive"
  aria-atomic="true"
  style={visuallyHiddenStyle}
/>
```

But `useLiveRegionAnnouncements` (`gridInternals.ts:436-512`) only returns `{ politeMessage, announcePolite }`. There's **no `announceAssertive` or `assertiveMessage`**. The assertive `<div>` is structural (correct DOM) but has no path to receive content.

This bites future tracks that need to announce errors:
- **editing-rfc §a11y for edit mode** specifies "Cell edit rejected by validator" / "Cell edit rejected by server" → assertive region.
- **range-rfc §a11y** specifies "Paste rejected" / range-selection-failed → assertive region.
- **chrome-rfc §Status bar** routes through the polite region but acknowledges the assertive region exists for errors.

Implementer agents will either (a) add the assertive plumbing in their PR (acceptable but inconsistent if multiple tracks duplicate), or (b) not wire any assertive announcements (worst — silently breaks the WCAG 2.1 AA "errors require user action" expectation).

**Recommendation:** small Phase 5.5 follow-up task `assertive-live-region-plumbing` — extend `useLiveRegionAnnouncements` to return `{ politeMessage, assertiveMessage, announcePolite, announceAssertive }`, mirror the polite-region useState into the assertive `<div>`. The first track to need it (Track 1 `editor-framework`) consumes the new plumbing. ~30 LoC change.

I've folded this into `editor-framework`'s task description in #54 as a sub-bullet — it can be done either standalone or inside that PR.

### F2 (L) — `gridInternals.ts` carries 48 named exports

The 763-line `packages/react/src/gridInternals.ts` is `grid-tsx-file-split`'s catch-all for "internal grid plumbing." 48 named exports across constants, types, hooks, utility functions, and style helpers.

Sample:
- Constants: `DEFAULT_COL_WIDTH`, `DEFAULT_VIEWPORT_WIDTH`, `DEFAULT_BODY_HEIGHT`, `densityRowHeights`, `densityHeaderHeights`, `defaultMessages`.
- Types: `RowEntry`, `ResolvedColumn`, `ViewportSize`, `CellStyleParams`.
- Functions: `resolveColumns`, `deriveColumnState`, `cellStyle`, `rootStyle`, `headerViewportStyle`, `headerRowStyle`, `scrollerStyle`, `canvasStyle`, `rowStyle`, `overlayStyle`, `visuallyHiddenStyle`, `alignToJustify`, `pinnedTransformValue`, `classNames`, `pinnedClassName`, `hasProp`, `clamp`, `domToken`, `headerDomId`, `cellDomId`.
- Hooks: `useLiveRegionAnnouncements`, `useViewportSync`, `useColumnResize`, `useFlipOnSort`.

c1's #50 description proactively flagged this: "If reviewer prefers stricter line caps over the 6-file cap, happy to do another pass that splits `gridInternals.ts` into `gridStyles.ts` + `gridHooks.ts` + `gridUtils.ts` (would result in 8 files; each under ~300 lines)."

I approved the 6-file split for parallel-safety; the 48-export concentration is a separate concern. **Not blocking** — but the next time a Phase 6 PR lands a 100+ line addition into `gridInternals.ts` (e.g., `editor-framework` adding hooks, or the impl tasks adding shared utilities), that's a natural moment to cleave the file.

**Recommendation:** opt-in cleanup — when the next ≥100 LoC addition lands in `gridInternals.ts`, the implementer splits it into `gridStyles.ts` (style helpers) + `gridHooks.ts` (4 hooks + future ones) + `gridUtils.ts` (`classNames` / `clamp` / etc.) + `gridDefaults.ts` (constants + `defaultMessages`). All identifier names stable; no consumer-facing change.

### F3 (L) — No unit tests for the 4 hooks extracted in `#50`

`useLiveRegionAnnouncements`, `useViewportSync`, `useColumnResize`, `useFlipOnSort` are exported from `gridInternals.ts` but only exercised end-to-end via `apps/examples/tests/*.pw.ts`. No unit tests in `packages/react/tests/`.

Three concerns:
- **Regression risk.** A subtle bug in `useViewportSync`'s RAF coalescing wouldn't fail any unit test today; it'd take a Playwright run to surface.
- **Documentation.** Hook unit tests double as usage examples for new agents working on extensions (Track 1 will compose new hooks alongside these).
- **Test-coverage gates.** `design.md §14.1` calls for 75% coverage on `react`. Hooks are uncovered; the package average drops as Phase 6 ships more.

**Recommendation:** new task `react-hooks-unit-tests` in Phase 5.5. Low priority — can land alongside `editor-framework` since that PR will exercise the hooks heavily anyway.

### F4 (L) — AR Customers demo is light on value-pipeline coverage

`apps/examples/src/App.tsx` exercises 14 column properties in total but covers only:
- `filter: { type: "text" }` (×8 columns)
- `cellRenderer` (×2 — the risk meter + status pill)
- `pinned` (left + right via `BcEditGrid`)

Not exercised in the demo:
- `valueFormatter` (api.md §1.1)
- `valueGetter`
- `cellClassName` / `cellStyle` (the React extensions)
- `comparator` (custom sort)
- `tooltip`
- `aggregation` (declared but reserved Q5/v1 per sprint pivot)

These are fully implemented in the API; the demo just doesn't show them. As the v1 parity sprint progresses and the bc-next cutover (`bc-next-cutover`, post-1.0) is built, real-world coverage will grow. Not blocking.

**Recommendation:** when the bc-next-cutover task lands (post-1.0), or when Track 1 lands editing, exercise the missing pipeline properties in the demo (or add a `apps/examples/src/PipelineShowcase.tsx` page).

### F5 (L) — `apps/examples/tests/vertical-slice.pw.ts` doesn't exercise live regions

Live regions landed in #41 but the AR Customers e2e (`vertical-slice.pw.ts`, 4 tests) doesn't read `[data-bc-grid-status]` text content after sort / filter / select. The `pinned-cols.pw.ts` e2e similarly skips this.

Live-region announcement testing is generic across grids, so it's reasonably covered by package-level tests. But adding one demo-side assertion (e.g., "after sorting Outstanding column, the polite region's textContent matches /Sorted by Outstanding ascending\.?/") would catch end-to-end wiring regressions.

**Recommendation:** wcag-deep-pass (Track 7) is the natural home; defer until that task lands.

---

## Things I checked that are clean

- **`api.md` ↔ `manifest.ts` alignment** — `bun run api-surface` passes (7 enforced + 4 planned packages, no drift). The widening I did in `audit-c2-001`'s reconciliation PR is holding through #45 + #50 without further drift.
- **`grid-tsx-file-split` (#50) public API preservation** — `index.tsx` re-exports from new locations; `tools/api-surface` clean; `bun run test:e2e` 87 pass on a fresh checkout. Public surface unchanged. ✓
- **Live-region default messages** match `accessibility-rfc §Live Regions` table verbatim:
  - "Sorted by {columnLabel} {direction}." ✓
  - "Sorting cleared." ✓
  - "Filter applied. {visibleRows} of {totalRows} rows shown." ✓
  - "Filter cleared. {totalRows} rows shown." ✓
  - "{count} rows selected." (with singular "1 row selected.") ✓
  - "Selection cleared." ✓
- **Selection announcement debounced** at 200ms (`gridInternals.ts:493-509`) — matches the RFC's "debounced" requirement.
- **Hook extraction in `#50`** — `useLiveRegionAnnouncements` is conceptually one module (sort + filter + selection announce paths); each path uses a `useRef` to gate against duplicate announcements on initial mount; clean React patterns throughout.
- **`gridInternals.ts` section comments** (`// ---- Defaults ----`, `// ---- Types ----`, `// ---- Style helpers ----`, `// ---- Live region announcements ----`, etc.) make the 763-line file readable top-to-bottom. Good local discipline.
- **Q1 quality bars from `roadmap.md`:** all five gates met as of #41 + #42.
- **Decision log discipline:** `design.md §13` got a comprehensive entry for the sprint pivot in #43 ("Scope + timeline pivot for v1.0"), preserving the original decision-log invariants while documenting the timeline compression.

---

## Recommendations and follow-up punch list

| ID | Severity | Action | Owner suggested | Folded into |
|---|---|---|---|---|
| F1 | M | Wire `announceAssertive` in `useLiveRegionAnnouncements`. | The first agent to need it (likely Track 1 `editor-framework`); standalone if any agent has cycles. | `editor-framework` task description annotated in queue-sync-2 (#54). |
| F2 | L | Split `gridInternals.ts` into 4 sub-files when next 100+ LoC addition lands. | Whoever's PR triggers the addition (Track 1, 2, 4, or 5). | Not yet — opportunistic cleanup. |
| F3 | L | New task `react-hooks-unit-tests` for the 4 extracted hooks. | x1 (test-infra patterns) or co-located with `editor-framework`. | Not yet — file as a Phase 5.5 task in a future queue-sync. |
| F4 | L | Demo coverage of `valueFormatter` / `valueGetter` / `cellClassName` / `cellStyle` / `comparator` / `tooltip`. | bc-next-cutover (post-1.0) or PipelineShowcase demo page. | Not yet — track via roadmap. |
| F5 | L | `vertical-slice.pw.ts` reads polite-region after sort/filter/select. | wcag-deep-pass (Track 7 `wcag-deep-pass` task). | Already in Track 7 spec. |

---

## What this audit pass does NOT contain

- New corrective PRs beyond `editor-framework` task annotation. F2-F5 are recommendations folded into existing track tasks; F1 is annotated on the editor-framework task description in queue-sync-2 (#54).
- Re-run of `screenreader-spot-check` — that task is still `[ready]` in queue.md and requires human hardware (NVDA / VoiceOver). Not blocking.

## What I'm watching for going forward

- **Phase 6 implementation cadence** — c1, x1, x2, x3 should start picking up the now-`[ready]` tasks: `column-reorder`, `column-visibility-ui`, `column-state-url-persistence`, `search-complete`, `group-by-client`, `pagination-client-ui` (Track 0); `bundle-size-ci-gate`, `smoke-perf-ci`, `multi-column-sort-ui`, `tooltip-rendering`, `localstorage-gridid-persistence`, `search-highlighting`, `selection-checkbox-column`, `aria-disabled-rows`, `row-select-keyboard`, `number-filter-ui`, `date-filter-ui`, `boolean-filter-ui` (Phase 5.5); plus `editor-framework` (Track 1, just unblocked).
- **RFC merge throughput** — 6 RFCs awaiting merger action (#46 chrome, #48 filter-registry, #49 range, #51 aggregation, #52 pivot, #53 charts). Until those land, the per-Track impl tasks stay `[blocked: …]`.
- **Process drift** — no new `[in-flight: …]`-without-PR observations; the queue convention is being followed.
- **`gridInternals.ts` file size** — if it crosses 1000 lines on any future PR, file the F2 split immediately.

## References

- `packages/react/src/{grid,gridInternals,headerCells,bodyCells,editGrid,serverGrid}.tsx`
- `docs/design/accessibility-rfc.md §Live Regions`
- `docs/audit-c2-001.md` (first audit pass)
- `docs/coordination/v1-parity-sprint.md`
- PR threads: `#41`, `#42`, `#45`, `#50`
