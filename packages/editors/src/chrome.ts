import type { CSSProperties } from "react"

export const editorInputClassName = "bc-grid-editor-input"

export type EditorControlState = "idle" | "pending" | "error"

export function editorControlState({
  error,
  pending,
}: {
  error?: string | undefined
  pending?: boolean | undefined
}): EditorControlState {
  if (pending) return "pending"
  if (error) return "error"
  return "idle"
}

export function editorAccessibleName(
  column: { header?: unknown; field?: unknown; columnId?: unknown },
  fallback: string,
): string | undefined {
  const header = typeof column.header === "string" ? column.header : undefined
  const field = typeof column.field === "string" ? column.field : undefined
  const columnId = typeof column.columnId === "string" ? column.columnId : undefined
  const name = header || field || columnId || fallback
  return name || undefined
}

export function editorDescribedBy({
  error,
  localErrorId,
  validationMessageId,
  extraIds = [],
}: {
  error?: string | undefined
  localErrorId: string
  validationMessageId?: string | undefined
  extraIds?: readonly (string | undefined)[]
}): string | undefined {
  const ids = [
    ...(error ? [validationMessageId ?? localErrorId] : []),
    ...extraIds.filter((id): id is string => typeof id === "string" && id.length > 0),
  ]
  return ids.length > 0 ? ids.join(" ") : undefined
}

export function shouldRenderLocalEditorError(
  error: string | undefined,
  validationMessageId: string | undefined,
): error is string {
  return Boolean(error && !validationMessageId)
}

export interface EditorOption {
  value: unknown
  label: string
}

export function resolveEditorOptions(source: unknown, row: unknown): readonly EditorOption[] {
  const resolved = resolveEditorOptionsSource(source, row)
  if (!Array.isArray(resolved)) return []
  return resolved.map((option) => {
    const candidate = option as { value?: unknown; label?: unknown }
    return {
      value: candidate.value,
      label:
        typeof candidate.label === "string"
          ? candidate.label
          : editorOptionToString(candidate.value),
    }
  })
}

export function editorOptionToString(value: unknown): string {
  if (value == null) return ""
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value)
  }
  try {
    const serialized = JSON.stringify(value)
    return serialized ?? String(value)
  } catch {
    return String(value)
  }
}

export function resolveSelectEditorState({
  initialValue,
  options,
  seedKey,
}: {
  initialValue: unknown
  options: readonly EditorOption[]
  seedKey?: string | undefined
}): {
  defaultValue: string
  hasSelectedOption: boolean
  seedMatched: boolean
  selectOptionValues: readonly unknown[]
} {
  const initialString = editorOptionToString(initialValue)
  const seedMatchIndex = findOptionIndexBySeed(options, seedKey)
  const selectedOption = seedMatchIndex >= 0 ? options[seedMatchIndex] : undefined
  const defaultValue = selectedOption ? editorOptionToString(selectedOption.value) : initialString
  const hasSelectedOption =
    seedMatchIndex >= 0 ||
    options.some((option) => editorOptionToString(option.value) === initialString)
  const optionValues = options.map((option) => option.value)

  return {
    defaultValue: hasSelectedOption ? defaultValue : "",
    hasSelectedOption,
    seedMatched: seedMatchIndex >= 0,
    selectOptionValues: hasSelectedOption ? optionValues : [undefined, ...optionValues],
  }
}

export function findOptionIndexBySeed(
  options: readonly EditorOption[],
  seedKey: string | undefined,
): number {
  if (!isPrintableSingleKey(seedKey)) return -1
  const query = seedKey.toLocaleLowerCase()
  return options.findIndex((option) => {
    const label = option.label.toLocaleLowerCase()
    const value = editorOptionToString(option.value).toLocaleLowerCase()
    return label.startsWith(query) || value.startsWith(query)
  })
}

export const visuallyHiddenStyle: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
  border: 0,
}

function resolveEditorOptionsSource(source: unknown, row: unknown): unknown {
  if (Array.isArray(source)) return source
  if (typeof source !== "function") return []
  try {
    return (source as (row: unknown) => unknown)(row)
  } catch {
    // Bad option-fn — render no options rather than crashing the cell.
    return []
  }
}

function isPrintableSingleKey(seedKey: string | undefined): seedKey is string {
  return typeof seedKey === "string" && [...seedKey].length === 1 && seedKey >= " "
}
