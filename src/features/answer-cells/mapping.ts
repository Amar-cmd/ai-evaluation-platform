export type MappingConfidence = "high" | "medium" | "low" | "unknown"

export type MappingSource = "deterministic" | "heuristic" | "llm" | "professor"

export type MappingCandidateQuestion = {
  id: string
  questionNo: string
  questionText: string
  questionType: string
  maxMarks: number | string
  modelAnswer?: string | null
}

export type AnswerCellForMapping = {
  id: string
  responseColumn: string
  answerText: string
  wordCount: number
  characterCount: number
}

export type MappingPromptInput = {
  subject?: string | null
  examTitle?: string | null
  answerCell: AnswerCellForMapping
  candidateQuestions: MappingCandidateQuestion[]
}

export type ValidatedMappingOutput = {
  suggestedQuestionId: string | null
  confidence: MappingConfidence
  reason: string
  shouldIgnore: boolean
}

type RawMappingOutput = {
  suggested_question_id?: unknown
  confidence?: unknown
  reason?: unknown
  should_ignore?: unknown
}

const ALLOWED_CONFIDENCE: MappingConfidence[] = [
  "high",
  "medium",
  "low",
  "unknown",
]

const SHORT_ANSWER_WORD_LIMIT = 6
const SHORT_ANSWER_CHARACTER_LIMIT = 40

export function buildAnswerCellMappingPrompt(input: MappingPromptInput) {
  const { answerCell, candidateQuestions } = input

  const candidateQuestionBlock = candidateQuestions
    .map((question, index) => {
      return [
        `Candidate ${index + 1}:`,
        `id: ${question.id}`,
        `question_no: ${question.questionNo}`,
        `question_type: ${question.questionType}`,
        `max_marks: ${String(question.maxMarks)}`,
        `question_text: ${question.questionText}`,
        question.modelAnswer
          ? `model_answer_summary: ${truncateText(question.modelAnswer, 700)}`
          : "model_answer_summary: not provided",
      ].join("\n")
    })
    .join("\n\n")

  const shortAnswerWarning = isShortOrObjectiveLookingAnswer(answerCell)
    ? [
        "Important warning:",
        "The answer is very short or objective-looking.",
        "Do not guess aggressively.",
        "If the answer content is not enough to identify the question, return suggested_question_id as null, confidence as low or unknown, and should_ignore as true only if it is clearly objective/irrelevant.",
      ].join("\n")
    : ""

  return [
    "You are helping map a student's uploaded answer cell to the correct question from a professor's question bank.",
    "",
    "Task:",
    "Choose the single best matching question for the answer cell, or return null if the answer cannot be mapped reliably.",
    "",
    "Important rules:",
    "1. Do not assume response column number means question number.",
    "2. Use answer meaning, terminology, case names, concepts, and structure to match.",
    "3. If multiple questions seem possible, choose low confidence or null.",
    "4. Do not guess for one-word, option-like, numeric, or very short answers.",
    "5. If answer is blank, irrelevant, objective-only, or impossible to map, set should_ignore appropriately.",
    "6. Return only valid JSON. No markdown. No explanation outside JSON.",
    "",
    input.examTitle ? `Exam title: ${input.examTitle}` : "Exam title: not provided",
    input.subject ? `Subject: ${input.subject}` : "Subject: not provided",
    "",
    "Answer cell:",
    `cell_id: ${answerCell.id}`,
    `response_column: ${answerCell.responseColumn}`,
    `word_count: ${answerCell.wordCount}`,
    `character_count: ${answerCell.characterCount}`,
    `answer_text: ${truncateText(answerCell.answerText, 3000)}`,
    "",
    shortAnswerWarning,
    "",
    "Candidate questions:",
    candidateQuestionBlock || "No candidate questions provided.",
    "",
    "Required JSON format:",
    JSON.stringify(
      {
        suggested_question_id: "question uuid or null",
        confidence: "high | medium | low | unknown",
        reason: "Short reason for why this question was selected or why mapping is uncertain.",
        should_ignore: false,
      },
      null,
      2,
    ),
  ]
    .filter(Boolean)
    .join("\n")
}

