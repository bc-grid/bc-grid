import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { BcServerGridDefaultErrorOverlay, serverErrorMessage } from "../src/serverGrid"

// Worker1 v06 server-grid error boundary — focused tests for the
// pure helpers + default fallback overlay. Async loadPage rejection
// flow is exercised by the existing serverRowModel orchestration
// tests; these tests pin the error-surface UI contract that
// `<BcServerGrid>` falls back to when the consumer doesn't pass
// `renderServerError`.

describe("serverErrorMessage", () => {
  test("Error instance returns its message", () => {
    expect(serverErrorMessage(new Error("server hiccup"))).toBe("server hiccup")
  })

  test("Error with empty message falls back to default", () => {
    expect(serverErrorMessage(new Error(""))).toBe("Failed to load.")
  })

  test("string error returns the string", () => {
    expect(serverErrorMessage("network down")).toBe("network down")
  })

  test("null returns default", () => {
    expect(serverErrorMessage(null)).toBe("Failed to load.")
  })

  test("undefined returns default", () => {
    expect(serverErrorMessage(undefined)).toBe("Failed to load.")
  })

  test("object returns default", () => {
    expect(serverErrorMessage({ status: 500 })).toBe("Failed to load.")
  })
})

describe("BcServerGridDefaultErrorOverlay", () => {
  test("renders the error message and a Retry button", () => {
    const html = renderToStaticMarkup(
      <BcServerGridDefaultErrorOverlay error={new Error("boom")} retry={() => undefined} />,
    )
    expect(html).toContain("boom")
    expect(html).toContain('data-bc-grid-server-error-retry="true"')
    expect(html).toContain(">Retry<")
    expect(html).toContain('class="bc-grid-server-error"')
  })

  test("uses the theme error tokens", () => {
    const html = renderToStaticMarkup(
      <BcServerGridDefaultErrorOverlay error={new Error("boom")} retry={() => undefined} />,
    )
    // CSS custom-property fallbacks per types.ts comment.
    expect(html).toContain("--bc-grid-edit-state-error-fg")
    expect(html).toContain("--bc-grid-edit-state-error-border")
  })

  test("default message renders when error has no message", () => {
    const html = renderToStaticMarkup(
      <BcServerGridDefaultErrorOverlay error={null} retry={() => undefined} />,
    )
    expect(html).toContain("Failed to load.")
  })
})
