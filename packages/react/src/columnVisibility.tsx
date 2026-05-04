import type { ColumnId } from "@bc-grid/core"
import type { CSSProperties, ReactNode } from "react"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "./shadcn/dropdown-menu"

export interface ColumnVisibilityItem {
  columnId: ColumnId
  hideDisabled: boolean
  hidden: boolean
  label: string
}

export interface ColumnVisibilityMenuAnchor {
  restoreFocus?: HTMLElement | null
  x: number
  y: number
}

export interface ColumnVisibilityMenuProps {
  anchor: ColumnVisibilityMenuAnchor
  items: readonly ColumnVisibilityItem[]
  onClose: () => void
  onToggle: (columnId: ColumnId, hidden: boolean) => void
}

const COLUMN_MENU_VIEWPORT_MARGIN = 8

export function ColumnVisibilityMenu({
  anchor,
  items,
  onClose,
  onToggle,
}: ColumnVisibilityMenuProps): ReactNode {
  if (items.length === 0) return null

  return (
    <DropdownMenu
      modal={false}
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DropdownMenuTrigger
        aria-label="Column visibility"
        style={columnMenuTriggerStyle(anchor)}
        tabIndex={-1}
        type="button"
      />
      <DropdownMenuContent
        align="start"
        aria-label="Column visibility"
        className="bc-grid-column-menu"
        collisionPadding={COLUMN_MENU_VIEWPORT_MARGIN}
        side="bottom"
        sideOffset={0}
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          anchor.restoreFocus?.focus({ preventScroll: true })
        }}
        onContextMenu={(event) => event.preventDefault()}
      >
        <DropdownMenuLabel className="bc-grid-column-menu-title">Columns</DropdownMenuLabel>
        <div className="bc-grid-column-menu-list">
          {items.map((item) => {
            const checked = !item.hidden
            const label = `${checked ? "Hide" : "Show"} ${item.label}`
            return (
              <DropdownMenuCheckboxItem
                aria-label={label}
                checked={checked}
                className="bc-grid-menu-item bc-grid-column-menu-item"
                data-checked={checked || undefined}
                data-column-id={item.columnId}
                disabled={item.hideDisabled}
                key={item.columnId}
                onCheckedChange={(nextChecked) => {
                  onToggle(item.columnId, nextChecked !== true)
                }}
                onSelect={(event) => {
                  event.preventDefault()
                }}
              >
                <span className="bc-grid-menu-item-label bc-grid-column-menu-label">
                  {item.label}
                </span>
              </DropdownMenuCheckboxItem>
            )
          })}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function columnMenuTriggerStyle(anchor: ColumnVisibilityMenuAnchor): CSSProperties {
  return {
    position: "fixed",
    left: anchor.x,
    top: anchor.y,
    width: 0,
    height: 0,
    overflow: "hidden",
    border: 0,
    padding: 0,
  }
}
