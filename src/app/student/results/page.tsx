import Link from "next/link";
import { requireStudent } from "@/lib/auth";
import { formatMarks } from "@/lib/marks";
import { ROUTES } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";
import { createResultFlag } from "@/features/flags/actions";

type StudentResultRow = {
  exam_id: string;
  exam_title: string;
  subject: string | null;
  course: string | null;
  batch: string | null;
  exam_published_at: string | null;
  exam_student_id: string;
  student_name: string | null;
  id_number: string | null;
  student_email: string;
  total_score: number | string | null;
  total_max_marks: number | string | null;
  question_results: unknown;
};

type QuestionResult = {
  evaluation_id: string;
  question_id: string;
  question_no: string;
  question_text: string;
  final_score: number | string | null;
  max_marks: number | string | null;
  student_facing_justification: string | null;
  what_student_did_well: unknown;
  what_is_missing: unknown;
  rubric_breakdown: unknown;
};

type RubricResult = {
  criterion_name: string;
  max_marks: number | string | null;
  awarded_marks: number | string | null;
  reason: string | null;
};

type StudentResultFlag = {
  id: string;
  evaluation_id: string;
  status: string;
  student_message: string;
  professor_response: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
};

export default async function StudentResultsPage() {
  await requireStudent();

  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_my_published_results");

  if (error) {
    throw new Error(error.message);
  }

  const results = (data || []) as StudentResultRow[];

  const evaluationIds = Array.from(
    new Set(
      results.flatMap((result) =>
        readQuestionResults(result.question_results)
          .map((question) => question.evaluation_id)
          .filter(Boolean),
      ),
    ),
  );

  let flags: StudentResultFlag[] = [];

  if (evaluationIds.length > 0) {
    const { data: flagRows, error: flagsError } = await supabase
      .from("result_flags")
      .select(
        "id, evaluation_id, status, student_message, professor_response, created_at, updated_at, resolved_at",
      )
      .in("evaluation_id", evaluationIds)
      .order("created_at", { ascending: false });

    if (flagsError) {
      throw new Error(flagsError.message);
    }

    flags = (flagRows || []) as StudentResultFlag[];
  }

  const flagsByEvaluationId = new Map<string, StudentResultFlag[]>();

  for (const flag of flags) {
    const existing = flagsByEvaluationId.get(flag.evaluation_id) || [];
    flagsByEvaluationId.set(flag.evaluation_id, [...existing, flag]);
  }

  return (
    <main style={{ padding: "40px" }}>
      <p>
        <Link href={ROUTES.STUDENT.DASHBOARD}>← Back to dashboard</Link>
      </p>

      <h1>My Results</h1>

      {results.length === 0 ? (
        <section
          style={{
            border: "1px solid #ddd",
            borderRadius: "8px",
            padding: "16px",
            marginTop: "24px",
          }}
        >
          <h2>No published results found</h2>

          <p>
            Your result will appear here after your professor publishes the
            final evaluated result.
          </p>

          <p>
            If your professor has already published the result, make sure you
            are logged in with the same email address used in the uploaded
            answer sheet.
          </p>
        </section>
      ) : (
        <section style={{ display: "grid", gap: "24px", marginTop: "24px" }}>
          {results.map((result) => {
            const questionResults = readQuestionResults(
              result.question_results,
            );

            return (
              <article
                key={`${result.exam_id}-${result.exam_student_id}`}
                style={{
                  border: "1px solid #ddd",
                  borderRadius: "8px",
                  padding: "20px",
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
                    <h2 style={{ marginTop: 0 }}>{result.exam_title}</h2>

                    <p>
                      <strong>Subject:</strong> {result.subject || "-"}
                    </p>

                    <p>
                      <strong>Course:</strong> {result.course || "-"} |{" "}
                      <strong>Batch:</strong> {result.batch || "-"}
                    </p>

                    <p>
                      <strong>Student:</strong>{" "}
                      {result.student_name || "Unnamed Student"} |{" "}
                      <strong>ID:</strong> {result.id_number || "-"}
                    </p>

                    <p>
                      <strong>Email:</strong> {result.student_email}
                    </p>

                    <p>
                      <strong>Published:</strong>{" "}
                      {result.exam_published_at
                        ? new Date(result.exam_published_at).toLocaleString()
                        : "-"}
                    </p>
                  </div>

                  <div style={{ textAlign: "right" }}>
                    <p style={{ fontSize: "20px", marginTop: 0 }}>
                      <strong>
                        {formatMarks(result.total_score)} /{" "}
                        {formatMarks(result.total_max_marks)}
                      </strong>
                    </p>

                    <p>Total Score</p>
                  </div>
                </header>

                <hr />

                <h3>Question-wise Result</h3>

                <div style={{ display: "grid", gap: "16px" }}>
                  {questionResults.map((question) => {
                    const didWell = readStringArray(
                      question.what_student_did_well,
                    );

                    const missing = readStringArray(question.what_is_missing);

                    const rubricBreakdown = readRubricBreakdown(
                      question.rubric_breakdown,
                    );

                    return (
                      <section
                        key={question.question_id}
                        style={{
                          border: "1px solid #eee",
                          borderRadius: "8px",
                          padding: "16px",
                        }}
                      >
                        <header
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: "16px",
                          }}
                        >
                          <div>
                            <h4 style={{ marginTop: 0 }}>
                              {question.question_no}
                            </h4>

                            <p>{question.question_text}</p>
                          </div>

                          <p>
                            <strong>
                              {formatMarks(question.final_score)} /{" "}
                              {formatMarks(question.max_marks)}
                            </strong>
                          </p>
                        </header>

                        <section>
                          <h4>Justification</h4>
                          <p>
                            {question.student_facing_justification ||
                              "No justification available."}
                          </p>
                        </section>

                        <section
                          style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr",
                            gap: "16px",
                          }}
                        >
                          <div>
                            <h4>What You Did Well</h4>

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
                            <h4>What Can Be Improved</h4>

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

                        <details style={{ marginTop: "12px" }}>
                          <summary>View rubric-wise marks</summary>

                          <table
                            style={{
                              width: "100%",
                              borderCollapse: "collapse",
                              marginTop: "12px",
                            }}
                          >
                            <thead>
                              <tr>
                                <th style={tableHeaderStyle}>Criterion</th>
                                <th style={tableHeaderStyle}>Marks</th>
                                <th style={tableHeaderStyle}>Max Marks</th>
                                <th style={tableHeaderStyle}>Reason</th>
                              </tr>
                            </thead>

                            <tbody>
                              {rubricBreakdown.map((rubric, index) => (
                                <tr
                                  key={`${question.question_id}-${rubric.criterion_name}-${index}`}
                                >
                                  <td style={tableCellStyle}>
                                    {rubric.criterion_name}
                                  </td>

                                  <td style={tableCellStyle}>
                                    {formatMarks(rubric.awarded_marks)}
                                  </td>

                                  <td style={tableCellStyle}>
                                    {formatMarks(rubric.max_marks)}
                                  </td>

                                  <td style={tableCellStyle}>
                                    {rubric.reason || "-"}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </details>

                        <section
                          style={{
                            marginTop: "16px",
                            borderTop: "1px solid #eee",
                            paddingTop: "16px",
                          }}
                        >
                          <h4>Result Query / Objection</h4>

                          {(() => {
                            const questionFlags =
                              flagsByEvaluationId.get(question.evaluation_id) ||
                              [];

                            const activeFlag = questionFlags.find((flag) =>
                              ["open", "under_review"].includes(flag.status),
                            );

                            return (
                              <>
                                {questionFlags.length > 0 && (
                                  <div
                                    style={{
                                      display: "grid",
                                      gap: "8px",
                                      marginBottom: "12px",
                                    }}
                                  >
                                    {questionFlags.map((flag) => (
                                      <article
                                        key={flag.id}
                                        style={{
                                          border: "1px solid #eee",
                                          borderRadius: "6px",
                                          padding: "10px",
                                        }}
                                      >
                                        <p>
                                          <strong>Status:</strong> {flag.status}
                                        </p>

                                        <p>
                                          <strong>Your query:</strong>{" "}
                                          {flag.student_message}
                                        </p>

                                        {flag.professor_response && (
                                          <p>
                                            <strong>Professor response:</strong>{" "}
                                            {flag.professor_response}
                                          </p>
                                        )}

                                        <p>
                                          <strong>Submitted:</strong>{" "}
                                          {new Date(
                                            flag.created_at,
                                          ).toLocaleString()}
                                        </p>
                                      </article>
                                    ))}
                                  </div>
                                )}

                                {activeFlag ? (
                                  <p style={{ color: "crimson" }}>
                                    You already have an active query for this
                                    question result.
                                  </p>
                                ) : (
                                  <details>
                                    <summary>
                                      Raise query for this question
                                    </summary>

                                    <form
                                      action={createResultFlag}
                                      style={{
                                        marginTop: "12px",
                                        display: "grid",
                                        gap: "8px",
                                      }}
                                    >
                                      <input
                                        type="hidden"
                                        name="examId"
                                        value={result.exam_id}
                                      />

                                      <input
                                        type="hidden"
                                        name="examStudentId"
                                        value={result.exam_student_id}
                                      />

                                      <input
                                        type="hidden"
                                        name="evaluationId"
                                        value={question.evaluation_id}
                                      />

                                      <label>Explain your query clearly</label>

                                      <textarea
                                        name="studentMessage"
                                        rows={4}
                                        required
                                        minLength={10}
                                        maxLength={2000}
                                        style={{
                                          width: "100%",
                                          padding: "8px",
                                        }}
                                        placeholder="Example: I think my answer covered the case application part. Please review this question."
                                      />

                                      <button type="submit">
                                        Submit Query
                                      </button>
                                    </form>
                                  </details>
                                )}
                              </>
                            );
                          })()}
                        </section>
                      </section>
                    );
                  })}
                </div>
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

function readQuestionResults(value: unknown): QuestionResult[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isPlainObject).map((item) => ({
    evaluation_id: readString(item.evaluation_id),
    question_id: readString(item.question_id),
    question_no: readString(item.question_no),
    question_text: readString(item.question_text),
    final_score: readMarksValue(item.final_score),
    max_marks: readMarksValue(item.max_marks),
    student_facing_justification: readNullableString(
      item.student_facing_justification,
    ),
    what_student_did_well: item.what_student_did_well,
    what_is_missing: item.what_is_missing,
    rubric_breakdown: item.rubric_breakdown,
  }));
}

function readRubricBreakdown(value: unknown): RubricResult[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isPlainObject).map((item) => ({
    criterion_name: readString(item.criterion_name),
    max_marks: readMarksValue(item.max_marks),
    awarded_marks: readMarksValue(item.awarded_marks),
    reason: readNullableString(item.reason),
  }));
}

function readStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function readString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function readNullableString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function readMarksValue(value: unknown) {
  if (typeof value === "number" || typeof value === "string") {
    return value;
  }

  return null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
