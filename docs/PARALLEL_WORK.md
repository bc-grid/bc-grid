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
├── bc-grid/                       # main worktree, used by integrator + architect
├── bc-grid-c1/                    # agent C1's worktree (Claude session 1)
├── bc-grid-c2/                    # agent C2's worktree (Claude session 2)
├── bc-grid-x1/                    # agent X1's worktree (Codex session 1)
├── bc-grid-x2/                    # agent X2's worktree (Codex session 2)
└── bc-grid-x3/                    # agent X3's worktree (Codex session 3)
```

Naming: `c#` for Claude, `x#` for Codex (X for c-odeX). Numbers are stable within a session lifecycle.

## 2. Setting up a new agent worktree

From the main worktree (`~/work/bc-grid`):

```bash
# Create the new worktree on a fresh feature branch
git -C ~/work/bc-grid worktree add -b agent/c2/<task-slug> ~/work/bc-grid-c2 main

# Agent then operates in their worktree
cd ~/work/bc-grid-c2
bun install              # one-time per worktree (each has its own node_modules)
```

When the task is done and merged, retire the worktree:

```bash
git -C ~/work/bc-grid worktree remove ~/work/bc-grid-c2
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
| Create new worktree | `git -C ~/work/bc-grid worktree add -b agent/<id>/<task> ~/work/bc-grid-<id> main` |
| List worktrees | `git -C ~/work/bc-grid worktree list` |
| Remove worktree | `git -C ~/work/bc-grid worktree remove ~/work/bc-grid-<id>` |
| List branches | `git -C ~/work/bc-grid branch -a` |
| Sync agent branch with main | `cd ~/work/bc-grid-<id> && git fetch origin && git merge origin/main` |
| Push agent branch | `git push -u origin agent/<id>/<task>` |
