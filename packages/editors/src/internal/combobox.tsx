import {
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

/**
 * shadcn-native Combobox primitive used by the v0.5 lookup editor
 * migrations (`select`, `multi-select`; `autocomplete` lives in
 * `combobox-search.tsx` since its trigger is a text input rather than
 * a button).
 *
 * Replaces the native `<select>` shells the editing-rfc originally
 * specified. Audit P0-4 / synthesis P0-4. Built on the repo's own
 * popup conventions (data-state / data-side / data-align +
 * data-bc-grid-editor-portal marker for portal-aware click-outside)
 * — no Radix / shadcn runtime dep, since `CLAUDE.md §10` requires
 * architect approval for new deps and the visual chrome can match
 * shadcn purely through CSS and ARIA conventions.
 *
 * Modes:
 *   - `mode: "single"` (default) — single-value combobox. `initialValue`
 *     is the typed value, `onSelect` fires with the picked typed value.
 *     Used by `selectEditor`.
 *   - `mode: "multi"` — multi-value combobox. `initialValue` is a
 *     `readonly unknown[]`, `onSelect` fires with the next array on
 *     every toggle. Used by `multiSelectEditor`. The listbox stays
 *     open until the editor portal commits via Tab/Enter/Escape.
 *
 * Capabilities (both modes):
 *   - 16×16 colour swatch chip beside the option label (`option.swatch`).
 *   - Optional rich icon (`option.icon`) for status pills, avatars, etc.
 *   - Keyboard parity with mouse: Up/Down navigates, Enter/Space picks,
 *     Escape cancels (the editor portal wrapper's keydown handler
 *     routes Tab/Enter/Escape up to the controller).
 *   - Type-ahead by single-key prefix match. Single mode auto-selects
 *     (mirrors native `<select>`); multi mode just navigates — Space
 *     toggles.
 *   - Headless-by-default — no library popover; absolute-positioned
 *     dropdown anchored below the trigger. Position-flip / collision
 *     handling is deferred to v0.7+ (see synthesis P1-W3 backlog).
 *
 * Typed values: the typed `option.value` (single) or
 * `readonly unknown[]` (multi) is stashed on the trigger button via
 * `__bcGridComboboxValue`, so the editor portal's
 * `readEditorInputValue` returns the typed value on click-outside /
 * Tab without going through `column.valueParser`. Mirrors the
 * existing `__bcGridSelectOptionValues` contract on native `<select>`.
 */

const bcGridComboboxValueKey = "__bcGridComboboxValue" as const

type BcGridComboboxButton = HTMLButtonElement & {
  [bcGridComboboxValueKey]?: unknown
}

interface ComboboxBaseProps {
  /**
   * Available options. Editor types resolve these via
   * `resolveEditorOptions(column.options, row)`.
   */
  options: readonly EditorOption[]
  /** Printable seed key from the activation event, if any. Same semantics as native editors. */
  seedKey?: string | undefined
  /** Validation error string. Triggers error-state chrome. */
  error?: string | undefined
  /** True while async validation / commit is in flight. Disables interactions. */
  pending?: boolean | undefined
  /** Column-level required marker. Surfaced as `aria-required` on the trigger. Audit P1-W3-7. */
  required?: boolean | undefined
  /** Column-level read-only marker. Surfaced as `aria-readonly`. Audit P1-W3-7. */
  readOnly?: boolean | undefined
  /** Column-level disabled marker. Surfaced as `aria-disabled` (additive to `pending`). Audit P1-W3-7. */
  disabled?: boolean | undefined
  /** Accessible name for the trigger button. Falls through to AT. */
  accessibleName?: string | undefined
  /**
   * Handed back to the framework. The editor portal calls
   * `focusRef.current?.focus()` on mount, and reads
   * `__bcGridComboboxValue` from the same element on click-outside.
   */
  focusRef?: { current: HTMLElement | null } | undefined
  /**
   * Optional consumer hook to render a "create new" footer inside the
   * popover (e.g. inline "Create new colour"). Returning `null` skips
   * the slot.
   */
  renderCreateOption?: (query: string) => ReactNode
  /**
   * Discriminator surfaced as `data-bc-grid-editor-kind` on the trigger.
   * Defaults to `"combobox"`. Editors composing this primitive (select,
   * multi-select) override with their own logical kind so downstream
   * selectors and tests can target the editor without knowing the
   * primitive lives underneath.
   */
  kind?: string
}

interface ComboboxSingleProps extends ComboboxBaseProps {
  mode?: "single"
  /** Initial selected value (from the cell's row data). */
  initialValue: unknown
  /**
   * Called with the typed value when the user picks an option (mouse
   * click, Enter, type-ahead). The editor portal wrapper's keydown
   * handler intercepts Tab/Enter/Escape and routes through its own
   * commit/cancel — we update the typed value first so the wrapper's
   * `readEditorInputValue` sees the new pick.
   */
  onSelect: (next: unknown) => void
}

interface ComboboxMultiProps extends ComboboxBaseProps {
  mode: "multi"
  /** Initial array of selected values. Order is preserved. */
  initialValue: readonly unknown[]
  /**
   * Called with the next array on every toggle. The trigger's typed
   * value is updated in lockstep so click-outside / Tab commit reads
   * the latest selection.
   */
  onSelect: (next: readonly unknown[]) => void
}

export type ComboboxProps = ComboboxSingleProps | ComboboxMultiProps

/**
 * Public hook for stashing the typed value on the trigger button so
 * `readEditorInputValue` can pluck it on click-outside / Tab.
 */
export function attachComboboxTypedValue(button: HTMLButtonElement | null, value: unknown): void {
  if (!button) return
  ;(button as BcGridComboboxButton)[bcGridComboboxValueKey] = value
}

export function readComboboxTypedValue(element: HTMLElement | null): unknown {
  if (!element) return undefined
  if (element.tagName !== "BUTTON") return undefined
  return (element as BcGridComboboxButton)[bcGridComboboxValueKey]
}

export function Combobox(props: ComboboxProps): ReactNode {
  const {
    options,
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
  const isMulti = props.mode === "multi"

  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const listboxRef = useRef<HTMLDivElement | null>(null)
  const listboxId = useId()
  const errorId = useId()

  // Resolve initial selection. Single mode: one index or -1. Multi:
  // the set of indices whose option values appear in `initialValue`.
  const initialIndices = isMulti
    ? selectedIndicesFromValues(options, toReadonlyArray(props.initialValue as readonly unknown[]))
    : findOptionIndexByValue(options, props.initialValue as unknown)
  const seedIndex = findOptionIndexBySeed(options, seedKey)

  const [selectedIndices, setSelectedIndices] = useState<ReadonlySet<number>>(() => {
    if (isMulti) return new Set(initialIndices as readonly number[])
    const idx = initialIndices as number
    return idx >= 0 ? new Set([idx]) : new Set()
  })
  const [activeIndex, setActiveIndex] = useState(() => {
    if (seedIndex >= 0) return seedIndex
    if (isMulti) {
      const first = (initialIndices as readonly number[])[0]
      return first ?? 0
    }
    const single = initialIndices as number
    return single >= 0 ? single : 0
  })

  // Open by default so the user lands in the dropdown (matches native
  // `<select>` focus behavior + shadcn Combobox-on-edit pattern).
  const [open, setOpen] = useState(true)

  // Hand the button back to the framework via focusRef in
  // useLayoutEffect so the framework's mount-focus call sees the
  // assignment first. Same race fix as text/number editors.
  useLayoutEffect(() => {
    if (focusRef && buttonRef.current) {
      focusRef.current = buttonRef.current
    }
    return () => {
      if (focusRef) focusRef.current = null
    }
  }, [focusRef])

  // Stash the typed value on the trigger so click-outside commit can
  // read it via `readComboboxTypedValue`. In multi mode the typed
  // value is the array of selected option values, in option order.
  // biome-ignore lint/correctness/useExhaustiveDependencies: options identity matters; selectedIndices is the trigger
  useLayoutEffect(() => {
    if (isMulti) {
      const arr = options.filter((_, idx) => selectedIndices.has(idx)).map((option) => option.value)
      attachComboboxTypedValue(buttonRef.current, arr)
    } else {
      const idx = firstSelectedIndex(selectedIndices)
      const value = idx >= 0 ? options[idx]?.value : (props as ComboboxSingleProps).initialValue
      attachComboboxTypedValue(buttonRef.current, value)
    }
  }, [isMulti, options, selectedIndices])

  const updateSelection = useCallback(
    (index: number) => {
      const opt = options[index]
      if (!opt) return
      setActiveIndex(index)
      if (isMulti) {
        const next = new Set(selectedIndices)
        if (next.has(index)) next.delete(index)
        else next.add(index)
        setSelectedIndices(next)
        const arr = options.filter((_, idx) => next.has(idx)).map((option) => option.value)
        attachComboboxTypedValue(buttonRef.current, arr)
        ;(props.onSelect as (next: readonly unknown[]) => void)(arr)
      } else {
        setSelectedIndices(new Set([index]))
        attachComboboxTypedValue(buttonRef.current, opt.value)
        ;(props.onSelect as (next: unknown) => void)(opt.value)
      }
    },
    [isMulti, options, props.onSelect, selectedIndices],
  )

  // Keyboard handler scoped to the button. Tab/Enter/Escape escape
  // up to the editor portal wrapper, which owns commit/cancel —
  // we deliberately don't `event.preventDefault()` for those.
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
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
        setActiveIndex((prev) => Math.max(prev - 1, 0))
        return
      }
      if (event.key === "Home") {
        event.preventDefault()
        setOpen(true)
        setActiveIndex(0)
        return
      }
      if (event.key === "End") {
        event.preventDefault()
        setOpen(true)
        setActiveIndex(Math.max(options.length - 1, 0))
        return
      }
      if (event.key === "Enter") {
        // Single: pick the highlighted option, then let the editor
        // portal wrapper's keydown receive the same Enter to advance
        // the active cell. Multi: do NOT toggle — bubble straight
        // through so the wrapper commits the chip set the user has
        // already built. Toggling on Enter undoes the most-recently
        // active chip immediately before commit, dropping the user's
        // last pick (audit P1-W3-5b — surfaced fixing #372 e2e).
        // Space remains the toggle gesture in multi mode.
        if (!isMulti && open && activeIndex >= 0) {
          updateSelection(activeIndex)
        }
        return
      }
      if (event.key === " ") {
        event.preventDefault()
        if (open && activeIndex >= 0) {
          updateSelection(activeIndex)
        } else {
          setOpen(true)
        }
        return
      }
      // Type-ahead. Single: prefix-match auto-selects (mirrors native
      // `<select>`). Multi: just navigates — Space toggles.
      if (
        event.key.length === 1 &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        event.key !== " "
      ) {
        const idx = findOptionIndexBySeed(options, event.key)
        if (idx >= 0) {
          setOpen(true)
          setActiveIndex(idx)
          if (!isMulti) {
            updateSelection(idx)
          }
        }
      }
    },
    [activeIndex, isMulti, open, options, pending, updateSelection],
  )

  // Sync DOM scroll so the active option stays in view.
  useEffect(() => {
    if (!open || activeIndex < 0) return
    const listbox = listboxRef.current
    if (!listbox) return
    const active = listbox.querySelector<HTMLDivElement>(`[data-option-index="${activeIndex}"]`)
    active?.scrollIntoView({ block: "nearest" })
  }, [activeIndex, open])

  const summary = describeSelectedSummary(options, selectedIndices, isMulti)
  const activeOption = activeIndex >= 0 ? options[activeIndex] : undefined
  const activeOptionId = activeOption ? `${listboxId}-opt-${activeIndex}` : undefined

  return (
    <div
      className="bc-grid-editor-combobox"
      data-bc-grid-editor-combobox="true"
      data-bc-grid-editor-multi={isMulti ? "true" : undefined}
    >
      <button
        ref={buttonRef}
        type="button"
        className="bc-grid-editor-input bc-grid-editor-combobox-trigger"
        data-bc-grid-editor-input="true"
        data-bc-grid-editor-kind={kind}
        data-bc-grid-editor-option-count={options.length}
        data-bc-grid-editor-seeded={
          typeof seedKey === "string" && [...seedKey].length === 1 ? "true" : undefined
        }
        {...editorStateAttrs({ error, pending })}
        data-state={open ? "open" : "closed"}
        aria-invalid={error ? true : undefined}
        aria-required={required ? true : undefined}
        aria-readonly={readOnly ? true : undefined}
        aria-disabled={disabled || pending ? true : undefined}
        aria-label={accessibleName}
        aria-describedby={error ? errorId : undefined}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-multiselectable={isMulti ? true : undefined}
        aria-controls={open ? listboxId : undefined}
        aria-activedescendant={activeOptionId}
        disabled={pending}
        onKeyDown={handleKeyDown}
        onClick={() => setOpen((prev) => !prev)}
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
      </button>

      {open ? (
        <div
          ref={listboxRef}
          id={listboxId}
          // biome-ignore lint/a11y/useSemanticElements: <select> cannot render rich option content (swatch/icon/multi-chip)
          role="listbox"
          tabIndex={-1}
          aria-label={accessibleName}
          aria-multiselectable={isMulti ? true : undefined}
          className="bc-grid-editor-combobox-listbox"
          // Marks this subtree as part of the editor portal so the
          // document-level pointerdown click-outside handler in
          // editorPortal.tsx ignores clicks landing here.
          data-bc-grid-editor-portal="true"
          data-state="open"
          data-side="bottom"
          data-align="start"
        >
          {options.map((option, index) => {
            const optionId = `${listboxId}-opt-${index}`
            const isActive = index === activeIndex
            const isSelected = selectedIndices.has(index)
            return (
              <div
                key={editorOptionToString(option.value)}
                id={optionId}
                // biome-ignore lint/a11y/useSemanticElements: aria-activedescendant pattern; option focus stays on the trigger
                role="option"
                tabIndex={-1}
                aria-selected={isSelected}
                data-option-index={index}
                data-active={isActive ? "true" : undefined}
                data-selected={isSelected ? "true" : undefined}
                className="bc-grid-editor-combobox-option"
                onPointerDown={(event) => {
                  // Pointer-down (not click) so we beat the portal's
                  // pointerdown click-outside listener, which fires on
                  // the same gesture.
                  event.preventDefault()
                  updateSelection(index)
                }}
                onMouseEnter={() => setActiveIndex(index)}
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
              </div>
            )
          })}
          {renderCreateOption ? (
            <div
              className="bc-grid-editor-combobox-create"
              data-bc-grid-editor-combobox-create="true"
            >
              {renderCreateOption("")}
            </div>
          ) : null}
          {options.length === 0 && !renderCreateOption ? (
            <div className="bc-grid-editor-combobox-empty">No options</div>
          ) : null}
        </div>
      ) : null}
      {error ? (
        <span id={errorId} style={visuallyHiddenStyle}>
          {error}
        </span>
      ) : null}
    </div>
  )
}

