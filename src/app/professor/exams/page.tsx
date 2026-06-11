import Link from "next/link";
import { requireProfessorOrAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ROUTES } from "@/lib/routes";

export default async function ProfessorExamsPage() {
  const { profile } = await requireProfessorOrAdmin();

  const supabase = await createClient();

  const { data: exams, error } = await supabase
    .from("exams")
    .select(
      "id, title, subject, course, batch, total_marks, exam_mode, status, published_at, created_at",
    )
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (
    <main style={{ padding: "40px", maxWidth: "1000px" }}>
      <h1>My Exams</h1>

      <p>
        Logged in as: <strong>{profile.full_name || profile.email}</strong>
      </p>

      <div style={{ marginTop: "24px", marginBottom: "32px" }}>
        <Link href={ROUTES.PROFESSOR.DASHBOARD}>Professor Dashboard</Link>

        {profile.role === "professor" && (
          <>
            {" | "}
            <Link href={ROUTES.PROFESSOR.NEW_EXAM}>Create New Exam</Link>
          </>
        )}
      </div>

      {exams.length === 0 ? (
        <section
          style={{
            border: "1px solid #ddd",
            padding: "24px",
            borderRadius: "8px",
          }}
        >
          <h2>No exams yet</h2>

          <p>Create your first exam/evaluation session.</p>

          {profile.role === "professor" && (
            <p>
              <Link href={ROUTES.PROFESSOR.NEW_EXAM}>Create New Exam</Link>
            </p>
          )}
        </section>
      ) : (
        <section>
          <h2>Exam List</h2>

          <div style={{ display: "grid", gap: "16px" }}>
            {exams.map((exam) => (
              <article
                key={exam.id}
                style={{
                  border: "1px solid #ddd",
                  borderRadius: "8px",
                  padding: "16px",
                }}
              >
                <h3>{exam.title}</h3>

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
                  <strong>Mode:</strong> {exam.exam_mode}
                </p>

                <p>
                  <strong>Created:</strong>{" "}
                  {new Date(exam.created_at).toLocaleString()}
                </p>

                <p style={{ marginTop: "12px" }}>
                  <Link href={ROUTES.PROFESSOR.EXAM_DETAIL(exam.id)}>
                    Open Exam
                  </Link>
                </p>
              </article>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
