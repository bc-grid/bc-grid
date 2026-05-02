import {
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
 * shadcn-native Combobox primitive used by the v0.5 lookup editor
 * migrations (`select`, follow-up: `multi-select` + `autocomplete`).
 *
 * Replaces the native `<select>` / `<datalist>` shells the editing-rfc
 * originally specified. Audit P0-4 / synthesis P0-4. Built on the
 * repo's own popup conventions (data-state / data-side / data-align +
 * data-bc-grid-editor-portal marker for portal-aware click-outside)
 * — no Radix / shadcn runtime dep, since `CLAUDE.md §9` requires
 * architect approval for new deps and the visual chrome can match
 * shadcn purely through CSS and ARIA conventions.
 *
 * Capabilities:
 *   - 16×16 colour swatch chip beside the option label (`option.swatch`).
 *   - Optional rich icon (`option.icon`) for status pills, avatars, etc.
 *   - Keyboard parity with mouse: Up/Down navigates, Enter commits the
 *     highlighted option, Escape cancels (the editor portal wrapper's
 *     keydown handler routes both up to the controller).
 *   - Type-ahead by single-key prefix match (parity with native `<select>`).
 *   - Headless-by-default — no library popover; absolute-positioned
 *     dropdown anchored below the trigger. Position-flip / collision
 *     handling is deferred to v0.7+ (see synthesis P1-W3 backlog).
 *
 * Typed values: the typed `option.value` is stashed on the trigger
 * element via a stable JS property key, so the editor portal's
 * `readEditorInputValue` can return the typed value on click-outside
 * /  Tab without going through `column.valueParser`. Mirrors the
 * existing `__bcGridSelectOptionValues` contract on native `<select>`.
 */

const bcGridComboboxValueKey = "__bcGridComboboxValue" as const

type BcGridComboboxButton = HTMLButtonElement & {
  [bcGridComboboxValueKey]?: unknown
}

export interface ComboboxProps {
  /**
   * Available options. Editor types resolve these via
   * `resolveEditorOptions(column.options, row)`.
   */
  options: readonly EditorOption[]
  /** Initial selected value (from the cell's row data). */
  initialValue: unknown
  /** Printable seed key from the activation event, if any. Same semantics as native editors. */
  seedKey?: string | undefined
  /** Validation error string. Triggers error-state chrome. */
  error?: string | undefined
  /** True while async validation / commit is in flight. Disables interactions. */
  pending?: boolean | undefined
  /** Accessible name for the trigger button. Falls through to AT. */
  accessibleName?: string | undefined
  /**
   * Handed back to the framework. The editor portal calls
   * `focusRef.current?.focus()` on mount, and reads
   * `__bcGridComboboxValue` from the same element on click-outside.
   */
  focusRef?: { current: HTMLElement | null } | undefined
  /**
   * Called with the typed value when the user picks an option (mouse
   * click, Enter, or Tab). The editor portal's wrapper keydown handler
   * intercepts Tab/Enter/Escape and routes through its own commit/cancel
   * — but mouse clicks and inline "create new" actions need this hook.
   */
  onSelect: (next: unknown) => void
  /**
   * Optional consumer hook to render a "create new" footer inside the
   * popover (e.g. inline "Create new colour"). Receives the current
   * search query when type-ahead is active. Returning `null` skips
   * the slot.
   */
  renderCreateOption?: (query: string) => ReactNode
  /**
   * Discriminator surfaced as `data-bc-grid-editor-kind` on the trigger.
   * Defaults to `"combobox"`. Editors composing this primitive (select,
   * multi-select, autocomplete) override with their own logical kind so
   * downstream selectors and tests can target the editor without
   * knowing the primitive lives underneath.
   */
  kind?: string
}

