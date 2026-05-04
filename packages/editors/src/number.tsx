import type { BcCellEditor, BcCellEditorProps } from "@bc-grid/react"
import { type ClipboardEvent, type ComponentType, useId, useLayoutEffect, useRef } from "react"
import { editorInputClassName, editorStateAttrs, visuallyHiddenStyle } from "./chrome"
import type { EditorInputSlotProps } from "./internal/editorInputSlot"
import { detectPastedValue } from "./internal/pasteDetection"

/**
 * Number editor — `kind: "number"`. Default for numeric columns per
 * `editing-rfc §editor-number`.
 *
 * Behaviour:
 *   - `inputMode="decimal"` triggers the numeric keyboard on touch
 *     devices (locale-aware decimal separator).
 *   - `seedKey`: only `0-9`, `.`, `,`, `-` are accepted as activation
 *     seeds; other printable keys are silently dropped so a stray
 *     letter doesn't end up in the input as garbage.
 *   - F2 / Enter: select-all on mount (Excel default).
 *   - Commit produces a string; consumers wire `column.valueParser:
 *     (input) => parseFloat(input)` (or stricter parsing) to convert
 *     to `number` before validation. Range checks (`min` / `max`)
 *     belong in `column.validate`.
 *
 * Native `<input>` styled via theme CSS variables — no library dep.
 *
 * Note: the editing-rfc described editor-number as a "typed commit"
 * editor that produces `number` directly without going through
 * valueParser. v0.1 ships the simpler valueParser-driven path so
 * editor-number stays a thin UI layer; consumer columns express
 * parsing rules at the column level (where they're already defined
 * for read-side `format`). Typed-commit can land as a follow-up that
 * extends `BcCellEditorProps.commit` with a `moveOnSettle` opt; today
 * the framework's portal owns commit-key interception.
 */
/**
 * Props handed to a custom `inputComponent` for the number editor.
 * Re-exports the shared `EditorInputSlotProps` shape (v0.6 §1
 * `v06-shadcn-native-editors-numeric-batch`) — drops in any
 * forwardRef-capable shadcn-style component without modification.
 */
export type NumberEditorInputProps = EditorInputSlotProps

export interface NumberEditorOptions {
  /**
   * Override the built-in `<input type="text" inputMode="decimal">`
   * with a custom component. The component receives every prop the
   * built-in input would have applied — ref forwarding +
   * defaultValue + inputMode + ARIA + edit-state data attributes.
   * Lifecycle (focus, select-all on mount, paste-detection, value
   * reading at commit) stays on the editor; the consumer just owns
   * the visual primitive.
   *
   * Defaults to a native `<input>` styled via theme CSS variables.
   * Per `v06-shadcn-native-editors-numeric-batch` (extends the
   * pattern #480 established for textEditor).
   */
  inputComponent?: ComponentType<NumberEditorInputProps>
}

/**
 * Factory for the number editor. Returns a fresh `BcCellEditor` with
 * the supplied options baked in. Default-export `numberEditor` is
 * `createNumberEditor()` for the zero-config case.
 *
 * ```tsx
 * import { Input } from "@/components/ui/input"
 * import { createNumberEditor } from "@bc-grid/editors"
 *
 * export const shadcnNumberEditor = createNumberEditor({ inputComponent: Input })
 * ```
 */
export function createNumberEditor(
  options: NumberEditorOptions = {},
): BcCellEditor<unknown, unknown> {
  const Component = createNumberEditorComponent(options)
  return {
    Component: Component as unknown as BcCellEditor<unknown, unknown>["Component"],
    kind: "number",
  }
}

export const numberEditor: BcCellEditor<unknown, unknown> = createNumberEditor()

/**
 * Predicate: is this seedKey acceptable as a numeric activation seed?
 *
 * Per `editing-rfc §editor-number`: digits, `.`, `,`, `-` only. Other
 * printable chars are dropped so the user doesn't end up with garbage
 * pre-seeded into the editor on activation.
 *
 * Pure so the seed semantics are unit-testable without mounting React.
 * Returns the seed string on accept; `undefined` on reject so the call
 * site can fall through to the existing-value path with the same
 * conditional shape used by `editor-text`.
 */
