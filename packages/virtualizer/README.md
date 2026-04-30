# @bc-grid/virtualizer

Virtualizer engine for bc-grid. Framework-agnostic; pulled in transitively by `@bc-grid/react`. Direct install is rarely needed.

## What's inside

- `Virtualizer` — row + column virtualization with Fenwick-tree cumulative offsets, in-flight retention (reference-counted, idempotent), JS-driven pinned cells, RAF-throttled `ResizeObserver` reconciliation.
- `DOMRenderer` — internal renderer used by the React layer.
- A11y types: `VirtualRowA11yMeta`, `VirtualColumnA11yMeta` for `aria-rowindex`/`aria-colindex` reconciliation.

Smoke perf: 100k rows × 30 cols at 60fps. See `docs/design/virtualizer-impl-report.md`.

## License

UNLICENSED — proprietary, see [LICENSE](../../LICENSE).
