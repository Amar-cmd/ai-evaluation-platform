import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { ROUTES } from "@/lib/routes"

export type AppRole = "admin" | "professor" | "student"

export type CurrentProfile = {
  id: string
  full_name: string | null
  email: string
  role: AppRole
}

export async function getCurrentUser() {
  const supabase = await createClient()

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    return null
  }

  return user
}

export async function requireUser() {
  const user = await getCurrentUser()

  if (!user) {
    redirect(ROUTES.AUTH.LOGIN)
  }

  return user
}

export async function getCurrentProfile() {
  const supabase = await createClient()

  const user = await getCurrentUser()

  if (!user) {
    return null
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, role")
    .eq("id", user.id)
    .single()

  if (error || !profile) {
    return null
  }

  return profile as CurrentProfile
}

export async function requireProfile() {
  const user = await requireUser()

  const profile = await getCurrentProfile()

  if (!profile) {
    throw new Error("Profile not found.")
  }

  return { user, profile }
}

export async function requireRole(allowedRoles: AppRole[]) {
  const { user, profile } = await requireProfile()

  if (!allowedRoles.includes(profile.role)) {
    redirectByRole(profile.role)
  }

  return { user, profile }
}

export async function requireProfessorOrAdmin() {
  return requireRole(["professor", "admin"])
}

export async function requireAdmin() {
  return requireRole(["admin"])
}

export async function requireStudent() {
  return requireRole(["student"])
}

export function getDashboardRouteByRole(role: AppRole) {
  if (role === "admin") {
    return ROUTES.ADMIN.DASHBOARD
  }

  if (role === "professor") {
    return ROUTES.PROFESSOR.DASHBOARD
  }

  return ROUTES.STUDENT.DASHBOARD
}

export function redirectByRole(role: AppRole) {
  redirect(getDashboardRouteByRole(role))
}