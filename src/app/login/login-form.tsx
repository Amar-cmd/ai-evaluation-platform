"use client"

import { FormEvent, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { ROUTES } from "@/lib/routes"

type LoginFormProps = {
  redirectedFrom: string
}

function getSafeRedirectPath(path: string) {
  if (!path) {
    return "/dashboard"
  }

  if (!path.startsWith("/")) {
    return "/dashboard"
  }

  if (path.startsWith("//")) {
    return "/dashboard"
  }

  const allowedPrefixes = [
    "/dashboard",
    "/professor",
    "/student",
    "/admin",
  ]

  const isAllowedPath = allowedPrefixes.some((prefix) =>
    path.startsWith(prefix)
  )

  if (!isAllowedPath) {
    return "/dashboard"
  }

  return path
}

export function LoginForm({ redirectedFrom }: LoginFormProps) {
  const router = useRouter()
  const supabase = createClient()

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [message, setMessage] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    setLoading(true)
    setMessage("")

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    setLoading(false)

    if (error) {
      setMessage(error.message)
      return
    }

    const safeRedirectPath = getSafeRedirectPath(redirectedFrom)

    router.push(safeRedirectPath)
    router.refresh()
  }

  return (
    <main style={{ padding: "40px", maxWidth: "420px" }}>
      <h1>Login</h1>

      {redirectedFrom && (
        <p style={{ marginBottom: "16px" }}>
          Please login to continue to: <strong>{redirectedFrom}</strong>
        </p>
      )}

      <form onSubmit={handleLogin}>
        <div style={{ marginBottom: "12px" }}>
          <label>Email</label>
          <br />
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            style={{ width: "100%", padding: "8px" }}
          />
        </div>

        <div style={{ marginBottom: "12px" }}>
          <label>Password</label>
          <br />
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            style={{ width: "100%", padding: "8px" }}
          />
        </div>

        <button type="submit" disabled={loading}>
          {loading ? "Logging in..." : "Login"}
        </button>
      </form>

      {message && <p>{message}</p>}

      <p>
        New user? <a href={ROUTES.AUTH.SIGNUP}>Create account</a>
      </p>
    </main>
  )
}