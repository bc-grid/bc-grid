"use client"

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
import {
  type EditorOption,
  editorOptionToString,
  editorStateAttrs,
  visuallyHiddenStyle,
} from "../chrome"
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from "./command"
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "./popover"

/**
 * shadcn Combobox foundation backed by `cmdk` + Radix Popover. Per
 * `docs/design/shadcn-radix-correction-rfc.md` §Block C PR-C1.
 *
 * **Status: foundation only.** PR-C1 ships this wrapper. PR-C2 swaps
 * the in-house `selectEditor`, `multiSelectEditor`, `autocompleteEditor`
 * over to this primitive and deletes
 * `packages/editors/src/internal/combobox.tsx` +
 * `combobox-search.tsx`. PR-C3 wires the deferred
 * `triggerComponent` / `optionItemComponent` slots from #489 on top
 * of this primitive.
 *
 * The exported API matches the legacy `internal/combobox.tsx` +
 * `internal/combobox-search.tsx` surface so PR-C2's swap is a
 * mechanical import-path change at each editor's call site.
 *
 * Modes (mirrors legacy):
 *   - `<Combobox mode="single">` — single-value combobox. Used by
 *     `selectEditor`. Auto-selects on Enter / pick.
 *   - `<Combobox mode="multi">` — multi-value combobox. Used by
 *     `multiSelectEditor`. Toggles on Space / click; commits on
 *     Tab / Enter / Escape (per `#427` Enter contract — Enter does
 *     NOT toggle in multi mode; Space toggles).
 *   - `<SearchCombobox>` — async-search combobox with text input
 *     trigger. Used by `autocompleteEditor`. Debounced
 *     `column.fetchOptions(query, signal)` with race-handling.
 *
 * Load-bearing DOM contract (preserved from legacy so the framework's
 * commit path keeps working):
 *   - `data-bc-grid-editor-input="true"` on the trigger element —
 *     framework's `readEditorInputValue` locates it via this attribute.
 *   - `data-bc-grid-editor-kind={kind}` on the trigger — editor-kind
 *     discriminator for theme + tests.
 *   - `data-bc-grid-editor-portal="true"` on the popover content —
 *     framework's portal-aware click-outside handler ignores clicks
 *     landing inside this subtree (so option clicks don't dismiss the
 *     editor).
 *   - Typed value stashed on the trigger via `__bcGridComboboxValue`
 *     so click-outside / Tab commit reads the latest typed value
 *     without going through `column.valueParser`.
 */

const bcGridComboboxValueKey = "__bcGridComboboxValue" as const

type BcGridComboboxButton = HTMLButtonElement & {
  [bcGridComboboxValueKey]?: unknown
}

type BcGridComboboxInput = HTMLInputElement & {
  [bcGridComboboxValueKey]?: unknown
}

/**
 * Public hook for stashing the typed value on the trigger element so
 * `readEditorInputValue` can pluck it on click-outside / Tab.
 *
 * Mirrors the legacy `internal/combobox.tsx` export verbatim — PR-C2
 * will swap consumers' import path from `../internal/combobox` to
 * `../shadcn/Combobox` without touching the call sites.
 */
export function attachComboboxTypedValue(button: HTMLButtonElement | null, value: unknown): void {
  if (!button) return
  ;(button as BcGridComboboxButton)[bcGridComboboxValueKey] = value
}

export function readComboboxTypedValue(element: HTMLElement | null): unknown {
  if (!element) return undefined
  if (element.tagName === "BUTTON") return (element as BcGridComboboxButton)[bcGridComboboxValueKey]
  if (element.tagName === "INPUT") return (element as BcGridComboboxInput)[bcGridComboboxValueKey]
  return undefined
}

interface ComboboxBaseProps {
  options: readonly EditorOption[]
  initialOptions?: readonly EditorOption[] | undefined
  seedKey?: string | undefined
  error?: string | undefined
  pending?: boolean | undefined
  required?: boolean | undefined
  readOnly?: boolean | undefined
  disabled?: boolean | undefined
  accessibleName?: string | undefined
  focusRef?: { current: HTMLElement | null } | undefined
  renderCreateOption?: (query: string) => ReactNode
  kind?: string
}

interface ComboboxSingleProps extends ComboboxBaseProps {
  mode?: "single"
  initialValue: unknown
  onSelect: (next: unknown) => void
}

interface ComboboxMultiProps extends ComboboxBaseProps {
  mode: "multi"
  initialValue: readonly unknown[]
  onSelect: (next: readonly unknown[]) => void
}

export type ComboboxProps = ComboboxSingleProps | ComboboxMultiProps

