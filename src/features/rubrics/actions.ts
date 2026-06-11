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

type RubricTemplateCriterionForApply = {
  id: string
  criterion_order: number
  criterion_name: string
  criterion_description: string | null
  max_marks: number | string
}

type RubricTemplateForApply = {
  id: string
  exam_id: string
  professor_id: string
  template_name: string
  applies_to_question_type: string | null
  total_marks: number | string
  is_active: boolean
  rubric_template_criteria: RubricTemplateCriterionForApply[]
}

type QuestionForTemplateApply = {
  id: string
  question_no: string
  question_type: string
  max_marks: number | string
}

type ExistingRubricForApply = {
  id: string
  question_id: string
}

export async function applyRubricTemplateToMatchingQuestions(
  formData: FormData
) {
  const examId = String(formData.get("examId") || "")
  const templateId = String(formData.get("templateId") || "")
  const replaceExisting = formData.get("replaceExisting") === "on"

  if (!examId) {
    throw new Error("Exam ID is required.")
  }

  if (!templateId) {
    throw new Error("Rubric template ID is required.")
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
    throw new Error("You are not allowed to apply templates for this exam.")
  }

  if (exam.status === "published" || exam.status === "archived") {
    throw new Error(
      "Cannot apply rubric templates to published or archived exams."
    )
  }

  const { data: template, error: templateError } = await supabase
    .from("rubric_templates")
    .select(
      `
      id,
      exam_id,
      professor_id,
      template_name,
      applies_to_question_type,
      total_marks,
      is_active,
      rubric_template_criteria (
        id,
        criterion_order,
        criterion_name,
        criterion_description,
        max_marks
      )
    `
    )
    .eq("id", templateId)
    .eq("exam_id", examId)
    .single()

  if (templateError || !template) {
    throw new Error("Rubric template not found.")
  }

  const typedTemplate = template as RubricTemplateForApply

  if (typedTemplate.professor_id !== user.id) {
    throw new Error("You are not allowed to use this template.")
  }

  if (!typedTemplate.is_active) {
    throw new Error("Inactive templates cannot be applied.")
  }

  if (!typedTemplate.applies_to_question_type) {
    throw new Error(
      "This template does not have a question type. Please create a template with a question type before applying."
    )
  }

  const criteria = [...(typedTemplate.rubric_template_criteria || [])].sort(
    (a, b) => a.criterion_order - b.criterion_order
  )

  if (criteria.length === 0) {
    throw new Error("This template has no criteria.")
  }

  const criteriaTotal = criteria.reduce((total, criterion) => {
    return total + Number(criterion.max_marks)
  }, 0)

  const templateTotal = Number(typedTemplate.total_marks)

  if (!nearlyEqual(criteriaTotal, templateTotal)) {
    throw new Error(
      `Template criteria total (${criteriaTotal.toFixed(
        2
      )}) does not match template total marks (${templateTotal.toFixed(2)}).`
    )
  }

  const { data: questions, error: questionsError } = await supabase
    .from("questions")
    .select("id, question_no, question_type, max_marks")
    .eq("exam_id", examId)
    .eq("question_type", typedTemplate.applies_to_question_type)
    .order("question_order", { ascending: true })

  if (questionsError) {
    throw new Error(questionsError.message)
  }

  const matchingQuestionsByType = (questions || []) as QuestionForTemplateApply[]

  const targetQuestions = matchingQuestionsByType.filter((question) =>
    nearlyEqual(Number(question.max_marks), templateTotal)
  )

  if (targetQuestions.length === 0) {
    throw new Error(
      `No matching questions found. Template applies to ${typedTemplate.applies_to_question_type} with ${templateTotal.toFixed(
        2
      )} marks.`
    )
  }

  const targetQuestionIds = targetQuestions.map((question) => question.id)

  const { data: existingRubrics, error: existingRubricsError } =
    await supabase
      .from("rubrics")
      .select("id, question_id")
      .in("question_id", targetQuestionIds)

  if (existingRubricsError) {
    throw new Error(existingRubricsError.message)
  }

  const typedExistingRubrics =
    (existingRubrics || []) as ExistingRubricForApply[]

  const questionsWithExistingRubrics = new Set(
    typedExistingRubrics.map((rubric) => rubric.question_id)
  )

  const questionsToApply = replaceExisting
    ? targetQuestions
    : targetQuestions.filter(
        (question) => !questionsWithExistingRubrics.has(question.id)
      )

  if (questionsToApply.length === 0) {
    throw new Error(
      "All matching questions already have rubrics. Enable replace existing rubrics if you want to overwrite them."
    )
  }

  if (replaceExisting && typedExistingRubrics.length > 0) {
    const { error: deleteExistingError } = await supabase
      .from("rubrics")
      .delete()
      .in("question_id", targetQuestionIds)

    if (deleteExistingError) {
      throw new Error(deleteExistingError.message)
    }
  }

  const rubricsToInsert = questionsToApply.flatMap((question) => {
    return criteria.map((criterion) => ({
      question_id: question.id,
      criterion_order: criterion.criterion_order,
      criterion_name: criterion.criterion_name,
      criterion_description: criterion.criterion_description,
      max_marks: String(Number(criterion.max_marks).toFixed(2)),
      source_template_id: typedTemplate.id,
      source_template_criterion_id: criterion.id,
      is_template_generated: true,
    }))
  })

  const { error: insertRubricsError } = await supabase
    .from("rubrics")
    .insert(rubricsToInsert)

  if (insertRubricsError) {
    throw new Error(insertRubricsError.message)
  }

  revalidatePath(ROUTES.PROFESSOR.RUBRIC_TEMPLATES(examId))
  revalidatePath(ROUTES.PROFESSOR.EXAM_DETAIL(examId))

  redirect(ROUTES.PROFESSOR.RUBRIC_TEMPLATES(examId))
}