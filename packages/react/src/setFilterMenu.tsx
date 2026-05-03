import type { ColumnId, SetFilterOption } from "@bc-grid/core"
import {
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import type { SetFilterInput, SetFilterOperator, SetFilterOptionLoader } from "./filter"
import { nextSetFilterValuesOnToggleAll } from "./filter"

const SET_FILTER_OPTION_LOAD_LIMIT = 250

export function SetFilterMenu({
  columnId,
  filterId,
  filterLabel,
  loadSetFilterOptions,
  menuRect,
  op,
  rootRef,
  selectedValueList,
  onClose,
  onCommit,
}: {
  columnId: ColumnId
  filterId: string
  filterLabel: string
  loadSetFilterOptions?: SetFilterOptionLoader | undefined
  menuRect: { top: number; left: number; width: number }
  op: SetFilterOperator
  rootRef: RefObject<HTMLDivElement | null>
  selectedValueList: readonly string[]
  onClose: () => void
  onCommit: (next: SetFilterInput) => void
}): ReactNode {
  const [optionState, setOptionState] = useState<{
    options: readonly SetFilterOption[]
    selectedOptions: readonly SetFilterOption[]
    loading: boolean
    error: string | null
    totalCount: number | undefined
  }>({
    options: [],
    selectedOptions: [],
    loading: false,
    error: null,
    totalCount: undefined,
  })
  const [search, setSearch] = useState("")
  const searchInputRef = useRef<HTMLInputElement | null>(null)

  useLayoutEffect(() => {
    searchInputRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!loadSetFilterOptions) {
      setOptionState({
        options: [],
        selectedOptions: [],
        loading: false,
        error: null,
        totalCount: undefined,
      })
      return
    }

    const controller = new AbortController()
    let active = true
    setOptionState((prev) => ({ ...prev, loading: true, error: null }))

    void loadSetFilterOptions({
      columnId,
      search,
      selectedValues: selectedValueList,
      limit: SET_FILTER_OPTION_LOAD_LIMIT,
      offset: 0,
      signal: controller.signal,
    })
      .then((result) => {
        if (!active || controller.signal.aborted) return
        setOptionState({
          options: result.options,
          selectedOptions: result.selectedOptions ?? [],
          loading: false,
          error: null,
          totalCount: result.totalCount,
        })
      })
      .catch((error: unknown) => {
        if (!active || controller.signal.aborted) return
        setOptionState({
          options: [],
          selectedOptions: [],
          loading: false,
          error: error instanceof Error && error.message ? error.message : "Unable to load values",
          totalCount: undefined,
        })
      })

    return () => {
      active = false
      controller.abort()
    }
  }, [columnId, loadSetFilterOptions, search, selectedValueList])

  const loadedOptions = optionState.options
  const loadedCount = loadedOptions.length
  const selectedValues = useMemo(() => new Set(selectedValueList), [selectedValueList])
  const selectedOutsideOptions = useMemo(() => {
    const loadedValues = new Set(loadedOptions.map((option) => option.value))
    const selectedByValue = new Map(
      optionState.selectedOptions.map((option) => [option.value, option]),
    )
    return selectedValueList
      .filter((value) => !loadedValues.has(value))
      .map((value) => selectedByValue.get(value) ?? { value, label: value })
  }, [loadedOptions, optionState.selectedOptions, selectedValueList])
  const allVisibleSelected =
    loadedOptions.length > 0 && loadedOptions.every((option) => selectedValues.has(option.value))
  const loadedCountLabel =
    optionState.totalCount != null && optionState.totalCount !== loadedCount
      ? `${loadedCount} / ${optionState.totalCount}`
      : `${loadedCount}`

  const toggleValue = (value: string) => {
    const values = selectedValues.has(value)
      ? selectedValueList.filter((selected) => selected !== value)
      : [...selectedValueList, value]
    onCommit({ op, values })
  }

  const renderOption = (option: SetFilterOption, keyPrefix: string) => {
    const checked = selectedValues.has(option.value)
    return (
      <label
        key={`${keyPrefix}-${option.value}`}
        className="bc-grid-filter-set-option"
        data-selected={checked ? "true" : undefined}
      >
        <input type="checkbox" checked={checked} onChange={() => toggleValue(option.value)} />
        <span>{option.label}</span>
      </label>
    )
  }

  const handleMenuKeyDown = (event: KeyboardEvent<HTMLFieldSetElement>) => {
    if (event.key === "Escape") {
      event.stopPropagation()
      onClose()
      return
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return
    const menu = rootRef.current?.querySelector('[data-bc-grid-set-menu="true"]')
    if (!menu) return
    const focusables = Array.from(
      menu.querySelectorAll<HTMLElement>(
        'input[type="checkbox"], [data-bc-grid-set-search="true"]',
      ),
    )
    if (focusables.length === 0) return
    const active = document.activeElement as HTMLElement | null
    const currentIndex = active ? focusables.indexOf(active) : -1
    const delta = event.key === "ArrowDown" ? 1 : -1
    event.preventDefault()
    focusables[(currentIndex + delta + focusables.length) % focusables.length]?.focus()
  }

  return (
    <fieldset
      id={`${filterId}-set-menu`}
      className="bc-grid-filter-set-menu"
      data-bc-grid-set-menu="true"
      data-state="open"
      data-side="bottom"
      data-align="start"
      aria-label={`${filterLabel} values`}
      onKeyDown={handleMenuKeyDown}
      style={{
        position: "fixed",
        top: menuRect.top,
        left: menuRect.left,
        minWidth: Math.max(220, menuRect.width),
        zIndex: 110,
      }}
    >
      <div className="bc-grid-filter-set-toolbar">
        <input
          ref={searchInputRef}
          type="search"
          aria-label={`Search ${filterLabel} values`}
          className="bc-grid-filter-set-search"
          data-bc-grid-set-search="true"
          placeholder="Search values"
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
        />
      </div>
      {loadedCount > 0 ? (
        <div className="bc-grid-filter-set-actions">
          <button
            type="button"
            className="bc-grid-filter-set-action"
            disabled={optionState.loading}
            onClick={() =>
              onCommit({
                op,
                values: nextSetFilterValuesOnToggleAll(loadedOptions, selectedValueList),
              })
            }
          >
            {allVisibleSelected ? "Clear loaded" : "Select loaded"}
          </button>
          <span className="bc-grid-filter-set-count" aria-hidden="true">
            {selectedValueList.length === 0
              ? loadedCountLabel
              : `${selectedValueList.length} selected`}
          </span>
        </div>
      ) : null}
      <div className="bc-grid-filter-set-options" role="presentation">
        {optionState.loading ? (
          <div className="bc-grid-filter-set-empty">Loading values</div>
        ) : optionState.error ? (
          <div className="bc-grid-filter-set-empty">{optionState.error}</div>
        ) : loadedCount === 0 && selectedOutsideOptions.length === 0 ? (
          <div className="bc-grid-filter-set-empty">No values</div>
        ) : (
          <>
            {selectedOutsideOptions.length > 0 ? (
              <div className="bc-grid-filter-set-selected-outside">
                <div className="bc-grid-filter-set-section-label">
                  Selected outside current search
                </div>
                {selectedOutsideOptions.map((option) => renderOption(option, "selected"))}
              </div>
            ) : null}
            {loadedOptions.map((option) => renderOption(option, "loaded"))}
          </>
        )}
      </div>
      {selectedValueList.length > 0 ? (
        <div className="bc-grid-filter-set-footer">
          <button
            type="button"
            className="bc-grid-filter-set-clear"
            onClick={() => onCommit({ op, values: [] })}
          >
            Clear selection
          </button>
        </div>
      ) : null}
    </fieldset>
  )
}
