import {
  type CSSProperties,
  type ComponentType,
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react"
import { BcColumnsToolPanel } from "./columnToolPanel"
import { BcFiltersToolPanel } from "./filterToolPanel"
import { domToken } from "./gridInternals"
import { BcPivotToolPanel } from "./pivotToolPanel"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./shadcn/tabs"
import type { BcSidebarBuiltInPanel, BcSidebarContext, BcSidebarPanel } from "./types"

export const DEFAULT_SIDEBAR_WIDTH = 280

export interface ResolvedSidebarPanel<TRow = unknown> {
  id: string
  label: string
  Icon: ComponentType<{ className?: string }>
  render: (ctx: BcSidebarContext<TRow>) => ReactNode
}

export interface BcGridSidebarProps<TRow> {
  panels: readonly ResolvedSidebarPanel<TRow>[]
  activePanelId: string | null
  context: BcSidebarContext<TRow>
  domBaseId: string
  width?: number | undefined
  onActivePanelChange: (next: string | null) => void
}

export function BcGridSidebar<TRow>({
  panels,
  activePanelId,
  context,
  domBaseId,
  width,
  onActivePanelChange,
}: BcGridSidebarProps<TRow>): ReactNode {
  const activePanel = panels.find((panel) => panel.id === activePanelId) ?? null
  const panelRef = useRef<HTMLDivElement | null>(null)
  const pendingPanelFocusRef = useRef<string | null>(null)
  const lastTriggerPanelIdRef = useRef<string | null>(activePanelId)
  const tabRefs = useRef(new Map<string, HTMLButtonElement>())

  const sidebarWidth = resolveSidebarWidth(width)
  const ids = useMemo(
    () =>
      new Map(
        panels.map((panel) => [
          panel.id,
          {
            panel: `${domBaseId}-sidebar-panel-${domToken(panel.id)}`,
            tab: `${domBaseId}-sidebar-tab-${domToken(panel.id)}`,
          },
        ]),
      ),
    [domBaseId, panels],
  )

  useEffect(() => {
    if (!activePanelId || pendingPanelFocusRef.current !== activePanelId) return
    pendingPanelFocusRef.current = null
    panelRef.current?.focus()
  }, [activePanelId])

  useEffect(() => {
    if (activePanelId) lastTriggerPanelIdRef.current = activePanelId
  }, [activePanelId])

  const setTabRef = useCallback((id: string, node: HTMLButtonElement | null) => {
    if (node) tabRefs.current.set(id, node)
    else tabRefs.current.delete(id)
  }, [])

  const activatePanel = useCallback(
    (panelId: string, focusPanel: boolean) => {
      const next = nextSidebarPanelForActivation(activePanelId, panelId)
      lastTriggerPanelIdRef.current = panelId
      if (focusPanel && next) pendingPanelFocusRef.current = next
      onActivePanelChange(next)
    },
    [activePanelId, onActivePanelChange],
  )

  const focusPanelTab = useCallback((panelId: string) => {
    tabRefs.current.get(panelId)?.focus()
  }, [])

  const handleSidebarKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== "Escape" || !activePanelId) return
      event.preventDefault()
      event.stopPropagation()
      const returnPanelId = lastTriggerPanelIdRef.current ?? activePanelId
      onActivePanelChange(null)
      requestFocusFrame(() => focusPanelTab(returnPanelId))
    },
    [activePanelId, focusPanelTab, onActivePanelChange],
  )

  return (
    <aside
      className="bc-grid-sidebar"
      data-state={activePanel ? "open" : "collapsed"}
      style={{ "--bc-grid-sidebar-width": `${sidebarWidth}px` } as CSSProperties}
      onKeyDown={handleSidebarKeyDown}
    >
      <Tabs
        activationMode="manual"
        className="bc-grid-sidebar-tabs"
        orientation="vertical"
        value={activePanel?.id ?? ""}
      >
        <TabsList
          aria-label="Sidebar tools"
          aria-orientation="vertical"
          className="bc-grid-sidebar-rail"
          unstyled
        >
          {panels.map((panel) => {
            const panelIds = ids.get(panel.id)
            const Icon = panel.Icon
            return (
              <TabsTrigger
                key={panel.id}
                ref={(node) => setTabRef(panel.id, node)}
                className="bc-grid-sidebar-tab"
                id={panelIds?.tab}
                aria-label={panel.label}
                title={panel.label}
                unstyled
                value={panel.id}
                onClick={(event) => {
                  event.preventDefault()
                  activatePanel(panel.id, false)
                }}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " " && event.key !== "Spacebar") {
                    return
                  }
                  event.preventDefault()
                  activatePanel(panel.id, true)
                }}
              >
                <span className="bc-grid-sidebar-tab-icon" aria-hidden="true">
                  <Icon className="bc-grid-sidebar-icon" />
                </span>
              </TabsTrigger>
            )
          })}
        </TabsList>

        {panels.map((panel) => {
          const panelIds = ids.get(panel.id)
          const selected = panel.id === activePanel?.id
          return (
            <TabsContent
              key={panel.id}
              ref={selected ? panelRef : undefined}
              aria-labelledby={panelIds?.tab}
              className="bc-grid-sidebar-panel"
              id={panelIds?.panel}
              tabIndex={-1}
              unstyled
              value={panel.id}
            >
              {selected ? panel.render(context) : null}
            </TabsContent>
          )
        })}
      </Tabs>
    </aside>
  )
}

