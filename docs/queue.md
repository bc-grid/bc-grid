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
- `[ready]` **repo-foundation** — wire the repo to actually run. Add root devDeps (typescript, tsup or unbuild, vitest, biome or eslint), per-package `tsconfig.json` extending the base, project references for `tsc -b`, build scripts producing `dist/` with proper `exports` map per package, commit `bun.lock` (remove from `.gitignore`), CI smoke workflow (`.github/workflows/ci.yml`: type-check, lint, test on every PR). End state: `bun install && bun run type-check && bun run build && bun test` all green from a clean clone. **Effort**: 1-2 days. **Owner**: any agent.
- `[review: c1]` **api-rfc-v0** — write the real public API spec to `docs/api.md`: `BcGridColumn<T>` (every property), row identity rules (`rowId` callback, server-row-id semantics), controlled/uncontrolled state pairs (sort, filter, expansion, selection, columns), event names + payload shapes (`onSortChanged`, `onFilterChanged`, `onCellEditCommit`, etc.), value pipeline (getter / formatter / parser / comparator), editor contract, server query objects (`ServerQuery`, `ServerBlockResult`, `ServerTreeQuery`), public export list per package. Spec only — no implementation. Reviewer: fresh agent. **Branch**: `agent/c1/api-rfc-v0`. **Effort**: 3-5 days.

### Phase 2 — RFCs (weeks 1-3, parallel after Phase 1)

- `[ready]` **accessibility-rfc** — write `docs/design/accessibility-rfc.md`: role choice (`grid` vs `treegrid`), `aria-rowcount` semantics (total dataset vs visible), `aria-rowindex` on partial sets, focus retention across virtualisation (when focused row scrolls out of viewport), pinned rows/cols + ARIA announce order, keyboard nav per WAI-ARIA grid pattern. Reviewer: fresh agent. Blocks: `virtualizer-impl`, `react-impl-v0`. **Effort**: 3-4 days.
- `[ready]` **server-query-rfc** — write `docs/design/server-query-rfc.md`: typed query/filter/sort/group/load protocol. Block fetching, cache, eviction, optimistic edits, partial reloads, selection across unloaded rows, export-of-server-data semantics. Implementation lands Q4; this is the contract. Reviewer: fresh agent. **Effort**: 3-5 days.
- `[ready]` **ag-grid-poc-audit** — list every AG Grid feature actually used in the bc-next POC. Walk every `data-grid.tsx` / `edit-grid.tsx` / `server-edit-grid.tsx` consumer; enumerate every prop / callback / column property / API call. Output: a feature inventory in `docs/design/ag-grid-poc-audit.md` so bc-grid doesn't become a generic AG Grid clone — it's targeted at exactly what bc-next needs. **Effort**: 1-2 days. **Owner**: any agent.

### Phase 3 — Spikes (weeks 3-5, after RFCs reviewed)

- `[blocked: depends on accessibility-rfc + repo-foundation]` **virtualizer-spike-v2** — minimal virtualizer that scrolls 100k rows × 30 cols at 60fps. Pinned columns (sticky), variable row heights, focus retention as the focused row scrolls in/out of viewport, scroll-to-cell API, `aria-rowindex` / `aria-rowcount` per the a11y RFC. Pure DOM. **Output**: a working spike + a perf report. If the bar is missed, the architecture changes (escalate). **Effort**: 1-2 weeks.
- `[blocked: depends on repo-foundation]` **animation-perf-spike** — 1000 rows; click sort; rows animate to new positions at 60fps via FLIP + Web Animations. Output: working spike + perf report. **Effort**: 1 week.
- `[blocked: depends on repo-foundation]` **theme-spike** — CSS variables + Tailwind preset. Render a static grid in light + dark + 3 density modes. No JS. **Effort**: 2-3 days.

### Phase 4 — Foundation impls (weeks 5-9)

- `[blocked: depends on api-rfc-v0]` **core-types** — write all public types in `@bc-grid/core` from `api.md`. **Effort**: 4-5 days.
- `[blocked: depends on virtualizer-spike-v2]` **virtualizer-impl** — production virtualizer based on the spike. **Effort**: 2-3 weeks.
- `[blocked: depends on animation-perf-spike]` **animations-impl** — production animation system based on the spike. **Effort**: 1-2 weeks.
- `[blocked: depends on theme-spike]` **theming-impl** — production theming layer. **Effort**: 3-5 days.

### Phase 5 — Vertical slice (weeks 9-12)

- `[blocked: depends on virtualizer-impl + animations-impl + theming-impl + core-types]` **react-impl-v0** — minimal `<BcGrid>` in `@bc-grid/react` integrating foundation. Read-only, no features. **Effort**: 1 week.
- `[blocked: depends on react-impl-v0]` **q1-sort** — single-column sort + animation. **Effort**: 2-3 days.
- `[blocked: depends on react-impl-v0]` **q1-keyboard-focus** — cell focus + arrow keys + Tab/Enter. From the a11y RFC. **Effort**: 3-4 days.
- `[blocked: depends on react-impl-v0]` **q1-pinned-cols** — left + right pinned columns wired through to the React layer. **Effort**: 2-3 days.
- `[blocked: depends on q1-sort + q1-keyboard-focus + q1-pinned-cols]` **q1-vertical-slice-demo** — rebuild ONE bc-next screen (e.g., AR Customers list) entirely on bc-grid. Real data, real perf, real a11y. **Effort**: 3-5 days. **This is the Q1 "is the architecture sound?" gate.**

### Documentation & examples (parallel throughout Q1)

- `[ready]` **docs-app-skeleton** — `apps/docs/` Astro or Next.js site. Just the shell, navigation, syntax highlighting. **Effort**: 2-3 days.
- `[ready]` **examples-app-skeleton** — `apps/examples/` Vite app. Renders example components live. **Effort**: 2 days.
- `[blocked: depends on react-impl-v0]` **docs-q1-content** — write API reference for v0.1: every public type, every prop, every event. **Effort**: 1 week.

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
