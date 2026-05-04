# bc-grid Status — v0.0 → v1.0

**Owner:** Claude coordinator (`~/work/bc-grid`).
**Update cadence:** after every merge train, every release cut, and when scope decisions change.
**Last updated:** 2026-05-04 by Claude coordinator after **PR-C2 #527** merged. v0.6.0-alpha.3 is published; v0.7 architecture correction is **8/9 PRs complete** — only PR-C3 (deferred render-prop slots) and PR-D (coordinator sweep) remain. Both `packages/react/src/internal/*` and `packages/editors/src/internal/*` are clean — every hand-rolled chrome and editor combobox replaced by Radix + shadcn + cmdk.

This file is the single fast-track tracker toward v1.0. It is **not** the milestone roadmap (`docs/coordination/release-milestone-roadmap.md` is the binding gate doc). This file's job is to give the maintainer a one-look view of "what's left, what could be deferred, what we're choosing to keep."

**Legend:**

- ✅ **shipped** — feature lands in published packages, public API + tests included
- 🟡 **partial** — engine landed, UI/integration/recipe still pending
- ⏳ **in flight** — PR open or work assigned to a worker
- ❌ **not started**
- 🚪 **deferred to post-1.0** — maintainer-ratified deferral; lives in v1.1 backlog
- 🔒 **must ship for 1.0** — non-negotiable per coordinator + maintainer

---

## Currently published

`@bc-grid/*@0.6.0-alpha.2` — published 2026-05-04 to GitHub Packages. Full release notes: https://github.com/bc-grid/bc-grid/releases/tag/v0.6.0-alpha.2.

