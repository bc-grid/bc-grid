# bc-grid Status — v0.0 → v1.0

**Owner:** Claude coordinator (`~/work/bc-grid`).
**Update cadence:** after every merge train, every release cut, and when scope decisions change.
**Last updated:** 2026-05-04 by Claude coordinator after #455 / #496 / #498 / #499 land.

This file is the single fast-track tracker toward v1.0. It is **not** the milestone roadmap (`docs/coordination/release-milestone-roadmap.md` is the binding gate doc). This file's job is to give the maintainer a one-look view of "what's left, what could be deferred, what we're choosing to keep."

**Legend:**

- ✅ **shipped** — feature lands in published packages, public API + tests included
- 🟡 **partial** — engine landed, UI/integration/recipe still pending
- ⏳ **in flight** — PR open or work assigned to a worker
- ❌ **not started**
- 🚪 **deferrable to post-1.0** — coordinator's recommendation; maintainer decides
- 🔒 **must ship for 1.0** — coordinator's recommendation; maintainer decides

Coordinator marks 🚪 vs 🔒 as a recommendation. Maintainer ratifies in the **decision** column.

---

## Currently published

`@bc-grid/*@0.6.0-alpha.2` — published 2026-05-04 to GitHub Packages. Full release notes: https://github.com/bc-grid/bc-grid/releases/tag/v0.6.0-alpha.2.

**Alpha.3 candidate train (post-alpha.2, already on `main`):**