export function resolveSidebarPanels<TRow>(
  sidebar: readonly BcSidebarPanel<TRow>[] | undefined,
): readonly ResolvedSidebarPanel<TRow>[] {
  if (!sidebar || sidebar.length === 0) return []
  const seen = new Set<string>()
  const panels: ResolvedSidebarPanel<TRow>[] = []

  for (const entry of sidebar) {
    const panel = resolveSidebarPanel(entry)
    if (!panel || seen.has(panel.id)) continue
    seen.add(panel.id)
    panels.push(panel)
  }

  return panels
}

export function normalizeSidebarPanelId(
  panelId: string | null | undefined,
  panels: readonly { id: string }[],
): string | null {
  if (!panelId) return null
  return panels.some((panel) => panel.id === panelId) ? panelId : null
}

export function resolveInitialSidebarPanelId({
  defaultPanelId,
  persistedPanelId,
  panels,
}: {
  defaultPanelId: string | null | undefined
  persistedPanelId: string | null | undefined
  panels: readonly { id: string }[]
}): string | null {
  if (defaultPanelId !== undefined) return normalizeSidebarPanelId(defaultPanelId, panels)
  return normalizeSidebarPanelId(persistedPanelId, panels)
}

export function nextSidebarPanelForActivation(
  currentPanelId: string | null,
  requestedPanelId: string,
): string | null {
  return currentPanelId === requestedPanelId ? null : requestedPanelId
}

export function resolveSidebarWidth(width: number | undefined): number {
  return typeof width === "number" && Number.isFinite(width) && width > 0
    ? width
    : DEFAULT_SIDEBAR_WIDTH
}

function resolveSidebarPanel<TRow>(entry: BcSidebarPanel<TRow>): ResolvedSidebarPanel<TRow> | null {
  if (typeof entry === "string") return resolveBuiltInPanel(entry)
  const id = entry.id.trim()
  const label = entry.label.trim()
  if (!id || !label) return null
  return {
    id,
    label,
    Icon: entry.icon,
    render: entry.render,
  }
}

function resolveBuiltInPanel<TRow>(panelId: BcSidebarBuiltInPanel): ResolvedSidebarPanel<TRow> {
  const config = builtInSidebarPanels[panelId]
  return {
    id: panelId,
    label: config.label,
    Icon: config.Icon,
    render: (context) => {
      if (panelId === "columns") return <BcColumnsToolPanel context={context} />
      if (panelId === "filters") return <BcFiltersToolPanel context={context} />
      if (panelId === "pivot") return <BcPivotToolPanel context={context} />
      return <BuiltInPanelSlot panelId={panelId} label={config.label} />
    },
  }
}

interface BuiltInPanelConfig {
  label: string
  Icon: ComponentType<{ className?: string }>
}

const builtInSidebarPanels: Record<BcSidebarBuiltInPanel, BuiltInPanelConfig> = {
  columns: {
    label: "Columns",
    Icon: ColumnsIcon,
  },
  filters: {
    label: "Filters",
    Icon: FiltersIcon,
  },
  pivot: {
    label: "Pivot",
    Icon: PivotIcon,
  },
}

function requestFocusFrame(callback: () => void): void {
  if (typeof window === "undefined" || typeof window.requestAnimationFrame !== "function") {
    callback()
    return
  }
  window.requestAnimationFrame(callback)
}

function BuiltInPanelSlot({
  panelId,
  label,
}: {
  panelId: BcSidebarBuiltInPanel
  label: string
}): ReactNode {
  return (
    <section className="bc-grid-sidebar-panel-slot" data-bc-grid-sidebar-slot={panelId}>
      <h2 className="bc-grid-sidebar-panel-title">{label}</h2>
    </section>
  )
}

function ColumnsIcon({ className }: { className?: string }): ReactNode {
  return (
    <svg
      className={className}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="3" y="4" width="14" height="12" rx="1.5" />
      <path d="M7.5 4v12M12.5 4v12" />
    </svg>
  )
}

function FiltersIcon({ className }: { className?: string }): ReactNode {
  return (
    <svg
      className={className}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M3.5 5h13l-5 5.25v3.5l-3 1.5v-5z" />
    </svg>
  )
}

function PivotIcon({ className }: { className?: string }): ReactNode {
  return (
    <svg
      className={className}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M4 5h12M4 10h12M4 15h12M7 3v14M13 3v14" />
      <path d="M15.5 7.5 17 9l-1.5 1.5M4.5 12.5 3 11l1.5-1.5" />
    </svg>
  )
}
