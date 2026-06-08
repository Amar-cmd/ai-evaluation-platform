import { requireProfile } from "@/lib/auth"
import { LogoutButton } from "@/components/logout-button"

export default async function StudentDashboardPage() {
  const { profile } = await requireProfile()

  return (
    <main style={{ padding: "40px" }}>
      <h1>Student Dashboard</h1>

      <p>
        Welcome, <strong>{profile.full_name || profile.email}</strong>
      </p>

      <p>
        Role: <strong>{profile.role}</strong>
      </p>

      <section style={{ marginTop: "32px" }}>
        <h2>Coming Later</h2>

        <ol>
          <li>View published results</li>
          <li>View question-wise justification</li>
          <li>Raise flag or objection</li>
          <li>View professor reply</li>
        </ol>
      </section>

      <LogoutButton />
    </main>
  )
}