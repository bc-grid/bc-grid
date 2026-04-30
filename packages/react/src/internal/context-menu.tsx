import type { CSSProperties, KeyboardEvent, ReactNode } from "react"
import type { BcContextMenuContext, BcContextMenuCustomItem, BcContextMenuItem } from "../types"

export interface BcGridContextMenuAnchor {
  x: number
  y: number
}

export interface BcGridContextMenuProps<TRow> {
  anchor: BcGridContextMenuAnchor
  context: BcContextMenuContext<TRow>
  items: readonly BcContextMenuItem<TRow>[]
  onClose: () => void
  onSelect: (item: BcContextMenuItem<TRow>, context: BcContextMenuContext<TRow>) => void
}

export function BcGridContextMenu<TRow>({
  anchor,
  context,
  items,
  onClose,
  onSelect,
}: BcGridContextMenuProps<TRow>): ReactNode {
  if (items.length === 0) return null

  const activate = (item: BcContextMenuItem<TRow>) => {
    if (isSeparator(item) || menuItemDisabled(item, context)) return
    onSelect(item, context)
    onClose()
  }
  const firstItem = firstMenuItem(items)

  return (
    <div
      aria-label="Context menu"
      className="bc-grid-context-menu"
      onContextMenu={(event) => event.preventDefault()}
      onKeyDown={(event) => handleContextMenuKeyDown(event, onClose)}
      role="menu"
      style={contextMenuStyle(anchor)}
    >
      {items.map((item) => {
        if (isSeparator(item)) {
          return (
            <div
              aria-orientation="horizontal"
              className="bc-grid-context-menu-separator"
              key={item}
              role="separator"
              tabIndex={-1}
            />
          )
        }

        const custom = isCustom(item)
        const label = custom ? item.label : builtInLabel(item)
        const disabled = menuItemDisabled(item, context)
        const title =
          disabled && (item === "export-csv" || item === "export-xlsx") ? "Coming soon" : undefined
        return (
          <button
            aria-disabled={disabled || undefined}
            className="bc-grid-context-menu-item"
            data-destructive={(custom && item.destructive) || undefined}
            disabled={disabled}
            key={custom ? item.id : item}
            onClick={(event) => {
              event.stopPropagation()
              activate(item)
            }}
            onMouseEnter={(event) => event.currentTarget.focus({ preventScroll: true })}
            ref={item === firstItem ? focusMenuItem : undefined}
            role="menuitem"
            title={title}
            type="button"
          >
            <span className="bc-grid-context-menu-label">{label}</span>
          </button>
        )
      })}
    </div>
  )
}

function handleContextMenuKeyDown(event: KeyboardEvent<HTMLDivElement>, onClose: () => void): void {
  if (event.key === "Escape") {
    event.preventDefault()
    onClose()
    return
  }
}

function focusMenuItem(element: HTMLButtonElement | null): void {
  element?.focus({ preventScroll: true })
}

function firstMenuItem<TRow>(
  items: readonly BcContextMenuItem<TRow>[],
): BcContextMenuItem<TRow> | undefined {
  return items.find((item) => !isSeparator(item))
}

function isSeparator<TRow>(item: BcContextMenuItem<TRow>): item is "separator" {
  return item === "separator"
}

function isCustom<TRow>(item: BcContextMenuItem<TRow>): item is BcContextMenuCustomItem<TRow> {
  return typeof item === "object"
}

function builtInLabel(item: string): string {
  if (item === "copy") return "Copy"
  if (item === "copy-with-headers") return "Copy with Headers"
  if (item === "export-csv") return "Export CSV"
  if (item === "export-xlsx") return "Export Excel"
  return ""
}

function menuItemDisabled<TRow>(
  item: BcContextMenuItem<TRow>,
  context: BcContextMenuContext<TRow>,
): boolean {
  if (isCustom(item)) {
    if (typeof item.disabled === "function") return item.disabled(context)
    return item.disabled === true
  }
  return item !== "copy" && item !== "copy-with-headers"
    ? true
    : context.cell == null || context.row == null || context.column == null
}

function contextMenuStyle(anchor: BcGridContextMenuAnchor): CSSProperties {
  const margin = 8
  const width = 256
  const viewportWidth = typeof window === "undefined" ? width + margin * 2 : window.innerWidth
  return {
    left: Math.min(Math.max(margin, anchor.x), Math.max(margin, viewportWidth - width - margin)),
    top: Math.max(margin, anchor.y),
  }
}
