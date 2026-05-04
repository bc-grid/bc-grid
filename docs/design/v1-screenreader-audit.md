# v1.0 screenreader audit (non-editor surfaces)

**Status:** code-pass complete; **2 GAPs identified** (client-tree + server-tree modes don't surface treegrid ARIA semantics). Workers run unit-test + source review only — no NVDA / JAWS / VoiceOver scripts; manual screenreader pass deferred to post-1.0 per release-milestone-roadmap.md.
**Date:** 2026-05-04
**Owner:** worker1 (Claude — server-grid stability + v1.0 prep lane)
**Source contract:** `docs/design/accessibility-rfc.md`
**Related:** `docs/design/v1-editor-a11y-audit.md` (#490 — editor surface), `docs/design/a11y-impl-report.md` (legacy — pre-pinned-lane architecture).
**Roadmap gate:** v0.10 RC Hardening — "Screenreader spot-checks cover pinned columns, row/col counts, treegrid/group rows, editing announcements, and status regions."

This document walks the non-editor screen-reader surface. The editor surface (focus contract, edit-state ARIA, edit announcements, per-editor keyboard) is covered in `v1-editor-a11y-audit.md` (9/9 PASS). The two complement each other.

---

## Verdict matrix

| Surface | Description | Verdict |
| --- | --- | --- |
| **Pinned columns** | DOM order matches visual order; `aria-colindex` set explicitly per cell. | **PASS** |
| **Row / col counts** | `aria-rowcount` + `aria-colcount` on grid root; `aria-rowindex` on every row; `aria-colindex` on every cell. | **PASS** |
| **Group rows (grid-side `groupBy`)** | `role="treegrid"` + `aria-level` + `aria-expanded` on group rows; `aria-level` on data rows. | **PASS** |
| **Client-tree rows (`BcGridProps.treeData`)** | Tree-data mode shipped in v0.6 (#447). `role="treegrid"` + `aria-level` not wired. | **GAP** |
| **Server-tree rows (`<BcServerGrid rowModel="tree">`)** | Hierarchical server data. `role="treegrid"` + row `aria-level` not wired; only the inline tree-toggle button has `aria-expanded`. | **GAP** |
| **Edit announcements** (route) | `editCommittedAnnounce` (polite) + `editValidationErrorAnnounce` / `editServerErrorAnnounce` (assertive). | **PASS** (covered in editor audit) |
| **Sort change** | `sortAnnounce` / `sortClearedAnnounce` polite. | **PASS** |
| **Filter change** | `filterAnnounce` / `filterClearedAnnounce` polite. | **PASS** |
| **Paste** | `pasteCommittedAnnounce` polite + `pasteRejectedAnnounce` assertive. | **PASS** |
| **Status bar** | Visual-only `<section aria-label>`; announcements route through grid's central live region (correct — no double-announce). | **PASS** |

**Result: 8 PASS / 2 GAP.** Both gaps share the same root cause and one fix.

---

## 1. Pinned columns

**Code:** `grid.tsx:4078-4239` (header rows), `grid.tsx:4470-4540` (body rows), `bodyCells.tsx:282`.

The DOM order is `pinned-left lane → center cells → pinned-right lane`, matching the visual layout. Each cell carries an explicit `aria-colindex` from the resolved column position (1-indexed per ARIA spec). Screen readers announce columns in DOM order, so left-pinned cells announce first, then center, then right — matching what the sighted user sees.

**Pinned-lane wrappers** (`<div data-bc-grid-pinned-lane="left|right">`) carry no role — they are layout-only divs. Cells flow through them transparently to AT.

**Verified against `docs/coordination/pinned-lane-positioning-decision.md` Option B** (count-agnostic 3-track template; ratified 2026-05-03 by all 3 workers). The template change does not affect AT semantics — only positioning.

**Verdict: PASS.**

---

## 2. Row / col counts + per-row / per-cell indices

**Code:** `grid.tsx:4004-4018` (root), `grid.tsx:4086-4408` (header + body row indices), `headerCells.tsx:156-484` + `bodyCells.tsx:282-428` (cell colindex), `aggregations.tsx:117-142` (aggregation row + cells).

- **`aria-rowcount`** — total rows in the underlying dataset, including chrome rows (column headers + filter row + aggregation totals). For manual pagination with a known server total, surfaces the server total — not just the current page. Consistent with `docs/design/accessibility-rfc.md §aria-rowcount`.
- **`aria-colcount`** — `resolvedColumns.length`, including hidden-but-pinned-for-layout columns.
- **`aria-rowindex`** — every row (header group, leaf header, filter row, body, group row, aggregation row) carries a 1-indexed `aria-rowindex` accounting for `bodyAriaRowOffset` (header rows shift body indices). Consumer-visible row N matches index N for sighted ↔ AT parity.
- **`aria-colindex`** — every cell (header, body, group-cell, aggregation-cell, detail-column) carries a 1-indexed `aria-colindex`. The detail-column always reports `aria-colindex={1}` (it sits visually at column 1).

**`aria-activedescendant`** on the grid root tracks the active cell DOM id — focus stays on the grid root, AT follows the active descendant. Standard ARIA grid pattern.

**Verdict: PASS.**

---

## 3. Group rows — grid-side `groupBy`

**Code:** `grid.tsx:4001` (`role={groupingActive ? "treegrid" : "grid"}`), `grid.tsx:4404-4444` (group row), `grid.tsx:4480-4482` (data-row `aria-level` only when grouping active).

When `groupedRowModel.active` is true (consumer set `groupBy: ["columnId"]`):

- Grid root flips to `role="treegrid"`.
- Group rows render with `aria-level` (depth, 1-indexed) + `aria-expanded` (true / false).
- Data rows (children of expanded groups) carry `aria-level` matching their group depth.

This matches the WAI-ARIA Authoring Practices treegrid pattern. Screen readers announce "Level 2, expanded" on a 2nd-level group row, descend through children, and announce "Collapsed" if the user collapses.

**Verdict: PASS.**

---

## 4. Client-tree rows — `BcGridProps.treeData` (v0.6 #447) — **GAP**

**Code:** `grid.tsx:997` (`treeModeActive`), `grid.tsx:4001` (root role), `grid.tsx:4480-4482` (data-row `aria-level`).

The v0.6 client-tree row model (`BcGridProps.treeData` + `getRowParentId`) builds a hierarchical row index via `buildClientTree` (#447, #452, #455). Body rows are emitted in tree-traversal order with `entry.level` populated. **However**:

- `role={groupingActive ? "treegrid" : "grid"}` only checks `groupingActive` (grid-side `groupBy`), not `treeModeActive`. Result: client-tree mode renders `role="grid"`.
- `aria-level={groupingActive ? entry.level : undefined}` — same bug; `entry.level` IS populated for client-tree rows but never surfaced to AT.

**Impact:** screen readers experience client-tree mode as a flat grid. The visual indent from the outline-column renderer is invisible to AT. Users can't navigate by depth or know where they are in the hierarchy.

**Recommended fix (small):** extend the two conditionals to OR-in a "tree mode active" flag:

```tsx
// grid.tsx:4001
role={groupingActive || treeModeActive ? "treegrid" : "grid"}
// grid.tsx:4482
aria-level={groupingActive || treeModeActive ? entry.level : undefined}
```

`entry.level` is already populated by `buildClientTree`. No data plumbing change needed.

**Pre-existing aria-expanded** — the outline-column renderer (`bodyCells.tsx:356`) already sets `aria-expanded` on the disclosure button when a row has children. That part is fine.

**Verdict: GAP. Severity: P2** (semantic correctness for AT users; no functional break).

---

## 5. Server-tree rows — `<BcServerGrid rowModel="tree">` — **GAP**

**Code:** `serverGrid.tsx:2570-2596` (tree-cell renderer with toggle button), `grid.tsx:4001 / 4480-4482` (same shared root + data-row code path).

`<BcServerGrid rowModel="tree">` mode flows ServerTreeRow data through the same body-row rendering path as client-tree mode. Same bug for the same reason: `groupingActive` is grid-side groupBy only.

The inline tree-toggle `<button aria-expanded aria-label>` (line 2580) is correct — it announces "Expand row" / "Collapse row" + state. **But** the row container doesn't surface its `aria-level`, so AT users can't tell hierarchy depth even though the toggle works.

**Recommended fix:** same one-line change as §4. The server-tree adapter already populates `entry.level` (via `serverTreeRowEntries` in `serverGrid.tsx`).

**Verdict: GAP. Severity: P2** (same as §4).

---

## 6. Edit announcements (route)

Covered in `docs/design/v1-editor-a11y-audit.md §"Framework wiring"`. All 9 editors PASS. Route through `politeMessage` (commit) / `assertiveMessage` (validation + server errors) on the grid-root live regions (`grid.tsx:4951-4968`).

**Verdict: PASS** (cross-reference).

---

## 7. Sort change announcements

**Code:** `gridInternals.ts:1207-1223`.

`useLiveRegionAnnouncements` watches `sortState`. On change:
- New / changed sort → polite `messages.sortAnnounce({ columnLabel, direction })`.
- Sort cleared → polite `messages.sortClearedAnnounce()`.

Multi-column sort: announces the most-recently-changed column. Acceptable — multi-sort is an advanced pattern and announcing every sorted column at once would be noisy.

**Verdict: PASS.**

---

## 8. Filter change announcements

**Code:** `gridInternals.ts:1226-1241`.

Watches `activeFilter`. On change:
- Filter cleared → polite `messages.filterClearedAnnounce({ totalRows })`.
- Filter applied → polite `messages.filterAnnounce({ filteredRows, totalRows })`.

Per-column filter changes route through the same path (the active filter aggregates all column filters per `gridInternals.ts:1228-1235`).

**Verdict: PASS.**

---

## 9. Paste announcements

**Code:** `grid.tsx:2410-2448`.

- Paste committed → polite `pasteCommittedAnnounce({ count })`.
- Paste rejected (validation error / TSV parse error / per-row error) → assertive `pasteRejectedAnnounce({ error })`.

Paste covers the only multi-cell mutation surface beyond editing; rest of the grid mutations route through editor announcements.

**Verdict: PASS.**

---

## 10. Status bar

**Code:** `statusBar.tsx:18-36`.

`<BcStatusBar>` renders as `<section className="bc-grid-statusbar" aria-label={ariaLabel}>` — a labelled landmark. Each segment is a plain `<div>` with no `aria-live`. The doc comment makes the contract explicit:

> The status bar is purely visual: announcements route through the grid's central polite live region, not `aria-live` on this root.

This is the correct pattern. If the status bar carried `aria-live`, every per-segment update (selection count, filtered-row count, aggregation totals) would announce on every grid mutation — extremely noisy. Routing through the central live region with deduplication ensures AT users get one announcement per logical change.

**Verdict: PASS.**

---

## 11. Selection state on rows

**Code:** `grid.tsx:4483-4484`.

Each data row carries `aria-selected={selected || undefined}` and `aria-disabled={disabled || undefined}`. The `|| undefined` pattern emits the attribute only when truthy — cleaner than `aria-selected="false"` on every row.

**Selection count announcements:** routed through the central live region per `accessibility-rfc §Live Regions`. Selection changes announce as polite ("3 rows selected").

**Verdict: PASS.**

---

## 12. Header semantics

**Code:** `headerCells.tsx:62-260`.

- `aria-sort` resolves via `resolveAriaSort` helper — emits `"ascending" | "descending"` only when sortable + sorted; emits no attribute when unsortable (cleaner than `aria-sort="none"` on every column).
- `aria-haspopup="dialog"` on filter-popup triggers; `aria-haspopup="menu"` on column-menu triggers.
- `aria-controls={open ? id : undefined}` on the popup triggers — only when the popup is mounted.
- `aria-pressed` on filter operator toggles (blank, not-blank, case-sensitive, regex, includeMin, includeMax).

All idiomatic ARIA usage. `aria-sort` placement on the columnheader is per WAI-ARIA grid pattern.

**Verdict: PASS.**

---

## 13. Detail-panel disclosure

**Code:** `detailColumn.tsx:69-112`.

The detail-row toggle is a `<button aria-expanded aria-controls={panelId}>` — when expanded, the panel below the row is referenced by `aria-controls`. The detail-column cell itself reports `aria-colindex={1}` (visually first column).

**Verdict: PASS.**

---

## Recommended follow-ups

### Single-fix: extend treegrid ARIA to client-tree + server-tree modes

Both §4 and §5 GAPs share one root cause. A small PR can fix both:

```tsx
// packages/react/src/grid.tsx — replace `groupingActive` in two places:
role={groupingActive || treeModeActive || serverTreeActive ? "treegrid" : "grid"}
aria-level={groupingActive || treeModeActive || serverTreeActive ? entry.level : undefined}
```

Where:
- `treeModeActive` is already a local variable (line 997).
- `serverTreeActive` needs to be derived — `<BcServerGrid rowModel="tree">` doesn't pass a flag to `<BcGrid>` directly today. Either extend `BcGridProps` with an internal `__bcServerTreeActive` flag (mirrors the `__bcServerRowEntryOverrides` INTERNALIZE pattern from #507) OR detect it via the `entry.level > 0` invariant on any row.

**Estimated effort:** 1-2 hours. **Owner:** worker1 (server-tree side) or worker2 (chrome-adjacent if treated as ARIA-chrome). Coordinator routes.

**Test plan:** add unit test asserting `role="treegrid"` + `aria-level` on body rows for both modes, mirroring the existing groupBy treegrid test in `grid.test.tsx`.

### Deferred: manual NVDA / JAWS / VoiceOver pass

Per `release-milestone-roadmap.md` deferral commit (2026-05-04 PM):

> Manual screenreader audit becomes load-bearing only when shipping to regulated industries (healthcare/finance/gov), facing public ADA / Section 508 scrutiny, or producing a VPAT for external customers. None applies right now.

The code-pass audits (#490 + this doc) cover the engineering side of the v0.10 RC Hardening gate. Manual screenreader passes are post-1.0.

---

## Cross-reference with existing docs

- `docs/design/accessibility-rfc.md` — contract this audit verifies.
- `docs/design/v1-editor-a11y-audit.md` — editor surface (9/9 PASS).
- `docs/design/a11y-impl-report.md` — legacy a11y impl notes (pre-pinned-lane architecture; some sections superseded).
- `docs/coordination/release-milestone-roadmap.md §v0.10` — RC Hardening gate; this doc closes the screenreader spot-check sub-item.
