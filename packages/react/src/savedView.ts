import type { BcGridApi, BcPaginationState, ColumnId } from "@bc-grid/core"
import type { BcGridDensity, BcGridLayoutState } from "./types"

export const BC_SAVED_VIEW_VERSION = 1

declare const bcSavedViewRowType: unique symbol

export type BcSavedViewScope = "user" | "team" | "global"

export type BcSavedViewLayoutInput = Partial<Omit<BcGridLayoutState, "version">> & {
  version?: number
}

export interface BcSavedView<TRow = unknown> {
  readonly [bcSavedViewRowType]?: (row: TRow) => TRow
  id: string
  name: string
  gridId: string
  version: number
  layout: BcGridLayoutState
  scope: BcSavedViewScope
  ownerId?: string
  isDefault?: boolean
  isFavorite?: boolean
  createdAt?: string
  updatedAt?: string
  description?: string
}

export type BcSavedViewInput<TRow = unknown> = Omit<BcSavedView<TRow>, "layout" | "version"> & {
  version?: number
  layout: BcSavedViewLayoutInput
}

export interface CreateSavedViewOptions<TRow = unknown> {
  readonly [bcSavedViewRowType]?: (row: TRow) => TRow
  id?: string
  name: string
  gridId: string
  layout: BcSavedViewLayoutInput
  scope?: BcSavedViewScope
  ownerId?: string
  isDefault?: boolean
  isFavorite?: boolean
  createdAt?: string
  updatedAt?: string
  description?: string
}

export interface BcSavedViewLayoutApplier {
  setGroupBy?: (next: readonly ColumnId[]) => void
  setSearchText?: (next: string) => void
  setPagination?: (next: BcPaginationState) => void
  setDensity?: (next: BcGridDensity) => void
  setSidebarPanel?: (next: string | null) => void
}

export interface BcServerSyncedSavedViewStoreOptions {
  endpoint: string
  gridId: string
  fetch?: typeof fetch
}

export interface BcSavedViewSyncConflict<TRow = unknown> {
  status: "conflict"
  local: BcSavedView<TRow>
  remote: BcSavedView<TRow>
}

export type BcSavedViewSyncResult<TRow = unknown> =
  | { status: "saved"; view: BcSavedView<TRow> }
  | BcSavedViewSyncConflict<TRow>

export interface BcServerSyncedSavedViewStore<TRow = unknown> {
  list(): Promise<readonly BcSavedView<TRow>[]>
  getDefault(): Promise<BcSavedView<TRow> | null>
  upsert(view: BcSavedViewInput<TRow>): Promise<BcSavedViewSyncResult<TRow>>
  remove(viewId: string): Promise<void>
}

export function createSavedView<TRow = unknown>(
  opts: CreateSavedViewOptions<TRow>,
): BcSavedView<TRow> {
  const timestamp = new Date().toISOString()
  const view: BcSavedView<TRow> = {
    id: opts.id ?? createSavedViewId(),
    name: opts.name,
    gridId: opts.gridId,
    version: BC_SAVED_VIEW_VERSION,
    layout: normalizeSavedViewLayout(opts.layout),
    scope: opts.scope ?? "user",
    createdAt: opts.createdAt ?? timestamp,
    updatedAt: opts.updatedAt ?? opts.createdAt ?? timestamp,
  }

  assignOptional(view, "ownerId", opts.ownerId)
  assignOptional(view, "isDefault", opts.isDefault)
  assignOptional(view, "isFavorite", opts.isFavorite)
  assignOptional(view, "description", opts.description)

  return view
}

export function migrateSavedViewLayout<TRow = unknown>(
  view: BcSavedViewInput<TRow>,
): BcSavedView<TRow> {
  return {
    ...view,
    version: BC_SAVED_VIEW_VERSION,
    layout: normalizeSavedViewLayout(view.layout),
  }
}