- ✅ Editor a11y fix (date / datetime / time aria-describedby, #493)
- ✅ Quick filter toolbar input (#495)
- ✅ Server-row cache stats (#470)
- ✅ Client tree row model phase 2.5 — per-subtree sort + parent-row aggregations (#452)
- ✅ Client tree row model phase 3 — production-readiness (#455)
- ✅ Submenu collision-flip "neither side fits" fix + Playwright guard (3ff7a16)
- ✅ Server-grid CSV export (#498)
- ✅ Server tree expansion persistence (#496)
- ✅ Cursor-pagination IMPL deferral doc (#499)
- ✅ shadcn/Radix architecture-correction RFC (#894f53f, binding for v0.7)

Cut alpha.3 OR roll straight to GA — pending bsncraft consumer soak feedback on alpha.2.

---

## Feature audit by milestone

### Foundation (v0.1 → v0.2) — ✅ COMPLETE

| Feature | Status | Notes |
| --- | --- | --- |
| Virtualizer (rows + cols, variable sizes, in-flight retention) | ✅ | `@bc-grid/virtualizer` |
| Animations (FLIP via Web Animations, 100-row budget) | ✅ | `@bc-grid/animations` |
| Theming (CSS vars, light/dark, density modes) | ✅ | `@bc-grid/theming` |
| Public API surface (frozen + diff-gated) | ✅ | `tools/api-surface` enforces |
| Performance gates CI-enforced | ✅ | smoke (cold mount, sort, scroll FPS) + nightly |
| 11-package monorepo with clean DAG | ✅ | type-check zero `any` outside TanStack adapter |

### Read-only grid (v0.2) — ✅ COMPLETE

| Feature | Status | Notes |
| --- | --- | --- |
| Sort (single + multi-column) | ✅ | |
| Column resize / pin (left/right/top/bottom) | ✅ | bsncraft P0 fix in alpha.2 (Option B 3-track template) |
| Keyboard focus model (WAI-ARIA grid pattern) | ✅ | |
| Scroll (vertical + horizontal, virtualized) | ✅ | |
| Basic filters | ✅ | |
| Search (`searchText` global + `quickFilter` opt-in #495) | ✅ | |
| Group-by (URL-flag-driven recipe at `?groupBy=`) | ✅ | |
| Column reorder / visibility / state-persistence | ✅ | |
| Master-detail rows | ✅ | |
| Column groups (multi-row headers) | ✅ | |

### Editing (v0.4) — ✅ COMPLETE

| Feature | Status | Notes |
| --- | --- | --- |
| `<BcEditGrid>` commit lifecycle | ✅ | prepare/validate/commit/optimistic/rollback/stale |
| 9 built-in editors | ✅ | text/number/date/datetime/time/select/multi-select/autocomplete/checkbox |
| Validation framework + dirty tracking + visible errors | ✅ | |
| Server-commit hooks + optimistic UI | ✅ | |
| Full keyboard editing (Enter/F2/Esc/Tab/Shift-Tab/click-outside) | ✅ | |
| In-cell editor mode | ✅ | text/number/checkbox/time/date/datetime |
| Custom editor recipe | ✅ | `docs/recipes/custom-editors.md` |
| Editor render-prop slots — single-input cluster | ✅ | `inputComponent` on text/number/date/datetime/time + `checkboxComponent` |
| Editor render-prop slots — combobox cluster | ⏳ | `triggerComponent` + `optionItemComponent` deferred to v0.7 PR-C3 (lands on shadcn Combobox foundation) |

### Server row model (v0.5) — ✅ COMPLETE

| Feature | Status | Notes |
| --- | --- | --- |
| `useServerPagedGrid` / `useServerInfiniteGrid` / `useServerTreeGrid` | ✅ | turnkey hooks |
| `useBcGridState` state-persistence hook | ✅ | |
| Mode-switch (paged ↔ infinite ↔ tree) | ✅ | RFC stages 1-3.3 |
| Block fetcher + LRU cache + stale-response handling | ✅ | |
| Server-side sort / filter / group orchestration | ✅ | |
| Block error retry (`onBlockError` + `autoRetryBlocks`) | ✅ | alpha.2 #491 |
| Server display column order | ✅ | alpha.2 #487 |
| `bound`/`serverProps` dual-output (paged) | ✅ | alpha.2 #484; infinite/tree IMPL deferred (#485) |
| Server tree expansion persistence | ✅ | #496 |
| CSV export (`getExportPlan` + `streamServerGridToCsv`) | ✅ | #498 |
| Cursor-pagination IMPL | 🚪 | deferral doc #499 — pending dual-output extraction; **recommend post-1.0** |

### Spreadsheet flows (v0.6) — ✅ COMPLETE

| Feature | Status | Notes |
| --- | --- | --- |
| Range selection model + state machine | ✅ | |
| Clipboard copy (TSV / HTML) | ✅ | |
| Paste-from-Excel | ✅ | #380 / #467 |
| Fill handle + drag-extend | ✅ | #436 |
| Fill handle series detection | ✅ | numeric / date / weekday / month #456 |
| `BcGridApi.applyRowPatches` bulk primitive | ✅ | #437 |
| Multi-cell delete with confirm | ✅ | #471 |
| Per-cell undo/redo | ✅ | #454 |
| Row drag-drop hooks | ✅ | #440 |

### State persistence (v0.6) — ✅ COMPLETE

| Feature | Status | Notes |
| --- | --- | --- |
| `initialScrollOffset` + `onScrollChange` + `getScrollOffset` | ✅ | #450 |
| `editingCell` controlled prop | ✅ | #482 |
| Controlled `expansion` / `selection` / `layoutState` | ✅ | |
| Saved-view DTO + helpers + recipe | ✅ | #423 / #441 |
| `preserveScroll/Selection/Focus/ExpansionOnViewChange` | ✅ | #444 / #496 |

### Tree row model (v0.6) — ✅ COMPLETE

| Feature | Status | Notes |
| --- | --- | --- |
| Client tree phases 1+2 (`treeData` + outline column + sort/filter through tree) | ✅ | #447 / #449 |
| Phase 2.5 — per-subtree sort + parent-row aggregations | ✅ | #452 |
| Phase 3 — cycle detection / keepAncestors / outline keyboard nav | ✅ | #455 |
| Server tree row model | ✅ | already in v0.5 |

### Chrome (v0.5/v0.6) — ✅ COMPLETE on surface; v0.7 refactor pending

| Feature | Status | Notes |
| --- | --- | --- |
| Status bar | ✅ | |
| Sidebar tool panels (columns / filters / pivot) | ✅ | |
| Default context menu (Server / Column / View / Editor / Group submenus) | ✅ | hand-rolled — replaced via v0.7 RFC |
| Toolbar render-prop with composable sub-slots | ✅ | #492 |
| Bulk-action toolbar | ✅ | #439 |
| Pinned totals row | ✅ | #446 |
| Server-grid actions column + Shift+E / Shift+Delete shortcuts | ✅ | #453 / #464 |
| Quick filter input | ✅ | #495 |

### Filters (v0.4-v0.6) — ✅ COMPLETE

| Feature | Status | Notes |
| --- | --- | --- |
| Inline + popup filter variants | ✅ | |
| Set / date-range / number-range / boolean / text filters | ✅ | |
| Filter registry | ✅ | #472 |
| ERP filter operators (text not-equals, fiscal tokens, current-user/team) | ✅ | #429 |
| Custom filter extension recipe | ✅ | |
| Pass-2 (regex/fuzzy + MTD/QTD/YTD) | ⏳ | worker2 queue, low priority |

---

## Outstanding for v1.0

### v0.7 — Architecture correction (RFC ratified 2026-05-04)

| PR | Owner | Status | Defer? |
| --- | --- | --- | --- |
| PR-A1 — Radix runtime deps + shadcn primitive scaffold | worker2 | 🔎 review #501 | 🔒 must ship |
| PR-A2 — happy-dom test infra | worker2 | ❌ not started | 🔒 must ship |
| PR-B1 — Replace context-menu (Radix DropdownMenu / ContextMenu) | worker2 | ❌ not started | 🔒 must ship |
| PR-B2 — Replace tool panels (Radix Tabs / Dialog) | worker2 | ❌ not started | 🔒 must ship |
| PR-B3 — Replace tooltip + popover (Radix Tooltip / Popover) | worker2 | ❌ not started | 🔒 must ship |
| PR-B4 — Replace icon files (lucide-react sweep) | worker2 | ❌ not started | 🔒 must ship |
| PR-C1 — shadcn Combobox foundation (cmdk) | worker3 | ❌ blocked on PR-A1 | 🔒 must ship |
| PR-C2 — Migrate select / multi-select / autocomplete editors | worker3 | ❌ blocked on PR-C1 | 🔒 must ship |
| PR-C3 — Wire deferred `triggerComponent` / `optionItemComponent` slots | worker3 | ❌ blocked on PR-C2 | 🔒 must ship |
| PR-D — Sweep + design-doc update | coordinator | ❌ blocked on B+C | 🔒 must ship |

**Coordinator note:** the architecture correction is non-negotiable per maintainer instruction. Public API preserved verbatim; consumer churn limited to internal CSS class names + DOM structure. Sequencing: PR-A1 unblocks both PR-A2 (worker2) and PR-C1 (worker3); after PR-A1 lands, Block B and Block C run in parallel.

### v0.8 — Aggregations / Pivot / Export

| Feature | Status | Owner | Defer? | Notes |
| --- | --- | --- | --- | --- |
| Aggregation engine (`@bc-grid/aggregations`) | ✅ | n/a | n/a | shipped, used by client tree phase 2.5 + group-by + pinned totals |
| Pivot engine (`pivot()` in aggregations) | ✅ | n/a | n/a | engine done |
| Pivot UI — `pivotToolPanel.tsx` | 🟡 | unassigned | 🚪 **defer post-1.0** | drag-to-pivot row/col/values UI is partial; bsncraft hasn't asked for it; recommend ship as post-1.0 if the panel renders existing pivot state but doesn't yet support drag-rearrangement |
| Footer/status aggregation (filters/grouping/selection-aware) | ✅ | n/a | n/a | pinned totals row #446 + status bar segment |
| CSV export (server-page-stream) | ✅ | n/a | n/a | #498 |
| XLSX export (ExcelJS peer-dep) | ❌ | unassigned | 🚪 **defer post-1.0** | bsncraft can use CSV → Excel-open path; recipe for ExcelJS in post-1.0 |
| PDF export (jsPDF peer-dep) | ❌ | unassigned | 🚪 **defer post-1.0** | bsncraft has its own report-print pipeline; not requested |

**Coordinator recommendation:** v0.8 collapses to "audit pivot UI completeness, ship a recipe for ExcelJS-from-CSV, document XLSX/PDF as post-1.0."

### v0.9 — Productivity surface

| Feature | Status | Owner | Defer? | Notes |
| --- | --- | --- | --- | --- |
| Client-side pagination UI | ❌ | unassigned | 🚪 **defer post-1.0** | server-paged exists; client pagination is a UI shell that users can build with the existing range / scroll APIs in ~30 LOC; recipe + post-1.0 ship |
| Examples app — productivity flows without hidden flags | 🟡 | unassigned | 🔒 **must ship** | the four hero spike grids (colour-selection / document-management / production-estimating / sales-estimating) cover the surface but rely on URL flags |
| AG Grid migration guide (Community + Enterprise) | ❌ | unassigned | 🚪 **defer post-1.0** | recommend cut a sketch + commit to v1.1 with consumer-tested polish |

### v0.10 — RC hardening

| Feature | Status | Owner | Defer? | Notes |
| --- | --- | --- | --- | --- |
| WCAG 2.1 AA deep-pass — code-pass | ✅ | worker3 | n/a | 9/9 editors PASS post #493 |
| WCAG deep-pass — manual NVDA / JAWS / VoiceOver | ❌ | unassigned | 🔒 **must ship** | required by `Definition of Done — 1.0`; non-negotiable for ERP shipping |
| Browser compat matrix (Chromium / Firefox / WebKit / Edge) | 🟡 | coordinator | 🔒 **must ship** | Playwright multi-project config exists; needs a documented matrix run + report |
| Mobile/touch fallback (44px targets, double-tap edit, long-press menu, range handles) | ❌ | unassigned | 🚪 **defer post-1.0** | `design.md §2 Non-goals` explicitly says "Mobile-first interactions deferred — desktop-first; touch fallback at 1.0+"; recommend ship as 1.0+ |
| Edit-cell paint <16ms benchmark | ⏳ | coordinator | 🚪 **defer post-1.0** | currently skipped pending Track 1; smoke perf passes overall |
| Smoke + nightly perf baseline refresh | ✅ | n/a | n/a | smoke 3/3 green; nightly per-PR drift guard at 10% |

### v1.0 GA gates

| Gate | Status | Owner | Defer? | Notes |
| --- | --- | --- | --- | --- |
| bsncraft consumer migration (≥ -100 LOC wrapper) | ⏳ | bsncraft team | 🔒 must ship | customers grid migration in flight |
| Public API frozen for semver stability | 🟡 | coordinator | 🔒 must ship | informally pinned via api-surface manifest; v1.0 locks formally |
| All P0/P1 closed | ⏳ | all | 🔒 must ship | track in `bsncraft-issues.md` |
| `apps/docs` deployed publicly | ❌ | coordinator | 🚪 **defer post-1.0** | apps/docs builds locally; recommend point to GitHub Packages + README until traffic justifies the host |
| Pricing/licence model decision | ❌ | maintainer | 🔒 must ship | architectural decision, not engineering |
| Public registry publish decision (npmjs.com vs GitHub Packages) | ❌ | maintainer | 🔒 must ship | currently GitHub Packages; npmjs.com is a launch lever |
| Maintainer explicit sign-off | ❌ | maintainer | 🔒 must ship | non-negotiable per `release-milestone-roadmap.md` |

---

## Fast-track sequencing

If maintainer ratifies all 🚪 **defer post-1.0** recommendations, the path to v1.0 is:

1. **v0.6.0 GA** — ship alpha.2 work train as GA after bsncraft soak signs off
2. **v0.7.0** — architecture correction (worker2 chrome lane + worker3 editor lane, parallel after PR-A1 lands; PR-D coordinator sweep last)
3. **v1.0 prep** — runs as v0.7 work lands, no strict ordering between these:
   - bsncraft customers migration completes
   - WCAG deep-pass manual NVDA / JAWS / VoiceOver run
   - Browser compat matrix documented
   - Examples app cleanup (no hidden URL flags for hero flows)
   - Public API formally locked + version bump
   - Maintainer pricing / registry / sign-off

**v1.1 post-1.0 backlog if 🚪 deferrals stand:** charts, RTL, mobile/touch fallback, AG Grid migration guide, XLSX export, PDF export, pivot drag-UI, client pagination UI, cursor-pagination IMPL, edit-cell paint <16ms benchmark, `apps/docs` public deploy.

**Items the coordinator does NOT recommend deferring** (must-ship for 1.0):
- Architecture correction (RFC v0.7 — public API stability concern)
- WCAG manual screenreader audit (ERP shipping requirement)
- Browser compat matrix (regression risk)
- bsncraft consumer migration (the original 0.5 milestone gate)
- Public API formal lock + maintainer sign-off

---

## Update log

- 2026-05-04 (PM, post-#499) — Coordinator created this file at maintainer instruction. Audit synthesis from `docs/coordination/release-milestone-roadmap.md` + `docs/roadmap.md` + `docs/queue.md` + 2026-05-04 source-side verification.
