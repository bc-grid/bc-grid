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

The combobox-driven editors swap two slots: a button trigger + a per-option row inside the listbox. Per v0.7 PR-C3 (`v07-shadcn-editor-render-prop-slots`), they ride on the cmdk + Radix Popover foundation from PR-C1/C2 — drop in shadcn's `<Button>` + `<CommandItem>`:

```tsx
import { Button } from "@/components/ui/button"
import { CommandItem } from "@/components/ui/command"
import { createMultiSelectEditor, createSelectEditor } from "@bc-grid/editors"
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
  tagName: "button"
  className: string
  // ARIA
  "aria-invalid"?: true
  "aria-required"?: true
  "aria-readonly"?: true
  "aria-disabled"?: true
  "aria-label"?: string
  "aria-describedby"?: string
  "aria-multiselectable"?: true
  // Load-bearing data attrs (framework's commit path locates input via these)
  "data-bc-grid-editor-input": "true"
  "data-bc-grid-editor-kind": string
  "data-bc-grid-editor-option-count": number
  "data-bc-grid-editor-seeded"?: "true"
  "data-state": "open" | "closed"
  // State
  disabled?: boolean
  open: boolean       // for chevron / caret rendering
  isMulti: boolean    // for chip-strip rendering
  // Default inner content (swatch + icon + label/chips + caret)
  children: ReactNode
}
```

Ref is injected automatically by Radix's `<Popover.Trigger asChild>` — your component just needs to render a real `<button>` and forward ref the React way. shadcn's `<Button>` already does this.

### `ComboboxOptionSlotProps` shape

```ts
interface ComboboxOptionSlotProps {
  className?: string
  onPointerDown?: (event: PointerEvent<HTMLElement>) => void
  onMouseEnter?: () => void
  // Default inner content (multi-mode Checkbox + swatch + icon + label)
  children: ReactNode
  // Structured data — for fully-custom render
  option: EditorOption
  isActive: boolean
  isSelected: boolean
  isMulti: boolean
}
```

The slot renders **inside** cmdk's `<CommandItem>`, so cmdk's filter + active-descendant + Enter-select wiring stays in place. The consumer's component just replaces the visual chrome — spread `{...rest}` + render `{children}` for the framework's default content, OR use the structured data props (`option`, `isActive`, `isSelected`, `isMulti`) for fully custom rendering.

For multi mode: `isSelected` reflects the **committed selection state** (drives the inline shadcn `<Checkbox>` in the framework default render). `isActive` reflects cmdk's keyboard-highlighted state.

## `createAutocompleteEditor` — `inputComponent` + `optionItemComponent` slots

The autocomplete trigger is the `<input>` itself. Use the `inputComponent` slot (mirroring the single-input cluster pattern from `createTextEditor`) + the same `optionItemComponent` shape as select / multi-select:

```tsx
import { Input } from "@/components/ui/input"
import { CommandItem } from "@/components/ui/command"
import { createAutocompleteEditor } from "@bc-grid/editors"

export const shadcnAutocompleteEditor = createAutocompleteEditor({
  inputComponent: Input,
  optionItemComponent: ({ children, ...rest }) => <CommandItem {...rest}>{children}</CommandItem>,
})
```

The `inputComponent` slot uses `SearchComboboxInputSlotProps` — same shape as `EditorInputSlotProps` (text/number/date/etc.) extended with combobox-specific ARIA + the load-bearing `onInput` handler that drives the debounced `column.fetchOptions(query, signal)` cycle. **Don't strip `onInput`** — spreading `{...props}` keeps it intact.

`open` + `loading` props are exposed as a convenience for consumers that want to render a chevron caret + spinner alongside the input.

## When NOT to use

- **Native rendering is fine.** If the default `<input>` styled by `@bc-grid/theming` matches your app, skip the factory and use the named export directly (`textEditor`, `numberEditor`, etc.). The factory call adds minor overhead (a fresh editor object per call) and unlocks an API surface your app doesn't need.
- **Consumer's `<Input>` doesn't forward ref.** The framework's commit path needs the DOM input. If your design system's input is a black box that doesn't expose its inner `<input>`, you can't use it as an `inputComponent` — wrap it with a custom forwarding shim or build a fully custom editor.
- **Heavy widget needs (typeahead, masked input, etc.).** The render-prop slot is for VISUAL replacement only; the lifecycle stays on bc-grid. If you need different behaviour (e.g. masked input that intercepts keystrokes for currency), build a custom editor from scratch — see `docs/recipes/custom-editors.md`.
