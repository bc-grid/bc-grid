import type { BcCellEditor, BcCellEditorProps } from "@bc-grid/react"
import {
  type ComponentType,
  type InputHTMLAttributes,
  type Ref,
  useId,
  useLayoutEffect,
  useRef,
} from "react"
import {
  editorAccessibleName,
  editorInputClassName,
  editorStateAttrs,
  visuallyHiddenStyle,
} from "./chrome"

/**
 * Checkbox editor — `kind: "checkbox"`. The built-in boolean editor for
 * checkbox-style columns.
 *
 * Behaviour:
 *   - Native `<input type="checkbox">` so Space toggles through browser
 *     semantics while the grid remains in edit mode.
 *   - Enter / Tab / Shift+Enter / Shift+Tab / Escape stay grid-owned via
 *     the editor portal wrapper.
 *   - Commit produces a boolean by reading `input.checked` in the React
 *     editor portal. Consumers that need non-boolean persistence should
 *     map the value in `onCellEditCommit` or `column.valueParser`.
 *   - Pending async validation / server commit disables the control.
 *
 * Tri-state is intentionally not enabled in this slice; it needs explicit
 * cycle semantics and `indeterminate` DOM-state handling before becoming a
 * stable public option.
 *
 * Native `<input type="checkbox">` styled via the theme's CSS variables —
 * no library dep. Consumers wanting shadcn-native styling pass a
 * `checkboxComponent` to `createCheckboxEditor({ checkboxComponent })` —
 * the factory keeps the editor lifecycle (focus, ref, ARIA, edit-state
 * attrs, commit-time `input.checked` read) and delegates rendering to
 * the consumer's primitive. See `docs/recipes/shadcn-editors.md`. Per
 * `v06-shadcn-native-editors-select-batch`.
 */

/**
 * Props the framework hands to a custom `checkboxComponent`. Mirrors
 * the shape of the built-in `<input type="checkbox">` so a forwardRef-
 * capable shadcn `<Checkbox>` (or any other design-system primitive)
 * drops in without modification.
 *
 * The two `data-bc-grid-editor-*` attributes are LOAD-BEARING — the
 * framework's commit path reads `input.checked` at commit time and
 * locates the input via these attributes. Custom components MUST
 * spread `{...props}` onto their inner `<input type="checkbox">` so
 * the attributes reach the DOM.
 *
 * Per `v06-shadcn-native-editors-select-batch`.
 */
export interface CheckboxEditorInputProps
  extends Pick<
    InputHTMLAttributes<HTMLInputElement>,
    | "className"
    | "type"
    | "defaultChecked"
    | "disabled"
    | "aria-invalid"
    | "aria-label"
    | "aria-describedby"
    | "aria-required"
    | "aria-readonly"
    | "aria-disabled"
  > {
  ref: Ref<HTMLInputElement>
  "data-bc-grid-editor-input": "true"
  "data-bc-grid-editor-kind": "checkbox"
}

export interface CheckboxEditorOptions {
  /**
   * Override the built-in `<input type="checkbox">` with a custom
   * component (e.g. shadcn's `<Checkbox>`). The component receives
   * every prop the built-in input would have applied — ref forwarding +
   * defaultChecked + ARIA + edit-state data attributes. Lifecycle
   * (focus, value reading at commit) stays on the editor; the consumer
   * just owns the visual primitive.
   *
   * Defaults to a native `<input type="checkbox">` styled via theme
   * CSS variables. Per `v06-shadcn-native-editors-select-batch`.
   */
  checkboxComponent?: ComponentType<CheckboxEditorInputProps>
}

/**
 * Factory for the checkbox editor. Returns a fresh `BcCellEditor` with
 * the supplied options baked in. Default-export `checkboxEditor` is
 * `createCheckboxEditor()` for the zero-config case.
 *
 * ```tsx
 * import { Checkbox } from "@/components/ui/checkbox"
 * import { createCheckboxEditor } from "@bc-grid/editors"
 *
 * export const shadcnCheckboxEditor = createCheckboxEditor({ checkboxComponent: Checkbox })
 * ```
 */
