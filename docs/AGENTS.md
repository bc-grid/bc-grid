# Agent Instructions for bc-grid

This is the binding process for all agents (Claude Max, Codex Max, or any other) working on bc-grid. Read it before claiming any work.

---

## 1. The mission

Build a high-performance shadcn-native data grid that competes with AG Grid Enterprise. See `design.md` for the architecture, `roadmap.md` for the **2-week parallel sprint to v1.0** (compressed from the original 2-year plan; see `design.md §13` for the 2026-04-29 scope+timeline pivot), `queue.md` for the current task list, and `coordination/v1-parity-sprint.md` for the active orchestration.

**Coordinator release memory:** the Codex coordinator must keep `docs/coordination/release-milestone-roadmap.md` current. When a milestone's checklist and release gates are complete, the coordinator should recommend bumping the package version and publishing the next release. AG Grid comparisons must follow `docs/coordination/ag-grid-clean-room-audit-plan.md`; use public docs, APIs, examples, and black-box behavior for pattern validation, but do not inspect or clone AG Grid source.

## 2. Reading order on first session

1. `README.md` — project mission and non-goals
2. `docs/design.md` — architecture in depth (~30 min read; binding)
3. `docs/roadmap.md` — phase plan (~5 min)
4. `docs/coordination/release-milestone-roadmap.md` — coordinator release gates (~5 min)
5. `docs/coordination/ag-grid-clean-room-audit-plan.md` — comparison-audit guardrails (~3 min)
6. `docs/AGENTS.md` (this file) — process (~5 min)
7. `docs/PARALLEL_WORK.md` — worktree scheme (~5 min)
8. `docs/queue.md` — open tasks (~2 min)
9. `docs/api.md` — public API spec (frozen after Q1)

After Q1, every session: re-read `queue.md` + the design doc for the package you're touching.

## 3. The golden rules

1. **Audit before code.** Every non-trivial task has a design entry under `docs/design/<feature>.md` reviewed before code is written. New features without a design doc are rejected at PR review.
2. **No AG Grid source code.** Use public docs, APIs, examples, screenshots, and approved black-box behavior to validate product patterns; never inspect or clone AG Grid source or internals. If you've ever worked on AG Grid in another project, flag it; for code you write, the architect may ask you to step back from a particular package.
3. **Public API is sacred.** After Q1 freeze, public API changes go through the architect. Every PR runs an API-surface diff in CI; non-empty diff requires architect sign-off.
4. **Performance is non-negotiable.** Every PR runs the perf benchmark suite. Regressions fail the build. No "we'll fix it later" — perf debt compounds.
5. **TypeScript strict, no `any`.** The TanStack adapter is the only place `any` is permitted. Outside that, fully typed.
6. **Tests required.** Coverage gates per package in `design.md` §14.1. PRs that drop coverage are rejected.
7. **No autonomous merges to `main`.** Even with architect sign-off, the merge action is human (or owner-agent). PRs accumulate; integrator runs the merge train.
8. **Single ownership.** Each task has one owner. If two agents claim the same task in `queue.md`, the second backs off.

## 4. Branch discipline

- All work happens on a feature branch named `agent/<agent-id>/<task-slug>` (e.g., `agent/c1/virtualizer-perf-spike`).
- Each agent works in their own git worktree. See `PARALLEL_WORK.md`.
- Never commit directly to `main`.
- Never rebase a branch you don't own.
- Never force-push without architect approval.
- Never merge your own PR.

## 5. Claiming work

