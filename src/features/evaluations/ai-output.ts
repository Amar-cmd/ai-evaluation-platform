export type NormalizedQualityLabel =
  | "weak"
  | "average"
  | "good"
  | "excellent"

export type NormalizedAiConfidence = "low" | "medium" | "high"

export type NormalizedAiRubricBreakdown = {
  criterion: string
  maxMarks: string
  awardedMarks: string
  reason: string
}

export type NormalizedAiEvaluationOutput = {
  suggestedScore: string
  maxMarks: string
  qualityLabel: NormalizedQualityLabel
  confidence: NormalizedAiConfidence
  rubricBreakdown: NormalizedAiRubricBreakdown[]
  whatStudentDidWell: string[]
  whatIsMissing: string[]
  teacherReviewSummary: string
  studentFacingJustification: string
  rawOutput: unknown
}

export type AiOutputValidationResult =
  | {
      ok: true
      data: NormalizedAiEvaluationOutput
    }
  | {
      ok: false
      errors: string[]
      rawOutput: unknown
    }

const QUALITY_LABELS: NormalizedQualityLabel[] = [
  "weak",
  "average",
  "good",
  "excellent",
]

const AI_CONFIDENCE_VALUES: NormalizedAiConfidence[] = [
  "low",
  "medium",
  "high",
]

export function validateAiEvaluationOutput(
  rawOutput: unknown,
  expectedMaxMarks: number | string
): AiOutputValidationResult {
  const errors: string[] = []

  if (!isPlainObject(rawOutput)) {
    return {
      ok: false,
      errors: ["AI output must be a JSON object."],
      rawOutput,
    }
  }

  const expectedMaxMarksNumber = toNumber(expectedMaxMarks)

  if (expectedMaxMarksNumber === null || expectedMaxMarksNumber < 0) {
    return {
      ok: false,
      errors: ["Expected max marks is invalid."],
      rawOutput,
    }
  }

  const suggestedScore = readNumberField(rawOutput, "suggested_score")
  const aiMaxMarks = readNumberField(rawOutput, "max_marks")

  if (suggestedScore === null) {
    errors.push("suggested_score must be a valid number.")
  }

  if (aiMaxMarks === null) {
    errors.push("max_marks must be a valid number.")
  }

  if (suggestedScore !== null && suggestedScore < 0) {
    errors.push("suggested_score cannot be negative.")
  }

  if (
    suggestedScore !== null &&
    suggestedScore > expectedMaxMarksNumber
  ) {
    errors.push("suggested_score cannot be greater than expected max marks.")
  }

  if (aiMaxMarks !== null && aiMaxMarks < 0) {
    errors.push("max_marks cannot be negative.")
  }

  if (
    aiMaxMarks !== null &&
    !nearlyEqual(aiMaxMarks, expectedMaxMarksNumber)
  ) {
    errors.push(
      `AI max_marks (${aiMaxMarks}) does not match expected max marks (${expectedMaxMarksNumber}).`
    )
  }

  const qualityLabel = normalizeQualityLabel(rawOutput.quality_label)

  if (!qualityLabel) {
    errors.push(
      "quality_label must be one of: Weak, Average, Good, Excellent."
    )
  }

  const confidence = normalizeAiConfidence(rawOutput.confidence)

  if (!confidence) {
    errors.push("confidence must be one of: Low, Medium, High.")
  }

  const rubricBreakdown = readRubricBreakdown(
    rawOutput.rubric_breakdown,
    expectedMaxMarksNumber,
    errors
  )

  const whatStudentDidWell = readStringArray(
    rawOutput.what_student_did_well,
    "what_student_did_well",
    errors
  )

  const whatIsMissing = readStringArray(
    rawOutput.what_is_missing,
    "what_is_missing",
    errors
  )

  const teacherReviewSummary = readRequiredStringField(
    rawOutput,
    "teacher_review_summary",
    errors
  )

  const studentFacingJustification = readRequiredStringField(
    rawOutput,
    "student_facing_justification",
    errors
  )

  const rubricAwardedTotal = rubricBreakdown.reduce((total, item) => {
    return total + Number(item.awardedMarks)
  }, 0)

  if (
    suggestedScore !== null &&
    rubricBreakdown.length > 0 &&
    !nearlyEqual(rubricAwardedTotal, suggestedScore)
  ) {
    errors.push(
      `Rubric awarded total (${rubricAwardedTotal}) does not match suggested_score (${suggestedScore}).`
    )
  }

  if (errors.length > 0) {
    return {
      ok: false,
      errors,
      rawOutput,
    }
  }

  return {
    ok: true,
    data: {
      suggestedScore: formatMarksForDatabase(suggestedScore!),
      maxMarks: formatMarksForDatabase(expectedMaxMarksNumber),
      qualityLabel: qualityLabel!,
      confidence: confidence!,
      rubricBreakdown,
      whatStudentDidWell,
      whatIsMissing,
      teacherReviewSummary,
      studentFacingJustification,
      rawOutput,
    },
  }
}

