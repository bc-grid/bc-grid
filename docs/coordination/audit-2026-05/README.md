# bc-grid Audit — 2026-05

**Coordinator:** Claude in `~/work/bc-grid`
**Started:** 2026-05-02
**Goal:** evaluate bc-grid as the foundation of the BusinessCraft ERP rewrite. Identify what would block, degrade, or merely polish a *home-run* demo of the BusinessCraft web rewrite, with hero use cases:

1. **Sales estimating** — numeric edit, formula-like dependencies, Excel paste, Tab progression
2. **Production estimating** (scheduling purchase orders) — grouping, drag/drop, multi-row edit
3. **Colour selections** — visual lookup with swatches, searchable async options
4. **Document management** — file/thumbnail cells, drag-drop upload, bulk select, preview

Inspiration targets (public docs/screenshots/behavior only — never source): NetSuite, Dynamics 365, Salesforce LWC datatable, Oracle JET DataGrid, Notion databases for lookup ergonomics.

Hard rule: **no AG Grid source code inspection.** Public docs and behavior only.

## Why now

BusinessCraft is moving from a windows client into the browser. Users expect *more* productivity inline, not less. bc-grid is not "a grid we ship"; it's the central component the entire ERP demo lives on. v0.3.0 just shipped, v0.4 chrome polish is on `main`, and this is the right moment to audit before the v0.4 → v0.5 → v1 sprint locks in scope.

## Audit structure — three workers + coordinator

Each lane owner produces a findings document. Lanes are aligned to existing worker scopes so each auditor is auditing the code they know best.

| Auditor | Lane | Brief | Output |
|---|---|---|---|
| worker1 (Claude) | server grid + perf posture | `brief-worker1.md` | `worker1-findings.md` |
| worker2 (Codex) | filters + aggregations + chrome consistency | `brief-worker2.md` | `worker2-findings.md` |
| worker3 (Claude) | editors + keyboard/a11y + lookup UX | `brief-worker3.md` | `worker3-findings.md` |
| coordinator (Claude) | API ergonomics, package boundaries, type discipline, visual quality, ERP comparison, bsncraft integration read | `coordinator-scope.md` | `coordinator-audit.md` |

**Cross-check rule:** worker2 is Codex auditing Codex-written code. The coordinator deliberately re-walks worker2's lane during the coordinator pass to surface same-model blindspots.

After all four findings docs land, the coordinator produces:

- `synthesis.md` — final ranked P0/P1/P2 recommendations. Each item tagged by who flagged it. Items flagged by multiple authors carry weight; items flagged by only one carry both views.

## Severity legend (apply uniformly)

- **P0** — would block a credible BusinessCraft demo or degrade a user's day-1 experience. Fix before v0.5 cut.
- **P1** — would noticeably degrade ERP UX in production. Fix before v1.0 cut.
- **P2** — improvement, polish, future enhancement. Schedule post-v1.0 unless cheap.

## Output template (use in every findings doc)

```markdown
# {Worker} Findings — bc-grid Audit 2026-05

**Author:** {workerN}
**Lane:** {lane summary}
**Date:** {YYYY-MM-DD}

## Executive summary
{3 sentences. Headline grade for this lane against ERP-foundation goal.}

## P0 findings
### {short title}
- **Where:** {package/file:line if precise, package otherwise}
- **What:** {observed behavior or code pattern}
- **Why it matters for the BusinessCraft ERP:** {tie to a hero use case if you can}
- **Recommendation:** {concrete next step}

## P1 findings
{same shape}

## P2 findings
{same shape}

## What's already strong
{2–4 bullets — things you would NOT change. Useful to anchor decisions.}

## Open questions for the coordinator
{anything you couldn't resolve from code alone}
```

## Rules for auditors

1. **Read-only.** No source changes. One findings document per lane.
2. **Be specific.** "Editing feels off" is useless. "F2 takes 80ms to focus the textarea because of `useEffect` ordering in `editors/src/cellEditor.tsx:47`" is useful.
3. **Tie to ERP use cases.** Generic grid critique is worth less than ERP-specific critique. Score against the hero use cases at the top of this README.
4. **Ignore what's already good.** Use the "What's already strong" section. Don't pad findings with positives.
5. **Comparison lens is public-only.** AG Grid public docs/behavior, NetSuite/Dynamics/Salesforce public screenshots and docs, Excel/Notion/Airtable observable behavior. Never AG Grid source.
6. **Performance claims need numbers.** If you say "slow", give the rough budget breach (e.g. "render takes ~24ms when sorted, exceeds 16ms frame budget").
