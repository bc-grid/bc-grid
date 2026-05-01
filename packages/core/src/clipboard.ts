export type BcTsvParseDiagnosticCode =
  | "unexpected-quote"
  | "unexpected-character-after-closing-quote"
  | "unterminated-quoted-cell"

export interface BcTsvParseDiagnostic {
  code: BcTsvParseDiagnosticCode
  rowIndex: number
  columnIndex: number
  charIndex: number
}

export interface BcTsvParseResult {
  cells: string[][]
  diagnostics: BcTsvParseDiagnostic[]
}

/**
 * Parse spreadsheet-style TSV clipboard text into a row/column matrix.
 *
 * This intentionally covers the Excel / Google Sheets TSV subset:
 * tabs separate cells, CRLF/LF/CR separate rows, quoted cells may contain
 * tabs/newlines, and doubled quotes inside quoted cells unescape to a
 * single quote. Malformed quote usage is parsed best-effort and reported
 * through diagnostics so paste callers can decide whether to reject or
 * surface a warning.
 */
export function parseTsvClipboard(input: string): BcTsvParseResult {
  const cells: string[][] = []
  const diagnostics: BcTsvParseDiagnostic[] = []
  let row: string[] = []
  let cell = ""
  let inQuotes = false
  let afterClosingQuote = false
  let endedWithRowDelimiter = false

  const currentColumnIndex = () => row.length
  const pushDiagnostic = (code: BcTsvParseDiagnosticCode, charIndex: number) => {
    diagnostics.push({
      code,
      rowIndex: cells.length,
      columnIndex: currentColumnIndex(),
      charIndex,
    })
  }
  const finishCell = () => {
    row.push(cell)
    cell = ""
    inQuotes = false
    afterClosingQuote = false
    endedWithRowDelimiter = false
  }
  const finishRow = () => {
    row.push(cell)
    cells.push(row)
    row = []
    cell = ""
    inQuotes = false
    afterClosingQuote = false
    endedWithRowDelimiter = true
  }

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index]
    const next = input[index + 1]

    if (inQuotes) {
      if (char === '"' && next === '"') {
        cell += '"'
        index += 1
      } else if (char === '"') {
        inQuotes = false
        afterClosingQuote = true
      } else {
        cell += char
      }
      continue
    }

    if (char === "\t") {
      finishCell()
      continue
    }

    if (char === "\n" || char === "\r") {
      finishRow()
      if (char === "\r" && next === "\n") index += 1
      continue
    }

    if (afterClosingQuote) {
      pushDiagnostic("unexpected-character-after-closing-quote", index)
      afterClosingQuote = false
      cell += char
      continue
    }

    if (char === '"') {
      if (cell.length === 0) {
        inQuotes = true
      } else {
        pushDiagnostic("unexpected-quote", index)
        cell += char
      }
      endedWithRowDelimiter = false
      continue
    }

    cell += char
    endedWithRowDelimiter = false
  }

  if (inQuotes) {
    pushDiagnostic("unterminated-quoted-cell", input.length)
  }

  if (!endedWithRowDelimiter || row.length > 0 || cell.length > 0) {
    row.push(cell)
    cells.push(row)
  }

  return { cells, diagnostics }
}
