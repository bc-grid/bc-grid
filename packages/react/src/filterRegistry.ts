import { type BcFilterDefinition, getFilterDefinition, registerFilter } from "@bc-grid/filters"
import type { BcReactFilterDefinition } from "./types"

const reactFilterDefinitions = new Map<string, BcReactFilterDefinition>()
const reportedUnknownFilterTypes = new Set<string>()

export function registerReactFilterDefinition(definition: BcReactFilterDefinition): void {
  registerFilter(definition as BcFilterDefinition)
  reactFilterDefinitions.set(definition.type, definition)
}

export function getReactFilterDefinition(type: string): BcReactFilterDefinition | undefined {
  return reactFilterDefinitions.get(type) ?? (getFilterDefinition(type) as BcReactFilterDefinition)
}

export function reportUnknownFilterDefinition(type: string, surface: string): void {
  if (isProduction() || reportedUnknownFilterTypes.has(type)) return
  reportedUnknownFilterTypes.add(type)
  console.error(
    `[bc-grid] Unknown filter type "${type}" in ${surface}. Register it with registerReactFilterDefinition() or @bc-grid/filters.registerFilter().`,
  )
}

function isProduction(): boolean {
  return typeof process !== "undefined" && process.env.NODE_ENV === "production"
}
