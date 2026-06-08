import { requireProfessorOrAdmin } from "@/lib/auth"
import { LogoutButton } from "@/components/logout-button"

export default async function ProfessorDashboardPage() {
  const { profile } = await requireProfessorOrAdmin()

  return (
    <main style={{ padding: "40px" }}>
      <h1>Professor Dashboard</h1>

      <p>
        Welcome, <strong>{profile.full_name || profile.email}</strong>
      </p>

      <p>
        Role: <strong>{profile.role}</strong>
      </p>

      <section style={{ marginTop: "32px" }}>
        <h2>Coming Next</h2>

        <ol>
          <li>Create exam session</li>
          <li>Add/upload questions</li>
          <li>Upload student answer CSV/JSON</li>
          <li>Map response columns to questions</li>
        </ol>
      </section>

      <LogoutButton />
    </main>
  )
}