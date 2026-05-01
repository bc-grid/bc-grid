# @bc-grid/editors

Built-in cell editors for bc-grid. The package ships native input/select-based editors for text,
number, date, datetime, time, select, multi-select, autocomplete, and checkbox fields.

Editors render with the shared `bc-grid-editor-input` class plus
`data-bc-grid-editor-kind` and `data-bc-grid-editor-state` hooks. `@bc-grid/theming`
styles those hooks through `--bc-grid-*` tokens so Tailwind v4 / shadcn hosts can
control density, borders, focus rings, disabled, pending, and error states without
adding a runtime shadcn or Radix dependency.

## License

UNLICENSED — proprietary, see [LICENSE](../../LICENSE).
