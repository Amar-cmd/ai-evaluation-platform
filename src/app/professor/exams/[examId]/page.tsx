import Link from "next/link";
import { notFound } from "next/navigation";
import {
  createQuestion,
  createRubric,
  markExamRubricReady,
  importMappedAnswers,
  createEvaluationJobAndSeedPending,
  runMockAiEvaluationForExam,
} from "@/features/exams/actions";

import { checkExamRubricReadiness } from "@/features/exams/readiness";
import { requireProfessorOrAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ROUTES } from "@/lib/routes";
import { formatMarks } from "@/lib/marks";

type ExamDetailPageProps = {
  params: Promise<{
    examId: string;
  }>;
};

export default async function ExamDetailPage({ params }: ExamDetailPageProps) {
  const { examId } = await params;

  const { profile } = await requireProfessorOrAdmin();

  const supabase = await createClient();

  const { data: exam, error: examError } = await supabase
    .from("exams")
    .select(
      "id, title, subject, course, batch, total_marks, exam_mode, status, published_at, created_at",
    )
    .eq("id", examId)
    .single();

  if (examError || !exam) {
    notFound();
  }

  const { data: questions, error: questionsError } = await supabase
    .from("questions")
    .select(
      "id, question_no,  question_code, question_order, question_text, question_type,question_category, expected_answer_format, is_ai_evaluable, max_marks, model_answer, model_answer_status, created_at",
    )
    .eq("exam_id", examId)
    .order("question_order", { ascending: true });

  if (questionsError) {
    throw new Error(questionsError.message);
  }

  const questionIds = questions.map((question) => question.id);

  const { data: rubrics, error: rubricsError } =
    questionIds.length > 0
      ? await supabase
          .from("rubrics")
          .select(
            "id, question_id, criterion_order, criterion_name, criterion_description, max_marks, is_template_generated, source_template_id, created_at",
          )
          .in("question_id", questionIds)
          .order("criterion_order", { ascending: true })
      : { data: [], error: null };

  if (rubricsError) {
    throw new Error(rubricsError.message);
  }

  const rubricsByQuestion = new Map<string, typeof rubrics>();

  for (const question of questions) {
    rubricsByQuestion.set(question.id, []);
  }

  for (const rubric of rubrics || []) {
    const existing = rubricsByQuestion.get(rubric.question_id) || [];
    rubricsByQuestion.set(rubric.question_id, [...existing, rubric]);
  }

  const readiness = checkExamRubricReadiness(questions, rubrics || []);

  const { data: answerUploads, error: answerUploadsError } = await supabase
    .from("answer_uploads")
    .select(
      "id, file_name, file_type, total_rows, response_columns, mapping_config, status, error_message, created_at",
    )
    .eq("exam_id", examId)
    .order("created_at", { ascending: false });

  if (answerUploadsError) {
    throw new Error(answerUploadsError.message);
  }

  const uploadIds = answerUploads.map((upload) => upload.id);

  const { data: uploadRows, error: uploadRowsError } =
    uploadIds.length > 0
      ? await supabase
          .from("answer_upload_rows")
          .select("upload_id")
          .in("upload_id", uploadIds)
      : { data: [], error: null };

  if (uploadRowsError) {
    throw new Error(uploadRowsError.message);
  }

  const uploadRowCounts = new Map<string, number>();

  for (const upload of answerUploads) {
    uploadRowCounts.set(upload.id, 0);
  }

  for (const row of uploadRows || []) {
    uploadRowCounts.set(
      row.upload_id,
      (uploadRowCounts.get(row.upload_id) || 0) + 1,
    );
  }

  const { count: importedAnswerCount, error: importedAnswerCountError } =
    await supabase
      .from("student_answers")
      .select("id", { count: "exact", head: true })
      .eq("exam_id", examId);

  if (importedAnswerCountError) {
    throw new Error(importedAnswerCountError.message);
  }

  const { count: evaluationCount, error: evaluationCountError } = await supabase
    .from("evaluations")
    .select("id", { count: "exact", head: true })
    .eq("exam_id", examId);

  if (evaluationCountError) {
    throw new Error(evaluationCountError.message);
  }

  const { data: evaluationStatusRows, error: evaluationStatusRowsError } =
    await supabase.from("evaluations").select("status").eq("exam_id", examId);

  if (evaluationStatusRowsError) {
    throw new Error(evaluationStatusRowsError.message);
  }

  const evaluationStatusCounts = new Map<string, number>();

  for (const row of evaluationStatusRows || []) {
    evaluationStatusCounts.set(
      row.status,
      (evaluationStatusCounts.get(row.status) || 0) + 1,
    );
  }

  const pendingEvaluationCount = evaluationStatusCounts.get("pending") || 0;

  const professorReviewPendingCount =
    evaluationStatusCounts.get("professor_review_pending") || 0;

  const { data: evaluationJobs, error: evaluationJobsError } = await supabase
    .from("evaluation_jobs")
    .select(
      "id, status, total_items, completed_items, failed_items, created_at, started_at, completed_at",
    )
    .eq("exam_id", examId)
    .order("created_at", { ascending: false });

  if (evaluationJobsError) {
    throw new Error(evaluationJobsError.message);
  }

  const { count: resultFlagCount, error: resultFlagCountError } = await supabase
    .from("result_flags")
    .select("id", { count: "exact", head: true })
    .eq("exam_id", examId);

  if (resultFlagCountError) {
    throw new Error(resultFlagCountError.message);
  }

  return (
    <main style={{ padding: "40px", maxWidth: "1000px" }}>
      <p>
        <Link href={ROUTES.PROFESSOR.EXAMS}>Back to My Exams</Link>
      </p>

      <h1>{exam.title}</h1>

      <section
        style={{
          border: "1px solid #ddd",
          borderRadius: "8px",
          padding: "16px",
          marginBottom: "32px",
        }}
      >
        <h2>Exam Details</h2>

        <p>
          <strong>Status:</strong> {exam.status}
        </p>

        <p>
          <strong>Subject:</strong> {exam.subject || "Not set"}
        </p>

        <p>
          <strong>Course:</strong> {exam.course || "Not set"}
        </p>

        <p>
          <strong>Batch:</strong> {exam.batch || "Not set"}
        </p>

        <p>
          <strong>Total Marks:</strong> {formatMarks(exam.total_marks)}
        </p>

        <p>
          <strong>Exam Mode:</strong> {exam.exam_mode}
        </p>

        <p>
          <strong>Created:</strong> {new Date(exam.created_at).toLocaleString()}
        </p>

        <p>
          <Link href={ROUTES.PROFESSOR.EXAM_FLAGS(exam.id)}>
            View Student Result Queries ({resultFlagCount || 0})
          </Link>
        </p>

        <p>
          <Link href={ROUTES.PROFESSOR.RUBRIC_TEMPLATES(exam.id)}>
            Manage Rubric Templates
          </Link>
        </p>
      </section>

      <section
        style={{
          border: "1px solid #ddd",
          borderRadius: "8px",
          padding: "16px",
          marginBottom: "32px",
        }}
      >
        <h2>Rubric Readiness</h2>

        <p>
          <strong>Current Exam Status:</strong> {exam.status}
        </p>

        {readiness.isReady ? (
          <p style={{ color: "green" }}>
            All questions have approved model answers and matching rubrics.
          </p>
        ) : (
          <>
            <p style={{ color: "crimson" }}>
              This exam is not rubric-ready yet.
            </p>

            <ul>
              {readiness.issues.map((issue, index) => (
                <li
                  key={`${issue.type}-${issue.questionId || "exam"}-${index}`}
                >
                  {issue.message}
                </li>
              ))}
            </ul>
          </>
        )}

        {readiness.questionSummaries.length > 0 && (
          <div style={{ marginTop: "16px" }}>
            <h3>Question-wise Readiness</h3>

            <div style={{ display: "grid", gap: "8px" }}>
              {readiness.questionSummaries.map((summary) => (
                <div
                  key={summary.questionId}
                  style={{
                    border: "1px solid #eee",
                    padding: "8px",
                    borderRadius: "6px",
                  }}
                >
                  <strong>Question {summary.questionNo}</strong>

                  <p>
                    Model Answer:{" "}
                    {summary.modelAnswerReady ? "Ready" : "Not Ready"}
                  </p>

                  <p>
                    Rubrics: {summary.rubricCount} criteria, total{" "}
                    {summary.rubricTotal} / {summary.questionMaxMarks}
                  </p>

                  <p>
                    Rubric Marks:{" "}
                    {summary.rubricMarksMatch ? "Matching" : "Not Matching"}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {profile.role === "professor" &&
          readiness.isReady &&
          exam.status !== "rubric_ready" && (
            <form action={markExamRubricReady} style={{ marginTop: "16px" }}>
              <input type="hidden" name="examId" value={exam.id} />
              <button type="submit">Mark Rubric Ready</button>
            </form>
          )}

        {exam.status === "rubric_ready" && (
          <p style={{ color: "green", marginTop: "16px" }}>
            This exam has been marked as rubric ready.
          </p>
        )}
      </section>

      <section
        style={{
          border: "1px solid #ddd",
          borderRadius: "8px",
          padding: "16px",
          marginBottom: "32px",
        }}
      >
        <h2>Answer Uploads</h2>

        {profile.role === "professor" && (
          <p>
            <Link href={ROUTES.PROFESSOR.NEW_ANSWER_UPLOAD(exam.id)}>
              Upload Student Answers JSON
            </Link>
          </p>
        )}

        {answerUploads.length === 0 ? (
          <p>No answer files uploaded yet.</p>
        ) : (
          <div style={{ display: "grid", gap: "12px" }}>
            {answerUploads.map((upload) => (
              <article
                key={upload.id}
                style={{
                  border: "1px solid #eee",
                  borderRadius: "6px",
                  padding: "12px",
                }}
              >
                <h3>{upload.file_name}</h3>

                <p>
                  <strong>Type:</strong> {upload.file_type}
                </p>

                <p>
                  <strong>Status:</strong> {upload.status}
                </p>

                <p>
                  <strong>Total Rows:</strong> {upload.total_rows}
                </p>

                <p>
                  <strong>Staged Rows:</strong>{" "}
                  {uploadRowCounts.get(upload.id) || 0}
                </p>

                <p>
                  <strong>Detected Response Columns:</strong>{" "}
                  {upload.response_columns.length > 0
                    ? upload.response_columns.join(", ")
                    : "None"}
                </p>

                <p>
                  <strong>Uploaded:</strong>{" "}
                  {new Date(upload.created_at).toLocaleString()}
                </p>

                {upload.error_message && (
                  <pre
                    style={{
                      whiteSpace: "pre-wrap",
                      background: "#f8f8f8",
                      padding: "8px",
                      borderRadius: "4px",
                    }}
                  >
                    {upload.error_message}
                  </pre>
                )}

                {upload.status === "mapping_pending" && (
                  <p style={{ marginTop: "12px" }}>
                    <Link
                      href={ROUTES.PROFESSOR.MAP_ANSWER_UPLOAD(
                        exam.id,
                        upload.id,
                      )}
                    >
                      Map response columns to questions
                    </Link>
                  </p>
                )}

                {upload.status === "mapped" && (
                  <div style={{ marginTop: "12px" }}>
                    <p>
                      <Link
                        href={ROUTES.PROFESSOR.MAP_ANSWER_UPLOAD(
                          exam.id,
                          upload.id,
                        )}
                      >
                        Edit response column mapping
                      </Link>
                    </p>

                    {profile.role === "professor" && (
                      <form action={importMappedAnswers}>
                        <input type="hidden" name="examId" value={exam.id} />
                        <input
                          type="hidden"
                          name="uploadId"
                          value={upload.id}
                        />

                        <button type="submit">Import Mapped Answers</button>
                      </form>
                    )}
                  </div>
                )}

                {upload.status === "imported" && (
                  <p style={{ marginTop: "12px", color: "green" }}>
                    Answers imported successfully.
                  </p>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      <section
        style={{
          border: "1px solid #ddd",
          borderRadius: "8px",
          padding: "16px",
          marginBottom: "32px",
        }}
      >
        <h2>Evaluation Setup</h2>

        <p>
          <strong>Imported Student Answers:</strong> {importedAnswerCount || 0}
        </p>

        <p>
          <strong>Evaluation Records:</strong> {evaluationCount || 0}
        </p>

        <p>
          <strong>Pending AI Evaluation:</strong> {pendingEvaluationCount}
        </p>

        <p>
          <strong>Professor Review Pending:</strong>{" "}
          {professorReviewPendingCount}
        </p>

        {(evaluationCount || 0) > 0 && (
          <p>
            <Link href={ROUTES.PROFESSOR.EXAM_REVIEW(exam.id)}>
              Open Professor Review Dashboard
            </Link>
          </p>
        )}

        {!readiness.isReady && (
          <p style={{ color: "crimson" }}>
            Complete rubric readiness before creating evaluation records.
          </p>
        )}

        {(importedAnswerCount || 0) === 0 && (
          <p style={{ color: "crimson" }}>
            Import mapped answers before creating evaluation records.
          </p>
        )}

        {profile.role === "professor" &&
          readiness.isReady &&
          (importedAnswerCount || 0) > 0 &&
          (evaluationCount || 0) < (importedAnswerCount || 0) && (
            <form action={createEvaluationJobAndSeedPending}>
              <input type="hidden" name="examId" value={exam.id} />

              <button type="submit">Create Pending Evaluation Records</button>
            </form>
          )}

        {(evaluationCount || 0) === (importedAnswerCount || 0) &&
          (importedAnswerCount || 0) > 0 && (
            <p style={{ color: "green" }}>
              Pending evaluation records are ready.
            </p>
          )}

        {profile.role === "professor" && pendingEvaluationCount > 0 && (
          <form action={runMockAiEvaluationForExam}>
            <input type="hidden" name="examId" value={exam.id} />

            <button type="submit">Run Mock AI Evaluation</button>
          </form>
        )}

        {evaluationJobs.length > 0 && (
          <div style={{ marginTop: "24px" }}>
            <h3>Evaluation Jobs</h3>

            <div style={{ display: "grid", gap: "12px" }}>
              {evaluationJobs.map((job) => (
                <article
                  key={job.id}
                  style={{
                    border: "1px solid #eee",
                    borderRadius: "6px",
                    padding: "12px",
                  }}
                >
                  <p>
                    <strong>Status:</strong> {job.status}
                  </p>

                  <p>
                    <strong>Total:</strong> {job.total_items} |{" "}
                    <strong>Completed:</strong> {job.completed_items} |{" "}
                    <strong>Failed:</strong> {job.failed_items}
                  </p>

                  <p>
                    <strong>Created:</strong>{" "}
                    {new Date(job.created_at).toLocaleString()}
                  </p>
                </article>
              ))}
            </div>
          </div>
        )}
      </section>

      {profile.role === "professor" && (
        <section
          style={{
            border: "1px solid #ddd",
            borderRadius: "8px",
            padding: "16px",
            marginBottom: "32px",
          }}
        >
          <h2>Add Question</h2>

          <form action={createQuestion}>
            <input type="hidden" name="examId" value={exam.id} />

            <div style={{ marginBottom: "16px" }}>
              <label>Question No. *</label>
              <br />
              <input
                name="questionNo"
                required
                placeholder="Example: Q1 / 1(a) / Case-1"
                style={{ width: "100%", padding: "8px" }}
              />
            </div>

            <div style={{ marginBottom: "16px" }}>
              <label>Question Type</label>
              <br />
              <select
                name="questionType"
                defaultValue="long_answer"
                style={{ width: "100%", padding: "8px" }}
              >
                <option value="short_answer">Short Answer</option>
                <option value="long_answer">Long Answer</option>
                <option value="case_based">Case Based</option>
                <option value="essay">Essay</option>
                <option value="other">Other</option>
              </select>
            </div>


            <div style={{ marginBottom: "12px" }}>
              <label>
                <input name="isAiEvaluable" type="checkbox" defaultChecked />{" "}
                Include this question in AI subjective evaluation
              </label>

              <p style={{ fontSize: "13px", color: "#555" }}>
                Keep this checked for subjective/case/essay answers. Objective
                questions will be handled separately in upcoming steps.
              </p>
            </div>

            <div style={{ marginBottom: "16px" }}>
              <label>Max Marks *</label>
              <br />
              <input
                name="maxMarks"
                type="text"
                inputMode="decimal"
                pattern="[0-9]+([.][0-9]{1,2})?"
                required
                placeholder="Example: 10 or 10.50"
                style={{ width: "100%", padding: "8px" }}
              />
            </div>

            <div style={{ marginBottom: "16px" }}>
              <label>Question Text *</label>
              <br />
              <textarea
                name="questionText"
                required
                rows={5}
                placeholder="Write the full question here..."
                style={{ width: "100%", padding: "8px" }}
              />
            </div>

            <div style={{ marginBottom: "16px" }}>
              <label>Model Answer</label>
              <br />
              <textarea
                name="modelAnswer"
                rows={5}
                placeholder="Optional for now. Required before AI evaluation."
                style={{ width: "100%", padding: "8px" }}
              />
            </div>

            <button type="submit">Add Question</button>
          </form>
        </section>
      )}

      <section>
        <h2>Questions</h2>

        {questions.length === 0 ? (
          <p>No questions added yet.</p>
        ) : (
          <div style={{ display: "grid", gap: "16px" }}>
            {questions.map((question) => (
              <article
                key={question.id}
                style={{
                  border: "1px solid #ddd",
                  borderRadius: "8px",
                  padding: "16px",
                }}
              >
                <h3>
                  {question.question_order}. {question.question_no}
                </h3>

                <p>
                  <strong>Type:</strong> {question.question_type}
                </p>

                <p>
                  <strong>Max Marks:</strong> {formatMarks(question.max_marks)}
                </p>

                <p>
                  <strong>Model Answer Status:</strong>{" "}
                  {question.model_answer_status}
                </p>

                <div style={{ marginTop: "12px" }}>
                  <strong>Question:</strong>
                  <p>{question.question_text}</p>
                </div>

                {question.model_answer ? (
                  <div style={{ marginTop: "12px" }}>
                    <strong>Model Answer:</strong>
                    <p>{question.model_answer}</p>
                  </div>
                ) : (
                  <p style={{ marginTop: "12px" }}>
                    Model answer not provided yet.
                  </p>
                )}

                <hr style={{ margin: "24px 0" }} />

                <RubricSection
                  examId={exam.id}
                  questionId={question.id}
                  questionMaxMarks={Number(question.max_marks)}
                  rubrics={rubricsByQuestion.get(question.id) || []}
                  canEdit={
                    profile.role === "professor" &&
                    exam.status !== "published" &&
                    exam.status !== "archived"
                  }
                />
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

type RubricRow = {
  id: string;
  question_id: string;
  criterion_order: number;
  criterion_name: string;
  criterion_description: string | null;
  max_marks: number | string;
  created_at: string;
  is_template_generated: boolean;
  source_template_id: string | null;
};

function RubricSection({
  examId,
  questionId,
  questionMaxMarks,
  rubrics,
  canEdit,
}: {
  examId: string;
  questionId: string;
  questionMaxMarks: number;
  rubrics: RubricRow[];
  canEdit: boolean;
}) {
  const rubricTotal = rubrics.reduce((total, rubric) => {
    return total + Number(rubric.max_marks);
  }, 0);

  const isExactMatch = Math.abs(rubricTotal - questionMaxMarks) < 0.001;
  const isOverLimit = rubricTotal > questionMaxMarks;
  const isUnderLimit = rubricTotal < questionMaxMarks;

  const templateGeneratedCount = rubrics.filter(
    (rubric) => rubric.is_template_generated,
  ).length;

  const manualRubricCount = rubrics.length - templateGeneratedCount;

  return (
    <section>
      <h4>Question Rubric Criteria</h4>

      <p>
        <strong>Rubric Total:</strong> {formatMarks(rubricTotal)} /{" "}
        {formatMarks(questionMaxMarks)}
      </p>

      {rubrics.length > 0 && (
        <p>
          <strong>Source:</strong>{" "}
          {templateGeneratedCount > 0 && (
            <>
              {templateGeneratedCount} template-generated
              {manualRubricCount > 0 ? ", " : ""}
            </>
          )}
          {manualRubricCount > 0 && <>{manualRubricCount} manual</>}
        </p>
      )}

      {rubrics.length > 0 && isExactMatch && (
        <p style={{ color: "green" }}>
          Rubric total matches question max marks.
        </p>
      )}

      {rubrics.length > 0 && isOverLimit && (
        <p style={{ color: "crimson" }}>
          Warning: Rubric total exceeds question max marks.
        </p>
      )}

      {rubrics.length > 0 && isUnderLimit && (
        <p style={{ color: "orange" }}>
          Warning: Rubric total is less than question max marks.
        </p>
      )}

      {rubrics.length === 0 ? (
        <div>
          <p>No rubric criteria added yet.</p>

          <p>
            Recommended:{" "}
            <Link href={ROUTES.PROFESSOR.RUBRIC_TEMPLATES(examId)}>
              create/apply a rubric template
            </Link>{" "}
            instead of adding rubrics manually question-by-question.
          </p>
        </div>
      ) : (
        <ol>
          {rubrics.map((rubric) => (
            <li key={rubric.id} style={{ marginBottom: "12px" }}>
              <strong>
                {rubric.criterion_name} — {formatMarks(rubric.max_marks)} marks
              </strong>

              {rubric.is_template_generated ? (
                <span style={{ marginLeft: "8px", color: "green" }}>
                  Template-generated
                </span>
              ) : (
                <span style={{ marginLeft: "8px", color: "#777" }}>
                  Manual
                </span>
              )}

              {rubric.criterion_description && (
                <p>{rubric.criterion_description}</p>
              )}
            </li>
          ))}
        </ol>
      )}

      {canEdit && (
        <details style={{ marginTop: "24px" }}>
          <summary>Advanced: add question-specific rubric manually</summary>

          <p style={{ color: "#555" }}>
            Prefer rubric templates for repeated question types. Use this manual
            form only when this particular question needs a custom criterion.
          </p>

          <form action={createRubric} style={{ marginTop: "16px" }}>
            <input type="hidden" name="examId" value={examId} />
            <input type="hidden" name="questionId" value={questionId} />

            <div style={{ marginBottom: "12px" }}>
              <label>Criterion Name *</label>
              <br />
              <input
                name="criterionName"
                required
                placeholder="Example: Concept clarity"
                style={{ width: "100%", padding: "8px" }}
              />
            </div>

            <div style={{ marginBottom: "12px" }}>
              <label>Criterion Description</label>
              <br />
              <textarea
                name="criterionDescription"
                rows={3}
                placeholder="Explain what the student should include for this criterion."
                style={{ width: "100%", padding: "8px" }}
              />
            </div>

            <div style={{ marginBottom: "12px" }}>
              <label>Max Marks *</label>
              <br />
              <input
                name="maxMarks"
                type="text"
                inputMode="decimal"
                pattern="[0-9]+([.][0-9]{1,2})?"
                required
                placeholder="Example: 2 or 2.50"
                style={{ width: "100%", padding: "8px" }}
              />
            </div>

            <button type="submit">Add Manual Rubric Criterion</button>
          </form>
        </details>
      )}
    </section>
  );
}