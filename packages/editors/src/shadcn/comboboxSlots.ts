import type { ComponentType, FormEvent, KeyboardEvent, PointerEvent, ReactNode, Ref } from "react"
import type { EditorOption } from "../chrome"

/**
 * Shared slot-prop shapes for the `triggerComponent` +
 * `optionItemComponent` render-prop slots that the combobox-driven
 * editors expose via `createSelectEditor` / `createMultiSelectEditor`
 * / `createAutocompleteEditor`. Per
 * `docs/design/shadcn-radix-correction-rfc.md` §Block C PR-C3
 * (closes the deferred select-batch slot work from #489).
 *
 * **Children-as-slot pattern.** The consumer's component wraps the
 * framework's inner render output. The framework keeps owning the
 * load-bearing wiring (ARIA, data attrs, handlers, refs, cmdk
 * registration) plus the visual default content (swatch + icon +
 * label + chips + caret + checkbox). The consumer just swaps the
 * SHELL element. shadcn's `<Button>` + `<CommandItem>` / `<Input>`
 * drop in by spreading the props + rendering `{children}`.
 *
 * Custom components MUST forward `ref` to a real DOM element so the
 * framework's commit / focus / cmdk registration paths reach the
 * actual node. They MUST also spread the load-bearing
 * `data-bc-grid-editor-*` attributes — the framework's commit path
 * locates the active editor via `data-bc-grid-editor-input="true"`.
 */

/**
 * Props handed to a custom `triggerComponent` for the Combobox
 * (button-style trigger — used by select / multi-select). Renders
 * inside `<Popover.Trigger asChild>` so Radix's Slot mechanism
 * injects the ref + click handler automatically — the consumer's
 * component just needs to render a real `<button>` and forward ref
 * the React way (e.g. via `React.forwardRef`). shadcn's `<Button>`
 * already does this.
 */
export interface ComboboxTriggerSlotProps {
  /** className the framework's default chrome would have applied. */
  className: string
  /** ARIA / state. Spread onto the button for AT correctness. */
  "aria-invalid"?: true | undefined
  "aria-required"?: true | undefined
  "aria-readonly"?: true | undefined
  "aria-disabled"?: true | undefined
  "aria-label"?: string | undefined
  "aria-describedby"?: string | undefined
  "aria-multiselectable"?: true | undefined
  /** Load-bearing data attrs. The framework's commit path locates the input via these. MUST spread. */
  "data-bc-grid-editor-input": "true"
  "data-bc-grid-editor-kind": string
  "data-bc-grid-editor-option-count": number
  "data-bc-grid-editor-seeded"?: "true" | undefined
  "data-state": "open" | "closed"
  /** DOM disabled. */
  disabled?: boolean | undefined
  /** Open/close state — for chevron / caret rendering. */
  open: boolean
  /** Multi-mode discriminator — for chip strip rendering. */
  isMulti: boolean
  /** Default inner content (swatch + icon + label/chips + caret). */
  children: ReactNode
}

/**
 * Props handed to a custom `inputComponent` for the SearchCombobox
 * (input-style trigger — used by autocomplete). Renders as the
 * `<input>` itself (anchored via Radix Popover.Anchor), so the
 * consumer's component IS the input — children don't apply since
 * `<input>` is self-closing.
 */
