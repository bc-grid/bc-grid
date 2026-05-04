"use client"

import {
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  useCallback,
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
import { Checkbox } from "./checkbox"
import type {
  ComboboxSlotOptions,
  ComboboxTriggerSlotProps,
  SearchComboboxSlotOptions,
} from "./comboboxSlots"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "./command"
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "./popover"

/**
 * shadcn Combobox primitive backed by `cmdk` + Radix Popover. Per
 * `docs/coordination/v07-pr-c2-design-decisions.md` (PR-C2 design
 * decisions ratified by Claude coordinator).
 *
 * Modes:
 *   - `<Combobox mode="single">` — single-value combobox. Used by
 *     `selectEditor`. cmdk's default Enter selects + commits.
 *   - `<Combobox mode="multi">` — multi-value combobox. Used by
 *     `multiSelectEditor`. Each CommandItem has an inline `<Checkbox>`;
 *     Tab cycles to checkbox + Space toggles via Radix Checkbox native
 *     handler. cmdk's Enter is preventDefault'd so #427's commit-on-Enter
 *     contract holds (multi-mode Enter NEVER toggles).
 *   - `<SearchCombobox>` — async-search combobox where the trigger is
 *     the CommandInput itself. Used by `autocompleteEditor`. Debounced
 *     `column.fetchOptions(query, signal)` with race-handling.
 *
 * Focus model (per Q1 ratified decision):
 *   - `focusRef` points at the `<CommandInput>` inside the popover
 *     content so cmdk's keyboard handler runs natively (type-ahead,
 *     ArrowUp/Down on aria-activedescendant).
 *   - The framework's `editor.getValue?(focusRef.current)` hook climbs
 *     from the CommandInput up to the popover root and reads
 *     `data-bcgrid-combobox-value` (a JSON-encoded data attribute the
 *     wrapper updates on every selection change).
 *
 * Load-bearing DOM contract:
 *   - `data-bc-grid-editor-input="true"` on the trigger button (single +
 *     multi modes) or on the CommandInput (search mode) — framework's
 *     `findActiveEditorInput` locates the editor via this attribute.
 *   - `data-bc-grid-editor-kind={kind}` on the trigger — editor-kind
 *     discriminator for theme + tests.
 *   - `data-bc-grid-editor-portal="true"` on the popover content —
 *     framework's portal-aware click-outside handler ignores clicks
 *     here (so option clicks don't dismiss the editor).
 *   - `data-bcgrid-combobox-value={JSON}` on the popover content —
 *     `editor.getValue?` reads this to commit the typed selection.
 *   - `data-bcgrid-combobox-root="true"` on the popover content —
 *     stable ancestor selector for `getValue?`'s `.closest()` walk.
 */

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
  /**
   * Optional shadcn-native slot overrides for the trigger button + per-option
   * row. Per `docs/design/shadcn-radix-correction-rfc.md` §Block C PR-C3
   * (closes the deferred select-batch slot work from #489).
   */
  triggerComponent?: ComboboxSlotOptions["triggerComponent"]
  optionItemComponent?: ComboboxSlotOptions["optionItemComponent"]
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
 * Helper for combobox editors' `getValue?` hook. Climbs from the
 * focused `<CommandInput>` up to the popover root and parses the
 * JSON-encoded value stamped there.
 */
export function readComboboxValueFromFocusEl(focusEl: HTMLElement | null): unknown {
  if (!focusEl) return undefined
  const root = focusEl.closest<HTMLElement>("[data-bcgrid-combobox-root]")
  if (!root) return undefined
  const raw = root.getAttribute("data-bcgrid-combobox-value")
  if (raw == null) return undefined
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

/**
 * Button-trigger Combobox (single + multi modes).
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
    triggerComponent: TriggerComponent,
    optionItemComponent: OptionItemComponent,
  } = props
  const options = initialOptions ?? optionsProp
  const isMulti = props.mode === "multi"

  const inputRef = useRef<HTMLInputElement | null>(null)
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

  // cmdk active value — drives aria-activedescendant + which item shows
  // as cmdk-selected. Initialise to the seedKey-matched option, falling
  // back to the first selected option, falling back to the first option.
  const [cmdkValue, setCmdkValue] = useState<string | undefined>(() => {
    const seedIdx = findOptionIndexBySeed(options, seedKey)
    if (seedIdx >= 0) return editorOptionToString(options[seedIdx]?.value)
    const first = firstSelectedIndex(
      isMulti ? new Set(initialIndices as readonly number[]) : new Set(),
    )
    if (!isMulti && (initialIndices as number) >= 0) {
      return editorOptionToString(options[initialIndices as number]?.value)
    }
    if (first >= 0) return editorOptionToString(options[first]?.value)
    return options[0] ? editorOptionToString(options[0].value) : undefined
  })

  // Hand the CommandInput to the framework via focusRef so the editor
  // portal's mount-focus call lands on the input — cmdk's keyboard
  // handler runs natively from there. useLayoutEffect race fix matches
  // text/number editors (children commit phase before the framework's
  // parent useLayoutEffect runs `focusRef.current?.focus()`).
  useLayoutEffect(() => {
    if (focusRef && inputRef.current) {
      focusRef.current = inputRef.current
    }
    return () => {
      if (focusRef) focusRef.current = null
    }
  }, [focusRef])

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

  // Compute the typed value for `data-bcgrid-combobox-value` so the
  // editor's `getValue?` hook can read it during commit.
  const typedValueJson = (() => {
    if (isMulti) {
      const values: unknown[] = []
      options.forEach((option, idx) => {
        if (selectedIndices.has(idx)) values.push(option.value)
      })
      return JSON.stringify(values)
    }
    const idx = firstSelectedIndex(selectedIndices)
    return idx >= 0 ? JSON.stringify(options[idx]?.value) : JSON.stringify(undefined)
  })()

  const summary = describeSelectedSummary(options, selectedIndices, isMulti)
  const seeded = typeof seedKey === "string" && [...seedKey].length === 1

  // Multi-mode Enter contract per #427 + Q2 ratified decision: cmdk's
  // default Enter dispatches an item-select event (toggles in our
  // multi-mode onSelect). preventDefault() here skips cmdk's switch so
  // the Enter still bubbles up to the editor portal's keydown handler
  // → commit. Single-mode keeps cmdk's default (Enter selects + commits).
  const handleCommandKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" && isMulti) {
      event.preventDefault()
      // Don't return — let cmdk's switch be skipped (defaultPrevented
      // gate), and let React continue bubbling to the editor portal's
      // handleKeyDown, which decodes Enter as commit intent.
    }
  }

  // Trigger inner content (swatch + icon + label / chips + caret).
  // Computed once and either spread into the framework's default
  // <button> or handed to the consumer's `triggerComponent` as
  // `children`. Per PR-C3 (`v07-shadcn-editor-render-prop-slots`).
  const triggerChildren: ReactNode = (
    <>
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
        <span className="bc-grid-editor-combobox-chips" data-bc-grid-editor-combobox-chips="true">
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
    </>
  )

  // Props the framework's default button receives — these are
  // load-bearing for the framework's commit + ARIA paths. The
  // consumer's `triggerComponent` MUST spread them onto its inner
  // `<button>` element. Ref is injected by Radix Popover.Trigger
  // via the asChild Slot mechanism.
  const triggerProps: Omit<ComboboxTriggerSlotProps, "children"> = {
    className: "bc-grid-editor-input bc-grid-editor-combobox-trigger",
    "data-bc-grid-editor-input": "true",
    "data-bc-grid-editor-kind": kind,
    "data-bc-grid-editor-option-count": options.length,
    "data-bc-grid-editor-seeded": seeded ? "true" : undefined,
    ...editorStateAttrs({ error, pending }),
    "data-state": open ? "open" : "closed",
    "aria-invalid": error ? true : undefined,
    "aria-required": required ? true : undefined,
    "aria-readonly": readOnly ? true : undefined,
    "aria-disabled": disabled || pending ? true : undefined,
    "aria-label": accessibleName,
    "aria-describedby": error ? errorId : undefined,
    "aria-multiselectable": isMulti ? true : undefined,
    disabled: pending,
    open,
    isMulti,
  }
  // Default `<button>` render needs the DOM-relevant subset only.
  // `open` + `isMulti` are slot-state convenience for consumer
  // components — they shouldn't leak as DOM attributes.
  const { open: _open, isMulti: _isMulti, ...buttonDomProps } = triggerProps

  return (
    <div
      className="bc-grid-editor-combobox"
      data-bc-grid-editor-combobox="true"
      data-bc-grid-editor-multi={isMulti ? "true" : undefined}
    >
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          {TriggerComponent ? (
            <TriggerComponent {...(triggerProps as ComboboxTriggerSlotProps)}>
              {triggerChildren}
            </TriggerComponent>
          ) : (
            <button type="button" role="combobox" {...buttonDomProps}>
              {triggerChildren}
            </button>
          )}
        </PopoverTrigger>
        <PopoverContent
          className="bc-grid-editor-combobox-listbox"
          data-bc-grid-editor-portal="true"
          data-bcgrid-combobox-root="true"
          data-bcgrid-combobox-value={typedValueJson}
          align="start"
          sideOffset={4}
          // Don't auto-focus the popover content's first focusable —
          // we route focus to the CommandInput via focusRef + Radix's
          // own onOpenAutoFocus.
        >
          <Command
            shouldFilter={true}
            {...(cmdkValue !== undefined ? { value: cmdkValue } : {})}
            onValueChange={setCmdkValue}
            onKeyDown={handleCommandKeyDown}
          >
            <CommandInput
              ref={inputRef}
              placeholder={accessibleName ? `Search ${accessibleName.toLowerCase()}` : "Search…"}
              autoFocus
            />
            <CommandList>
              <CommandEmpty>No options</CommandEmpty>
              <CommandGroup>
                {options.map((option, index) => {
                  const isSelected = selectedIndices.has(index)
                  // Default option chrome (multi-mode checkbox + swatch +
                  // icon + label). Either spread into the framework's
                  // CommandItem or handed to the consumer's
                  // `optionItemComponent` as `children` (PR-C3 slot).
                  const optionChildren: ReactNode = (
                    <>
                      {isMulti ? (
                        <Checkbox
                          checked={isSelected}
                          tabIndex={-1}
                          aria-hidden="true"
                          className="mr-2"
                        />
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
                    </>
                  )
                  return (
                    <CommandItem
                      key={editorOptionToString(option.value)}
                      value={editorOptionToString(option.value)}
                      data-option-index={index}
                      data-bcgrid-selected={isSelected ? "true" : undefined}
                      className="bc-grid-editor-combobox-option"
                      onSelect={() => updateSelection(index)}
                    >
                      {OptionItemComponent ? (
                        <OptionItemComponent
                          option={option}
                          isActive={false}
                          isSelected={isSelected}
                          isMulti={isMulti}
                        >
                          {optionChildren}
                        </OptionItemComponent>
                      ) : (
                        optionChildren
                      )}
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
 * the `abort` method releases on unmount.
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
          // place so the cell stays editable.
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
  /**
   * Optional shadcn-native slot overrides for the input shell + per-option
   * row. Per `docs/design/shadcn-radix-correction-rfc.md` §Block C PR-C3.
   */
  inputComponent?: SearchComboboxSlotOptions["inputComponent"]
  optionItemComponent?: SearchComboboxSlotOptions["optionItemComponent"]
}

/**
 * Async-search Combobox where the trigger IS the CommandInput. The
 * input is anchored via Radix Popover so the dropdown stays anchored
 * to the input position. Free-text passthrough — the committed value
 * is whatever's in the input at commit time.
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
  inputComponent: InputComponent,
  optionItemComponent: OptionItemComponent,
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

  // Hand the input back to the framework via focusRef.
  useLayoutEffect(() => {
    if (focusRef && inputRef.current) {
      focusRef.current = inputRef.current
    }
    return () => {
      if (focusRef) focusRef.current = null
    }
  }, [focusRef])

  // First-paint fetch. Skipped when `initialOptions` came from
  // `prepareResult`.
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
    queryFor(value, true)
    if (!open) setOpen(true)
  }

  const pickOption = useCallback(
    (option: EditorOption) => {
      const input = inputRef.current
      if (input) {
        input.value = option.label
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
        <PopoverAnchor asChild>
          {InputComponent ? (
            <InputComponent
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
              aria-busy={pending || loading ? true : undefined}
              data-bc-grid-editor-input="true"
              data-bc-grid-editor-kind={kind}
              data-bc-grid-editor-option-count={options.length}
              {...editorStateAttrs({ error, pending })}
              data-state={open ? "open" : "closed"}
              data-bc-grid-editor-loading={loading ? "true" : undefined}
              data-bc-grid-editor-seeded={seeded2 ? "true" : undefined}
              open={open}
              loading={loading}
              onInput={handleInput}
            />
          ) : (
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
          )}
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
                {options.map((option, index) => {
                  const optionChildren: ReactNode = (
                    <>
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
                    </>
                  )
                  return (
                    <CommandItem
                      key={editorOptionToString(option.value)}
                      value={editorOptionToString(option.value)}
                      data-option-index={index}
                      className="bc-grid-editor-combobox-option"
                      onSelect={() => pickOption(option)}
                    >
                      {OptionItemComponent ? (
                        <OptionItemComponent
                          option={option}
                          isActive={false}
                          isSelected={false}
                          isMulti={false}
                        >
                          {optionChildren}
                        </OptionItemComponent>
                      ) : (
                        optionChildren
                      )}
                    </CommandItem>
                  )
                })}
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

// ---------- Pure helpers ----------

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

function findOptionIndexBySeed(
  options: readonly EditorOption[],
  seedKey: string | undefined,
): number {
  if (typeof seedKey !== "string" || [...seedKey].length !== 1 || seedKey < " ") return -1
  const query = seedKey.toLocaleLowerCase()
  return options.findIndex((option) => {
    const label = option.label.toLocaleLowerCase()
    const value = editorOptionToString(option.value).toLocaleLowerCase()
    return label.startsWith(query) || value.startsWith(query)
  })
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
