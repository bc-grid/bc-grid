import { describe, expect, test } from "bun:test"
import { resolveInitialGroupByColumns } from "../src/App"

describe("group-by discovery URL helper", () => {
  test("keeps grouping off by default", () => {
    expect(resolveInitialGroupByColumns("")).toEqual([])
    expect(resolveInitialGroupByColumns("?toolPanel=columns")).toEqual([])
  })

  test("maps boolean groupBy flags to the default Region demo", () => {
    expect(resolveInitialGroupByColumns("?groupBy=1")).toEqual(["region"])
    expect(resolveInitialGroupByColumns("?groupBy=true")).toEqual(["region"])
  })

  test("accepts single and multi-column group-by demos in URL order", () => {
    expect(resolveInitialGroupByColumns("?groupBy=region")).toEqual(["region"])
    expect(resolveInitialGroupByColumns("?groupBy=region,status")).toEqual(["region", "status"])
    expect(resolveInitialGroupByColumns("?groupBy=owner,terms,status")).toEqual([
      "owner",
      "terms",
      "status",
    ])
  })

  test("ignores empty, duplicate, and non-groupable column ids", () => {
    expect(resolveInitialGroupByColumns("?groupBy=missing,region,,status,region,balance")).toEqual([
      "region",
      "status",
    ])
  })
})
