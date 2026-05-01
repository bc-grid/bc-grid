import { describe, expect, test } from "bun:test"
import type { ServerRowModelDiagnostics, ServerRowModelMode, ServerSelection } from "@bc-grid/core"
import { createServerRowModel } from "@bc-grid/server-row-model"
import { renderToStaticMarkup } from "react-dom/server"
import {
  formatServerGridStatusError,
  renderDefaultServerGridStatusOverlay,
  resolveServerGridLoading,
  resolveServerGridStatusOverlayParams,
} from "../src/serverGrid"

interface Row {
  id: string
  name: string
}

const emptySelection: ServerSelection = { mode: "explicit", rowIds: new Set() }

function diagnostics(mode: ServerRowModelMode): ServerRowModelDiagnostics {
  const model = createServerRowModel<Row>()
  const view = model.createViewState({
    groupBy: [],
    sort: [],
    visibleColumns: ["id", "name"],
  })
  return model.getDiagnostics({
    mode,
    rowCount: mode === "paged" ? 0 : "unknown",
    selection: emptySelection,
    view,
    viewKey: model.createViewKey(view),
  })
}

describe("server grid status overlay params", () => {
  test("describes loading state for all server row model modes", () => {
    for (const rowModel of ["paged", "infinite", "tree"] as const) {
      const params = resolveServerGridStatusOverlayParams({
        diagnostics: diagnostics(rowModel),
        error: null,
        loading: true,
        retry: () => {},
        rowModel,
      })

      expect(params).toMatchObject({
        error: null,
        message: "Loading server rows",
        rowModel,
        status: "loading",
      })
      expect(params?.diagnostics.mode).toBe(rowModel)
    }
  })

  test("normalises load errors and keeps the retry callback typed", () => {
    let retried = false
    const error = new Error("Network unavailable")
    const params = resolveServerGridStatusOverlayParams({
      diagnostics: diagnostics("paged"),
      error,
      loading: false,
      retry: () => {
        retried = true
      },
      rowModel: "paged",
    })

    expect(params).toMatchObject({
      error,
      errorMessage: "Network unavailable",
      message: "Failed to load rows",
      rowModel: "paged",
      status: "error",
    })

    params?.retry()
    expect(retried).toBe(true)
  })

  test("stays idle when neither loading nor error is active", () => {
    expect(
      resolveServerGridStatusOverlayParams({
        diagnostics: diagnostics("infinite"),
        error: null,
        loading: false,
        retry: () => {},
        rowModel: "infinite",
      }),
    ).toBeNull()
  })

  test("keeps the grid overlay visible for server errors until retry or load clears them", () => {
    expect(
      resolveServerGridLoading({
        serverError: new Error("failed"),
        serverLoading: false,
      }),
    ).toBe(true)

    expect(
      resolveServerGridLoading({
        loadingOverride: false,
        serverError: new Error("consumer owns loading"),
        serverLoading: true,
      }),
    ).toBe(false)
  })

  test("uses stable fallback copy for non-error throw values", () => {
    expect(formatServerGridStatusError("Gateway timed out")).toBe("Gateway timed out")
    expect(formatServerGridStatusError({ reason: "opaque" })).toBe("Failed to load rows")
  })
})

describe("server grid default status overlay markup", () => {
  test("renders a compact loading status without a retry button", () => {
    const params = resolveServerGridStatusOverlayParams({
      diagnostics: diagnostics("tree"),
      error: null,
      loading: true,
      retry: () => {},
      rowModel: "tree",
    })
    if (!params) throw new Error("expected loading status params")

    const html = renderToStaticMarkup(renderDefaultServerGridStatusOverlay(params))

    expect(html).toContain('class="bc-grid-server-status"')
    expect(html).toContain('data-state="loading"')
    expect(html).toContain('role="status"')
    expect(html).toContain("Loading server rows")
    expect(html).not.toContain("bc-grid-server-status-retry")
    expect(html).not.toContain("style=")
  })

  test("renders error detail and a retry action", () => {
    const params = resolveServerGridStatusOverlayParams({
      diagnostics: diagnostics("infinite"),
      error: "Upstream 503",
      loading: false,
      retry: () => {},
      rowModel: "infinite",
    })
    if (!params) throw new Error("expected error status params")

    const html = renderToStaticMarkup(renderDefaultServerGridStatusOverlay(params))

    expect(html).toContain('data-state="error"')
    expect(html).toContain('role="alert"')
    expect(html).toContain("Failed to load rows")
    expect(html).toContain("Upstream 503")
    expect(html).toContain('class="bc-grid-server-status-retry"')
    expect(html).toContain(">Retry</button>")
    expect(html).not.toContain("style=")
  })
})
