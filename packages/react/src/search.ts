export function matchesSearchText(
  searchText: string | undefined,
  formattedValues: Iterable<string>,
): boolean {
  const query = normaliseSearchText(searchText)
  if (!query) return true

  const haystack = Array.from(formattedValues).join(" ").toLowerCase()
  return haystack.includes(query)
}

export function normaliseSearchText(searchText: string | undefined): string {
  return (searchText ?? "").trim().toLowerCase()
}
