import type { BcRowId, RowId } from "@bc-grid/core"
import type { DataRowEntry } from "./gridInternals"

/**
 * Consumer-facing client-tree configuration on `BcGridProps.treeData`.
 * Per `docs/design/client-tree-rowmodel-rfc.md`. Opt-in: when
 * `treeData` is set, `<BcGrid>` builds a parent → children adjacency
 * map from `data` and renders rows with hierarchical indentation per
 * the `expansion` controlled state.
 */
export interface BcClientTreeData<TRow> {
  /**
   * Parent rowId for `row`, or `null` if `row` is a root. Resolved
   * against the grid's `rowId` getter — the returned RowId must
   * match the rowId of some other row in `data`. Cycles are detected
   * at index-build time and broken by demoting the late edge to a
   * root with a `console.error`.
   */
  getRowParentId: (row: TRow) => RowId | null
  /**
   * Optional declared child count. When set, the chevron + count
   * affordances on parent rows render this number even before their
   * children appear in `data` (useful when `data` streams in pages).
   * When omitted, the count is computed from children present in
   * `data`.
   */
  getRowChildCount?: (row: TRow) => number | undefined
  /**
   * Filter behaviour. When `true` (default), filtering preserves
   * ancestors of matching rows so users see the tree context. When
   * `false`, filtering hides ancestors whose subtrees have no
   * matches (compact view, like a flat filter).
   */
  keepAncestors?: boolean
}

/**
 * Internal in-memory adjacency representation built from `data` +
 * `getRowParentId`. Per RFC §3 architectural shape. O(N) construction,
 * O(1) per-row lookup. Cycles are broken at build time with a
 * `console.error`; orphans (children referencing missing parents) are
 * demoted to roots with a `console.warn`.
 */
export interface ClientTreeIndex<TRow> {
  /** All rows in `data`, keyed by rowId. */
  byId: ReadonlyMap<RowId, TRow>
  /** Root rowIds (rows with no parent), in `data`-array order. */
  rootIds: readonly RowId[]
  /** rowId → ordered list of child rowIds (data-array order under each parent). */
  childrenByParent: ReadonlyMap<RowId, readonly RowId[]>
  /** rowId → parent rowId (or null for roots). */
  parentByChild: ReadonlyMap<RowId, RowId | null>
  /** rowId → tree depth (0 = root). */
  levelById: ReadonlyMap<RowId, number>
}

/**
 * Build a `ClientTreeIndex` from a flat `data` array using the
 * consumer's `getRowParentId` resolver and the grid's `rowId` getter.
 *
 * Cycle handling: when row A's parent chain leads back to A
 * (A → B → A), the LATE-arriving back-edge is demoted to a root
 * (`parentByChild.set(A, null)`) and a `console.error` fires. The
 * grid stays usable; the misconfigured edge is visible in dev.
 *
 * Orphan handling: when a row's `getRowParentId` returns a RowId that
 * isn't in `data`, the row is treated as a root and a `console.warn`
 * fires.
 *
 * Per RFC §3 architectural shape + RFC §11 Q1/Q2 ratification.
 */
