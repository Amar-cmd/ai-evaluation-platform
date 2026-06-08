import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { ROUTES } from "@/lib/routes"

export default async function DashboardRedirectPage() {
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
    .select("role")
    .eq("id", user.id)
    .single()

  if (profileError || !profile) {
    throw new Error("Profile not found.")
  }

  if (profile.role === "admin") {
    redirect(ROUTES.ADMIN.DASHBOARD)
  }

  if (profile.role === "professor") {
    redirect(ROUTES.PROFESSOR.DASHBOARD)
  }

  redirect(ROUTES.STUDENT.DASHBOARD)
}