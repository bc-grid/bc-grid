# shadcn-Native Editors

`@bc-grid/editors` ships built-in editors with native `<input>` rendering for zero-config use. Consumers wanting shadcn-native (or any other design-system) styling pass an `inputComponent` to the editor's factory function — bc-grid keeps the lifecycle (focus, ref, seed, ARIA, edit-state attributes), and the consumer owns the visual primitive.

v0.6 §1 first-pass ships the slot on `textEditor` (most-used, simplest contract). Number / date / select editors follow the same pattern in subsequent PRs (tracked in the v0.6 deferred queue).

## Public surface

```ts
// New in v0.6:
import {
  createTextEditor,
  type TextEditorInputProps,
  type TextEditorOptions,
} from "@bc-grid/editors"

interface TextEditorOptions {
  inputComponent?: ComponentType<TextEditorInputProps>
}
```

`textEditor` (the default export) is `createTextEditor()` for the zero-config case. Consumers wanting shadcn-native styling call the factory directly:

```tsx
import { Input } from "@/components/ui/input"
import { createTextEditor } from "@bc-grid/editors"
import type { BcReactGridColumn } from "@bc-grid/react"

export const shadcnTextEditor = createTextEditor({ inputComponent: Input })

const col: BcReactGridColumn<CustomerRow, string> = {
  field: "name",
  header: "Name",
  cellEditor: shadcnTextEditor,
}
```

## Contract for `inputComponent`

The component receives `TextEditorInputProps`:

```ts
interface TextEditorInputProps {
  ref: Ref<HTMLInputElement>
  className?: string
  type: string                 // "text" — pass through to <input>
  defaultValue: string         // seed (printable activation char or current cell value)
  disabled: boolean            // true while pending validation / commit
  "aria-invalid"?: true
  "aria-label"?: string
  "aria-describedby"?: string
  "aria-required"?: true
  "aria-readonly"?: true
  "aria-disabled"?: true
  "data-bc-grid-editor-input": "true"   // load-bearing: framework's commit path locates input via this
  "data-bc-grid-editor-kind": string    // load-bearing: editor-kind discriminator for theme + tests
}
```

Three contracts your `inputComponent` MUST honor:

1. **Forward `ref` to a real input element.** The framework's commit path reads `inputRef.current.value` at commit time. shadcn's `<Input>` already does this via `React.forwardRef`, so it drops in directly. Custom wrappers must use `forwardRef` too.
2. **Stamp `data-bc-grid-editor-input="true"` and `data-bc-grid-editor-kind`** on the actual input element. Without these, the framework's click-outside / Tab / Enter commit paths can't find the input. Spreading `{...props}` onto `<input>` accomplishes this automatically.
3. **Honor `disabled`** so the input ignores keystrokes during in-flight async validation (see `docs/recipes/async-validation.md`).

Don't override `defaultValue` or do any controlled-state shenanigans — bc-grid treats the input as uncontrolled and reads the live DOM value at commit. A controlled value with consumer-managed onChange would diverge from what the framework commits.

## Pattern: shadcn `<Input>` drop-in

Vanilla shadcn `<Input>` works without a wrapper:

```tsx
import { Input } from "@/components/ui/input"
import { createTextEditor } from "@bc-grid/editors"

export const shadcnTextEditor = createTextEditor({ inputComponent: Input })
```

shadcn's `<Input>` is `React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(...)` — same contract as native `<input>`. The forwarded ref reaches the actual `<input>`, the className gets shadcn's tokens, and bc-grid's data attributes spread through.

## Pattern: custom wrapper for design-system theming

If your design system needs a wrapper layer (e.g. an icon prefix), forward the ref to the inner input and spread the rest of the props:

```tsx
import { forwardRef } from "react"
import type { TextEditorInputProps } from "@bc-grid/editors"

const DesignSystemEditorInput = forwardRef<HTMLInputElement, Omit<TextEditorInputProps, "ref">>(
  ({ className, ...rest }, ref) => (
    <div className="ds-editor-shell">
      <SearchIcon className="ds-editor-icon" />
      <input ref={ref} className={cn("ds-editor-input", className)} {...rest} />
    </div>
  ),
)

export const myShadcnEditor = createTextEditor({
  inputComponent: DesignSystemEditorInput as ComponentType<TextEditorInputProps>,
})
```

The cast on `inputComponent` matches the factory's expected shape (`ComponentType<TextEditorInputProps>` accepts forwardRef components — TypeScript's structural matching covers it, but an explicit cast keeps the call site readable).

## Pattern: per-grid editor configuration

The factory returns a fresh `BcCellEditor` per call, so consumers can configure differently per grid (e.g. AR grid uses one shadcn theme, AP grid uses another):

```tsx
const arTextEditor = createTextEditor({ inputComponent: ArInput })
const apTextEditor = createTextEditor({ inputComponent: ApInput })
```

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

## What's NOT covered (yet)

- **`selectEditor`, `multiSelectEditor`, `autocompleteEditor`** — these wrap richer primitives (Combobox, multi-Combobox, search-Combobox) shared via internal `Combobox` / `SearchCombobox` modules. The select-batch follow-up adds `triggerComponent` + `optionItemComponent` slots — that needs the internal primitives to expose the slot points (~1k LOC of careful refactoring + Playwright validation), so it lands in a dedicated PR after the numeric + checkbox slots have soaked. Until then, consumers wanting shadcn-native styling for select / multi-select / autocomplete build a custom `cellEditor` from scratch (per `docs/recipes/custom-editors.md`).

The v0.6 single-input cluster (text + number + date + datetime + time) establishes the `inputComponent` pattern uniformly. `checkboxEditor` rides on that same shape via `checkboxComponent`. Combobox-driven editors follow once their slot wiring lands with Playwright coverage.

## When NOT to use

- **Native rendering is fine.** If the default `<input>` styled by `@bc-grid/theming` matches your app, skip the factory and use `textEditor` directly. The factory call adds minor overhead (a fresh editor object per call) and unlocks an API surface your app doesn't need.
- **Consumer's `<Input>` doesn't forward ref.** The framework's commit path needs the DOM input. If your design system's input is a black box that doesn't expose its inner `<input>`, you can't use it as an `inputComponent` — wrap it with a custom forwarding shim or build a fully custom editor.
- **Heavy widget needs (typeahead, masked input, etc.).** The render-prop slot is for VISUAL replacement only; the lifecycle stays on bc-grid. If you need different behaviour (e.g. masked input that intercepts keystrokes), build a custom editor from scratch — see `docs/recipes/custom-editors.md`.
