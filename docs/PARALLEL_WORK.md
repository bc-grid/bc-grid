# Parallel Work — 5-Agent Worktree Scheme

bc-grid is built with up to **5 parallel agents** working concurrently after Q1's foundation phase. This document is the operational playbook for that.

---

## 1. The model

Each agent works in a **dedicated git worktree** off the same shared `.git` directory. Worktrees mean:

- All agents see the same branches and refs (no double-fetching, no separate clones)
- Each agent has an isolated working directory (no file conflicts)
- Each agent's branch is independent (no rebase pain)
- The integrator merges PRs to `main`; agents pull `main` into their feature branches when needed

Layout on disk:

```
~/work/
├── bc-grid/                       # main worktree (Codex coordinator / integrator) — branch: main
├── bcg-worker1/                   # parking branch: worker1
├── bcg-worker2/                   # parking branch: worker2
├── bcg-worker3/                   # parking branch: worker3
├── bcg-worker4/                   # parking branch: worker4
└── bcg-worker5/                   # parking branch: worker5
```

**Current sprint assignment:** the five worker slots are fixed so the coordinator can reason about capacity and avoid duplicate claims.

| Worktree | Model | Role |
|---|---|---|
| `~/work/bcg-worker1` | Codex | worker1 implementer |
| `~/work/bcg-worker2` | Claude | worker2 implementer |
| `~/work/bcg-worker3` | Codex | worker3 implementer |
| `~/work/bcg-worker4` | Claude | worker4 implementer |
| `~/work/bcg-worker5` | Codex | worker5 implementer |

**Coordinator:** Codex in `~/work/bc-grid` owns PR review, merge train, queue hygiene, release cuts, Playwright, smoke-perf, and benchmark runs. Worker agents should focus on implementation, unit/type/build validation, and PR handoff notes. Workers must not run `bun run test:e2e`, `bun run test:e2e:full`, `bun run test:smoke-perf`, `bun run test:perf`, `bunx playwright`, or broad benchmark runs.

**Naming convention:** worktrees are assigned by worker slot, and the agent's identity goes in the **branch name** (`agent/worker1/<task-slug>` or an existing historical id such as `agent/c1/<task-slug>`). Branches and PR bodies must include the task slug from `docs/queue.md` so the coordinator can trace ownership.

**Parking branches:** each worktree starts on a `worker1`/`worker2`/etc. branch. These are stable parking spots — agents switch off them when claiming a task and switch back when finished. Don't commit work directly to a parking branch.

## 2. Agent workflow inside a worktree

When you sit down at a worktree:

```bash
cd ~/work/bcg-worker1
git fetch origin
git checkout worker1                 # the parking branch
git reset --hard origin/main         # sync to latest main
bun install                          # if deps changed since last session

# Now claim a task from docs/queue.md and create a feature branch:
git checkout -b agent/c1/virtualizer-perf-spike   # `c1` for Claude #1, etc.

# Work, commit, push, open PR
git push -u origin agent/c1/virtualizer-perf-spike

# After PR merges, return to parking branch
git checkout worker1
git reset --hard origin/main
# Ready for the next task
```

## 3. Worktree availability

All five worker worktrees already exist in the current setup. If a future checkout is missing `worker5`, create it with:

```bash
# Create the new worktree on a fresh parking branch
git -C ~/work/bc-grid worktree add -b worker5 ~/work/bcg-worker5 main

# Agent then operates in their worktree (see workflow above)
cd ~/work/bcg-worker5
bun install
```

When a worker is no longer needed, retire it:

```bash
git -C ~/work/bc-grid worktree remove ~/work/bcg-worker5
git -C ~/work/bc-grid branch -d worker5
git -C ~/work/bc-grid branch -d agent/c2/<task-slug>   # local cleanup
```

Before assigning work, the coordinator should verify:

```bash
git -C ~/work/bc-grid worktree list
gh pr list --limit 30
```

Agents must not switch branches inside another worker's worktree.

## 4. Phase-by-phase parallelism

