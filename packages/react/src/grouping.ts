import type { ColumnId, RowId } from "@bc-grid/core"
import type { DataRowEntry, GroupRowEntry, ResolvedColumn, RowEntry } from "./gridInternals"
import { formatCellValue, getCellValue } from "./value"

export interface GroupedRowModel<TRow> {
  active: boolean
  rows: readonly RowEntry<TRow>[]
  allGroupRowIds: readonly RowId[]
}

export interface BuildGroupedRowModelParams<TRow> {
  rows: readonly DataRowEntry<TRow>[]
  columns: readonly ResolvedColumn<TRow>[]
  groupBy: readonly ColumnId[]
  expansionState: ReadonlySet<RowId>
  locale?: string | undefined
}

interface GroupBucket<TRow> {
  pathEntry: InternalGroupPathEntry
  rows: DataRowEntry<TRow>[]
}

interface InternalGroupPathEntry {
  columnId: ColumnId
  formattedValue: string
  key: string
}

export function buildGroupedRowModel<TRow>({
  rows,
  columns,
  groupBy,
  expansionState,
  locale,
}: BuildGroupedRowModelParams<TRow>): GroupedRowModel<TRow> {
  const columnsById = new Map(columns.map((column) => [column.columnId, column]))
  const groupColumns = groupBy.flatMap((columnId) => {
    const column = columnsById.get(columnId)
    return column ? [column] : []
  })

  if (groupColumns.length === 0) {
    return {
      active: false,
      rows: rows.map((entry, index) => ({ ...entry, index })),
      allGroupRowIds: [],
    }
  }

  const output: RowEntry<TRow>[] = []
  const allGroupRowIds: RowId[] = []

  const appendLevel = (
    levelRows: readonly DataRowEntry<TRow>[],
    depth: number,
    path: readonly InternalGroupPathEntry[],
    visible: boolean,
  ): void => {
    const column = groupColumns[depth]
    if (!column) {
      if (visible) {
        for (const entry of levelRows) {
          output.push({ ...entry, level: depth + 1 })
        }
      }
      return
    }

    for (const bucket of groupRowsByColumn(levelRows, column, locale).values()) {
      const nextPath = [...path, bucket.pathEntry]
      const groupRowId = groupRowIdForPath(nextPath)
      const expanded = expansionState.has(groupRowId)
      allGroupRowIds.push(groupRowId)
      if (visible) {
        output.push({
          kind: "group",
          rowId: groupRowId,
          index: -1,
          level: depth + 1,
          label: `${columnHeaderText(column)}: ${bucket.pathEntry.formattedValue}`,
          childCount: bucket.rows.length,
          childRowIds: bucket.rows.map((entry) => entry.rowId),
          expanded,
        } satisfies GroupRowEntry)
      }

      appendLevel(bucket.rows, depth + 1, nextPath, visible && expanded)
    }
  }

  appendLevel(rows, 0, [], true)

  return {
    active: true,
    rows: output.map((entry, index) => ({ ...entry, index })),
    allGroupRowIds,
  }
}

function groupRowsByColumn<TRow>(
  rows: readonly DataRowEntry<TRow>[],
  column: ResolvedColumn<TRow>,
  locale: string | undefined,
): ReadonlyMap<string, GroupBucket<TRow>> {
  const buckets = new Map<string, GroupBucket<TRow>>()
  for (const entry of rows) {
    const value = getCellValue(entry.row, column.source)
    const formattedValue = normaliseGroupLabel(
      formatCellValue(value, entry.row, column.source, locale),
    )
    const key = groupValueKey(value)
    const bucket = buckets.get(key)
    if (bucket) {
      bucket.rows.push(entry)
    } else {
      buckets.set(key, {
        pathEntry: {
          columnId: column.columnId,
          formattedValue,
          key,
        },
        rows: [entry],
      })
    }
  }
  return buckets
}

function groupRowIdForPath(path: readonly InternalGroupPathEntry[]): RowId {
  const encodedPath = path
    .map((entry) => `${encodeURIComponent(entry.columnId)}=${encodeURIComponent(entry.key)}`)
    .join("|")
  return `__bc_group:${encodedPath}`
}

function columnHeaderText<TRow>(column: ResolvedColumn<TRow>): string {
  return typeof column.source.header === "string" ? column.source.header : column.columnId
}

function normaliseGroupLabel(value: string): string {
  return value.trim() === "" ? "(Blank)" : value
}

function groupValueKey(value: unknown): string {
  if (value instanceof Date) return `date:${value.toISOString()}`
  if (value == null) return "null"
  const type = typeof value
  if (type === "string" || type === "number" || type === "boolean" || type === "bigint") {
    return `${type}:${String(value)}`
  }
  try {
    return `json:${JSON.stringify(value)}`
  } catch {
    return `string:${String(value)}`
  }
}
