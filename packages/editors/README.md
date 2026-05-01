# @bc-grid/editors

Built-in cell editors for bc-grid. The package ships native input / select-based
editors that plug into the cell-edit lifecycle exposed by `<BcGrid>`,
`<BcEditGrid>`, and `<BcServerGrid>` — no Radix or shadcn runtime dependency,
no portal library, just `<input>` / `<select>` controls anchored over the
cell.

Every editor in this package implements the `BcCellEditor` protocol from
`@bc-grid/react`. Set `editable: true` and `cellEditor: …` on a column and the
grid handles open / commit / cancel / focus return automatically.

```ts
import { textEditor } from "@bc-grid/editors"
import type { BcGridColumn } from "@bc-grid/core"

interface CustomerRow {
  id: string
  legalName: string
}

const columns: BcGridColumn<CustomerRow>[] = [
  {
    field: "legalName",
    header: "Legal name",
    editable: true,
    cellEditor: textEditor,
    valueParser: (input) => input.trim(),
    validate: (next) =>
      typeof next === "string" && next.length > 0
        ? { valid: true }
        : { valid: false, error: "Legal name is required." },
  },
]
```

## Built-in editors

The package exports nine editors covering the common ERP / business-grid
column shapes. Each one is a `BcCellEditor` ready to drop on a column:

| Editor | Cell type | Native control | Commits | Use for |
| --- | --- | --- | --- | --- |
| `textEditor` | `string` | `<input type="text">` | trimmed string after `valueParser` | free-form text — names, codes, descriptions, references |
| `numberEditor` | `number` | `<input inputMode="decimal">` | parsed number after `valueParser` | quantities, prices, balances, percents |
| `dateEditor` | ISO `string` (`YYYY-MM-DD`) | `<input type="date">` | the native date string | due dates, posted dates, birth dates |
| `datetimeEditor` | ISO `string` (`YYYY-MM-DDTHH:mm`) | `<input type="datetime-local">` | the native datetime string | timestamps, audit logs, scheduled jobs |
| `timeEditor` | `HH:mm` `string` | `<input type="time">` | the native time string | working-hour windows, shift starts |
| `selectEditor` | typed enum value | `<select>` | the selected option `value` (typed) | status, category, priority — single choice from a fixed list |
| `multiSelectEditor` | typed enum array | `<select multiple>` | array of selected option `value`s (typed) | tags, flags, assignments — many-of-many |
| `autocompleteEditor` | `string` | `<input list>` + `<datalist>` | the trimmed string the user committed | reference fields with a long suggestion list (collectors, vendors, parts) |
| `checkboxEditor` | `boolean` | `<input type="checkbox">` | `true` / `false` | tri-state-free booleans (active, paid, on-hold) |

All editors share:

- **DOM hooks** — `bc-grid-editor-input` class plus
  `data-bc-grid-editor-kind="text|number|date|…"` and
  `data-bc-grid-editor-state="error|pending|invalid"` attributes for theming.
- **Tokens** — `@bc-grid/theming` styles every state through `--bc-grid-*`
  variables. Tailwind v4 / shadcn hosts can re-tint focus rings, borders,
  disabled, pending, and error states without re-implementing the editor.
- **Accessible naming** — derived from `column.header` (when it's a plain
  string), then `column.field`, then `column.columnId`. React-node headers
  fall back to `field` / `columnId`; supply `column.ariaLabel` (Q2) or wrap
  in a custom editor when the header isn't human-readable.
- **Keyboard model** — Enter / Tab commits; Shift+Enter / Shift+Tab commits
  and moves up / left; Escape cancels and discards the draft. Pending async
  validation or an in-flight `onCellEditCommit` disables the native control
  until the promise settles.

### Text editors — `textEditor`, `autocompleteEditor`

`textEditor` is a plain `<input type="text">`. Pair it with
`column.valueParser` to normalise the raw string before commit (trim
whitespace, upper-case codes, strip diacritics, etc.):

