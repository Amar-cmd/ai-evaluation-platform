"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ROUTES } from "@/lib/routes";
import { checkExamRubricReadiness } from "@/features/exams/readiness";
import { parseMarksInput } from "@/lib/marks";
import { parseAnswerJsonText } from "@/features/uploads/parser";

export async function createExam(formData: FormData) {
  const title = String(formData.get("title") || "").trim();
  const subject = String(formData.get("subject") || "").trim();
  const course = String(formData.get("course") || "").trim();
  const batch = String(formData.get("batch") || "").trim();

  const totalMarks = parseMarksInput(formData.get("totalMarks"), "Total marks");

  if (!title) {
    throw new Error("Exam title is required.");
  }

  const { user } = await requireRole(["professor"]);

  const supabase = await createClient();

  const { error } = await supabase.from("exams").insert({
    professor_id: user.id,
    title,
    subject: subject || null,
    course: course || null,
    batch: batch || null,
    total_marks: totalMarks,
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath(ROUTES.PROFESSOR.EXAMS);

  redirect(ROUTES.PROFESSOR.EXAMS);
}

// ======================
// CREATE QUESTION
// ======================

export async function createQuestion(formData: FormData) {
  const examId = String(formData.get("examId") || "");
  const questionNo = String(formData.get("questionNo") || "").trim();
  const questionText = String(formData.get("questionText") || "").trim();
  const questionType = String(formData.get("questionType") || "other").trim();
  const modelAnswer = String(formData.get("modelAnswer") || "").trim();

  const maxMarks = parseMarksInput(formData.get("maxMarks"), "Max marks");

  if (!examId) {
    throw new Error("Exam ID is required.");
  }

  if (!questionNo) {
    throw new Error("Question number is required.");
  }

  if (!questionText) {
    throw new Error("Question text is required.");
  }

  const { user } = await requireRole(["professor"]);

  const supabase = await createClient();

  const { data: exam, error: examError } = await supabase
    .from("exams")
    .select("id, professor_id, status")
    .eq("id", examId)
    .single();

  if (examError || !exam) {
    throw new Error("Exam not found or you do not have access to it.");
  }

  if (exam.professor_id !== user.id) {
    throw new Error("You are not allowed to add questions to this exam.");
  }

  const { count, error: countError } = await supabase
    .from("questions")
    .select("id", { count: "exact", head: true })
    .eq("exam_id", examId);

  if (countError) {
    throw new Error(countError.message);
  }

  const nextQuestionOrder = (count || 0) + 1;

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
  });

  if (insertError) {
    throw new Error(insertError.message);
  }

  if (exam.status === "draft") {
    const { error: updateExamError } = await supabase
      .from("exams")
      .update({
        status: "questions_added",
      })
      .eq("id", examId);

    if (updateExamError) {
      throw new Error(updateExamError.message);
    }
  }

  revalidatePath(ROUTES.PROFESSOR.EXAM_DETAIL(examId));
  revalidatePath(ROUTES.PROFESSOR.EXAMS);

  redirect(ROUTES.PROFESSOR.EXAM_DETAIL(examId));
}

