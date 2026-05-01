import { describe, expect, test } from "bun:test"
import {
  ASYNC_DETAIL_PANEL_HEIGHT,
  type AsyncMasterRow,
  childDetailRowKey,
  resolveAsyncDetailPanelState,
} from "../src/masterDetailAsyncExample"

const readyRow = {
  childError: undefined,
  childRows: [
    {
      id: "child-1",
      label: "Budget review",
      owner: "Operations",
      updatedAt: "2026-04-30",
    },
  ],
  childStatus: "ready",
  id: "project-1",
  name: "Implementation project",
} as const satisfies AsyncMasterRow

describe("master/detail async example helpers", () => {
  test("uses a stable fixed panel height across async child states", () => {
    expect(ASYNC_DETAIL_PANEL_HEIGHT).toBe(220)
  })

  test("builds stable nested row keys from parent and child identity", () => {
    const renamedChild = { ...readyRow.childRows[0], label: "Renamed review" }

    expect(childDetailRowKey(readyRow.id, readyRow.childRows[0])).toBe("project-1:child-1")
    expect(childDetailRowKey(readyRow.id, renamedChild)).toBe("project-1:child-1")
  })

  test("normalizes ready, loading, empty, and error states", () => {
    expect(resolveAsyncDetailPanelState(readyRow)).toMatchObject({
      kind: "ready",
      rows: readyRow.childRows,
      title: "Details for Implementation project",
    })
    expect(resolveAsyncDetailPanelState({ ...readyRow, childStatus: "loading" })).toMatchObject({
      kind: "loading",
      live: "polite",
      role: "status",
    })
    expect(
      resolveAsyncDetailPanelState({ ...readyRow, childRows: [], childStatus: "ready" }),
    ).toMatchObject({
      kind: "empty",
      title: "No details for Implementation project",
    })
    expect(
      resolveAsyncDetailPanelState({
        ...readyRow,
        childError: "The child API timed out.",
        childStatus: "error",
      }),
    ).toMatchObject({
      kind: "error",
      message: "The child API timed out.",
      role: "alert",
    })
  })
})
