import Link from "next/link";
import { createExam } from "@/features/exams/actions";
import { requireRole } from "@/lib/auth";
import { ROUTES } from "@/lib/routes";

export default async function NewExamPage() {
  const { profile } = await requireRole(["professor"]);

  return (
    <main style={{ padding: "40px", maxWidth: "700px" }}>
      <h1>Create New Exam</h1>

      <p>
        Creating as: <strong>{profile.full_name || profile.email}</strong>
      </p>

      <p>
        <Link href={ROUTES.PROFESSOR.EXAMS}>Back to My Exams</Link>
      </p>

      <form action={createExam} style={{ marginTop: "32px" }}>
        <div style={{ marginBottom: "16px" }}>
          <label>Exam Title *</label>
          <br />
          <input
            name="title"
            required
            placeholder="Example: Marketing Mid Term Evaluation"
            style={{ width: "100%", padding: "8px" }}
          />
        </div>

        <div style={{ marginBottom: "16px" }}>
          <label>Subject</label>
          <br />
          <input
            name="subject"
            placeholder="Example: Marketing Management"
            style={{ width: "100%", padding: "8px" }}
          />
        </div>

        <div style={{ marginBottom: "16px" }}>
          <label>Course</label>
          <br />
          <input
            name="course"
            placeholder="Example: PGDM / BBA / MBA"
            style={{ width: "100%", padding: "8px" }}
          />
        </div>

        <div style={{ marginBottom: "16px" }}>
          <label>Batch</label>
          <br />
          <input
            name="batch"
            placeholder="Example: 2025-27 Section A"
            style={{ width: "100%", padding: "8px" }}
          />
        </div>

        <div style={{ marginBottom: "16px" }}>
          <label>Total Marks</label>
          <br />
          <input
            name="totalMarks"
            type="text"
            inputMode="decimal"
            pattern="[0-9]+([.][0-9]{1,2})?"
            defaultValue="0"
            placeholder="Example: 10 or 10.50"
            style={{ width: "100%", padding: "8px" }}
          />
        </div>

        <button type="submit">Create Exam</button>
      </form>
    </main>
  );
}
