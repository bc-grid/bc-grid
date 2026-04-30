# @bc-grid/aggregations

Pure aggregation and pivot-table engine for bc-grid.

This package exposes:
- Built-in aggregation factories: `sum`, `count`, `avg`, `min`, `max`
- A `registerAggregation` extension point for consumer-defined aggregations
- The `Aggregation<TValue, TResult>` factory shape with `init / step / merge / finalize`
- Column and group aggregation drivers: `aggregate`, `aggregateColumns`, `aggregateGroups`
- Client-side pivot computation via `pivot(rows, columns, state)`

React rendering lives in `@bc-grid/react`; this package has no DOM or React dependency.

## License

UNLICENSED — proprietary, see [LICENSE](../../LICENSE).
