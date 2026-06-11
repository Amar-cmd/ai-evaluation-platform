import Link from "next/link"
import { notFound } from "next/navigation"
import { createRubricTemplate } from "@/features/rubrics/actions"
import { requireProfessorOrAdmin } from "@/lib/auth"
import { formatMarks } from "@/lib/marks"
import { ROUTES } from "@/lib/routes"
import { createClient } from "@/lib/supabase/server"

type RubricTemplatesPageProps = {
  params: Promise<{
    examId: string
  }>
}

type RubricTemplateCriterion = {
  id: string
  criterion_order: number
  criterion_name: string
  criterion_description: string | null
  max_marks: number | string
}

type RubricTemplate = {
  id: string
  template_name: string
  applies_to_question_type: string | null
  question_category: string | null
  total_marks: number | string
  description: string | null
  is_active: boolean
  created_at: string
  rubric_template_criteria: RubricTemplateCriterion[]
}

export default async function RubricTemplatesPage({
  params,
}: RubricTemplatesPageProps) {
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

  const { data: templates, error: templatesError } = await supabase
    .from("rubric_templates")
    .select(
      `
      id,
      template_name,
      applies_to_question_type,
      question_category,
      total_marks,
      description,
      is_active,
      created_at,
      rubric_template_criteria (
        id,
        criterion_order,
        criterion_name,
        criterion_description,
        max_marks
      )
    `
    )
    .eq("exam_id", examId)
    .order("created_at", { ascending: false })

  if (templatesError) {
    throw new Error(templatesError.message)
  }

  const rubricTemplates = (templates || []) as RubricTemplate[]

  return (
    <main style={{ padding: "40px" }}>
      <p>
        <Link href={ROUTES.PROFESSOR.EXAM_DETAIL(exam.id)}>
          ← Back to exam
        </Link>
      </p>

      <h1>Rubric Templates</h1>

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
          <strong>Status:</strong> {exam.status}
        </p>

        <p>
          Use this page to create reusable rubric templates like Case Based,
          Long Answer, or Essay. Later, these templates will be applied to
          matching questions.
        </p>
      </section>

      {profile.role === "professor" &&
        exam.status !== "published" &&
        exam.status !== "archived" && (
          <section
            style={{
              border: "1px solid #ddd",
              borderRadius: "8px",
              padding: "16px",
              marginBottom: "24px",
            }}
          >
            <h2>Create Rubric Template</h2>

            <form action={createRubricTemplate}>
              <input type="hidden" name="examId" value={exam.id} />

              <div style={{ marginBottom: "12px" }}>
                <label>Template Name *</label>
                <br />
                <input
                  name="templateName"
                  type="text"
                  required
                  placeholder="Example: Case Based 15 Marks"
                  style={{ width: "100%", padding: "8px" }}
                />
              </div>

              <div style={{ marginBottom: "12px" }}>
                <label>Applies To Question Type</label>
                <br />
                <select
                  name="appliesToQuestionType"
                  defaultValue=""
                  style={{ width: "100%", padding: "8px" }}
                >
                  <option value="">Not fixed</option>
                  <option value="short_answer">Short Answer</option>
                  <option value="long_answer">Long Answer</option>
                  <option value="case_based">Case Based</option>
                  <option value="essay">Essay</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div style={{ marginBottom: "12px" }}>
                <label>Question Category</label>
                <br />
                <input
                  name="questionCategory"
                  type="text"
                  placeholder="Example: conceptual, analytical, case_based"
                  style={{ width: "100%", padding: "8px" }}
                />
              </div>

              <div style={{ marginBottom: "12px" }}>
                <label>Total Marks *</label>
                <br />
                <input
                  name="totalMarks"
                  type="text"
                  inputMode="decimal"
                  pattern="[0-9]+([.][0-9]{1,2})?"
                  required
                  placeholder="Example: 10 or 15.00"
                  style={{ width: "100%", padding: "8px" }}
                />
              </div>

              <div style={{ marginBottom: "12px" }}>
                <label>Description</label>
                <br />
                <textarea
                  name="description"
                  rows={3}
                  placeholder="Optional note for professor"
                  style={{ width: "100%", padding: "8px" }}
                />
              </div>

              <h3>Criteria</h3>

              <p style={{ color: "#555" }}>
                Add criteria rows. Blank rows will be ignored. The total of all
                criteria marks must equal template total marks.
              </p>

              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  marginBottom: "16px",
                }}
              >
                <thead>
                  <tr>
                    <th style={tableHeaderStyle}>#</th>
                    <th style={tableHeaderStyle}>Criterion Name</th>
                    <th style={tableHeaderStyle}>Description</th>
                    <th style={tableHeaderStyle}>Marks</th>
                  </tr>
                </thead>

                <tbody>
                  {Array.from({ length: 6 }).map((_, index) => {
                    const rowNumber = index + 1

                    return (
                      <tr key={rowNumber}>
                        <td style={tableCellStyle}>{rowNumber}</td>

                        <td style={tableCellStyle}>
                          <input
                            name={`criterionName_${rowNumber}`}
                            type="text"
                            placeholder="Example: Concept clarity"
                            style={{ width: "100%", padding: "6px" }}
                          />
                        </td>

                        <td style={tableCellStyle}>
                          <textarea
                            name={`criterionDescription_${rowNumber}`}
                            rows={2}
                            placeholder="Explain this criterion"
                            style={{ width: "100%", padding: "6px" }}
                          />
                        </td>

                        <td style={tableCellStyle}>
                          <input
                            name={`criterionMarks_${rowNumber}`}
                            type="text"
                            inputMode="decimal"
                            pattern="[0-9]+([.][0-9]{1,2})?"
                            placeholder="0"
                            style={{ width: "90px", padding: "6px" }}
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>

              <button type="submit">Create Rubric Template</button>
            </form>
          </section>
        )}

      <section>
        <h2>Existing Templates</h2>

        {rubricTemplates.length === 0 ? (
          <p>No rubric templates created yet.</p>
        ) : (
          <div style={{ display: "grid", gap: "16px" }}>
            {rubricTemplates.map((template) => {
              const sortedCriteria = [
                ...(template.rubric_template_criteria || []),
              ].sort((a, b) => a.criterion_order - b.criterion_order)

              const criteriaTotal = sortedCriteria.reduce((total, criterion) => {
                return total + Number(criterion.max_marks)
              }, 0)

              return (
                <article
                  key={template.id}
                  style={{
                    border: "1px solid #ddd",
                    borderRadius: "8px",
                    padding: "16px",
                  }}
                >
                  <h3 style={{ marginTop: 0 }}>{template.template_name}</h3>

                  <p>
                    <strong>Total Marks:</strong>{" "}
                    {formatMarks(template.total_marks)}
                  </p>

                  <p>
                    <strong>Criteria Total:</strong>{" "}
                    {formatMarks(criteriaTotal)}
                  </p>

                  <p>
                    <strong>Question Type:</strong>{" "}
                    {template.applies_to_question_type || "-"}
                  </p>

                  <p>
                    <strong>Category:</strong>{" "}
                    {template.question_category || "-"}
                  </p>

                  <p>
                    <strong>Status:</strong>{" "}
                    {template.is_active ? "Active" : "Inactive"}
                  </p>

                  {template.description && <p>{template.description}</p>}

                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      marginTop: "12px",
                    }}
                  >
                    <thead>
                      <tr>
                        <th style={tableHeaderStyle}>Order</th>
                        <th style={tableHeaderStyle}>Criterion</th>
                        <th style={tableHeaderStyle}>Description</th>
                        <th style={tableHeaderStyle}>Marks</th>
                      </tr>
                    </thead>

                    <tbody>
                      {sortedCriteria.map((criterion) => (
                        <tr key={criterion.id}>
                          <td style={tableCellStyle}>
                            {criterion.criterion_order}
                          </td>

                          <td style={tableCellStyle}>
                            {criterion.criterion_name}
                          </td>

                          <td style={tableCellStyle}>
                            {criterion.criterion_description || "-"}
                          </td>

                          <td style={tableCellStyle}>
                            {formatMarks(criterion.max_marks)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </article>
              )
            })}
          </div>
        )}
      </section>
    </main>
  )
}

const tableHeaderStyle = {
  borderBottom: "1px solid #ddd",
  padding: "8px",
  textAlign: "left" as const,
}

const tableCellStyle = {
  borderBottom: "1px solid #eee",
  padding: "8px",
  verticalAlign: "top" as const,
}