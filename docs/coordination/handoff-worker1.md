# Worker1 Handoff (Claude — server grid stability lane)

**Last updated:** 2026-05-02 by Claude coordinator
**Worktree:** `~/work/bcg-worker1`
**Branch convention:** `agent/worker1/<task-slug>`

## How to use this document

When the maintainer says **"review your handoff"**, read the **Active task** section below and proceed. This document is the source of truth for what worker1 should be doing right now. The Claude coordinator in `~/work/bc-grid` keeps it current.

---

## Active task — Audit lane (assigned 2026-05-02)

**Read and execute:** `docs/coordination/audit-2026-05/brief-worker1.md`

This is a **read-only audit** — no source changes. You will produce one findings document.

**Output branch:** `agent/worker1/audit-2026-05`
**Output file:** `docs/coordination/audit-2026-05/worker1-findings.md`
**PR title suggestion:** `audit: worker1 server-grid + perf findings (2026-05)`

When the PR is open, comment on it tagging the coordinator and stop. Do not start another task until this handoff is updated.

---

## Standing lane scope

Server-backed grid stability and v0.4 server edit contracts. Specifically:

- `packages/server-row-model/`
- `packages/react/` server-grid bindings (server grid component, server row caching, optimistic edit flow)
- Perf posture (virtualizer steady-state under churn)

You do **NOT** own: editors, filters, aggregations, theming, chrome polish. Don't refactor adjacent code while you're here.

## Worker rules (recap — full rules in `docs/AGENTS.md`)

- Branch off `main`. Never commit to `main`.
- Branch name: `agent/worker1/<task-slug>`.
- Run `bun run type-check`, `bun run lint`, focused unit tests.
- Do **NOT** run Playwright, smoke-perf, perf, or broad benchmarks. Coordinator owns those.
- Open PR against `main`. Do not merge your own PR.
- Update `docs/queue.md` at state transitions.

## Recent activity baseline

- v0.3.0 shipped (88398c6).
- Server grid hardening already on main: PR #343 (paged edit contracts), PR #327 (flicker boundary), PR #344 (server row query contracts).
- v0.4 chrome polish from #349 is the current visible UI baseline.

## When you finish the active task

1. Push the findings doc as a PR (single doc, no source changes).
2. Comment on the PR tagging the coordinator.
3. Wait for the next handoff update before starting new work.
