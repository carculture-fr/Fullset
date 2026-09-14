import { useState, type FormEvent, type ReactNode } from "react"

import { ThemeToggle } from "@/components/theme-toggle"
import { ApiError, send } from "@/lib/api"

export const authField = "w-full rounded-lg border border-border bg-muted px-3 py-2.5 outline-none focus:border-primary"
export const authButton = "w-full rounded-lg bg-primary py-2.5 font-medium text-primary-foreground disabled:opacity-50"

/** Cadre commun à la connexion et à l'assistant de premier lancement. */
export function AuthFrame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-8">
      <div className="fixed top-3 right-3">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm space-y-4 rounded-lg bg-card p-6">
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <img src="/icon.svg" alt="" className="size-8" />
          {title}
        </h1>
        {children}
      </div>
    </main>
  )
}

export function Login({ onDone }: { onDone: () => void }) {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await send("POST", "/api/auth/login", { username, password })
      onDone()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Serveur injoignable.")
      setBusy(false)
    }
  }

  return (
    <AuthFrame title="Fullset">
      <form onSubmit={submit} className="space-y-3">
        <input className={authField} placeholder="Identifiant" autoComplete="username" autoCapitalize="none" value={username} onChange={(e) => setUsername(e.target.value)} />
        <input className={authField} type="password" placeholder="Mot de passe" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <button disabled={busy || !username || !password} className={authButton}>
          {busy ? "Connexion…" : "Se connecter"}
        </button>
        <p className="text-xs text-muted-foreground">
          Mot de passe oublié : sur le serveur, lance <code className="rounded bg-muted px-1">docker exec fullset node server/dist/cli/reset-password.js</code>.
        </p>
      </form>
    </AuthFrame>
  )
}
