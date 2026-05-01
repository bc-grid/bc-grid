# @bc-grid/server-row-model

Server row model engine for bc-grid. Implements paged + infinite + tree fetching with block caching, request deduplication, AbortController cancellation, and LRU eviction.

Pulled in transitively by `@bc-grid/react` when consumers use `<BcServerGrid>`. Direct install is rarely needed.

## What's shipped at v0.1.0-alpha.1

- **Paged mode** (`rowModel="paged"`): `LoadServerPage` contract, abort-on-supersede, request dedup by `blockKey`.
- **Infinite mode** (`rowModel="infinite"`): `LoadServerBlock` with viewport-driven block fetching, LRU eviction, configurable `maxBlocks` / `maxConcurrentRequests` / `staleTimeMs`.
- **Tree mode** (`rowModel="tree"`): RFC'd, impl reserved for v0.2.

## What's exported

- `createServerRowModel<TRow>()` — factory
- `ServerBlockCache<TRow>` — cache class
- `defaultBlockKey({ mode, ... })` — stable block-key formatter
- `summarizeServerViewState`, `summarizeServerQuery`, `summarizeServerCache`, `summarizeServerRowModelState` — pure diagnostics helpers for request logging and developer panels

The React-facing wiring lives in `@bc-grid/react/serverGrid` (the `<BcServerGrid>` component).

See `docs/design/server-query-rfc.md`.

## License

UNLICENSED — proprietary, see [LICENSE](../../LICENSE).
