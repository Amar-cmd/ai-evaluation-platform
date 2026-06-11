type QuestionForReadiness = {
  id: string
  question_no: string
  question_type: string
  max_marks: number | string
  model_answer: string | null
  model_answer_status: string | null

  // Old Step 40 field. Optional rakha hai so existing queries break na ho.
  is_ai_evaluable?: boolean | null
}

type RubricForReadiness = {
  id: string
  question_id: string
  max_marks: number | string

  // Step 42 metadata. Optional for backward compatibility.
  is_template_generated?: boolean | null
  source_template_id?: string | null
}

export type ExamRubricReadinessIssue = {
  type:
    | "no_questions"
    | "missing_model_answer"
    | "missing_rubric"
    | "rubric_total_mismatch"

  questionId?: string
  questionNo?: string
  message: string
}

export type QuestionReadinessSummary = {
  questionId: string
  questionNo: string
  questionType: string
  questionMaxMarks: string

  isAiEvaluable: boolean
  modelAnswerReady: boolean

  rubricCount: number
  rubricTotal: string
  rubricMarksMatch: boolean

  templateGeneratedRubricCount: number
  manualRubricCount: number
  rubricSourceLabel: "None" | "Template" | "Manual" | "Mixed"

  isReadyForAi: boolean
}

export type ExamRubricReadiness = {
  isReady: boolean
  evaluableQuestionCount: number
  skippedQuestionCount: number
  readyQuestionCount: number
  issueCount: number
  issues: ExamRubricReadinessIssue[]
  questionSummaries: QuestionReadinessSummary[]
}

export function checkExamRubricReadiness(
  questions: QuestionForReadiness[],
  rubrics: RubricForReadiness[],
): ExamRubricReadiness {
  const issues: ExamRubricReadinessIssue[] = []

  if (questions.length === 0) {
    issues.push({
      type: "no_questions",
      message: "No questions have been added to this exam yet.",
    })
  }

  const rubricsByQuestionId = new Map<string, RubricForReadiness[]>()

  for (const question of questions) {
    rubricsByQuestionId.set(question.id, [])
  }

  for (const rubric of rubrics) {
    const existing = rubricsByQuestionId.get(rubric.question_id) || []
    rubricsByQuestionId.set(rubric.question_id, [...existing, rubric])
  }

  const questionSummaries = questions.map((question) => {
    const questionRubrics = rubricsByQuestionId.get(question.id) || []

    // If field is missing, treat as true for backward compatibility.
    const isAiEvaluable = question.is_ai_evaluable !== false

    const modelAnswerReady = isModelAnswerReady(
      question.model_answer,
      question.model_answer_status,
    )

    const rubricTotalNumber = questionRubrics.reduce((total, rubric) => {
      return total + Number(rubric.max_marks)
    }, 0)

    const questionMaxMarksNumber = Number(question.max_marks)

    const rubricMarksMatch = nearlyEqual(
      rubricTotalNumber,
      questionMaxMarksNumber,
    )

    const templateGeneratedRubricCount = questionRubrics.filter(
      (rubric) => rubric.is_template_generated === true,
    ).length

    const manualRubricCount =
      questionRubrics.length - templateGeneratedRubricCount

    const rubricSourceLabel = getRubricSourceLabel(
      questionRubrics.length,
      templateGeneratedRubricCount,
      manualRubricCount,
    )

    if (isAiEvaluable) {
      if (!modelAnswerReady) {
        issues.push({
          type: "missing_model_answer",
          questionId: question.id,
          questionNo: question.question_no,
          message: `Question ${question.question_no}: model answer is missing or not approved.`,
        })
      }

      if (questionRubrics.length === 0) {
        issues.push({
          type: "missing_rubric",
          questionId: question.id,
          questionNo: question.question_no,
          message: `Question ${question.question_no}: no rubric criteria found. Recommended: apply a rubric template or add custom rubric criteria.`,
        })
      }

      if (questionRubrics.length > 0 && !rubricMarksMatch) {
        issues.push({
          type: "rubric_total_mismatch",
          questionId: question.id,
          questionNo: question.question_no,
          message: `Question ${question.question_no}: rubric total ${formatMarksForReadiness(
            rubricTotalNumber,
          )} does not match question max marks ${formatMarksForReadiness(
            questionMaxMarksNumber,
          )}.`,
        })
      }
    }

    const isReadyForAi =
      isAiEvaluable &&
      modelAnswerReady &&
      questionRubrics.length > 0 &&
      rubricMarksMatch

    return {
      questionId: question.id,
      questionNo: question.question_no,
      questionType: question.question_type,
      questionMaxMarks: formatMarksForReadiness(questionMaxMarksNumber),

      isAiEvaluable,
      modelAnswerReady,

      rubricCount: questionRubrics.length,
      rubricTotal: formatMarksForReadiness(rubricTotalNumber),
      rubricMarksMatch,

      templateGeneratedRubricCount,
      manualRubricCount,
      rubricSourceLabel,

      isReadyForAi,
    }
  })

  const evaluableQuestionCount = questionSummaries.filter(
    (summary) => summary.isAiEvaluable,
  ).length

  const skippedQuestionCount = questionSummaries.filter(
    (summary) => !summary.isAiEvaluable,
  ).length

  const readyQuestionCount = questionSummaries.filter(
    (summary) => summary.isReadyForAi,
  ).length

  return {
    isReady: issues.length === 0 && evaluableQuestionCount > 0,
    evaluableQuestionCount,
    skippedQuestionCount,
    readyQuestionCount,
    issueCount: issues.length,
    issues,
    questionSummaries,
  }
}

function isModelAnswerReady(
  modelAnswer: string | null,
  modelAnswerStatus: string | null,
) {
  const hasModelAnswer = Boolean(modelAnswer && modelAnswer.trim().length > 0)

  if (!hasModelAnswer) {
    return false
  }

  return (
    modelAnswerStatus === "approved" ||
    modelAnswerStatus === "edited" ||
    modelAnswerStatus === "professor_approved"
  )
}

function getRubricSourceLabel(
  rubricCount: number,
  templateGeneratedRubricCount: number,
  manualRubricCount: number,
): "None" | "Template" | "Manual" | "Mixed" {
  if (rubricCount === 0) {
    return "None"
  }

  if (templateGeneratedRubricCount > 0 && manualRubricCount > 0) {
    return "Mixed"
  }

  if (templateGeneratedRubricCount > 0) {
    return "Template"
  }

  return "Manual"
}

function nearlyEqual(a: number, b: number) {
  return Math.abs(a - b) < 0.001
}

function formatMarksForReadiness(value: number) {
  return value.toFixed(2)
}