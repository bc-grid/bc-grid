# Worker1 Handoff (Claude — server grid stability lane)

**Last updated:** 2026-05-02 by Claude coordinator
**Worktree:** `~/work/bcg-worker1`
**Branch convention:** `agent/worker1/<task-slug>`

## How to use this document

When the maintainer says **"review your handoff"**, read the **Active task** section below and proceed. This document is the source of truth for what worker1 should be doing right now. The Claude coordinator in `~/work/bc-grid` keeps it current.

---

## Active task — PR #353 in coordinator review (updated 2026-05-02)

You went straight to v0.4 server-grid-stability work and opened **PR #353** (`feat(react): rowProcessingMode + manual-mode server-grid contract`) instead of the audit. **That's accepted** — the coordinator's cross-cutting audit at `docs/coordination/audit-2026-05/coordinator-audit.md` covers the server-grid + perf lane, so a separate worker1 findings doc is not needed. Queue marked `audit-worker1` as `[skipped: worker1 - lane covered by coordinator audit]`.

### What's open
- **PR #353** is in coordinator review. Two items being checked:
  - Public API addition (`rowProcessingMode = "client" | "manual"`) — coordinator API surface review.
  - Bundle-size warning (react bundle 69.52 → 69.79 KiB; +277 B) — coordinator owns baseline policy.
- Tests pass (1122/1122). Type-check, lint, build all clean.

### What you should do now
**Wait for coordinator review feedback on #353 before starting new work.** Once #353 lands, this handoff will be updated with the next v0.4 server-grid task or a pivot to v0.5 work (`useServerPagedGrid` hook + `apiRef.scrollToCell` per `docs/coordination/v0.5-audit-refactor-plan.md`).

If review feedback comes back asking for changes on #353, address it on the same branch (`agent/worker1/server-grid-stability-v040`) and push.

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
