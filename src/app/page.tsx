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
        <h2>Start</h2>

        <p>
          <a href={ROUTES.AUTH.LOGIN}>Login</a>
        </p>

        <p>
          <a href={ROUTES.AUTH.SIGNUP}>Signup</a>
        </p>
      </section>

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
    </main>
  )
}