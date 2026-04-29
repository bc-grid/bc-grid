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

## Q1 — Foundation + Vertical Slice

### Phase 1 — Get the repo right (week 1, blocks everything)

- `[done]` **design** — write `docs/design.md` and revise post-Codex-review. **Architect**. Done.
- `[done: architect af249af]` **repo-foundation** — wire the repo to actually run. Add root devDeps (typescript, tsup or unbuild, vitest, biome or eslint), per-package `tsconfig.json` extending the base, project references for `tsc -b`, build scripts producing `dist/` with proper `exports` map per package, commit `bun.lock` (remove from `.gitignore`), CI smoke workflow (`.github/workflows/ci.yml`: type-check, lint, test on every PR). End state: `bun install && bun run type-check && bun run build && bun test` all green from a clean clone. **Effort**: 1-2 days.
- `[done: c1 #5]` **api-rfc-v0** — write the real public API spec to `docs/api.md`: `BcGridColumn<T>` (every property), row identity rules (`rowId` callback, server-row-id semantics), controlled/uncontrolled state pairs (sort, filter, expansion, selection, columns), event names + payload shapes (`onSortChanged`, `onFilterChanged`, `onCellEditCommit`, etc.), value pipeline (getter / formatter / parser / comparator), editor contract, server query objects (`ServerQuery`, `ServerBlockResult`, `ServerTreeQuery`), public export list per package. Spec only — no implementation. **Effort**: 3-5 days.

### Phase 2 — RFCs (weeks 1-3, parallel after Phase 1)

- `[done: x1 #1]` **accessibility-rfc** — write `docs/design/accessibility-rfc.md`: role choice (`grid` vs `treegrid`), `aria-rowcount` semantics (total dataset vs visible), `aria-rowindex` on partial sets, focus retention across virtualisation (when focused row scrolls out of viewport), pinned rows/cols + ARIA announce order, keyboard nav per WAI-ARIA grid pattern. Reviewer: fresh agent. Blocks: `virtualizer-impl`, `react-impl-v0`. **Effort**: 3-4 days.
- `[done: x1 #2]` **server-query-rfc** — write `docs/design/server-query-rfc.md`: typed query/filter/sort/group/load protocol. Block fetching, cache, eviction, optimistic edits, partial reloads, selection across unloaded rows, export-of-server-data semantics. Implementation lands Q4; this is the contract. Reviewer: fresh agent. **Effort**: 3-5 days.
- `[done: c1 #3]` **ag-grid-poc-audit** — list every AG Grid feature actually used in the bc-next POC. Walk every `data-grid.tsx` / `edit-grid.tsx` / `server-edit-grid.tsx` consumer; enumerate every prop / callback / column property / API call. Output: a feature inventory in `docs/design/ag-grid-poc-audit.md` so bc-grid doesn't become a generic AG Grid clone — it's targeted at exactly what bc-next needs. **Effort**: 1-2 days.

### Phase 3 — Spikes (weeks 3-5, after RFCs reviewed)

- `[done: c1 #9]` **virtualizer-spike-v2** — minimal virtualizer that scrolls 100k rows × 30 cols at 60fps. Pinned columns, variable row heights, focus retention with a max 2-row retention budget, scroll-to-cell API, active-cell visibility query, `aria-rowindex` / `aria-rowcount` per the a11y RFC. Pure DOM. NVDA + VoiceOver spot-check deferred to `screenreader-spot-check` task below. **Branch**: `agent/c1/virtualizer-spike-v2` (merged). **Effort**: 1-2 weeks.
- `[done: x1 #11]` **animation-perf-spike** — 1000 rows; click sort; rows animate to new positions at 60fps via FLIP + Web Animations. Output: working spike + perf report. **Branch**: `agent/x1/animation-perf-spike`. **Effort**: 1 week.
- `[done: x1 #10]` **theme-spike** — CSS variables + Tailwind preset. Render a static grid in light + dark + 3 density modes. No JS. **Effort**: 2-3 days.

### Phase 4 — Foundation impls (weeks 5-9)

