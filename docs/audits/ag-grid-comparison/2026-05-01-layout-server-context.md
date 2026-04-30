# AG Grid Comparison: Layout, Server Row Model, Context Menu

**Date:** 2026-05-01
**Auditor:** worker4 (Claude)
**Scope:** v0.2 release planning. Compare bc-grid against AG Grid for three areas: layout / scrolling, server-side row model, and context menu discoverability. Filter UI is owned by `2026-05-01-filtering.md` (PR #196 / worker2) and is cross-referenced rather than duplicated here.
**Audience:** v0.2 release-readiness check + queue triage for follow-up tracks.

## Scope

Three behaviours covered:

1. **Layout & scrolling** — fixed-height vs auto-height grids, header / body width sync, pinned columns, resize affordances, viewport handoff.
2. **Server-side row model** — paged / infinite / tree loading, request dedupe + abort, invalidation, retry, cache eviction, streaming row updates, mutation reconciliation.
3. **Context menu discoverability** — right-click + long-press + keyboard activation, default vs custom items, integration with selection / range state.

Filter UI (popup variant, filters tool panel, set filter, persistence) is the subject of PR #196's `2026-05-01-filtering.md`; this audit references that work where it intersects with the three areas above (e.g., the filters tool panel touches sidebar layout).

## Inputs

- **AG Grid (public docs only):**
  - `https://www.ag-grid.com/react-data-grid/grid-size/` (auto-height + grid size)
  - `https://www.ag-grid.com/react-data-grid/scrolling/` (scrolling, viewport)
  - `https://www.ag-grid.com/react-data-grid/column-pinning/` (pinned columns)
  - `https://www.ag-grid.com/react-data-grid/column-resizing/` (resize affordance)
  - `https://www.ag-grid.com/react-data-grid/row-models/` (row-model overview)
  - `https://www.ag-grid.com/react-data-grid/server-side-model/` (Server-Side Row Model — Enterprise)
  - `https://www.ag-grid.com/react-data-grid/infinite-scrolling/` (Infinite Row Model — Community)
  - `https://www.ag-grid.com/react-data-grid/server-side-model-tree-data/` (server tree data — Enterprise)
  - `https://www.ag-grid.com/react-data-grid/server-side-model-cache/` (cache + retry semantics)
  - `https://www.ag-grid.com/react-data-grid/component-context-menu/` (context menu — Enterprise)
- **bc-grid:** `packages/react/src/{grid.tsx, gridInternals.ts, serverGrid.tsx}`, `packages/server-row-model/src/index.ts`, `packages/core/src/index.ts` (`ServerInvalidation`, `BcGridApi`, `BcServerGridApi`), `docs/design/server-query-rfc.md`, `docs/design/chrome-rfc.md`, `docs/queue.md`.
- **Confirmation:** no AG Grid source repository was cloned, opened, or inspected. The audit follows `docs/coordination/ag-grid-clean-room-audit-plan.md` rules.

---

## 1. Layout and scrolling

### Where bc-grid is better

- **`height="auto"` is a true page-flow primitive.** As of #198 (merged 2026-05-01) `<BcGrid height="auto">` lets the document own scrolling: header sticks, body grows naturally, no internal scroll container competing with the page. Public AG Grid docs describe `domLayout: "autoHeight"` with caveats (incompatible with row virtualization at large datasets and other flags); bc-grid's auto-height keeps virtualization on and is the simpler page-flow shape ERPs reach for first.
- **Pinned columns share one logical row in the accessibility tree.** Per `accessibility-rfc §Pinned Rows and Columns`, pinned cells are positioned with sticky transforms inside the same DOM row as body cells; the accessibility tree exposes one row in column order. AG Grid's docs note pinned containers as separate panes; clean-room observation suggests bc-grid's single-row approach is structurally simpler and avoids the duplicate-cell pitfalls flagged in the RFC.
- **Header / body sync is transform-based.** `headerRowStyle()` applies `translate3d(${-scrollLeft}px, 0, 0)` to the header row instead of dual-scrollable containers. Cheaper than two synced scroll containers, no "header lags one frame behind body" failure mode under fast scroll.
- **Scroll-shadow indicators are data-attribute-driven.** `data-scrolled-left` / `data-scrolled-right` on the grid root + theming CSS — no JS measurement loop. Works with `prefers-reduced-motion` because there's no animation.
- **Resize separators landed (PR not yet, but theming work referenced in `e3e7140 theming: show column resize separators`).** Visible affordance closes the v0.2 milestone gate "resize affordances are visible" without the host needing CSS knowledge.

### Parity

| Behaviour | bc-grid | AG Grid (public docs) |
|---|---|---|
| Fixed-height grid with internal vertical scroll | ✓ (`height: number`) | ✓ (default `domLayout`) |
| Auto-height = doc owns scrolling | ✓ (`height="auto"`, #198) | ✓ (`domLayout: "autoHeight"` with caveats) |
| Sticky pinned-left / pinned-right columns | ✓ | ✓ |
| Header / body horizontal sync | ✓ (transform) | ✓ |
| Column resize via drag handle on header right edge | ✓ | ✓ |
| Resize affordance visible without hover | ✓ (theming separators) | ✓ |
| Scroll-to-row / scroll-to-cell imperative API | ✓ (`BcGridApi.scrollToRow`, `scrollToCell`) | ✓ |
| Reduced-motion + forced-colors compliant CSS | ✓ (theming `@media` blocks pinned in tests) | Less explicitly documented |

### Gaps

- **P1 — Variable row heights are not first-class.** `defaultRowHeight` is a single number; `rowHeight` prop accepts a number. AG Grid documents `getRowHeight: (params) => number` for per-row dynamic heights (e.g., a row containing wrapped text or an embedded chart). bc-grid's virtualizer's Fenwick-tree offset machinery already supports variable heights at the engine level (it's how detail panels expand) but the grid prop doesn't expose a per-row callback yet. ERP "comments / multi-line description" rows would benefit.
- **P1 — `domLayout: "print"` analogue is missing.** AG Grid documents a print mode that strips scrolling and renders every row for print output. bc-grid has no equivalent; the auto-height path is closest but doesn't unhook virtualization. Minor for v0.2; relevant for an ERP that prints reports.
- **P2 — `suppressColumnVirtualisation` analogue.** AG Grid documents an opt-out for column virtualization useful for very wide grids where horizontal scroll behaviour matters more than perf. bc-grid always virtualizes columns. Niche; worth a `BcGridProps.virtualizeColumns?: boolean` once a real consumer surfaces a need.
- **P2 — Resize-on-double-click "fit to content".** AG Grid double-click on the resize handle auto-fits a column to its widest visible cell. bc-grid has the resize drag but no double-click auto-fit. Useful for ERP grids where column widths drift from default.
- **P3 — Auto-resize-all-columns API.** AG Grid `autoSizeAllColumns()`. Niche; consumer can iterate `BcGridApi.scrollToCell` measurements today if needed.

### v0.2 blocker assessment

- **#198** (auto-height / page-flow) — **merged 2026-05-01.** Closes the "host apps need hidden CSS knowledge for core layout" milestone gate.
- **#202** (`agent/worker1/resize-affordance-polish`) — open / `UNSTABLE` CI; closes the "resize affordances are visible" gate. Coordinator-owned.

No other layout work is a v0.2 blocker. Variable row heights, print mode, double-click auto-fit are all post-v0.2.

---

## 2. Server-side row model

### Where bc-grid is better

- **One shared `BcServerGrid` shell, three rowModel discriminants.** A single component dispatches by `rowModel: "paged" | "infinite" | "tree"`. AG Grid's docs split SSRM (Enterprise) and Infinite (Community) into different components / modes with different prop shapes. bc-grid's union-typed `BcServerGridProps` keeps the consumer-facing surface narrower.
- **`AbortSignal` is end-to-end in the loader contract.** `LoadServerPage` / `LoadServerBlock` / `LoadServerTreeChildren` accept a signal; the model dedupes in-flight requests by block key and aborts superseded ones. Public AG Grid docs describe request dedupe at a higher level; the explicit signal in the consumer contract makes "cancel on view change" the default rather than the override.
- **`ServerInvalidation` has a typed scope union.** `{ scope: "all" } | { scope: "view"; viewKey? } | { scope: "blocks"; blockKeys[] } | { scope: "rows"; rowIds[] } | { scope: "tree"; parentRowId; recursive? }` — every invalidation path is one of these shapes. AG Grid's cache APIs spread across multiple methods (`refreshServerSide`, `purgeServerSideCache`, etc.); bc-grid's discriminated union is one mental model.
- **`mutationId` is plumbed through the optimistic-edit pipeline.** Per editing-rfc §Concurrency the controller stamps each commit with a monotonic id; rollback paths bail when superseded by a re-edit. AG Grid's transactional row updates don't expose an analogous identifier in the public docs; consumers building optimistic-UI flows wire their own bookkeeping.
- **Streaming row updates are typed in core.** `ServerRowUpdate` discriminator union (`rowAdded` / `rowUpdated` / `rowRemoved` / `viewInvalidated`); `BcServerGridApi.applyServerRowUpdate(update)` dispatches per mode. AG Grid documents transactions; bc-grid's streaming-update shape lines up cleanly with WebSocket / SSE consumer code.
- **Tree mode exposes `aria-level` / `aria-posinset` / `aria-setsize` per row** (PR #185 lands the polish; at the model layer the snapshot is already structured for the lookup). AG Grid's tree-data accessibility is documented at a higher level.

### Parity

| Behaviour | bc-grid | AG Grid (public docs) |
|---|---|---|
| Paged loading with totalRows | ✓ (`rowModel="paged"`, `LoadServerPage`) | ✓ (Server-Side Row Model — Enterprise) |
| Infinite-scroll block cache with LRU | ✓ (`rowModel="infinite"`, `LoadServerBlock`) | ✓ (Infinite Row Model — Community) |
| Server tree / hierarchical lazy loading | ✓ (`rowModel="tree"`, `LoadServerTreeChildren`) | ✓ (SSRM with `treeData: true` — Enterprise) |
| Request dedupe + abort on supersede | ✓ | ✓ |
| Cache invalidation by scope | ✓ (`ServerInvalidation` union) | ✓ (multiple methods) |
| Block-level retry | ✓ (`BcServerGridApi.retryServerBlock`) | ✓ |
| Optimistic mutations + rollback | ✓ (`onCellEditCommit` + `mutationId`) | ✓ (`applyTransaction` / async — Enterprise) |
| Streaming row updates | ✓ (`ServerRowUpdate` + `applyServerRowUpdate`) | ✓ (transactions / `applyServerSideTransaction`) |
| Total row count when unknown | ✓ (`rowCount: number \| "unknown"`) | ✓ |

### Gaps

- **P1 — No prefetch / look-ahead beyond the current viewport.** Public AG Grid docs describe `cacheOverflowSize` / `maxBlocksInCache` plus a configurable look-ahead so the next block fetches before the user reaches it. bc-grid's infinite mode fetches reactively. Already in queue (`server-row-model-perf-tuning` — `[review: x2 #96]`); cross-link.
- **P1 — No `purge: true` distinction documented in the public API.** `BcServerGridApi.refreshServerRows({ purge: true })` exists in the type signature but the user-facing semantic ("hold cache vs evict everything") isn't called out as cleanly as AG Grid's `purgeServerSideCache`. A docs-only follow-up.
- **P2 — Row-level loading-skeleton pattern.** Public AG Grid docs describe a "loading rows" placeholder cell renderer; bc-grid renders the existing rows with no per-cell skeleton during a refetch. ERP UX would benefit from a per-row indicator while a block reloads.
- **P2 — Infinite-mode jump-to-row by absolute index.** AG Grid documents `gridApi.ensureIndexVisible(index)` that triggers the load if the index is in an unloaded block. bc-grid's `scrollToRow(rowId)` requires a known rowId; consumers don't always have one before the row loads.
- **P3 — Server-side group-by-aggregation with mid-tree edits.** Out-of-scope for v0.2; touches Track 4 (aggregations) and Track 7 (pivot).

### v0.2 blocker assessment

No open server-row-model PRs are v0.2 blockers. The v0.2 milestone explicitly punts server row model to v0.6 ("Server Row Model and Live Data") in the roadmap, so server-side gaps are post-v0.2 by design.

The only v0.2-relevant SRM call: confirm that `bsncraft`'s server-backed grids (if any) install + type-check under the candidate version (gate already in the v0.2 milestone). If `bsncraft` exercises a server-mode path the candidate must surface the right SRM types.

### "Do not copy" notes

- AG Grid's SSRM internals (cache structure, transaction reconciliation, refresh strategy) are **not** to be inspected. bc-grid's model layer is independently implemented per `server-query-rfc`. Pattern validation only — request dedupe, AbortSignal-aware loaders, scope-discriminated invalidation, optimistic-with-rollback are all described at the public-API level.
- Do not copy AG Grid's `IServerSideDatasource` shape verbatim. bc-grid's loader contract is `LoadServerPage<TRow>` / `LoadServerBlock<TRow>` / `LoadServerTreeChildren<TRow>` — different argument shapes, different return shape, different lifecycle semantics. Keep them.

---

## 3. Context menu discoverability

### Where bc-grid is better

(Nothing yet. The context menu hasn't shipped — `[ready]` in `queue.md` and PR #157 in flight. Once it lands, expected wins per the chrome-rfc include shadcn-compatible primitives, `Shift+F10` keyboard activation as a first-class path, and the ERP-friendly action set.)

### Parity

(Pending #157 merge; revisit after.)

### Gaps

- **P1 — No context menu ships today.** `chrome-rfc` describes `right-click + long-press (500ms coarse pointer) + Shift+F10`, four built-in items, custom factory function. PR #157 (`agent/worker3/context-menu-impl`) is open + clean CI; coordinator-owned.
- **P1 — Header right-click is reserved for the column-visibility menu.** `headerCells.tsx:193` calls `onContextMenu` → opens `ColumnVisibilityMenu`. Once `context-menu-impl` lands, the rule needs to be: header right-click opens column-options (visibility / pin / sort / hide); body right-click opens the cell / row / range context menu. Today the body has no context menu at all; headers steal the gesture exclusively. Worth confirming as a follow-up to #157.
- **P2 — Keyboard activation parity (`Shift+F10`).** `chrome-rfc` lists `Shift+F10` as a required activation path. The keyboard handler in `keyboard.ts` doesn't reserve `Shift+F10` today; #157 should add it. If the PR doesn't, file as a follow-up.
- **P2 — Long-press 500ms on coarse pointers.** `accessibility-rfc §Pointer and Touch Fallback` already specifies the threshold; the pending PR + #189 (`mobile-touch-fallback`) need to compose. Both are open / DIRTY today; needs coordinator coordination.
- **P3 — Discoverability hint.** AG Grid's docs note that ERP users sometimes don't realise a context menu exists. A small visible hint (e.g., a row-action chevron when the row is hovered) is a UX option; out of scope for v0.2.

### v0.2 blocker assessment

- **#157** (`context-menu-impl`) — **not a v0.2 milestone blocker** per the roadmap. The v0.2 milestone scope is "integration-stable alpha; boring to consume in `bsncraft`"; `bsncraft` works without a context menu today (typical action surfaces are the action column from `<BcEditGrid>` and the toolbar). Context menu lands in **v0.8.0 — Chrome, Charts, and Productivity Surface** per the roadmap.

### "Do not copy" notes

- AG Grid's context-menu provider implementation is **not** to be inspected. bc-grid's chrome-rfc specifies shadcn-compatible internal primitives, not a runtime shadcn dependency. Pattern validation: the four-built-in + custom factory shape, the keyboard activation set, and the long-press threshold are all observable from public docs and the WAI-ARIA grid pattern.

---

## v0.2 release-readiness summary

Of the open PRs touching the three areas in this audit:

| PR | Area | v0.2 blocker? | Status |
|---|---|---|---|
| **#198** auto-height page-flow | Layout | Yes — closes "no hidden CSS knowledge" gate | **Merged 2026-05-01** |
| **#199** release preflight | (release tooling) | Yes — gate is now automated | **Merged 2026-05-01** |
| **#200** filter clear state | (filter UI; covered in #196 audit) | Yes — closes "filter stable in fit-to-screen" gate | Open / clean CI |
| **#202** resize affordance polish | Layout | Yes — closes "resize affordances visible" gate | Open / `UNSTABLE` CI |
| **#203** showFilterRow toggle | Filter UI | Maybe — depends on whether `bsncraft` needs the toggle | Open / clean CI |
| **#204** filters tool panel rescue | Filter UI / Layout (sidebar) | No — sidebar / tool panels are v0.8 surface | Open / clean CI |
| **#157** context menu impl | Context menu | No — chrome surface is v0.8 | Open / clean CI |
| **#185** server-tree-mode ARIA polish | Server row model | No — v0.6 surface | Open / DIRTY |
| **#196** filter audit | (audit) | No | Open / `UNSTABLE` CI |

**v0.2 is gated on:** #200 (filter clear) and #202 (resize polish) merging, plus the coordinator-owned package-version bump described in `release-milestone-roadmap.md` "Release checklist". This audit does **not** claim v0.2 is ready; #201 (release-readiness docs, my prior PR) reflects the same status.

---

## Concrete task recommendations

Suggested queue.md entries, with worker ownership picked to match the convention (worker2 for filter-adjacent work, worker3 for chrome, worker4 for ARIA / a11y / docs, worker5 for tooling-polish).

### Layout / scrolling

- **`variable-row-height-callback`** (P1, **M**) — `BcGridProps.getRowHeight?: (rowEntry) => number` callback that integrates with the virtualizer's existing Fenwick-tree offset machinery (already supports variable heights for detail panels). **Suggested owner:** worker1 (virtualizer expertise from prior PRs).
- **`column-autosize-on-double-click`** (P2, **S**) — header resize-handle double-click measures the widest visible cell in the column and applies that width via the existing column-state pipeline. **Suggested owner:** worker2 (already touches column-state / filter-row / layout).
- **`column-autosize-api`** (P2, **S**) — `BcGridApi.autoSizeColumn(columnId)` and `autoSizeAllColumns()` — companion to the double-click affordance. **Suggested owner:** worker2.
- **`grid-print-mode`** (P3, **M**) — `domLayout` analogue: render every row, suppress virtualization, strip internal scroll. **Suggested owner:** worker1.

### Server row model

- **`server-row-model-prefetch`** (P1, **M**) — already covered in queue under `server-row-model-perf-tuning` (`[review: x2 #96]`). Cross-link rather than duplicate.
- **`server-purge-cache-docs`** (P1, **S**) — docs / api.md update covering the `purge: true` semantics on `BcServerGridApi.refreshServerRows`. **Suggested owner:** worker3 or worker4 (docs-heavy).
- **`server-loading-row-skeleton`** (P2, **S**) — per-row loading skeleton renderer when a block is in flight; consumer-overridable. **Suggested owner:** worker3.
- **`server-ensure-index-visible`** (P2, **S**) — `BcServerGridApi.ensureIndexVisible(index)` that triggers a block load if the index is in an unloaded block. **Suggested owner:** worker1 or worker3 (touches both virtualizer + server-row-model).

### Context menu

- **`context-menu-followup-keyboard`** (P2, **S**) — once #157 merges, confirm `Shift+F10` is wired in `keyboard.ts`; if not, file as a follow-up. **Suggested owner:** worker3 (continuity with #157).
- **`context-menu-mobile-compose`** (P2, **S**) — coordinate #157 + #189 (`mobile-touch-fallback`) so the long-press 500ms threshold is shared and there's no double-fire. **Suggested owner:** worker3.

---

## Bugs found in bc-grid

None during this pass. All audit findings are gaps or unshipped surface; no incorrect behaviour observed.

---

## Non-goals / deferred

- **Formula editing in cells** — out of scope per `editing-rfc §Non-Goals`; not relevant to this audit.
- **AG Grid feature-bug parity** — per the clean-room audit plan, AG Grid bugs are not compatibility requirements. None observed in the three areas above.
- **Charts integration** — covered by `charts-rfc` (PR #186 in flight); orthogonal to layout / SRM / context menu.
- **Filter UI parity** — owned by `2026-05-01-filtering.md` (PR #196). Only the sidebar / tool-panel intersection is touched here.

---

## Sources

- bc-grid: `packages/react/src/{grid.tsx, gridInternals.ts, serverGrid.tsx, headerCells.tsx, columnVisibility.tsx}`, `packages/server-row-model/src/index.ts`, `packages/core/src/index.ts`, `docs/design/{server-query-rfc.md, chrome-rfc.md, accessibility-rfc.md}`, `docs/coordination/release-milestone-roadmap.md`, `docs/queue.md`.
- AG Grid: public docs URLs listed under "Inputs" above.
- **Confirmation:** no AG Grid source repository was cloned, opened, or inspected. Per `docs/coordination/ag-grid-clean-room-audit-plan.md`.