```ts
{
  field: "code",
  header: "Code",
  editable: true,
  cellEditor: textEditor,
  valueParser: (input) => input.trim().toUpperCase(),
}
```

`autocompleteEditor` adds a `<datalist>` of suggestions resolved by
`column.fetchOptions(query, signal)`. The editor passes the
`AbortSignal` so superseded lookups cancel cleanly:

```ts
{
  field: "owner",
  header: "Collector",
  editable: true,
  cellEditor: autocompleteEditor,
  fetchOptions: async (query, signal) => {
    const response = await fetch(
      `/api/collectors?q=${encodeURIComponent(query)}`,
      { signal },
    )
    const items = await response.json()
    return items.map((c) => ({ value: c.id, label: c.name }))
  },
  valueParser: (input) => input.trim(),
  validate: (next) =>
    typeof next === "string" && next.length > 0
      ? { valid: true }
      : { valid: false, error: "Collector is required." },
}
```

Lookup failures don't block commit — the editor leaves the suggestion list
as-is and commits the typed string. Use `valueParser` + `validate` if the
string must resolve to a known domain value.

### Number editor — `numberEditor`

Native input with `inputMode="decimal"` so mobile keyboards show a numeric
pad. The committed value is the **string** the user typed; bridge it to a
typed `TValue` via `valueParser`:

```ts
{
  field: "creditLimit",
  header: "Credit limit",
  format: "currency",
  editable: true,
  cellEditor: numberEditor,
  valueParser: (input) => {
    // Strip thousands separators so the editor accepts "1,234.56".
    const parsed = Number.parseFloat(input.replace(/,/g, ""))
    return Number.isFinite(parsed) ? parsed : 0
  },
  validate: (next) =>
    typeof next === "number" && next >= 0
      ? { valid: true }
      : { valid: false, error: "Credit limit must be ≥ 0." },
}
```

### Date / time editors — `dateEditor`, `datetimeEditor`, `timeEditor`

Native `<input type="date" | "datetime-local" | "time">` controls.
The committed string follows the browser's ISO format
(`YYYY-MM-DD`, `YYYY-MM-DDTHH:mm`, `HH:mm`). Identity `valueParser`
plus a `validate` that enforces the business window is the typical
shape:

```ts
{
  field: "lastInvoiceAt",
  header: "Last invoice",
  format: "date",
  editable: true,
  cellEditor: dateEditor,
  valueParser: (input) => input,
  validate: (next) => {
    if (typeof next !== "string" || next === "") {
      return { valid: false, error: "Date is required." }
    }
    if (next > new Date().toISOString().slice(0, 10)) {
      return { valid: false, error: "Last invoice can't be in the future." }
    }
    return { valid: true }
  },
}
```

### Single-select — `selectEditor`

Native `<select>` reading `column.options`. Options are either a static
array or a row-scoped function. The editor commits the option `value`
(typed), not the label:

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
  // No valueParser needed — selectEditor commits typed option values.
  validate: (next) =>
    statusOptions.some((option) => option.value === next)
      ? { valid: true }
      : { valid: false, error: "Pick a known status." },
}
```

`column.valueParser` is **bypassed** for `selectEditor`,
`multiSelectEditor`, and `checkboxEditor` because they commit typed
values directly. Use `valueParser` only on string-producing editors
(text / number / date / time / autocomplete).

### Multi-select — `multiSelectEditor`

Native `<select multiple>` over `column.options`. The cell value must
be a typed array; the editor commits a typed array of selected
option `value`s. Options not present in the current option list cannot
be committed from the native control.

```ts
type CustomerFlag = "vip" | "international" | "tax-exempt" | "manual-review"

const flagOptions: readonly { value: CustomerFlag; label: string }[] = [
  { value: "vip", label: "VIP" },
  { value: "international", label: "International" },
  { value: "tax-exempt", label: "Tax exempt" },
  { value: "manual-review", label: "Manual review" },
]