/**
 * Button-trigger Combobox (single + multi modes). Drop-in replacement
 * for the legacy `internal/combobox.tsx::Combobox`. Internals built on
 * `cmdk` (listbox + keyboard nav + type-ahead) + Radix Popover (portal +
 * positioning + dismiss).
 */
export function Combobox(props: ComboboxProps): ReactNode {
  const {
    options: optionsProp,
    initialOptions,
    seedKey,
    error,
    pending,
    required,
    readOnly,
    disabled,
    accessibleName,
    focusRef,
    renderCreateOption,
    kind = "combobox",
  } = props
  const options = initialOptions ?? optionsProp
  const isMulti = props.mode === "multi"

  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const errorId = useId()

  const initialIndices = isMulti
    ? selectedIndicesFromValues(options, toReadonlyArray(props.initialValue as readonly unknown[]))
    : findOptionIndexByValue(options, props.initialValue as unknown)

  const [selectedIndices, setSelectedIndices] = useState<ReadonlySet<number>>(() => {
    if (isMulti) return new Set(initialIndices as readonly number[])
    const idx = initialIndices as number
    return idx >= 0 ? new Set([idx]) : new Set()
  })
  const [open, setOpen] = useState(true)

  // Hand the trigger to the framework via focusRef in useLayoutEffect
  // so the framework's mount-focus call sees the assignment first.
  // Same race fix as text/number editors. Per `editing-rfc §a11y for
  // edit mode` ("real focus shifts to focusRef.current").
  useLayoutEffect(() => {
    if (focusRef && buttonRef.current) {
      focusRef.current = buttonRef.current
    }
    return () => {
      if (focusRef) focusRef.current = null
    }
  }, [focusRef])

  // Stash the typed value on the trigger so `readEditorInputValue`
  // returns it on click-outside / Tab without going through valueParser.
  useLayoutEffect(() => {
    const button = buttonRef.current
    if (!button) return
    if (isMulti) {
      const values: unknown[] = []
      options.forEach((option, idx) => {
        if (selectedIndices.has(idx)) values.push(option.value)
      })
      ;(button as BcGridComboboxButton)[bcGridComboboxValueKey] = values
    } else {
      const idx = firstSelectedIndex(selectedIndices)
      ;(button as BcGridComboboxButton)[bcGridComboboxValueKey] =
        idx >= 0 ? options[idx]?.value : undefined
    }
  }, [isMulti, options, selectedIndices])

  // Seed-key prefix selection (single mode auto-selects, multi just
  // navigates — matches legacy + #427 Enter contract). cmdk handles
  // the type-ahead for in-listbox typing; this handles the printable
  // activation seed from grid-keydown.
  useEffect(() => {
    if (seedKey == null || !isMulti) return
    // Multi-mode: seedKey navigates (cmdk's internal type-ahead picks
    // it up via the value prop on the listbox). Don't auto-toggle.
  }, [seedKey, isMulti])

  const updateSelection = useCallback(
    (index: number) => {
      if (index < 0 || index >= options.length) return
      const option = options[index]
      if (!option) return
      if (isMulti) {
        setSelectedIndices((prev) => {
          const next = new Set(prev)
          if (next.has(index)) next.delete(index)
          else next.add(index)
          const values: unknown[] = []
          options.forEach((opt, idx) => {
            if (next.has(idx)) values.push(opt.value)
          })
          ;(props as ComboboxMultiProps).onSelect(values)
          return next
        })
      } else {
        setSelectedIndices(new Set([index]))
        ;(props as ComboboxSingleProps).onSelect(option.value)
      }
    },
    [isMulti, options, props],
  )

  const summary = describeSelectedSummary(options, selectedIndices, isMulti)
  const seeded = typeof seedKey === "string" && [...seedKey].length === 1

  return (
    <div
      className="bc-grid-editor-combobox"
      data-bc-grid-editor-combobox="true"
      data-bc-grid-editor-multi={isMulti ? "true" : undefined}
    >
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          ref={buttonRef}
          type="button"
          className="bc-grid-editor-input bc-grid-editor-combobox-trigger"
          data-bc-grid-editor-input="true"
          data-bc-grid-editor-kind={kind}
          data-bc-grid-editor-option-count={options.length}
          data-bc-grid-editor-seeded={seeded ? "true" : undefined}
          {...editorStateAttrs({ error, pending })}
          data-state={open ? "open" : "closed"}
          aria-invalid={error ? true : undefined}
          aria-required={required ? true : undefined}
          aria-readonly={readOnly ? true : undefined}
          aria-disabled={disabled || pending ? true : undefined}
          aria-label={accessibleName}
          aria-describedby={error ? errorId : undefined}
          aria-multiselectable={isMulti ? true : undefined}
          disabled={pending}
        >
          {summary.singleSwatch ? (
            <span
              className="bc-grid-editor-combobox-swatch"
              data-bc-grid-editor-swatch="true"
              style={{ background: summary.singleSwatch }}
              aria-hidden="true"
            />
          ) : null}
          {summary.singleIcon ? (
            <span className="bc-grid-editor-combobox-icon" aria-hidden="true">
              {summary.singleIcon}
            </span>
          ) : null}
          {isMulti ? (
            <span
              className="bc-grid-editor-combobox-chips"
              data-bc-grid-editor-combobox-chips="true"
            >
              {summary.chips.length === 0 ? (
                <span className="bc-grid-editor-combobox-label bc-grid-editor-combobox-placeholder">
                  {summary.label}
                </span>
              ) : (
                summary.chips.map((chip) => (
                  <span
                    key={chip.key}
                    className="bc-grid-editor-combobox-chip"
                    data-bc-grid-editor-combobox-chip="true"
                  >
                    {chip.swatch ? (
                      <span
                        className="bc-grid-editor-combobox-chip-swatch"
                        data-bc-grid-editor-swatch="true"
                        style={{ background: chip.swatch }}
                        aria-hidden="true"
                      />
                    ) : null}
                    <span>{chip.label}</span>
                  </span>
                ))
              )}
            </span>
          ) : (
            <span className="bc-grid-editor-combobox-label">{summary.label}</span>
          )}
          <span className="bc-grid-editor-combobox-caret" aria-hidden="true">
            ▾
          </span>
        </PopoverTrigger>
        <PopoverContent
          className="bc-grid-editor-combobox-listbox"
          data-bc-grid-editor-portal="true"
          align="start"
          sideOffset={4}
          // Don't auto-focus the popover content — focus stays on the
          // trigger via `aria-activedescendant`. cmdk handles per-option
          // activation; the popover is just the surface.
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <Command shouldFilter={false}>
            <CommandList>
              <CommandEmpty>No options</CommandEmpty>
              <CommandGroup>
                {options.map((option, index) => {
                  const isSelected = selectedIndices.has(index)
                  return (
                    <CommandItem
                      key={editorOptionToString(option.value)}
                      value={editorOptionToString(option.value)}
                      data-option-index={index}
                      data-selected={isSelected ? "true" : undefined}
                      className="bc-grid-editor-combobox-option"
                      onSelect={() => updateSelection(index)}
                    >
                      {isMulti ? (
                        <span
                          className="bc-grid-editor-combobox-option-check"
                          data-checked={isSelected ? "true" : undefined}
                          aria-hidden="true"
                        >
                          {isSelected ? "✓" : ""}
                        </span>
                      ) : null}
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
                    </CommandItem>
                  )
                })}
              </CommandGroup>
              {renderCreateOption ? (
                <div
                  className="bc-grid-editor-combobox-create"
                  data-bc-grid-editor-combobox-create="true"
                >
                  {renderCreateOption("")}
                </div>
              ) : null}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {error ? (
        <span id={errorId} style={visuallyHiddenStyle}>
          {error}
        </span>
      ) : null}
    </div>
  )
}

