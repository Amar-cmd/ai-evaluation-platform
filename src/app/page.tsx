import { APP_NAME } from "@/lib/constants"
import { ROUTES } from "@/lib/routes"

export default function HomePage() {
  return (
    <main style={{ padding: "40px", maxWidth: "900px" }}>
      <h1>{APP_NAME}</h1>

      <p>
        Professor-controlled AI-assisted subjective answer evaluation system.
      </p>

      <section style={{ marginTop: "32px" }}>
        <h2>Core Workflow</h2>

        <ol>
          <li>Professor creates an exam session.</li>
          <li>Professor uploads questions.</li>
          <li>Professor uploads student answer CSV/JSON.</li>
          <li>System detects response columns.</li>
          <li>Professor maps response columns to questions.</li>
          <li>Professor approves model answer and rubric.</li>
          <li>AI evaluates student answers.</li>
          <li>Professor reviews and approves marks.</li>
          <li>Published results become visible to students.</li>
          <li>Students can raise flags or objections.</li>
        </ol>
      </section>

      <section style={{ marginTop: "32px" }}>
        <h2>Planned Entry Points</h2>

        <ul>
          <li>Professor Login: {ROUTES.AUTH.LOGIN}</li>
          <li>Professor Dashboard: {ROUTES.PROFESSOR.DASHBOARD}</li>
          <li>Student Dashboard: {ROUTES.STUDENT.DASHBOARD}</li>
          <li>Admin Dashboard: {ROUTES.ADMIN.DASHBOARD}</li>
        </ul>
      </section>
    </main>
  )
}