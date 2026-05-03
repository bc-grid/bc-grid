import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  KeyboardEvent,
  MouseEvent,
  ReactNode,
} from "react"
import { forwardRef } from "react"

/**
 * Shared internal primitive for a single shadcn/Radix-style menu row.
 *
 * Both the context menu (`BcGridContextMenu`) and the column-visibility
 * menu (`ColumnVisibilityMenu`) render rows with the same shape — a
 * fixed-height row with a leading icon slot, a flex-1 label, and an
 * optional trailing slot — but they previously open-coded the markup
 * twice. That duplication means small inconsistencies creep in (e.g.,
 * one hover state firing on `data-active`, the other on `:hover`; one
 * using `aria-disabled`, the other `:disabled`). This primitive
 * centralises the markup so the two surfaces stay aligned.
 *
 * **Not exported from `@bc-grid/react`** — internal-only. Consumers
 * should keep using `contextMenuItems` / `BcReactGridColumn` to drive
 * the menus; the primitive is an implementation detail of the
 * renderers.
 *
 * **Class-name strategy.** Each variant emits BOTH the new shared
 * `bc-grid-menu-item` class AND the legacy variant-specific class
 * (`bc-grid-context-menu-item` for action items,
 * `bc-grid-column-menu-item` for check items). The shared class is the
 * forward-looking hook; the legacy classes keep the existing CSS
 * working without churn so the primitive can land without a styles
 * sweep. A follow-up CSS slice can collapse the duplicated rules.
 */

interface MenuItemBaseProps {
  /** Highlighted-row state — set by the menu renderer's roving focus. */
  active?: boolean
  /**
   * Disabled state. Prevents activation, sets `aria-disabled` on the
   * `<div role="menuitem">` and the native `disabled` attribute on the
   * `<button>` check-item.
   */
  disabled?: boolean
  /**
   * Leading icon / glyph slot. The renderer wraps it in
   * `.bc-grid-context-menu-icon` so the existing icon CSS keeps
   * applying. Pass `null` when the row has no icon (the slot still
   * renders for layout consistency, just empty).
   */
  leading?: ReactNode
  label: ReactNode
  /** Optional trailing slot (e.g., a keyboard shortcut hint). */
  trailing?: ReactNode
}

export interface BcGridMenuItemProps
  extends MenuItemBaseProps,
    Omit<HTMLAttributes<HTMLDivElement>, "role" | "aria-disabled" | "children"> {
  /** Activate handler — fired on click or Enter/Space. */
  onActivate?: () => void
}

export interface BcGridMenuToggleItemProps
  extends Omit<MenuItemBaseProps, "leading">,
    Omit<HTMLAttributes<HTMLDivElement>, "role" | "aria-disabled" | "aria-checked" | "children"> {
  checked: boolean
  onActivate?: () => void
}

export function BcGridMenuToggleItem({
  active,
  checked,
  disabled,
  label,
  trailing,
  className,
  onActivate,
  onClick,
  onKeyDown,
  onMouseEnter,
  ...rest
}: BcGridMenuToggleItemProps): ReactNode {
  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    onClick?.(event)
    if (event.defaultPrevented || disabled) return
    onActivate?.()
  }
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(event)
    if (event.defaultPrevented || disabled) return
    if (event.key !== "Enter" && event.key !== " ") return
    event.preventDefault()
    event.stopPropagation()
    onActivate?.()
  }
  return (
    <div
      {...rest}
      aria-checked={checked}
      aria-disabled={disabled || undefined}
      className={composeClassName("bc-grid-menu-item bc-grid-context-menu-item", className)}
      data-active={active || undefined}
      data-state={checked ? "checked" : "unchecked"}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onMouseEnter={onMouseEnter}
      role="menuitemcheckbox"
      tabIndex={-1}
    >
      <span aria-hidden="true" className="bc-grid-menu-item-leading bc-grid-context-menu-icon">
        {checked ? <CheckmarkIcon /> : null}
      </span>
      <span className="bc-grid-menu-item-label bc-grid-context-menu-label">{label}</span>
      {trailing != null ? (
        <span className="bc-grid-menu-item-trailing" aria-hidden="true">
          {trailing}
        </span>
      ) : null}
    </div>
  )
}

export function BcGridMenuItem({
  active,
  disabled,
  leading,
  label,
  trailing,
  className,
  onActivate,
  onClick,
  onKeyDown,
  onMouseEnter,
  ...rest
}: BcGridMenuItemProps): ReactNode {
  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    onClick?.(event)
    if (event.defaultPrevented || disabled) return
    onActivate?.()
  }
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(event)
    if (event.defaultPrevented || disabled) return
    if (event.key !== "Enter" && event.key !== " ") return
    event.preventDefault()
    event.stopPropagation()
    onActivate?.()
  }
  return (
    <div
      {...rest}
      aria-disabled={disabled || undefined}
      className={composeClassName("bc-grid-menu-item bc-grid-context-menu-item", className)}
      data-active={active || undefined}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onMouseEnter={onMouseEnter}
      role="menuitem"
      tabIndex={-1}
    >
      <span aria-hidden="true" className="bc-grid-menu-item-leading bc-grid-context-menu-icon">
        {leading}
      </span>
      <span className="bc-grid-menu-item-label bc-grid-context-menu-label">{label}</span>
      {trailing != null ? (
        <span className="bc-grid-menu-item-trailing" aria-hidden="true">
          {trailing}
        </span>
      ) : null}
    </div>
  )
}

export interface BcGridMenuCheckItemProps
  extends Omit<
    ButtonHTMLAttributes<HTMLButtonElement>,
    "role" | "aria-checked" | "type" | "children"
  > {
  /** Selected state — drives `aria-checked` + the leading checkmark. */
  checked: boolean
  disabled?: boolean
  label: ReactNode
}

export const BcGridMenuCheckItem = forwardRef<HTMLButtonElement, BcGridMenuCheckItemProps>(
  function BcGridMenuCheckItem(
    { checked, disabled, label, className, onClick, ...rest },
    ref,
  ): ReactNode {
    return (
      <button
        {...rest}
        aria-checked={checked}
        className={composeClassName("bc-grid-menu-item bc-grid-column-menu-item", className)}
        data-checked={checked || undefined}
        disabled={disabled}
        onClick={onClick}
        ref={ref}
        role="menuitemcheckbox"
        type="button"
      >
        <span aria-hidden="true" className="bc-grid-menu-item-leading bc-grid-column-menu-check">
          {checked ? <CheckmarkIcon /> : null}
        </span>
        <span className="bc-grid-menu-item-label bc-grid-column-menu-label">{label}</span>
      </button>
    )
  },
)

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

function composeClassName(base: string, extra?: string | undefined): string {
  if (!extra) return base
  return `${base} ${extra}`
}