export interface SearchComboboxInputSlotProps {
  /** Forwarded ref. MUST point at a real `<input>` element. */
  ref: Ref<HTMLInputElement>
  /** className the framework's default chrome would have applied. */
  className: string
  /** Always `"text"` — combobox-search input. */
  type: "text"
  /** Default value seeded from the cell's existing value or `seedKey`. */
  defaultValue: string
  /** DOM disabled. */
  disabled: boolean | undefined
  /** Off — combobox doesn't want browser autocomplete UI. */
  autoComplete: "off"
  spellCheck: false
  /** Combobox role. */
  role: "combobox"
  /** ARIA. */
  "aria-invalid"?: true | undefined
  "aria-required"?: true | undefined
  "aria-readonly"?: true | undefined
  "aria-disabled"?: true | undefined
  "aria-label"?: string | undefined
  "aria-describedby"?: string | undefined
  "aria-haspopup": "listbox"
  "aria-expanded": boolean
  "aria-busy"?: true | undefined
  /** Load-bearing data attrs. */
  "data-bc-grid-editor-input": "true"
  "data-bc-grid-editor-kind": string
  "data-bc-grid-editor-option-count": number
  "data-bc-grid-editor-seeded"?: "true" | undefined
  "data-state": "open" | "closed"
  "data-bc-grid-editor-loading"?: "true" | undefined
  /** Open/loading state — for chevron / spinner rendering. */
  open: boolean
  loading: boolean
  /** Handler that drives debounced fetchOptions. MUST spread. */
  onInput: (event: FormEvent<HTMLInputElement>) => void
}

/**
 * Props handed to a custom `optionItemComponent` for the combobox-
 * driven editors. Renders inside cmdk's CommandItem (the shell stays
 * cmdk-aware so filter + active-descendant work natively); the
 * consumer's component replaces the inner visual chrome.
 *
 * For multi mode: `isSelected` reflects the committed selection state
 * (drives the inline shadcn Checkbox in the framework default render).
 * `isActive` reflects cmdk's keyboard-highlighted state (drives the
 * `data-selected="true"` attribute on the wrapping CommandItem).
 */
export interface ComboboxOptionSlotProps {
  /** className the framework's default option chrome would have applied. */
  className?: string | undefined
  /** Pointer + mouse handlers from the framework. Spread onto the inner element if you need pointer-active state. */
  onPointerDown?: ((event: PointerEvent<HTMLElement>) => void) | undefined
  onMouseEnter?: (() => void) | undefined
  /** Default inner content (multi-mode checkbox + swatch + icon + label). */
  children: ReactNode
  /** Structured data — for fully-custom rendering. */
  option: EditorOption
  isActive: boolean
  isSelected: boolean
  isMulti: boolean
}

/**
 * Combobox factory option shape — `createSelectEditor` /
 * `createMultiSelectEditor` accept this. Aliased per-editor for JSDoc
 * clarity.
 */
export interface ComboboxSlotOptions {
  /**
   * Override the built-in `<button>` trigger shell with a custom
   * component (e.g. shadcn's `<Button>`). The component receives every
   * prop the built-in button would have applied + the framework's
   * default inner content as `children`. Spread props + render
   * `{children}` for the simplest drop-in.
   */
  triggerComponent?: ComponentType<ComboboxTriggerSlotProps> | undefined
  /**
   * Override the built-in option-row chrome with a custom component
   * (e.g. shadcn's `<CommandItem>` content slot). Renders inside cmdk's
   * CommandItem; the consumer replaces only the visual chrome.
   */
  optionItemComponent?: ComponentType<ComboboxOptionSlotProps> | undefined
}

/**
 * SearchCombobox (autocomplete) factory option shape —
 * `createAutocompleteEditor` accepts this.
 */
export interface SearchComboboxSlotOptions {
  /**
   * Override the built-in `<input>` shell with a custom component
   * (e.g. shadcn's `<Input>`). Mirrors the single-input cluster
   * `inputComponent` slot from #488 — drops in any forwardRef-capable
   * shadcn-style component without modification.
   */
  inputComponent?: ComponentType<SearchComboboxInputSlotProps> | undefined
  /**
   * Same option-item slot as the button-trigger Combobox — see
   * `ComboboxSlotOptions.optionItemComponent` for the contract.
   */
  optionItemComponent?: ComponentType<ComboboxOptionSlotProps> | undefined
}

/**
 * Convenience helper used by `<KeyDown>` interception inside
 * Combobox + SearchCombobox. Re-exported so PR-C3's regression tests
 * can pin the cmdk-Enter handler signature at module level.
 */
export type ComboboxKeyDownHandler = (event: KeyboardEvent<HTMLElement>) => void