export function acceptNumericSeed(seedKey: string | undefined): string | undefined {
  if (seedKey == null) return undefined
  return SEED_ACCEPT.test(seedKey) ? seedKey : undefined
}

const SEED_ACCEPT = /^[\d.,\-]$/

/**
 * Locale-aware number parser, ready to drop into `column.valueParser`
 * for international ERP grids. Audit P1-W3-5 / v0.5 → v0.6 §2.
 *
 * Reads the locale's group + decimal separators via
 * `Intl.NumberFormat(locale).formatToParts(...)` (cached per locale),
 * strips group separators, normalises the decimal to `.`, then runs
 * `Number.parseFloat`. Negative parentheses (`(1,234.56)` →
 * `-1234.56`) are honoured so consumers don't reinvent the strip
 * logic in every grid.
 *
 * Rejects nonsense gracefully: returns `Number.NaN` rather than
 * throwing, so consumers can guard with `Number.isFinite` before
 * committing. The framework's `valueParser` runs before `validate`,
 * so a `NaN` candidate flows into the consumer's validator the same
 * way any other unparseable input does.
 *
 * Examples (with `locale: "de-DE"`):
 *   `"1,5"`        → `1.5`   // comma is the decimal separator
 *   `"1.234,56"`   → `1234.56` // dot is the group separator
 *   `"€1.234,56"`  → `1234.56` // currency strips
 *   `"(1.234,56)"` → `-1234.56` // accounting-negative
 *
 * Examples (with `locale: "en-US"`):
 *   `"1,234.56"`   → `1234.56`
 *   `"$1,234.56"`  → `1234.56`
 *   `"(1,234.56)"` → `-1234.56`
 */
export function parseLocaleNumber(value: string, locale = "en-US"): number {
  const trimmed = value.trim()
  if (trimmed.length === 0) return Number.NaN

  const parts = getLocaleParts(locale)
  // Detect accounting-style negatives BEFORE stripping non-digits so
  // we don't lose the sign. `(1,234.56)` → flip sign + strip parens.
  const isParenNegative = trimmed.startsWith("(") && trimmed.endsWith(")")
  const inner = isParenNegative ? trimmed.slice(1, -1) : trimmed

  // Strip the locale's group separators, then swap the decimal
  // separator for `.`. Non-digit characters (currency symbols,
  // whitespace, +) are stripped at the end so the order of operations
  // doesn't lose the decimal that happens to share a glyph with
  // a stripped char (e.g. Swiss `1’234.56` uses U+2019 as group).
  let normalised = inner
  if (parts.group) {
    // Replace all instances of the group separator. Iterate via split/
    // join so the regex escape isn't load-bearing for non-ASCII chars.
    normalised = normalised.split(parts.group).join("")
  }
  if (parts.decimal && parts.decimal !== ".") {
    normalised = normalised.split(parts.decimal).join(".")
  }
  // Strip everything that's not a digit, decimal point, or sign.
  normalised = normalised.replace(/[^\d.\-+]/g, "")

  const parsed = Number.parseFloat(normalised)
  if (!Number.isFinite(parsed)) return Number.NaN
  return isParenNegative ? -Math.abs(parsed) : parsed
}

const LOCALE_PARTS_CACHE = new Map<string, { group: string; decimal: string }>()

function getLocaleParts(locale: string): { group: string; decimal: string } {
  const cached = LOCALE_PARTS_CACHE.get(locale)
  if (cached) return cached
  // Parse a number with both a group and a decimal so both parts surface.
  let group = ""
  let decimal = "."
  try {
    const parts = new Intl.NumberFormat(locale).formatToParts(1234567.89)
    for (const part of parts) {
      if (part.type === "group") group = part.value
      if (part.type === "decimal") decimal = part.value
    }
  } catch {
    // Locale unrecognised by the runtime — fall through to the
    // ASCII default. Consumers that need a stricter contract can
    // pass a known-supported BCP 47 tag.
  }
  const result = { group, decimal }
  LOCALE_PARTS_CACHE.set(locale, result)
  return result
}

function createNumberEditorComponent(
  options: NumberEditorOptions,
): (props: BcCellEditorProps<unknown, unknown>) => ReturnType<typeof NumberEditorBody> {
  const InputComponent = options.inputComponent
  return function NumberEditor(props) {
    return <NumberEditorBody {...props} InputComponent={InputComponent} />
  }
}

