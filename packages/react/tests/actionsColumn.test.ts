import { describe, expect, test } from "bun:test"
import { shouldRenderActionsColumn } from "../src/actionsColumn"

describe("shouldRenderActionsColumn — gate predicate (v0.6 §1 server-grid-actions-column)", () => {
  // Lifted from `editGrid.tsx` 2026-05-03 so both `<BcEditGrid>` and
  // `<BcServerGrid>` apply the same rule. Pin the truth table so a
  // refactor that flips a branch silently breaks consumer wiring.

  test("returns false when no handler is wired", () => {
    expect(shouldRenderActionsColumn({})).toBe(false)
  })

  test("returns true when only onEdit is wired", () => {
    expect(shouldRenderActionsColumn({ onEdit: () => {} })).toBe(true)
  })

  test("returns true when only onDelete is wired", () => {
    expect(shouldRenderActionsColumn({ onDelete: () => {} })).toBe(true)
  })

  test("returns true when only onDiscardRowEdits is wired", () => {
    expect(shouldRenderActionsColumn({ onDiscardRowEdits: () => {} })).toBe(true)
  })

  test("returns true when only extraActions is wired (array form)", () => {
    expect(shouldRenderActionsColumn({ extraActions: [] })).toBe(true)
  })

  test("returns true when only extraActions is wired (function form)", () => {
    expect(shouldRenderActionsColumn({ extraActions: () => [] })).toBe(true)
  })

  test("hideActions=true overrides every other handler — column suppressed", () => {
    // The whole point of hideActions: a parent route can disable
    // the actions column without unwiring the handlers (which may
    // be load-bearing for other surfaces — context menu, etc.).
    expect(
      shouldRenderActionsColumn({
        hideActions: true,
        onEdit: () => {},
        onDelete: () => {},
        onDiscardRowEdits: () => {},
        extraActions: [],
      }),
    ).toBe(false)
  })

  test("hideActions=false is treated as 'not hidden' (default)", () => {
    expect(shouldRenderActionsColumn({ hideActions: false, onEdit: () => {} })).toBe(true)
  })

  test("hideActions=undefined is treated as 'not hidden' (default)", () => {
    expect(shouldRenderActionsColumn({ onEdit: () => {} })).toBe(true)
  })
})

describe("createActionsColumn — fixed shape (v0.6 §1 server-grid-actions-column)", () => {
  // Pin the column-id + pinned-edge + non-interactivity flags so a
  // refactor doesn't silently break the consumer's CSS targeting
  // `[data-column-id="__bc_actions"]` or the right-pin layout.
  const { createActionsColumn } = require("../src/actionsColumn")

  test("column id is fixed at __bc_actions for stable consumer targeting", () => {
    const column = createActionsColumn({
      canDelete: undefined,
      canEdit: undefined,
      deleteLabel: "Delete",
      discardLabel: "Discard",
      editLabel: "Edit",
      extraActions: undefined,
      onDelete: undefined,
      onDiscardRowEdits: undefined,
      onEdit: undefined,
    })
    expect(column.columnId).toBe("__bc_actions")
  })

  test("pinned right edge with fixed width / non-resizable / non-sortable", () => {
    const column = createActionsColumn({
      canDelete: undefined,
      canEdit: undefined,
      deleteLabel: "Delete",
      discardLabel: "Discard",
      editLabel: "Edit",
      extraActions: undefined,
      onDelete: undefined,
      onDiscardRowEdits: undefined,
      onEdit: undefined,
    })
    expect(column.pinned).toBe("right")
    expect(column.width).toBe(180)
    expect(column.sortable).toBe(false)
    expect(column.resizable).toBe(false)
    expect(column.filter).toBe(false)
    expect(column.editable).toBe(false)
    expect(column.groupable).toBe(false)
    expect(column.columnMenu).toBe(false)
    expect(column.align).toBe("center")
  })
})
