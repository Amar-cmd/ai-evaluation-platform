"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth";
import { ROUTES } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";

import {
  isShortOrObjectiveLookingAnswer,
  validateMappingOutput,
  type MappingCandidateQuestion,
} from "@/features/answer-cells/mapping";

type AnswerUploadForCells = {
  id: string;
  exam_id: string;
  status: string;
  response_columns: string[] | null;
};

type AnswerUploadRowForCells = {
  id: string;
  source_row_index: number;
  raw_row: Record<string, unknown> | null;
};

type ExistingImportedCell = {
  source_row_index: number;
  response_column: string;
};

type AnswerCellInsert = {
  exam_id: string;
  upload_id: string;
  upload_row_id: string;
  source_row_index: number;
  response_column: string;
  answer_text: string;
  raw_answer: unknown;
  word_count: number;
  character_count: number;
  mapping_status: "unmapped";
};

type AnswerCellForSuggestion = {
  id: string;
  response_column: string;
  answer_text: string;
  word_count: number;
  character_count: number;
  mapping_status: string;
};

type QuestionForSuggestion = {
  id: string;
  question_no: string;
  question_text: string;
  question_type: string;
  max_marks: number | string;
  model_answer: string | null;
  is_ai_evaluable?: boolean | null;
};

type MappingSuggestionResult = {
  cellId: string;
  suggestedQuestionId: string | null;
  mappingStatus: "suggested" | "conflict" | "failed";
  mappingSource: "heuristic";
  mappingConfidence: "high" | "medium" | "low" | "unknown";
  mappingConfidenceScore: number | null;
  mappingReason: string;
};

export async function generateAnswerCellsForUpload(formData: FormData) {
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
    throw new Error("You are not allowed to generate cells for this exam.");
  }

  if (exam.status === "published" || exam.status === "archived") {
    throw new Error("Cannot generate answer cells for published or archived exams.");
  }

  const { data: upload, error: uploadError } = await supabase
    .from("answer_uploads")
    .select("id, exam_id, status, response_columns")
    .eq("id", uploadId)
    .eq("exam_id", examId)
    .single();

  if (uploadError || !upload) {
    throw new Error("Answer upload not found.");
  }

  const typedUpload = upload as AnswerUploadForCells;

  const { data: uploadRows, error: uploadRowsError } = await supabase
    .from("answer_upload_rows")
    .select("id, source_row_index, raw_row")
    .eq("upload_id", uploadId)
    .order("source_row_index", { ascending: true });

  if (uploadRowsError) {
    throw new Error(uploadRowsError.message);
  }

  const typedUploadRows = (uploadRows || []) as AnswerUploadRowForCells[];

  if (typedUploadRows.length === 0) {
    throw new Error("No staged upload rows found for this upload.");
  }

  const responseColumns = getResponseColumns(
    typedUpload.response_columns,
    typedUploadRows,
  );

  if (responseColumns.length === 0) {
    throw new Error("No response columns found in this upload.");
  }

  const { data: existingImportedCells, error: existingImportedCellsError } =
    await supabase
      .from("student_answer_cells")
      .select("source_row_index, response_column")
      .eq("upload_id", uploadId)
      .eq("mapping_status", "imported");

  if (existingImportedCellsError) {
    throw new Error(existingImportedCellsError.message);
  }

  const importedCellKeys = new Set(
    ((existingImportedCells || []) as ExistingImportedCell[]).map((cell) =>
      makeCellKey(cell.source_row_index, cell.response_column),
    ),
  );

  const { error: deleteExistingCellsError } = await supabase
    .from("student_answer_cells")
    .delete()
    .eq("upload_id", uploadId)
    .neq("mapping_status", "imported");

  if (deleteExistingCellsError) {
    throw new Error(deleteExistingCellsError.message);
  }

  const cellsToInsert: AnswerCellInsert[] = [];

  for (const row of typedUploadRows) {
    const rawRow = row.raw_row || {};

    for (const responseColumn of responseColumns) {
      const rawAnswer = rawRow[responseColumn];
      const answerText = normalizeAnswerText(rawAnswer);

      if (!answerText) {
        continue;
      }

      const cellKey = makeCellKey(row.source_row_index, responseColumn);

      if (importedCellKeys.has(cellKey)) {
        continue;
      }

      cellsToInsert.push({
        exam_id: examId,
        upload_id: uploadId,
        upload_row_id: row.id,
        source_row_index: row.source_row_index,
        response_column: responseColumn,
        answer_text: answerText,
        raw_answer: rawAnswer ?? null,
        word_count: countWords(answerText),
        character_count: answerText.length,
        mapping_status: "unmapped",
      });
    }
  }

  if (cellsToInsert.length === 0) {
    throw new Error(
      "No non-empty answer cells found. Existing imported cells were preserved.",
    );
  }

  for (const batch of chunkArray(cellsToInsert, 500)) {
    const { error: insertCellsError } = await supabase
      .from("student_answer_cells")
      .insert(batch);

    if (insertCellsError) {
      throw new Error(insertCellsError.message);
    }
  }

  revalidatePath(ROUTES.PROFESSOR.EXAM_DETAIL(examId));

  redirect(ROUTES.PROFESSOR.EXAM_DETAIL(examId));
}

