# @bc-grid/aggregations

Aggregation engine for bc-grid. **v0.1.0-alpha.1 ships an empty placeholder** to lock the `@bc-grid` namespace; the real implementation lands during the v1.0 parity sprint per `docs/design/aggregation-rfc.md`.

When implemented, this package exposes:
- Built-in factories: `sum`, `count`, `avg`, `min`, `max`
- A `registerAggregation` extension point for consumer-defined aggregations
- The `Aggregation<TValue, TResult>` factory shape with `init / step / merge / finalize` (Java Collector-style)
- The `AggregationResult<TResult>` output type

See the RFC for the full contract.

## License

UNLICENSED — proprietary, see [LICENSE](../../LICENSE).
