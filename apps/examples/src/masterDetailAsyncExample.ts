export const ASYNC_DETAIL_PANEL_HEIGHT = 220

export type AsyncChildStatus = "ready" | "loading" | "empty" | "error"

export interface AsyncChildRecord {
  id: string
  label: string
  owner: string
  updatedAt: string
}

export interface AsyncMasterRow {
  id: string
  name: string
  childStatus: AsyncChildStatus
  childRows: readonly AsyncChildRecord[]
  childError?: string
}

export type AsyncDetailPanelState =
  | {
      kind: "ready"
      title: string
      rows: readonly AsyncChildRecord[]
    }
  | {
      kind: "loading"
      title: string
      message: string
      role: "status"
      live: "polite"
    }
  | {
      kind: "empty"
      title: string
      message: string
    }
  | {
      kind: "error"
      title: string
      message: string
      role: "alert"
    }

export function childDetailRowKey(
  parentRowId: string,
  child: Pick<AsyncChildRecord, "id">,
): string {
  return `${parentRowId}:${child.id}`
}

export function resolveAsyncDetailPanelState(row: AsyncMasterRow): AsyncDetailPanelState {
  if (row.childStatus === "loading") {
    return {
      kind: "loading",
      live: "polite",
      message: "Fetching child rows without changing the detail row height.",
      role: "status",
      title: `Loading details for ${row.name}`,
    }
  }

  if (row.childStatus === "error") {
    return {
      kind: "error",
      message: row.childError ?? "Child rows could not be loaded. Retry from the host screen.",
      role: "alert",
      title: `Details unavailable for ${row.name}`,
    }
  }

  if (row.childStatus === "empty" || row.childRows.length === 0) {
    return {
      kind: "empty",
      message: "No child rows are available for this record.",
      title: `No details for ${row.name}`,
    }
  }

  return {
    kind: "ready",
    rows: row.childRows,
    title: `Details for ${row.name}`,
  }
}
