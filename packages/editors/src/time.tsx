import type { BcCellEditor, BcCellEditorProps } from "@bc-grid/react"
import { type ComponentType, useId, useLayoutEffect, useRef } from "react"
import {
  editorAccessibleName,
  editorInputClassName,
  editorStateAttrs,
  visuallyHiddenStyle,
} from "./chrome"
import type { EditorInputSlotProps } from "./internal/editorInputSlot"

/**
 * Time editor — `kind: "time"`. Default for time-of-day columns per
 * `editing-rfc §editor-time`.
 *
 * Behaviour:
 *   - Native `<input type="time">` — browser provides the time picker
 *     (24h or 12h depending on locale + OS settings).
 *   - Format: `HH:mm` (24h) on commit. Display via `Intl.DateTimeFormat`
 *     with `timeStyle: "short"` is the consumer's responsibility (cell
 *     renderer / column.format).
 *   - F2 / Enter: opens the picker / focuses the input.
 *   - Printable activation: numeric seeds focus the hours field.
 *   - Commit produces a string in `HH:mm` form; consumers may add a
 *     `valueParser` if they need a different shape (e.g., a Date).
 *
 * Native `<input>` styled via theme CSS variables — no library dep.
 * Browser variance: Safari renders a spinner, Chrome a popover, Firefox
 * a clock-style picker. All emit the same `HH:mm` value via
 * `input.value`. Consumers wanting shadcn-native styling pass an
 * `inputComponent` to `createTimeEditor({ inputComponent })`. See
 * `docs/recipes/shadcn-editors.md`. Per `v06-shadcn-native-editors-numeric-batch`.
 */
/**
 * Props handed to a custom `inputComponent` for the time editor.
 * Re-exports the shared `EditorInputSlotProps` shape (v0.6 §1
 * `v06-shadcn-native-editors-numeric-batch`) — drops in any
 * forwardRef-capable shadcn-style component without modification.
 */
export type TimeEditorInputProps = EditorInputSlotProps

export interface TimeEditorOptions {
  /**
   * Override the built-in `<input type="time">` with a custom
   * component. The component receives every prop the built-in input
   * would have applied — ref forwarding + defaultValue + ARIA +
   * edit-state data attributes. Lifecycle (focus, value reading at
   * commit) stays on the editor; the consumer just owns the visual
   * primitive.
   *
   * Defaults to a native `<input type="time">` styled via theme CSS
   * variables. Per `v06-shadcn-native-editors-numeric-batch`.
   */
  inputComponent?: ComponentType<TimeEditorInputProps>
}

/**
 * Factory for the time editor. Returns a fresh `BcCellEditor` with
 * the supplied options baked in. Default-export `timeEditor` is
 * `createTimeEditor()` for the zero-config case.
 *
 * ```tsx
 * import { Input } from "@/components/ui/input"
 * import { createTimeEditor } from "@bc-grid/editors"
 *
 * export const shadcnTimeEditor = createTimeEditor({ inputComponent: Input })
 * ```
 */
export function createTimeEditor(options: TimeEditorOptions = {}): BcCellEditor<unknown, unknown> {
  const Component = createTimeEditorComponent(options)
  return {
    Component: Component as unknown as BcCellEditor<unknown, unknown>["Component"],
    kind: "time",
  }
}

export const timeEditor: BcCellEditor<unknown, unknown> = createTimeEditor()

function createTimeEditorComponent(
  options: TimeEditorOptions,
): (props: BcCellEditorProps<unknown, unknown>) => ReturnType<typeof TimeEditorBody> {
  const InputComponent = options.inputComponent
  return function TimeEditor(props) {
    return <TimeEditorBody {...props} InputComponent={InputComponent} />
  }
}

function TimeEditorBody(
  props: BcCellEditorProps<unknown, unknown> & {
    InputComponent: ComponentType<TimeEditorInputProps> | undefined
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
  // Stable id per-editor-instance for aria-describedby → hidden error
  // span. Per `docs/design/v1-editor-a11y-audit.md` §Date/datetime/time gap.
  const errorId = useId()

  // Hand the input back to the framework via `focusRef`. Runs in
  // useLayoutEffect so the assignment lands BEFORE the framework's
  // parent useLayoutEffect calls focusRef.current?.focus() — children
  // fire first in React's commit phase. With useEffect here, focusRef
  // would be null when the framework reads it, and click-outside /
  // Tab / Enter commit would route through `readEditorInputValue(null)`
  // and silently commit `undefined`. Mirrors text.tsx / number.tsx.
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

  // No select-all on time inputs — the browser owns the field structure
  // (HH | mm) and select() is a no-op on `type="time"` in most browsers.
  // We just focus the input; clicking / arrowing into a sub-field is
  // user-driven from there.
  useLayoutEffect(() => {
    inputRef.current?.focus({ preventScroll: true })
  }, [])

  // seedKey: `<input type="time">` doesn't accept arbitrary seeds — its
  // value is parsed as HH:mm. Numeric seeds will move into the hours
  // field naturally on focus; non-numeric seeds are ignored. We don't
  // try to inject seedKey into the input value.
  void seedKey

  const seeded = normalizeTimeValue(initialValue)
  const accessibleName = editorAccessibleName(column, "Time value")

  // Custom inputComponent path: spreading `{...inputProps}` is
  // load-bearing — the framework's commit path locates the active
  // input via `data-bc-grid-editor-input`. shadcn's `<Input>`
  // satisfies the contract by construction.
  const inputProps: TimeEditorInputProps = {
    ref: inputRef,
    className: editorInputClassName,
    type: "time",
    defaultValue: seeded,
    disabled: pending,
    "aria-invalid": error ? true : undefined,
    "aria-label": accessibleName || undefined,
    "aria-describedby": error ? errorId : undefined,
    "aria-required": required ? true : undefined,
    "aria-readonly": readOnly ? true : undefined,
    "aria-disabled": disabled || pending ? true : undefined,
    "data-bc-grid-editor-input": "true",
    "data-bc-grid-editor-kind": "time",
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

/**
 * Coerce arbitrary cell values to the `HH:mm` shape expected by
 * `<input type="time">`. Accepts:
 *   - already-formatted "HH:mm" or "HH:mm:ss" strings
 *   - Date instances (extracts hours/minutes in local time)
 *   - anything else → empty (lets the picker render unset)
 */
function normalizeTimeValue(value: unknown): string {
  if (value == null) return ""
  if (typeof value === "string") {
    const match = value.match(/^(\d{2}):(\d{2})/)
    return match ? `${match[1]}:${match[2]}` : ""
  }
  if (value instanceof Date && !Number.isNaN(value.valueOf())) {
    const hh = String(value.getHours()).padStart(2, "0")
    const mm = String(value.getMinutes()).padStart(2, "0")
    return `${hh}:${mm}`
  }
  return ""
}
