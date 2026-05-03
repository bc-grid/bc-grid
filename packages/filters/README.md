# @bc-grid/filters

Filter primitives for bc-grid. This package owns the non-React filter registry, built-in predicate definitions, and `matchesFilter` runtime used by `@bc-grid/react`.

This package exposes:
- Built-in filter definitions: `textFilter`, `numberFilter`, `numberRangeFilter`, `dateFilter`, `dateRangeFilter`, `setFilter`, `booleanFilter`
- The `matchesFilter` runtime
- A `registerFilter` extension point for consumer-defined filters
- The `BcFilterDefinition` shape

See `docs/design/filter-registry-rfc.md` for the full contract.

## License

UNLICENSED — proprietary, see [LICENSE](../../LICENSE).