function getResponseColumns(
  uploadedResponseColumns: string[] | null,
  rows: AnswerUploadRowForCells[],
) {
  if (Array.isArray(uploadedResponseColumns) && uploadedResponseColumns.length > 0) {
    return uploadedResponseColumns
      .map((column) => column.trim())
      .filter(Boolean)
      .sort(sortResponseColumns);
  }

  const detectedColumns = new Set<string>();

  for (const row of rows.slice(0, 20)) {
    const rawRow = row.raw_row || {};

    for (const key of Object.keys(rawRow)) {
      if (/^response\d+$/i.test(key)) {
        detectedColumns.add(key);
      }
    }
  }

  return [...detectedColumns].sort(sortResponseColumns);
}

function normalizeAnswerText(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "string") {
    return cleanAnswerText(value);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return cleanAnswerText(String(value));
  }

  return cleanAnswerText(JSON.stringify(value));
}

function cleanAnswerText(value: string) {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function countWords(value: string) {
  if (!value.trim()) {
    return 0;
  }

  return value.trim().split(/\s+/).length;
}

function makeCellKey(sourceRowIndex: number, responseColumn: string) {
  return `${sourceRowIndex}::${responseColumn}`;
}

function sortResponseColumns(a: string, b: string) {
  const aMatch = a.match(/^response(\d+)$/i);
  const bMatch = b.match(/^response(\d+)$/i);

  if (aMatch && bMatch) {
    return Number(aMatch[1]) - Number(bMatch[1]);
  }

  return a.localeCompare(b);
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

export async function generateMappingSuggestionsForUpload(formData: FormData) {
  const examId = String(formData.get("examId") || "");
  const uploadId = String(formData.get("uploadId") || "");
  const retryExistingSuggestions =
    formData.get("retryExistingSuggestions") === "on";

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
    .select("id, professor_id, status, title, subject")
    .eq("id", examId)
    .single();

  if (examError || !exam) {
    throw new Error("Exam not found or you do not have access to it.");
  }

  if (exam.professor_id !== user.id) {
    throw new Error("You are not allowed to map answer cells for this exam.");
  }

  if (exam.status === "published" || exam.status === "archived") {
    throw new Error(
      "Cannot generate mapping suggestions for published or archived exams.",
    );
  }

  const { data: upload, error: uploadError } = await supabase
    .from("answer_uploads")
    .select("id, exam_id")
    .eq("id", uploadId)
    .eq("exam_id", examId)
    .single();

  if (uploadError || !upload) {
    throw new Error("Answer upload not found.");
  }

  const { data: questions, error: questionsError } = await supabase
    .from("questions")
    .select(
      "id, question_no, question_text, question_type, max_marks, model_answer, is_ai_evaluable",
    )
    .eq("exam_id", examId)
    .order("question_order", { ascending: true });

  if (questionsError) {
    throw new Error(questionsError.message);
  }

  const candidateQuestions = ((questions || []) as QuestionForSuggestion[])
    .filter((question) => question.is_ai_evaluable !== false)
    .map(toMappingCandidateQuestion);

  if (candidateQuestions.length === 0) {
    throw new Error("No AI-evaluable candidate questions found for this exam.");
  }

  const statusesToMap = retryExistingSuggestions
    ? ["unmapped", "suggested", "conflict", "failed"]
    : ["unmapped", "conflict", "failed"];

  const { data: cells, error: cellsError } = await supabase
    .from("student_answer_cells")
    .select(
      "id, response_column, answer_text, word_count, character_count, mapping_status",
    )
    .eq("exam_id", examId)
    .eq("upload_id", uploadId)
    .in("mapping_status", statusesToMap)
    .order("source_row_index", { ascending: true })
    .order("response_column", { ascending: true })
    .limit(1000);

  if (cellsError) {
    throw new Error(cellsError.message);
  }

  const answerCells = (cells || []) as AnswerCellForSuggestion[];

  if (answerCells.length === 0) {
    throw new Error(
      retryExistingSuggestions
        ? "No answer cells available for mapping suggestions."
        : "No unmapped answer cells found. Enable retry existing suggestions if you want to regenerate suggestions.",
    );
  }

  const results: MappingSuggestionResult[] = [];

  for (const cell of answerCells) {
    results.push(generateHeuristicMappingSuggestion(cell, candidateQuestions));
  }

  for (const result of results) {
    const { error: updateError } = await supabase
      .from("student_answer_cells")
      .update({
        suggested_question_id: result.suggestedQuestionId,
        mapping_status: result.mappingStatus,
        mapping_source: result.mappingSource,
        mapping_confidence: result.mappingConfidence,
        mapping_confidence_score: result.mappingConfidenceScore,
        mapping_reason: result.mappingReason,
        final_question_id: null,
        confirmed_by: null,
        confirmed_at: null,
      })
      .eq("id", result.cellId)
      .eq("exam_id", examId)
      .eq("upload_id", uploadId);

    if (updateError) {
      throw new Error(updateError.message);
    }
  }

  revalidatePath(ROUTES.PROFESSOR.EXAM_DETAIL(examId));

  redirect(ROUTES.PROFESSOR.EXAM_DETAIL(examId));
}

type AnswerCellForBulkAccept = {
  id: string;
  suggested_question_id: string | null;
};

export async function acceptHighConfidenceMappingsForUpload(
  formData: FormData,
) {
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

  await verifyProfessorOwnsExamUpload(supabase, user.id, examId, uploadId);

  const { data: cells, error: cellsError } = await supabase
    .from("student_answer_cells")
    .select("id, suggested_question_id")
    .eq("exam_id", examId)
    .eq("upload_id", uploadId)
    .eq("mapping_status", "suggested")
    .eq("mapping_confidence", "high")
    .not("suggested_question_id", "is", null);

  if (cellsError) {
    throw new Error(cellsError.message);
  }

  const highConfidenceCells = (cells || []) as AnswerCellForBulkAccept[];

  if (highConfidenceCells.length === 0) {
    throw new Error("No high-confidence mapping suggestions found.");
  }

  const confirmedAt = new Date().toISOString();

  for (const cell of highConfidenceCells) {
    if (!cell.suggested_question_id) {
      continue;
    }

    const { error: updateError } = await supabase
      .from("student_answer_cells")
      .update({
        final_question_id: cell.suggested_question_id,
        mapping_status: "confirmed",
        confirmed_by: user.id,
        confirmed_at: confirmedAt,
      })
      .eq("id", cell.id)
      .eq("exam_id", examId)
      .eq("upload_id", uploadId);

    if (updateError) {
      throw new Error(updateError.message);
    }
  }

  revalidatePath(ROUTES.PROFESSOR.EXAM_DETAIL(examId));
  revalidatePath(ROUTES.PROFESSOR.MAPPING_REVIEW_UPLOAD(examId, uploadId));

  redirect(ROUTES.PROFESSOR.MAPPING_REVIEW_UPLOAD(examId, uploadId));
}

export async function confirmAnswerCellMapping(formData: FormData) {
  const examId = String(formData.get("examId") || "");
  const uploadId = String(formData.get("uploadId") || "");
  const cellId = String(formData.get("cellId") || "");
  const questionId = String(formData.get("questionId") || "");
  const confirmationMode = String(
    formData.get("confirmationMode") || "manual",
  );

  if (!examId) {
    throw new Error("Exam ID is required.");
  }

  if (!uploadId) {
    throw new Error("Upload ID is required.");
  }

  if (!cellId) {
    throw new Error("Answer cell ID is required.");
  }

  if (!questionId) {
    throw new Error("Please select a question before confirming.");
  }

  const { user } = await requireRole(["professor"]);
  const supabase = await createClient();

  await verifyProfessorOwnsExamUpload(supabase, user.id, examId, uploadId);
  await verifyQuestionBelongsToExam(supabase, examId, questionId);

  const { data: cell, error: cellError } = await supabase
    .from("student_answer_cells")
    .select("id, mapping_status")
    .eq("id", cellId)
    .eq("exam_id", examId)
    .eq("upload_id", uploadId)
    .single();

  if (cellError || !cell) {
    throw new Error("Answer cell not found.");
  }

  if (cell.mapping_status === "imported") {
    throw new Error("This answer cell is already imported.");
  }

  const confirmedAt = new Date().toISOString();

  const { error: updateError } = await supabase
    .from("student_answer_cells")
    .update({
      final_question_id: questionId,
      mapping_status: "confirmed",
      mapping_source: confirmationMode === "suggestion" ? "heuristic" : "professor",
      mapping_confidence:
        confirmationMode === "suggestion" ? undefined : "high",
      mapping_confidence_score:
        confirmationMode === "suggestion" ? undefined : 1,
      mapping_reason:
        confirmationMode === "suggestion"
          ? undefined
          : "Professor manually confirmed this answer cell mapping.",
      ignore_reason: null,
      confirmed_by: user.id,
      confirmed_at: confirmedAt,
    })
    .eq("id", cellId)
    .eq("exam_id", examId)
    .eq("upload_id", uploadId);

  if (updateError) {
    throw new Error(updateError.message);
  }

  revalidatePath(ROUTES.PROFESSOR.EXAM_DETAIL(examId));
  revalidatePath(ROUTES.PROFESSOR.MAPPING_REVIEW_UPLOAD(examId, uploadId));

  redirect(ROUTES.PROFESSOR.MAPPING_REVIEW_UPLOAD(examId, uploadId));
}

export async function ignoreAnswerCellMapping(formData: FormData) {
  const examId = String(formData.get("examId") || "");
  const uploadId = String(formData.get("uploadId") || "");
  const cellId = String(formData.get("cellId") || "");
  const ignoreReason =
    String(formData.get("ignoreReason") || "").trim() ||
    "Professor marked this answer cell as not required for subjective evaluation.";

  if (!examId) {
    throw new Error("Exam ID is required.");
  }

  if (!uploadId) {
    throw new Error("Upload ID is required.");
  }

  if (!cellId) {
    throw new Error("Answer cell ID is required.");
  }

  const { user } = await requireRole(["professor"]);
  const supabase = await createClient();

  await verifyProfessorOwnsExamUpload(supabase, user.id, examId, uploadId);

  const { data: cell, error: cellError } = await supabase
    .from("student_answer_cells")
    .select("id, mapping_status")
    .eq("id", cellId)
    .eq("exam_id", examId)
    .eq("upload_id", uploadId)
    .single();

  if (cellError || !cell) {
    throw new Error("Answer cell not found.");
  }

  if (cell.mapping_status === "imported") {
    throw new Error("This answer cell is already imported.");
  }

  const { error: updateError } = await supabase
    .from("student_answer_cells")
    .update({
      final_question_id: null,
      mapping_status: "ignored",
      mapping_source: "professor",
      mapping_confidence: "unknown",
      mapping_confidence_score: null,
      ignore_reason: ignoreReason,
      confirmed_by: user.id,
      confirmed_at: new Date().toISOString(),
    })
    .eq("id", cellId)
    .eq("exam_id", examId)
    .eq("upload_id", uploadId);

  if (updateError) {
    throw new Error(updateError.message);
  }

  revalidatePath(ROUTES.PROFESSOR.EXAM_DETAIL(examId));
  revalidatePath(ROUTES.PROFESSOR.MAPPING_REVIEW_UPLOAD(examId, uploadId));

  redirect(ROUTES.PROFESSOR.MAPPING_REVIEW_UPLOAD(examId, uploadId));
}


type ConfirmedAnswerCellForImport = {
  id: string;
  upload_row_id: string | null;
  source_row_index: number;
  response_column: string;
  answer_text: string;
  raw_answer: unknown;
  word_count: number;
  character_count: number;
  final_question_id: string;
};

type UploadRowForImport = {
  id: string;
  source_row_index: number;
  raw_row: Record<string, unknown> | null;
};

type ExamStudentForImport = {
  id: string;
  source_row_index: number;
};

type ExistingStudentAnswerForImport = {
  id: string;
  exam_student_id: string;
  question_id: string;
};

export async function materializeConfirmedAnswerCellsForUpload(
  formData: FormData,
) {
  const examId = String(formData.get("examId") || "");
  const uploadId = String(formData.get("uploadId") || "");
  const replaceExisting = formData.get("replaceExisting") === "on";

  if (!examId) {
    throw new Error("Exam ID is required.");
  }

  if (!uploadId) {
    throw new Error("Upload ID is required.");
  }

  const { user } = await requireRole(["professor"]);
  const supabase = await createClient();

  await verifyProfessorOwnsExamUpload(supabase, user.id, examId, uploadId);

  const { data: confirmedCells, error: confirmedCellsError } = await supabase
    .from("student_answer_cells")
    .select(
      `
      id,
      upload_row_id,
      source_row_index,
      response_column,
      answer_text,
      raw_answer,
      word_count,
      character_count,
      final_question_id
    `,
    )
    .eq("exam_id", examId)
    .eq("upload_id", uploadId)
    .eq("mapping_status", "confirmed")
    .not("final_question_id", "is", null)
    .order("source_row_index", { ascending: true })
    .order("response_column", { ascending: true });

  if (confirmedCellsError) {
    throw new Error(confirmedCellsError.message);
  }

  const cells = (confirmedCells || []) as ConfirmedAnswerCellForImport[];

  if (cells.length === 0) {
    throw new Error("No confirmed answer cells found for import.");
  }

  const { data: uploadRows, error: uploadRowsError } = await supabase
    .from("answer_upload_rows")
    .select("id, source_row_index, raw_row")
    .eq("upload_id", uploadId)
    .order("source_row_index", { ascending: true });

  if (uploadRowsError) {
    throw new Error(uploadRowsError.message);
  }

  const typedUploadRows = (uploadRows || []) as UploadRowForImport[];

  const uploadRowBySourceIndex = new Map(
    typedUploadRows.map((row) => [row.source_row_index, row]),
  );

  const { data: existingStudents, error: existingStudentsError } =
    await supabase
      .from("exam_students")
      .select("id, source_row_index")
      .eq("exam_id", examId)
      .eq("upload_id", uploadId);

  if (existingStudentsError) {
    throw new Error(existingStudentsError.message);
  }

  const studentsBySourceIndex = new Map<number, string>();

  for (const student of (existingStudents || []) as ExamStudentForImport[]) {
    studentsBySourceIndex.set(student.source_row_index, student.id);
  }

  const neededSourceIndexes = [...new Set(cells.map((cell) => cell.source_row_index))];

  for (const sourceRowIndex of neededSourceIndexes) {
    if (studentsBySourceIndex.has(sourceRowIndex)) {
      continue;
    }

    const uploadRow = uploadRowBySourceIndex.get(sourceRowIndex);

    if (!uploadRow) {
      throw new Error(`Upload row not found for source row ${sourceRowIndex}.`);
    }

    const rawRow = uploadRow.raw_row || {};
    const email = readFirstString(rawRow, [
      "email",
      "emailaddress",
      "email_address",
      "Email",
      "Email address",
    ]);

    if (!email) {
      throw new Error(
        `Student email is missing in source row ${sourceRowIndex}. Cannot create exam student.`,
      );
    }

    const profileId = await findProfileIdByEmail(supabase, email);

    const { data: createdStudent, error: createStudentError } = await supabase
      .from("exam_students")
      .insert({
        exam_id: examId,
        upload_id: uploadId,
        profile_id: profileId,
        first_name:
          readFirstString(rawRow, ["firstname", "first_name", "First name"]) ||
          null,
        last_name:
          readFirstString(rawRow, ["lastname", "last_name", "Last name"]) ||
          null,
        id_number:
          readFirstString(rawRow, [
            "idnumber",
            "id_number",
            "ID number",
            "student_id",
            "roll_no",
          ]) || null,
        email,
        source_row_index: sourceRowIndex,
        raw_row: rawRow,
      })
      .select("id")
      .single();

    if (createStudentError || !createdStudent) {
      throw new Error(
        createStudentError?.message ||
          `Failed to create exam student for source row ${sourceRowIndex}.`,
      );
    }

    studentsBySourceIndex.set(sourceRowIndex, createdStudent.id);
  }

  const targetStudentIds = [...new Set([...studentsBySourceIndex.values()])];

  const { data: existingAnswers, error: existingAnswersError } =
    targetStudentIds.length > 0
      ? await supabase
          .from("student_answers")
          .select("id, exam_student_id, question_id")
          .eq("exam_id", examId)
          .in("exam_student_id", targetStudentIds)
      : { data: [], error: null };

  if (existingAnswersError) {
    throw new Error(existingAnswersError.message);
  }

  const existingAnswerByStudentQuestion = new Map<string, string>();

  for (const answer of (existingAnswers || []) as ExistingStudentAnswerForImport[]) {
    existingAnswerByStudentQuestion.set(
      makeStudentQuestionKey(answer.exam_student_id, answer.question_id),
      answer.id,
    );
  }

  const importedAt = new Date().toISOString();
  let importedCount = 0;
  let replacedCount = 0;
  let skippedCount = 0;

  for (const cell of cells) {
    const examStudentId = studentsBySourceIndex.get(cell.source_row_index);

    if (!examStudentId) {
      throw new Error(
        `Exam student could not be resolved for source row ${cell.source_row_index}.`,
      );
    }

    const studentQuestionKey = makeStudentQuestionKey(
      examStudentId,
      cell.final_question_id,
    );

    const existingAnswerId = existingAnswerByStudentQuestion.get(studentQuestionKey);

    if (existingAnswerId && !replaceExisting) {
      skippedCount += 1;
      continue;
    }

    let studentAnswerId = existingAnswerId || null;

    if (existingAnswerId && replaceExisting) {
      const { error: updateAnswerError } = await supabase
        .from("student_answers")
        .update({
          question_id: cell.final_question_id,
          response_column: cell.response_column,
          answer_text: cell.answer_text,
          raw_answer: cell.raw_answer ?? null,
          word_count: cell.word_count,
          character_count: cell.character_count,
        })
        .eq("id", existingAnswerId)
        .eq("exam_id", examId);

      if (updateAnswerError) {
        throw new Error(updateAnswerError.message);
      }

      replacedCount += 1;
      studentAnswerId = existingAnswerId;
    }

    if (!existingAnswerId) {
      const { data: createdAnswer, error: createAnswerError } = await supabase
        .from("student_answers")
        .insert({
          exam_id: examId,
          exam_student_id: examStudentId,
          question_id: cell.final_question_id,
          response_column: cell.response_column,
          answer_text: cell.answer_text,
          raw_answer: cell.raw_answer ?? null,
          word_count: cell.word_count,
          character_count: cell.character_count,
        })
        .select("id")
        .single();

      if (createAnswerError || !createdAnswer) {
        throw new Error(
          createAnswerError?.message ||
            `Failed to create student answer for source row ${cell.source_row_index}.`,
        );
      }

      importedCount += 1;
      studentAnswerId = createdAnswer.id;
      existingAnswerByStudentQuestion.set(studentQuestionKey, createdAnswer.id);
    }

    if (studentAnswerId) {
      const { error: updateCellError } = await supabase
        .from("student_answer_cells")
        .update({
          exam_student_id: examStudentId,
          mapping_status: "imported",
          imported_student_answer_id: studentAnswerId,
          confirmed_at: importedAt,
        })
        .eq("id", cell.id)
        .eq("exam_id", examId)
        .eq("upload_id", uploadId);

      if (updateCellError) {
        throw new Error(updateCellError.message);
      }
    }
  }

  if (importedCount === 0 && replacedCount === 0 && skippedCount > 0) {
    throw new Error(
      `No new answers were imported. ${skippedCount} confirmed cells already had student answers. Enable replace existing answers if you want to update them.`,
    );
  }

  revalidatePath(ROUTES.PROFESSOR.EXAM_DETAIL(examId));
  revalidatePath(ROUTES.PROFESSOR.MAPPING_REVIEW_UPLOAD(examId, uploadId));

  redirect(ROUTES.PROFESSOR.MAPPING_REVIEW_UPLOAD(examId, uploadId));
}

// ===============
// FUNCTIONS
// ===============
function generateHeuristicMappingSuggestion(
  cell: AnswerCellForSuggestion,
  candidateQuestions: MappingCandidateQuestion[],
): MappingSuggestionResult {
  try {
    const answerCellForValidation = {
      id: cell.id,
      responseColumn: cell.response_column,
      answerText: cell.answer_text,
      wordCount: cell.word_count,
      characterCount: cell.character_count,
    };

    if (isShortOrObjectiveLookingAnswer(answerCellForValidation)) {
      const validatedOutput = validateMappingOutput(
        {
          suggested_question_id: null,
          confidence: "low",
          reason:
            "This answer is very short or objective-looking, so heuristic mapping did not assign it to a subjective question. It should be reviewed or ignored later.",
          should_ignore: false,
        },
        candidateQuestions.map((question) => question.id),
      );

      return {
        cellId: cell.id,
        suggestedQuestionId: validatedOutput.suggestedQuestionId,
        mappingStatus: "conflict",
        mappingSource: "heuristic",
        mappingConfidence: validatedOutput.confidence,
        mappingConfidenceScore: 0,
        mappingReason: validatedOutput.reason,
      };
    }

    const scoredCandidates = candidateQuestions
      .map((question) => {
        return {
          question,
          score: calculateQuestionMatchScore(cell.answer_text, question),
        };
      })
      .sort((a, b) => b.score - a.score);

    const best = scoredCandidates[0];
    const secondBest = scoredCandidates[1];

    if (!best || best.score < 0.08) {
      const validatedOutput = validateMappingOutput(
        {
          suggested_question_id: null,
          confidence: "low",
          reason:
            "No candidate question had enough keyword overlap with this answer. Needs professor review.",
          should_ignore: false,
        },
        candidateQuestions.map((question) => question.id),
      );

      return {
        cellId: cell.id,
        suggestedQuestionId: validatedOutput.suggestedQuestionId,
        mappingStatus: "conflict",
        mappingSource: "heuristic",
        mappingConfidence: validatedOutput.confidence,
        mappingConfidenceScore: best?.score ?? 0,
        mappingReason: validatedOutput.reason,
      };
    }

    const margin = best.score - (secondBest?.score ?? 0);
    const confidence = getHeuristicConfidence(best.score, margin);

    const validatedOutput = validateMappingOutput(
      {
        suggested_question_id: best.question.id,
        confidence,
        reason: buildHeuristicReason(best.question, best.score, margin),
        should_ignore: false,
      },
      candidateQuestions.map((question) => question.id),
    );

    return {
      cellId: cell.id,
      suggestedQuestionId: validatedOutput.suggestedQuestionId,
      mappingStatus:
        validatedOutput.confidence === "low" ? "conflict" : "suggested",
      mappingSource: "heuristic",
      mappingConfidence: validatedOutput.confidence,
      mappingConfidenceScore: Number(best.score.toFixed(4)),
      mappingReason: validatedOutput.reason,
    };
  } catch (error) {
    return {
      cellId: cell.id,
      suggestedQuestionId: null,
      mappingStatus: "failed",
      mappingSource: "heuristic",
      mappingConfidence: "unknown",
      mappingConfidenceScore: null,
      mappingReason:
        error instanceof Error
          ? error.message
          : "Unknown mapping suggestion error.",
    };
  }
}

function toMappingCandidateQuestion(
  question: QuestionForSuggestion,
): MappingCandidateQuestion {
  return {
    id: question.id,
    questionNo: question.question_no,
    questionText: question.question_text,
    questionType: question.question_type,
    maxMarks: question.max_marks,
    modelAnswer: question.model_answer,
  };
}

function calculateQuestionMatchScore(
  answerText: string,
  question: MappingCandidateQuestion,
) {
  const answerTokens = tokenizeForMapping(answerText);

  const questionTokens = tokenizeForMapping(
    [
      question.questionNo,
      question.questionText,
      question.questionType,
      question.modelAnswer || "",
    ].join(" "),
  );

  if (answerTokens.size === 0 || questionTokens.size === 0) {
    return 0;
  }

  let overlapScore = 0;

  for (const token of questionTokens) {
    if (answerTokens.has(token)) {
      overlapScore += getTokenWeight(token);
    }
  }

  const normalizer = Math.sqrt(answerTokens.size * questionTokens.size);

  return overlapScore / normalizer;
}

function tokenizeForMapping(value: string) {
  const stopWords = new Set([
    "the",
    "and",
    "or",
    "a",
    "an",
    "to",
    "of",
    "in",
    "on",
    "for",
    "with",
    "by",
    "as",
    "is",
    "are",
    "was",
    "were",
    "be",
    "been",
    "being",
    "this",
    "that",
    "these",
    "those",
    "it",
    "its",
    "their",
    "there",
    "from",
    "at",
    "into",
    "can",
    "could",
    "should",
    "would",
    "will",
    "shall",
    "may",
    "might",
    "about",
    "case",
    "answer",
    "explain",
    "discuss",
    "write",
    "what",
    "why",
    "how",
  ]);

  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9₹]+/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3)
    .filter((token) => !stopWords.has(token));

  return new Set(normalized);
}

