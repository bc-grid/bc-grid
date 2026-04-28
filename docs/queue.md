# Work Queue

The single source of truth for "what's available to be picked up." Read `AGENTS.md §5` for how to claim work.

**Status legend:**
- `[ready]` — task spec written, no blockers, claim by editing this file + branching
- `[in-flight: <agent>]` — claimed; agent's branch open
- `[review: <agent>]` — PR open, waiting on review
- `[done: <agent> #PR]` — merged
- `[blocked: <agent> - <reason>]` — paused, waiting on something

**Update protocol:** edit this file via PR (or via the integrator's worktree if no integrator online). Always include task slug + assigned agent + PR or branch reference.

---

## Q1 — Foundation

### Architecture & infrastructure

- `[in-flight: architect]` **design-v1** — write `docs/design-v1.md` covering architecture, perf bars, package boundaries, parallelism scheme. **Owner**: architect. **Branch**: `agent/architect/design-v1`.
- `[ready]` **api-spec-v0** — sketch the public API in `docs/api.md` v0.1. Reference `design-v1.md §9`. Spec only — no implementation. **Depends on**: design-v1 done. **Estimated effort**: 2 days.
- `[ready]` **ci-skeleton** — set up GitHub Actions: type-check, lint (Biome or ESLint), test (Vitest), bundle-size check, API surface diff. **Estimated effort**: 2-3 days.
- `[ready]` **perf-harness** — `apps/benchmarks/`: harness for measuring scroll FPS, sort time, memory, bundle size. Outputs JSON. **Estimated effort**: 3-4 days.
- `[ready]` **package-skeletons** — empty `package.json` + `tsconfig.json` + `src/index.ts` for each of: `core`, `virtualizer`, `animations`, `theming`, `react`. With proper deps and workspace links. **Estimated effort**: 1 day.

### Spikes (must complete before feature work)

- `[ready]` **virtualizer-perf-spike** — minimal virtualizer that scrolls 100k rows × 30 cols at 60fps. Pure DOM. No features. Just prove the rendering core can hit the bar. **Output**: a working spike + a perf report. If the bar is missed, the architecture changes (escalate). **Estimated effort**: 1-2 weeks.
- `[ready]` **animation-perf-spike** — 1000 rows; click sort; rows animate to new positions at 60fps via FLIP + Web Animations. **Output**: working spike + perf report. **Estimated effort**: 1 week.
- `[ready]` **theme-spike** — CSS variables + Tailwind preset. Render a static grid in light + dark + 3 density modes. No JS. **Estimated effort**: 2-3 days.

### Foundation packages (depend on spikes)

- `[blocked: depends on spikes]` **core-types** — write all public types in `core/`. Reference `design-v1.md §9` and `api.md`. **Effort**: 4-5 days.
- `[blocked: depends on spikes]` **virtualizer-impl** — production virtualizer based on the spike. **Effort**: 2-3 weeks.
- `[blocked: depends on spikes]` **animations-impl** — production animation system based on the spike. **Effort**: 1-2 weeks.
- `[blocked: depends on virtualizer-impl]` **react-impl-v0** — minimal `<BcGrid>` integrating virtualizer + animations + theming. Read-only, no features. **Effort**: 1 week.

### Q1 features (build on foundation)

- `[blocked: depends on react-impl-v0]` **q1-sort** — column sort + animation. **Effort**: 3-4 days.
- `[blocked: depends on react-impl-v0]` **q1-filter** — column filter (basic text). **Effort**: 3-4 days.
- `[blocked: depends on react-impl-v0]` **q1-search** — global quick filter. **Effort**: 2-3 days.
- `[blocked: depends on react-impl-v0]` **q1-paginate-client** — client-side pagination. **Effort**: 2 days.
- `[blocked: depends on react-impl-v0]` **q1-paginate-server** — `<BcServerGrid>` paged mode. **Effort**: 4-5 days.
- `[blocked: depends on react-impl-v0]` **q1-group-by** — column grouping with expand/collapse + group animation. **Effort**: 1 week.
- `[blocked: depends on react-impl-v0]` **q1-column-state** — resize, reorder, pin, visibility, persistence. **Effort**: 1 week.

### Documentation & examples

- `[ready]` **docs-app-skeleton** — `apps/docs/` Next.js or Astro site. Just the shell, navigation, syntax highlighting. **Effort**: 2-3 days.
- `[ready]` **examples-app-skeleton** — `apps/examples/` Vite app. Renders example components live. **Effort**: 2 days.

---

## Q2 — Editing (queued, not yet ready)

(populated end of Q1)

---

## Q3 — Range selection + master-detail (queued)

(populated end of Q2)

---

## Q4 — Server-side row model (queued)

(populated end of Q3)

---

## Conventions

- Tasks are sized: small (< 3 days), medium (3-7 days), large (1-2 weeks). Larger than 2 weeks → split.
- Every task has an effort estimate. If the agent thinks it'll be more, file a comment on the task before claiming.
- Tasks cite which design docs they implement (design-v1, design/X, etc.).
- Cross-package coordination: tasks that touch >1 package require architect approval before claiming.
