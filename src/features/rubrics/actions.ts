"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { requireRole } from "@/lib/auth"
import { parseMarksInput } from "@/lib/marks"
import { ROUTES } from "@/lib/routes"
import { createClient } from "@/lib/supabase/server"

type TemplateCriterionInput = {
  criterionOrder: number
  criterionName: string
  criterionDescription: string | null
  maxMarks: string
}

const CRITERIA_ROW_COUNT = 6

export async function createRubricTemplate(formData: FormData) {
  const examId = String(formData.get("examId") || "")
  const templateName = String(formData.get("templateName") || "").trim()
  const appliesToQuestionType = String(
    formData.get("appliesToQuestionType") || ""
  ).trim()
  const questionCategory = String(
    formData.get("questionCategory") || ""
  ).trim()
  const description = String(formData.get("description") || "").trim()

  if (!examId) {
    throw new Error("Exam ID is required.")
  }

  if (!templateName) {
    throw new Error("Template name is required.")
  }

  const totalMarks = parseMarksInput(
    formData.get("totalMarks"),
    "Template total marks"
  )

  const criteria = readTemplateCriteria(formData)

  if (criteria.length === 0) {
    throw new Error("Please add at least one rubric criterion.")
  }

  const criteriaTotal = criteria.reduce((total, criterion) => {
    return total + Number(criterion.maxMarks)
  }, 0)

  const templateTotal = Number(totalMarks)

  if (!nearlyEqual(criteriaTotal, templateTotal)) {
    throw new Error(
      `Criteria total (${criteriaTotal.toFixed(
        2
      )}) must equal template total marks (${templateTotal.toFixed(2)}).`
    )
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
    throw new Error("You are not allowed to create templates for this exam.")
  }

  if (exam.status === "published" || exam.status === "archived") {
    throw new Error(
      "Cannot create rubric templates for published or archived exams."
    )
  }

  const { data: createdTemplate, error: templateError } = await supabase
    .from("rubric_templates")
    .insert({
      exam_id: examId,
      professor_id: user.id,
      template_name: templateName,
      applies_to_question_type: appliesToQuestionType || null,
      question_category: questionCategory || null,
      total_marks: totalMarks,
      description: description || null,
      is_active: true,
    })
    .select("id")
    .single()

  if (templateError || !createdTemplate) {
    if (templateError?.code === "23505") {
      throw new Error("A rubric template with this name already exists.")
    }

    throw new Error(
      templateError?.message || "Failed to create rubric template."
    )
  }

  const criteriaToInsert = criteria.map((criterion) => ({
    rubric_template_id: createdTemplate.id,
    criterion_order: criterion.criterionOrder,
    criterion_name: criterion.criterionName,
    criterion_description: criterion.criterionDescription,
    max_marks: criterion.maxMarks,
  }))

  const { error: criteriaError } = await supabase
    .from("rubric_template_criteria")
    .insert(criteriaToInsert)

  if (criteriaError) {
    await supabase
      .from("rubric_templates")
      .delete()
      .eq("id", createdTemplate.id)

    throw new Error(criteriaError.message)
  }

  revalidatePath(ROUTES.PROFESSOR.RUBRIC_TEMPLATES(examId))
  revalidatePath(ROUTES.PROFESSOR.EXAM_DETAIL(examId))

  redirect(ROUTES.PROFESSOR.RUBRIC_TEMPLATES(examId))
}

function readTemplateCriteria(formData: FormData): TemplateCriterionInput[] {
  const criteria: TemplateCriterionInput[] = []

  for (let index = 1; index <= CRITERIA_ROW_COUNT; index += 1) {
    const criterionName = String(
      formData.get(`criterionName_${index}`) || ""
    ).trim()

    const criterionDescription = String(
      formData.get(`criterionDescription_${index}`) || ""
    ).trim()

    const rawMarks = formData.get(`criterionMarks_${index}`)
    const hasMarks = rawMarks !== null && String(rawMarks).trim() !== ""

    if (!criterionName && !hasMarks && !criterionDescription) {
      continue
    }

    if (!criterionName) {
      throw new Error(`Criterion ${index}: name is required.`)
    }

    if (!hasMarks) {
      throw new Error(`Criterion ${index}: marks are required.`)
    }

    const maxMarks = parseMarksInput(rawMarks, `Criterion ${index} marks`)

    criteria.push({
      criterionOrder: criteria.length + 1,
      criterionName,
      criterionDescription: criterionDescription || null,
      maxMarks,
    })
  }

  return criteria
}

function nearlyEqual(a: number, b: number) {
  return Math.abs(a - b) < 0.001
}