// ======================
// CREATE RUBRIC
// ======================
export async function createRubric(formData: FormData) {
  const examId = String(formData.get("examId") || "");
  const questionId = String(formData.get("questionId") || "");
  const criterionName = String(formData.get("criterionName") || "").trim();
  const criterionDescription = String(
    formData.get("criterionDescription") || "",
  ).trim();
  const maxMarks = parseMarksInput(formData.get("maxMarks"), "Max marks");

  if (!examId) {
    throw new Error("Exam ID is required.");
  }

  if (!questionId) {
    throw new Error("Question ID is required.");
  }

  if (!criterionName) {
    throw new Error("Criterion name is required.");
  }

  await requireRole(["professor"]);

  const supabase = await createClient();

  const { data: question, error: questionError } = await supabase
    .from("questions")
    .select("id, exam_id")
    .eq("id", questionId)
    .single();

  if (questionError || !question) {
    throw new Error("Question not found or you do not have access to it.");
  }

  if (question.exam_id !== examId) {
    throw new Error("Question does not belong to this exam.");
  }

  const { count, error: countError } = await supabase
    .from("rubrics")
    .select("id", { count: "exact", head: true })
    .eq("question_id", questionId);

  if (countError) {
    throw new Error(countError.message);
  }

  const nextCriterionOrder = (count || 0) + 1;

  const { error: insertError } = await supabase.from("rubrics").insert({
    question_id: questionId,
    criterion_order: nextCriterionOrder,
    criterion_name: criterionName,
    criterion_description: criterionDescription || null,
    max_marks: maxMarks,
  });

  if (insertError) {
    throw new Error(insertError.message);
  }

  revalidatePath(ROUTES.PROFESSOR.EXAM_DETAIL(examId));

  redirect(ROUTES.PROFESSOR.EXAM_DETAIL(examId));
}

// ======================
// MARK EXAM RUBRIC READY
// ======================
export async function markExamRubricReady(formData: FormData) {
  const examId = String(formData.get("examId") || "");

  if (!examId) {
    throw new Error("Exam ID is required.");
  }

  const { user } = await requireRole(["professor"]);

  const supabase = await createClient();

  const { data: exam, error: examError } = await supabase
    .from("exams")
    .select("id, professor_id, status")
    .eq("id", examId)
    .single();

  if (examError || !exam) {
    throw new Error("Exam not found or you do not have access to it.");
  }

  if (exam.professor_id !== user.id) {
    throw new Error("You are not allowed to update this exam.");
  }

  if (exam.status === "archived" || exam.status === "published") {
    throw new Error(
      "Published or archived exams cannot be marked rubric ready.",
    );
  }

  const { data: questions, error: questionsError } = await supabase
    .from("questions")
    .select("id, question_no, max_marks, model_answer, model_answer_status")
    .eq("exam_id", examId);

  if (questionsError) {
    throw new Error(questionsError.message);
  }

  const questionIds = questions.map((question) => question.id);

  const { data: rubrics, error: rubricsError } =
    questionIds.length > 0
      ? await supabase
          .from("rubrics")
          .select("question_id, max_marks")
          .in("question_id", questionIds)
      : { data: [], error: null };

  if (rubricsError) {
    throw new Error(rubricsError.message);
  }

  const readiness = checkExamRubricReadiness(questions, rubrics || []);

  if (!readiness.isReady) {
    throw new Error(
      "Exam is not rubric ready. Please fix readiness issues first.",
    );
  }

  const { error: updateError } = await supabase
    .from("exams")
    .update({
      status: "rubric_ready",
    })
    .eq("id", examId);

  if (updateError) {
    throw new Error(updateError.message);
  }

  revalidatePath(ROUTES.PROFESSOR.EXAM_DETAIL(examId));
  revalidatePath(ROUTES.PROFESSOR.EXAMS);

  redirect(ROUTES.PROFESSOR.EXAM_DETAIL(examId));
}

