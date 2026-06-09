export type EvaluationRubricCriterionForPrompt = {
  criterionName: string
  criterionDescription: string | null
  maxMarks: number | string
}

export type EvaluationQuestionForPrompt = {
  questionNo: string
  questionText: string
  maxMarks: number | string
  modelAnswer: string
  subject?: string | null
  course?: string | null
}

export type EvaluationStudentAnswerForPrompt = {
  answerText: string
  wordCount?: number | null
  characterCount?: number | null
}

export type BuildAiEvaluationPromptInput = {
  question: EvaluationQuestionForPrompt
  rubric: EvaluationRubricCriterionForPrompt[]
  studentAnswer: EvaluationStudentAnswerForPrompt
}

export type BuiltAiEvaluationPrompt = {
  systemPrompt: string
  userPrompt: string
}

export function buildAiEvaluationPrompt(
  input: BuildAiEvaluationPromptInput
): BuiltAiEvaluationPrompt {
  validatePromptInput(input)

  const { question, rubric, studentAnswer } = input

  const rubricTotal = rubric.reduce((total, criterion) => {
    return total + toNumber(criterion.maxMarks)
  }, 0)

  const systemPrompt = buildSystemPrompt()

  const userPrompt = `
You are evaluating a student's subjective answer.

IMPORTANT EVALUATION RULES:
1. Evaluate strictly using the provided question, model answer, and rubric.
2. Do not reward irrelevant content.
3. Do not punish minor grammar mistakes unless they reduce meaning.
4. Award marks only within each rubric criterion.
5. The sum of rubric awarded_marks must exactly equal suggested_score.
6. suggested_score must be between 0 and max_marks.
7. rubric_breakdown must contain exactly one item for each rubric criterion.
8. Use the same criterion names as provided.
9. Return only valid JSON. Do not include markdown, explanation, or extra text.

EXAM CONTEXT:
Subject: ${safeText(question.subject || "Not provided")}
Course: ${safeText(question.course || "Not provided")}

QUESTION:
Question No: ${safeText(question.questionNo)}
Max Marks: ${formatMarks(question.maxMarks)}

Question Text:
${safeText(question.questionText)}

MODEL ANSWER / EXPECTED ANSWER:
${safeText(question.modelAnswer)}

RUBRIC:
Total Rubric Marks: ${formatMarks(rubricTotal)}

${formatRubricForPrompt(rubric)}

STUDENT ANSWER:
Word Count: ${studentAnswer.wordCount ?? "Not calculated"}
Character Count: ${studentAnswer.characterCount ?? "Not calculated"}

${safeText(studentAnswer.answerText)}

REQUIRED JSON OUTPUT FORMAT:
{
  "suggested_score": 0,
  "max_marks": ${formatMarks(question.maxMarks)},
  "quality_label": "Weak | Average | Good | Excellent",
  "confidence": "Low | Medium | High",
  "rubric_breakdown": [
    {
      "criterion": "Exact rubric criterion name",
      "max_marks": 0,
      "awarded_marks": 0,
      "reason": "Clear reason for marks awarded under this criterion"
    }
  ],
  "what_student_did_well": [
    "Short point"
  ],
  "what_is_missing": [
    "Short point"
  ],
  "teacher_review_summary": "Short internal summary for professor review.",
  "student_facing_justification": "Polite explanation suitable for student."
}

FINAL CHECK BEFORE RESPONDING:
- Output must be valid JSON.
- No markdown.
- No comments.
- No trailing commas.
- suggested_score must equal sum of rubric_breakdown awarded_marks.
- max_marks must equal ${formatMarks(question.maxMarks)}.
- rubric_breakdown max_marks total must equal ${formatMarks(question.maxMarks)}.
`.trim()

  return {
    systemPrompt,
    userPrompt,
  }
}

function buildSystemPrompt() {
  return `
You are an academic evaluation assistant.

Your role:
- Assist the professor by producing structured evaluation evidence.
- You do not replace the professor.
- The professor is the final authority.
- Be fair, consistent, and rubric-based.
- Use only the provided question, model answer, rubric, and student answer.
- Return only valid JSON according to the requested schema.
`.trim()
}

function validatePromptInput(input: BuildAiEvaluationPromptInput) {
  const { question, rubric, studentAnswer } = input

  if (!question.questionNo.trim()) {
    throw new Error("Question number is required for AI evaluation prompt.")
  }

  if (!question.questionText.trim()) {
    throw new Error("Question text is required for AI evaluation prompt.")
  }

  if (!question.modelAnswer.trim()) {
    throw new Error("Model answer is required for AI evaluation prompt.")
  }

  const questionMaxMarks = toNumber(question.maxMarks)

  if (questionMaxMarks <= 0) {
    throw new Error("Question max marks must be greater than 0.")
  }

  if (rubric.length === 0) {
    throw new Error("At least one rubric criterion is required.")
  }

  const rubricTotal = rubric.reduce((total, criterion) => {
    return total + toNumber(criterion.maxMarks)
  }, 0)

  if (!nearlyEqual(rubricTotal, questionMaxMarks)) {
    throw new Error(
      `Rubric total (${rubricTotal}) must match question max marks (${questionMaxMarks}).`
    )
  }

  for (const [index, criterion] of rubric.entries()) {
    if (!criterion.criterionName.trim()) {
      throw new Error(`Rubric criterion ${index + 1} name is required.`)
    }

    if (toNumber(criterion.maxMarks) <= 0) {
      throw new Error(
        `Rubric criterion ${index + 1} max marks must be greater than 0.`
      )
    }
  }

  if (!studentAnswer.answerText.trim()) {
    throw new Error("Student answer is empty.")
  }
}

function formatRubricForPrompt(rubric: EvaluationRubricCriterionForPrompt[]) {
  return rubric
    .map((criterion, index) => {
      return `
${index + 1}. Criterion: ${safeText(criterion.criterionName)}
   Max Marks: ${formatMarks(criterion.maxMarks)}
   Description: ${safeText(
     criterion.criterionDescription || "No description provided."
   )}
`.trim()
    })
    .join("\n\n")
}

function safeText(value: string) {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim()
}

function toNumber(value: number | string) {
  const parsed = Number(value)

  if (!Number.isFinite(parsed)) {
    return 0
  }

  return parsed
}

function formatMarks(value: number | string) {
  return toNumber(value).toFixed(2)
}

function nearlyEqual(a: number, b: number) {
  return Math.abs(a - b) < 0.001
}