> **Note (2026-04-29 scope+timeline pivot; updated 2026-04-30):** the original calendar below described Q1-Q8 in months over a 2-year build. The actual sprint is now compressed to **2 weeks with 5 worker agents plus a Codex coordinator**. The Q1-Q8 phase NAMES are preserved as feature buckets; the calendar below is rewritten in days. See `docs/coordination/v1-parity-sprint.md` for the active orchestration; that doc's 7 parallel feature tracks supersede the strict quarter-by-quarter sequencing below.

The split below assumes Q1's foundation work is complete (architecture, package skeletons, perf spikes — done day 0).

### Q1 (Day 0, DONE) — Foundation. Mostly serial.

Q1 is **not** the place for 5-agent parallelism. The architecture has to cohere. Work distribution that day:

- **Architect (1 agent or human)**: design doc, API spec, foundation packages (`core`, `virtualizer`, `animations`, `theming`). Owns the perf spike.
- **Test-infra agent (1 agent)**: CI, perf harness, visual regression infrastructure, type-check setup, lint/format config. Independent of architect's work.
- **Docs agent (1 agent)**: docs site scaffold, examples app skeleton, README content.
- **Reviewer agent (1 agent)**: reviews architect's PRs (always-fresh review).

Maximum 4 concurrent in Q1; usually 2-3. Cleared via PR #42 (AR Customers vertical slice).

### Q2 (Days 1-3) — In-grid editing + cell editors. 5-agent parallelism unlocks.

After the editor framework lands (architect-driven, day 1 morning), parallel agents fan out:

- **Agent C1**: keyboard nav state machine + the editor framework's React adapter
- **Agent C2**: text + number editors (`editors/text`, `editors/number`)
- **Agent X1**: date + datetime + time editors (`editors/date`, `editors/datetime`, `editors/time`)
- **Agent X2**: select + multi-select + autocomplete editors (`editors/select`, `editors/multi-select`, `editors/autocomplete`)
- **Agent X3**: validation framework + dirty tracking + unit/integration edit tests; coordinator runs any e2e edit tests

Each agent owns a leaf package or two; PRs land independently; reviewer agent rotates.

### Q3 (Days 4-6) — Range selection + master-detail.

- **Agent C1**: range selection model (`core/range`) — coherent design, single owner
- **Agent C2**: clipboard handlers (TSV serialize, HTML serialize, paste-from-Excel parser)
- **Agent X1**: fill handle + drag-extend + selection visual layer
- **Agent X2**: master-detail rows
- **Agent X3**: column groups (multi-row headers) + sticky header polish

### Q4 (Days 5-8, parallel with Q3 latter half) — Server-side row model + tree.