// ======================
// UPLOAD ANSWER JSON
// ======================
export async function uploadAnswerJson(formData: FormData) {
  const examId = String(formData.get("examId") || "");
  const file = formData.get("answerFile");

  if (!examId) {
    throw new Error("Exam ID is required.");
  }

  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Please upload a valid JSON file.");
  }

  const fileName = file.name;
  const lowerFileName = fileName.toLowerCase();

  if (!lowerFileName.endsWith(".json")) {
    throw new Error("Only JSON files are supported in this step.");
  }

  const maxFileSize = 5 * 1024 * 1024;

  if (file.size > maxFileSize) {
    throw new Error("File size must be less than 5 MB.");
  }

  const { user } = await requireRole(["professor"]);

  const supabase = await createClient();

  const { data: exam, error: examError } = await supabase
    .from("exams")
    .select("id, professor_id, status")
    .eq("id", examId)
    .single();

  if (examError || !exam) {
    throw new Error("Exam not found or you do not have access to it.");
  }

  if (exam.professor_id !== user.id) {
    throw new Error("You are not allowed to upload answers for this exam.");
  }

  if (exam.status === "published" || exam.status === "archived") {
    throw new Error("Cannot upload answers for published or archived exams.");
  }

  const { count: questionCount, error: questionCountError } = await supabase
    .from("questions")
    .select("id", { count: "exact", head: true })
    .eq("exam_id", examId);

  if (questionCountError) {
    throw new Error(questionCountError.message);
  }

  if (!questionCount || questionCount === 0) {
    throw new Error("Please add questions before uploading student answers.");
  }

  const jsonText = await file.text();

  let parsedUpload: ReturnType<typeof parseAnswerJsonText> | null = null;
  let parseErrorMessage: string | null = null;

  try {
    parsedUpload = parseAnswerJsonText(jsonText);
  } catch (error) {
    parseErrorMessage =
      error instanceof Error ? error.message : "Failed to parse JSON file.";
  }

  const parserIssueMessage =
    parsedUpload && parsedUpload.issues.length > 0
      ? parsedUpload.issues.map((issue) => issue.message).join("\n")
      : null;

  const uploadStatus =
    parsedUpload && parsedUpload.isValidForImport
      ? "mapping_pending"
      : "parse_failed";

  const { data: createdUpload, error: uploadError } = await supabase
    .from("answer_uploads")
    .insert({
      exam_id: examId,
      uploaded_by: user.id,
      file_name: fileName,
      file_type: "json",
      total_rows: parsedUpload?.totalRows || 0,
      detected_columns: parsedUpload?.detectedColumns || [],
      response_columns: parsedUpload?.responseColumns || [],
      raw_preview: parsedUpload?.previewRows || [],
      mapping_config: {},
      status: uploadStatus,
      error_message: parseErrorMessage || parserIssueMessage,
    })
    .select("id")
    .single();

  if (uploadError || !createdUpload) {
    throw new Error(uploadError?.message || "Failed to create upload record.");
  }

  if (parsedUpload && parsedUpload.studentRows.length > 0) {
    const uploadRowsToInsert = parsedUpload.studentRows.map((studentRow) => ({
      exam_id: examId,
      upload_id: createdUpload.id,
      source_row_index: studentRow.sourceRowIndex,
      first_name: studentRow.firstName,
      last_name: studentRow.lastName,
      id_number: studentRow.idNumber,
      email: studentRow.email,
      raw_row: studentRow.rawRow,
      parsed_answers: studentRow.answers,
    }));

    const { error: uploadRowsError } = await supabase
      .from("answer_upload_rows")
      .insert(uploadRowsToInsert);

    if (uploadRowsError) {
      throw new Error(uploadRowsError.message);
    }
  }

  if (uploadStatus === "mapping_pending") {
    const shouldMoveToAnswersUploaded =
      exam.status === "draft" || exam.status === "questions_added";

    if (shouldMoveToAnswersUploaded) {
      const { error: updateExamError } = await supabase
        .from("exams")
        .update({
          status: "answers_uploaded",
        })
        .eq("id", examId);

      if (updateExamError) {
        throw new Error(updateExamError.message);
      }
    }
  }

  revalidatePath(ROUTES.PROFESSOR.EXAM_DETAIL(examId));

  redirect(ROUTES.PROFESSOR.EXAM_DETAIL(examId));
}

