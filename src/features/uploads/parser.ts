export type JsonPrimitive = string | number | boolean | null

export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue }

export type RawAnswerRow = Record<string, JsonValue | undefined>

export type ParsedResponseAnswer = {
  responseColumn: string
  answerText: string
  rawAnswer: JsonValue
  wordCount: number
  characterCount: number
}

export type ParsedStudentRow = {
  sourceRowIndex: number
  firstName: string | null
  lastName: string | null
  idNumber: string | null
  email: string | null
  rawRow: RawAnswerRow
  answers: ParsedResponseAnswer[]
}

export type ResponseColumnStat = {
  column: string
  nonEmptyCount: number
  averageWordCount: number
  maxWordCount: number
  sampleAnswer: string
}

export type ParserIssue = {
  sourceRowIndex?: number
  type:
    | "empty_file"
    | "invalid_json_shape"
    | "missing_email"
    | "missing_response_columns"
  message: string
}

export type ParsedAnswerJson = {
  totalRows: number
  detectedColumns: string[]
  responseColumns: string[]
  previewRows: RawAnswerRow[]
  studentRows: ParsedStudentRow[]
  responseColumnStats: ResponseColumnStat[]
  issues: ParserIssue[]
  isValidForImport: boolean
}

const DEFAULT_PREVIEW_LIMIT = 5

const FIRST_NAME_KEYS = ["firstname", "first_name", "firstName"]
const LAST_NAME_KEYS = ["lastname", "last_name", "lastName"]
const ID_NUMBER_KEYS = ["idnumber", "id_number", "student_id", "rollno", "roll_no"]
const EMAIL_KEYS = ["emailaddress", "email", "email_id", "emailId"]

export function parseAnswerJsonText(
  jsonText: string,
  options?: {
    previewLimit?: number
  }
): ParsedAnswerJson {
  const previewLimit = options?.previewLimit ?? DEFAULT_PREVIEW_LIMIT

  const issues: ParserIssue[] = []

  const parsedJson = safeJsonParse(jsonText)

  const rows = extractRowsFromParsedJson(parsedJson)

  if (rows.length === 0) {
    issues.push({
      type: "empty_file",
      message: "No student rows found in the uploaded JSON file.",
    })

    return {
      totalRows: 0,
      detectedColumns: [],
      responseColumns: [],
      previewRows: [],
      studentRows: [],
      responseColumnStats: [],
      issues,
      isValidForImport: false,
    }
  }

  const detectedColumns = detectColumns(rows)
  const responseColumns = detectResponseColumns(detectedColumns)

  if (responseColumns.length === 0) {
    issues.push({
      type: "missing_response_columns",
      message:
        "No response columns found. Expected columns like response1, response2, response6, etc.",
    })
  }

  const studentRows = rows.map((row, index) => {
    const parsedStudentRow = parseStudentRow(row, index, responseColumns)

    if (!parsedStudentRow.email) {
      issues.push({
        sourceRowIndex: index,
        type: "missing_email",
        message: `Row ${index + 1}: student email is missing.`,
      })
    }

    return parsedStudentRow
  })

  const responseColumnStats = buildResponseColumnStats(
    studentRows,
    responseColumns
  )

  return {
    totalRows: rows.length,
    detectedColumns,
    responseColumns,
    previewRows: rows.slice(0, previewLimit),
    studentRows,
    responseColumnStats,
    issues,
    isValidForImport: issues.length === 0,
  }
}

function safeJsonParse(jsonText: string): unknown {
  try {
    return JSON.parse(jsonText)
  } catch {
    throw new Error("Invalid JSON file. Please upload a valid JSON file.")
  }
}

function extractRowsFromParsedJson(parsedJson: unknown): RawAnswerRow[] {
  if (Array.isArray(parsedJson)) {
    return extractRowsFromArray(parsedJson)
  }

  if (isPlainObject(parsedJson)) {
    const possibleArrayKeys = ["data", "rows", "responses", "answers", "items"]

    for (const key of possibleArrayKeys) {
      const value = parsedJson[key]

      if (Array.isArray(value)) {
        return extractRowsFromArray(value)
      }
    }
  }

  throw new Error(
    "Invalid JSON shape. Expected an array of student rows or an object containing rows/data."
  )
}

function extractRowsFromArray(arrayValue: unknown[]): RawAnswerRow[] {
  let currentValue: unknown = arrayValue

  while (
    Array.isArray(currentValue) &&
    currentValue.length === 1 &&
    Array.isArray(currentValue[0])
  ) {
    currentValue = currentValue[0]
  }

  if (!Array.isArray(currentValue)) {
    throw new Error("Invalid JSON shape. Expected an array of student rows.")
  }

  const rows = currentValue.filter(isPlainObject)

  return rows as RawAnswerRow[]
}