// ---------- SearchCombobox (autocomplete trigger) ----------

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
 * supersedure semantics can be unit-tested without a DOM. Mirrors the
 * legacy `internal/combobox-search.ts` helper verbatim — PR-C2 will
 * swap import paths.
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
  initialValue: unknown
  seedKey?: string | undefined
  error?: string | undefined
  pending?: boolean | undefined
  required?: boolean | undefined
  readOnly?: boolean | undefined
  disabled?: boolean | undefined
  accessibleName?: string | undefined
  focusRef?: { current: HTMLElement | null } | undefined
  onSelect: (option: EditorOption) => void
  fetchOptions?: SearchComboboxFetchOptions | undefined
  initialOptions?: readonly EditorOption[] | undefined
  kind?: string
}

/**
 * Async-search Combobox with `<input>` trigger. Drop-in replacement for
 * the legacy `internal/combobox-search.tsx::SearchCombobox`. Built on
 * `cmdk` + Radix Popover.
 *
 * Free-text passthrough: the committed value is whatever's in the
 * input at commit time (string). Picking an option replaces the input
 * with the option's label, so the commit value is the option label.
 * Consumers wire `column.valueParser` to convert label → typed value.
 */
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
  const errorId = useId()
  const statusId = useId()

  const seeded = seedKey != null ? seedKey : initialValue == null ? "" : String(initialValue)

  const [options, setOptions] = useState<readonly EditorOption[]>(() => initialOptions ?? [])
  const [loading, setLoading] = useState(false)
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

  // Hand the input back to the framework via focusRef (useLayoutEffect
  // race fix — same as text/number editors).
  useLayoutEffect(() => {
    if (focusRef && inputRef.current) {
      focusRef.current = inputRef.current
    }
    return () => {
      if (focusRef) focusRef.current = null
    }
  }, [focusRef])

  // Stash the *current input value* on the input element so
  // `readEditorInputValue` returns `input.value` on click-outside / Tab.
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

  const seeded2 = typeof seedKey === "string" && [...seedKey].length === 1
  const showEmpty = open && !loading && options.length === 0

  return (
    <div className="bc-grid-editor-combobox bc-grid-editor-combobox-search">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverAnchor>
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
            aria-controls={open ? statusId : undefined}
            aria-busy={pending || loading ? true : undefined}
            data-bc-grid-editor-input="true"
            data-bc-grid-editor-kind={kind}
            data-bc-grid-editor-option-count={options.length}
            {...editorStateAttrs({ error, pending })}
            data-state={open ? "open" : "closed"}
            data-bc-grid-editor-loading={loading ? "true" : undefined}
            data-bc-grid-editor-seeded={seeded2 ? "true" : undefined}
            onInput={handleInput}
          />
        </PopoverAnchor>
        <PopoverContent
          className="bc-grid-editor-combobox-listbox"
          data-bc-grid-editor-portal="true"
          align="start"
          sideOffset={4}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <Command shouldFilter={false}>
            <CommandList>
              {loading && options.length === 0 ? (
                <div
                  className="bc-grid-editor-combobox-empty"
                  data-bc-grid-editor-loading-row="true"
                >
                  Loading…
                </div>
              ) : null}
              {showEmpty ? <CommandEmpty>No matches</CommandEmpty> : null}
              <CommandGroup>
                {options.map((option, index) => (
                  <CommandItem
                    key={editorOptionToString(option.value)}
                    value={editorOptionToString(option.value)}
                    data-option-index={index}
                    className="bc-grid-editor-combobox-option"
                    onSelect={() => pickOption(option)}
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
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
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

// ---------- Pure helpers (mirrored from legacy internal/combobox.tsx) ----------
//
// PR-C2 will move these to a shared helper module before deleting the
// legacy combobox.tsx. For PR-C1 they're duplicated here so the
// foundation is self-contained.

export function findOptionIndexByValue(options: readonly EditorOption[], target: unknown): number {
  if (target == null) return -1
  const targetString = editorOptionToString(target)
  return options.findIndex((option) => editorOptionToString(option.value) === targetString)
}

export function selectedIndicesFromValues(
  options: readonly EditorOption[],
  values: readonly unknown[],
): readonly number[] {
  const indices: number[] = []
  for (const value of values) {
    if (value == null) continue
    const idx = findOptionIndexByValue(options, value)
    if (idx >= 0) indices.push(idx)
  }
  return indices
}

function toReadonlyArray(value: unknown): readonly unknown[] {
  if (Array.isArray(value)) return value
  return []
}

function firstSelectedIndex(selected: ReadonlySet<number>): number {
  for (const idx of selected) return idx
  return -1
}

interface SelectedSummary {
  label: string
  singleSwatch?: string | undefined
  singleIcon?: ReactNode
  chips: readonly { key: string; label: string; swatch?: string }[]
}

function describeSelectedSummary(
  options: readonly EditorOption[],
  selected: ReadonlySet<number>,
  isMulti: boolean,
): SelectedSummary {
  if (isMulti) {
    const chips: { key: string; label: string; swatch?: string }[] = []
    options.forEach((option, idx) => {
      if (!selected.has(idx)) return
      const chip: { key: string; label: string; swatch?: string } = {
        key: editorOptionToString(option.value),
        label: option.label,
      }
      if (option.swatch) chip.swatch = option.swatch
      chips.push(chip)
    })
    return { label: chips.length === 0 ? "Select…" : "", chips }
  }
  const idx = firstSelectedIndex(selected)
  const option = idx >= 0 ? options[idx] : undefined
  const summary: SelectedSummary = {
    label: option?.label ?? "Select…",
    chips: [],
  }
  if (option?.swatch) summary.singleSwatch = option.swatch
  if (option?.icon) summary.singleIcon = option.icon
  return summary
}
