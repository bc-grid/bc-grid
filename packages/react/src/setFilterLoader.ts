import type {
  BcColumnFilter,
  ColumnId,
  SetFilterOption,
  SetFilterOptionLoadResult,
  SetFilterOptionProvider,
} from "@bc-grid/core"
import {
  type ColumnFilterText,
  type ColumnFilterTypeByColumnId,
  type SetFilterOptionLoaderParams,
  buildGridFilter,
  buildSetFilterOptionLoadResult,
} from "./filter"

type SetColumnFilterConfig = {
  type: "set"
  options?: readonly (string | SetFilterOption)[]
  loadOptions?: () => Promise<readonly (string | SetFilterOption)[]>
  loadSetFilterOptions?: SetFilterOptionProvider
}

export async function loadGridSetFilterOptions({
  columnFilterText,
  columnFilterTypes,
  getLocalSetFilterOptions,
  params,
  resolvedColumns,
}: {
  columnFilterText: ColumnFilterText
  columnFilterTypes: ColumnFilterTypeByColumnId
  getLocalSetFilterOptions: (columnId: ColumnId) => readonly SetFilterOption[]
  params: SetFilterOptionLoaderParams
  resolvedColumns: readonly {
    columnId: ColumnId
    source: { filter?: BcColumnFilter | boolean }
  }[]
}): Promise<SetFilterOptionLoadResult> {
  const column = resolvedColumns.find((candidate) => candidate.columnId === params.columnId)
  if (!column) return { options: [], totalCount: 0 }

  const filterConfig = column.source.filter
  if (filterConfig && typeof filterConfig === "object" && filterConfig.type === "set") {
    const setFilterConfig = filterConfig as SetColumnFilterConfig
    if (setFilterConfig.loadSetFilterOptions) {
      const { [params.columnId]: _currentFilter, ...otherFilterText } = columnFilterText
      return setFilterConfig.loadSetFilterOptions({
        ...params,
        filterWithoutSelf: buildGridFilter(otherFilterText, columnFilterTypes),
      })
    }
    if (setFilterConfig.loadOptions) {
      const options = await setFilterConfig.loadOptions()
      return buildSetFilterOptionLoadResult(options, params)
    }
    if (setFilterConfig.options)
      return buildSetFilterOptionLoadResult(setFilterConfig.options, params)
  }

  return buildSetFilterOptionLoadResult(getLocalSetFilterOptions(params.columnId), params)
}
