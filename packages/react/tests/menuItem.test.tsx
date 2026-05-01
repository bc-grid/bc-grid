import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { BcGridMenuCheckItem, BcGridMenuItem } from "../src/internal/menu-item"

function countMatches(haystack: string, needle: string): number {
  let count = 0
  let i = haystack.indexOf(needle)
  while (i !== -1) {
    count++
    i = haystack.indexOf(needle, i + needle.length)
  }
  return count
}

describe("BcGridMenuItem", () => {
  test("renders a menuitem div with both shared + legacy class names", () => {
    // The primitive emits the shared `bc-grid-menu-item` class as the
    // forward-looking hook plus the legacy `bc-grid-context-menu-item`
    // class so existing CSS keeps applying without churn. Both must
    // appear so a follow-up CSS slice can collapse the rules cleanly.
    const html = renderToStaticMarkup(<BcGridMenuItem label="Copy" />)

    expect(html).toContain('role="menuitem"')
    expect(html).toContain("bc-grid-menu-item")
    expect(html).toContain("bc-grid-context-menu-item")
  })

  test("disabled state surfaces aria-disabled and a `not-allowed` cursor selector hook", () => {
    const html = renderToStaticMarkup(<BcGridMenuItem label="Copy" disabled />)

    expect(html).toContain('aria-disabled="true"')
    // The renderer reads aria-disabled to skip keyboard / pointer
    // activation; the existing CSS uses the same attribute selector.
  })

  test("active state emits data-active=true; inactive omits the attribute (not 'false')", () => {
    // CSS selectors should target [data-active="true"], not the absence
    // of "false" — emit the attribute only in the active branch.
    const active = renderToStaticMarkup(<BcGridMenuItem label="Copy" active />)
    expect(active).toContain('data-active="true"')

    const inactive = renderToStaticMarkup(<BcGridMenuItem label="Copy" />)
    expect(inactive).not.toMatch(/data-active="(true|false)"/)
  })

  test("renders the leading + label + (optional) trailing slots", () => {
    const html = renderToStaticMarkup(
      <BcGridMenuItem label="Copy" leading={<span data-testid="icon">i</span>} trailing="⌘C" />,
    )

    expect(html).toContain("bc-grid-menu-item-leading")
    expect(html).toContain("bc-grid-context-menu-icon")
    expect(html).toContain('data-testid="icon"')
    expect(html).toContain("bc-grid-menu-item-label")
    expect(html).toContain("bc-grid-context-menu-label")
    expect(html).toContain(">Copy<")
    expect(html).toContain("bc-grid-menu-item-trailing")
    expect(html).toContain(">⌘C<")
  })

  test("trailing slot is omitted entirely when not supplied", () => {
    const html = renderToStaticMarkup(<BcGridMenuItem label="Copy" />)

    expect(html).not.toContain("bc-grid-menu-item-trailing")
  })

  test("forwards additional props (id, data-*) and HTML attributes to the root", () => {
    // The primitive extends HTMLAttributes so callers can pass id /
    // data-* / event handlers without a per-attr passthrough.
    const html = renderToStaticMarkup(
      <BcGridMenuItem label="Copy" id="ctx-item-3" data-column-id="status" />,
    )

    expect(html).toContain('id="ctx-item-3"')
    expect(html).toContain('data-column-id="status"')
  })

  test("forwarded role / aria-disabled / children props on the wrapper are honoured by the primitive (not overridden by the consumer)", () => {
    // The Omit on the public type prevents a consumer from passing
    // `role` or `aria-disabled` directly; the primitive owns those.
    // This test pins the omission contract by spot-checking the
    // primitive's own values appear in the markup.
    const html = renderToStaticMarkup(<BcGridMenuItem label="Copy" disabled />)

    expect(html).toContain('role="menuitem"')
    expect(html).toContain('aria-disabled="true"')
    // tabIndex={-1} is set on every menu row so the menu owns roving
    // focus via aria-activedescendant rather than per-row tab stops.
    expect(html).toContain('tabindex="-1"')
  })
})

