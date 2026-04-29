export type CustomerStatus = "Active" | "On Hold" | "Past Due" | "Prospect"

export interface CustomerRow {
  id: string
  name: string
  email: string
  company: string
  tier: "Enterprise" | "Growth" | "Starter"
  region: "Northeast" | "Midwest" | "South" | "West" | "International"
  owner: string
  balance: number
  status: CustomerStatus
  created: string
}

const customerNames = [
  "Abbott Homes",
  "Northline Civil",
  "Westmere Projects",
  "Clearwater Plumbing",
  "Mariner Foods",
  "Bright Harbor Logistics",
  "Summit Retail Group",
  "Evergreen Clinics",
  "Riverview Manufacturing",
  "Blue Peak Energy",
  "Arden Office Supply",
  "Metroline Services",
  "Stonebridge Interiors",
  "Orchard Distribution",
  "Horizon Medical",
  "Cedar & Finch",
]

const domains = [
  "example.com",
  "bcgrid.test",
  "contoso.example",
  "northwind.example",
  "erp-demo.test",
]

const owners = [
  "Alex Chen",
  "Maya Singh",
  "Jordan Lee",
  "Priya Nair",
  "Taylor Brooks",
  "Morgan Reed",
  "Sam Carter",
  "Jamie Patel",
]

const statuses: CustomerStatus[] = ["Active", "On Hold", "Past Due", "Prospect"]
const tiers: CustomerRow["tier"][] = ["Enterprise", "Growth", "Starter"]
const regions: CustomerRow["region"][] = ["Northeast", "Midwest", "South", "West", "International"]

export const customerRows = createCustomerRows(1000)

export const packageRows = [
  { name: "@bc-grid/core", role: "Types and row/column state", phase: "Q1" },
  { name: "@bc-grid/virtualizer", role: "DOM windowing and pinned regions", phase: "Q1" },
  { name: "@bc-grid/animations", role: "Sort and row transition primitives", phase: "Q1" },
  { name: "@bc-grid/theming", role: "CSS variables and density tokens", phase: "Q1" },
  { name: "@bc-grid/react", role: "React adapter and examples surface", phase: "Q1" },
  { name: "@bc-grid/editors", role: "Editor contracts and built-ins", phase: "Q2" },
  { name: "@bc-grid/server-row-model", role: "Paged, infinite, and tree loading", phase: "Q4" },
]

function createCustomerRows(count: number): CustomerRow[] {
  const random = mulberry32(0x8f4c2d1)
  const start = Date.UTC(2024, 0, 1)
  const dayMs = 24 * 60 * 60 * 1000

  return Array.from({ length: count }, (_, index) => {
    const sequence = index + 1
    const customer = customerNames[index % customerNames.length] ?? "Customer"
    const suffix = Math.floor(random() * 900 + 100)
    const company = `${customer} ${suffix}`
    const domain = domains[index % domains.length]
    const emailName = customer
      .toLowerCase()
      .replaceAll("&", "and")
      .replaceAll(" ", ".")
      .replaceAll(/[^a-z.]/g, "")
    const balance = Math.round((random() * 115_000 + 1_250) / 25) * 25
    const created = new Date(start + Math.floor(random() * 820) * dayMs).toISOString()

    return {
      id: `CUS-${String(sequence).padStart(5, "0")}`,
      name: `${customer} ${sequence}`,
      email: `accounts.${emailName}@${domain}`,
      company,
      tier: tiers[Math.floor(random() * tiers.length)] ?? "Growth",
      region: regions[Math.floor(random() * regions.length)] ?? "West",
      owner: owners[Math.floor(random() * owners.length)] ?? "Alex Chen",
      balance,
      status: statuses[Math.floor(random() * statuses.length)] ?? "Active",
      created,
    }
  })
}

function mulberry32(initialSeed: number) {
  let seed = initialSeed

  return () => {
    seed += 0x6d2b79f5
    let value = seed
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}
