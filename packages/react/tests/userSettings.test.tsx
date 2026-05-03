import { describe, expect, test } from "bun:test"
import type { BcGridFilter } from "@bc-grid/core"
import { renderToStaticMarkup } from "react-dom/server"
import { BcGrid } from "../src/grid"
import type { BcGridColumn, BcGridProps, BcUserSettings, BcUserSettingsStore } from "../src/types"

interface Row {
  id: string
  name: string
}

const columns: readonly BcGridColumn<Row>[] = [
  {
    columnId: "name",
    field: "name",
    filter: { type: "text" },
    header: "Name",
    width: 160,
  },
]

const rows: readonly Row[] = [{ id: "1", name: "Acme" }]
const activeNameFilter = {
  kind: "column",
  columnId: "name",
  type: "text",
  op: "contains",
  value: "Acme",
} satisfies BcGridFilter

function settingsStore(settings: BcUserSettings): BcUserSettingsStore {
  return {
    read: () => settings,
    write: () => {},
  }
}

function renderGrid(props: Partial<BcGridProps<Row>> = {}): string {
  return renderToStaticMarkup(
    <BcGrid<Row>
      ariaLabel="Customers"
      columns={columns}
      data={rows}
      height={240}
      rowId={(row) => row.id}
      {...props}
    />,
  )
}

describe("BcGrid userSettings visibility bridge", () => {
  test("visible.filterRow controls the inline filter row when no prop override is supplied", () => {
    const hidden = renderGrid({
      userSettings: settingsStore({ version: 1, visible: { filterRow: false } }),
    })
    expect(hidden).not.toContain('class="bc-grid-filter-row"')

    const shown = renderGrid({
      userSettings: settingsStore({ version: 1, visible: { filterRow: true } }),
    })
    expect(shown).toContain('class="bc-grid-filter-row"')
  })

  test("showFilterRow prop remains the source of truth over userSettings.visible.filterRow", () => {
    const html = renderGrid({
      showFilterRow: false,
      userSettings: settingsStore({ version: 1, visible: { filterRow: true } }),
    })

    expect(html).not.toContain('class="bc-grid-filter-row"')
  })

  test("visible.sidebar hides or shows the supplied sidebar panels", () => {
    const hidden = renderGrid({
      sidebar: ["columns", "filters"],
      userSettings: settingsStore({ version: 1, visible: { sidebar: false } }),
    })
    expect(hidden).not.toContain('class="bc-grid-sidebar"')

    const shown = renderGrid({
      sidebar: ["columns", "filters"],
      userSettings: settingsStore({
        version: 1,
        visible: { sidebar: true },
        sidebarPanel: "filters",
      }),
    })
    expect(shown).toContain('class="bc-grid-sidebar"')
    expect(shown).toContain('aria-label="Filters"')
  })

  test("visible.statusBar gates the status bar and can turn on default row-count segments", () => {
    const hidden = renderGrid({
      statusBar: ["total"],
      userSettings: settingsStore({ version: 1, visible: { statusBar: false } }),
    })
    expect(hidden).not.toContain('class="bc-grid-statusbar"')

    const shown = renderGrid({
      userSettings: settingsStore({ version: 1, visible: { statusBar: true } }),
    })
    expect(shown).toContain('class="bc-grid-statusbar"')
    expect(shown).toContain('data-segment="total"')
  })

  test("visible.activeFilterSummary gates the status-bar filter chip strip", () => {
    const hidden = renderGrid({
      defaultFilter: activeNameFilter,
      userSettings: settingsStore({ version: 1, visible: { activeFilterSummary: false } }),
    })
    expect(hidden).not.toContain('data-segment="activeFilters"')

    const shown = renderGrid({
      defaultFilter: activeNameFilter,
      userSettings: settingsStore({ version: 1, visible: { activeFilterSummary: true } }),
    })
    expect(shown).toContain('data-segment="activeFilters"')
  })

  test("density setting applies when no density prop override is supplied", () => {
    const fromSettings = renderGrid({
      userSettings: settingsStore({ version: 1, density: "comfortable" }),
    })
    expect(fromSettings).toContain('data-density="comfortable"')

    const propOverride = renderGrid({
      density: "compact",
      userSettings: settingsStore({ version: 1, density: "comfortable" }),
    })
    expect(propOverride).toContain('data-density="compact"')
  })
})
