# shadcn-Native Editors

`@bc-grid/editors` ships built-in editors with native `<input>` rendering for zero-config use. Consumers wanting shadcn-native (or any other design-system) styling pass an `inputComponent` to the editor's factory function — bc-grid keeps the lifecycle (focus, ref, seed, ARIA, edit-state attributes), and the consumer owns the visual primitive.

v0.6 ships the slot on the **single-input editor cluster**: `textEditor` (PR #480), then `numberEditor`, `dateEditor`, `datetimeEditor`, `timeEditor` (extends the pattern in the numeric-batch PR). All five share the same prop shape so a single shadcn `<Input>` drops in across the cluster. Multi-primitive editors (`selectEditor`, `multiSelectEditor`, `autocompleteEditor`, `checkboxEditor`) follow in a separate PR — those need richer `triggerComponent` / `optionItemComponent` slots than the single-input shape can express.

## Public surface

```ts
import {
  createTextEditor,
  type TextEditorInputProps,
  type TextEditorOptions,
  createNumberEditor,
  type NumberEditorInputProps,
  type NumberEditorOptions,
  createDateEditor,
  type DateEditorInputProps,
  type DateEditorOptions,
  createDatetimeEditor,
  type DatetimeEditorInputProps,
  type DatetimeEditorOptions,
  createTimeEditor,
  type TimeEditorInputProps,
  type TimeEditorOptions,
} from "@bc-grid/editors"

interface XxxEditorOptions {
  inputComponent?: ComponentType<XxxEditorInputProps>
}
```

Every default-export (`textEditor`, `numberEditor`, etc.) is `createXxxEditor()` — zero-config consumers keep using the named export. Consumers wanting shadcn-native styling call the factory:

```tsx
import { Input } from "@/components/ui/input"
import {
  createTextEditor,
  createNumberEditor,
  createDateEditor,
  createDatetimeEditor,
  createTimeEditor,
} from "@bc-grid/editors"
import type { BcReactGridColumn } from "@bc-grid/react"

export const shadcnTextEditor = createTextEditor({ inputComponent: Input })
export const shadcnNumberEditor = createNumberEditor({ inputComponent: Input })
export const shadcnDateEditor = createDateEditor({ inputComponent: Input })
export const shadcnDatetimeEditor = createDatetimeEditor({ inputComponent: Input })
export const shadcnTimeEditor = createTimeEditor({ inputComponent: Input })

const cols: BcReactGridColumn<CustomerRow, unknown>[] = [
  { field: "name", header: "Name", cellEditor: shadcnTextEditor },
  { field: "balance", header: "Balance", cellEditor: shadcnNumberEditor },
  { field: "due", header: "Due", cellEditor: shadcnDateEditor },
  { field: "scheduledAt", header: "Scheduled", cellEditor: shadcnDatetimeEditor },
  { field: "openAt", header: "Opens", cellEditor: shadcnTimeEditor },
]
```

## Contract for `inputComponent`

All five editor input shapes share the same `EditorInputSlotProps` base — a single shadcn `<Input>` works across the cluster. Per-editor props differ only in the `type` value (`"text"`, `"date"`, `"datetime-local"`, `"time"`) and which lifecycle props are wired (number / date wire `onPaste` for paste-detection; datetime / time skip it).

```ts
interface EditorInputSlotProps {
  ref: Ref<HTMLInputElement>
  className?: string
  type: string                 // "text" | "date" | "datetime-local" | "time"
  defaultValue: string         // seed (printable activation char or current cell value, normalised)
  disabled: boolean            // true while pending validation / commit
  inputMode?: InputMode        // "decimal" on number; unset elsewhere
  "aria-invalid"?: true
  "aria-label"?: string
  "aria-describedby"?: string
  "aria-required"?: true
  "aria-readonly"?: true
  "aria-disabled"?: true
  "data-bc-grid-editor-input": "true"   // load-bearing: framework's commit path locates input via this
  "data-bc-grid-editor-kind": string    // load-bearing: editor-kind discriminator for theme + tests
  onPaste?: (event: ClipboardEvent<HTMLInputElement>) => void  // wired on number + date for format detection
}
```

Three contracts your `inputComponent` MUST honor:

1. **Forward `ref` to a real input element.** The framework's commit path reads `inputRef.current.value` at commit time. shadcn's `<Input>` already does this via `React.forwardRef`, so it drops in directly. Custom wrappers must use `forwardRef` too.
2. **Stamp `data-bc-grid-editor-input="true"` and `data-bc-grid-editor-kind`** on the actual input element. Without these, the framework's click-outside / Tab / Enter commit paths can't find the input. Spreading `{...props}` onto `<input>` accomplishes this automatically.
3. **Honor `disabled`** so the input ignores keystrokes during in-flight async validation (see `docs/recipes/async-validation.md`).

Don't override `defaultValue` or do any controlled-state shenanigans — bc-grid treats the input as uncontrolled and reads the live DOM value at commit. A controlled value with consumer-managed onChange would diverge from what the framework commits.

For numeric and date editors, **don't strip `onPaste`**. The factory wires it for format detection (`"$1,234.56"` → `1234.56` for number; `"5/4/2026"` → `"2026-05-04"` for date). Spreading `{...props}` onto `<input>` keeps it intact.

## Pattern: shadcn `<Input>` drop-in

Vanilla shadcn `<Input>` works without a wrapper for **all five editors**:

```tsx
import { Input } from "@/components/ui/input"
import {
  createTextEditor,
  createNumberEditor,
  createDateEditor,
  createDatetimeEditor,
  createTimeEditor,
} from "@bc-grid/editors"

export const shadcnTextEditor = createTextEditor({ inputComponent: Input })
export const shadcnNumberEditor = createNumberEditor({ inputComponent: Input })
export const shadcnDateEditor = createDateEditor({ inputComponent: Input })
export const shadcnDatetimeEditor = createDatetimeEditor({ inputComponent: Input })
export const shadcnTimeEditor = createTimeEditor({ inputComponent: Input })
```

shadcn's `<Input>` is `React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(...)` — the same contract as native `<input>`. The forwarded ref reaches the actual `<input>`, the className gets shadcn's tokens, and bc-grid's data attributes (plus `type` discriminator and `onPaste`) spread through.

The browser owns native picker chrome on `type="date"`, `type="datetime-local"`, and `type="time"` — shadcn's `<Input>` only swaps the visual frame; the calendar / clock popovers continue to come from the platform.

## Pattern: custom wrapper for design-system theming

If your design system needs a wrapper layer (e.g. an icon prefix), forward the ref to the inner input and spread the rest of the props. The same wrapper works across the cluster — the `EditorInputSlotProps` shape is shared:

```tsx
import { type ComponentType, forwardRef } from "react"
import type {
  DateEditorInputProps,
  NumberEditorInputProps,
  TextEditorInputProps,
} from "@bc-grid/editors"

const DesignSystemEditorInput = forwardRef<
  HTMLInputElement,
  Omit<TextEditorInputProps, "ref">
>(({ className, ...rest }, ref) => (
  <div className="ds-editor-shell">
    <SearchIcon className="ds-editor-icon" />
    <input ref={ref} className={cn("ds-editor-input", className)} {...rest} />
  </div>
))

// One wrapper, three editors:
export const myShadcnText = createTextEditor({
  inputComponent: DesignSystemEditorInput as ComponentType<TextEditorInputProps>,
})
export const myShadcnNumber = createNumberEditor({
  inputComponent: DesignSystemEditorInput as ComponentType<NumberEditorInputProps>,
})
export const myShadcnDate = createDateEditor({
  inputComponent: DesignSystemEditorInput as ComponentType<DateEditorInputProps>,
})
```

The cast on `inputComponent` matches the factory's expected shape. Each `XxxEditorInputProps` is a re-export of the same `EditorInputSlotProps` base, so the cast is a no-op at runtime; TypeScript just needs the explicit nudge across the per-editor type aliases.

## Pattern: per-grid editor configuration

The factory returns a fresh `BcCellEditor` per call, so consumers can configure differently per grid (e.g. AR grid uses one shadcn theme, AP grid uses another):

```tsx
const arTextEditor = createTextEditor({ inputComponent: ArInput })
const apTextEditor = createTextEditor({ inputComponent: ApInput })

const arNumberEditor = createNumberEditor({ inputComponent: ArInput })
const apNumberEditor = createNumberEditor({ inputComponent: ApInput })
```

## Per-editor notes

### `createNumberEditor`

- `type="text"` + `inputMode="decimal"` so the numeric keyboard surfaces on touch devices.
- Wires `onPaste` for currency / accounting normalisation (`"$1,234.56"`, `"(1,234.56)"`, locale-aware via `parseLocaleNumber`).
- Commit produces a string; consumers wire `column.valueParser` if they need a `number`.

### `createDateEditor`

- `type="date"` — browser owns the calendar popover (still works inside shadcn's `<Input>`; the popover is OS chrome, not React).
- Wires `onPaste` for ISO normalisation (`"5/4/2026"` → `"2026-05-04"`, RFC2822, Date instances).
- Commit produces ISO `YYYY-MM-DD`.

### `createDatetimeEditor`

- `type="datetime-local"` — combined date + time picker (no timezone, wall-clock).
- No `onPaste` slot wired by default; if you need it, build a custom editor.
- Commit produces ISO `YYYY-MM-DDTHH:mm` (no seconds, no timezone — matches the input's spec).

### `createTimeEditor`

- `type="time"` — browser provides the time picker (24h or 12h depending on locale + OS settings).
- No `onPaste` slot wired by default.
- Commit produces `HH:mm`.

## `createCheckboxEditor` — `checkboxComponent` slot

The boolean editor uses the same render-prop pattern, but with a `checkboxComponent` option (the prop name reflects the primitive being swapped — a `<input type="checkbox">` rather than a text input).

```tsx
import { Checkbox } from "@/components/ui/checkbox"
import { createCheckboxEditor } from "@bc-grid/editors"
import type { BcReactGridColumn } from "@bc-grid/react"

export const shadcnCheckboxEditor = createCheckboxEditor({ checkboxComponent: Checkbox })

const col: BcReactGridColumn<TaskRow, boolean> = {
  field: "completed",
  header: "Done",
  cellEditor: shadcnCheckboxEditor,
}
```

The component receives `CheckboxEditorInputProps`:

```ts
interface CheckboxEditorInputProps {
  ref: Ref<HTMLInputElement>
  className?: string
  type: "checkbox"             // pass-through
  defaultChecked: boolean      // seed (resolved from cell value)
  disabled: boolean            // true while pending validation / commit
  "aria-invalid"?: true
  "aria-label"?: string
  "aria-describedby"?: string
  "aria-required"?: true
  "aria-readonly"?: true
  "aria-disabled"?: true
  "data-bc-grid-editor-input": "true"
  "data-bc-grid-editor-kind": "checkbox"
}
```

Same three contracts: forward `ref` to a real `<input type="checkbox">`, stamp the data attributes, honor `disabled`. The framework reads `inputRef.current.checked` at commit time, so an uncontrolled checkbox is fine — the live DOM `.checked` property is the source of truth.

shadcn's `<Checkbox>` is a Radix primitive that renders a `<button>` shell + a hidden native `<input>`. The framework's commit path follows the `ref` and the data attribute discriminator, so as long as the `ref` reaches the inner `<input>` (Radix's `Checkbox.Root` does so via `forwardRef`), commits work. If your design system's checkbox doesn't expose the inner `<input>`, wrap it with a custom forwarding shim that maintains the contract.

## `createSelectEditor` / `createMultiSelectEditor` — `triggerComponent` + `optionItemComponent` slots

The combobox-driven editors (select, multi-select) use a different render-prop shape because they wrap a richer primitive: a `<button>` trigger that toggles a `<div role="listbox">` containing per-option `<div role="option">` rows. Two slots:

- **`triggerComponent`** — overrides the trigger `<button>` shell. Receives the framework's prop bag (handlers, ARIA, refs, data attrs) plus the framework's default inner content (swatch / icon / label / chips / caret) as `children`. Spread props + render `{children}` for the simplest shadcn `<Button>` drop-in.
- **`optionItemComponent`** — overrides the per-option row shell. Receives the framework's prop bag plus the framework's default inner content (multi-mode check + swatch + icon + label) as `children`. Spread + render `{children}` for shadcn `<CommandItem>` drop-in.

```tsx
import { Button } from "@/components/ui/button"
import { CommandItem } from "@/components/ui/command"
import {
  createMultiSelectEditor,
  createSelectEditor,
} from "@bc-grid/editors"
import type { BcReactGridColumn } from "@bc-grid/react"

export const shadcnSelectEditor = createSelectEditor({
  triggerComponent: ({ children, ...rest }) => <Button {...rest}>{children}</Button>,
  optionItemComponent: ({ children, ...rest }) => <CommandItem {...rest}>{children}</CommandItem>,
})

export const shadcnMultiSelectEditor = createMultiSelectEditor({
  triggerComponent: ({ children, ...rest }) => <Button {...rest}>{children}</Button>,
  optionItemComponent: ({ children, ...rest }) => <CommandItem {...rest}>{children}</CommandItem>,
})

const cols: BcReactGridColumn<TaskRow, unknown>[] = [
  { field: "status", header: "Status", cellEditor: shadcnSelectEditor, options: STATUSES },
  { field: "tags", header: "Tags", cellEditor: shadcnMultiSelectEditor, options: TAGS },
]
```

### `ComboboxTriggerSlotProps` shape

```ts
interface ComboboxTriggerSlotProps {
  ref: Ref<HTMLElement>
  tagName: "button" | "input"   // discriminator: button for select/multi, input reserved for autocomplete follow-up
  className: string
  // ARIA
  "aria-invalid"?: true
  "aria-required"?: true
  "aria-readonly"?: true
  "aria-disabled"?: true
  "aria-label"?: string
  "aria-describedby"?: string
  "aria-haspopup": "listbox"
  "aria-expanded": boolean
  "aria-multiselectable"?: true   // only set for multi-select
  "aria-controls"?: string
  "aria-activedescendant"?: string
  // Data attrs (load-bearing — framework's commit path locates input via these)
  "data-bc-grid-editor-input": "true"
  "data-bc-grid-editor-kind": string
  "data-bc-grid-editor-option-count": number
  "data-bc-grid-editor-seeded"?: "true"
  "data-state": "open" | "closed"
  // State + handlers
  disabled?: boolean
  open: boolean                   // consumers may render a chevron / caret based on this
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void
  onClick?: () => void
  // Default inner content (swatch + icon + label / chips + caret)
  children: ReactNode
}
```

### `ComboboxOptionSlotProps` shape

```ts
interface ComboboxOptionSlotProps {
  id: string
  role: "option"
  tabIndex: -1
  "aria-selected": boolean
  "data-option-index": number     // load-bearing: framework's scroll-into-view loop targets via this
  "data-active"?: "true"
  "data-selected"?: "true"
  className: string
  onPointerDown: (event: PointerEvent<HTMLElement>) => void
  onMouseEnter: () => void
  // Default inner content (multi-mode check + swatch + icon + label)
  children: ReactNode
  // Structured data — for fully-custom render
  option: EditorOption
  isActive: boolean
  isSelected: boolean
  isMulti: boolean
}
```

Same three contracts as the input slots: forward `ref` to a real button (trigger) / div (option row), spread the load-bearing data attrs, honor `disabled`. The framework reads typed values from the trigger button via the `__bcGridComboboxValue` property attached on render — that follows the `ref`, so as long as your component forwards it, commits work.

The two slots are **independent**: pass `triggerComponent` only to swap the button chrome while keeping the framework's default options; pass `optionItemComponent` only to restyle option rows while keeping the framework's default `<button>` trigger; pass both for full visual control.

## `createAutocompleteEditor` — `optionItemComponent` slot only

The autocomplete trigger is an `<input>` (free-text typing), not a `<button>`. The children-as-slot pattern doesn't fit a self-closing input element, so the trigger slot for autocomplete is intentionally **not** part of this PR. A follow-up will add an `inputComponent` slot for the autocomplete trigger mirroring the single-input cluster shape from `createTextEditor` / etc.

```tsx
import { CommandItem } from "@/components/ui/command"
import { createAutocompleteEditor } from "@bc-grid/editors"

export const shadcnAutocompleteEditor = createAutocompleteEditor({
  optionItemComponent: ({ children, ...rest }) => <CommandItem {...rest}>{children}</CommandItem>,
})
```

The option props match `ComboboxOptionSlotProps` exactly, with `isMulti=false` + `isSelected=false` always (autocomplete is single-mode and doesn't track selection state across renders — the input value IS the selected value).

## Per-editor notes (combobox cluster)

### `createSelectEditor`

- Single-mode Combobox: trigger renders the picked option's swatch + icon + label.
- Auto-commits on Enter / pick (per the framework's `editor-select` contract).
- Trigger slot's `children` includes the swatch + icon + label + chevron caret. Consumers can either spread + render `{children}` for the framework's default chrome, or use the structured data props to render fully custom (the `<Combobox>` primitive handles ARIA + keyboard either way).

### `createMultiSelectEditor`

- Multi-mode Combobox: trigger renders chips for each selected option.
- Toggles on pick; commits on Tab / Enter / Escape (per `#427` Enter semantics — Enter does NOT toggle in multi mode; Space toggles).
- Trigger slot's `children` includes the chip strip + chevron caret.
- Option slot's `children` adds a multi-mode check column (✓ when selected) before the swatch / icon / label.

### `createAutocompleteEditor`

- Single-mode SearchCombobox with async `column.fetchOptions(query, signal)` (debounced 200ms, AbortController race-handling).
- Trigger is an `<input>` — slot deferred (see above).
- Option slot's `children` is swatch + icon + label (no check column — autocomplete is always single-mode).

## What's NOT covered (yet)

- **`createAutocompleteEditor` trigger slot** — needs an `inputComponent` slot mirroring the single-input cluster shape; deferred to a follow-up so this PR's risk stays bounded (the autocomplete input has subtle keystroke / loading-state plumbing that needs Playwright validation).
- **Combobox listbox virtualization** — for >500 options, the framework renders all rows in the dropdown. Consumers wanting virtualization should wait for `v07-editor-perf-large-option-lists` (queued) which adds a `@bc-grid/virtualizer`-backed flat list.

The v0.6 select-batch closes the slot pattern across every built-in editor except autocomplete's trigger. Combobox-driven editors now ride on the same drop-in shadcn `<Button>` / `<CommandItem>` pattern as the single-input + checkbox clusters.

## When NOT to use

- **Native rendering is fine.** If the default `<input>` styled by `@bc-grid/theming` matches your app, skip the factory and use the named export directly (`textEditor`, `numberEditor`, etc.). The factory call adds minor overhead (a fresh editor object per call) and unlocks an API surface your app doesn't need.
- **Consumer's `<Input>` doesn't forward ref.** The framework's commit path needs the DOM input. If your design system's input is a black box that doesn't expose its inner `<input>`, you can't use it as an `inputComponent` — wrap it with a custom forwarding shim or build a fully custom editor.
- **Heavy widget needs (typeahead, masked input, etc.).** The render-prop slot is for VISUAL replacement only; the lifecycle stays on bc-grid. If you need different behaviour (e.g. masked input that intercepts keystrokes for currency), build a custom editor from scratch — see `docs/recipes/custom-editors.md`.
