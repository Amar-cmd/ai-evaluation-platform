import Link from "next/link"
import { notFound } from "next/navigation"
import { createQuestion } from "@/features/exams/actions"
import { requireProfessorOrAdmin } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import { ROUTES } from "@/lib/routes"

type ExamDetailPageProps = {
  params: Promise<{
    examId: string
  }>
}

export default async function ExamDetailPage({ params }: ExamDetailPageProps) {
  const { examId } = await params

  const { profile } = await requireProfessorOrAdmin()

  const supabase = await createClient()

  const { data: exam, error: examError } = await supabase
    .from("exams")
    .select(
      "id, title, subject, course, batch, total_marks, status, published_at, created_at"
    )
    .eq("id", examId)
    .single()

  if (examError || !exam) {
    notFound()
  }

  const { data: questions, error: questionsError } = await supabase
    .from("questions")
    .select(
      "id, question_no, question_order, question_text, question_type, max_marks, model_answer, model_answer_status, created_at"
    )
    .eq("exam_id", examId)
    .order("question_order", { ascending: true })

  if (questionsError) {
    throw new Error(questionsError.message)
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
          <strong>Total Marks:</strong> {exam.total_marks}
        </p>

        <p>
          <strong>Created:</strong>{" "}
          {new Date(exam.created_at).toLocaleString()}
        </p>
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

            <div style={{ marginBottom: "16px" }}>
              <label>Max Marks *</label>
              <br />
              <input
                name="maxMarks"
                type="number"
                min="0"
                step="0.01"
                required
                placeholder="Example: 10"
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
                  <strong>Max Marks:</strong> {question.max_marks}
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

                <p style={{ marginTop: "12px" }}>
                  Next: add rubric criteria later.
                </p>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}