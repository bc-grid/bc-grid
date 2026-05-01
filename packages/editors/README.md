# @bc-grid/editors

Built-in cell editors for bc-grid. The package ships native input/select-based editors for text,
number, date, datetime, time, select, multi-select, autocomplete, and checkbox fields.

Editors render with the shared `bc-grid-editor-input` class plus
`data-bc-grid-editor-kind` and `data-bc-grid-editor-state` hooks. `@bc-grid/theming`
styles those hooks through `--bc-grid-*` tokens so Tailwind v4 / shadcn hosts can
control density, borders, focus rings, disabled, pending, and error states without
adding a runtime shadcn or Radix dependency.

## Lookup and select editors

`selectEditor` and `multiSelectEditor` read `column.options`. Options may be a
static array or a row-scoped function:

### Static select options

```ts
import { selectEditor } from "@bc-grid/editors"

type CustomerStatus = "prospect" | "active" | "hold"

const statusOptions: readonly { value: CustomerStatus; label: string }[] = [
  { value: "prospect", label: "Prospect" },
  { value: "active", label: "Active" },
  { value: "hold", label: "On hold" },
]

const statusColumn = {
  field: "status",
  header: "Status",
  editable: true,
  cellEditor: selectEditor,
  options: statusOptions,
}
```

Select-style editors commit the selected option `value`, not the option label.
That means typed option values are preserved and `column.valueParser` is bypassed
for `selectEditor`, `multiSelectEditor`, and `checkboxEditor`. Use
`valueParser` for string-producing editors such as `textEditor`,
`numberEditor`, date/time inputs, and `autocompleteEditor`.

`multiSelectEditor` expects the cell value to be an array and commits a typed
array of selected option values. Options not present in the current option list
cannot be committed from the native control.

### Async autocomplete options

`autocompleteEditor` uses `column.fetchOptions(query, signal)` with a native
`<input list>` / `<datalist>` surface. The editor aborts superseded requests via
the supplied `AbortSignal`. Fetch failures do not block typing or commit; the
editor leaves suggestions as-is and commits the free-text input, so use
`valueParser` and `validate` when the string must resolve to a known typed value.

```ts
import { autocompleteEditor } from "@bc-grid/editors"

const ownerColumn = {
  field: "owner",
  header: "Collector",
  editable: true,
  cellEditor: autocompleteEditor,
  fetchOptions: async (query: string, signal: AbortSignal) => {
    const response = await fetch(`/api/collectors?q=${encodeURIComponent(query)}`, {
      signal,
    })
    return (await response.json()) as readonly { value: string; label: string }[]
  },
  valueParser: (input: string) => input.trim(),
  validate: (next: unknown) =>
    typeof next === "string" && next.length > 0
      ? { valid: true }
      : { valid: false, error: "Collector is required." },
}
```

`checkboxEditor` commits a boolean from the native checkbox `checked` state.
Only the boolean `true` mounts checked; string or numeric lookalikes remain
unchecked. Tri-state checkbox editing is not part of the v0.4 built-in surface.

All built-in editors derive their accessible name from `column.header` when it
is plain text, then `field`, then `columnId`. Validation errors are surfaced via
`aria-invalid` and the shared editor state hooks; pending async validation or
server commit disables the native control.

### Server-backed edit grids

Lookup editors do not queue server writes themselves. In a server-backed grid,
commit the typed option value or autocomplete string through the normal edit
pipeline, then let `<BcServerGrid onServerRowMutation>` or a manual
`onCellEditCommit` handler queue, validate, settle, and roll back the mutation.
Keep validation on the column so rejected lookup values surface through the same
pending/error hooks as local edits.

## License

UNLICENSED — proprietary, see [LICENSE](../../LICENSE).
