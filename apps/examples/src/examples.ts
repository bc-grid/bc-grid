export type CustomerStatus = "Open" | "Credit Hold" | "Past Due" | "Disputed"

export interface CustomerRow {
  id: string
  account: string
  legalName: string
  tradingName: string
  region: "Northeast" | "Midwest" | "South" | "West" | "International"
  owner: string
  terms: "Net 15" | "Net 30" | "Net 45" | "Net 60"
  creditLimit: number
  balance: number
  current: number
  days1to30: number
  days31to60: number
  daysOver60: number
  openInvoices: number
  riskScore: number
  status: CustomerStatus
  lastInvoice: string
  lastPayment: string
  /**
   * Daily invoice cutoff time in `HH:mm` 24h form. Orders placed after
   * this time roll into the next day's invoicing batch — a realistic
   * ERP scheduling field. Used by the editor-time demo + e2e.
   */
  cutoffTime: string
  /**
   * Next scheduled call/email follow-up in `YYYY-MM-DDTHH:mm` form
   * (local wall-clock, no timezone). Realistic ERP scheduling field.
   * Used by the editor-datetime demo + e2e.
   */
  nextScheduledCall: string
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

const statuses: CustomerStatus[] = ["Open", "Credit Hold", "Past Due", "Disputed"]
const regions: CustomerRow["region"][] = ["Northeast", "Midwest", "South", "West", "International"]
const terms: CustomerRow["terms"][] = ["Net 15", "Net 30", "Net 45", "Net 60"]

export const customerRows = createCustomerRows(5000)

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
    const current = money(random() * 42_000)
    const days1to30 = money(random() * 28_000)
    const days31to60 = money(random() * 16_000)
    const daysOver60 = money(random() * 11_000)
    const balance = current + days1to30 + days31to60 + daysOver60
    const creditLimit = money(balance + random() * 160_000 + 20_000)
    const riskScore = Math.min(
      99,
      Math.round((daysOver60 / Math.max(balance, 1)) * 120 + random() * 35),
    )
    const invoiceOffset = Math.floor(random() * 60)
    const paymentOffset = Math.floor(random() * 90)

    return {
      id: `AR-${String(sequence).padStart(5, "0")}`,
      account: `CUST-${String(sequence).padStart(5, "0")}`,
      legalName: `${customer} Pty Ltd ${suffix}`,
      tradingName: `${customer} ${sequence}`,
      region: regions[Math.floor(random() * regions.length)] ?? "West",
      owner: owners[Math.floor(random() * owners.length)] ?? "Alex Chen",
      terms: terms[Math.floor(random() * terms.length)] ?? "Net 30",
      creditLimit,
      balance,
      current,
      days1to30,
      days31to60,
      daysOver60,
      openInvoices: Math.max(1, Math.round(random() * 18)),
      riskScore,
      status: statuses[Math.floor(random() * statuses.length)] ?? "Open",
      lastInvoice: new Date(start + (820 - invoiceOffset) * dayMs).toISOString(),
      lastPayment: new Date(start + (820 - paymentOffset) * dayMs).toISOString(),
      // Cutoff times bunch around regional patterns: 14:00 / 15:00 / 16:00
      // / 17:00 with 0/15/30/45 minute marks. Derived from `index` (NOT
      // the seeded RNG) so adding this field doesn't shift the seeded
      // values used by every other column — keeps existing e2e
      // assertions on those fields stable.
      cutoffTime: `${String(14 + (index % 4)).padStart(2, "0")}:${String((index % 4) * 15).padStart(
        2,
        "0",
      )}`,
      // Next scheduled follow-up: derived deterministically from `index`
      // (NOT from the seeded RNG) so adding the field doesn't shift
      // seeded values used by other columns. Date sits 1-30 days out
      // from a fixed base; time at quarter-hour marks 09:00–17:00.
      nextScheduledCall: (() => {
        const baseUtc = Date.UTC(2026, 4, 1)
        const dayOffset = (index % 30) + 1
        const hour = 9 + ((index >> 2) & 7)
        const minute = (index & 3) * 15
        const date = new Date(baseUtc + dayOffset * dayMs)
        return `${String(date.getUTCFullYear()).padStart(4, "0")}-${String(
          date.getUTCMonth() + 1,
        ).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}T${String(hour).padStart(
          2,
          "0",
        )}:${String(minute).padStart(2, "0")}`
      })(),
    }
  })
}

function money(value: number): number {
  return Math.round(value / 25) * 25
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
