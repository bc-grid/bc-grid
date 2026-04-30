import type { BcCellEditor, BcCellEditorProps } from "@bc-grid/react"
import { type CSSProperties, useEffect, useLayoutEffect, useRef } from "react"

/**
 * Datetime editor — `kind: "datetime"`. Default for date-with-time
 * columns per `editing-rfc §editor-datetime`.
 *
 * Behaviour:
 *   - Native `<input type="datetime-local">` — browser provides a
 *     combined date + time picker. Locale-aware UI; the value emitted
 *     via `input.value` is always ISO 8601 `YYYY-MM-DDTHH:mm`.
 *   - Format: `YYYY-MM-DDTHH:mm` on commit (no seconds, no timezone —
 *     matches the input's spec). Display via `Intl.DateTimeFormat` is
 *     the consumer's responsibility (cell renderer / column.format).
 *   - F2 / Enter / printable activation: focuses the input. Browser
 *     keyboard nav handles sub-field traversal (year / month / day /
 *     hour / minute).
 *   - Existing cell value normalised to `YYYY-MM-DDTHH:mm` (accepts
 *     ISO timestamps, RFC2822, Date instances, epoch ms; anything
 *     unparseable → empty so picker renders unset).
 *   - Commit produces a string in ISO datetime form (without seconds /
 *     timezone); consumers may add a `valueParser` if they need a Date,
 *     a full ISO string with seconds, or a different shape.
 *
 * Note: `datetime-local` represents a wall-clock datetime with no
 * timezone — that's the right shape for ERP scheduling fields where
 * the time is meaningful in the user's local context. Consumers wanting
 * UTC / offset-aware semantics should compose via `valueParser` on the
 * commit side.
 *
 * No library dep. Browser variance: Safari renders separate date +
 * time pickers stacked; Chrome a calendar with a time field; Firefox
 * a structured input. All emit ISO `YYYY-MM-DDTHH:mm`.
 */
export const datetimeEditor: BcCellEditor<unknown, unknown> = {
  Component: DatetimeEditor as unknown as BcCellEditor<unknown, unknown>["Component"],
  kind: "datetime",
}

function DatetimeEditor(props: BcCellEditorProps<unknown, unknown>) {
  const { initialValue, error, focusRef, seedKey, pending } = props
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (focusRef && inputRef.current) {
      ;(focusRef as { current: HTMLElement | null }).current = inputRef.current
    }
  }, [focusRef])

  // No select-all — `type=datetime-local` owns sub-fields.
  useLayoutEffect(() => {
    inputRef.current?.focus({ preventScroll: true })
  }, [])

  // seedKey is a no-op for datetime inputs (same reason as date / time
  // editors — the browser parses the value strictly).
  void seedKey

  const seeded = normalizeDatetimeValue(initialValue)

  return (
    <input
      ref={inputRef}
      type="datetime-local"
      defaultValue={seeded}
      disabled={pending}
      aria-invalid={error ? true : undefined}
      data-bc-grid-editor-input="true"
      data-bc-grid-editor-kind="datetime"
      style={inputStyle}
    />
  )
}

/**
 * Coerce arbitrary cell values to `YYYY-MM-DDTHH:mm` for
 * `<input type="datetime-local">`.
 */
function normalizeDatetimeValue(value: unknown): string {
  if (value == null) return ""
  if (value instanceof Date && !Number.isNaN(value.valueOf())) {
    return toIsoDatetimeLocal(value)
  }
  if (typeof value === "string") {
    // Already-formatted YYYY-MM-DDTHH:mm — return as-is.
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return value
    const parsed = new Date(value)
    if (!Number.isNaN(parsed.valueOf())) return toIsoDatetimeLocal(parsed)
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = new Date(value)
    if (!Number.isNaN(parsed.valueOf())) return toIsoDatetimeLocal(parsed)
  }
  return ""
}

function toIsoDatetimeLocal(date: Date): string {
  const yyyy = String(date.getFullYear()).padStart(4, "0")
  const mm = String(date.getMonth() + 1).padStart(2, "0")
  const dd = String(date.getDate()).padStart(2, "0")
  const hh = String(date.getHours()).padStart(2, "0")
  const mi = String(date.getMinutes()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`
}

const inputStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  border: "2px solid hsl(var(--ring, 217 91% 60%))",
  borderRadius: "calc(var(--radius, 0.375rem) - 1px)",
  background: "hsl(var(--background, 0 0% 100%))",
  color: "inherit",
  font: "inherit",
  paddingInline: "var(--bc-grid-cell-padding-x, 12px)",
  outline: "none",
  boxSizing: "border-box",
}
