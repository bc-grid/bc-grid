import type { ColumnId } from "@bc-grid/core"
import type { CSSProperties, ReactNode } from "react"

export interface ColumnVisibilityItem {
  columnId: ColumnId
  hideDisabled: boolean
  hidden: boolean
  label: string
}

export interface ColumnVisibilityMenuAnchor {
  x: number
  y: number
}

export interface ColumnVisibilityMenuProps {
  anchor: ColumnVisibilityMenuAnchor
  items: readonly ColumnVisibilityItem[]
  onClose: () => void
  onToggle: (columnId: ColumnId, hidden: boolean) => void
}

export function ColumnVisibilityMenu({
  anchor,
  items,
  onClose,
  onToggle,
}: ColumnVisibilityMenuProps): ReactNode {
  if (items.length === 0) return null

  return (
    <div
      aria-label="Column visibility"
      className="bc-grid-column-menu"
      role="menu"
      style={columnMenuPosition(anchor)}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="bc-grid-column-menu-title">Columns</div>
      {items.map((item) => {
        const checked = !item.hidden
        const label = `${checked ? "Hide" : "Show"} ${item.label}`
        return (
          <button
            aria-checked={checked}
            aria-label={label}
            className="bc-grid-column-menu-item"
            data-column-id={item.columnId}
            disabled={item.hideDisabled}
            key={item.columnId}
            onClick={(event) => {
              event.stopPropagation()
              onToggle(item.columnId, checked)
            }}
            role="menuitemcheckbox"
            type="button"
          >
            <span aria-hidden="true" className="bc-grid-column-menu-check">
              {checked ? "\u2713" : ""}
            </span>
            <span className="bc-grid-column-menu-label">{item.label}</span>
          </button>
        )
      })}
      <button className="bc-grid-column-menu-close" onClick={onClose} role="menuitem" type="button">
        Close
      </button>
    </div>
  )
}

function columnMenuPosition(anchor: ColumnVisibilityMenuAnchor): CSSProperties {
  return {
    left: anchor.x,
    top: anchor.y,
  }
}
