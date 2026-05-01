# bc-grid

A high-performance, shadcn-native data grid for React. Built to compete with AG Grid Enterprise on speed, animations, and developer experience — without the licence fees and aftermarket-styling friction.

**Status:** v0.1-alpha imminent (read-only client-side grid; see `docs/coordination/v0.1-alpha-release-plan.md`). v1.0 targets full feature parity with AG Grid Enterprise for ERP workloads, delivered in a **2-week parallel sprint** with 5 worker agents plus a Codex coordinator (see `docs/coordination/v1-parity-sprint.md`). Charts are explicitly post-1.0.

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

- **Bug-for-bug AG Grid parity.** v1.0 targets feature parity for ERP workloads, not test-suite parity with AG Grid's 7+ years of edge-case polish. Edge-case parity is a continuous post-1.0 backlog.
- Frameworks beyond React. Vue/Solid/Angular bindings deferred indefinitely.
- RTL languages. Post-1.0.
- Spreadsheet-class formula editing. Deferred indefinitely; bc-grid is a data grid, not a spreadsheet.
- Charts integration. Post-1.0 as a peer-dep adapter; the design draft is preserved in `docs/design/charts-rfc.md`.

## Architecture (high-level)

Two layers: **engine** (framework-agnostic, depends on `core`) and **React** (the consumer surface).

**Engine packages** (no React, no DOM in most cases):
- `@bc-grid/core` — types + state contracts
- `@bc-grid/virtualizer` — high-performance row + column virtualisation
- `@bc-grid/animations` — FLIP / Web Animations primitives
- `@bc-grid/theming` — CSS architecture (variables, tokens, density modes)
- `@bc-grid/aggregations` — pure aggregation functions (sum, avg, count, min, max, custom)
- `@bc-grid/filters` — predicates + serialisation for every filter type
- `@bc-grid/export` — pure CSV / Excel / PDF serialisers
- `@bc-grid/server-row-model` — state machine for paged / infinite / tree modes

**React packages** (the consumer surface):
- `@bc-grid/react` — public components (`<BcGrid>`, `<BcEditGrid>`, `<BcServerGrid>`) + hooks
- `@bc-grid/editors` — built-in cell editors (text, number, date, select, ...)

Consumers import from `@bc-grid/react` and types from `@bc-grid/core`. Engine packages are workspace internals reused by the React layer.

See `docs/design.md` for the architecture in depth.

## Install (from private GitHub Packages)

bc-grid is published privately to GitHub Packages. The repo and packages are private — only accounts with explicit access can install.

### One-time setup (per consuming app)

1. **Create a Classic Personal Access Token** at https://github.com/settings/tokens (Tokens classic — *not* fine-grained; the cross-repo private package read path is unreliable on fine-grained tokens):
   - Scopes: `read:packages` **and** `repo` (the `repo` scope is required because the package lives in a private repo).
   - Set "no expiration" or a long expiration; rotate annually.

2. **Add `.npmrc` to your consuming app** (use [`.npmrc.example`](./.npmrc.example) as a starting point):

   ```
   @bc-grid:registry=https://npm.pkg.github.com
   //npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
   ```

3. **Make `GITHUB_TOKEN` available**:
   - **Locally**: export it in your shell or store it as a literal token in `~/.npmrc` (gitignored, never committed).
   - **In CI**: add the PAT as a repo secret (e.g., `BC_GRID_READ_TOKEN`); reference it in your project `.npmrc`.

4. **Install**:
   ```bash
   bun add @bc-grid/react @bc-grid/theming
   ```

5. **Wire the CSS** at your app entry:
   ```ts
   import "@bc-grid/theming/styles.css"
   ```

The auth model is documented in detail in [`docs/design/publish-rfc.md`](./docs/design/publish-rfc.md).

## Roadmap

**2-week sprint to v1.0** with 5 worker agents plus a Codex coordinator — covers the ERP grid scope needed for 1.0. Charts are post-1.0. See `docs/roadmap.md` for the day-by-day plan and `docs/coordination/v1-parity-sprint.md` for the active orchestration. Q1 vertical-slice gate cleared on day 0 (PR #42).

The original 2-year timeline is preserved as historical context in `design.md §13`'s decision log — the compression is real and is documented as the 2026-04-29 scope+timeline pivot.

## Working on this project

Multi-agent parallel development on git worktrees. See `docs/AGENTS.md` for the process and `docs/PARALLEL_WORK.md` for the worktree scheme.

## Licence

UNLICENSED — proprietary. See [`LICENSE`](./LICENSE) for the full text. Distribution is limited to John Cottrell and accounts explicitly granted GitHub Packages access tokens.
