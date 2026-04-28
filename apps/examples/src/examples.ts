export interface ExampleColumn {
  key: string
  label: string
  align?: "left" | "right"
  width: string
}

export interface InvoiceRow {
  id: string
  customer: string
  status: "Open" | "Posted" | "Held"
  dueDate: string
  amount: number
}

export interface ExampleDefinition {
  id: string
  title: string
  packageName: string
  status: "placeholder" | "ready"
  columns: ExampleColumn[]
  rows: InvoiceRow[]
}

export const examples: ExampleDefinition[] = [
  {
    id: "read-only-grid",
    title: "Read-Only Grid",
    packageName: "@bc-grid/react",
    status: "placeholder",
    columns: [
      { key: "id", label: "Invoice", width: "8rem" },
      { key: "customer", label: "Customer", width: "1fr" },
      { key: "status", label: "Status", width: "7rem" },
      { key: "dueDate", label: "Due", width: "8rem" },
      { key: "amount", label: "Amount", align: "right", width: "8rem" },
    ],
    rows: [
      {
        id: "AR-1042",
        customer: "Abbott Homes",
        status: "Open",
        dueDate: "2026-05-15",
        amount: 12540,
      },
      {
        id: "AR-1043",
        customer: "Northline Civil",
        status: "Posted",
        dueDate: "2026-05-18",
        amount: 8820,
      },
      {
        id: "AR-1044",
        customer: "Westmere Projects",
        status: "Held",
        dueDate: "2026-05-22",
        amount: 19375,
      },
      {
        id: "AR-1045",
        customer: "Clearwater Plumbing",
        status: "Open",
        dueDate: "2026-05-29",
        amount: 4210,
      },
    ],
  },
]

export const packageRows = [
  { name: "@bc-grid/core", role: "Types and row/column state", phase: "Q1" },
  { name: "@bc-grid/virtualizer", role: "DOM windowing and pinned regions", phase: "Q1" },
  { name: "@bc-grid/animations", role: "Sort and row transition primitives", phase: "Q1" },
  { name: "@bc-grid/theming", role: "CSS variables and density tokens", phase: "Q1" },
  { name: "@bc-grid/react", role: "React adapter and examples surface", phase: "Q1" },
  { name: "@bc-grid/editors", role: "Editor contracts and built-ins", phase: "Q2" },
  { name: "@bc-grid/server-row-model", role: "Paged, infinite, and tree loading", phase: "Q4" },
]
