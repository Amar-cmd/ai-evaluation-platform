import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { LogoutButton } from "@/components/logout-button"
import { ROUTES } from "@/lib/routes"

export default async function ProfessorDashboardPage() {
  const supabase = await createClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    redirect(ROUTES.AUTH.LOGIN)
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("full_name, email, role")
    .eq("id", user.id)
    .single()

  if (profileError || !profile) {
    throw new Error("Profile not found.")
  }

  if (profile.role !== "professor" && profile.role !== "admin") {
    redirect(ROUTES.STUDENT.DASHBOARD)
  }

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