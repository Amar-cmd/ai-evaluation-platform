import Link from "next/link";
import { notFound } from "next/navigation";
import {
  approveAiEvaluation,
  modifyEvaluationByProfessor,
  publishExamResults,
} from "@/features/evaluations/actions";
import { requireProfessorOrAdmin } from "@/lib/auth";
import { formatMarks } from "@/lib/marks";
import { ROUTES } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";

type ReviewPageProps = {
  params: Promise<{
    examId: string;
  }>;
};

type ReviewBreakdown = {
  id: string;
  criterion_name: string;
  criterion_description: string | null;
  max_marks: number | string;
  ai_awarded_marks: number | string | null;
  professor_awarded_marks: number | string | null;
  final_awarded_marks: number | string | null;
  ai_reason: string | null;
  professor_reason: string | null;
};

type ReviewQuestion = {
  id: string;
  question_no: string;
  question_order: number;
  question_text: string;
  max_marks: number | string;
};

type ReviewExamStudent = {
  first_name: string | null;
  last_name: string | null;
  id_number: string | null;
  email: string;
  source_row_index: number;
};

type ReviewStudentAnswer = {
  id: string;
  answer_text: string;
  word_count: number;
  character_count: number;
  response_column: string;
  questions: ReviewQuestion | ReviewQuestion[] | null;
  exam_students: ReviewExamStudent | ReviewExamStudent[] | null;
};

type ReviewEvaluation = {
  id: string;
  status: string;
  ai_score: number | string | null;
  professor_score: number | string | null;
  final_score: number | string | null;
  max_marks: number | string;
  quality_label: string | null;
  ai_confidence: string | null;
  teacher_review_summary: string | null;
  student_facing_justification: string | null;
  professor_feedback: string | null;
  what_student_did_well: unknown;
  what_is_missing: unknown;
  student_answers: ReviewStudentAnswer | ReviewStudentAnswer[] | null;
  evaluation_rubric_breakdowns: ReviewBreakdown[];
};