export function parseAiJsonText(jsonText: string): unknown {
  try {
    return JSON.parse(jsonText)
  } catch {
    throw new Error("AI response is not valid JSON.")
  }
}

function readRubricBreakdown(
  value: unknown,
  expectedMaxMarks: number,
  errors: string[]
): NormalizedAiRubricBreakdown[] {
  if (!Array.isArray(value)) {
    errors.push("rubric_breakdown must be an array.")
    return []
  }

  if (value.length === 0) {
    errors.push("rubric_breakdown cannot be empty.")
    return []
  }

  const normalizedBreakdown: NormalizedAiRubricBreakdown[] = []

  value.forEach((item, index) => {
    if (!isPlainObject(item)) {
      errors.push(`rubric_breakdown[${index}] must be an object.`)
      return
    }

    const criterion = readRequiredStringField(
      item,
      "criterion",
      errors,
      `rubric_breakdown[${index}].criterion`
    )

    const maxMarks = readNumberField(item, "max_marks")
    const awardedMarks = readNumberField(item, "awarded_marks")

    const reason = readRequiredStringField(
      item,
      "reason",
      errors,
      `rubric_breakdown[${index}].reason`
    )

    if (maxMarks === null) {
      errors.push(`rubric_breakdown[${index}].max_marks must be a number.`)
    }

    if (awardedMarks === null) {
      errors.push(
        `rubric_breakdown[${index}].awarded_marks must be a number.`
      )
    }

    if (maxMarks !== null && maxMarks < 0) {
      errors.push(`rubric_breakdown[${index}].max_marks cannot be negative.`)
    }

    if (awardedMarks !== null && awardedMarks < 0) {
      errors.push(
        `rubric_breakdown[${index}].awarded_marks cannot be negative.`
      )
    }

    if (
      maxMarks !== null &&
      awardedMarks !== null &&
      awardedMarks > maxMarks
    ) {
      errors.push(
        `rubric_breakdown[${index}].awarded_marks cannot be greater than max_marks.`
      )
    }

    if (
      criterion &&
      reason &&
      maxMarks !== null &&
      awardedMarks !== null
    ) {
      normalizedBreakdown.push({
        criterion,
        maxMarks: formatMarksForDatabase(maxMarks),
        awardedMarks: formatMarksForDatabase(awardedMarks),
        reason,
      })
    }
  })

  const rubricMaxTotal = normalizedBreakdown.reduce((total, item) => {
    return total + Number(item.maxMarks)
  }, 0)

  if (
    normalizedBreakdown.length > 0 &&
    !nearlyEqual(rubricMaxTotal, expectedMaxMarks)
  ) {
    errors.push(
      `Rubric max marks total (${rubricMaxTotal}) does not match expected max marks (${expectedMaxMarks}).`
    )
  }

  return normalizedBreakdown
}

function normalizeQualityLabel(value: unknown) {
  if (typeof value !== "string") {
    return null
  }

  const normalized = value.trim().toLowerCase()

  if (QUALITY_LABELS.includes(normalized as NormalizedQualityLabel)) {
    return normalized as NormalizedQualityLabel
  }

  return null
}

function normalizeAiConfidence(value: unknown) {
  if (typeof value !== "string") {
    return null
  }

  const normalized = value.trim().toLowerCase()

  if (AI_CONFIDENCE_VALUES.includes(normalized as NormalizedAiConfidence)) {
    return normalized as NormalizedAiConfidence
  }

  return null
}

function readRequiredStringField(
  objectValue: Record<string, unknown>,
  fieldName: string,
  errors: string[],
  displayName = fieldName
) {
  const value = objectValue[fieldName]

  if (typeof value !== "string" || !value.trim()) {
    errors.push(`${displayName} must be a non-empty string.`)
    return ""
  }

  return value.trim()
}

function readStringArray(
  value: unknown,
  fieldName: string,
  errors: string[]
) {
  if (!Array.isArray(value)) {
    errors.push(`${fieldName} must be an array of strings.`)
    return []
  }

  const result: string[] = []

  value.forEach((item, index) => {
    if (typeof item !== "string") {
      errors.push(`${fieldName}[${index}] must be a string.`)
      return
    }

    const cleanedItem = item.trim()

    if (cleanedItem) {
      result.push(cleanedItem)
    }
  })

  return result
}

function readNumberField(
  objectValue: Record<string, unknown>,
  fieldName: string
) {
  return toNumber(objectValue[fieldName])
}

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value)

    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  return null
}

function formatMarksForDatabase(value: number) {
  return value.toFixed(2)
}

function nearlyEqual(a: number, b: number) {
  return Math.abs(a - b) < 0.001
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  )
}