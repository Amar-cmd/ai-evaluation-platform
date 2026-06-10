import Link from "next/link"
import { LogoutButton } from "@/components/logout-button"
import { requireStudent } from "@/lib/auth"
import { ROUTES } from "@/lib/routes"

export default async function StudentDashboardPage() {
  const { profile } = await requireStudent()

  return (
    <main style={{ padding: "40px" }}>
      <h1>Student Dashboard</h1>

      <p>Welcome, {profile.full_name || profile.email}</p>

      <nav style={{ display: "grid", gap: "12px", marginTop: "24px" }}>
        <Link href={ROUTES.STUDENT.RESULTS}>View My Results</Link>
      </nav>

      <div style={{ marginTop: "24px" }}>
        <LogoutButton />
      </div>
    </main>
  )
}