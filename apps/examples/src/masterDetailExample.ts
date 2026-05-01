import type { CustomerRow } from "./examples"

export interface CustomerContact {
  id: string
  name: string
  role: string
  channel: string
  note: string
}

type CustomerContactSource = Pick<
  CustomerRow,
  "account" | "id" | "owner" | "region" | "terms" | "tradingName"
>

export function customerContacts(row: CustomerContactSource): readonly CustomerContact[] {
  const accountToken = row.account.toLowerCase()
  return [
    {
      id: `${row.id}:accounts-payable`,
      name: `${row.tradingName} AP`,
      role: "Accounts payable",
      channel: `ap+${accountToken}@example.test`,
      note: row.terms,
    },
    {
      id: `${row.id}:collector`,
      name: row.owner,
      role: "Collector",
      channel: "Internal owner",
      note: row.region,
    },
  ]
}
