import Link from "next/link";
import { notFound } from "next/navigation";
import { saveResponseColumnMapping } from "@/features/exams/actions";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ROUTES } from "@/lib/routes";
import { formatMarks } from "@/lib/marks";

type MappingPageProps = {
  params: Promise<{
    examId: string;
    uploadId: string;
  }>;
};

type RawPreviewRow = Record<string, unknown>;

function getMappingValue(
  mappingConfig: unknown,
  responseColumn: string,
): string {
  if (
    mappingConfig &&
    typeof mappingConfig === "object" &&
    !Array.isArray(mappingConfig)
  ) {
    const value = (mappingConfig as Record<string, unknown>)[responseColumn];

    if (typeof value === "string") {
      return value;
    }
  }

  return "";
}

function getSampleValue(rawPreview: unknown, responseColumn: string) {
  if (!Array.isArray(rawPreview)) {
    return "";
  }

  const rows = rawPreview as RawPreviewRow[];

  for (const row of rows) {
    const value = row[responseColumn];

    if (value === null || value === undefined) {
      continue;
    }

    const text = typeof value === "string" ? value : JSON.stringify(value);

    if (text.trim()) {
      return text.trim().slice(0, 250);
    }
  }

  return "";
}

export default async function UploadMappingPage({ params }: MappingPageProps) {
  const { examId, uploadId } = await params;

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

  const { data: upload, error: uploadError } = await supabase
    .from("answer_uploads")
    .select(
      "id, exam_id, file_name, file_type, total_rows, detected_columns, response_columns, raw_preview, mapping_config, status, error_message, created_at",
    )
    .eq("id", uploadId)
    .eq("exam_id", examId)
    .single();

  if (uploadError || !upload) {
    notFound();
  }

  const { data: questions, error: questionsError } = await supabase
    .from("questions")
    .select("id, question_no, question_order, question_text, max_marks")
    .eq("exam_id", examId)
    .order("question_order", { ascending: true });

  if (questionsError) {
    throw new Error(questionsError.message);
  }

  const responseColumns: string[] = Array.isArray(upload.response_columns)
    ? upload.response_columns
    : [];
  return (
    <main style={{ padding: "40px", maxWidth: "1000px" }}>
      <p>
        <Link href={ROUTES.PROFESSOR.EXAM_DETAIL(exam.id)}>
          Back to Exam Detail
        </Link>
      </p>

      <h1>Map Response Columns</h1>

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
          <strong>Exam Status:</strong> {exam.status}
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
      </section>

      <section
        style={{
          border: "1px solid #ddd",
          borderRadius: "8px",
          padding: "16px",
          marginBottom: "32px",
        }}
      >
        <h2>Uploaded File</h2>

        <p>
          <strong>File:</strong> {upload.file_name}
        </p>

        <p>
          <strong>Status:</strong> {upload.status}
        </p>

        <p>
          <strong>Total Rows:</strong> {upload.total_rows}
        </p>

        <p>
          <strong>Response Columns:</strong>{" "}
          {responseColumns.length > 0
            ? responseColumns.join(", ")
            : "None detected"}
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
      </section>

      {upload.status === "parse_failed" ? (
        <section
          style={{
            border: "1px solid #ddd",
            borderRadius: "8px",
            padding: "16px",
          }}
        >
          <h2>Mapping unavailable</h2>
          <p>This upload failed parsing. Please upload a valid JSON file.</p>
        </section>
      ) : responseColumns.length === 0 ? (
        <section
          style={{
            border: "1px solid #ddd",
            borderRadius: "8px",
            padding: "16px",
          }}
        >
          <h2>No response columns detected</h2>
          <p>
            The uploaded file does not contain columns like response1,
            response2, response6, response7.
          </p>
        </section>
      ) : questions.length === 0 ? (
        <section
          style={{
            border: "1px solid #ddd",
            borderRadius: "8px",
            padding: "16px",
          }}
        >
          <h2>No questions found</h2>
          <p>Please add questions before mapping response columns.</p>
        </section>
      ) : (
        <section
          style={{
            border: "1px solid #ddd",
            borderRadius: "8px",
            padding: "16px",
          }}
        >
          <h2>Column to Question Mapping</h2>

          <p>
            Select which question each uploaded response column belongs to. You
            can leave irrelevant response columns as “Ignore”.
          </p>

          <form action={saveResponseColumnMapping}>
            <input type="hidden" name="examId" value={exam.id} />
            <input type="hidden" name="uploadId" value={upload.id} />

            <div style={{ display: "grid", gap: "16px", marginTop: "24px" }}>
              {responseColumns.map((responseColumn) => {
                const currentValue = getMappingValue(
                  upload.mapping_config,
                  responseColumn,
                );

                const sampleValue = getSampleValue(
                  upload.raw_preview,
                  responseColumn,
                );

                return (
                  <article
                    key={responseColumn}
                    style={{
                      border: "1px solid #eee",
                      borderRadius: "6px",
                      padding: "12px",
                    }}
                  >
                    <h3>{responseColumn}</h3>

                    {sampleValue ? (
                      <p>
                        <strong>Sample:</strong> {sampleValue}
                        {sampleValue.length >= 250 ? "..." : ""}
                      </p>
                    ) : (
                      <p>No sample answer found in preview.</p>
                    )}

                    <label>
                      Map to question
                      <br />
                      <select
                        name={`map_${responseColumn}`}
                        defaultValue={currentValue}
                        style={{
                          width: "100%",
                          padding: "8px",
                          marginTop: "8px",
                        }}
                      >
                        <option value="">Ignore this column</option>

                        {questions.map((question) => (
                          <option key={question.id} value={question.id}>
                            {question.question_no} —{" "}
                            {formatMarks(question.max_marks)} marks
                          </option>
                        ))}
                      </select>
                    </label>
                  </article>
                );
              })}
            </div>

            <button type="submit" style={{ marginTop: "24px" }}>
              Save Mapping
            </button>
          </form>
        </section>
      )}
    </main>
  );
}
