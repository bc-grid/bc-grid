import type { BcCellEditor, BcCellEditorProps } from "@bc-grid/react"
import { type CSSProperties, useEffect, useLayoutEffect, useRef } from "react"

/**
 * Date editor — `kind: "date"`. Default for date columns per
 * `editing-rfc §editor-date`.
 *
 * Behaviour:
 *   - Native `<input type="date">` — browser provides the calendar
 *     popover. Locale-aware formatting in the picker UI; the value
 *     emitted via `input.value` is always ISO 8601 `YYYY-MM-DD`.
 *   - Format: `YYYY-MM-DD` on commit. Display via `Intl.DateTimeFormat`
 *     is the consumer's responsibility (cell renderer / column.format).
 *   - F2 / Enter / printable activation: focuses the input. Browsers
 *     vary on whether typing digits seeds the day field directly (Chrome
 *     does, Safari often opens the picker first).
 *   - Existing cell value normalised to `YYYY-MM-DD`. Accepts:
 *     - already-formatted "YYYY-MM-DD" strings
 *     - any string parseable by `new Date()` (e.g. ISO with time, RFC2822)
 *     - Date instances
 *     - anything else → empty (picker renders unset).
 *   - Commit produces a string in ISO date form; consumers may add a
 *     `valueParser` if they need a Date instance or a different shape
 *     (e.g. epoch milliseconds).
 *
 * No library dep. Browser variance: Safari renders a contextual popover,
 * Chrome a calendar widget, Firefox a structured date picker. All emit
 * ISO `YYYY-MM-DD` regardless.
 */
export const dateEditor: BcCellEditor<unknown, unknown> = {
  Component: DateEditor as unknown as BcCellEditor<unknown, unknown>["Component"],
  kind: "date",
}

function DateEditor(props: BcCellEditorProps<unknown, unknown>) {
  const { initialValue, error, focusRef, seedKey, pending } = props
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (focusRef && inputRef.current) {
      ;(focusRef as { current: HTMLElement | null }).current = inputRef.current
    }
  }, [focusRef])

  // No select-all — `type=date` owns the YYYY | MM | DD sub-fields and
  // select() is a no-op there in most browsers. Just focus the input;
  // browser-native keyboard navigation between sub-fields takes over.
  useLayoutEffect(() => {
    inputRef.current?.focus({ preventScroll: true })
  }, [])

  // seedKey is ignored for date inputs — the browser parses input.value
  // strictly as YYYY-MM-DD. A printable digit landing here would not
  // produce a valid partial state. The framework's activation guard
  // already routes printable activations here; the user can keep typing
  // into the focused sub-field once the input is mounted.
  void seedKey

  const seeded = normalizeDateValue(initialValue)

  return (
    <input
      ref={inputRef}
      type="date"
      defaultValue={seeded}
      disabled={pending}
      aria-invalid={error ? true : undefined}
      data-bc-grid-editor-input="true"
      data-bc-grid-editor-kind="date"
      style={inputStyle}
    />
  )
}

/**
 * Coerce arbitrary cell values to `YYYY-MM-DD` for `<input type="date">`.
 */
function normalizeDateValue(value: unknown): string {
  if (value == null) return ""
  if (value instanceof Date && !Number.isNaN(value.valueOf())) {
    return toIsoDate(value)
  }
  if (typeof value === "string") {
    const isoDate = normaliseIsoDateString(value)
    if (isoDate) return isoDate
    // Parse other date-shaped strings (ISO with time, RFC2822, etc.).
    const parsed = new Date(value)
    if (!Number.isNaN(parsed.valueOf())) return toIsoDate(parsed)
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = new Date(value)
    if (!Number.isNaN(parsed.valueOf())) return toIsoDate(parsed)
  }
  return ""
}

function normaliseIsoDateString(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/.exec(value.trim())
  if (!match) return null
  const [, yearPart, monthPart, dayPart] = match
  const year = Number(yearPart)
  const month = Number(monthPart)
  const day = Number(dayPart)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  if (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  ) {
    return `${yearPart}-${monthPart}-${dayPart}`
  }
  return null
}

function toIsoDate(date: Date): string {
  const yyyy = String(date.getFullYear()).padStart(4, "0")
  const mm = String(date.getMonth() + 1).padStart(2, "0")
  const dd = String(date.getDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
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
