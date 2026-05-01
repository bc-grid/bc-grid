import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { type ColumnVisibilityItem, ColumnVisibilityMenu } from "../src/columnVisibility"

const items: readonly ColumnVisibilityItem[] = [
  { columnId: "name", hidden: false, hideDisabled: false, label: "Name" },
  { columnId: "email", hidden: true, hideDisabled: false, label: "Email" },
  { columnId: "balance", hidden: false, hideDisabled: false, label: "Balance" },
]

function renderMenu(overrides: { items?: readonly ColumnVisibilityItem[] } = {}): string {
  return renderToStaticMarkup(
    <ColumnVisibilityMenu
      anchor={{ x: 240, y: 80 }}
      items={overrides.items ?? items}
      onClose={() => {}}
      onToggle={() => {}}
    />,
  )
}

describe("ColumnVisibilityMenu — SSR markup contract", () => {
  test("renders without throwing on the server (no `window` access at first paint)", () => {
    // The menu's positioning helper reads `window.innerWidth` on the
    // client; the SSR fallback path constructs a synthetic viewport so
    // the static render doesn't throw. This is the load-bearing
    // invariant that lets the menu be used in a Next.js app router or
    // similar SSR pipeline without tripping a hydration error.
    const html = renderMenu()
    expect(html).toContain('class="bc-grid-column-menu"')
    expect(html).toContain('role="menu"')
  })

  test("emits Radix-style data-state / data-side / data-align attributes on the menu root", () => {
    // After the popup-interaction-contracts cleanup the column chooser
    // mirrors the FilterPopup / context-menu attribute contract so
    // consumers can target every popup with the same CSS pattern.
    const html = renderMenu()
    expect(html).toContain('data-state="open"')
    expect(html).toContain('data-side="bottom"')
    expect(html).toContain('data-align="start"')
  })

  test("returns null markup when there are no items (guards a stray empty popover)", () => {
    expect(renderMenu({ items: [] })).toBe("")
  })

  test("each item carries data-checked when visible and disabled when hide is forbidden", () => {
    const html = renderMenu({
      items: [
        { columnId: "name", hidden: false, hideDisabled: true, label: "Name" },
        { columnId: "email", hidden: true, hideDisabled: false, label: "Email" },
      ],
    })
    // Visible column has the data-checked hook and the corresponding
    // accessibility-aria checked state.
    expect(html).toMatch(
      /data-checked="true"[^>]*aria-checked="true"|aria-checked="true"[^>]*data-checked="true"/,
    )
    // Hidden column does NOT carry data-checked (omitted-vs-false
    // semantics so CSS can use `[data-checked]` as an existence test).
    expect(html).not.toMatch(/data-column-id="email"[^>]*data-checked/)
    // hideDisabled column has the disabled attribute on the button.
    expect(html).toMatch(/data-column-id="name"[^>]*disabled|disabled[^>]*data-column-id="name"/)
  })
})

describe("ColumnVisibilityMenu — roving tabindex contract", () => {
  test("only the active item is in the Tab sequence; the rest are tabIndex=-1", () => {
    // Default: the first enabled item is the initial active index. The
    // roving-focus contract says only that item carries tabIndex=0;
    // every other menuitemcheckbox carries tabIndex=-1 so Tab from the
    // menu lands once and exits.
    const html = renderMenu()
    // First item ("name") starts active → tabIndex=0.
    expect(html).toMatch(
      /data-column-id="name"[^>]*tabindex="0"|tabindex="0"[^>]*data-column-id="name"/,
    )
    // Every other item carries tabIndex=-1.
    expect(html).toMatch(
      /data-column-id="email"[^>]*tabindex="-1"|tabindex="-1"[^>]*data-column-id="email"/,
    )
    expect(html).toMatch(
      /data-column-id="balance"[^>]*tabindex="-1"|tabindex="-1"[^>]*data-column-id="balance"/,
    )
  })

  test("the initial active index lands on the first ENABLED item, skipping disabled leaders", () => {
    // First two items are forbidden-to-hide (disabled for keyboard
    // nav); the third is enabled and should be the initial roving
    // target.
    const html = renderMenu({
      items: [
        { columnId: "name", hidden: false, hideDisabled: true, label: "Name" },
        { columnId: "email", hidden: false, hideDisabled: true, label: "Email" },
        { columnId: "balance", hidden: false, hideDisabled: false, label: "Balance" },
      ],
    })
    expect(html).toMatch(
      /data-column-id="balance"[^>]*tabindex="0"|tabindex="0"[^>]*data-column-id="balance"/,
    )
    // The leading disabled items are NOT in the Tab sequence.
    expect(html).toMatch(/data-column-id="name"[^>]*tabindex="-1"/)
    expect(html).toMatch(/data-column-id="email"[^>]*tabindex="-1"/)
  })

  test("when every item is disabled, no item carries tabIndex=0 (no roving target)", () => {
    // Pathological case — `useRovingFocus` returns activeIndex=-1
    // when every item is disabled, so no item should claim the Tab
    // sequence (Tab from the trigger skips the menu list entirely).
    const html = renderMenu({
      items: [
        { columnId: "name", hidden: false, hideDisabled: true, label: "Name" },
        { columnId: "email", hidden: false, hideDisabled: true, label: "Email" },
      ],
    })
    expect(html).not.toMatch(/tabindex="0"/)
  })
})
