import Link from "next/link"
import { notFound } from "next/navigation"
import { updateResultFlagByProfessor } from "@/features/flags/actions"
import { requireProfessorOrAdmin } from "@/lib/auth"
import { formatMarks } from "@/lib/marks"
import { ROUTES } from "@/lib/routes"
import { createClient } from "@/lib/supabase/server"

type ProfessorFlagsPageProps = {
  params: Promise<{
    examId: string
  }>
}

type FlagExamStudent = {
  first_name: string | null
  last_name: string | null
  id_number: string | null
  email: string
}

type FlagQuestion = {
  question_no: string
  question_text: string
}

type FlagStudentAnswer = {
  answer_text: string
  word_count: number
  character_count: number
  questions: FlagQuestion | FlagQuestion[] | null
}

type FlagEvaluation = {
  final_score: number | string | null
  max_marks: number | string
  student_facing_justification: string | null
  student_answers: FlagStudentAnswer | FlagStudentAnswer[] | null
}

type ResultFlagRow = {
  id: string
  status: string
  student_message: string
  professor_response: string | null
  created_at: string
  updated_at: string
  resolved_at: string | null
  exam_students: FlagExamStudent | FlagExamStudent[] | null
  evaluations: FlagEvaluation | FlagEvaluation[] | null
}

