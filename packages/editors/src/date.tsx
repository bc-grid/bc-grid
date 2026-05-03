import type { BcCellEditor, BcCellEditorProps } from "@bc-grid/react"
import { useLayoutEffect, useRef } from "react"
import { editorInputClassName, editorStateAttrs } from "./chrome"

/**
 * Date editor — `kind: "date"`. Default for date columns per
 * `editing-rfc §editor-date`.
 *
 * **Mount mode:** in-cell (default `popup: false` per
 * `in-cell-editor-mode-rfc.md` §4 hybrid table). The `<input
 * type="date">` trigger fits the cell box; the browser's calendar
 * popover is OS-chrome (rendered by the platform, not React) and
 * therefore unreachable to bc-grid's `data-bc-grid-editor-portal`
 * markings. The framework's click-outside listener never sees clicks
 * inside the native popover (the picker doesn't dispatch document
 * `pointerdown` events into the React tree), so the existing in-cell
 * mount works without `popup: true` — no overlay sibling needed.
 * Cross-browser variance: Safari opens on focus, Firefox opens on
 * focus + arrow / spacebar, Chrome opens on click. All emit ISO
 * `YYYY-MM-DD` regardless. v0.7 may revisit with a Radix-backed
 * picker if cross-browser variance breaks a customer.
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
 * No library dep.
 */
export const dateEditor: BcCellEditor<unknown, unknown> = {
  Component: DateEditor as unknown as BcCellEditor<unknown, unknown>["Component"],
  kind: "date",
  // popup intentionally unset (default false) — see JSDoc above.
}

function DateEditor(props: BcCellEditorProps<unknown, unknown>) {
  const { initialValue, error, focusRef, seedKey, pending, required, readOnly, disabled } = props
  const inputRef = useRef<HTMLInputElement | null>(null)

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
      className={editorInputClassName}
      type="date"
      defaultValue={seeded}
      disabled={pending}
      aria-invalid={error ? true : undefined}
      aria-required={required ? true : undefined}
      aria-readonly={readOnly ? true : undefined}
      aria-disabled={disabled || pending ? true : undefined}
      data-bc-grid-editor-input="true"
      data-bc-grid-editor-kind="date"
      {...editorStateAttrs({ error, pending })}
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
