import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { LogoutButton } from "@/components/logout-button"
import { ROUTES } from "@/lib/routes"

export default async function StudentDashboardPage() {
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