describe("BcGridMenuCheckItem", () => {
  test("renders a button with role=menuitemcheckbox + both shared + legacy class names", () => {
    const html = renderToStaticMarkup(<BcGridMenuCheckItem checked={false} label="Status" />)

    expect(html).toContain('role="menuitemcheckbox"')
    expect(html).toContain('type="button"')
    expect(html).toContain("bc-grid-menu-item")
    expect(html).toContain("bc-grid-column-menu-item")
  })

  test("checked drives aria-checked + data-checked + the checkmark glyph", () => {
    const checked = renderToStaticMarkup(<BcGridMenuCheckItem checked label="Status" />)
    const unchecked = renderToStaticMarkup(<BcGridMenuCheckItem checked={false} label="Status" />)

    expect(checked).toContain('aria-checked="true"')
    expect(checked).toContain('data-checked="true"')
    // SVG path is the visible shadcn-style checkmark; presence is the
    // checkbox-state signal for sighted users.
    expect(checked).toContain("M3 8.5 6.5 12 13 4.5")

    expect(unchecked).toContain('aria-checked="false"')
    expect(unchecked).not.toContain('data-checked="true"')
    // The leading slot still renders for layout consistency, just with
    // no checkmark inside.
    expect(unchecked).toContain("bc-grid-column-menu-check")
    expect(unchecked).not.toContain("M3 8.5 6.5 12 13 4.5")
  })

  test("disabled emits the native :disabled attribute (not aria-disabled)", () => {
    // Buttons natively support :disabled — using it lets the browser
    // suppress focus + click without an extra ARIA attribute. The
    // existing CSS uses the :disabled pseudo-class.
    const html = renderToStaticMarkup(
      <BcGridMenuCheckItem checked={false} label="Status" disabled />,
    )

    expect(html).toMatch(
      /role="menuitemcheckbox"[^>]*disabled|disabled[^>]*role="menuitemcheckbox"/,
    )
    // Should NOT also emit aria-disabled — that's the action-item path.
    expect(html).not.toContain("aria-disabled")
  })

  test("forwards aria-label, data-column-id, and other button-level props", () => {
    const html = renderToStaticMarkup(
      <BcGridMenuCheckItem
        aria-label="Hide Status"
        checked
        data-column-id="status"
        label="Status"
      />,
    )

    expect(html).toContain('aria-label="Hide Status"')
    expect(html).toContain('data-column-id="status"')
    // The label slot still renders the visible label; aria-label is
    // for AT, the inner span is for sighted users.
    expect(html).toContain(">Status<")
  })

  test("renders exactly one leading slot and one label slot per row", () => {
    // Guard against accidental duplicate-slot regressions if the JSX
    // is refactored in the future.
    const html = renderToStaticMarkup(<BcGridMenuCheckItem checked label="Status" />)

    expect(countMatches(html, "bc-grid-menu-item-leading")).toBe(1)
    expect(countMatches(html, "bc-grid-menu-item-label")).toBe(1)
  })
})

describe("menu-item primitive — shared markup contract", () => {
  // Both BcGridMenuItem and BcGridMenuCheckItem must agree on
  // user-facing markup invariants so the two menu surfaces look and
  // behave consistently. These cross-component tests pin the shared
  // contract.
  test("both variants emit the same `bc-grid-menu-item` shared class as their first class hook", () => {
    const action = renderToStaticMarkup(<BcGridMenuItem label="Copy" />)
    const check = renderToStaticMarkup(<BcGridMenuCheckItem checked={false} label="Status" />)

    expect(action).toMatch(/class="bc-grid-menu-item /)
    expect(check).toMatch(/class="bc-grid-menu-item /)
  })

  test("both variants render a leading slot first and a label slot second", () => {
    // The DOM order is the visible reading order. Pin it so a future
    // refactor that swaps slot order surfaces a test failure.
    const action = renderToStaticMarkup(<BcGridMenuItem label="Copy" leading={<span>i</span>} />)
    const check = renderToStaticMarkup(<BcGridMenuCheckItem checked label="Status" />)

    for (const html of [action, check]) {
      const leadingIndex = html.indexOf("bc-grid-menu-item-leading")
      const labelIndex = html.indexOf("bc-grid-menu-item-label")
      expect(leadingIndex).toBeGreaterThan(-1)
      expect(labelIndex).toBeGreaterThan(-1)
      expect(leadingIndex).toBeLessThan(labelIndex)
    }
  })
})