- `[done: x1 #14]` **core-types** — write all public types in `@bc-grid/core` from `api.md`. **Effort**: 4-5 days.
- `[done: c1 #20+#21+#22+#23+#24]` **virtualizer-impl** — production virtualizer based on the spike. Plan in `docs/design/virtualizer-impl-plan.md`; impl report in `docs/design/virtualizer-impl-report.md`. Six PRs: surface alignment (#20), Fenwick tree (#21), in-flight retention (#22), RO RAF throttling (#23), pinned-row support (#24), impl report (this PR). 96 unit + 35 e2e tests. **Effort**: 2-3 weeks (delivered).
- `[done: x1 #16]` **animations-impl** — production animation system based on the spike. **Branch**: `agent/x1/animations-impl`. **Effort**: 1-2 weeks.
- `[review: x1 #15]` **theming-impl** — production theming layer. Awaiting class-name rename to kebab-case per `design.md §13` (#18). **Branch**: `agent/x1/theming-impl`. **Effort**: 3-5 days.

### Phase 5 — Vertical slice (weeks 9-12)

- `[in-flight: x1]` **react-impl-v0** — plan + scaffold underway against merged `core-types`, `animations-impl`, and virtualizer surface alignment (#20). Final polish/integration still depends on `virtualizer-impl` internals and `theming-impl` (#15). Minimal `<BcGrid>` in `@bc-grid/react` integrating foundation. Read-only, no features. **Effort**: 1 week.
- `[blocked: depends on react-impl-v0]` **q1-sort** — single-column sort + animation. **Effort**: 2-3 days.
- `[blocked: depends on react-impl-v0]` **q1-keyboard-focus** — cell focus + arrow keys + Tab/Enter. From the a11y RFC. **Effort**: 3-4 days.
- `[blocked: depends on react-impl-v0]` **q1-pinned-cols** — left + right pinned columns wired through to the React layer. **Effort**: 2-3 days.
- `[blocked: depends on q1-sort + q1-keyboard-focus + q1-pinned-cols]` **q1-vertical-slice-demo** — rebuild ONE bc-next screen (e.g., AR Customers list) entirely on bc-grid. Real data, real perf, real a11y. **Effort**: 3-5 days. **This is the Q1 "is the architecture sound?" gate.**

### Documentation & examples (parallel throughout Q1)

- `[done: x1 #6]` **docs-app-skeleton** — `apps/docs/` Astro or Next.js site. Just the shell, navigation, syntax highlighting. **Effort**: 2-3 days.
- `[done: x1 #4]` **examples-app-skeleton** — `apps/examples/` Vite app. Renders example components live. **Effort**: 2 days.
- `[blocked: depends on react-impl-v0]` **docs-q1-content** — write API reference for v0.1: every public type, every prop, every event. **Effort**: 1 week.

### Quality + infra (parallel throughout Q1)

- `[ready]` **screenreader-spot-check** — run the NVDA + VoiceOver pinned-column DOM-order methodology from `docs/design/virtualizer-spike-v2-report.md` against the merged spike. Validates that pinned cells + body cells announce in column-index order, that ARIA rowcount/colcount semantics match the dataset, and that no spurious "leaving / entering" events appear at pinned↔body transitions. Deferred from `virtualizer-spike-v2` (PR #9) at merge time because it requires Windows + macOS hardware. If a divergence surfaces, file as a virtualizer-impl follow-up rather than blocking unrelated work. **Effort**: half day per engine.
- `[ready]` **nightly-perf-harness** — measure `design.md §3.2` nightly bars on stable hardware: scroll FPS at 100k × 30 (≥58 sustained over 2s), grid-overhead memory (< 30MB above raw dataset, heap diff via CDP `HeapProfiler.takeHeapSnapshot`), filter / sort latency. Runs via Playwright + dedicated workflow (not the per-PR e2e job) so CI variance doesn't gate. Median of 3 runs. **Effort**: 2-3 days.
- `[ready]` **api-surface-diff** — `tools/api-surface/` script that walks every package's built `dist/index.d.ts`, extracts the export names, and diffs against an expected manifest derived from `docs/api.md §9`. CI step in smoke job; fails the build on drift. Catches over-exports (helper functions leaking out of `@bc-grid/animations`) and under-exports (api.md promises a name the package doesn't ship). **Effort**: 1-2 days.

---

## Q2 — Editing + Q1 read-only catch-up (queued)

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
- Tasks cite which design docs they implement (`design.md`, `design/X.md`).
- Cross-package coordination: tasks that touch >1 package require architect approval before claiming.
