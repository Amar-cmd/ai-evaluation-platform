"use server";

import { revalidatePath } from "next/cache";
import { requireStudent } from "@/lib/auth";
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