/**
 * Public hook for stashing the typed value on the trigger button so
 * `readEditorInputValue` can pluck it on click-outside / Tab. Exported
 * so editors composing the combobox (with extra rendering on the
 * trigger, etc.) can drive the same plumbing without re-rendering the
 * primitive.
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

export function Combobox({
  options,
  initialValue,
  seedKey,
  error,
  pending,
  accessibleName,
  focusRef,
  onSelect,
  renderCreateOption,
  kind = "combobox",
}: ComboboxProps): ReactNode {
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const listboxRef = useRef<HTMLDivElement | null>(null)
  const listboxId = useId()
  const errorId = useId()

  const initialIndex = findOptionIndexByValue(options, initialValue)
  const seedIndex = findOptionIndexBySeed(options, seedKey)
  const startIndex = seedIndex >= 0 ? seedIndex : initialIndex >= 0 ? initialIndex : -1
  const startValue = startIndex >= 0 ? options[startIndex]?.value : initialValue

  const [selectedIndex, setSelectedIndex] = useState(startIndex)
  const [activeIndex, setActiveIndex] = useState(() => (startIndex >= 0 ? startIndex : 0))
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
  // read it via `readComboboxTypedValue`. Re-runs whenever the user
  // picks a new value.
  useLayoutEffect(() => {
    attachComboboxTypedValue(buttonRef.current, startValue)
  }, [startValue])

  const updateSelection = useCallback(
    (index: number) => {
      const opt = options[index]
      if (!opt) return
      setSelectedIndex(index)
      setActiveIndex(index)
      attachComboboxTypedValue(buttonRef.current, opt.value)
      onSelect(opt.value)
    },
    [onSelect, options],
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
        // Commit the highlighted option, then let the editor portal
        // wrapper's keydown receive the same Enter to advance the
        // active cell. We update the typed value first so the
        // wrapper's `readEditorInputValue` sees the new pick.
        if (open && activeIndex >= 0) {
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
      // Type-ahead: a printable single-character key jumps to the
      // first option whose label/value starts with that character.
      // Mirrors native `<select>` typeahead semantics.
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
          updateSelection(idx)
        }
      }
    },
    [activeIndex, open, options, pending, updateSelection],
  )

  // Sync DOM scroll so the active option stays in view. Mirrors the
  // shadcn Combobox active-descendant scrolling behavior.
  useEffect(() => {
    if (!open || activeIndex < 0) return
    const listbox = listboxRef.current
    if (!listbox) return
    const active = listbox.querySelector<HTMLLIElement>(`[data-option-index="${activeIndex}"]`)
    active?.scrollIntoView({ block: "nearest" })
  }, [activeIndex, open])

  const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : undefined
  const placeholderLabel = "Select…"
  const triggerLabel = selectedOption?.label ?? placeholderLabel
  const triggerSwatch = selectedOption?.swatch
  const activeOption = activeIndex >= 0 ? options[activeIndex] : undefined
  const activeOptionId = activeOption ? `${listboxId}-opt-${activeIndex}` : undefined

  return (
    <div className="bc-grid-editor-combobox" data-bc-grid-editor-combobox="true">
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
        data-bc-grid-editor-state={pending ? "pending" : error ? "error" : "idle"}
        data-state={open ? "open" : "closed"}
        aria-invalid={error ? true : undefined}
        aria-label={accessibleName}
        aria-describedby={error ? errorId : undefined}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-activedescendant={activeOptionId}
        disabled={pending}
        onKeyDown={handleKeyDown}
        onClick={() => setOpen((prev) => !prev)}
      >
        {triggerSwatch ? (
          <span
            className="bc-grid-editor-combobox-swatch"
            data-bc-grid-editor-swatch="true"
            style={{ background: triggerSwatch }}
            aria-hidden="true"
          />
        ) : null}
        {selectedOption?.icon ? (
          <span className="bc-grid-editor-combobox-icon" aria-hidden="true">
            {selectedOption.icon}
          </span>
        ) : null}
        <span className="bc-grid-editor-combobox-label">{triggerLabel}</span>
        <span className="bc-grid-editor-combobox-caret" aria-hidden="true">
          ▾
        </span>
      </button>

      {open ? (
        <div
          ref={listboxRef}
          id={listboxId}
          // biome-ignore lint/a11y/useSemanticElements: <select> cannot render rich option content (swatch/icon)
          role="listbox"
          tabIndex={-1}
          aria-label={accessibleName}
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
            const isSelected = index === selectedIndex
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
