"use client"

import { FormEvent, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { ROUTES } from "@/lib/routes"

export default function SignupPage() {
  const router = useRouter()
  const supabase = createClient()

  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [message, setMessage] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleSignup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    setLoading(true)
    setMessage("")

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
        },
      },
    })

    setLoading(false)

    if (error) {
      setMessage(error.message)
      return
    }

    if (data.user) {
      setMessage("Account created. Please login.")
      router.push(ROUTES.AUTH.LOGIN)
    }
  }

  return (
    <main style={{ padding: "40px", maxWidth: "420px" }}>
      <h1>Signup</h1>

      <form onSubmit={handleSignup}>
        <div style={{ marginBottom: "12px" }}>
          <label>Full Name</label>
          <br />
          <input
            type="text"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            required
            style={{ width: "100%", padding: "8px" }}
          />
        </div>

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
            minLength={6}
            style={{ width: "100%", padding: "8px" }}
          />
        </div>

        <button type="submit" disabled={loading}>
          {loading ? "Creating account..." : "Create Account"}
        </button>
      </form>

      {message && <p>{message}</p>}

      <p>
        Already have an account? <a href={ROUTES.AUTH.LOGIN}>Login</a>
      </p>
    </main>
  )
}