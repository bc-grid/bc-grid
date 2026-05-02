import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react"
import { type EditorOption, editorOptionToString, visuallyHiddenStyle } from "../chrome"

/**
 * shadcn-native Combobox primitive in *search* / *autocomplete* mode
 * — replaces the v0.1 `<input list>` / `<datalist>` shell. Audit P0-4
 * (synthesis P0-4 closes here).
 *
 * Why a separate file from the button-trigger Combobox:
 *
 *   - The trigger is a text input (free-text editing), not a button.
 *     Selection happens by clicking an option OR by leaving free text
 *     in the input — keyboard semantics, focus model, and value
 *     plumbing all diverge from the single/multi flavours.
 *   - Async option resolution. `fetchOptions(query, signal)` runs on
 *     every keystroke (debounced 200 ms) with `AbortController` race
 *     handling. Loading / empty states are rendered inline, not via
 *     a polite live region — sighted users need to see them per
 *     audit P0-4.
 *   - `prepareResult` consumption. The state machine carries
 *     `prepareResult` through `Preparing → Editing` so the editor
 *     can preload the first page of options before mount and paint
 *     the dropdown with results on first frame instead of a blank
 *     "Loading…" flash. Audit P1-W3-2.
 *
 * Free-text passthrough. The committed value is whatever's in the
 * input at commit time (string). Picking an option replaces the input
 * with the option's label, so the commit value is the option label.
 * Consumers wire `column.valueParser` to convert label → typed value
 * (matches the v0.1 autocomplete contract — non-breaking upgrade).
 *
 * The dropdown subtree is marked `data-bc-grid-editor-portal="true"`
 * so the editor portal's document-level pointerdown click-outside
 * handler ignores option clicks.
 */

export type SearchComboboxFetchOptions = (
  query: string,
  signal: AbortSignal,
) => Promise<readonly EditorOption[]>

export interface SearchComboboxRequestController {
  abort: () => void
  request: (query: string) => AbortSignal | null
}

/**
 * Race-safe fetch wrapper used by `SearchCombobox`. Each `request`
 * cancels the prior in-flight controller before issuing a new one;
 * the `abort` method releases on unmount. Pure (no React) so the
 * supersedure semantics can be unit-tested without a DOM.
 */
