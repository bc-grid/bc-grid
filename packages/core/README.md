# @bc-grid/core

Core types and contracts for bc-grid. Pure TypeScript declarations — no runtime, no React, no DOM.

Consumers usually pull this in transitively via `@bc-grid/react`. Direct install is only needed if you're authoring a custom integration that doesn't use the React layer.

## What's inside

- Public types: `BcGridColumn`, `BcGridProps`, `BcGridApi`, `BcSelection`, `BcRangeSelection`, `BcGridSort`, `BcGridFilter`, `BcRowState`, `BcCellPosition`, etc.
- Range helpers: pure state-machine functions for anchor, extend, multi-range, containment, and stable serialization.
- Server contracts: `ServerPagedQuery`, `ServerPagedResult`, `ServerBlockQuery`, `LoadServerPage`, `LoadServerBlock`, `ServerRowModelState`, `ServerRowModelDiagnostics`, `ServerInvalidation`.
- Pivot DTOs: `BcPivotedDataDTO`, `BcPivotState`, `BcPivotValue` (engine-internal types live in `@bc-grid/aggregations`).

See `docs/api.md` in the bc-grid repo for the full surface.

## License

UNLICENSED — proprietary, see [LICENSE](../../LICENSE).
