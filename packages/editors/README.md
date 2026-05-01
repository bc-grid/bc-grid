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
static array or a row-scoped function. Keep enum/tag values typed, then use
autocomplete for string lookups that need async suggestions:

```ts
import type { BcReactGridColumn } from "@bc-grid/react"
import { autocompleteEditor, multiSelectEditor, selectEditor } from "@bc-grid/editors"

type CustomerStatus = "prospect" | "active" | "hold"
type CustomerFlag = "vip" | "tax-exempt" | "manual-review"

interface CustomerRow {
  id: string
  status: CustomerStatus
  flags: readonly CustomerFlag[]
  owner: string
}

const statusOptions: readonly { value: CustomerStatus; label: string }[] = [
  { value: "prospect", label: "Prospect" },
  { value: "active", label: "Active" },
  { value: "hold", label: "On hold" },
]

const flagOptions: readonly { value: CustomerFlag; label: string }[] = [
  { value: "vip", label: "VIP" },
  { value: "tax-exempt", label: "Tax exempt" },
  { value: "manual-review", label: "Manual review" },
]

const customerColumns: readonly BcReactGridColumn<CustomerRow, unknown>[] = [
  {
    field: "status",
    header: "Status",
    editable: true,
    cellEditor: selectEditor,
    options: statusOptions,
  },
  {
    field: "flags",
    header: "Flags",
    editable: true,
    cellEditor: multiSelectEditor,
    options: flagOptions,
  },
  {
    field: "owner",
    header: "Collector",
    editable: true,
    cellEditor: autocompleteEditor,
    fetchOptions: async (query, signal) => {
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
  },
]
```

Select-style editors commit the selected option `value`, not the option label.
That means typed option values are preserved and `column.valueParser` is bypassed
for `selectEditor`, `multiSelectEditor`, and `checkboxEditor`. Use
`valueParser` for string-producing editors such as `textEditor`,
`numberEditor`, date/time inputs, and `autocompleteEditor`.

Printable activation on `selectEditor` preselects the first option whose label or
value starts with the typed character; browser-native typeahead continues after
focus lands on the `<select>`. `multiSelectEditor` keeps native listbox
semantics and exposes the seeded-state hook without auto-toggling values.

`multiSelectEditor` expects the cell value to be an array and commits a typed
array of selected option values. Options not present in the current option list
cannot be committed from the native control.

`autocompleteEditor` uses `column.fetchOptions(query, signal)` with a native
`<input list>` / `<datalist>` surface. The editor aborts superseded requests via
the supplied `AbortSignal`; pass it through to `fetch` or any abort-aware lookup
client. Fetch failures do not block typing or commit; the editor leaves
suggestions as-is and commits the free-text input, so use `valueParser` and
`validate` when the string must resolve to a known typed value.

`checkboxEditor` commits a boolean from the native checkbox `checked` state.
Only the boolean `true` mounts checked; string or numeric lookalikes remain
unchecked. Tri-state checkbox editing is not part of the v0.4 built-in surface.

All built-in editors derive their accessible name from `column.header` when it
is plain text, then `field`, then `columnId`. Validation errors are surfaced via
`aria-invalid`, `aria-describedby`, and the shared editor state hooks; pending
async validation or server commit disables the native control. The shared
`data-bc-grid-editor-state` hook is the styling contract for idle, pending,
error, and disabled density treatment.

## License

UNLICENSED — proprietary, see [LICENSE](../../LICENSE).
