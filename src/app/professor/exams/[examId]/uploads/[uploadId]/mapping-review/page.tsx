import Link from "next/link";
import { notFound } from "next/navigation";

import {
  acceptHighConfidenceMappingsForUpload,
  confirmAnswerCellMapping,
  ignoreAnswerCellMapping,
} from "@/features/answer-cells/actions";
import { requireProfessorOrAdmin } from "@/lib/auth";
import { formatMarks } from "@/lib/marks";
import { ROUTES } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";

type MappingReviewPageProps = {
  params: Promise<{
    examId: string;
    uploadId: string;
  }>;
};

type CandidateQuestion = {
  id: string;
  question_no: string;
  question_text: string;
  question_type: string;
  max_marks: number | string;
};

type AnswerCell = {
  id: string;
  source_row_index: number;
  response_column: string;
  answer_text: string;
  word_count: number;
  character_count: number;
  suggested_question_id: string | null;
  final_question_id: string | null;
  mapping_status: string;
  mapping_confidence: string | null;
  mapping_confidence_score: number | string | null;
  mapping_reason: string | null;
  ignore_reason: string | null;
  created_at: string;
};

export default async function MappingReviewPage({
  params,
}: MappingReviewPageProps) {
  const { examId, uploadId } = await params;

  const { user, profile } = await requireProfessorOrAdmin();
  const supabase = await createClient();

  const { data: exam, error: examError } = await supabase
    .from("exams")
    .select("id, title, subject, course, batch, professor_id, status")
    .eq("id", examId)
    .single();

  if (examError || !exam) {
    notFound();
  }

  if (profile.role === "professor" && exam.professor_id !== user.id) {
    notFound();
  }

  const { data: upload, error: uploadError } = await supabase
    .from("answer_uploads")
    .select("id, file_name, file_type, total_rows, status, created_at")
    .eq("id", uploadId)
    .eq("exam_id", examId)
    .single();

  if (uploadError || !upload) {
    notFound();
  }

  const { data: questions, error: questionsError } = await supabase
    .from("questions")
    .select("id, question_no, question_text, question_type, max_marks")
    .eq("exam_id", examId)
    .order("question_order", { ascending: true });

  if (questionsError) {
    throw new Error(questionsError.message);
  }

  const candidateQuestions = (questions || []) as CandidateQuestion[];
  const questionById = new Map(candidateQuestions.map((q) => [q.id, q]));

  const { data: cells, error: cellsError } = await supabase
    .from("student_answer_cells")
    .select(
      `
      id,
      source_row_index,
      response_column,
      answer_text,
      word_count,
      character_count,
      suggested_question_id,
      final_question_id,
      mapping_status,
      mapping_confidence,
      mapping_confidence_score,
      mapping_reason,
      ignore_reason,
      created_at
    `,
    )
    .eq("exam_id", examId)
    .eq("upload_id", uploadId)
    .order("mapping_status", { ascending: true })
    .order("mapping_confidence", { ascending: true })
    .order("source_row_index", { ascending: true })
    .order("response_column", { ascending: true })
    .limit(500);

  if (cellsError) {
    throw new Error(cellsError.message);
  }

  const answerCells = (cells || []) as AnswerCell[];

  const stats = getMappingStats(answerCells);

  const highConfidence = answerCells.filter(
    (cell) =>
      cell.mapping_status === "suggested" &&
      cell.mapping_confidence === "high" &&
      Boolean(cell.suggested_question_id),
  );

  const reviewNeeded = answerCells.filter((cell) =>
    ["unmapped", "conflict", "failed"].includes(cell.mapping_status),
  );

  const mediumOrLowSuggestions = answerCells.filter(
    (cell) =>
      cell.mapping_status === "suggested" &&
      cell.mapping_confidence !== "high",
  );

  const confirmed = answerCells.filter(
    (cell) => cell.mapping_status === "confirmed",
  );

  const ignored = answerCells.filter(
    (cell) => cell.mapping_status === "ignored",
  );

  const imported = answerCells.filter(
    (cell) => cell.mapping_status === "imported",
  );

  const canEdit =
    profile.role === "professor" &&
    exam.status !== "published" &&
    exam.status !== "archived";

  return (
    <main style={{ padding: "40px", maxWidth: "1100px" }}>
      <p>
        <Link href={ROUTES.PROFESSOR.EXAM_DETAIL(exam.id)}>
          ← Back to exam
        </Link>
      </p>

      <h1>Mapping Review</h1>

      <section style={cardStyle}>
        <h2>{exam.title}</h2>

        <p>
          <strong>Upload:</strong> {upload.file_name}
        </p>

        <p>
          <strong>Subject:</strong> {exam.subject || "-"} |{" "}
          <strong>Course:</strong> {exam.course || "-"} |{" "}
          <strong>Batch:</strong> {exam.batch || "-"}
        </p>

        <p>
          <strong>Exam Status:</strong> {exam.status}
        </p>

        <p>
          This page is for smart answer-cell mapping. High-confidence mappings
          can be accepted in bulk. Medium, low, conflict, or unmapped cells
          should be reviewed manually.
        </p>
      </section>

      <section style={cardStyle}>
        <h2>Mapping Summary</h2>

        <p>
          <strong>Total visible cells:</strong> {answerCells.length}
        </p>

        <p>
          Unmapped: {stats.unmapped} | Suggested: {stats.suggested} | Conflict:{" "}
          {stats.conflict} | Failed: {stats.failed}
        </p>

        <p>
          High: {stats.high} | Medium: {stats.medium} | Low: {stats.low}
        </p>

        <p>
          Confirmed: {stats.confirmed} | Ignored: {stats.ignored} | Imported:{" "}
          {stats.imported}
        </p>

        {canEdit && highConfidence.length > 0 && (
          <form action={acceptHighConfidenceMappingsForUpload}>
            <input type="hidden" name="examId" value={exam.id} />
            <input type="hidden" name="uploadId" value={upload.id} />

            <button type="submit">
              Accept All High-Confidence Suggestions ({highConfidence.length})
            </button>
          </form>
        )}
      </section>

      <MappingGroup
        title={`High-Confidence Suggestions (${highConfidence.length})`}
        description="These are the safest suggestions. You can bulk accept them, or review individually."
        cells={highConfidence}
        candidateQuestions={candidateQuestions}
        questionById={questionById}
        examId={exam.id}
        uploadId={upload.id}
        canEdit={canEdit}
      />

      <MappingGroup
        title={`Medium / Low Suggestions (${mediumOrLowSuggestions.length})`}
        description="Review these before confirming. Heuristic mapping can be wrong."
        cells={mediumOrLowSuggestions}
        candidateQuestions={candidateQuestions}
        questionById={questionById}
        examId={exam.id}
        uploadId={upload.id}
        canEdit={canEdit}
      />

      <MappingGroup
        title={`Needs Review (${reviewNeeded.length})`}
        description="These cells are unmapped, conflicted, or failed. Manually map or ignore."
        cells={reviewNeeded}
        candidateQuestions={candidateQuestions}
        questionById={questionById}
        examId={exam.id}
        uploadId={upload.id}
        canEdit={canEdit}
      />

      <MappingGroup
        title={`Confirmed (${confirmed.length})`}
        description="These mappings are confirmed and ready for the next materialization step."
        cells={confirmed}
        candidateQuestions={candidateQuestions}
        questionById={questionById}
        examId={exam.id}
        uploadId={upload.id}
        canEdit={false}
      />

      <MappingGroup
        title={`Ignored (${ignored.length})`}
        description="These cells will not enter subjective AI evaluation."
        cells={ignored}
        candidateQuestions={candidateQuestions}
        questionById={questionById}
        examId={exam.id}
        uploadId={upload.id}
        canEdit={false}
      />

      {imported.length > 0 && (
        <MappingGroup
          title={`Imported (${imported.length})`}
          description="These cells have already been materialized into student answers."
          cells={imported}
          candidateQuestions={candidateQuestions}
          questionById={questionById}
          examId={exam.id}
          uploadId={upload.id}
          canEdit={false}
        />
      )}
    </main>
  );
}