export function createCheckboxEditor(
  options: CheckboxEditorOptions = {},
): BcCellEditor<unknown, unknown> {
  const Component = createCheckboxEditorComponent(options)
  return {
    Component: Component as unknown as BcCellEditor<unknown, unknown>["Component"],
    kind: "checkbox",
  }
}

export const checkboxEditor: BcCellEditor<unknown, unknown> = createCheckboxEditor()

/**
 * Strictly normalize an initial cell value for a boolean checkbox.
 * Only the boolean `true` checks the box; `false`, nullish values, and
 * string/number lookalikes stay unchecked so the editor does not silently
 * reinterpret non-boolean data on mount.
 */
export function resolveCheckboxCheckedValue(initialValue: unknown): boolean {
  return initialValue === true
}

function createCheckboxEditorComponent(
  options: CheckboxEditorOptions,
): (props: BcCellEditorProps<unknown, unknown>) => ReturnType<typeof CheckboxEditorBody> {
  const CheckboxComponent = options.checkboxComponent
  return function CheckboxEditor(props) {
    return <CheckboxEditorBody {...props} CheckboxComponent={CheckboxComponent} />
  }
}

function CheckboxEditorBody(
  props: BcCellEditorProps<unknown, unknown> & {
    CheckboxComponent: ComponentType<CheckboxEditorInputProps> | undefined
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
    CheckboxComponent,
  } = props
  const inputRef = useRef<HTMLInputElement | null>(null)
  const errorId = useId()

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

  // Printable activation seeds do not apply to boolean values. The user can
  // press Space after mount to toggle via native checkbox behaviour.
  void seedKey

  const checked = resolveCheckboxCheckedValue(initialValue)
  const accessibleName = editorAccessibleName(column, "Checkbox value")

  // The `data-bc-grid-editor-*` attributes ride on the SHELL `<span>`
  // when the built-in path renders, but on the INPUT itself when the
  // consumer's `checkboxComponent` overrides — the framework's commit
  // path reads `input.checked` directly via the focusRef → DOM path,
  // so the attributes only need to land where the click-outside
  // handler can find them. The shell carries them in built-in mode
  // because that's where the editor portal looks first; the override
  // path puts them on the input itself so a custom shadcn `<Checkbox>`
  // (which renders a `<button>` shell + hidden `<input>`) keeps the
  // discriminator on whatever element the consumer wires.
  const inputProps: CheckboxEditorInputProps = {
    ref: inputRef,
    className: "bc-grid-editor-checkbox-control",
    type: "checkbox",
    defaultChecked: checked,
    disabled: pending,
    "aria-invalid": error ? true : undefined,
    "aria-label": accessibleName || undefined,
    "aria-describedby": error ? errorId : undefined,
    "aria-required": required ? true : undefined,
    "aria-readonly": readOnly ? true : undefined,
    "aria-disabled": disabled || pending ? true : undefined,
    "data-bc-grid-editor-input": "true",
    "data-bc-grid-editor-kind": "checkbox",
  }

  return (
    <>
      <span
        className={`${editorInputClassName} bc-grid-editor-checkbox-shell`}
        aria-disabled={pending ? true : undefined}
        aria-invalid={error ? true : undefined}
        data-bc-grid-editor-input={CheckboxComponent ? undefined : "true"}
        data-bc-grid-editor-kind={CheckboxComponent ? undefined : "checkbox"}
        {...editorStateAttrs({ error, pending })}
      >
        {CheckboxComponent ? <CheckboxComponent {...inputProps} /> : <input {...inputProps} />}
      </span>
      {error ? (
        <span id={errorId} style={visuallyHiddenStyle}>
          {error}
        </span>
      ) : null}
    </>
  )
}