1. Open `docs/queue.md`. Find a task tagged `[ready]`.
2. Verify your worktree's branch matches what the task expects (see `PARALLEL_WORK.md`).
3. Edit `docs/queue.md`: change `[ready]` to `[in-flight: <agent-id>]` and commit (single-line commit on `main` via the integrator's worktree, or via a PR if no integrator is online).
4. Branch off `main` in your worktree: `git checkout -b agent/<agent-id>/<task-slug>`.
5. Work. Commit early, commit often. Push on every meaningful checkpoint.
6. Open a PR when ready.

## 6. PR checklist

Before requesting review:

- [ ] Branch is up to date with `main` (rebase or merge)
- [ ] Tests added or updated (coverage gates met)
- [ ] Type-check passes locally (`bun run type-check`)
- [ ] Lint + unit/package tests pass locally (`bun run lint`, `bun run test`, plus any focused package test)
- [ ] Playwright / smoke-perf / benchmark validation is left for the Codex coordinator
- [ ] Public API diff is intentional (or empty)
- [ ] Linked to the task in `queue.md`
- [ ] Updated relevant design docs if the architecture shifted

### Test budget per PR

Default to **unit tests for edges and at most 1 happy-path Playwright spec added/updated when browser behavior truly needs it**. Unit tests are 0.5s; e2e tests are 5-30s × 6 browser projects. Cover validation, error states, and edge cases via `bun test` against the editor / column / hook in isolation. The goal is fast feedback for the author and fast review for the next agent.

**Worker rule for the 5-worker sprint:** workers do **not** run Playwright or perf commands locally. Do not run `bun run test:e2e`, `bun run test:e2e:full`, `bun run test:smoke-perf`, `bun run test:perf`, `bunx playwright`, or broad benchmark runs. If you add or update a `.pw.ts` file, note in the PR that it was not run locally and the Codex coordinator in `~/work/bc-grid` will run it during review/merge.

If an RFC or design doc says a feature needs Playwright/e2e acceptance, workers should read that as "add or update the coverage if needed"; execution remains coordinator-owned.

## 7. PR review

- **Reviewer is never the author.** Always a fresh agent or human. The reviewer reads the PR cold; they should have to ask zero questions to understand intent.
- **Reviewer's job:** verify against `design.md` invariants. Block if:
  - Public API changed without sign-off
  - Perf budgets breached
  - Test coverage dropped below the gate
  - Architecture decision contradicts the design doc without an entry in §13
  - Code style egregiously violates project conventions
- **Reviewer's job is NOT to redesign.** If you disagree with the approach, comment with the alternative; don't block on personal preference. Block only on objective violations.
- **Two-agent review for high-risk PRs.** New public API surface, virtualizer changes, animation system changes, server-row-model changes — require two reviewers.

## 8. Merging

- Integrator (human or designated agent) merges to `main` via the GitHub UI or `gh pr merge`.
- Squash merges by default. Multi-commit PRs only when the commit history tells a story.
- Tag every release in semver. Pre-1.0 = bumps in `0.x.0` for each phase milestone.

## 9. When you're stuck

- **Ambiguous design**: open a GitHub Discussion (or issue tagged `design-question`). Architect responds. Don't guess.
- **Scope creep**: if your task expanded mid-flight, stop. Update the queue with a new task; finish what you started.
- **Found a bug in another package**: file an issue tagged `bug`, link it in your PR, and route around if possible. Don't fix it in your PR unless trivially small.
- **Hit a perf bar**: don't ship the regression. File an issue tagged `perf-investigation`; pause your task; help triage.

## 10. What NOT to do

- Don't add new dependencies without a discussion. Architect approval required.
- Don't refactor adjacent code "while you're here". Stay in your lane.
- Don't change the public API to make your task easier. The API is the customer-facing contract.
- Don't write new comments that explain what the code does. Code should be self-evident; comment only the *why* (constraints, gotchas, references to design docs).
- Don't bypass CI. If a check is failing, fix it; don't disable it.
- Don't merge with failing tests. Don't merge during architect's review.
- Don't reach into another package's internals. Use the public exports only.

## 11. Reporting

- End-of-session summary in your PR description: what you built, what you didn't, what's deferred, blockers.
- If you finish a task: mark `[done: <agent-id>]` in `queue.md` and link the merged PR.
- If you got blocked: mark `[blocked: <agent-id> - <reason>]` and post details in the issue.

## 12. Cross-agent etiquette

- Don't start tasks that depend on tasks in-flight by another agent. Pick something independent.
- If you need to coordinate with another agent (cross-package contract), do it via a GitHub issue, not by reading their WIP branch.
- Be precise about what's done vs in-flight in your PR description; the next agent reads it to understand.
- Respect the queue. No "I'll just quickly do this other thing" — that's how parallelism collapses.
