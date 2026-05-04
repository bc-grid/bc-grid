import type { BcCellEditor, BcCellEditorProps } from "@bc-grid/react"
import { type ComponentType, useId, useLayoutEffect, useRef } from "react"
import { editorInputClassName, editorStateAttrs, visuallyHiddenStyle } from "./chrome"
import type { EditorInputSlotProps } from "./internal/editorInputSlot"

/**
 * Text editor — `kind: "text"`. The default for string-typed columns
 * per `editing-rfc §editor-text`.
 *
 * Behaviour:
 *   - `seedKey`: replaces the cell's prior content; caret at end.
 *   - F2 sub-mode: noop (no advanced state for text).
 *   - String editor: produces a string; if `column.valueParser` is set,
 *     the framework calls it post-commit to convert string → TValue
 *     before validation. Otherwise the string lands in the overlay
 *     as-is.
 *   - No portal — single inline input.
 *
 * Native `<input type="text">` styled via the theme's CSS variables —
 * no library dep. Consumers wanting shadcn-native styling pass an
 * `inputComponent` to `createTextEditor({ inputComponent })` — the
 * factory keeps the editor lifecycle (focus, ref, seed, ARIA) and
 * delegates rendering to the consumer's primitive. See
 * `docs/recipes/shadcn-editors.md`.
 *
 * Typed as `BcCellEditor<unknown, unknown>` so it assigns cleanly to any
 * column under `exactOptionalPropertyTypes`. The TextEditor component
 * internally narrows `props.initialValue` to a string at render.
 */

/**
 * Props the framework hands to a custom `inputComponent` for the
 * text editor. Re-exports the shared `EditorInputSlotProps` shape
 * (v0.6 §1 `v06-shadcn-native-editors-numeric-batch` extends this
 * pattern across number/date/datetime/time editors). Custom
 * components MUST forward `ref` to a real input element so the
 * framework's commit / focus / select-all paths reach the DOM input.
 * shadcn's `<Input>` already forwards refs via `React.forwardRef`,
 * so it drops in directly. Per `v06-shadcn-native-editors`.
 */
export type TextEditorInputProps = EditorInputSlotProps

export interface TextEditorOptions {
  /**
   * Override the built-in `<input>` with a custom component (e.g.
   * shadcn's `<Input>`). The component receives every prop the
   * built-in input would have applied — ref forwarding + defaultValue
   * + ARIA + edit-state data attributes. Lifecycle (focus, select-all
   * on mount, value reading at commit) stays on the editor; the
   * consumer just owns the visual primitive.
   *
   * Defaults to a native `<input>` styled via theme CSS variables.
   */
  inputComponent?: ComponentType<TextEditorInputProps>
}

/**
 * Factory for the text editor. Returns a fresh `BcCellEditor` with
 * the supplied options baked in. Default-export `textEditor` is
 * `createTextEditor()` for the zero-config case; consumers wanting
 * shadcn / custom rendering call the factory directly:
 *
 * ```tsx
 * import { Input } from "@/components/ui/input"
 * import { createTextEditor } from "@bc-grid/editors"
 *
 * export const shadcnTextEditor = createTextEditor({ inputComponent: Input })
 *
 * const col: BcReactGridColumn<CustomerRow> = {
 *   field: "name",
 *   header: "Name",
 *   cellEditor: shadcnTextEditor,
 * }
 * ```
 *
 * Per `v06-shadcn-native-editors` (bsncraft P2 #17).
 */
export function createTextEditor(options: TextEditorOptions = {}): BcCellEditor<unknown, unknown> {
  const Component = createTextEditorComponent(options)
  return {
    Component: Component as unknown as BcCellEditor<unknown, unknown>["Component"],
    kind: "text",
  }
}

export const textEditor: BcCellEditor<unknown, unknown> = createTextEditor()

/**
 * Compute the value that mounts on the input.
 *   - `seedKey` (printable activation) wins — replaces cell content.
 *   - else fall back to the existing cell value, coerced safely.
 *   - null / undefined → empty string so the input is empty (not "null").
 *
 * Pure so the seed semantics are unit-testable per `editing-rfc
 * §Activation` without mounting React.
 */
export function resolveTextEditorSeed(initialValue: unknown, seedKey: string | undefined): string {
  if (seedKey != null) return seedKey
  if (initialValue == null) return ""
  return String(initialValue)
}

