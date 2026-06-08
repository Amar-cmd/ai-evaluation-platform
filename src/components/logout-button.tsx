"use client"

import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { ROUTES } from "@/lib/routes"

export function LogoutButton() {
  const router = useRouter()
  const supabase = createClient()

  async function handleLogout() {
    await supabase.auth.signOut()

    router.push(ROUTES.AUTH.LOGIN)
    router.refresh()
  }

  return <button onClick={handleLogout}>Logout</button>
}