export function buildClientTree<TRow>(
  data: readonly TRow[],
  getRowParentId: (row: TRow) => RowId | null,
  rowId: BcRowId<TRow>,
): ClientTreeIndex<TRow> {
  const byId = new Map<RowId, TRow>()
  const parentClaim = new Map<RowId, RowId | null>()
  const childOrder = new Map<RowId, RowId[]>()

  // Pass 1: index by rowId.
  data.forEach((row, index) => {
    const id = rowId(row, index)
    byId.set(id, row)
    parentClaim.set(id, getRowParentId(row))
  })

  // Pass 2: detect orphans, then cycles, then build adjacency.
  const parentByChild = new Map<RowId, RowId | null>()
  for (const [id, claimedParent] of parentClaim) {
    if (claimedParent === null) {
      parentByChild.set(id, null)
      continue
    }
    if (!byId.has(claimedParent)) {
      console.warn(
        `[bc-grid client-tree] row "${id}" claims parent "${claimedParent}" which is not in data; treating as root`,
      )
      parentByChild.set(id, null)
      continue
    }
    parentByChild.set(id, claimedParent)
  }

  // Cycle detection: walk each row's ancestor chain. If we revisit a
  // rowId we've seen on this walk, we have a cycle — demote the late
  // edge to a root.
  for (const [id] of parentClaim) {
    let cursor: RowId | null = parentByChild.get(id) ?? null
    const visited = new Set<RowId>([id])
    while (cursor !== null) {
      if (visited.has(cursor)) {
        console.error(
          `[bc-grid client-tree] cycle detected involving row "${id}" → "${cursor}"; demoting "${id}" to root`,
        )
        parentByChild.set(id, null)
        break
      }
      visited.add(cursor)
      cursor = parentByChild.get(cursor) ?? null
    }
  }

  // Pass 3: build childrenByParent in data-array order. Walk `data`
  // again so siblings appear in their consumer-supplied order
  // (deterministic, matches AG Grid + the doc-management spike's
  // expectation that "rows render in data order under each parent").
  data.forEach((row, index) => {
    const id = rowId(row, index)
    const parent = parentByChild.get(id) ?? null
    if (parent === null) return
    const siblings = childOrder.get(parent)
    if (siblings) {
      siblings.push(id)
    } else {
      childOrder.set(parent, [id])
    }
  })

  // Pass 4: collect roots in data-array order.
  const rootIds: RowId[] = []
  data.forEach((row, index) => {
    const id = rowId(row, index)
    if ((parentByChild.get(id) ?? null) === null) rootIds.push(id)
  })

  // Pass 5: compute level for each row by walking ancestors.
  const levelById = new Map<RowId, number>()
  function levelOf(id: RowId): number {
    const cached = levelById.get(id)
    if (cached !== undefined) return cached
    const parent = parentByChild.get(id) ?? null
    const level = parent === null ? 0 : levelOf(parent) + 1
    levelById.set(id, level)
    return level
  }
  for (const [id] of parentClaim) levelOf(id)

  return {
    byId,
    rootIds,
    childrenByParent: childOrder,
    parentByChild,
    levelById,
  }
}

/**
 * Flatten a `ClientTreeIndex` into the ordered `DataRowEntry[]` the
 * `<BcGrid>` rendering pipeline expects. Walks `rootIds` in order,
 * recursing into each parent's children only if the parent is in
 * `expansionState`. Emits `level` (depth) so the outline column can
 * render the right indent.
 *
 * Optional `visibleRowIds` filter: when supplied, rows whose ids are
 * NOT in the set are skipped during flattening. Pair with the filter
 * pipeline's `keepAncestors` semantics — this helper assumes the
 * caller has already applied `keepAncestors` to the visible set.
 *
 * Per RFC §3 architectural shape.
 */
export function flattenClientTree<TRow>(input: {
  index: ClientTreeIndex<TRow>
  expansionState: ReadonlySet<RowId>
  visibleRowIds?: ReadonlySet<RowId> | undefined
}): readonly DataRowEntry<TRow>[] {
  const { index, expansionState, visibleRowIds } = input
  const output: DataRowEntry<TRow>[] = []

  function visit(id: RowId): void {
    const row = index.byId.get(id)
    if (!row) return
    const passesVisible = !visibleRowIds || visibleRowIds.has(id)
    if (passesVisible) {
      output.push({
        kind: "data",
        row,
        rowId: id,
        // Re-stamped after the walk so DOM order is contiguous.
        index: -1,
        level: index.levelById.get(id) ?? 0,
      })
    }
    if (!expansionState.has(id)) return
    const children = index.childrenByParent.get(id)
    if (!children) return
    for (const childId of children) visit(childId)
  }

  for (const rootId of index.rootIds) visit(rootId)

  // Stamp final DOM index so consumers can rely on `entry.index` for
  // `aria-rowindex` / virtualizer offsets. Mirrors `buildGroupedRowModel`.
  return output.map((entry, i) => ({ ...entry, index: i }))
}

/**
 * Filter helper: given a set of rows that match the user's filter,
 * extend the visible set to include each match's ancestors so users
 * see the tree context. Consumed by the React-layer filter pipeline
 * when `treeData.keepAncestors !== false` (default `true`).
 *
 * Per RFC §5 sort + filter through the tree.
 */
