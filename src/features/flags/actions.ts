"use server";

import { revalidatePath } from "next/cache";
import { requireRole, requireStudent } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server";
import { ROUTES } from "@/lib/routes";

export async function createResultFlag(formData: FormData) {
  const examId = String(formData.get("examId") || "");
  const examStudentId = String(formData.get("examStudentId") || "");
  const evaluationId = String(formData.get("evaluationId") || "");
  const studentMessage = String(formData.get("studentMessage") || "").trim();

  if (!examId) {
    throw new Error("Exam ID is required.");
  }

  if (!examStudentId) {
    throw new Error("Exam student ID is required.");
  }

  if (!evaluationId) {
    throw new Error("Evaluation ID is required.");
  }

  if (!studentMessage) {
    throw new Error("Please write your query before submitting.");
  }

  if (studentMessage.length < 10) {
    throw new Error("Query must be at least 10 characters long.");
  }

  if (studentMessage.length > 2000) {
    throw new Error("Query cannot be longer than 2000 characters.");
  }

  const { user } = await requireStudent();
  const supabase = await createClient();

  const { error } = await supabase.from("result_flags").insert({
    exam_id: examId,
    exam_student_id: examStudentId,
    evaluation_id: evaluationId,
    student_id: user.id,
    status: "open",
    student_message: studentMessage,
  });

  if (error) {
    if (error.code === "23505") {
      throw new Error(
        "You already have an active query for this question result.",
      );
    }

    if (error.code === "23505") {
      throw new Error(
        "You already have an active query for this question result.",
      );
    }

    if (error.code === "42501") {
      throw new Error(
        "You are not allowed to raise a query for this result. Please make sure this is your published result.",
      );
    }

    throw new Error(error.message);
  }

  revalidatePath(ROUTES.STUDENT.RESULTS);
}


export async function updateResultFlagByProfessor(formData: FormData) {
  const examId = String(formData.get("examId") || "")
  const flagId = String(formData.get("flagId") || "")
  const nextStatus = String(formData.get("nextStatus") || "")
  const professorResponse = String(
    formData.get("professorResponse") || ""
  ).trim()

  if (!examId) {
    throw new Error("Exam ID is required.")
  }

  if (!flagId) {
    throw new Error("Flag ID is required.")
  }

  const allowedStatuses = ["under_review", "resolved", "rejected"]

  if (!allowedStatuses.includes(nextStatus)) {
    throw new Error("Invalid flag status.")
  }

  if (
    ["resolved", "rejected"].includes(nextStatus) &&
    professorResponse.length < 10
  ) {
    throw new Error(
      "Professor response must be at least 10 characters for resolved or rejected flags."
    )
  }

  if (professorResponse.length > 3000) {
    throw new Error("Professor response cannot be longer than 3000 characters.")
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
    throw new Error("You are not allowed to update flags for this exam.")
  }

  if (exam.status === "archived") {
    throw new Error("Cannot update flags for archived exams.")
  }

  const { data: flag, error: flagError } = await supabase
    .from("result_flags")
    .select("id, exam_id, status")
    .eq("id", flagId)
    .eq("exam_id", examId)
    .single()

  if (flagError || !flag) {
    throw new Error("Flag not found.")
  }

  const currentStatus = flag.status

  if (["resolved", "rejected"].includes(currentStatus)) {
    throw new Error("This flag is already closed.")
  }

  const now = new Date().toISOString()

  const updatePayload =
    nextStatus === "under_review"
      ? {
          status: "under_review",
          professor_response: professorResponse || null,
          resolved_by: null,
          resolved_at: null,
        }
      : {
          status: nextStatus,
          professor_response: professorResponse,
          resolved_by: user.id,
          resolved_at: now,
        }

  const { error: updateError } = await supabase
    .from("result_flags")
    .update(updatePayload)
    .eq("id", flagId)
    .eq("exam_id", examId)

  if (updateError) {
    throw new Error(updateError.message)
  }

  revalidatePath(ROUTES.PROFESSOR.EXAM_FLAGS(examId))
  revalidatePath(ROUTES.PROFESSOR.EXAM_DETAIL(examId))
}
