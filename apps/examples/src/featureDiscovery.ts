export type FeatureDiscoveryStatus = "Available" | "Planned" | "Post-1.0"

export interface FeatureDiscoveryRow {
  feature: string
  status: FeatureDiscoveryStatus
  entry: string
  api: string
  shortcutHref?: string
}

export interface FeatureShortcut {
  id: string
  label: string
  description: string
  href: string
}

export const featureShortcuts = [
  {
    id: "inline-filters",
    label: "Inline filters",
    description: "Default filter row on the Customer column.",
    href: "#customer-grid",
  },
  {
    id: "popup-filters",
    label: "Popup filters",
    description: "Header funnel popovers for the same grid.",
    href: "?filterPopup=1#customer-grid",
  },
  {
    id: "master-detail",
    label: "Master/detail",
    description: "Customer contacts as child detail content.",
    href: "?masterDetail=1#customer-grid",
  },
  {
    id: "column-pinning",
    label: "Column pinning",
    description: "Account stays pinned while the ledger scrolls.",
    href: "#customer-grid",
  },
  {
    id: "column-persistence",
    label: "Column persistence",
    description: "URL-backed column state with the columns panel open.",
    href: "?urlstate=1&toolPanel=columns#customer-grid",
  },
  {
    id: "server-edit-grid",
    label: "Server edit grid",
    description: "Paged server-backed editing and mutation state.",
    href: "#server-edit-grid",
  },
] as const satisfies readonly FeatureShortcut[]

export type FeatureShortcutId = (typeof featureShortcuts)[number]["id"]

export const featureDiscoveryRows: readonly FeatureDiscoveryRow[] = [
  {
    feature: "Sort, resize, pin",
    status: "Available",
    entry: "AR Customers: Account pinned left",
    api: "sortable, resizable, pinned",
    shortcutHref: shortcutHref("column-pinning"),
  },
  {
    feature: "Column groups",
    status: "Available",
    entry: "?columnGroups=1",
    api: "columns[].children",
    shortcutHref: "?columnGroups=1#customer-grid",
  },
  {
    feature: "Inline filters",
    status: "Available",
    entry: "AR Customers filter row",
    api: "filter, showFilterRow",
    shortcutHref: shortcutHref("inline-filters"),
  },
  {
    feature: "Popup filters",
    status: "Available",
    entry: "?filterPopup=1",
    api: "filter.variant = popup",
    shortcutHref: shortcutHref("popup-filters"),
  },
  {
    feature: "Global search",
    status: "Available",
    entry: "AR Customers toolbar",
    api: "searchText, defaultSearchText",
    shortcutHref: "#customer-grid",
  },
  {
    feature: "Columns panel",
    status: "Available",
    entry: "Tool panels control or ?toolPanel=columns",
    api: 'sidebar={["columns"]}',
    shortcutHref: "?toolPanel=columns#customer-grid",
  },
  {
    feature: "Filters panel",
    status: "Available",
    entry: "Tool panels control or ?toolPanel=filters",
    api: 'sidebar={["filters"]}',
    shortcutHref: "?toolPanel=filters#customer-grid",
  },
  {
    feature: "Row grouping (client / server-page-window)",
    status: "Available",
    entry:
      "?groupBy=region,status — Columns panel 'Group by' zone, header menu, controlled groupBy",
    api: "groupBy, defaultGroupBy, onGroupByChange, groupableColumns, groupsExpandedByDefault",
    shortcutHref: "?groupBy=region,status#customer-grid",
  },
  {
    feature: "Context menu",
    status: "Available",
    entry: "right-click grid cells",
    api: "contextMenuItems, showColumnMenu",
  },
  {
    feature: "Cell editing",
    status: "Available",
    entry: "?edit=1",
    api: "BcEditGrid, cellEditor",
    shortcutHref: "?edit=1#customer-grid",
  },
  {
    feature: "Lookup/select editors",
    status: "Available",
    entry: "?edit=1 Status, Flags, Collector columns",
    api: "selectEditor, multiSelectEditor, autocompleteEditor",
    shortcutHref: "?edit=1#customer-grid",
  },
  {
    feature: "Checkbox selection",
    status: "Available",
    entry: "?checkbox=1",
    api: "checkboxSelection",
    shortcutHref: "?checkbox=1#customer-grid",
  },
  {
    feature: "Column persistence",
    status: "Available",
    entry: "?urlstate=1&toolPanel=columns",
    api: "gridId, urlStatePersistence, columnState",
    shortcutHref: shortcutHref("column-persistence"),
  },
  {
    feature: "Pagination",
    status: "Available",
    entry: "?pagination=1",
    api: "pagination, pageSizeOptions",
    shortcutHref: "?pagination=1#customer-grid",
  },
  {
    feature: "Aggregations",
    status: "Available",
    entry: "?aggregations=1",
    api: "aggregation, statusBar",
    shortcutHref: "?aggregations=1#customer-grid",
  },
  {
    feature: "Master detail",
    status: "Available",
    entry: "?masterDetail=1 customer contacts child grid",
    api: "renderDetailPanel",
    shortcutHref: shortcutHref("master-detail"),
  },
  {
    feature: "Auto height",
    status: "Available",
    entry: "?autoHeight=1",
    api: "height = auto",
    shortcutHref: "?autoHeight=1#customer-grid",
  },
  {
    feature: "Server row model",
    status: "Available",
    entry: "Server Edit Grid",
    api: "BcServerGrid, onServerRowMutation",
    shortcutHref: shortcutHref("server-edit-grid"),
  },
  {
    feature: "Pivot panel",
    status: "Available",
    entry: "Tool panels control or ?toolPanel=pivot",
    api: 'sidebar={["pivot"]}, pivotState',
    shortcutHref: "?toolPanel=pivot#customer-grid",
  },
  {
    feature: "Charts",
    status: "Post-1.0",
    entry: "not exposed in examples",
    api: "future charts adapter",
  },
]

export function shortcutHref(id: FeatureShortcutId): string {
  const shortcut = featureShortcuts.find((candidate) => candidate.id === id)
  if (!shortcut) throw new Error(`Unknown feature shortcut: ${id}`)
  return shortcut.href
}