function NumberEditorBody(
  props: BcCellEditorProps<unknown, unknown> & {
    InputComponent: ComponentType<NumberEditorInputProps> | undefined
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
    row,
    InputComponent,
  } = props
  const inputRef = useRef<HTMLInputElement | null>(null)
  // Stable id per-editor-instance for aria-describedby → hidden error
  // span. Pairs with the cell-level error span the framework renders
  // so AT speaks the validator error regardless of focus target.
  const errorId = useId()

  // Hand the input back to the framework via `focusRef`. Runs in
  // useLayoutEffect so the assignment lands BEFORE the framework's
  // parent useLayoutEffect calls focusRef.current?.focus(). Children
  // fire first in React's commit phase. With useEffect here, focusRef
  // would be null at the framework's focus time and the input would
  // never receive DOM focus on real interaction. Mirrors the fix that
  // landed for `editor-text` in PR #155.
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

  // F2 / Enter: select-all. Printable: caret at end.
  useLayoutEffect(() => {
    const input = inputRef.current
    if (!input) return
    if (seedKey != null) {
      const len = input.value.length
      input.setSelectionRange(len, len)
    } else {
      input.select()
    }
  }, [seedKey])

  const acceptedSeed = acceptNumericSeed(seedKey)
  const seeded =
    acceptedSeed != null ? acceptedSeed : initialValue == null ? "" : String(initialValue)

  // AT name: column.header when it's a string; else fall back to the
  // column id chain so the announcement at least carries the field
  // name. Per `editing-rfc §ARIA states on the cell`.
  const accessibleName =
    typeof column.header === "string" ? column.header : (column.field ?? column.columnId ?? "")

  // Paste-into-cell format detection (v0.6 §1
  // `v06-editor-paste-into-cell-detection`). When the user pastes
  // `"$1,234.56"` or `"(1,234.56)"`, normalize via the column's
  // valueParser (if wired) or `parseLocaleNumber` so the input
  // reflects the parsed numeric value immediately. Falls through
  // to the browser's default paste behaviour for unparseable text
  // — preserves v0.5 default for non-numeric pastes.
  const onPaste = (event: ClipboardEvent<HTMLInputElement>): void => {
    const text = event.clipboardData.getData("text/plain")
    if (!text) return
    const result = detectPastedValue({
      text,
      column,
      row,
      fallback: (raw) => parseLocaleNumber(raw, resolveLocale()),
      stringify: stringifyNumber,
    })
    if (!result.ok) return
    event.preventDefault()
    const input = inputRef.current
    if (!input) return
    input.value = result.normalised
  }

  // Custom inputComponent path: per-editor JSDoc covers contract.
  // The framework's commit path locates the active input via
  // `data-bc-grid-editor-input` so spreading `{...inputProps}` onto
  // the consumer's component is load-bearing — shadcn's `<Input>`
  // satisfies this by construction.
  const inputProps: NumberEditorInputProps = {
    ref: inputRef,
    className: editorInputClassName,
    type: "text",
    inputMode: "decimal",
    defaultValue: seeded,
    disabled: pending,
    "aria-invalid": error ? true : undefined,
    "aria-label": accessibleName || undefined,
    "aria-describedby": error ? errorId : undefined,
    "aria-required": required ? true : undefined,
    "aria-readonly": readOnly ? true : undefined,
    "aria-disabled": disabled || pending ? true : undefined,
    "data-bc-grid-editor-input": "true",
    "data-bc-grid-editor-kind": "number",
    onPaste,
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

function resolveLocale(): string {
  // The editor doesn't receive `locale` directly via props; consumers
  // wanting strict locale control wire `column.valueParser` for
  // commit-time parsing AND the paste handler will use that same
  // parser first via `detectPastedValue`. The fallback only fires
  // when the consumer hasn't wired one — `Intl`'s resolved locale
  // matches the runtime's user setting which is typically the
  // sensible default.
  try {
    return new Intl.NumberFormat().resolvedOptions().locale ?? "en-US"
  } catch {
    return "en-US"
  }
}

function stringifyNumber(parsed: unknown): string {
  if (typeof parsed === "number" && Number.isFinite(parsed)) return String(parsed)
  if (typeof parsed === "string") return parsed
  return ""
}
