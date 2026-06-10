"use server"

import { revalidatePath } from "next/cache"
import { requireRole } from "@/lib/auth"
import { parseMarksInput } from "@/lib/marks"
import { createClient } from "@/lib/supabase/server"
import { ROUTES } from "@/lib/routes"

type EvaluationForApproval = {
  id: string
  exam_id: string
  ai_score: number | string | null
  max_marks: number | string
  status: string
}

type EvaluationBreakdownForApproval = {
  id: string
  ai_awarded_marks: number | string | null
}

type EvaluationForModification = {
  id: string
  exam_id: string
  max_marks: number | string
  status: string
}

type EvaluationBreakdownForModification = {
  id: string
  criterion_name: string
  max_marks: number | string
}

export async function approveAiEvaluation(formData: FormData) {
  const examId = String(formData.get("examId") || "")
  const evaluationId = String(formData.get("evaluationId") || "")

  if (!examId) {
    throw new Error("Exam ID is required.")
  }

  if (!evaluationId) {
    throw new Error("Evaluation ID is required.")
  }

  const { user } = await requireRole(["professor"])
  const supabase = await createClient()

  const { data: exam, error: examError } = await supabase
    .from("exams")
    .select("id, professor_id, status")
    .eq("id", examId)
    .single()

  if (examError || !exam) {
    throw new Error("Exam not found or you do not have access to it.")
  }

  if (exam.professor_id !== user.id) {
    throw new Error("You are not allowed to approve evaluations for this exam.")
  }

  if (exam.status === "published" || exam.status === "archived") {
    throw new Error("Cannot approve evaluations for published or archived exams.")
  }

  const { data: evaluation, error: evaluationError } = await supabase
    .from("evaluations")
    .select("id, exam_id, ai_score, max_marks, status")
    .eq("id", evaluationId)
    .eq("exam_id", examId)
    .single()

  if (evaluationError || !evaluation) {
    throw new Error("Evaluation not found.")
  }

  const typedEvaluation = evaluation as EvaluationForApproval

  if (
    typedEvaluation.status !== "professor_review_pending" &&
    typedEvaluation.status !== "ai_checked"
  ) {
    throw new Error("Only AI-checked evaluations can be approved.")
  }

  if (typedEvaluation.ai_score === null) {
    throw new Error("AI score is missing. Cannot approve this evaluation.")
  }

  const aiScore = Number(typedEvaluation.ai_score)
  const maxMarks = Number(typedEvaluation.max_marks)

  if (!Number.isFinite(aiScore) || aiScore < 0 || aiScore > maxMarks) {
    throw new Error("AI score is invalid.")
  }

  const { data: breakdowns, error: breakdownsError } = await supabase
    .from("evaluation_rubric_breakdowns")
    .select("id, ai_awarded_marks")
    .eq("evaluation_id", evaluationId)

  if (breakdownsError) {
    throw new Error(breakdownsError.message)
  }

  const typedBreakdowns =
    (breakdowns || []) as EvaluationBreakdownForApproval[]

  if (typedBreakdowns.length === 0) {
    throw new Error("Rubric breakdown rows are missing.")
  }

  for (const breakdown of typedBreakdowns) {
    if (breakdown.ai_awarded_marks === null) {
      throw new Error("One or more rubric AI marks are missing.")
    }

    const { error: updateBreakdownError } = await supabase
      .from("evaluation_rubric_breakdowns")
      .update({
        final_awarded_marks: breakdown.ai_awarded_marks,
      })
      .eq("id", breakdown.id)

    if (updateBreakdownError) {
      throw new Error(updateBreakdownError.message)
    }
  }

  const now = new Date().toISOString()

  const { error: updateEvaluationError } = await supabase
    .from("evaluations")
    .update({
      final_score: typedEvaluation.ai_score,
      professor_score: null,
      status: "approved",
      reviewed_by: user.id,
      reviewed_at: now,
      approved_by: user.id,
      approved_at: now,
    })
    .eq("id", evaluationId)
    .eq("exam_id", examId)

  if (updateEvaluationError) {
    throw new Error(updateEvaluationError.message)
  }

  revalidatePath(ROUTES.PROFESSOR.EXAM_REVIEW(examId))
  revalidatePath(ROUTES.PROFESSOR.EXAM_DETAIL(examId))
}