export function validateMappingOutput(
  rawOutput: unknown,
  candidateQuestionIds: string[],
): ValidatedMappingOutput {
  const parsed = parseRawMappingOutput(rawOutput)

  const suggestedQuestionId = normalizeNullableString(
    parsed.suggested_question_id,
  )

  const confidence = normalizeConfidence(parsed.confidence)
  const reason = normalizeReason(parsed.reason)
  const shouldIgnore = normalizeBoolean(parsed.should_ignore)

  const candidateQuestionIdSet = new Set(candidateQuestionIds)

  if (
    suggestedQuestionId !== null &&
    !candidateQuestionIdSet.has(suggestedQuestionId)
  ) {
    throw new Error(
      "AI mapping output suggested a question ID that is not in the candidate question list.",
    )
  }

  if (!reason) {
    throw new Error("AI mapping output reason is required.")
  }

  if (shouldIgnore && suggestedQuestionId !== null && confidence === "high") {
    throw new Error(
      "AI mapping output cannot be high-confidence mapped and ignored at the same time.",
    )
  }

  if (suggestedQuestionId === null && confidence === "high") {
    throw new Error(
      "AI mapping output cannot have high confidence when no question is suggested.",
    )
  }

  return {
    suggestedQuestionId,
    confidence,
    reason,
    shouldIgnore,
  }
}

export function extractJsonObjectFromText(text: string) {
  const cleaned = text
    .trim()
    .replace(/^```json/i, "")
    .replace(/^```/i, "")
    .replace(/```$/i, "")
    .trim()

  const firstBrace = cleaned.indexOf("{")
  const lastBrace = cleaned.lastIndexOf("}")

  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error("No JSON object found in AI mapping output.")
  }

  return cleaned.slice(firstBrace, lastBrace + 1)
}

export function parseMappingOutputText(
  text: string,
  candidateQuestionIds: string[],
) {
  const jsonText = extractJsonObjectFromText(text)
  const parsed = JSON.parse(jsonText)

  return validateMappingOutput(parsed, candidateQuestionIds)
}

export function isShortOrObjectiveLookingAnswer(answerCell: AnswerCellForMapping) {
  const answer = answerCell.answerText.trim()

  if (!answer) {
    return true
  }

  if (
    answerCell.wordCount <= SHORT_ANSWER_WORD_LIMIT ||
    answerCell.characterCount <= SHORT_ANSWER_CHARACTER_LIMIT
  ) {
    return true
  }

  if (/^[A-D]$/i.test(answer)) {
    return true
  }

  if (/^\d+(\.\d+)?$/.test(answer)) {
    return true
  }

  if (/^(true|false|yes|no)$/i.test(answer)) {
    return true
  }

  return false
}

function parseRawMappingOutput(rawOutput: unknown): RawMappingOutput {
  if (!rawOutput || typeof rawOutput !== "object" || Array.isArray(rawOutput)) {
    throw new Error("AI mapping output must be a JSON object.")
  }

  return rawOutput as RawMappingOutput
}

function normalizeNullableString(value: unknown) {
  if (value === null || value === undefined) {
    return null
  }

  const normalized = String(value).trim()

  if (
    !normalized ||
    normalized.toLowerCase() === "null" ||
    normalized.toLowerCase() === "none"
  ) {
    return null
  }

  return normalized
}

function normalizeConfidence(value: unknown): MappingConfidence {
  const normalized = String(value || "unknown")
    .trim()
    .toLowerCase()

  if (ALLOWED_CONFIDENCE.includes(normalized as MappingConfidence)) {
    return normalized as MappingConfidence
  }

  throw new Error(
    "AI mapping output confidence must be high, medium, low, or unknown.",
  )
}

function normalizeReason(value: unknown) {
  return String(value || "").trim()
}

function normalizeBoolean(value: unknown) {
  if (typeof value === "boolean") {
    return value
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase()

    if (normalized === "true") {
      return true
    }

    if (normalized === "false") {
      return false
    }
  }

  return false
}

function truncateText(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value
  }

  return `${value.slice(0, maxLength)}... [truncated]`
}