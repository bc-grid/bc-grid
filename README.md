# bc-grid

A high-performance, shadcn-native data grid for React. Built to compete with AG Grid Enterprise on speed, animations, and developer experience — without the licence fees and aftermarket-styling friction.

**Status:** Pre-alpha. Architecture phase. No public API yet.

---

## Why

Most React data grids are either capable but visually disconnected from modern design systems (AG Grid, Handsontable), or visually clean but underpowered for ERP-class workloads (TanStack Table examples, Material React Table). bc-grid aims to deliver both:

- **Performance**: 60fps scroll with 100k rows × 30 columns. Matched or better than AG Grid.
- **Animations**: Sort transitions, group expand/collapse, row insert/remove, cell flash — all 60fps, all coherent.
- **Excel-feel editing**: Full keyboard model, range selection, copy/paste-from-Excel, fill handle.
- **Server-side row model**: Infinite scroll with block caching, lazy tree children, server-side sort/filter/group.
- **Native shadcn theming**: Built on shadcn/Radix primitives from the ground up. No CSS-variable retrofit.
- **Clean public API**: 10 years of API hindsight at our disposal.

## Non-goals (initial release)

- 100% AG Grid feature parity. The 80-90% of features that 95% of users actually need is the target.
- Charts integration. Out-of-scope until 1.0+; chart libraries do this better.
- Frameworks beyond React. Vue/Solid/Angular bindings deferred indefinitely.

## Architecture (high-level)

- `core` — framework-agnostic state + types
- `virtualizer` — high-performance row + column virtualization renderer
- `animations` — FLIP/transform animation primitives
- `theming` — CSS architecture (variables, design tokens)
- `react` — public React component layer (the surface developers consume)
- `editors`, `filters`, `aggregations`, `export`, `server-row-model`, `enterprise` — feature packages, each independently ownable

See `docs/design-v1.md` for the architecture in depth.

## Roadmap

2-year plan to 1.0. See `docs/roadmap.md`.

## Working on this project

Multi-agent parallel development on git worktrees. See `docs/AGENTS.md` for the process and `docs/PARALLEL_WORK.md` for the worktree scheme.

## Licence

Undecided. Treat as proprietary for now. See `docs/LICENCE_TBD.md`.