function getTokenWeight(token: string) {
  if (token.length >= 10) {
    return 2.5;
  }

  if (token.length >= 7) {
    return 2;
  }

  return 1;
}

function getHeuristicConfidence(score: number, margin: number) {
  if (score >= 0.24 && margin >= 0.04) {
    return "high";
  }

  if (score >= 0.14 && margin >= 0.02) {
    return "medium";
  }

  return "low";
}

function buildHeuristicReason(
  question: MappingCandidateQuestion,
  score: number,
  margin: number,
) {
  return `Heuristic keyword overlap suggests this answer best matches ${question.questionNo}. Match score: ${score.toFixed(
    4,
  )}, margin over next candidate: ${margin.toFixed(4)}.`;
}

async function verifyProfessorOwnsExamUpload(
  supabase: Awaited<ReturnType<typeof createClient>>,
  professorId: string,
  examId: string,
  uploadId: string,
) {
  const { data: exam, error: examError } = await supabase
    .from("exams")
    .select("id, professor_id, status")
    .eq("id", examId)
    .single();

  if (examError || !exam) {
    throw new Error("Exam not found or you do not have access to it.");
  }

  if (exam.professor_id !== professorId) {
    throw new Error("You are not allowed to manage mappings for this exam.");
  }

  if (exam.status === "published" || exam.status === "archived") {
    throw new Error("Cannot update mappings for published or archived exams.");
  }

  const { data: upload, error: uploadError } = await supabase
    .from("answer_uploads")
    .select("id, exam_id")
    .eq("id", uploadId)
    .eq("exam_id", examId)
    .single();

  if (uploadError || !upload) {
    throw new Error("Answer upload not found for this exam.");
  }
}

async function verifyQuestionBelongsToExam(
  supabase: Awaited<ReturnType<typeof createClient>>,
  examId: string,
  questionId: string,
) {
  const { data: question, error: questionError } = await supabase
    .from("questions")
    .select("id")
    .eq("id", questionId)
    .eq("exam_id", examId)
    .single();

  if (questionError || !question) {
    throw new Error("Selected question does not belong to this exam.");
  }
}

function readFirstString(
  rawRow: Record<string, unknown>,
  possibleKeys: string[],
) {
  for (const key of possibleKeys) {
    const value = rawRow[key];

    if (value === null || value === undefined) {
      continue;
    }

    const normalized = String(value).trim();

    if (normalized) {
      return normalized;
    }
  }

  return "";
}

async function findProfileIdByEmail(
  supabase: Awaited<ReturnType<typeof createClient>>,
  email: string,
) {
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id")
    .ilike("email", email)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return profile?.id || null;
}

function makeStudentQuestionKey(examStudentId: string, questionId: string) {
  return `${examStudentId}::${questionId}`;
}