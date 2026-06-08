import { redirectByRole, requireProfile } from "@/lib/auth"

export default async function DashboardRedirectPage() {
  const { profile } = await requireProfile()

  redirectByRole(profile.role)
}