export function createSearchComboboxRequestController({
  fetchOptions,
  setLoading,
  setOptions,
}: {
  fetchOptions: SearchComboboxFetchOptions | undefined
  setLoading: (loading: boolean) => void
  setOptions: (options: readonly EditorOption[]) => void
}): SearchComboboxRequestController {
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
          // Aborted or fetch errored: leave existing suggestions in
          // place so the cell stays editable. Free-text passthrough
          // still works — the consumer's `valueParser` decides.
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

const DEBOUNCE_MS = 200

export interface SearchComboboxProps {
  /** Initial cell value. Seeds the input on mount unless `seedKey` is set. */
  initialValue: unknown
  /** Printable seed key from the activation event, if any. Replaces the input value on mount. */
  seedKey?: string | undefined
  /** Validation error string. Triggers error-state chrome. */
  error?: string | undefined
  /** True while async validation / commit is in flight. Disables input. */
  pending?: boolean | undefined
  /** Column-level required marker. Surfaced as `aria-required`. Audit P1-W3-7. */
  required?: boolean | undefined
  /** Column-level read-only marker. Surfaced as `aria-readonly`. Audit P1-W3-7. */
  readOnly?: boolean | undefined
  /** Column-level disabled marker. Surfaced as `aria-disabled` (additive to `pending`). Audit P1-W3-7. */
  disabled?: boolean | undefined
  /** Accessible name for the input. */
  accessibleName?: string | undefined
  /** Handed back to the framework. The portal calls `focusRef.current?.focus()` on mount. */
  focusRef?: { current: HTMLElement | null } | undefined
  /** Called when the user picks an option (the input is replaced with the option's label). */
  onSelect: (option: EditorOption) => void
  /**
   * Async option resolver. Runs on every keystroke (debounced 200 ms)
   * with an `AbortSignal` so superseded fetches drop their results.
   * Omit to disable async loading entirely (pure free-text editor).
   */
  fetchOptions?: SearchComboboxFetchOptions | undefined
  /**
   * Pre-resolved initial options handed in by the editor's `prepare`
   * hook. When set, the dropdown paints with these on first frame
   * before the first `fetchOptions` keystroke fires. Audit P1-W3-2.
   */
  initialOptions?: readonly EditorOption[] | undefined
  /**
   * Discriminator surfaced as `data-bc-grid-editor-kind` on the input.
   * Defaults to `"autocomplete"` since this primitive is the migration
   * target for the autocomplete editor.
   */
  kind?: string
}

const bcGridComboboxValueKey = "__bcGridComboboxValue" as const

type BcGridComboboxInput = HTMLInputElement & {
  [bcGridComboboxValueKey]?: unknown
}

export function SearchCombobox({
  initialValue,
  seedKey,
  error,
  pending,
  required,
  readOnly,
  disabled,
  accessibleName,
  focusRef,
  onSelect,
  fetchOptions,
  initialOptions,
  kind = "autocomplete",
}: SearchComboboxProps): ReactNode {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const listboxRef = useRef<HTMLDivElement | null>(null)
  const listboxId = useId()
  const errorId = useId()
  const statusId = useId()

  const seeded = seedKey != null ? seedKey : initialValue == null ? "" : String(initialValue)

  const [options, setOptions] = useState<readonly EditorOption[]>(() => initialOptions ?? [])
  const [loading, setLoading] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [open, setOpen] = useState(true)

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const requestControllerRef = useRef<SearchComboboxRequestController | null>(null)
  if (!requestControllerRef.current) {
    requestControllerRef.current = createSearchComboboxRequestController({
      fetchOptions,
      setLoading,
      setOptions,
    })
  }

  const queryFor = useCallback(
    (query: string, debounce: boolean) => {
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
    },
    [fetchOptions],
  )

  // Hand the input back to the framework via focusRef in
  // useLayoutEffect — same race fix as text/number editors.
  useLayoutEffect(() => {
    if (focusRef && inputRef.current) {
      focusRef.current = inputRef.current
    }
    return () => {
      if (focusRef) focusRef.current = null
    }
  }, [focusRef])

  // Stash the *current input value* on the input element so
  // `readEditorInputValue` (which dispatches on tagName) returns
  // `input.value` directly — no extra plumbing needed for
  // string-passthrough commits. The custom property below is set so
  // future contracts (typed commit, "free-text" sentinels) can
  // cleanly evolve without renaming the read path. Today the
  // framework just reads `input.value`.
  useLayoutEffect(() => {
    const input = inputRef.current
    if (!input) return
    ;(input as BcGridComboboxInput)[bcGridComboboxValueKey] = input.value
  }, [])

  // First-paint fetch. Skipped when `initialOptions` came from
  // `prepareResult` so the prepare-then-mount preload pattern doesn't
  // double-fetch on activation.
  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-only — later fetches go through onInput
  useLayoutEffect(() => {
    inputRef.current?.focus({ preventScroll: true })
    if (initialOptions === undefined) {
      const initialQuery =
        seedKey != null ? seedKey : initialValue == null ? "" : String(initialValue)
      queryFor(initialQuery, false)
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      requestControllerRef.current?.abort()
    }
  }, [])

  const handleInput = (event: FormEvent<HTMLInputElement>) => {
    const value = event.currentTarget.value
    ;(event.currentTarget as BcGridComboboxInput)[bcGridComboboxValueKey] = value
    setActiveIndex(-1)
    queryFor(value, true)
    if (!open) setOpen(true)
  }

  const pickOption = useCallback(
    (option: EditorOption) => {
      const input = inputRef.current
      if (input) {
        input.value = option.label
        ;(input as BcGridComboboxInput)[bcGridComboboxValueKey] = option.label
      }
      onSelect(option)
    },
    [onSelect],
  )

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (pending) return
    if (event.key === "ArrowDown") {
      event.preventDefault()
      setOpen(true)
      setActiveIndex((prev) => Math.min(prev + 1, options.length - 1))
      return
    }
    if (event.key === "ArrowUp") {
      event.preventDefault()
      setOpen(true)
      setActiveIndex((prev) => Math.max(prev - 1, -1))
      return
    }
    if (event.key === "Home" && options.length > 0) {
      event.preventDefault()
      setOpen(true)
      setActiveIndex(0)
      return
    }
    if (event.key === "End" && options.length > 0) {
      event.preventDefault()
      setOpen(true)
      setActiveIndex(options.length - 1)
      return
    }
    if (event.key === "Enter") {
      // Pick the highlighted option if any; otherwise let the editor
      // portal wrapper see the Enter and commit the input value
      // verbatim. preventDefault only when we picked.
      if (open && activeIndex >= 0) {
        const opt = options[activeIndex]
        if (opt) pickOption(opt)
      }
      // Don't preventDefault — the wrapper's keydown handler will
      // commit the (possibly-replaced) input value with `down`
      // moveOnSettle, matching the v0.1 contract.
      return
    }
  }

  // Sync DOM scroll so the active option stays in view.
  useEffect(() => {
    if (!open || activeIndex < 0) return
    const listbox = listboxRef.current
    if (!listbox) return
    const active = listbox.querySelector<HTMLDivElement>(`[data-option-index="${activeIndex}"]`)
    active?.scrollIntoView({ block: "nearest" })
  }, [activeIndex, open])

  const activeOptionId = activeIndex >= 0 ? `${listboxId}-opt-${activeIndex}` : undefined
  const showEmpty = open && !loading && options.length === 0
  const seeded2 = typeof seedKey === "string" && [...seedKey].length === 1

  return (
    <div className="bc-grid-editor-combobox bc-grid-editor-combobox-search">
      <input
        ref={inputRef}
        className="bc-grid-editor-input bc-grid-editor-combobox-trigger"
        type="text"
        defaultValue={seeded}
        disabled={pending}
        autoComplete="off"
        spellCheck={false}
        role="combobox"
        aria-invalid={error ? true : undefined}
        aria-required={required ? true : undefined}
        aria-readonly={readOnly ? true : undefined}
        aria-disabled={disabled || pending ? true : undefined}
        aria-label={accessibleName}
        aria-describedby={error ? `${errorId} ${statusId}` : statusId}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-activedescendant={activeOptionId}
        aria-busy={pending || loading ? true : undefined}
        data-bc-grid-editor-input="true"
        data-bc-grid-editor-kind={kind}
        data-bc-grid-editor-option-count={options.length}
        data-bc-grid-editor-state={pending ? "pending" : error ? "error" : "idle"}
        data-state={open ? "open" : "closed"}
        data-bc-grid-editor-loading={loading ? "true" : undefined}
        data-bc-grid-editor-seeded={seeded2 ? "true" : undefined}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
      />

      {open ? (
        <div
          ref={listboxRef}
          id={listboxId}
          // biome-ignore lint/a11y/useSemanticElements: <select> cannot render rich option content (swatch/icon) or async-loading state
          role="listbox"
          tabIndex={-1}
          aria-label={accessibleName}
          className="bc-grid-editor-combobox-listbox"
          data-bc-grid-editor-portal="true"
          data-state="open"
          data-side="bottom"
          data-align="start"
        >
          {loading && options.length === 0 ? (
            <div className="bc-grid-editor-combobox-empty" data-bc-grid-editor-loading-row="true">
              Loading…
            </div>
          ) : null}
          {options.map((option, index) => {
            const optionId = `${listboxId}-opt-${index}`
            const isActive = index === activeIndex
            return (
              <div
                key={editorOptionToString(option.value)}
                id={optionId}
                // biome-ignore lint/a11y/useSemanticElements: aria-activedescendant pattern; option focus stays on the input
                role="option"
                tabIndex={-1}
                aria-selected={isActive}
                data-option-index={index}
                data-active={isActive ? "true" : undefined}
                className="bc-grid-editor-combobox-option"
                onPointerDown={(event) => {
                  // pointer-down beats the portal's click-outside listener
                  event.preventDefault()
                  pickOption(option)
                }}
                onMouseEnter={() => setActiveIndex(index)}
              >
                {option.swatch ? (
                  <span
                    className="bc-grid-editor-combobox-option-swatch"
                    data-bc-grid-editor-swatch="true"
                    style={{ background: option.swatch }}
                    aria-hidden="true"
                  />
                ) : null}
                {option.icon ? (
                  <span className="bc-grid-editor-combobox-option-icon" aria-hidden="true">
                    {option.icon}
                  </span>
                ) : null}
                <span className="bc-grid-editor-combobox-option-label">{option.label}</span>
              </div>
            )
          })}
          {showEmpty ? <div className="bc-grid-editor-combobox-empty">No matches</div> : null}
        </div>
      ) : null}

      <span id={statusId} style={visuallyHiddenStyle} aria-live="polite">
        {loading ? "Loading suggestions" : `${options.length} suggestions available`}
      </span>
      {error ? (
        <span id={errorId} style={visuallyHiddenStyle}>
          {error}
        </span>
      ) : null}
    </div>
  )
}