export default async function ProfessorExamReviewPage({
  params,
}: ReviewPageProps) {
  const { examId } = await params;

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

  const { data: evaluations, error: evaluationsError } = await supabase
    .from("evaluations")
    .select(
      `
      id,
      status,
      ai_score,
      professor_score,
      final_score,
      max_marks,
      quality_label,
      ai_confidence,
      teacher_review_summary,
      student_facing_justification,
      professor_feedback,
      what_student_did_well,
      what_is_missing,
      student_answers (
        id,
        answer_text,
        word_count,
        character_count,
        response_column,
        questions (
          id,
          question_no,
          question_order,
          question_text,
          max_marks
        ),
        exam_students (
          first_name,
          last_name,
          id_number,
          email,
          source_row_index
        )
      ),
      evaluation_rubric_breakdowns (
  id,
  criterion_name,
  criterion_description,
  max_marks,
  ai_awarded_marks,
  professor_awarded_marks,
  final_awarded_marks,
  ai_reason,
  professor_reason
      )
    `,
    )
    .eq("exam_id", examId)
    .in("status", [
      "professor_review_pending",
      "approved",
      "modified_by_professor",
      "published",
    ])
    .order("created_at", { ascending: true });

  if (evaluationsError) {
    throw new Error(evaluationsError.message);
  }

  const reviewEvaluations = (evaluations || []) as ReviewEvaluation[];

  const statusCounts = countByStatus(reviewEvaluations);

  const pendingReviewCount = statusCounts.get("professor_review_pending") || 0;

  const approvedCount = statusCounts.get("approved") || 0;

  const modifiedCount = statusCounts.get("modified_by_professor") || 0;

  const publishedCount = statusCounts.get("published") || 0;

  const publishReadyCount = approvedCount + modifiedCount;

  const canPublishResults =
    profile.role === "professor" &&
    exam.status !== "published" &&
    exam.status !== "archived" &&
    reviewEvaluations.length > 0 &&
    pendingReviewCount === 0 &&
    publishReadyCount === reviewEvaluations.length;

  return (
    <main style={{ padding: "40px" }}>
      <p>
        <Link href={ROUTES.PROFESSOR.EXAM_DETAIL(exam.id)}>← Back to exam</Link>
      </p>

      <h1>Professor Review Dashboard</h1>

      <section
        style={{
          border: "1px solid #ddd",
          borderRadius: "8px",
          padding: "16px",
          marginBottom: "24px",
        }}
      >
        <h2>{exam.title}</h2>

        <p>
          <strong>Subject:</strong> {exam.subject || "-"}
        </p>

        <p>
          <strong>Course:</strong> {exam.course || "-"}
        </p>

        <p>
          <strong>Batch:</strong> {exam.batch || "-"}
        </p>

        <p>
          <strong>Exam Status:</strong> {exam.status}
        </p>

        <hr />

        <p>
          <strong>Total Review Items:</strong> {reviewEvaluations.length}
        </p>

        <p>
          <strong>Pending Review:</strong> {pendingReviewCount}
        </p>

        <p>
          <strong>Approved:</strong> {approvedCount}
        </p>

        <p>
          <strong>Modified:</strong> {modifiedCount}
        </p>

        <p>
          <strong>Published:</strong> {publishedCount}
        </p>
      </section>

      {canPublishResults && (
        <form action={publishExamResults} style={{ marginTop: "16px" }}>
          <input type="hidden" name="examId" value={exam.id} />

          <button type="submit">Publish Final Results</button>
        </form>
      )}

      {exam.status !== "published" &&
        reviewEvaluations.length > 0 &&
        pendingReviewCount > 0 && (
          <p style={{ color: "crimson" }}>
            Approve or modify all pending review items before publishing.
          </p>
        )}

      {exam.status !== "published" &&
        reviewEvaluations.length > 0 &&
        pendingReviewCount === 0 &&
        publishReadyCount !== reviewEvaluations.length && (
          <p style={{ color: "crimson" }}>
            Only approved or professor-modified evaluations can be published.
          </p>
        )}

      {exam.status === "published" && (
        <p style={{ color: "green", marginTop: "16px" }}>
          Final results have been published.
        </p>
      )}

      {reviewEvaluations.length === 0 ? (
        <section
          style={{
            border: "1px solid #ddd",
            borderRadius: "8px",
            padding: "16px",
          }}
        >
          <p>No AI evaluated answers found for professor review.</p>
          <p>
            Make sure mock AI evaluation has been completed from the exam detail
            page.
          </p>
        </section>
      ) : (
        <section style={{ display: "grid", gap: "20px" }}>
          {reviewEvaluations.map((evaluation) => {
            const studentAnswer = singleRelation(evaluation.student_answers);
            const question = singleRelation(studentAnswer?.questions);
            const examStudent = singleRelation(studentAnswer?.exam_students);

            const studentName = formatStudentName(
              examStudent?.first_name,
              examStudent?.last_name,
            );

            const didWell = readStringArray(evaluation.what_student_did_well);
            const missing = readStringArray(evaluation.what_is_missing);

            return (
              <article
                key={evaluation.id}
                style={{
                  border: "1px solid #ddd",
                  borderRadius: "8px",
                  padding: "16px",
                }}
              >
                <header
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "16px",
                    alignItems: "flex-start",
                  }}
                >
                  <div>
                    <h2 style={{ marginTop: 0 }}>
                      {question?.question_no || "Question"} — {studentName}
                    </h2>

                    <p>
                      <strong>ID:</strong> {examStudent?.id_number || "-"} |{" "}
                      <strong>Email:</strong> {examStudent?.email || "-"}
                    </p>

                    <p>
                      <strong>Status:</strong> {evaluation.status}
                    </p>
                  </div>

                  <div style={{ textAlign: "right" }}>
                    <p>
                      <strong>AI Score:</strong>{" "}
                      {formatMarks(evaluation.ai_score)} /{" "}
                      {formatMarks(evaluation.max_marks)}
                    </p>

                    <p>
                      <strong>Quality:</strong>{" "}
                      {evaluation.quality_label || "-"}
                    </p>

                    <p>
                      <strong>Confidence:</strong>{" "}
                      {evaluation.ai_confidence || "-"}
                    </p>

                    {evaluation.professor_score !== null && (
                      <p>
                        <strong>Professor Score:</strong>{" "}
                        {formatMarks(evaluation.professor_score)} /{" "}
                        {formatMarks(evaluation.max_marks)}
                      </p>
                    )}

                    {evaluation.final_score !== null && (
                      <p>
                        <strong>Final Score:</strong>{" "}
                        {formatMarks(evaluation.final_score)} /{" "}
                        {formatMarks(evaluation.max_marks)}
                      </p>
                    )}
                  </div>
                </header>

                <hr />

                <section>
                  <h3>Teacher Review Summary</h3>
                  <p>{evaluation.teacher_review_summary || "-"}</p>
                </section>

                <section>
                  <h3>Rubric-wise AI Marks</h3>

                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      marginTop: "8px",
                    }}
                  >
                    <thead>
                      <tr>
                        <th style={tableHeaderStyle}>Criterion</th>
                        <th style={tableHeaderStyle}>AI Marks</th>
                        <th style={tableHeaderStyle}>Max Marks</th>
                        <th style={tableHeaderStyle}>Reason</th>
                      </tr>
                    </thead>

                    <tbody>
                      {evaluation.evaluation_rubric_breakdowns.map(
                        (breakdown) => (
                          <tr key={breakdown.id}>
                            <td style={tableCellStyle}>
                              {breakdown.criterion_name}
                            </td>
                            <td style={tableCellStyle}>
                              {formatMarks(breakdown.ai_awarded_marks)}
                            </td>
                            <td style={tableCellStyle}>
                              {formatMarks(breakdown.max_marks)}
                            </td>
                            <td style={tableCellStyle}>
                              {breakdown.ai_reason || "-"}
                            </td>
                          </tr>
                        ),
                      )}
                    </tbody>
                  </table>
                </section>

                <section
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "16px",
                    marginTop: "16px",
                  }}
                >
                  <div>
                    <h3>What Student Did Well</h3>
                    {didWell.length > 0 ? (
                      <ul>
                        {didWell.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    ) : (
                      <p>-</p>
                    )}
                  </div>

                  <div>
                    <h3>What Is Missing</h3>
                    {missing.length > 0 ? (
                      <ul>
                        {missing.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    ) : (
                      <p>-</p>
                    )}
                  </div>
                </section>

                <section>
                  <h3>Student-facing Justification</h3>
                  <p>{evaluation.student_facing_justification || "-"}</p>
                </section>

                <details style={{ marginTop: "16px" }}>
                  <summary>Expand full student answer</summary>

                  <div
                    style={{
                      marginTop: "12px",
                      border: "1px solid #eee",
                      borderRadius: "6px",
                      padding: "12px",
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    <p>
                      <strong>Response Column:</strong>{" "}
                      {studentAnswer?.response_column || "-"}
                    </p>

                    <p>
                      <strong>Word Count:</strong>{" "}
                      {studentAnswer?.word_count ?? "-"} |{" "}
                      <strong>Character Count:</strong>{" "}
                      {studentAnswer?.character_count ?? "-"}
                    </p>

                    <hr />

                    {studentAnswer?.answer_text || "-"}
                  </div>
                </details>

                {profile.role === "professor" &&
                  evaluation.status === "professor_review_pending" && (
                    <form
                      action={approveAiEvaluation}
                      style={{ marginTop: "16px" }}
                    >
                      <input type="hidden" name="examId" value={exam.id} />
                      <input
                        type="hidden"
                        name="evaluationId"
                        value={evaluation.id}
                      />

                      <button type="submit">Approve AI Score</button>
                    </form>
                  )}

                {profile.role === "professor" &&
                  evaluation.status === "professor_review_pending" && (
                    <form
                      action={approveAiEvaluation}
                      style={{ marginTop: "16px" }}
                    >
                      <input type="hidden" name="examId" value={exam.id} />
                      <input
                        type="hidden"
                        name="evaluationId"
                        value={evaluation.id}
                      />

                      <button type="submit">Approve AI Score</button>
                    </form>
                  )}

                {profile.role === "professor" &&
                  exam.status !== "published" &&
                  [
                    "professor_review_pending",
                    "approved",
                    "modified_by_professor",
                  ].includes(evaluation.status) && (
                    <details style={{ marginTop: "16px" }}>
                      <summary>Modify marks and feedback</summary>

                      <form
                        action={modifyEvaluationByProfessor}
                        style={{
                          marginTop: "16px",
                          border: "1px solid #eee",
                          borderRadius: "8px",
                          padding: "16px",
                        }}
                      >
                        <input type="hidden" name="examId" value={exam.id} />
                        <input
                          type="hidden"
                          name="evaluationId"
                          value={evaluation.id}
                        />

                        <h3>Professor Rubric Marks</h3>

                        <table
                          style={{
                            width: "100%",
                            borderCollapse: "collapse",
                            marginTop: "8px",
                          }}
                        >
                          <thead>
                            <tr>
                              <th style={tableHeaderStyle}>Criterion</th>
                              <th style={tableHeaderStyle}>AI Marks</th>
                              <th style={tableHeaderStyle}>Professor Marks</th>
                              <th style={tableHeaderStyle}>Max Marks</th>
                              <th style={tableHeaderStyle}>Professor Reason</th>
                            </tr>
                          </thead>

                          <tbody>
                            {evaluation.evaluation_rubric_breakdowns.map(
                              (breakdown) => {
                                const defaultProfessorMarks =
                                  breakdown.professor_awarded_marks ??
                                  breakdown.final_awarded_marks ??
                                  breakdown.ai_awarded_marks ??
                                  "0";

                                const defaultProfessorReason =
                                  breakdown.professor_reason ??
                                  breakdown.ai_reason ??
                                  "";

                                return (
                                  <tr key={breakdown.id}>
                                    <td style={tableCellStyle}>
                                      <strong>
                                        {breakdown.criterion_name}
                                      </strong>

                                      {breakdown.criterion_description && (
                                        <p style={{ margin: "4px 0 0" }}>
                                          {breakdown.criterion_description}
                                        </p>
                                      )}
                                    </td>

                                    <td style={tableCellStyle}>
                                      {formatMarks(breakdown.ai_awarded_marks)}
                                    </td>

                                    <td style={tableCellStyle}>
                                      <input
                                        name={`breakdown_${breakdown.id}_marks`}
                                        type="text"
                                        inputMode="decimal"
                                        pattern="[0-9]+([.][0-9]{1,2})?"
                                        defaultValue={formatMarks(
                                          defaultProfessorMarks,
                                        )}
                                        style={{
                                          width: "80px",
                                          padding: "6px",
                                        }}
                                        required
                                      />
                                    </td>

                                    <td style={tableCellStyle}>
                                      {formatMarks(breakdown.max_marks)}
                                    </td>

                                    <td style={tableCellStyle}>
                                      <textarea
                                        name={`breakdown_${breakdown.id}_reason`}
                                        defaultValue={defaultProfessorReason}
                                        rows={3}
                                        style={{
                                          width: "100%",
                                          padding: "6px",
                                        }}
                                        placeholder="Reason for professor marks"
                                      />
                                    </td>
                                  </tr>
                                );
                              },
                            )}
                          </tbody>
                        </table>

                        <div style={{ marginTop: "16px" }}>
                          <label>
                            <strong>Overall Professor Feedback</strong>
                          </label>

                          <br />

                          <textarea
                            name="professorFeedback"
                            defaultValue={
                              evaluation.professor_feedback ??
                              evaluation.teacher_review_summary ??
                              ""
                            }
                            rows={4}
                            style={{
                              width: "100%",
                              padding: "8px",
                              marginTop: "8px",
                            }}
                            placeholder="Write professor feedback for this answer"
                          />
                        </div>

                        <button type="submit" style={{ marginTop: "12px" }}>
                          Save Modified Marks
                        </button>
                      </form>
                    </details>
                  )}

                {evaluation.status === "approved" && (
                  <p style={{ color: "green", marginTop: "16px" }}>
                    Approved. Final score: {formatMarks(evaluation.final_score)}{" "}
                    / {formatMarks(evaluation.max_marks)}
                  </p>
                )}

                {evaluation.status === "modified_by_professor" && (
                  <p style={{ color: "green", marginTop: "16px" }}>
                    Modified by professor. Final score:{" "}
                    {formatMarks(evaluation.final_score)} /{" "}
                    {formatMarks(evaluation.max_marks)}
                  </p>
                )}

                {evaluation.status === "published" && (
                  <p style={{ color: "green", marginTop: "16px" }}>
                    Published. Final score:{" "}
                    {formatMarks(evaluation.final_score)} /{" "}
                    {formatMarks(evaluation.max_marks)}
                  </p>
                )}
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}

const tableHeaderStyle = {
  borderBottom: "1px solid #ddd",
  padding: "8px",
  textAlign: "left" as const,
};

const tableCellStyle = {
  borderBottom: "1px solid #eee",
  padding: "8px",
  verticalAlign: "top" as const,
};

function singleRelation<T>(value: T | T[] | null | undefined): T | null {
  if (!value) {
    return null;
  }

  if (Array.isArray(value)) {
    return value[0] || null;
  }

  return value;
}

function formatStudentName(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
) {
  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();

  return fullName || "Unnamed Student";
}

function readStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function countByStatus(evaluations: ReviewEvaluation[]) {
  const counts = new Map<string, number>();

  for (const evaluation of evaluations) {
    counts.set(evaluation.status, (counts.get(evaluation.status) || 0) + 1);
  }

  return counts;
}