/**
 * Find the option index whose value matches `target` (string-coerced
 * comparison so the function works for arbitrary typed values).
 * Exported for unit testing.
 */
export function findOptionIndexByValue(options: readonly EditorOption[], target: unknown): number {
  if (target === undefined || target === null) return -1
  const targetStr = editorOptionToString(target)
  return options.findIndex((option) => editorOptionToString(option.value) === targetStr)
}

/**
 * Multi-select mode: map an array of typed values to the indices of
 * their matching options. Drops values that don't appear in the
 * options list (consistent with the v0.1 native `<select multiple>`
 * behaviour). Exported for unit testing.
 */
export function selectedIndicesFromValues(
  options: readonly EditorOption[],
  values: readonly unknown[],
): readonly number[] {
  const result: number[] = []
  for (const value of values) {
    const idx = findOptionIndexByValue(options, value)
    if (idx >= 0) result.push(idx)
  }
  return result
}

/**
 * Find the option whose label or value starts with `seedKey`
 * (case-folded). Mirrors the existing
 * `chrome.ts::findOptionIndexBySeed` semantics — kept here as a
 * private helper so the combobox doesn't depend on the legacy
 * select-only export.
 */
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
  /** Trigger label string for single mode / placeholder for multi. */
  label: string
  /** Single-mode swatch (the picked option's swatch). Multi: undefined. */
  singleSwatch?: string | undefined
  /** Single-mode icon. Multi: undefined. */
  singleIcon?: ReactNode
  /** Multi-mode chip strip (one entry per selected option, in option order). */
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