function MappingGroup({
  title,
  description,
  cells,
  candidateQuestions,
  questionById,
  examId,
  uploadId,
  canEdit,
}: {
  title: string;
  description: string;
  cells: AnswerCell[];
  candidateQuestions: CandidateQuestion[];
  questionById: Map<string, CandidateQuestion>;
  examId: string;
  uploadId: string;
  canEdit: boolean;
}) {
  return (
    <section style={cardStyle}>
      <h2>{title}</h2>
      <p>{description}</p>

      {cells.length === 0 ? (
        <p>No cells in this group.</p>
      ) : (
        <div style={{ display: "grid", gap: "16px" }}>
          {cells.map((cell) => (
            <AnswerCellCard
              key={cell.id}
              cell={cell}
              candidateQuestions={candidateQuestions}
              suggestedQuestion={
                cell.suggested_question_id
                  ? questionById.get(cell.suggested_question_id) || null
                  : null
              }
              finalQuestion={
                cell.final_question_id
                  ? questionById.get(cell.final_question_id) || null
                  : null
              }
              examId={examId}
              uploadId={uploadId}
              canEdit={canEdit}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function AnswerCellCard({
  cell,
  candidateQuestions,
  suggestedQuestion,
  finalQuestion,
  examId,
  uploadId,
  canEdit,
}: {
  cell: AnswerCell;
  candidateQuestions: CandidateQuestion[];
  suggestedQuestion: CandidateQuestion | null;
  finalQuestion: CandidateQuestion | null;
  examId: string;
  uploadId: string;
  canEdit: boolean;
}) {
  return (
    <article style={cellCardStyle}>
      <header>
        <h3 style={{ marginTop: 0 }}>
          Row {cell.source_row_index} — {cell.response_column}
        </h3>

        <p>
          <strong>Status:</strong> {cell.mapping_status} |{" "}
          <strong>Confidence:</strong> {cell.mapping_confidence || "-"} |{" "}
          <strong>Words:</strong> {cell.word_count}
        </p>
      </header>

      <section>
        <h4>Answer Preview</h4>
        <p style={{ whiteSpace: "pre-wrap" }}>
          {truncateText(cell.answer_text, 600)}
        </p>
      </section>

      {suggestedQuestion && (
        <section>
          <h4>Suggested Question</h4>
          <p>
            <strong>{suggestedQuestion.question_no}</strong> —{" "}
            {suggestedQuestion.question_type} —{" "}
            {formatMarks(suggestedQuestion.max_marks)} marks
          </p>
          <p>{truncateText(suggestedQuestion.question_text, 300)}</p>
        </section>
      )}

      {finalQuestion && (
        <section>
          <h4>Final Confirmed Question</h4>
          <p>
            <strong>{finalQuestion.question_no}</strong> —{" "}
            {finalQuestion.question_type} — {formatMarks(finalQuestion.max_marks)}{" "}
            marks
          </p>
          <p>{truncateText(finalQuestion.question_text, 300)}</p>
        </section>
      )}

      {cell.mapping_reason && (
        <section>
          <h4>Mapping Reason</h4>
          <p>{cell.mapping_reason}</p>
        </section>
      )}

      {cell.ignore_reason && (
        <section>
          <h4>Ignore Reason</h4>
          <p>{cell.ignore_reason}</p>
        </section>
      )}

      {canEdit && (
        <section
          style={{
            borderTop: "1px solid #eee",
            marginTop: "12px",
            paddingTop: "12px",
          }}
        >
          {suggestedQuestion && (
            <form action={confirmAnswerCellMapping} style={{ marginBottom: "12px" }}>
              <input type="hidden" name="examId" value={examId} />
              <input type="hidden" name="uploadId" value={uploadId} />
              <input type="hidden" name="cellId" value={cell.id} />
              <input
                type="hidden"
                name="questionId"
                value={suggestedQuestion.id}
              />
              <input type="hidden" name="confirmationMode" value="suggestion" />

              <button type="submit">Confirm Suggested Question</button>
            </form>
          )}

          <form action={confirmAnswerCellMapping} style={{ marginBottom: "12px" }}>
            <input type="hidden" name="examId" value={examId} />
            <input type="hidden" name="uploadId" value={uploadId} />
            <input type="hidden" name="cellId" value={cell.id} />
            <input type="hidden" name="confirmationMode" value="manual" />

            <label>
              <strong>Manual Mapping</strong>
            </label>
            <br />

            <select
              name="questionId"
              defaultValue={suggestedQuestion?.id || ""}
              required
              style={{ width: "100%", padding: "8px", marginTop: "8px" }}
            >
              <option value="">Select question</option>
              {candidateQuestions.map((question) => (
                <option key={question.id} value={question.id}>
                  {question.question_no} — {question.question_type} —{" "}
                  {formatMarks(question.max_marks)} marks
                </option>
              ))}
            </select>

            <button type="submit" style={{ marginTop: "8px" }}>
              Confirm Manual Mapping
            </button>
          </form>

          <form action={ignoreAnswerCellMapping}>
            <input type="hidden" name="examId" value={examId} />
            <input type="hidden" name="uploadId" value={uploadId} />
            <input type="hidden" name="cellId" value={cell.id} />

            <label>
              <strong>Ignore Cell</strong>
            </label>
            <br />

            <input
              name="ignoreReason"
              placeholder="Example: objective answer / irrelevant / not required"
              style={{ width: "100%", padding: "8px", marginTop: "8px" }}
            />

            <button type="submit" style={{ marginTop: "8px" }}>
              Ignore This Cell
            </button>
          </form>
        </section>
      )}
    </article>
  );
}

function getMappingStats(cells: AnswerCell[]) {
  const stats = {
    unmapped: 0,
    suggested: 0,
    conflict: 0,
    failed: 0,
    confirmed: 0,
    ignored: 0,
    imported: 0,
    high: 0,
    medium: 0,
    low: 0,
  };

  for (const cell of cells) {
    if (cell.mapping_status in stats) {
      stats[cell.mapping_status as keyof typeof stats] += 1;
    }

    if (
      cell.mapping_confidence &&
      cell.mapping_confidence in stats &&
      cell.mapping_confidence !== "unknown"
    ) {
      stats[cell.mapping_confidence as keyof typeof stats] += 1;
    }
  }

  return stats;
}

function truncateText(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength)}...`;
}

const cardStyle = {
  border: "1px solid #ddd",
  borderRadius: "8px",
  padding: "16px",
  marginBottom: "24px",
};

const cellCardStyle = {
  border: "1px solid #eee",
  borderRadius: "8px",
  padding: "16px",
};