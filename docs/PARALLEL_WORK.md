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
├── bc-grid/                       # main worktree (architect / integrator) — branch: main
├── bcg-worker1/                   # parking branch: worker1
├── bcg-worker2/                   # parking branch: worker2
├── bcg-worker3/                   # parking branch: worker3
└── bcg-worker4/                   # parking branch: worker4
```

**Naming convention:** worktrees are agent-agnostic (`bcg-worker1`–`bcg-worker4`). Any agent — Claude or Codex — can work in any worktree. The agent's identity goes in the **branch name** (`agent/c1/<task-slug>` for Claude session 1, `agent/x1/<task-slug>` for Codex session 1) so logs and PRs make it clear who did what.

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

## 3. Setting up additional worktrees (beyond the initial 4)

If a 5th worker is needed:

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

## 3. Phase-by-phase parallelism

The split below assumes Q1's foundation work is complete (architecture, package skeletons, perf spikes).

### Q1 (months 1-3) — Foundation. Mostly serial.

Q1 is **not** the place for 5-agent parallelism. The architecture has to cohere. Work distribution:

- **Architect (1 agent or human)**: design doc, API spec, foundation packages (`core`, `virtualizer`, `animations`, `theming`). Owns the perf spike.
- **Test-infra agent (1 agent)**: CI, perf harness, visual regression infrastructure, type-check setup, lint/format config. Independent of architect's work.
- **Docs agent (1 agent)**: docs site scaffold, examples app skeleton, README content.
- **Reviewer agent (1 agent)**: reviews architect's PRs (always-fresh review).

Maximum 4 concurrent in Q1; usually 2-3.

### Q2 (months 4-6) — In-grid editing + cell editors. 5 agents unlock.

After the editor framework lands (architect-driven, week 1 of Q2), parallel agents fan out:

- **Agent C1**: keyboard nav state machine + the editor framework's React adapter
- **Agent C2**: text + number editors (`editors/text`, `editors/number`)
- **Agent X1**: date + datetime + time editors (`editors/date`, `editors/datetime`, `editors/time`)
- **Agent X2**: select + multi-select + autocomplete editors (`editors/select`, `editors/multi-select`, `editors/autocomplete`)
- **Agent X3**: validation framework + dirty tracking + e2e edit tests

Each agent owns a leaf package or two; PRs land independently; reviewer agent rotates.

### Q3 (months 7-9) — Range selection + master-detail.

- **Agent C1**: range selection model (`core/range`) — coherent design, single owner
- **Agent C2**: clipboard handlers (TSV serialize, HTML serialize, paste-from-Excel parser)
- **Agent X1**: fill handle + drag-extend + selection visual layer
- **Agent X2**: master-detail rows
- **Agent X3**: column groups (multi-row headers) + sticky header polish

### Q4 (months 10-12) — Server-side row model + tree.

- **Agent C1**: server-paged + server-sort/filter wiring
- **Agent C2**: infinite scroll + block caching + LRU eviction
- **Agent X1**: lazy tree children (server-tree mode)
- **Agent X2**: server-side group expand/collapse
- **Agent X3**: integration tests + perf testing for server modes (cross-cutting)

### Y2 — Massive parallelism. 5 agents on independent features.

Year 2 is the breadth phase. Most tasks are isolated.

Example month split (months 13-15, aggregations + pivots):
- **Agent C1**: aggregation core + sum/avg/count/min/max
- **Agent C2**: custom aggregation hooks + pivot table architect
- **Agent X1**: filter UIs (set, multi, date-range)
- **Agent X2**: filter UIs (number-range, text, custom)
- **Agent X3**: status bar + sidebar + context menu

The roadmap.md will track quarter-by-quarter assignments. Architects can shuffle as priorities shift.

## 4. Coordination protocol

### 4.1 The work queue

`docs/queue.md` is the single source of truth for "what's available to claim". Format:

```
## Q2 Tasks

- [ready]    keyboard-state-machine             | depends on editor-framework
- [in-flight: c1] editor-framework             | branch: agent/c1/editor-framework
- [done: x2] editors/text                      | merged in #42
- [blocked: c2 - waiting on editor-framework] editors/number
```

When you claim a task, you edit this file. The edit goes via PR or via the integrator's worktree (architect approval if no integrator online).

### 4.2 Daily integration

Once per day (or per work-cycle), the integrator:

1. Reviews open PRs.
2. Merges any that are green and approved.
3. Pulls main into any in-flight branches that are too far behind.
4. Updates `docs/queue.md` with status.
5. Posts a brief summary in the project log.

If no human integrator: a designated agent does this on a cron via Claude Code's `loop` skill, with a final human review for the merge action.

### 4.3 Cross-agent communication

- **Github issues** for design questions, bug reports, blockers.
- **PR comments** for code-specific discussion.
- **`docs/design/<feature>.md`** for any new feature's spec — written before code, reviewed by another agent.
- **Never read another agent's WIP branch** to "see what they're doing." If you need to coordinate, file an issue or wait for their PR.

### 4.4 Conflict resolution

If two PRs touch the same file (rare with strict module boundaries, but happens):

1. Whoever lands first wins.
2. The second rebases their branch onto the new main.
3. Conflicts beyond trivial: the architect makes the call.

If two PRs disagree on architecture: stop; architect resolves; one or both PRs may need rework.

## 5. Agent roles per session

Not every agent does every kind of work. Recommended specialization:

- **Architect**: senior agent or human. Drives Q1; reviews architecture-touching PRs throughout. Always-on.
- **Test-infra**: tests, CI, benchmark harness, perf monitoring. Stable assignment across phases.
- **Docs**: docs site, examples, migration guides, public-facing docs. Stable assignment.
- **Feature engineers** (3-4): rotate per phase based on the queue. Each owns 1-2 packages per quarter.
- **Reviewer**: rotates. Every PR has a non-author reviewer. Reviewing IS legitimate work; track in queue.

A 5-agent setup typically: 1 architect/integrator + 1 test-infra + 1 docs + 2 feature engineers. Or 1 architect + 4 feature engineers in heavy parallelism phases.

## 6. Worktree hygiene

- **Each worktree has its own `node_modules`.** `bun install` once per worktree.
- **Each worktree may have its own `.env.local`** — don't commit, never share secrets between worktrees.
- **Don't switch branches inside another agent's worktree.** Stay in your own. (Branches can only be checked out in one worktree at a time.)
- **Stale worktrees**: if an agent's session ends mid-task, the architect can `git worktree remove` and the branch lives on for the next agent to pick up.
- **Deleting a worktree doesn't delete the branch.** Branches are deleted explicitly with `git branch -d`.

## 7. CI per worktree

Every worktree pushes to GitHub; CI runs per branch. The agent does NOT need to run the full perf suite locally — CI catches it. They DO need to run `bun run type-check` and `bun test` locally before pushing.

## 8. When parallelism breaks down

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
