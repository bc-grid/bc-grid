# @bc-grid/filters

Filter primitives for bc-grid. **v0.1.0-alpha.1 ships an empty placeholder** to lock the `@bc-grid` namespace; the real implementation lands during the v1.0 parity sprint per `docs/design/filter-registry-rfc.md`.

When implemented, this package exposes:
- Built-in filter definitions: `textFilter`, `numberFilter`, `dateFilter`, `setFilter`, `booleanFilter`
- The `matchesFilter` runtime
- A `registerFilter` extension point for consumer-defined filters
- The `BcFilterDefinition` shape

See the RFC for the full contract.

## License

UNLICENSED — proprietary, see [LICENSE](../../LICENSE).
