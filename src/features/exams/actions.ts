"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { requireRole } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import { ROUTES } from "@/lib/routes"

export async function createExam(formData: FormData) {
  const title = String(formData.get("title") || "").trim()
  const subject = String(formData.get("subject") || "").trim()
  const course = String(formData.get("course") || "").trim()
  const batch = String(formData.get("batch") || "").trim()
  const totalMarksValue = String(formData.get("totalMarks") || "0").trim()

  if (!title) {
    throw new Error("Exam title is required.")
  }

  const totalMarks = Number(totalMarksValue)

  if (Number.isNaN(totalMarks) || totalMarks < 0) {
    throw new Error("Total marks must be a valid non-negative number.")
  }

  const { user } = await requireRole(["professor"])

  const supabase = await createClient()

  const { error } = await supabase.from("exams").insert({
    professor_id: user.id,
    title,
    subject: subject || null,
    course: course || null,
    batch: batch || null,
    total_marks: totalMarks,
  })

  if (error) {
    throw new Error(error.message)
  }

  revalidatePath(ROUTES.PROFESSOR.EXAMS)

  redirect(ROUTES.PROFESSOR.EXAMS)
}

// ======================
// CREATE QUESTION
// ======================

export async function createQuestion(formData: FormData) {
  const examId = String(formData.get("examId") || "")
  const questionNo = String(formData.get("questionNo") || "").trim()
  const questionText = String(formData.get("questionText") || "").trim()
  const questionType = String(formData.get("questionType") || "other").trim()
  const maxMarksValue = String(formData.get("maxMarks") || "0").trim()
  const modelAnswer = String(formData.get("modelAnswer") || "").trim()

  if (!examId) {
    throw new Error("Exam ID is required.")
  }

  if (!questionNo) {
    throw new Error("Question number is required.")
  }

  if (!questionText) {
    throw new Error("Question text is required.")
  }

  const maxMarks = Number(maxMarksValue)

  if (Number.isNaN(maxMarks) || maxMarks < 0) {
    throw new Error("Max marks must be a valid non-negative number.")
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
    throw new Error("You are not allowed to add questions to this exam.")
  }

  const { count, error: countError } = await supabase
    .from("questions")
    .select("id", { count: "exact", head: true })
    .eq("exam_id", examId)

  if (countError) {
    throw new Error(countError.message)
  }

  const nextQuestionOrder = (count || 0) + 1

  const { error: insertError } = await supabase.from("questions").insert({
    exam_id: examId,
    question_no: questionNo,
    question_order: nextQuestionOrder,
    question_text: questionText,
    question_type: questionType as
      | "short_answer"
      | "long_answer"
      | "case_based"
      | "essay"
      | "other",
    max_marks: maxMarks,
    model_answer: modelAnswer || null,
    model_answer_status: modelAnswer ? "approved" : "not_provided",
  })

  if (insertError) {
    throw new Error(insertError.message)
  }

  if (exam.status === "draft") {
    const { error: updateExamError } = await supabase
      .from("exams")
      .update({
        status: "questions_added",
      })
      .eq("id", examId)

    if (updateExamError) {
      throw new Error(updateExamError.message)
    }
  }

  revalidatePath(ROUTES.PROFESSOR.EXAM_DETAIL(examId))
  revalidatePath(ROUTES.PROFESSOR.EXAMS)

  redirect(ROUTES.PROFESSOR.EXAM_DETAIL(examId))
}