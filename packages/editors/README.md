# @bc-grid/editors

Cell editor framework for bc-grid. **v0.1.0-alpha.1 ships an empty placeholder** to lock the `@bc-grid` namespace; the real implementation lands per `docs/design/editing-rfc.md`.

The cell-edit lifecycle (8-state machine, three activation paths, sync + async validation) is partially implemented in `@bc-grid/react` (see `<BcEditGrid>` and the `editor-framework` task). The `@bc-grid/editors` package will host built-in editor implementations (text, number, date, select, checkbox, lookup, multi-select) once the framework's stable extension API is finalised.

## License

UNLICENSED — proprietary, see [LICENSE](../../LICENSE).
