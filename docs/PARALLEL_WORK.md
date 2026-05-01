# Parallel Work - 3-Worker Scheme

bc-grid is currently coordinated with one Claude coordinator and three worker agents. This replaces the earlier 5-worker sprint.

## Active Layout

Only these project directories should exist in `~/work` for the current setup:

```text
~/work/
├── bc-grid/       # Claude coordinator / integrator / release owner
├── bsncraft/      # consumer ERP implementation and validation repo
├── bcg-worker1/   # Claude worker1
├── bcg-worker2/   # Codex worker2
└── bcg-worker3/   # Claude worker3
```

Retired folders: `bcg-worker4`, `bcg-worker5`, old release/budget worktrees, and temporary PR worktrees.

## Roles

| Worktree | Model | Role |
|---|---|---|
| `~/work/bc-grid` | Claude | Coordinator: task allocation, PR review, merge train, releases, Playwright, smoke-perf, bsncraft validation coordination |
| `~/work/bcg-worker1` | Claude | Worker1: server-backed grid stability and v0.4 server edit contracts |
| `~/work/bcg-worker2` | Codex | Worker2: filter/sidebar/tool-panel polish and v0.5 range/clipboard helper work |
| `~/work/bcg-worker3` | Claude | Worker3: editor validation, keyboard/a11y contracts, lookup/select/autocomplete polish |
| `~/work/bsncraft` | mixed | Consumer implementation repo; do not treat as a bc-grid worker |

## Worker Rules

- Workers do not run Playwright, smoke-perf, perf, or broad benchmark commands.
- Workers may add or update `.pw.ts` specs only when the feature needs browser coverage; the coordinator runs them.
- Workers run focused unit tests, `bun run type-check`, `bun run lint`, and package builds when appropriate.
- Workers create branches named `agent/workerN/<task-slug>`.
- Workers do not merge their own PRs and do not rebase branches they do not own.
- The coordinator keeps `docs/queue.md` and `docs/coordination/release-milestone-roadmap.md` honest.

Forbidden in worker folders:

```bash
bun run test:e2e
bun run test:e2e:full
bun run test:smoke-perf
bun run test:perf
bunx playwright
```

## Clean Start Procedure

At the start of a new worker session:

```bash
cd ~/work/bcg-worker1
git fetch origin
git switch worker1
git reset --hard origin/main
git clean -fd
bun install
```

Then claim work:

```bash
git switch -c agent/worker1/<task-slug>
# edit docs/queue.md from [ready] to [in-flight: worker1] if claiming a queue item
# code, commit, push, open PR
```

After the PR merges:

```bash
git switch worker1
git fetch origin
git reset --hard origin/main
git clean -fd
```

Use `worker2` / `worker3` branch names in the corresponding folders.

## Coordinator Checklist

Before assigning work:

```bash
git -C ~/work/bc-grid status --short --branch
gh pr list --repo bc-grid/bc-grid --limit 30
git -C ~/work/bc-grid worktree list
```

Before a release recommendation:

```bash
bun run type-check
bun run lint
bun test
bun run build:packages
bun run api-surface
bun run bundle-size
bun run tarball-smoke
bun run test:e2e
bun run test:smoke-perf
```

The coordinator may run a focused subset while a merge train is moving, but release gates must be explicit in `docs/coordination/release-milestone-roadmap.md`.

## Retired PR Context

The 2026-05-02 reset intentionally retired stale PR branches from the 5-worker sprint. Useful concepts from those PRs should be re-implemented on fresh branches rather than rebased mechanically if they conflict with current `main`.

Stale PRs at reset time:

- #350 editor keyboard/a11y consolidated contract
- #332 server edit grid contract tests
- #323 server grid sort refresh flicker
- #320 filter popup keyboard helper
- #318 filters panel active summary
- #316 server grid error retry UI
- #315 editor validation surface

See `docs/coordination/three-worker-handoff.md` for how these concepts map into the new three-worker lanes.