export function createServerSyncedSavedViewStore<TRow = unknown>({
  endpoint,
  fetch: fetchImpl = globalThis.fetch?.bind(globalThis),
  gridId,
}: BcServerSyncedSavedViewStoreOptions): BcServerSyncedSavedViewStore<TRow> {
  if (typeof fetchImpl !== "function") {
    throw new Error("createServerSyncedSavedViewStore requires a fetch implementation.")
  }

  const baseEndpoint = endpoint.replace(/\/+$/, "")
  const listUrl = `${baseEndpoint}?gridId=${encodeURIComponent(gridId)}`
  const viewUrl = (viewId: string) => `${baseEndpoint}/${encodeURIComponent(viewId)}`

  const requestJson = async (url: string, init?: RequestInit): Promise<Response> => {
    const response = await fetchImpl(url, init)
    if (response.ok || response.status === 404 || response.status === 409) return response
    throw new Error(`Saved view sync request failed: ${response.status}`)
  }

  const readRemoteView = async (viewId: string): Promise<BcSavedView<TRow> | null> => {
    const response = await requestJson(viewUrl(viewId), { method: "GET" })
    if (response.status === 404) return null
    return migrateSavedViewLayout((await response.json()) as BcSavedViewInput<TRow>)
  }

  return {
    async list() {
      const response = await requestJson(listUrl, { method: "GET" })
      const rows = (await response.json()) as readonly BcSavedViewInput<TRow>[]
      return rows
        .map((view) => migrateSavedViewLayout(view))
        .filter((view) => view.gridId === gridId)
    },
    async getDefault() {
      const views = await this.list()
      return views.find((view) => view.isDefault) ?? null
    },
    async upsert(input) {
      const local = { ...migrateSavedViewLayout(input), gridId }
      const remote = await readRemoteView(local.id)
      if (remote && savedViewUpdatedAfter(remote.updatedAt, local.updatedAt)) {
        return { status: "conflict", local, remote }
      }

      const next: BcSavedView<TRow> = {
        ...local,
        updatedAt: new Date().toISOString(),
      }
      const response = await requestJson(viewUrl(next.id), {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(next),
      })
      if (response.status === 409) {
        const remoteConflict = migrateSavedViewLayout(
          (await response.json()) as BcSavedViewInput<TRow>,
        )
        return { status: "conflict", local: next, remote: remoteConflict }
      }
      return {
        status: "saved",
        view:
          response.status === 204
            ? next
            : migrateSavedViewLayout((await response.json()) as BcSavedViewInput<TRow>),
      }
    },
    async remove(viewId) {
      await requestJson(viewUrl(viewId), { method: "DELETE" })
    },
  }
}

export function applySavedViewLayout<TRow = unknown>(
  api: BcGridApi<TRow>,
  view: BcSavedViewInput<TRow>,
  applier: BcSavedViewLayoutApplier = {},
): void {
  const layout = migrateSavedViewLayout(view).layout

  if (layout.columnState !== undefined) {
    api.setColumnState([...cloneJsonLike(layout.columnState)])
  }
  if (layout.sort !== undefined) {
    api.setSort([...cloneJsonLike(layout.sort)])
  }
  if (hasOwn(layout, "filter")) {
    api.setFilter(cloneJsonLike(layout.filter ?? null))
  }
  if (layout.groupBy !== undefined) {
    applier.setGroupBy?.(cloneJsonLike(layout.groupBy))
  }
  if (layout.searchText !== undefined) {
    applier.setSearchText?.(layout.searchText)
  }
  if (layout.pagination !== undefined) {
    applier.setPagination?.(cloneJsonLike(layout.pagination))
  }
  if (layout.density !== undefined) {
    applier.setDensity?.(layout.density)
  }
  if (hasOwn(layout, "sidebarPanel")) {
    applier.setSidebarPanel?.(layout.sidebarPanel ?? null)
  }
}

function normalizeSavedViewLayout(layout: BcSavedViewLayoutInput): BcGridLayoutState {
  const next: BcGridLayoutState = { version: BC_SAVED_VIEW_VERSION }

  if (layout.columnState !== undefined) {
    next.columnState = cloneJsonLike(layout.columnState)
  }
  if (layout.sort !== undefined) {
    next.sort = cloneJsonLike(layout.sort)
  }
  if (hasOwn(layout, "filter")) {
    next.filter = cloneJsonLike(layout.filter ?? null)
  }
  if (layout.searchText !== undefined) {
    next.searchText = layout.searchText
  }
  if (layout.groupBy !== undefined) {
    next.groupBy = cloneJsonLike(layout.groupBy)
  }
  if (layout.density !== undefined) {
    next.density = layout.density
  }
  if (layout.pagination !== undefined) {
    next.pagination = cloneJsonLike(layout.pagination)
  }
  if (hasOwn(layout, "sidebarPanel")) {
    next.sidebarPanel = layout.sidebarPanel ?? null
  }

  return next
}

function createSavedViewId(): string {
  const randomUUID = globalThis.crypto?.randomUUID
  if (typeof randomUUID === "function") {
    return randomUUID.call(globalThis.crypto)
  }

  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).slice(2, 10)
  return `bc-view-${timestamp}-${random}`
}

function savedViewUpdatedAfter(remote: string | undefined, local: string | undefined): boolean {
  if (!remote) return false
  if (!local) return true
  const remoteTime = Date.parse(remote)
  const localTime = Date.parse(local)
  if (!Number.isFinite(remoteTime)) return false
  if (!Number.isFinite(localTime)) return true
  return remoteTime > localTime
}

function cloneJsonLike<T>(value: T): T {
  if (value == null) return value
  if (typeof globalThis.structuredClone === "function") {
    return globalThis.structuredClone(value)
  }
  return JSON.parse(JSON.stringify(value)) as T
}

function hasOwn<T extends object, K extends PropertyKey>(
  object: T,
  key: K,
): object is T & Record<K, unknown> {
  return Object.prototype.hasOwnProperty.call(object, key)
}

function assignOptional<T extends object, K extends keyof T>(target: T, key: K, value: T[K]): void {
  if (value !== undefined) {
    target[key] = value
  }
}