export default async function ProfessorExamFlagsPage({
  params,
}: ProfessorFlagsPageProps) {
  const { examId } = await params

  const { user, profile } = await requireProfessorOrAdmin()
  const supabase = await createClient()

  const { data: exam, error: examError } = await supabase
    .from("exams")
    .select("id, title, subject, course, batch, professor_id, status")
    .eq("id", examId)
    .single()

  if (examError || !exam) {
    notFound()
  }

  if (profile.role === "professor" && exam.professor_id !== user.id) {
    notFound()
  }

  const { data: flags, error: flagsError } = await supabase
    .from("result_flags")
    .select(
      `
      id,
      status,
      student_message,
      professor_response,
      created_at,
      updated_at,
      resolved_at,
      exam_students (
        first_name,
        last_name,
        id_number,
        email
      ),
      evaluations (
        final_score,
        max_marks,
        student_facing_justification,
        student_answers (
          answer_text,
          word_count,
          character_count,
          questions (
            question_no,
            question_text
          )
        )
      )
    `
    )
    .eq("exam_id", examId)
    .order("created_at", { ascending: false })

  if (flagsError) {
    throw new Error(flagsError.message)
  }

  const resultFlags = (flags || []) as ResultFlagRow[]

  const statusCounts = countByStatus(resultFlags)

  return (
    <main style={{ padding: "40px" }}>
      <p>
        <Link href={ROUTES.PROFESSOR.EXAM_DETAIL(exam.id)}>
          ← Back to exam
        </Link>
      </p>

      <h1>Result Flags / Student Queries</h1>

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
          <strong>Course:</strong> {exam.course || "-"} |{" "}
          <strong>Batch:</strong> {exam.batch || "-"}
        </p>

        <p>
          <strong>Exam Status:</strong> {exam.status}
        </p>

        <hr />

        <p>
          <strong>Total Flags:</strong> {resultFlags.length}
        </p>

        <p>
          <strong>Open:</strong> {statusCounts.get("open") || 0}
        </p>

        <p>
          <strong>Under Review:</strong>{" "}
          {statusCounts.get("under_review") || 0}
        </p>

        <p>
          <strong>Resolved:</strong> {statusCounts.get("resolved") || 0}
        </p>

        <p>
          <strong>Rejected:</strong> {statusCounts.get("rejected") || 0}
        </p>
      </section>

      {resultFlags.length === 0 ? (
        <section
          style={{
            border: "1px solid #ddd",
            borderRadius: "8px",
            padding: "16px",
          }}
        >
          <p>No student queries have been raised for this exam yet.</p>
        </section>
      ) : (
        <section style={{ display: "grid", gap: "20px" }}>
          {resultFlags.map((flag) => {
            const examStudent = singleRelation(flag.exam_students)
            const evaluation = singleRelation(flag.evaluations)
            const studentAnswer = singleRelation(evaluation?.student_answers)
            const question = singleRelation(studentAnswer?.questions)

            const studentName = formatStudentName(
              examStudent?.first_name,
              examStudent?.last_name
            )

            const isClosed = ["resolved", "rejected"].includes(flag.status)

            return (
              <article
                key={flag.id}
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
                      <strong>Status:</strong> {flag.status}
                    </p>

                    <p>
                      <strong>Submitted:</strong>{" "}
                      {new Date(flag.created_at).toLocaleString()}
                    </p>
                  </div>

                  <div style={{ textAlign: "right" }}>
                    <p>
                      <strong>Final Marks:</strong>{" "}
                      {formatMarks(evaluation?.final_score)} /{" "}
                      {formatMarks(evaluation?.max_marks)}
                    </p>
                  </div>
                </header>

                <hr />

                <section>
                  <h3>Question</h3>
                  <p>{question?.question_text || "-"}</p>
                </section>

                <section>
                  <h3>Student Query</h3>
                  <p>{flag.student_message}</p>
                </section>

                <section>
                  <h3>Published Student Justification</h3>
                  <p>{evaluation?.student_facing_justification || "-"}</p>
                </section>

                {flag.professor_response && (
                  <section>
                    <h3>Professor Response</h3>
                    <p>{flag.professor_response}</p>
                  </section>
                )}

                <details style={{ marginTop: "16px" }}>
                  <summary>View student answer</summary>

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
                      <strong>Word Count:</strong>{" "}
                      {studentAnswer?.word_count ?? "-"} |{" "}
                      <strong>Character Count:</strong>{" "}
                      {studentAnswer?.character_count ?? "-"}
                    </p>

                    <hr />

                    {studentAnswer?.answer_text || "-"}
                  </div>
                </details>

                {profile.role === "professor" && !isClosed && (
                  <section
                    style={{
                      marginTop: "16px",
                      borderTop: "1px solid #eee",
                      paddingTop: "16px",
                    }}
                  >
                    {flag.status === "open" && (
                      <form
                        action={updateResultFlagByProfessor}
                        style={{ marginBottom: "12px" }}
                      >
                        <input type="hidden" name="examId" value={exam.id} />
                        <input type="hidden" name="flagId" value={flag.id} />
                        <input
                          type="hidden"
                          name="nextStatus"
                          value="under_review"
                        />

                        <button type="submit">Mark Under Review</button>
                      </form>
                    )}

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: "16px",
                      }}
                    >
                      <form action={updateResultFlagByProfessor}>
                        <input type="hidden" name="examId" value={exam.id} />
                        <input type="hidden" name="flagId" value={flag.id} />
                        <input
                          type="hidden"
                          name="nextStatus"
                          value="resolved"
                        />

                        <label>
                          <strong>Resolve with response</strong>
                        </label>

                        <textarea
                          name="professorResponse"
                          rows={4}
                          minLength={10}
                          maxLength={3000}
                          required
                          defaultValue={flag.professor_response || ""}
                          style={{
                            width: "100%",
                            padding: "8px",
                            marginTop: "8px",
                          }}
                          placeholder="Explain the review decision clearly."
                        />

                        <button type="submit" style={{ marginTop: "8px" }}>
                          Resolve Flag
                        </button>
                      </form>

                      <form action={updateResultFlagByProfessor}>
                        <input type="hidden" name="examId" value={exam.id} />
                        <input type="hidden" name="flagId" value={flag.id} />
                        <input
                          type="hidden"
                          name="nextStatus"
                          value="rejected"
                        />

                        <label>
                          <strong>Reject with response</strong>
                        </label>

                        <textarea
                          name="professorResponse"
                          rows={4}
                          minLength={10}
                          maxLength={3000}
                          required
                          defaultValue={flag.professor_response || ""}
                          style={{
                            width: "100%",
                            padding: "8px",
                            marginTop: "8px",
                          }}
                          placeholder="Explain why the query is rejected."
                        />

                        <button type="submit" style={{ marginTop: "8px" }}>
                          Reject Flag
                        </button>
                      </form>
                    </div>
                  </section>
                )}

                {isClosed && (
                  <p style={{ color: "green", marginTop: "16px" }}>
                    Closed as {flag.status}
                    {flag.resolved_at
                      ? ` on ${new Date(flag.resolved_at).toLocaleString()}`
                      : ""}
                  </p>
                )}
              </article>
            )
          })}
        </section>
      )}
    </main>
  )
}

function singleRelation<T>(
  value: T | T[] | null | undefined
): T | null {
  if (!value) {
    return null
  }

  if (Array.isArray(value)) {
    return value[0] || null
  }

  return value
}

function formatStudentName(
  firstName: string | null | undefined,
  lastName: string | null | undefined
) {
  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim()

  return fullName || "Unnamed Student"
}

function countByStatus(flags: ResultFlagRow[]) {
  const counts = new Map<string, number>()

  for (const flag of flags) {
    counts.set(flag.status, (counts.get(flag.status) || 0) + 1)
  }

  return counts
}