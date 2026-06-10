"use server"

import { revalidatePath } from "next/cache"
import { requireRole } from "@/lib/auth"
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