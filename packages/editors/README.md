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
static array or a row-scoped function. A practical customer/vendor setup usually
keeps enum and tag fields typed, then leaves autocomplete as a string lookup that
is normalized and validated by the column:

```ts
import type { BcReactGridColumn } from "@bc-grid/react"
import { autocompleteEditor, multiSelectEditor, selectEditor } from "@bc-grid/editors"

type VendorStatus = "new" | "approved" | "blocked"
type VendorTag = "preferred" | "tax-exempt" | "requires-review"

interface VendorRow {
  id: string
  status: VendorStatus
  tags: readonly VendorTag[]
  contactName: string
}

const statusOptions = [
  { value: "new", label: "New" },
  { value: "approved", label: "Approved" },
  { value: "blocked", label: "Blocked" },
] satisfies readonly { value: VendorStatus; label: string }[]

const tagOptions = [
  { value: "preferred", label: "Preferred" },
  { value: "tax-exempt", label: "Tax exempt" },
  { value: "requires-review", label: "Requires review" },
] satisfies readonly { value: VendorTag; label: string }[]

async function fetchVendorContacts(query: string, signal: AbortSignal) {
  const response = await fetch(`/api/vendors/contacts?q=${encodeURIComponent(query)}`, {
    signal,
  })
  return (await response.json()) as readonly { value: string; label: string }[]
}

export const vendorLookupColumns = [
  {
    field: "status",
    header: "Status",
    editable: true,
    cellEditor: selectEditor,
    options: statusOptions,
    validate: (next: unknown) =>
      statusOptions.some((option) => option.value === next)
        ? { valid: true }
        : { valid: false, error: "Choose a known status." },
  },
  {
    field: "tags",
    header: "Tags",
    editable: true,
    cellEditor: multiSelectEditor,
    options: tagOptions,
    validate: (next: unknown) =>
      Array.isArray(next)
        ? { valid: true }
        : { valid: false, error: "Tags must be an array." },
  },
  {
    field: "contactName",
    header: "Contact",
    editable: true,
    cellEditor: autocompleteEditor,
    fetchOptions: fetchVendorContacts,
    valueParser: (input: string) => input.trim(),
    validate: (next: unknown) =>
      typeof next === "string" && next.length > 0
        ? { valid: true }
        : { valid: false, error: "Contact is required." },
  },
] satisfies readonly BcReactGridColumn<VendorRow, unknown>[]
```

Select-style editors commit the selected option `value`, not the option label.
That means typed option values are preserved and `column.valueParser` is bypassed
for `selectEditor`, `multiSelectEditor`, and `checkboxEditor`. Use
`valueParser` for string-producing editors such as `textEditor`,
`numberEditor`, date/time inputs, and `autocompleteEditor`.

`multiSelectEditor` expects the cell value to be an array and commits a typed
array of selected option values. Options not present in the current option list
cannot be committed from the native control.

`autocompleteEditor` uses `column.fetchOptions(query, signal)` with a native
`<input list>` / `<datalist>` surface. The editor aborts superseded requests via
the supplied `AbortSignal`; pass that signal to `fetch` or the equivalent lookup
API. Fetch failures do not block typing or commit; the editor leaves suggestions
as-is and commits the free-text input. Use `valueParser` for normalization
(`trim`, ID extraction, locale cleanup) and `validate` for the final domain rule
when the string must resolve to a known contact, customer, or vendor.

`checkboxEditor` commits a boolean from the native checkbox `checked` state.
Only the boolean `true` mounts checked; string or numeric lookalikes remain
unchecked. Tri-state checkbox editing is not part of the v0.4 built-in surface.

All built-in editors derive their accessible name from `column.header` when it
is plain text, then `field`, then `columnId`. Validation errors are surfaced via
`aria-invalid` and the shared editor state hooks; pending async validation or
server commit disables the native control. Host apps should keep lookup editors
compact and native in-cell; richer search, regex, or picker controls belong in
popup or sidebar surfaces rather than every tight grid cell.

## License

UNLICENSED — proprietary, see [LICENSE](../../LICENSE).
