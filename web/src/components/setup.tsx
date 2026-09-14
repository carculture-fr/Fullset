import { useState, type FormEvent } from "react"

import { AuthFrame, authButton, authField } from "@/components/login"
import { ApiError, send } from "@/lib/api"

const PASSWORD_MIN = 10

/** Premier lancement : tant qu'aucun compte n'existe, toute l'appli mène ici. */
export function Setup({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState({ username: "", display_name: "", password: "", confirm: "" })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: e.target.value })

  const problem =
    form.password && form.password.length < PASSWORD_MIN
      ? `Mot de passe : ${PASSWORD_MIN} caractères au moins.`
      : form.confirm && form.confirm !== form.password
        ? "Les deux mots de passe ne sont pas identiques."
        : null

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await send("POST", "/api/setup", { username: form.username, display_name: form.display_name, password: form.password })
      onDone()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Serveur injoignable.")
      setBusy(false)
    }
  }

  return (
    <AuthFrame title="Bienvenue dans Fullset">
      <p className="text-sm text-muted-foreground">Crée le compte de cette installation. Il n'y en a qu'un : une fois créé, l'inscription se ferme.</p>
      <form onSubmit={submit} className="space-y-3">
        <input className={authField} placeholder="Identifiant" autoComplete="username" autoCapitalize="none" value={form.username} onChange={set("username")} />
        <input className={authField} placeholder="Nom affiché (facultatif)" autoComplete="nickname" value={form.display_name} onChange={set("display_name")} />
        <input className={authField} type="password" placeholder={`Mot de passe (${PASSWORD_MIN} caractères au moins)`} autoComplete="new-password" value={form.password} onChange={set("password")} />
        <input className={authField} type="password" placeholder="Confirme le mot de passe" autoComplete="new-password" value={form.confirm} onChange={set("confirm")} />
        {(problem || error) && <p className="text-sm text-destructive">{problem ?? error}</p>}
        <button disabled={busy || !form.username || form.password.length < PASSWORD_MIN || form.confirm !== form.password} className={authButton}>
          {busy ? "Création…" : "Créer mon compte"}
        </button>
      </form>
    </AuthFrame>
  )
}
