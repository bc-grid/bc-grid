# Worker2 Audit Brief — Filters + Aggregations + Chrome Consistency

**Auditor:** worker2 (Codex in `~/work/bcg-worker2`)
**Date assigned:** 2026-05-02
**Read first:** `docs/coordination/audit-2026-05/README.md` (rules, severity, output template)
**Output:** `docs/coordination/audit-2026-05/worker2-findings.md`
**Branch:** `agent/worker2/audit-2026-05`

## The question to answer

Do filter UX and grouping/aggregation feel **ERP-grade**, or do they smell like a generic data-table?

ERP-grade means: filter sets that look like saved searches, multi-pick distinct values that scale to thousands of options, grouping that feels like a real outline (with totals, subtotals, expand/collapse persistence), and chrome that is visually one product across panel / popup / inline / sidebar / header / tool panel.

## Lane scope (what to audit)

- `packages/filters/` — entire package
- `packages/aggregations/` — entire package
- Range/clipboard helpers in `@bc-grid/react` (the v0.5 prep work — internal helpers around range state, TSV parse, paste planning)
- **Chrome consistency** across:
  - filter popup
  - filters tool panel / sidebar
  - inline filter row
  - grouping headers + group rows
  - aggregation row + footer
  - column header menus

## Specific things to look at

1. **Filter set / multi-pick.** Does the filter popup support "select multiple distinct values" (NetSuite-style)? At what scale (100? 1k? 10k options)? Virtualized?
2. **Saved filter sets.** Can a user persist + restore a named filter set? Or is filter state per-session only?
3. **Operator coverage.** For each filter type (text/number/date/set), which operators ship? Any missing that ERP users routinely use (between, not-blank, in last N days, this month)?
4. **Filter chip / active-summary surface.** When 4 filters are active, can the user see them at a glance and remove individually?
5. **Grouping behavior.** Multi-level grouping. Expand/collapse persistence across re-render. Group totals. Group selection algebra (selecting a group selects its rows).
6. **Aggregation correctness.** Sum/avg/min/max/count — exposed at column-level? Group-level? Footer level? Custom aggregator API?
7. **Range/clipboard prep.** Look at the helpers under `@bc-grid/react` for v0.5. Is the helper surface complete enough to plug into a future range visual layer? Or are there gaps that will surface late?
8. **Chrome consistency.** Open every panel/popup/header in `apps/examples` (read the example source — don't run Playwright). Are surfaces, paddings, borders, focus rings, and icon sizes consistent? Or does each surface look like it was polished by a different person on a different day?
9. **Tailwind v4 token use.** Are color/spacing/radius tokens used consistently, or are there hardcoded class strings that bypass the theme?
10. **Test depth.** Count tests per package. Identify gaps.

## Comparison lens (public docs + behavior only)

- **NetSuite saved searches** — saved filter sets, multi-pick distinct values, the "selectable values" pattern
- **Dynamics 365 Advanced Find** — operator richness on entity fields
- **Salesforce list views** — saved filter view, "filter by my owner / team / all", chip-style active filters
- **Excel pivot tables / filter chips** — the visual language of "one filter applied" vs "many filters applied"

## What to deliberately skip

- Server row model + perf (worker1)
- Editor keyboard / validation / lookup (worker3)
- Public API surface review (coordinator)
- Charts (out of v1.0 scope)

## Codex-specific note

You wrote much of this code. The risk is **same-model blindspots** — patterns you wrote that look fine to you may have ergonomic costs Claude or a fresh reviewer would catch immediately. Specifically: re-read your own filter and chrome work with the lens "would a *new* engineer joining tomorrow understand this in 5 minutes?" If not, name the friction. The coordinator will re-walk this lane in the coordinator pass as a cross-check; agreement strengthens findings, disagreement is a debate point captured in synthesis.

## Output

Single file at `docs/coordination/audit-2026-05/worker2-findings.md`, following the template in `audit-2026-05/README.md`.

When the file exists with at least the executive summary + P0 + P1 sections, push the branch, open the PR, comment tagging the coordinator, then stop.