**Alpha.3 candidate train (post-alpha.2, already on `main`):** editor a11y fix (#493), quick filter (#495), server-row cache stats (#470), client tree row model phase 2.5 (#452) + phase 3 (#455), submenu collision-flip "neither side fits" fix (3ff7a16), server-grid CSV export (#498), server tree expansion persistence (#496), cursor-pagination IMPL deferral doc (#499), v1.0 API surface freeze audit (#502), shadcn/Radix architecture-correction RFC (894f53f), Radix foundation PR-A1 (#501).

**Decision pending:** cut alpha.3 OR roll straight to GA — pending bsncraft consumer soak feedback on alpha.2.

---

## Shipped feature audit — collapsed

The full inventory of every feature shipped v0.0 → v0.6.0-alpha.2 is preserved at the bottom of this file in HTML comments. Categories: foundation (v0.1 → v0.2), **read-only grid (v0.2) — sort / resize / pin / scroll / filters / search / group-by / column reorder+visibility / master-detail / column groups / client + manual pagination**, editing (v0.4), server row model (v0.5), spreadsheet flows (v0.6), state persistence (v0.6), tree row model (v0.6), chrome (v0.5/v0.6), filters (v0.4-v0.6). Roughly 70-75% of v1.0 surface area is shipped; everything below is what's left.

---

## Outstanding for v1.0

### v0.7 — Architecture correction (RFC ratified 2026-05-04)

| PR | Owner | Status | Defer? |
| --- | --- | --- | --- |
| PR-A1 — Radix runtime deps + shadcn primitive scaffold | worker2 | ✅ #501 + resync #503 merged 2026-05-04 | 🔒 |
| PR-A2 — happy-dom test infra | worker2 | ✅ #504 merged 2026-05-04 | 🔒 |
| PR-B1 — Replace context-menu (Radix DropdownMenu / ContextMenu) | worker2 | ✅ #510 merged 2026-05-04 | 🔒 |
| PR-B2 — Replace tool panels (Radix Tabs / Dialog) | worker2 | 🟡 #521 in review | 🔒 |
| PR-B3 — Replace tooltip + popover (Radix Tooltip / Popover) | worker2 | ✅ #518 merged 2026-05-04 | 🔒 |
| PR-B4 — Replace icon files (lucide-react sweep) | worker2 | ❌ ready | 🔒 |
| PR-C1 — shadcn Combobox foundation (cmdk) | worker3 | ❌ ready (PR-A1 unblocked) | 🔒 |
| PR-C2 — Migrate select / multi-select / autocomplete editors | worker3 | ❌ blocked on PR-C1 | 🔒 |
| PR-C3 — Wire deferred `triggerComponent` / `optionItemComponent` slots | worker3 | ❌ blocked on PR-C2 | 🔒 |
| PR-D — Sweep + design-doc update | coordinator | ❌ blocked on B+C | 🔒 |

**Coordinator note:** the architecture correction is non-negotiable per maintainer instruction. Public API preserved verbatim; consumer churn limited to internal CSS class names + DOM structure. Sequencing: PR-A1 unblocked both PR-A2 (worker2) and PR-C1 (worker3); after PR-A1 lands, Block B and Block C run in parallel.

### v1.0 prep work (running in parallel with v0.7)

| Item | Owner | Status | Defer? | Notes |
| --- | --- | --- | --- | --- |
| API surface freeze audit (4 RENAME + 5 INTERNALIZE + 8 DEPRECATE + 3 cross-package symmetry) | worker1 | ⏳ slice 1 ✅ #505 (3 cross-package symmetry + server-row-model enforced + 1 deprecation comment); 4 RENAME + 4 INTERNALIZE + 7 DEPRECATE remaining | 🔒 | per `docs/design/v1-api-surface-audit.md §15`; lands as one or more PRs |
| API surface 13 OPEN QUESTION items | maintainer | ❌ ready | 🔒 | needs a maintainer pass; resolutions go in audit doc §16 |
| Browser compat matrix doc | worker1 | ❌ queued | 🔒 | `v1-browser-compat-matrix-doc` — single matrix table per `release-milestone-roadmap.md` v0.10 |
| Examples app — productivity flows without hidden URL flags | worker1 | ❌ queued | 🔒 | `v1-examples-app-cleanup` — landing card + flag pre-applied links per hero spike |
| bsncraft consumer migration (≥ -100 LOC wrapper) | bsncraft team | ⏳ | 🔒 | customers grid migration in flight; original 0.5 milestone gate |
| Public API formally locked + v1.0 version bump | coordinator | ❌ | 🔒 | runs after API freeze audit lands |
| All P0/P1 closed in `bsncraft-issues.md` | all | ⏳ | 🔒 | tracked separately |
| Maintainer explicit sign-off | maintainer | ❌ | 🔒 | the actual GA cut decision |

### Deferred to post-1.0 (v1.1+ backlog) — maintainer ratified 2026-05-04

These items are explicitly OUT of scope for v1.0. Re-open the discussion in v1.1 planning when bsncraft signals demand.

| Item | Reason for deferral | v1.1+ trigger |
| --- | --- | --- |
| 🚪 **Pivot drag-UI completeness** | Engine + panel render existing pivot state. Drag-to-pivot rearrange UI is partial. bsncraft hasn't asked for it. | First consumer ask, or 1.1 sprint planning |
| 🚪 **XLSX export (ExcelJS peer-dep)** | bsncraft uses CSV → Excel-open path. Recipe is sufficient until a consumer needs native `.xlsx`. | First `bsn-issues.md` ask |
| 🚪 **PDF export (jsPDF peer-dep)** | bsncraft has its own report-print pipeline. Not requested. | First consumer ask |
| 🚪 **AG Grid migration guide (Community + Enterprise)** | Sketch is fine for v1.0. Polished guide needs 2+ test users to validate; that's v1.1 work. | After v1.0 launch + first 2 community migrations |
| 🚪 **Mobile / touch fallback** | `design.md §2 Non-goals` explicitly says "Mobile-first interactions deferred — desktop-first; touch fallback at 1.0+." | Stated as 1.0+ from day 1 |
| 🚪 **`apps/docs` public deploy** | Builds locally. Until traffic justifies the host, README + GitHub Packages registry covers the audience. | When external consumer count > maintainer's bandwidth for direct support |
| 🚪 **Edit-cell paint <16ms benchmark** | Smoke perf 3/3 passes overall. Specific micro-benchmark currently skipped pending Track 1. | Track 1 land |
| 🚪 **Cursor-pagination IMPL** | Deferral doc #499 — pending dual-output extraction. Server-paged + offset-pagination cover bsncraft. | First consumer with a cursor-only API |
| 🚪 **ERP filter operators pass-2** (regex/fuzzy + MTD/QTD/YTD) | Pass-1 covers bsncraft's needs. Low priority in worker2 queue. | First consumer ask |
| 🚪 **`useServerInfiniteGrid` / `useServerTreeGrid` dual-output IMPL** | Deferral doc #485. Paged dual-output #484 covers the demonstrated bsncraft pattern. | First consumer with a `<BcGrid>`-wrapping infinite or tree pattern |
| 🚪 **Charts integration depth** | `design.md §2 Non-goals` — "Chart libraries are better at this; out-of-scope until post-1.0." | Stated as post-1.0 from day 1 |
| 🚪 **Right-to-left languages** | `design.md §2 Non-goals` — "Q4 minimum." | Stated as post-1.0 from day 1 |
| 🚪 **Bug-for-bug AG Grid parity** | `design.md §1 Mission` — "continuous post-1.0 backlog; not a v1.0 gate." | Stated as continuous post-1.0 |
| 🚪 **WCAG manual NVDA / JAWS / VoiceOver pass** | Code-pass audit (#490) shows 9/9 editors PASS. Manual screenreader audit becomes load-bearing only when shipping to regulated industries (healthcare, finance, gov), facing public ADA / Section 508 scrutiny, or producing a VPAT for an external customer. None applies to a single-consumer ERP. axe-core + the code-pass coverage is sufficient for v1.0. | bsncraft customer raises a screenreader complaint, OR external commercial release |
| 🚪 **Pricing / licence model decision** | Not engineering; future-launch business decision. Packages publish as `UNLICENSED` to GitHub Packages today; that works for bsncraft (the only consumer). bc-grid moves into the bsncraft monorepo soon, removing the standalone-product packaging question entirely. | Decision to commercialize bc-grid as a standalone product to external customers |
| 🚪 **Public registry publish decision (npmjs.com vs GitHub Packages)** | GitHub Packages works for bsncraft. npmjs.com is a launch lever for a public release that isn't currently planned. | Decision to publish externally |

---

## Fast-track sequencing

1. **v0.6.0 GA** — ship alpha.2 work train as GA after bsncraft soak signs off.
2. **v0.7.0** — architecture correction (worker2 chrome lane + worker3 editor lane, parallel after PR-A1 landed; PR-D coordinator sweep last). Worker1 runs v1.0 prep in parallel.
3. **v1.0 prep wraps** — bsncraft migration completes, WCAG manual screenreader pass, browser compat matrix doc, examples app cleanup, API formal lock, maintainer pricing / registry / sign-off.
4. **v1.0 GA cut.**

---

## Update log

- **2026-05-04 (PM, post-#502)** — Maintainer ratified post-1.0 deferral list (pivot drag-UI, XLSX, PDF, client pagination UI, AG Grid migration guide, mobile/touch, public docs deploy, edit-cell paint benchmark, cursor-pagination IMPL, ERP filter pass-2, infinite/tree dual-output IMPL, charts, RTL, bug-for-bug parity). Shipped feature audit collapsed into HTML comments at file bottom. Worker1 pivoted from server-grid lane to v1.0 prep lane (handoff updated `2862750`).
- **2026-05-04 (PM, post-#499)** — Coordinator created this file at maintainer instruction. Audit synthesis from `docs/coordination/release-milestone-roadmap.md` + `docs/roadmap.md` + `docs/queue.md` + 2026-05-04 source-side verification.

---

<!-- ===========================================================================
     SHIPPED FEATURE AUDIT — collapsed by maintainer instruction 2026-05-04 PM
     to keep this file focused on v1.0 outstanding work.

     Uncomment any block below if you need to scan what's already in.
     Source: `docs/coordination/release-milestone-roadmap.md` + 2026-05-04
     source-side verification.
     ===========================================================================

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
| Client-side pagination UI | ✅ | `BcGridPagination` + `pagination?: boolean` + `pageSizeOptions` + `paginationMode: "client" \| "manual"` + `paginationTotalRows` + `onPaginationChange` + saved-view persistence (`packages/react/src/pagination.tsx`, 211 LOC; 421-LOC test suite at `pagination.test.tsx`; demo: `apps/examples/?pagination=1`) |

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

=========================================================================== -->
