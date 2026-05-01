# Coordinator Audit Scope

**Auditor:** Claude coordinator in `~/work/bc-grid`
**Date:** 2026-05-02
**Output:** `docs/coordination/audit-2026-05/coordinator-audit.md`
**Synthesis output (after all four reports land):** `docs/coordination/audit-2026-05/synthesis.md`

This document is for transparency — workers can see what the coordinator is covering so they don't duplicate effort.

## What the coordinator owns

Cross-cutting concerns that no single worker lane covers:

1. **Public API ergonomics.** `@bc-grid/react`, `@bc-grid/core`, `@bc-grid/editors` exports. Will a typical BusinessCraft CRUD grid be 20 lines of glue, or 200? Read `docs/api.md` (frozen post-Q1) and walk the public surface. Are there missing extension points? Awkward generics? Stringly-typed props that should be discriminated unions?
2. **Package boundaries.** Does any package reach into another's internals? Are there circular deps? Has coupling drifted since the boundaries were set?
3. **TypeScript discipline.** `any` audit (only the TanStack adapter is permitted to use `any` — anywhere else is a finding). Strict adherence. Generic ergonomics — is `<BcGrid<MyRow>>` painful to type?
4. **Visual quality vs shadcn/Tailwind v4.** Token use. Dark mode coverage. Density variants. Focus rings. Compare to a baseline shadcn dashboard — does bc-grid look like it belongs in the same product?
5. **bsncraft integration read.** Read `~/work/bsncraft` consumer code. Where does the integration shim feel awkward? What did bsncraft have to wrap or work around? That's the truest signal of API friction.
6. **ERP comparison synthesis.** Score the grid as a *system* against NetSuite / Dynamics / Salesforce / Oracle / Notion patterns. Workers cover their lanes; the coordinator covers the gestalt.
7. **Cross-check on worker2's lane.** Codex is auditing Codex-written code; the coordinator deliberately re-walks `packages/filters/`, `packages/aggregations/`, and chrome consistency to surface same-model blindspots.
8. **Synthesis.** After all four findings docs land, collapse into one ranked P0/P1/P2 list. Each item tagged by who flagged it.

## Method

- Spawn parallel `Explore` subagents to gather evidence on specific dimensions (e.g., one to map every `any` in the codebase, one to map all public exports, one to read bsncraft's bc-grid consumer code). Subagents are evidence-gatherers; the coordinator does synthesis.
- Read the consumer-side code in `~/work/bsncraft` directly — that's the hardest evidence about API friction.
- Use only public AG Grid docs/behavior + public NetSuite/Dynamics/Salesforce screenshots + observable Excel/Notion/Airtable behavior. No source inspection of competing libraries.

## Output structure (mirrors worker template)

`coordinator-audit.md`:
- Executive summary
- P0 / P1 / P2 findings (cross-cutting only — leave lane-specific findings to the workers)
- What's already strong
- Open questions (if any)

`synthesis.md` (post-merge of all four findings):
- Top-line grade for bc-grid as ERP foundation
- Ranked P0 list with author tags (e.g. `[worker1+coordinator]` for items both flagged — strong signal)
- Ranked P1 list
- Ranked P2 list
- Disagreement section (items where authors disagreed; both views captured)
- Recommended sprint plan to address P0 + P1 before v1.0

## Timing

- Coordinator audit runs *immediately* in this session, in parallel with workers (workers start when their handoff is reviewed).
- Synthesis happens after all four findings docs are merged.