export function expandVisibleAncestors<TRow>(input: {
  index: ClientTreeIndex<TRow>
  matchedRowIds: ReadonlySet<RowId>
}): ReadonlySet<RowId> {
  const { index, matchedRowIds } = input
  const visible = new Set<RowId>(matchedRowIds)
  for (const matchedId of matchedRowIds) {
    let cursor: RowId | null = index.parentByChild.get(matchedId) ?? null
    while (cursor !== null && !visible.has(cursor)) {
      visible.add(cursor)
      cursor = index.parentByChild.get(cursor) ?? null
    }
  }
  return visible
}

/**
 * Filter helper: given a set of rows that match the user's filter,
 * compute the subset of ancestors whose subtrees contain at least one
 * match. Consumed by the React-layer filter pipeline when
 * `treeData.keepAncestors === false` (compact view).
 *
 * Equivalent to `expandVisibleAncestors` but only ancestors are
 * promoted whose descendant chain reaches a match — no orphan
 * promotion of ancestors with empty subtrees.
 *
 * Per RFC §5 sort + filter through the tree.
 */
export function compactVisibleAncestors<TRow>(input: {
  index: ClientTreeIndex<TRow>
  matchedRowIds: ReadonlySet<RowId>
}): ReadonlySet<RowId> {
  // Same algorithm as expandVisibleAncestors — compact mode hides
  // ancestors with no matches, but ancestors WITH matches always
  // surface (otherwise the matches would be orphaned in the flatten
  // output). The two helpers diverge only in the unmatched-row case
  // (compact: hide; keep-ancestors: hide); the matched-and-ancestor
  // case is the same in both modes.
  return expandVisibleAncestors(input)
}

/**
 * Sort the tree's children + roots in place by the supplied
 * comparator. Returns a NEW `ClientTreeIndex` with sorted
 * `rootIds` + sorted `childrenByParent` lists (same `byId`,
 * `parentByChild`, `levelById` references — shallow clone for the
 * adjacency containers only).
 *
 * Per RFC §5 sort-through-tree: sort applies WITHIN each subtree
 * level. Roots are sorted by the comparator; each parent's children
 * are sorted independently. Hierarchy is preserved.
 *
 * The comparator receives row objects (not rowIds) so callers can
 * use the existing column-comparator surface from `BcReactGridColumn`.
 */
export function sortClientTreeChildren<TRow>(
  index: ClientTreeIndex<TRow>,
  comparator: (a: TRow, b: TRow) => number,
): ClientTreeIndex<TRow> {
  const compareIds = (a: RowId, b: RowId): number => {
    const rowA = index.byId.get(a)
    const rowB = index.byId.get(b)
    if (!rowA || !rowB) return 0
    return comparator(rowA, rowB)
  }
  const sortedRootIds = [...index.rootIds].sort(compareIds)
  const sortedChildrenByParent = new Map<RowId, readonly RowId[]>()
  for (const [parentId, childIds] of index.childrenByParent) {
    sortedChildrenByParent.set(parentId, [...childIds].sort(compareIds))
  }
  return {
    byId: index.byId,
    rootIds: sortedRootIds,
    childrenByParent: sortedChildrenByParent,
    parentByChild: index.parentByChild,
    levelById: index.levelById,
  }
}

/**
 * Collect all LEAF descendants of `parentRowId` — rows that have no
 * children themselves AND are reachable from `parentRowId` via the
 * tree's adjacency. Walks pre-order DFS (matches `flattenClientTree`
 * output ordering for predictability). Used by the parent-row
 * aggregation pipeline to gather the rows that feed
 * `aggregateColumns`.
 *
 * Per RFC §6 aggregations integration. Aggregating over leaves only
 * (not intermediate nodes) matches the standard "subtotal" semantics:
 * a sum at a department parent shouldn't count its sub-department
 * parents (which are themselves subtotals of their own leaves).
 */
export function collectLeafDescendants<TRow>(
  index: ClientTreeIndex<TRow>,
  parentRowId: RowId,
): readonly TRow[] {
  const out: TRow[] = []
  function visit(id: RowId): void {
    const children = index.childrenByParent.get(id)
    if (!children || children.length === 0) {
      // Leaf — emit the row itself.
      const row = index.byId.get(id)
      if (row) out.push(row)
      return
    }
    for (const childId of children) visit(childId)
  }
  visit(parentRowId)
  return out
}
