import type { ColumnId, RowId } from "@bc-grid/core"
import type { DataRowEntry, GroupRowEntry, ResolvedColumn, RowEntry } from "./gridInternals"
import { formatCellValue, getCellValue } from "./value"

export interface GroupedRowModel<TRow> {
  active: boolean
  rows: readonly RowEntry<TRow>[]
  allGroupRowIds: readonly RowId[]
}

export interface GroupedRowTree<TRow> {
  active: boolean
  rows: readonly DataRowEntry<TRow>[]
  groups: readonly GroupedRowTreeGroup<TRow>[]
  allGroupRowIds: readonly RowId[]
}

export interface BuildGroupedRowTreeParams<TRow> {
  rows: readonly DataRowEntry<TRow>[]
  columns: readonly ResolvedColumn<TRow>[]
  groupBy: readonly ColumnId[]
  locale?: string | undefined
  visibleRowIds?: ReadonlySet<RowId> | undefined
}

export interface BuildGroupedRowModelParams<TRow> extends BuildGroupedRowTreeParams<TRow> {
  expansionState: ReadonlySet<RowId>
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

export interface GroupedRowTreeData<TRow> {
  kind: "data"
  entry: DataRowEntry<TRow>
}

export interface GroupedRowTreeGroup<TRow> {
  kind: "group"
  entry: GroupRowEntry
  children: readonly GroupedRowTreeNode<TRow>[]
  hasVisibleDescendants: boolean
}

export type GroupedRowTreeNode<TRow> = GroupedRowTreeData<TRow> | GroupedRowTreeGroup<TRow>

export function buildGroupedRowModel<TRow>({
  rows,
  columns,
  groupBy,
  expansionState,
  locale,
  visibleRowIds,
}: BuildGroupedRowModelParams<TRow>): GroupedRowModel<TRow> {
  return flattenGroupedRowTree(
    buildGroupedRowTree({
      rows,
      columns,
      groupBy,
      locale,
      visibleRowIds,
    }),
    expansionState,
  )
}

export function buildGroupedRowTree<TRow>({
  rows,
  columns,
  groupBy,
  locale,
  visibleRowIds,
}: BuildGroupedRowTreeParams<TRow>): GroupedRowTree<TRow> {
  const columnsById = new Map(columns.map((column) => [column.columnId, column]))
  const groupColumns = groupBy.flatMap((columnId) => {
    const column = columnsById.get(columnId)
    return column ? [column] : []
  })

  if (groupColumns.length === 0) {
    const visibleRows = filterVisibleRows(rows, visibleRowIds)
    return {
      active: false,
      rows: visibleRows.map((entry, index) => ({ ...entry, index })),
      groups: [],
      allGroupRowIds: [],
    }
  }

  const allGroupRowIds: RowId[] = []

  const buildLevel = (
    levelRows: readonly DataRowEntry<TRow>[],
    depth: number,
    path: readonly InternalGroupPathEntry[],
  ): readonly GroupedRowTreeNode<TRow>[] => {
    const column = groupColumns[depth]
    if (!column) {
      return filterVisibleRows(levelRows, visibleRowIds).map((entry) => ({
        kind: "data",
        entry: { ...entry, level: depth + 1 },
      }))
    }

    const nodes: GroupedRowTreeGroup<TRow>[] = []
    for (const bucket of groupRowsByColumn(levelRows, column, locale).values()) {
      const nextPath = [...path, bucket.pathEntry]
      const groupRowId = groupRowIdForPath(nextPath)
      const visibleBucketRows = filterVisibleRows(bucket.rows, visibleRowIds)
      const hasVisibleDescendants = visibleBucketRows.length > 0
      allGroupRowIds.push(groupRowId)
      nodes.push({
        kind: "group",
        entry: {
          kind: "group",
          rowId: groupRowId,
          index: -1,
          level: depth + 1,
          label: `${columnHeaderText(column)}: ${bucket.pathEntry.formattedValue}`,
          childCount: bucket.rows.length,
          childRowIds: bucket.rows.map((entry) => entry.rowId),
          expanded: false,
        },
        children: buildLevel(bucket.rows, depth + 1, nextPath),
        hasVisibleDescendants,
      })
    }
    return nodes
  }

  const groups = buildLevel(rows, 0, []).filter(
    (node): node is GroupedRowTreeGroup<TRow> => node.kind === "group",
  )

  return {
    active: true,
    rows: [],
    groups,
    allGroupRowIds,
  }
}

export function flattenGroupedRowTree<TRow>(
  tree: GroupedRowTree<TRow>,
  expansionState: ReadonlySet<RowId>,
): GroupedRowModel<TRow> {
  if (!tree.active) {
    return {
      active: false,
      rows: tree.rows.map((entry, index) => ({ ...entry, index })),
      allGroupRowIds: [],
    }
  }

  const output: RowEntry<TRow>[] = []
  const appendNode = (node: GroupedRowTreeNode<TRow>): void => {
    if (node.kind === "data") {
      output.push(node.entry)
      return
    }
    if (!node.hasVisibleDescendants) return
    const expanded = expansionState.has(node.entry.rowId)
    output.push({ ...node.entry, expanded })
    if (!expanded) return
    for (const child of node.children) appendNode(child)
  }

  for (const group of tree.groups) appendNode(group)

  return {
    active: true,
    rows: output.map((entry, index) => ({ ...entry, index })),
    allGroupRowIds: tree.allGroupRowIds,
  }
}

function filterVisibleRows<TRow>(
  rows: readonly DataRowEntry<TRow>[],
  visibleRowIds: ReadonlySet<RowId> | undefined,
): readonly DataRowEntry<TRow>[] {
  if (!visibleRowIds) return rows
  return rows.filter((entry) => visibleRowIds.has(entry.rowId))
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