const flagsColumn = {
  field: "flags",
  header: "Flags",
  editable: true,
  cellEditor: multiSelectEditor,
  options: flagOptions,
  // ERP-style cross-flag invariant: VIP and Manual Review are mutually
  // exclusive. Cell-level `validate` keeps the rule next to the column
  // definition rather than scattering it across the persistence layer.
  validate: (next) => {
    if (!Array.isArray(next)) {
      return { valid: false, error: "Flags must be an array." }
    }
    if (next.includes("vip") && next.includes("manual-review")) {
      return { valid: false, error: "VIP and Manual Review can't both be set." }
    }
    return { valid: true }
  },
}
```

### Checkbox — `checkboxEditor`

Native `<input type="checkbox">`. Commits a literal boolean — `true` /
`false`. Only the boolean `true` mounts as checked; persisted strings
or numbers (`"true"`, `1`) stay unchecked, so map non-boolean
persistence formats before they reach the editor. Tri-state checkbox
editing is not part of the v0.4 surface.

```ts
{
  field: "creditHold",
  header: "On hold",
  editable: true,
  cellEditor: checkboxEditor,
  // No valueParser needed — checkboxEditor commits booleans directly.
}
```

## Pending, error, and dirty state

The grid surfaces edit lifecycle states through DOM hooks the editor
chrome reads. Hosts that style cells through `@bc-grid/theming` get
the right look automatically; hosts using a custom theme target the
hooks directly.

| State | Hook | Trigger |
| --- | --- | --- |
| Editing | `data-bc-grid-cell-state="editing"` on the cell | Editor portal mounted (Enter / F2 / double-click). |
| Pending | `data-bc-grid-cell-state="pending"` on the cell, `data-bc-grid-editor-state="pending"` on the input, native control disabled | An async `column.validate` is in flight, or `onCellEditCommit` returned a Promise that hasn't settled. |
| Error | `data-bc-grid-cell-state="error"` on the cell, `data-bc-grid-editor-state="error"` + `aria-invalid="true"` on the input | `column.validate` returned `{ valid: false, error }` or `onCellEditCommit` rejected. |
| Dirty | `data-bc-grid-cell-state="dirty"` on the cell | A pending optimistic patch sits on the row while the server commit is settling (server grids only). |

Validation errors render through the assertive live region owned by
the React editor protocol (`messages.editValidationErrorAnnounce`),
so AT users hear the error string returned from `validate`. The
editor portal stays mounted on error so the user can correct the
value without losing focus context.

## Custom editor boundary

When a built-in editor isn't enough — picker dialogs, multi-step
forms, async lookups with rich popups — implement `BcCellEditor`
directly. The protocol is fully exported from `@bc-grid/react`:

```tsx
import type { BcCellEditor } from "@bc-grid/react"

interface CustomerRow {
  id: string
  taxRegion: string
}

const taxRegionEditor: BcCellEditor<CustomerRow, string> = {
  kind: "tax-region",
  Component({ initialValue, commit, cancel, focusRef }) {
    return (
      <TaxRegionPicker
        ref={focusRef}
        defaultValue={initialValue}
        onSelect={(region) => commit(region, { moveOnSettle: "down" })}
        onDismiss={cancel}
      />
    )
  },
  // Optional: load lookup data before the editor opens.
  async prepare({ row, signal }) {
    const regions = await loadTaxRegions(row.country, signal)
    return { regions }
  },
}
```

Custom editors get the same focus / commit / cancel contract as the
built-ins. Receive `commit(nextValue, { moveOnSettle })` for
keyboard-driven "save and move down" / "save and move right" / "save
and stay" semantics; call `cancel()` to discard. If the editor needs
to load remote data first, return a Promise from `prepare` — the grid
shows the cell's pending state until it resolves.

See [`docs/api.md` §7 "Editor protocol"](../../docs/api.md) for the
full type reference and [§7.1 "Lookup, select, autocomplete, and
checkbox editor guidance"](../../docs/api.md) for the per-editor
ARIA / persistence rules.

## License

UNLICENSED — proprietary, see [LICENSE](../../LICENSE).