function detectColumns(rows: RawAnswerRow[]) {
  const columns: string[] = []
  const seenColumns = new Set<string>()

  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!seenColumns.has(key)) {
        seenColumns.add(key)
        columns.push(key)
      }
    }
  }

  return columns
}

function detectResponseColumns(columns: string[]) {
  return columns
    .filter((column) => /^response\d+$/i.test(column))
    .sort((a, b) => {
      const aNumber = Number(a.replace(/\D/g, ""))
      const bNumber = Number(b.replace(/\D/g, ""))

      return aNumber - bNumber
    })
}

function parseStudentRow(
  row: RawAnswerRow,
  sourceRowIndex: number,
  responseColumns: string[]
): ParsedStudentRow {
  const answers = responseColumns.map((responseColumn) => {
    const rawAnswer = normalizeJsonValue(row[responseColumn])
    const answerText = cleanAnswerText(valueToText(rawAnswer))

    return {
      responseColumn,
      answerText,
      rawAnswer,
      wordCount: countWords(answerText),
      characterCount: answerText.length,
    }
  })

  return {
    sourceRowIndex,
    firstName: getTextFromPossibleKeys(row, FIRST_NAME_KEYS),
    lastName: getTextFromPossibleKeys(row, LAST_NAME_KEYS),
    idNumber: getTextFromPossibleKeys(row, ID_NUMBER_KEYS),
    email: normalizeEmail(getTextFromPossibleKeys(row, EMAIL_KEYS)),
    rawRow: row,
    answers,
  }
}

function buildResponseColumnStats(
  studentRows: ParsedStudentRow[],
  responseColumns: string[]
): ResponseColumnStat[] {
  return responseColumns.map((column) => {
    const answers = studentRows
      .map((studentRow) =>
        studentRow.answers.find((answer) => answer.responseColumn === column)
      )
      .filter((answer): answer is ParsedResponseAnswer => Boolean(answer))

    const nonEmptyAnswers = answers.filter((answer) => answer.answerText.length > 0)

    const totalWordCount = nonEmptyAnswers.reduce((total, answer) => {
      return total + answer.wordCount
    }, 0)

    const maxWordCount = nonEmptyAnswers.reduce((max, answer) => {
      return Math.max(max, answer.wordCount)
    }, 0)

    const sampleAnswer = nonEmptyAnswers[0]?.answerText.slice(0, 250) || ""

    return {
      column,
      nonEmptyCount: nonEmptyAnswers.length,
      averageWordCount:
        nonEmptyAnswers.length === 0
          ? 0
          : Math.round(totalWordCount / nonEmptyAnswers.length),
      maxWordCount,
      sampleAnswer,
    }
  })
}

function getTextFromPossibleKeys(row: RawAnswerRow, possibleKeys: string[]) {
  const normalizedKeyMap = new Map<string, string>()

  for (const key of Object.keys(row)) {
    normalizedKeyMap.set(normalizeKey(key), key)
  }

  for (const possibleKey of possibleKeys) {
    const actualKey = normalizedKeyMap.get(normalizeKey(possibleKey))

    if (actualKey) {
      const value = row[actualKey]
      const text = cleanAnswerText(valueToText(normalizeJsonValue(value)))

      return text || null
    }
  }

  return null
}

function normalizeKey(key: string) {
  return key.toLowerCase().replace(/[\s_-]/g, "")
}

function normalizeEmail(value: string | null) {
  if (!value) {
    return null
  }

  return value.trim().toLowerCase()
}

function normalizeJsonValue(value: unknown): JsonValue {
  if (value === undefined) {
    return null
  }

  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value
  }

  if (Array.isArray(value)) {
    return value.map(normalizeJsonValue)
  }

  if (isPlainObject(value)) {
    const normalizedObject: Record<string, JsonValue> = {}

    for (const [key, nestedValue] of Object.entries(value)) {
      normalizedObject[key] = normalizeJsonValue(nestedValue)
    }

    return normalizedObject
  }

  return String(value)
}

function valueToText(value: JsonValue): string {
  if (value === null) {
    return ""
  }

  if (typeof value === "string") {
    return value
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value)
  }

  return JSON.stringify(value)
}

function cleanAnswerText(text: string) {
  return text
    .replace(/\u00A0/g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim()
}

function countWords(text: string) {
  if (!text.trim()) {
    return 0
  }

  return text.trim().split(/\s+/).length
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  )
}