// ======================
// SAVE RESPONSE COLUMN MAPPING
// ======================
export async function saveResponseColumnMapping(formData: FormData) {
  const examId = String(formData.get("examId") || "");
  const uploadId = String(formData.get("uploadId") || "");

  if (!examId) {
    throw new Error("Exam ID is required.");
  }

  if (!uploadId) {
    throw new Error("Upload ID is required.");
  }

  const { user } = await requireRole(["professor"]);

  const supabase = await createClient();

  const { data: exam, error: examError } = await supabase
    .from("exams")
    .select("id, professor_id, status")
    .eq("id", examId)
    .single();

  if (examError || !exam) {
    throw new Error("Exam not found or you do not have access to it.");
  }

  if (exam.professor_id !== user.id) {
    throw new Error("You are not allowed to map answers for this exam.");
  }

  if (exam.status === "published" || exam.status === "archived") {
    throw new Error("Cannot change mapping for published or archived exams.");
  }

  const { data: upload, error: uploadError } = await supabase
    .from("answer_uploads")
    .select("id, exam_id, response_columns, status")
    .eq("id", uploadId)
    .eq("exam_id", examId)
    .single();

  if (uploadError || !upload) {
    throw new Error("Upload not found or you do not have access to it.");
  }

  if (upload.status === "parse_failed") {
    throw new Error("Cannot map a failed upload. Please upload a valid file.");
  }

  if (upload.status === "imported") {
    throw new Error(
      "This upload has already been imported. Mapping cannot be changed now.",
    );
  }

  const responseColumns: string[] = Array.isArray(upload.response_columns)
    ? (upload.response_columns as string[])
    : [];

  if (responseColumns.length === 0) {
    throw new Error("No response columns were detected in this upload.");
  }

  const { data: questions, error: questionsError } = await supabase
    .from("questions")
    .select("id, question_no")
    .eq("exam_id", examId);

  if (questionsError) {
    throw new Error(questionsError.message);
  }

  const validQuestionIds = new Set(questions.map((question) => question.id));

  const mappingConfig: Record<string, string> = {};

  for (const responseColumn of responseColumns) {
    const selectedQuestionId = String(
      formData.get(`map_${responseColumn}`) || "",
    ).trim();

    if (!selectedQuestionId) {
      continue;
    }

    if (!validQuestionIds.has(selectedQuestionId)) {
      throw new Error(
        `Invalid question selected for response column ${responseColumn}.`,
      );
    }

    mappingConfig[responseColumn] = selectedQuestionId;
  }

  const mappedQuestionIds = Object.values(mappingConfig);
  const uniqueMappedQuestionIds = new Set(mappedQuestionIds);

  if (mappedQuestionIds.length === 0) {
    throw new Error("Please map at least one response column to a question.");
  }

  if (uniqueMappedQuestionIds.size !== mappedQuestionIds.length) {
    throw new Error(
      "One question cannot be mapped to multiple response columns.",
    );
  }

  const { error: updateUploadError } = await supabase
    .from("answer_uploads")
    .update({
      mapping_config: mappingConfig,
      status: "mapped",
      error_message: null,
    })
    .eq("id", uploadId)
    .eq("exam_id", examId);

  if (updateUploadError) {
    throw new Error(updateUploadError.message);
  }

  const shouldMoveExamToMapped =
    exam.status === "draft" ||
    exam.status === "questions_added" ||
    exam.status === "answers_uploaded";

  if (shouldMoveExamToMapped) {
    const { error: updateExamError } = await supabase
      .from("exams")
      .update({
        status: "mapped",
      })
      .eq("id", examId);

    if (updateExamError) {
      throw new Error(updateExamError.message);
    }
  }

  revalidatePath(ROUTES.PROFESSOR.EXAM_DETAIL(examId));
  revalidatePath(ROUTES.PROFESSOR.MAP_ANSWER_UPLOAD(examId, uploadId));

  redirect(ROUTES.PROFESSOR.EXAM_DETAIL(examId));
}

