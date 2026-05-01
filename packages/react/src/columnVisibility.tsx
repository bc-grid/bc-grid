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
      <div className="bc-grid-column-menu-list">
        {items.map((item) => {
          const checked = !item.hidden
          const label = `${checked ? "Hide" : "Show"} ${item.label}`
          return (
            <button
              aria-checked={checked}
              aria-label={label}
              className="bc-grid-column-menu-item"
              data-checked={checked || undefined}
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
                {checked ? <CheckmarkIcon /> : null}
              </span>
              <span className="bc-grid-column-menu-label">{item.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function CheckmarkIcon(): ReactNode {
  // Inline 12x12 checkmark — tracks shadcn's DropdownMenuCheckboxItem
  // visual style. currentColor + stroke so it picks up the surrounding
  // text colour for both light + dark themes.
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="12"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 16 16"
      width="12"
    >
      <path d="M3 8.5 6.5 12 13 4.5" />
    </svg>
  )
}

function columnMenuPosition(anchor: ColumnVisibilityMenuAnchor): CSSProperties {
  return {
    left: anchor.x,
    top: anchor.y,
  }
}
