# bc-grid Coordinator Handoff

**Read first when starting the Claude coordinator in `~/work/bc-grid`.**

The project has been reset from a 5-worker model to a 3-worker model to conserve Codex usage.

## Active Setup

- Coordinator: Claude in `~/work/bc-grid`
- Worker1: Claude in `~/work/bcg-worker1`
- Worker2: Codex in `~/work/bcg-worker2`
- Worker3: Claude in `~/work/bcg-worker3`
- Consumer implementation: `~/work/bsncraft`

Retired: `bcg-worker4`, `bcg-worker5`, old release/budget worktrees, old temp PR worktrees.

## First Checks

```bash
git status --short --branch
gh pr list --repo bc-grid/bc-grid --limit 30
git worktree list
```

Then read:

1. `CLAUDE.md`
2. `docs/PARALLEL_WORK.md`
3. `docs/coordination/three-worker-handoff.md`
4. `docs/coordination/v0.4-alpha-plan.md`
5. `docs/coordination/release-milestone-roadmap.md`
6. `docs/queue.md`

## Immediate Coordination Priorities

1. Keep worker1 on server-grid stability and server edit contracts.
2. Keep worker2 on filter popup/panel polish and later v0.5 range/clipboard prep.
3. Keep worker3 on editor validation, keyboard/a11y contracts, and lookup UX.
4. Keep bsncraft implementation notes separate from package work; bsncraft is a consumer repo, not a bc-grid worker.

## Old PR Context

The previous open PRs were closed/retired during the reset. Their useful ideas are archived in `docs/coordination/three-worker-handoff.md`. Do not reopen them as-is; ask workers to recreate focused PRs from current `main`.

## Coordinator-Owned Commands

Workers must not run these:

```bash
bun run test:e2e
bun run test:e2e:full
bun run test:smoke-perf
bun run test:perf
bunx playwright
```

The coordinator runs them during review/release gates.

## Release Reminder

When a milestone checklist in `docs/coordination/release-milestone-roadmap.md` is complete and gates pass, tell the maintainer that the version is ready to bump and publish. Until then, keep merging focused PRs and validating in `bsncraft`.