// ---
export async function importMappedAnswers(formData: FormData) {
  const examId = String(formData.get("examId") || "");
  const uploadId = String(formData.get("uploadId") || "");

  if (!examId) {
    throw new Error("Exam ID is required.");
  }

  if (!uploadId) {
    throw new Error("Upload ID is required.");
  }

  const { user } = await requireRole(["professor"]);

  const supabase = await createClient();

  const { data: exam, error: examError } = await supabase
    .from("exams")
    .select("id, professor_id, status")
    .eq("id", examId)
    .single();

  if (examError || !exam) {
    throw new Error("Exam not found or you do not have access to it.");
  }

  if (exam.professor_id !== user.id) {
    throw new Error("You are not allowed to import answers for this exam.");
  }

  if (exam.status === "published" || exam.status === "archived") {
    throw new Error("Cannot import answers for published or archived exams.");
  }

  const { data: upload, error: uploadError } = await supabase
    .from("answer_uploads")
    .select("id, exam_id, response_columns, mapping_config, status")
    .eq("id", uploadId)
    .eq("exam_id", examId)
    .single();

  if (uploadError || !upload) {
    throw new Error("Upload not found or you do not have access to it.");
  }

  if (upload.status === "parse_failed") {
    throw new Error("Cannot import a failed upload.");
  }

  if (upload.status === "mapping_pending") {
    throw new Error("Please map response columns before importing.");
  }

  if (upload.status === "imported") {
    throw new Error("This upload has already been imported.");
  }

  if (upload.status !== "mapped") {
    throw new Error("Only mapped uploads can be imported.");
  }

  const mappingConfig = readMappingConfig(upload.mapping_config);
  const mappingEntries = Object.entries(mappingConfig);

  if (mappingEntries.length === 0) {
    throw new Error("No response column mapping found.");
  }

  const responseColumns: string[] = Array.isArray(upload.response_columns)
    ? (upload.response_columns as string[])
    : [];

  for (const [responseColumn] of mappingEntries) {
    if (!responseColumns.includes(responseColumn)) {
      throw new Error(
        `Mapped response column ${responseColumn} was not found in the upload.`,
      );
    }
  }

  const { data: questions, error: questionsError } = await supabase
    .from("questions")
    .select("id")
    .eq("exam_id", examId);

  if (questionsError) {
    throw new Error(questionsError.message);
  }

  const validQuestionIds = new Set(questions.map((question) => question.id));

  for (const [, questionId] of mappingEntries) {
    if (!validQuestionIds.has(questionId)) {
      throw new Error(
        "Mapping contains a question that does not belong to this exam.",
      );
    }
  }

  const { count: existingImportedStudentsCount, error: existingCountError } =
    await supabase
      .from("exam_students")
      .select("id", { count: "exact", head: true })
      .eq("upload_id", uploadId);

  if (existingCountError) {
    throw new Error(existingCountError.message);
  }

  if (existingImportedStudentsCount && existingImportedStudentsCount > 0) {
    throw new Error(
      "This upload already has imported students. Re-import is not allowed yet.",
    );
  }

  const { data: uploadRows, error: uploadRowsError } = await supabase
    .from("answer_upload_rows")
    .select(
      "id, exam_id, upload_id, source_row_index, first_name, last_name, id_number, email, raw_row, parsed_answers",
    )
    .eq("upload_id", uploadId)
    .eq("exam_id", examId)
    .order("source_row_index", { ascending: true });

  if (uploadRowsError) {
    throw new Error(uploadRowsError.message);
  }

  const stagingRows = (uploadRows || []) as UploadRowForImport[];

  if (stagingRows.length === 0) {
    throw new Error(
      "No staged rows found for this upload. Please re-upload the JSON file.",
    );
  }

  const rowWithMissingEmail = stagingRows.find(
    (row) => !row.email || !row.email.trim(),
  );

  if (rowWithMissingEmail) {
    throw new Error(
      `Row ${
        rowWithMissingEmail.source_row_index + 1
      } has missing email. Cannot import.`,
    );
  }

  const examStudentsToInsert = stagingRows.map((row) => ({
    exam_id: examId,
    upload_id: uploadId,
    first_name: row.first_name,
    last_name: row.last_name,
    id_number: row.id_number,
    email: row.email!.trim().toLowerCase(),
    source_row_index: row.source_row_index,
    raw_row: row.raw_row || {},
  }));

  const { data: createdExamStudents, error: examStudentsInsertError } =
    await supabase
      .from("exam_students")
      .insert(examStudentsToInsert)
      .select("id, source_row_index");

  if (examStudentsInsertError || !createdExamStudents) {
    throw new Error(
      examStudentsInsertError?.message || "Failed to import students.",
    );
  }

  const examStudentIdByRowIndex = new Map<number, string>();

  for (const student of createdExamStudents) {
    examStudentIdByRowIndex.set(student.source_row_index, student.id);
  }

  const studentAnswersToInsert: {
    exam_id: string;
    exam_student_id: string;
    question_id: string;
    response_column: string;
    answer_text: string;
    raw_answer: unknown;
    word_count: number;
    character_count: number;
  }[] = [];

  for (const row of stagingRows) {
    const examStudentId = examStudentIdByRowIndex.get(row.source_row_index);

    if (!examStudentId) {
      throw new Error(
        `Could not find imported student for row ${row.source_row_index + 1}.`,
      );
    }

    const parsedAnswers = readParsedAnswers(row.parsed_answers);

    for (const [responseColumn, questionId] of mappingEntries) {
      const parsedAnswer = parsedAnswers.find(
        (answer) => answer.responseColumn === responseColumn,
      );

      const answerText = parsedAnswer?.answerText || "";

      studentAnswersToInsert.push({
        exam_id: examId,
        exam_student_id: examStudentId,
        question_id: questionId,
        response_column: responseColumn,
        answer_text: answerText,
        raw_answer: parsedAnswer?.rawAnswer ?? null,
        word_count: parsedAnswer?.wordCount ?? countWords(answerText),
        character_count: parsedAnswer?.characterCount ?? answerText.length,
      });
    }
  }

  if (studentAnswersToInsert.length === 0) {
    throw new Error("No student answers were created from the mapping.");
  }

  const answerChunks = chunkArray(studentAnswersToInsert, 500);

  for (const chunk of answerChunks) {
    const { error: answersInsertError } = await supabase
      .from("student_answers")
      .insert(chunk);

    if (answersInsertError) {
      throw new Error(answersInsertError.message);
    }
  }

  const { error: updateUploadError } = await supabase
    .from("answer_uploads")
    .update({
      status: "imported",
      error_message: null,
    })
    .eq("id", uploadId)
    .eq("exam_id", examId);

  if (updateUploadError) {
    throw new Error(updateUploadError.message);
  }

  revalidatePath(ROUTES.PROFESSOR.EXAM_DETAIL(examId));
  revalidatePath(ROUTES.PROFESSOR.MAP_ANSWER_UPLOAD(examId, uploadId));

  redirect(ROUTES.PROFESSOR.EXAM_DETAIL(examId));
}

