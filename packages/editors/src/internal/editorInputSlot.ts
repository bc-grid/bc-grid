import type { ClipboardEvent, ComponentType, InputHTMLAttributes, Ref } from "react"

/**
 * Shared shape for the `inputComponent` render-prop slot used by
 * the single-input built-in editors (text, number, date, datetime,
 * time). v0.6 §1 `v06-shadcn-native-editors-numeric-batch` extends
 * the pattern that #480 established for textEditor.
 *
 * Custom components MUST forward `ref` to a real input element so
 * the framework's commit / focus paths reach the DOM input. shadcn's
 * `<Input>` already forwards refs via `React.forwardRef`, so it
 * drops in directly across all five editors.
 *
 * The two `data-bc-grid-editor-*` attributes are LOAD-BEARING — the
 * framework's click-outside / Tab / Enter commit paths locate the
 * active input via `[data-bc-grid-editor-input="true"]`. Custom
 * components MUST spread the props onto their inner `<input>` so
 * these attributes survive.
 */
export interface EditorInputSlotProps
  extends Pick<
    InputHTMLAttributes<HTMLInputElement>,
    | "className"
    | "type"
    | "defaultValue"
    | "disabled"
    | "inputMode"
    | "aria-invalid"
    | "aria-label"
    | "aria-describedby"
    | "aria-required"
    | "aria-readonly"
    | "aria-disabled"
  > {
  ref: Ref<HTMLInputElement>
  "data-bc-grid-editor-input": "true"
  "data-bc-grid-editor-kind": string
  /**
   * Optional paste interceptor — wired by the numeric / date editors
   * for format detection (currency, parens-negative, ISO dates, etc).
   * Custom components that wrap a native `<input>` should spread the
   * props so the framework's paste-detection works through their
   * wrapper. Per `v06-editor-paste-into-cell-detection` (#467).
   */
  onPaste?: (event: ClipboardEvent<HTMLInputElement>) => void
}

/**
 * Per-editor factory option shape — every numeric/text editor's
 * `createXxxEditor({ inputComponent })` accepts the same. Aliased
 * per-editor for JSDoc + type clarity at the call site.
 */
export interface EditorInputSlotOptions {
  /**
   * Override the built-in `<input>` with a custom component (e.g.
   * shadcn's `<Input>`). The component receives every prop the
   * built-in input would have applied — ref forwarding +
   * defaultValue + disabled + ARIA + edit-state data attributes.
   * Lifecycle (focus, select-all on mount, value reading at commit)
   * stays on the editor; the consumer just owns the visual primitive.
   *
   * Defaults to a native `<input>` styled via theme CSS variables.
   */
  inputComponent?: ComponentType<EditorInputSlotProps>
}
