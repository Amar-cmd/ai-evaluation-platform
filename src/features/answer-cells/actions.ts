"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth";
import { ROUTES } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";

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