type MappingConfig = Record<string, string>;

type ParsedAnswerFromStaging = {
  responseColumn: string;
  answerText: string;
  rawAnswer: unknown;
  wordCount: number;
  characterCount: number;
};

type UploadRowForImport = {
  id: string;
  exam_id: string;
  upload_id: string;
  source_row_index: number;
  first_name: string | null;
  last_name: string | null;
  id_number: string | null;
  email: string | null;
  raw_row: unknown;
  parsed_answers: unknown;
};

function readMappingConfig(value: unknown): MappingConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const mappingConfig: MappingConfig = {};

  for (const [key, mappedValue] of Object.entries(value)) {
    if (typeof mappedValue === "string" && mappedValue.trim()) {
      mappingConfig[key] = mappedValue;
    }
  }

  return mappingConfig;
}

function readParsedAnswers(value: unknown): ParsedAnswerFromStaging[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const parsedAnswers: ParsedAnswerFromStaging[] = [];

  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }

    const record = item as Record<string, unknown>;

    const responseColumn =
      typeof record.responseColumn === "string" ? record.responseColumn : "";

    if (!responseColumn) {
      continue;
    }

    const answerText =
      typeof record.answerText === "string" ? record.answerText : "";

    const wordCount =
      typeof record.wordCount === "number"
        ? record.wordCount
        : countWords(answerText);

    const characterCount =
      typeof record.characterCount === "number"
        ? record.characterCount
        : answerText.length;

    parsedAnswers.push({
      responseColumn,
      answerText,
      rawAnswer: record.rawAnswer ?? null,
      wordCount,
      characterCount,
    });
  }

  return parsedAnswers;
}

