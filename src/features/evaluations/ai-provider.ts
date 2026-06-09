import "server-only"

import {
  buildAiEvaluationPrompt,
  type BuildAiEvaluationPromptInput,
} from "@/features/evaluations/prompt"

import {
  validateAiEvaluationOutput,
  type NormalizedAiEvaluationOutput,
} from "@/features/evaluations/ai-output"

export type AiProviderName =
  | "mock"
  | "openai"
  | "gemini"
  | "openrouter"
  | "ollama"
  | "hybrid"

export type AiProviderRawResult = {
  provider: AiProviderName
  rawOutput: unknown
  rawText?: string
  systemPrompt: string
  userPrompt: string
}

export type AiProviderEvaluationResult = {
  provider: AiProviderName
  data: NormalizedAiEvaluationOutput
  rawOutput: unknown
  rawText?: string
  systemPrompt: string
  userPrompt: string
}

export type AiEvaluationProvider = {
  name: AiProviderName
  evaluate(input: BuildAiEvaluationPromptInput): Promise<AiProviderRawResult>
}

export async function evaluateAnswerWithAi(
  input: BuildAiEvaluationPromptInput,
  provider: AiEvaluationProvider = mockAiEvaluationProvider
): Promise<AiProviderEvaluationResult> {
  const rawResult = await provider.evaluate(input)

  const validation = validateAiEvaluationOutput(
    rawResult.rawOutput,
    input.question.maxMarks
  )

  if (!validation.ok) {
    throw new Error(
      [
        "AI output validation failed.",
        ...validation.errors.map((error) => `- ${error}`),
      ].join("\n")
    )
  }

  return {
    provider: rawResult.provider,
    data: validation.data,
    rawOutput: rawResult.rawOutput,
    rawText: rawResult.rawText,
    systemPrompt: rawResult.systemPrompt,
    userPrompt: rawResult.userPrompt,
  }
}

export const mockAiEvaluationProvider: AiEvaluationProvider = {
  name: "mock",

  async evaluate(input) {
    const { systemPrompt, userPrompt } = buildAiEvaluationPrompt(input)

    const rawOutput = createMockAiOutput(input)

    return {
      provider: "mock",
      rawOutput,
      rawText: JSON.stringify(rawOutput, null, 2),
      systemPrompt,
      userPrompt,
    }
  },
}

function createMockAiOutput(input: BuildAiEvaluationPromptInput) {
  const { question, rubric, studentAnswer } = input

  const answerText = studentAnswer.answerText.trim()
  const answerWordCount =
    studentAnswer.wordCount ?? countWords(answerText)

  const answerStrengthRatio = estimateAnswerStrengthRatio(answerWordCount)

  const rubricBreakdown = rubric.map((criterion) => {
    const maxMarks = toNumber(criterion.maxMarks)
    const awardedMarks = roundToTwoDecimals(maxMarks * answerStrengthRatio)

    return {
      criterion: criterion.criterionName,
      max_marks: maxMarks,
      awarded_marks: awardedMarks,
      reason: createMockRubricReason(
        criterion.criterionName,
        awardedMarks,
        maxMarks
      ),
    }
  })

  const suggestedScore = roundToTwoDecimals(
    rubricBreakdown.reduce((total, item) => {
      return total + item.awarded_marks
    }, 0)
  )

  const maxMarks = toNumber(question.maxMarks)
  const scoreRatio = maxMarks > 0 ? suggestedScore / maxMarks : 0

  return {
    suggested_score: suggestedScore,
    max_marks: maxMarks,
    quality_label: getMockQualityLabel(scoreRatio),
    confidence: getMockConfidence(answerWordCount),
    rubric_breakdown: rubricBreakdown,
    what_student_did_well: getMockStrengths(scoreRatio),
    what_is_missing: getMockMissingPoints(scoreRatio),
    teacher_review_summary: createMockTeacherReviewSummary(
      suggestedScore,
      maxMarks,
      scoreRatio
    ),
    student_facing_justification: createMockStudentJustification(scoreRatio),
  }
}

function estimateAnswerStrengthRatio(wordCount: number) {
  if (wordCount <= 0) return 0
  if (wordCount < 30) return 0.35
  if (wordCount < 80) return 0.55
  if (wordCount < 180) return 0.7
  return 0.8
}

function getMockQualityLabel(scoreRatio: number) {
  if (scoreRatio < 0.4) return "Weak"
  if (scoreRatio < 0.6) return "Average"
  if (scoreRatio < 0.8) return "Good"
  return "Excellent"
}

function getMockConfidence(wordCount: number) {
  if (wordCount < 20) return "Low"
  if (wordCount < 80) return "Medium"
  return "High"
}

function getMockStrengths(scoreRatio: number) {
  if (scoreRatio < 0.4) {
    return ["The answer attempts to address the question."]
  }

  if (scoreRatio < 0.7) {
    return [
      "The answer covers some relevant points.",
      "The student shows partial understanding of the topic.",
    ]
  }

  return [
    "The answer is relevant to the question.",
    "The student shows good understanding of the core idea.",
  ]
}

function getMockMissingPoints(scoreRatio: number) {
  if (scoreRatio < 0.4) {
    return [
      "Important concepts are missing.",
      "The answer needs clearer structure and stronger explanation.",
    ]
  }

  if (scoreRatio < 0.7) {
    return [
      "Some important points need more depth.",
      "The answer can be improved with clearer examples or case linkage.",
    ]
  }

  return [
    "The answer can still be improved with more precise explanation.",
  ]
}

function createMockRubricReason(
  criterionName: string,
  awardedMarks: number,
  maxMarks: number
) {
  if (awardedMarks <= 0) {
    return `No meaningful evidence found for ${criterionName}.`
  }

  if (awardedMarks < maxMarks * 0.5) {
    return `Limited evidence found for ${criterionName}.`
  }

  if (awardedMarks < maxMarks * 0.8) {
    return `Partial but relevant evidence found for ${criterionName}.`
  }

  return `Strong evidence found for ${criterionName}.`
}

function createMockTeacherReviewSummary(
  suggestedScore: number,
  maxMarks: number,
  scoreRatio: number
) {
  if (scoreRatio < 0.4) {
    return `Mock evaluation: weak answer. Suggested score ${suggestedScore}/${maxMarks}. Professor should review carefully.`
  }

  if (scoreRatio < 0.7) {
    return `Mock evaluation: average answer. Suggested score ${suggestedScore}/${maxMarks}. Some relevant points are present, but depth is missing.`
  }

  return `Mock evaluation: good answer. Suggested score ${suggestedScore}/${maxMarks}. Answer is relevant and mostly aligned with the rubric.`
}

function createMockStudentJustification(scoreRatio: number) {
  if (scoreRatio < 0.4) {
    return "Your answer attempts the question, but several important points are missing. Try to explain the core concepts more clearly."
  }

  if (scoreRatio < 0.7) {
    return "Your answer includes some relevant points, but it needs more depth, structure, and stronger linkage with the question."
  }

  return "Your answer is relevant and shows good understanding. You can improve further by adding more precise explanation and examples."
}

function countWords(text: string) {
  if (!text.trim()) {
    return 0
  }

  return text.trim().split(/\s+/).length
}

function toNumber(value: number | string) {
  const parsed = Number(value)

  if (!Number.isFinite(parsed)) {
    return 0
  }

  return parsed
}

function roundToTwoDecimals(value: number) {
  return Math.round(value * 100) / 100
}