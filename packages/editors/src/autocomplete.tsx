import type { BcCellEditor, BcCellEditorProps } from "@bc-grid/react"
import { type FormEvent, useId, useLayoutEffect, useRef, useState } from "react"
import {
  type EditorOption,
  editorAccessibleName,
  editorControlState,
  editorInputClassName,
  editorOptionToString,
  visuallyHiddenStyle,
} from "./chrome"

const DEBOUNCE_MS = 200

export type AutocompleteFetchOptions = (
  query: string,
  signal: AbortSignal,
) => Promise<readonly EditorOption[]>

export interface AutocompleteRequestController {
  abort: () => void
  request: (query: string) => AbortSignal | null
}

export function createAutocompleteRequestController({
  fetchOptions,
  setLoading,
  setOptions,
}: {
  fetchOptions: AutocompleteFetchOptions | undefined
  setLoading: (loading: boolean) => void
  setOptions: (options: readonly EditorOption[]) => void
}): AutocompleteRequestController {
  let activeController: AbortController | null = null

  return {
    abort() {
      activeController?.abort()
      activeController = null
    },
    request(query) {
      activeController?.abort()
      if (!fetchOptions) {
        setOptions([])
        setLoading(false)
        return null
      }

      const controller = new AbortController()
      activeController = controller
      setLoading(true)

      void (async () => {
        try {
          const result = await fetchOptions(query, controller.signal)
          if (!controller.signal.aborted) setOptions(result)
        } catch {
          // Aborted or fetch errored: keep free-text editing available and
          // leave the existing suggestions in place for the current edit.
        } finally {
          if (activeController === controller && !controller.signal.aborted) {
            activeController = null
            setLoading(false)
          }
        }
      })()

      return controller.signal
    },
  }
}

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
  const errorId = useId()
  const statusId = useId()
  const [options, setOptions] = useState<readonly EditorOption[]>([])
  const [loading, setLoading] = useState(false)

  const fetchOptions = (
    column as {
      fetchOptions?: AutocompleteFetchOptions
    }
  ).fetchOptions

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const requestControllerRef = useRef<AutocompleteRequestController | null>(null)
  if (!requestControllerRef.current) {
    requestControllerRef.current = createAutocompleteRequestController({
      fetchOptions,
      setLoading,
      setOptions,
    })
  }

  const queryFor = (query: string, debounce: boolean) => {
    if (timerRef.current) clearTimeout(timerRef.current)
    requestControllerRef.current?.abort()
    if (!fetchOptions) {
      setOptions([])
      setLoading(false)
      return
    }
    setLoading(true)
    const fire = () => {
      requestControllerRef.current?.request(query)
    }
    if (debounce) {
      timerRef.current = setTimeout(fire, DEBOUNCE_MS)
    } else {
      fire()
    }
  }

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
      requestControllerRef.current?.abort()
    }
  }, [])

  const handleInput = (event: FormEvent<HTMLInputElement>) => {
    queryFor(event.currentTarget.value, true)
  }

  // Seed value for the input itself: prefer seedKey, else stringified
  // current value (matches editor-text behaviour).
  const seeded = seedKey != null ? seedKey : initialValue == null ? "" : String(initialValue)
  const accessibleName = editorAccessibleName(column, "Autocomplete value")
  const describedBy = error ? `${errorId} ${statusId}` : statusId

  return (
    <>
      <input
        ref={inputRef}
        className={editorInputClassName}
        type="text"
        list={datalistId}
        defaultValue={seeded}
        disabled={pending}
        aria-invalid={error ? true : undefined}
        aria-label={accessibleName}
        aria-describedby={describedBy}
        aria-controls={datalistId}
        aria-busy={pending || loading ? true : undefined}
        autoComplete="off"
        data-bc-grid-editor-input="true"
        data-bc-grid-editor-kind="autocomplete"
        data-bc-grid-editor-state={editorControlState({ error, pending })}
        data-bc-grid-editor-loading={loading ? "true" : undefined}
        data-bc-grid-editor-seeded={seedKey != null ? "true" : undefined}
        data-bc-grid-editor-option-count={options.length}
        onInput={handleInput}
      />
      <datalist id={datalistId} data-bc-grid-editor-datalist="true">
        {options.map((option) => (
          <option
            key={editorOptionToString(option.value)}
            value={editorOptionToString(option.value)}
          >
            {option.label}
          </option>
        ))}
      </datalist>
      <span id={statusId} style={visuallyHiddenStyle} aria-live="polite">
        {loading ? "Loading suggestions" : `${options.length} suggestions available`}
      </span>
      {error ? (
        <span id={errorId} style={visuallyHiddenStyle}>
          {error}
        </span>
      ) : null}
    </>
  )
}
