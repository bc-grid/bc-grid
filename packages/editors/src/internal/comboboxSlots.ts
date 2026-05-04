import type { ComponentType, KeyboardEvent, PointerEvent, ReactNode, Ref } from "react"
import type { EditorOption } from "../chrome"

/**
 * Shared slot-prop shapes for the `triggerComponent` +
 * `optionItemComponent` render-prop slots used by the combobox-driven
 * built-in editors (`select`, `multi-select`, `autocomplete`). v0.6 §1
 * `v06-shadcn-native-editors-select-batch` extends the inputComponent
 * pattern that #480 / #488 / #489 established for the single-input +
 * checkbox cluster.
 *
 * Children-as-slot pattern: the consumer's component wraps the
 * framework's inner render output. The framework keeps owning the
 * swatch / icon / chip / label / check rendering (so consumers don't
 * re-implement non-trivial visual chrome); the consumer just swaps
 * the SHELL element. shadcn's `<Button>` + `<CommandItem>` drop in by
 * spreading the props + rendering `{children}`.
 *
 * Custom components MUST forward `ref` to a real button (trigger) or
 * div / li (option) element so the framework's commit / focus paths
 * reach the DOM. They MUST also spread the load-bearing
 * `data-bc-grid-editor-*` attributes — the framework's commit path
 * locates the active trigger via `data-bc-grid-editor-input="true"`
 * and reads the typed value from the trigger button via the
 * `__bcGridComboboxValue` property attached on render.
 */

/**
 * Props handed to a custom `triggerComponent` for select / multi-select
 * / autocomplete editors. Mirrors the prop bag the framework's built-in
 * `<button>` (combobox) / `<input>` (search-combobox) trigger consumes.
 *
 * The `tagName` discriminator lets a single consumer component handle
 * both shapes if needed: `combobox` (button-style) for select +
 * multi-select, `combobox-search` (input-style) for autocomplete.
 */
export interface ComboboxTriggerSlotProps {
  /** Forwarded ref. MUST point at a real button (combobox) or input (combobox-search) element. */
  ref: Ref<HTMLElement>
  /** Discriminator: `"button"` for select/multi (Combobox), `"input"` for autocomplete (SearchCombobox). */
  tagName: "button" | "input"
  /** className the framework's default chrome would have applied. Spread onto the shell. */
  className: string
  /** ARIA / state. Spread onto the shell for AT correctness. */
  "aria-invalid"?: true | undefined
  "aria-required"?: true | undefined
  "aria-readonly"?: true | undefined
  "aria-disabled"?: true | undefined
  "aria-label"?: string | undefined
  "aria-describedby"?: string | undefined
  "aria-haspopup": "listbox"
  "aria-expanded": boolean
  "aria-multiselectable"?: true | undefined
  "aria-controls"?: string | undefined
  "aria-activedescendant"?: string | undefined
  "aria-busy"?: true | undefined
  /** Load-bearing data attrs. The framework's commit path locates the input via these. MUST spread. */
  "data-bc-grid-editor-input": "true"
  "data-bc-grid-editor-kind": string
  "data-bc-grid-editor-option-count": number
  "data-bc-grid-editor-seeded"?: "true" | undefined
  "data-state": "open" | "closed"
  "data-bc-grid-editor-loading"?: "true" | undefined
  /** Pending-state DOM disabled. */
  disabled?: boolean | undefined
  /** Open / close state. Consumers may render a chevron / caret based on this. */
  open: boolean
  /** Loading state — only set by the autocomplete (`SearchCombobox`); always undefined for select / multi. */
  loading?: boolean | undefined
  /** Handlers — spread onto the shell for keyboard / click parity. */
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void
  /** Click toggles open. Only set on button-style triggers (select / multi); undefined on autocomplete (it opens on input). */
  onClick?: (() => void) | undefined
  /**
   * Default inner content the framework would have rendered (swatch +
   * icon + label / chips + caret). Spread the props + render `{children}`
   * for the simplest shadcn drop-in.
   */
  children: ReactNode
}

/**
 * Props handed to a custom `optionItemComponent` for combobox-driven
 * editors. Mirrors the prop bag the framework's built-in
 * `<div role="option">` consumes per option in the dropdown listbox.
 *
 * Children-as-slot like the trigger: the framework's swatch / icon /
 * label render lands as `children`. Consumers that need a fully
 * custom option layout (e.g. Lucide icon + sub-text) can either
 * use the structured data props (`option`, `isActive`, `isSelected`,
 * `isMulti`) to render from scratch, OR spread `{...props}` and
 * render `{children}` for the framework's default content.
 */
export interface ComboboxOptionSlotProps {
  /** Stable id per option for `aria-activedescendant`. MUST spread. */
  id: string
  /** Role the framework's default would have applied. */
  role: "option"
  /** Focus stays on the trigger via `aria-activedescendant`. */
  tabIndex: -1
  /** ARIA selection state. */
  "aria-selected": boolean
  /** Index in the framework's `options` array. Used by the framework's scroll-into-view loop. MUST spread. */
  "data-option-index": number
  /** Active (highlighted) state. */
  "data-active"?: "true" | undefined
  /** Selected state. */
  "data-selected"?: "true" | undefined
  /** className the framework's default chrome would have applied. */
  className: string
  /** Handlers — spread onto the shell for keyboard / pointer parity. */
  onPointerDown: (event: PointerEvent<HTMLElement>) => void
  onMouseEnter: () => void
  /** Default inner content (multi-mode check + swatch + icon + label). */
  children: ReactNode
  /** Structured data props for fully-custom render. */
  option: EditorOption
  isActive: boolean
  isSelected: boolean
  isMulti: boolean
}

/**
 * Per-editor factory option shape — every combobox-driven editor's
 * `createXxxEditor({ triggerComponent, optionItemComponent })`
 * accepts the same. Aliased per-editor for JSDoc clarity at the
 * call site.
 */
export interface ComboboxSlotOptions {
  /**
   * Override the built-in trigger shell (a `<button>` for
   * select / multi-select, an `<input>` for autocomplete). The
   * component receives every prop the built-in shell would have
   * applied, plus the framework's default inner content as
   * `children`. Spread the props + render `{children}` for the
   * simplest shadcn drop-in.
   */
  triggerComponent?: ComponentType<ComboboxTriggerSlotProps> | undefined
  /**
   * Override the built-in option-row shell (a `<div role="option">`).
   * Same children-as-slot pattern as triggerComponent.
   */
  optionItemComponent?: ComponentType<ComboboxOptionSlotProps> | undefined
}
