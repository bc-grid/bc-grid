import { describe, expect, test } from "bun:test"
import {
  getPaginationWindow,
  isPaginationEnabled,
  normalisePageSizeOptions,
} from "../src/pagination"

describe("normalisePageSizeOptions", () => {
  test("keeps positive integer options, deduped and sorted", () => {
    expect(normalisePageSizeOptions([100, 25, 25, 50.7, 0, -1])).toEqual([25, 50, 100])
  })

  test("falls back to defaults when no usable options are supplied", () => {
    expect(normalisePageSizeOptions([])).toEqual([25, 50, 100, 250])
    expect(normalisePageSizeOptions(undefined)).toEqual([25, 50, 100, 250])
  })
})

describe("getPaginationWindow", () => {
  test("returns the requested page slice", () => {
    expect(getPaginationWindow(250, 1, 100)).toEqual({
      page: 1,
      pageSize: 100,
      pageCount: 3,
      totalRows: 250,
      startIndex: 100,
      endIndex: 200,
    })
  })

  test("clamps requested page to the available range", () => {
    expect(getPaginationWindow(250, 99, 100)).toMatchObject({
      page: 2,
      startIndex: 200,
      endIndex: 250,
    })
  })

  test("handles empty row sets as page 1 of 1", () => {
    expect(getPaginationWindow(0, 3, 50)).toEqual({
      page: 0,
      pageSize: 50,
      pageCount: 1,
      totalRows: 0,
      startIndex: 0,
      endIndex: 0,
    })
  })
})

describe("isPaginationEnabled", () => {
  test("explicit true forces pagination on regardless of dataset size", () => {
    expect(isPaginationEnabled(true, 0, 100)).toBe(true)
    expect(isPaginationEnabled(true, 5, 100)).toBe(true)
  })

  test("explicit false bypasses the threshold and stays off", () => {
    expect(isPaginationEnabled(false, 5_000, 100)).toBe(false)
  })

  test("undefined auto-enables once rowCount exceeds pageSize", () => {
    expect(isPaginationEnabled(undefined, 99, 100)).toBe(false)
    expect(isPaginationEnabled(undefined, 100, 100)).toBe(false)
    expect(isPaginationEnabled(undefined, 101, 100)).toBe(true)
  })

  test("undefined stays off for small/empty datasets", () => {
    expect(isPaginationEnabled(undefined, 0, 100)).toBe(false)
    expect(isPaginationEnabled(undefined, 50, 100)).toBe(false)
  })
})
