import type { CustomerRow } from "./examples"

export interface CustomerContact {
  id: string
  name: string
  role: string
  channel: string
  note: string
}

export type CustomerContactPanelState =
  | { kind: "ready"; contacts: readonly CustomerContact[] }
  | { kind: "empty"; title: string; description: string }
  | { kind: "loading"; title: string; description: string }
  | { kind: "error"; title: string; description: string }

type CustomerContactSource = Pick<
  CustomerRow,
  "account" | "flags" | "id" | "owner" | "region" | "status" | "terms" | "tradingName"
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

export function customerContactPanelState(row: CustomerContactSource): CustomerContactPanelState {
  if (row.status === "Disputed") {
    return {
      kind: "error",
      title: "Contact sync failed",
      description: "Retry the customer contact service before sending dispute follow-up.",
    }
  }

  if (row.status === "Credit Hold") {
    return {
      kind: "loading",
      title: "Refreshing contacts",
      description: "The host app can keep the detail row stable while child data loads.",
    }
  }

  if (row.flags.includes("manual-review")) {
    return {
      kind: "empty",
      title: "No contacts on file",
      description: "Add an AP contact in the customer record before scheduling follow-up.",
    }
  }

  return { kind: "ready", contacts: customerContacts(row) }
}
