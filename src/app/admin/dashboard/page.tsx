import { requireAdmin } from "@/lib/auth"
import { LogoutButton } from "@/components/logout-button"

export default async function AdminDashboardPage() {
  const { profile } = await requireAdmin()

  return (
    <main style={{ padding: "40px" }}>
      <h1>Admin Dashboard</h1>

      <p>
        Welcome, <strong>{profile.full_name || profile.email}</strong>
      </p>

      <p>
        Role: <strong>{profile.role}</strong>
      </p>

      <section style={{ marginTop: "32px" }}>
        <h2>Coming Later</h2>

        <ol>
          <li>Manage professors</li>
          <li>Manage students</li>
          <li>View failed AI jobs</li>
          <li>View system logs</li>
        </ol>
      </section>

      <LogoutButton />
    </main>
  )
}