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