import Link from "next/link";
import { notFound } from "next/navigation";
import { uploadAnswerJson } from "@/features/exams/actions";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ROUTES } from "@/lib/routes";

type NewAnswerUploadPageProps = {
  params: Promise<{
    examId: string;
  }>;
};

export default async function NewAnswerUploadPage({
  params,
}: NewAnswerUploadPageProps) {
  const { examId } = await params;

  await requireRole(["professor"]);

  const supabase = await createClient();

  const { data: exam, error: examError } = await supabase
    .from("exams")
    .select("id, title, subject, course, batch, status")
    .eq("id", examId)
    .single();

  if (examError || !exam) {
    notFound();
  }

  const { count: questionCount, error: questionCountError } = await supabase
    .from("questions")
    .select("id", { count: "exact", head: true })
    .eq("exam_id", examId);

  if (questionCountError) {
    throw new Error(questionCountError.message);
  }

  return (
    <main style={{ padding: "40px", maxWidth: "800px" }}>
      <p>
        <Link href={ROUTES.PROFESSOR.EXAM_DETAIL(exam.id)}>
          Back to Exam Detail
        </Link>
      </p>

      <h1>Upload Student Answers</h1>

      <section
        style={{
          border: "1px solid #ddd",
          borderRadius: "8px",
          padding: "16px",
          marginBottom: "32px",
        }}
      >
        <h2>{exam.title}</h2>

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
          <strong>Questions added:</strong> {questionCount || 0}
        </p>
      </section>

      {questionCount === 0 ? (
        <section
          style={{
            border: "1px solid #ddd",
            borderRadius: "8px",
            padding: "16px",
          }}
        >
          <h2>Questions required</h2>

          <p>
            Please add questions before uploading student answers. Mapping
            response columns to questions requires at least one question.
          </p>

          <p>
            <Link href={ROUTES.PROFESSOR.EXAM_DETAIL(exam.id)}>
              Go back and add questions
            </Link>
          </p>
        </section>
      ) : (
        <section
          style={{
            border: "1px solid #ddd",
            borderRadius: "8px",
            padding: "16px",
          }}
        >
          <h2>Upload JSON File</h2>

          <p>
            Upload the JSON file containing student answer rows. The system will
            detect columns like <strong>firstname</strong>,{" "}
            <strong>lastname</strong>, <strong>idnumber</strong>,{" "}
            <strong>emailaddress</strong>, and response columns like{" "}
            <strong>response1</strong>, <strong>response6</strong>,{" "}
            <strong>response7</strong>.
          </p>

          <form action={uploadAnswerJson} style={{ marginTop: "24px" }}>
            <input type="hidden" name="examId" value={exam.id} />

            <div style={{ marginBottom: "16px" }}>
              <label>Student Answer JSON File *</label>
              <br />
              <input name="answerFile" type="file" accept=".json" required />
            </div>

            <button type="submit">Upload and Parse JSON</button>
          </form>
        </section>
      )}
    </main>
  );
}