function countWords(text: string) {
  if (!text.trim()) {
    return 0;
  }

  return text.trim().split(/\s+/).length;
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}


// --------------------------------------------

type StudentAnswerForEvaluationSeed = {
  id: string
  question_id: string
}

type QuestionForEvaluationSeed = {
  id: string
  question_no: string
  max_marks: number | string
  model_answer: string | null
  model_answer_status: string
}

type RubricForEvaluationSeed = {
  id: string
  question_id: string
  criterion_name: string
  criterion_description: string | null
  max_marks: number | string
}

export async function createEvaluationJobAndSeedPending(formData: FormData) {
  const examId = String(formData.get("examId") || "")

  if (!examId) {
    throw new Error("Exam ID is required.")
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
    throw new Error("You are not allowed to create evaluations for this exam.")
  }

  if (exam.status === "published" || exam.status === "archived") {
    throw new Error("Cannot create evaluations for published or archived exams.")
  }

  const { data: questions, error: questionsError } = await supabase
    .from("questions")
    .select("id, question_no, max_marks, model_answer, model_answer_status")
    .eq("exam_id", examId)
    .order("question_order", { ascending: true })

  if (questionsError) {
    throw new Error(questionsError.message)
  }

  const typedQuestions = (questions || []) as QuestionForEvaluationSeed[]

  if (typedQuestions.length === 0) {
    throw new Error("Please add questions before creating evaluations.")
  }

  const questionIds = typedQuestions.map((question) => question.id)

  const { data: rubrics, error: rubricsError } =
    questionIds.length > 0
      ? await supabase
          .from("rubrics")
          .select(
            "id, question_id, criterion_name, criterion_description, max_marks"
          )
          .in("question_id", questionIds)
      : { data: [], error: null }

  if (rubricsError) {
    throw new Error(rubricsError.message)
  }

  const typedRubrics = (rubrics || []) as RubricForEvaluationSeed[]

  const readiness = checkExamRubricReadiness(typedQuestions, typedRubrics)

  if (!readiness.isReady) {
    throw new Error(
      "Exam is not evaluation-ready. Please complete model answers and rubrics first."
    )
  }

  const { data: studentAnswers, error: studentAnswersError } = await supabase
    .from("student_answers")
    .select("id, question_id")
    .eq("exam_id", examId)

  if (studentAnswersError) {
    throw new Error(studentAnswersError.message)
  }

  const typedStudentAnswers =
    (studentAnswers || []) as StudentAnswerForEvaluationSeed[]

  if (typedStudentAnswers.length === 0) {
    throw new Error(
      "No imported student answers found. Please import mapped answers first."
    )
  }

  const { data: existingEvaluations, error: existingEvaluationsError } =
    await supabase
      .from("evaluations")
      .select("student_answer_id")
      .eq("exam_id", examId)

  if (existingEvaluationsError) {
    throw new Error(existingEvaluationsError.message)
  }

  const existingStudentAnswerIds = new Set(
    (existingEvaluations || []).map(
      (evaluation) => evaluation.student_answer_id
    )
  )

  const studentAnswersToSeed = typedStudentAnswers.filter(
    (studentAnswer) => !existingStudentAnswerIds.has(studentAnswer.id)
  )

  if (studentAnswersToSeed.length === 0) {
    throw new Error(
      "All imported student answers already have evaluation records."
    )
  }

  const questionMaxMarksById = new Map<string, number | string>()

  for (const question of typedQuestions) {
    questionMaxMarksById.set(question.id, question.max_marks)
  }

  const rubricsByQuestionId = new Map<string, RubricForEvaluationSeed[]>()

  for (const question of typedQuestions) {
    rubricsByQuestionId.set(question.id, [])
  }

  for (const rubric of typedRubrics) {
    const existing = rubricsByQuestionId.get(rubric.question_id) || []
    rubricsByQuestionId.set(rubric.question_id, [...existing, rubric])
  }

  const { data: evaluationJob, error: evaluationJobError } = await supabase
    .from("evaluation_jobs")
    .insert({
      exam_id: examId,
      created_by: user.id,
      status: "queued",
      total_items: studentAnswersToSeed.length,
      completed_items: 0,
      failed_items: 0,
      job_metadata: {
        source: "manual_seed_pending_evaluations",
        note: "Pending evaluation records created before AI execution.",
      },
    })
    .select("id")
    .single()

  if (evaluationJobError || !evaluationJob) {
    throw new Error(
      evaluationJobError?.message || "Failed to create evaluation job."
    )
  }

  const evaluationsToInsert = studentAnswersToSeed.map((studentAnswer) => {
    const maxMarks = questionMaxMarksById.get(studentAnswer.question_id)

    if (maxMarks === undefined) {
      throw new Error("Student answer is linked to an unknown question.")
    }

    return {
      exam_id: examId,
      student_answer_id: studentAnswer.id,
      ai_job_id: evaluationJob.id,
      max_marks: maxMarks,
      status: "pending",
    }
  })

  const createdEvaluations: {
    id: string
    student_answer_id: string
  }[] = []

  const evaluationChunks = chunkArray(evaluationsToInsert, 500)

  for (const chunk of evaluationChunks) {
    const { data: insertedEvaluations, error: evaluationsInsertError } =
      await supabase
        .from("evaluations")
        .insert(chunk)
        .select("id, student_answer_id")

    if (evaluationsInsertError || !insertedEvaluations) {
      throw new Error(
        evaluationsInsertError?.message || "Failed to create evaluations."
      )
    }

    createdEvaluations.push(...insertedEvaluations)
  }

  const studentAnswerById = new Map<string, StudentAnswerForEvaluationSeed>()

  for (const studentAnswer of studentAnswersToSeed) {
    studentAnswerById.set(studentAnswer.id, studentAnswer)
  }

  const breakdownsToInsert = []

  for (const evaluation of createdEvaluations) {
    const studentAnswer = studentAnswerById.get(evaluation.student_answer_id)

    if (!studentAnswer) {
      throw new Error("Could not link evaluation to student answer.")
    }

    const questionRubrics =
      rubricsByQuestionId.get(studentAnswer.question_id) || []

    for (const rubric of questionRubrics) {
      breakdownsToInsert.push({
        evaluation_id: evaluation.id,
        rubric_id: rubric.id,
        criterion_name: rubric.criterion_name,
        criterion_description: rubric.criterion_description,
        max_marks: rubric.max_marks,
      })
    }
  }

  const breakdownChunks = chunkArray(breakdownsToInsert, 500)

  for (const chunk of breakdownChunks) {
    const { error: breakdownsInsertError } = await supabase
      .from("evaluation_rubric_breakdowns")
      .insert(chunk)

    if (breakdownsInsertError) {
      throw new Error(breakdownsInsertError.message)
    }
  }

  revalidatePath(ROUTES.PROFESSOR.EXAM_DETAIL(examId))

  redirect(ROUTES.PROFESSOR.EXAM_DETAIL(examId))
}