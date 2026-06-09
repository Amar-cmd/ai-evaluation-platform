export type QuestionForReadiness = {
  id: string
  question_no: string
  max_marks: number | string
  model_answer: string | null
  model_answer_status: string
}

export type RubricForReadiness = {
  question_id: string
  max_marks: number | string
}

export type ReadinessIssue = {
  questionId?: string
  questionNo?: string
  type:
    | "no_questions"
    | "missing_model_answer"
    | "missing_rubrics"
    | "rubric_total_mismatch"
  message: string
}

export type QuestionReadinessSummary = {
  questionId: string
  questionNo: string
  questionMaxMarks: number
  rubricTotal: number
  rubricCount: number
  modelAnswerReady: boolean
  rubricMarksMatch: boolean
}

const READY_MODEL_ANSWER_STATUSES = ["approved", "edited_by_professor"]

function toNumber(value: number | string) {
  const parsed = Number(value)

  if (Number.isNaN(parsed)) {
    return 0
  }

  return parsed
}

function nearlyEqual(a: number, b: number) {
  return Math.abs(a - b) < 0.001
}

export function checkExamRubricReadiness(
  questions: QuestionForReadiness[],
  rubrics: RubricForReadiness[]
) {
  const issues: ReadinessIssue[] = []
  const questionSummaries: QuestionReadinessSummary[] = []

  if (questions.length === 0) {
    issues.push({
      type: "no_questions",
      message: "No questions have been added yet.",
    })

    return {
      isReady: false,
      issues,
      questionSummaries,
    }
  }

  for (const question of questions) {
    const questionRubrics = rubrics.filter(
      (rubric) => rubric.question_id === question.id
    )

    const rubricTotal = questionRubrics.reduce((total, rubric) => {
      return total + toNumber(rubric.max_marks)
    }, 0)

    const questionMaxMarks = toNumber(question.max_marks)

    const hasModelAnswerText = Boolean(question.model_answer?.trim())

    const modelAnswerReady =
      hasModelAnswerText &&
      READY_MODEL_ANSWER_STATUSES.includes(question.model_answer_status)

    const rubricMarksMatch = nearlyEqual(rubricTotal, questionMaxMarks)

    if (!modelAnswerReady) {
      issues.push({
        questionId: question.id,
        questionNo: question.question_no,
        type: "missing_model_answer",
        message: `Question ${question.question_no}: approved model answer is missing.`,
      })
    }

    if (questionRubrics.length === 0) {
      issues.push({
        questionId: question.id,
        questionNo: question.question_no,
        type: "missing_rubrics",
        message: `Question ${question.question_no}: no rubric criteria added.`,
      })
    }

    if (questionRubrics.length > 0 && !rubricMarksMatch) {
      issues.push({
        questionId: question.id,
        questionNo: question.question_no,
        type: "rubric_total_mismatch",
        message: `Question ${question.question_no}: rubric total is ${rubricTotal}, but question max marks is ${questionMaxMarks}.`,
      })
    }

    questionSummaries.push({
      questionId: question.id,
      questionNo: question.question_no,
      questionMaxMarks,
      rubricTotal,
      rubricCount: questionRubrics.length,
      modelAnswerReady,
      rubricMarksMatch,
    })
  }

  return {
    isReady: issues.length === 0,
    issues,
    questionSummaries,
  }
}