- **Agent C1**: server-paged + server-sort/filter wiring (already in flight as #60 day 0)
- **Agent C2**: infinite scroll + block caching + LRU eviction
- **Agent X1**: lazy tree children (server-tree mode)
- **Agent X2**: server-side group expand/collapse
- **Agent X3**: integration tests + perf testing for server modes (cross-cutting)

### Q5-Q7 (Days 8-13) — Aggregations / Pivots / Filters / Chrome / Export / Polish — massive parallelism, 5 agents on independent tracks.

Days 8-13 are the breadth phase. Most tasks are isolated; cross-track conflicts rare.

Example day split (days 8-9, aggregations + pivots):
- **Agent C1**: aggregation core + sum/avg/count/min/max (`@bc-grid/aggregations` engine)
- **Agent C2**: custom aggregation hooks + pivot engine
- **Agent X1**: filter UIs (set, multi, date-range)
- **Agent X2**: filter UIs (number-range, text-extend, custom-extension recipe) + `@bc-grid/export` impls (csv/xlsx/pdf)
- **Agent X3**: status bar + sidebar + context menu (`chrome-rfc`)

Days 11-13: streaming row updates + mobile/touch fallback + WCAG deep-pass + animation polish. Charts are post-1.0.

### Q8 (Days 13-14) — Beta + 1.0 launch.

`docs/queue.md` tracks task-level assignments. Architects can shuffle as priorities shift.

## 5. Coordination protocol

### 5.1 The work queue

`docs/queue.md` is the single source of truth for "what's available to claim". `CLAUDE.md` mirrors `docs/AGENTS.md` exactly so Claude and Codex agents are operating from the same process rules. Format:

```
## Q2 Tasks

- [ready]    keyboard-state-machine             | depends on editor-framework
- [in-flight: c1] editor-framework             | branch: agent/c1/editor-framework
- [done: x2] editors/text                      | merged in #42
- [blocked: c2 - waiting on editor-framework] editors/number
```

When you claim a task, you edit this file. The edit goes via PR or via the integrator's worktree (architect approval if no integrator online).

### 5.2 Daily integration

Once per day (or per work-cycle), the integrator:

1. Reviews open PRs.
2. Merges any that are green and approved.
3. Pulls main into any in-flight branches that are too far behind.
4. Updates `docs/queue.md` with status.
5. Posts a brief summary in the project log.

If no human integrator: a designated agent does this on a cron via Claude Code's `loop` skill, with a final human review for the merge action.

### 5.3 Cross-agent communication

- **Github issues** for design questions, bug reports, blockers.
- **PR comments** for code-specific discussion.
- **`docs/design/<feature>.md`** for any new feature's spec — written before code, reviewed by another agent.
- **Never read another agent's WIP branch** to "see what they're doing." If you need to coordinate, file an issue or wait for their PR.

### 5.4 Conflict resolution

If two PRs touch the same file (rare with strict module boundaries, but happens):

1. Whoever lands first wins.
2. The second rebases their branch onto the new main.
3. Conflicts beyond trivial: the architect makes the call.

If two PRs disagree on architecture: stop; architect resolves; one or both PRs may need rework.

## 6. Agent roles per session

Not every agent does every kind of work. Recommended specialization:

- **Architect**: senior agent or human. Drives Q1; reviews architecture-touching PRs throughout. Always-on.
- **Test-infra**: tests, CI, benchmark harness, perf monitoring. Stable assignment across phases.
- **Docs**: docs site, examples, migration guides, public-facing docs. Stable assignment.
- **Feature engineers** (3-4): rotate per phase based on the queue. Each owns 1-2 packages per quarter.
- **Reviewer**: rotates. Every PR has a non-author reviewer. Reviewing IS legitimate work; track in queue.

A 5-agent setup typically: 1 architect/integrator + 1 test-infra + 1 docs + 2 feature engineers. Or 1 architect + 4 feature engineers in heavy parallelism phases.

## 7. Worktree hygiene

- **Each worktree has its own `node_modules`.** `bun install` once per worktree.
- **Each worktree may have its own `.env.local`** — don't commit, never share secrets between worktrees.
- **Don't switch branches inside another agent's worktree.** Stay in your own. (Branches can only be checked out in one worktree at a time.)
- **Stale worktrees**: if an agent's session ends mid-task, the architect can `git worktree remove` and the branch lives on for the next agent to pick up.
- **Deleting a worktree doesn't delete the branch.** Branches are deleted explicitly with `git branch -d`.

## 8. CI per worktree

Every worktree pushes to GitHub; CI runs per branch. The agent does NOT need to run the full perf suite locally — CI catches it. They DO need to run `bun run type-check` and `bun test` locally before pushing.

## 9. When parallelism breaks down

Signs the parallelism scheme is failing:

- More than 25% of agent time spent rebasing / resolving conflicts → module boundaries are too leaky.
- Multiple PRs touching the same file → task queue isn't disjoint enough.
- Architect is overloaded reviewing → consider promoting a senior agent to share the role.
- Public API churn → the API isn't truly frozen; tighten the gates.

If any of these emerge, pause; root-cause; adjust this document.

---

## Quick reference

| Action | Command |
|---|---|
| Create new worker worktree | `git -C ~/work/bc-grid worktree add -b worker5 ~/work/bcg-worker5 main` |
| List worktrees | `git -C ~/work/bc-grid worktree list` |
| Remove worker worktree | `git -C ~/work/bc-grid worktree remove ~/work/bcg-worker5 && git -C ~/work/bc-grid branch -d worker5` |
| List branches | `git -C ~/work/bc-grid branch -a` |
| Claim a task (in a worker) | `git checkout -b agent/<id>/<task-slug>` |
| Sync agent branch with main | `git fetch origin && git merge origin/main` |
| Push agent branch | `git push -u origin agent/<id>/<task-slug>` |
| Return to parking branch after merge | `git checkout worker<N> && git reset --hard origin/main` |
