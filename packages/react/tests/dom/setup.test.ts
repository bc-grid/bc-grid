import { describe, expect, test } from "bun:test"
import { render, screen } from "@testing-library/react"
import { createElement } from "react"

describe("happy-dom React test setup", () => {
  test("registers DOM globals and renders with React Testing Library", () => {
    render(createElement("button", { type: "button" }, "Ready"))

    expect(document.body).toBeDefined()
    expect(screen.getByRole("button", { name: "Ready" }).tagName).toBe("BUTTON")
  })
})