function createTextEditorComponent(
  options: TextEditorOptions,
): (props: BcCellEditorProps<unknown, string>) => ReturnType<typeof TextEditorBody> {
  const InputComponent = options.inputComponent
  return function TextEditor(props) {
    return <TextEditorBody {...props} InputComponent={InputComponent} />
  }
}

function TextEditorBody(
  props: BcCellEditorProps<unknown, string> & {
    InputComponent: ComponentType<TextEditorInputProps> | undefined
  },
) {
  const {
    initialValue,
    error,
    focusRef,
    seedKey,
    pending,
    required,
    readOnly,
    disabled,
    column,
    InputComponent,
  } = props
  const inputRef = useRef<HTMLInputElement | null>(null)
  // Stable id per-editor-instance so aria-describedby can target the
  // hidden error message text. `useId()` is stable across renders.
  const errorId = useId()

  // Hand the input element back to the framework via `focusRef`. This
  // assignment runs in `useLayoutEffect` so it lands BEFORE the
  // framework's parent `useLayoutEffect` (children fire first in the
  // commit phase). With `useEffect` here the framework's mount-focus
  // call would see `focusRef.current === null` and the input would
  // never receive focus on real interaction. Per `editing-rfc §a11y
  // for edit mode` ("real focus shifts to focusRef.current").
  useLayoutEffect(() => {
    if (focusRef && inputRef.current) {
      ;(focusRef as { current: HTMLElement | null }).current = inputRef.current
    }
    return () => {
      if (focusRef) {
        ;(focusRef as { current: HTMLElement | null }).current = null
      }
    }
  }, [focusRef])

  // F2 / Enter activation: select-all on mount per `editing-rfc §F2 / Enter`.
  // Printable activation (`seedKey`): caret at end (the seeded value is
  // the entire content).
  useLayoutEffect(() => {
    const input = inputRef.current
    if (!input) return
    if (seedKey != null) {
      // Caret at end — already there from defaultValue mount.
      const len = input.value.length
      input.setSelectionRange(len, len)
    } else {
      // Excel-style: select-all so typing replaces.
      input.select()
    }
  }, [seedKey])

  const seeded = resolveTextEditorSeed(initialValue, seedKey)
  // Column header for the input's AT name. Falls back to `column.field`
  // when the header is not a plain string (e.g., header is a render
  // function). Per `editing-rfc §ARIA states on the cell` — the input
  // inherits its name from the column context so AT announces "{column}
  // edit text" instead of just "edit text".
  const accessibleName =
    typeof column.header === "string" ? column.header : (column.field ?? column.columnId ?? "")

  // v0.1 commit/cancel happens via Enter / Tab / Escape on the framework's
  // editor portal — the input is uncontrolled and the portal reads
  // `inputRef.current.value` at commit time. Document-level click-outside
  // commits via the portal's pointerdown listener.
  //
  // Custom inputComponent: the consumer's component receives the
  // ref + same defaultValue/disabled/ARIA props, plus the
  // load-bearing data-bc-grid-editor-input + data-bc-grid-editor-kind
  // attributes that the framework's commit path uses to locate the
  // input. The consumer's component MUST forward `ref` to a real
  // input element (shadcn's Input does via React.forwardRef).
  // editorStateAttrs is applied AFTER so it overrides any
  // edit-state attrs the consumer's primitive may set.
  const inputProps: TextEditorInputProps = {
    ref: inputRef,
    className: editorInputClassName,
    type: "text",
    defaultValue: seeded,
    disabled: pending,
    "aria-invalid": error ? true : undefined,
    "aria-label": accessibleName || undefined,
    "aria-describedby": error ? errorId : undefined,
    "aria-required": required ? true : undefined,
    "aria-readonly": readOnly ? true : undefined,
    "aria-disabled": disabled || pending ? true : undefined,
    "data-bc-grid-editor-input": "true",
    "data-bc-grid-editor-kind": "text",
    ...editorStateAttrs({ error, pending }),
  }
  return (
    <>
      {InputComponent ? <InputComponent {...inputProps} /> : <input {...inputProps} />}
      {error ? (
        <span id={errorId} style={visuallyHiddenStyle}>
          {error}
        </span>
      ) : null}
    </>
  )
}
