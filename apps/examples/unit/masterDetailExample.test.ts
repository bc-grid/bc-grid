import { describe, expect, test } from "bun:test"
import { customerRows } from "../src/examples"
import { customerContacts } from "../src/masterDetailExample"

function firstCustomer() {
  const row = customerRows[0]
  if (!row) throw new Error("expected seeded customer rows")
  return row
}

describe("master/detail example helpers", () => {
  test("assigns stable child contact ids from the parent row id", () => {
    const row = firstCustomer()
    const renamed = {
      ...row,
      owner: `${row.owner} Backup`,
      tradingName: `${row.tradingName} Trading`,
    }

    const originalContacts = customerContacts(row)
    const renamedContacts = customerContacts(renamed)

    expect(originalContacts.map((contact) => contact.id)).toEqual([
      `${row.id}:accounts-payable`,
      `${row.id}:collector`,
    ])
    expect(renamedContacts.map((contact) => contact.id)).toEqual(
      originalContacts.map((contact) => contact.id),
    )
    expect(renamedContacts[0]?.name).not.toBe(originalContacts[0]?.name)
    expect(renamedContacts[1]?.name).not.toBe(originalContacts[1]?.name)
  })

  test("derives realistic contact channels from the account token", () => {
    const row = firstCustomer()
    const contacts = customerContacts(row)

    expect(contacts[0]).toMatchObject({
      channel: `ap+${row.account.toLowerCase()}@example.test`,
      role: "Accounts payable",
    })
    expect(contacts[1]).toMatchObject({
      channel: "Internal owner",
      note: row.region,
      role: "Collector",
    })
  })
})
