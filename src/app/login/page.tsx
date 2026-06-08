import { LoginForm } from "./login-form"

type LoginPageProps = {
  searchParams: Promise<{
    redirectedFrom?: string
  }>
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams

  return <LoginForm redirectedFrom={params.redirectedFrom || ""} />
}