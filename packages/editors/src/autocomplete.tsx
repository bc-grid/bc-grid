import type { BcCellEditor, BcCellEditorProps } from "@bc-grid/react"
import { type CSSProperties, useEffect, useId, useLayoutEffect, useRef, useState } from "react"

const DEBOUNCE_MS = 200

/**
 * Autocomplete editor — `kind: "autocomplete"`. Default for free-form
 * fields with a long candidate list per `editing-rfc §editor-autocomplete`.
 * Native `<input list>` + `<datalist>` — no library dep, no portal.
 *
 * Behaviour:
 *   - Native `<input type="text" list="...">` paired with a
 *     `<datalist id="...">` — the browser draws the suggestion popover.
 *     Touch-friendly on mobile, keyboard-navigable on desktop (Up/Down
 *     navigates the suggestion list, Enter picks).
 *   - Options resolution: `column.fetchOptions(query, signal)` — async
 *     callback invoked on every keystroke (debounced 200ms inside the
 *     editor). The previous request's signal is aborted before a new
 *     one fires so superseded fetches don't race.
 *   - `seedKey`: replaces the cell's prior value with the typed character
 *     and fetches with that as the initial query.
 *   - `pointerHint`: ignored — native input handles caret placement.
 *   - Commit produces `input.value` (string). The framework runs
 *     `column.valueParser` on the string before validation, matching
 *     every other native-text editor (text, number, date, time).
 *   - `pending`: disables the input.
 *   - `aria-invalid`: reflects the validation error.
 *
 * No library dep. Browser variance: Chrome / Firefox / Safari all
 * implement `<input list>` natively with their own popover styling;
 * mobile browsers use the platform's keyboard suggestion strip.
 */
export const autocompleteEditor: BcCellEditor<unknown, unknown> = {
  Component: AutocompleteEditor as unknown as BcCellEditor<unknown, unknown>["Component"],
  kind: "autocomplete",
}

function AutocompleteEditor(props: BcCellEditorProps<unknown, unknown>) {
  const { initialValue, error, focusRef, seedKey, pending, column } = props
  const inputRef = useRef<HTMLInputElement | null>(null)
  const datalistId = useId()
  const [options, setOptions] = useState<readonly { value: unknown; label: string }[]>([])

  const fetchOptions = (
    column as {
      fetchOptions?: (
        query: string,
        signal: AbortSignal,
      ) => Promise<readonly { value: unknown; label: string }[]>
    }
  ).fetchOptions

  const abortRef = useRef<AbortController | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const queryFor = (query: string, debounce: boolean) => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (abortRef.current) abortRef.current.abort()
    if (!fetchOptions) {
      setOptions([])
      return
    }
    const fire = async () => {
      const ac = new AbortController()
      abortRef.current = ac
      try {
        const result = await fetchOptions(query, ac.signal)
        if (!ac.signal.aborted) setOptions(result)
      } catch {
        // Aborted or fetch errored — leave options as-is. Per the RFC,
        // failing the fetch shouldn't block the user from typing free text.
      }
    }
    if (debounce) {
      timerRef.current = setTimeout(fire, DEBOUNCE_MS)
    } else {
      void fire()
    }
  }

  useEffect(() => {
    if (focusRef && inputRef.current) {
      ;(focusRef as { current: HTMLElement | null }).current = inputRef.current
    }
  }, [focusRef])

  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-only — focus + initial fetch fire once; later fetches go through onInput.
  useLayoutEffect(() => {
    inputRef.current?.focus({ preventScroll: true })
    // Initial fetch — un-debounced so first-paint suggestions appear
    // promptly. seedKey wins over initialValue per editing-rfc §Activation.
    const initialQuery =
      seedKey != null ? seedKey : initialValue == null ? "" : String(initialValue)
    queryFor(initialQuery, false)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      if (abortRef.current) abortRef.current.abort()
    }
  }, [])

  const handleInput = (event: React.FormEvent<HTMLInputElement>) => {
    queryFor(event.currentTarget.value, true)
  }

  // Seed value for the input itself: prefer seedKey, else stringified
  // current value (matches editor-text behaviour).
  const seeded = seedKey != null ? seedKey : initialValue == null ? "" : String(initialValue)

  return (
    <>
      <input
        ref={inputRef}
        type="text"
        list={datalistId}
        defaultValue={seeded}
        disabled={pending}
        aria-invalid={error ? true : undefined}
        autoComplete="off"
        data-bc-grid-editor-input="true"
        data-bc-grid-editor-kind="autocomplete"
        onInput={handleInput}
        style={autocompleteInputStyle}
      />
      <datalist id={datalistId} data-bc-grid-editor-datalist="true">
        {options.map((option) => (
          <option key={optionToString(option.value)} value={optionToString(option.value)}>
            {option.label}
          </option>
        ))}
      </datalist>
    </>
  )
}

function optionToString(value: unknown): string {
  if (value == null) return ""
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  return JSON.stringify(value)
}

const autocompleteInputStyle: CSSProperties = {
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