export async function modifyEvaluationByProfessor(formData: FormData) {
  const examId = String(formData.get("examId") || "")
  const evaluationId = String(formData.get("evaluationId") || "")
  const professorFeedback = String(
    formData.get("professorFeedback") || ""
  ).trim()

  if (!examId) {
    throw new Error("Exam ID is required.")
  }

  if (!evaluationId) {
    throw new Error("Evaluation ID is required.")
  }

  const { user } = await requireRole(["professor"])
  const supabase = await createClient()

  const { data: exam, error: examError } = await supabase
    .from("exams")
    .select("id, professor_id, status")
    .eq("id", examId)
    .single()

  if (examError || !exam) {
    throw new Error("Exam not found or you do not have access to it.")
  }

  if (exam.professor_id !== user.id) {
    throw new Error("You are not allowed to modify evaluations for this exam.")
  }

  if (exam.status === "published" || exam.status === "archived") {
    throw new Error("Cannot modify evaluations for published or archived exams.")
  }

  const { data: evaluation, error: evaluationError } = await supabase
    .from("evaluations")
    .select("id, exam_id, max_marks, status")
    .eq("id", evaluationId)
    .eq("exam_id", examId)
    .single()

  if (evaluationError || !evaluation) {
    throw new Error("Evaluation not found.")
  }

  const typedEvaluation = evaluation as EvaluationForModification

  const allowedStatuses = [
    "professor_review_pending",
    "ai_checked",
    "approved",
    "modified_by_professor",
  ]

  if (!allowedStatuses.includes(typedEvaluation.status)) {
    throw new Error("This evaluation cannot be modified in its current status.")
  }

  const { data: breakdowns, error: breakdownsError } = await supabase
    .from("evaluation_rubric_breakdowns")
    .select("id, criterion_name, max_marks")
    .eq("evaluation_id", evaluationId)

  if (breakdownsError) {
    throw new Error(breakdownsError.message)
  }

  const typedBreakdowns =
    (breakdowns || []) as EvaluationBreakdownForModification[]

  if (typedBreakdowns.length === 0) {
    throw new Error("Rubric breakdown rows are missing.")
  }

  let totalProfessorScore = 0

  for (const breakdown of typedBreakdowns) {
    const marksFieldName = `breakdown_${breakdown.id}_marks`
    const reasonFieldName = `breakdown_${breakdown.id}_reason`

    const rawMarks = formData.get(marksFieldName)

    if (rawMarks === null || String(rawMarks).trim() === "") {
      throw new Error(`Marks are required for ${breakdown.criterion_name}.`)
    }

    const awardedMarks = parseMarksInput(
      rawMarks,
      `Marks for ${breakdown.criterion_name}`
    )

    const awardedMarksNumber = Number(awardedMarks)
    const maxMarksNumber = Number(breakdown.max_marks)

    if (!Number.isFinite(maxMarksNumber)) {
      throw new Error(`Invalid max marks for ${breakdown.criterion_name}.`)
    }

    if (awardedMarksNumber > maxMarksNumber) {
      throw new Error(
        `Marks for ${breakdown.criterion_name} cannot be greater than ${maxMarksNumber}.`
      )
    }

    const professorReason = String(formData.get(reasonFieldName) || "").trim()

    const { error: updateBreakdownError } = await supabase
      .from("evaluation_rubric_breakdowns")
      .update({
        professor_awarded_marks: awardedMarks,
        final_awarded_marks: awardedMarks,
        professor_reason: professorReason || null,
      })
      .eq("id", breakdown.id)

    if (updateBreakdownError) {
      throw new Error(updateBreakdownError.message)
    }

    totalProfessorScore += awardedMarksNumber
  }

  const maxEvaluationMarks = Number(typedEvaluation.max_marks)

  if (!Number.isFinite(maxEvaluationMarks)) {
    throw new Error("Evaluation max marks is invalid.")
  }

  if (totalProfessorScore > maxEvaluationMarks) {
    throw new Error(
      `Final score cannot be greater than max marks ${maxEvaluationMarks}.`
    )
  }

  const now = new Date().toISOString()
  const finalScore = totalProfessorScore.toFixed(2)

  const { error: updateEvaluationError } = await supabase
    .from("evaluations")
    .update({
      professor_score: finalScore,
      final_score: finalScore,
      professor_feedback: professorFeedback || null,
      status: "modified_by_professor",
      reviewed_by: user.id,
      reviewed_at: now,
      approved_by: null,
      approved_at: null,
    })
    .eq("id", evaluationId)
    .eq("exam_id", examId)

  if (updateEvaluationError) {
    throw new Error(updateEvaluationError.message)
  }

  revalidatePath(ROUTES.PROFESSOR.EXAM_REVIEW(examId))
  revalidatePath(ROUTES.PROFESSOR.EXAM_DETAIL(examId))
}