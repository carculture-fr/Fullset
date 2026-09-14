import { useState, type FormEvent } from "react"
import { useTranslation } from "react-i18next"

import { AuthFrame, authButton, authField } from "@/components/login"
import { ServicesForm } from "@/components/services-form"
import { ApiError, send } from "@/lib/api"
import { storedLanguage } from "@/lib/i18n"

const PASSWORD_MIN = 10

/** Premier lancement : tant qu'aucun compte n'existe, toute l'appli mène ici. Puis les services, facultatifs. */
export function Setup({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation()
  const [step, setStep] = useState<"account" | "services">("account")
  const [form, setForm] = useState({ username: "", display_name: "", password: "", confirm: "" })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: e.target.value })

  const problem =
    form.password && form.password.length < PASSWORD_MIN
      ? t("setup.passwordMin", { min: PASSWORD_MIN })
      : form.confirm && form.confirm !== form.password
        ? t("setup.mismatch")
        : null

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await send("POST", "/api/setup", { username: form.username, display_name: form.display_name, password: form.password })
      // Langue choisie à l'écran d'accueil : elle devient celle du compte (sinon « auto »).
      const chosen = storedLanguage()
      if (chosen) await send("PUT", "/api/preferences", { language: chosen }).catch(() => {})
      setStep("services")
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("common.serverUnreachable"))
    } finally {
      setBusy(false)
    }
  }

  if (step === "services") {
    return (
      <AuthFrame title={t("setup.servicesTitle")}>
        <p className="text-sm text-muted-foreground">{t("setup.servicesIntro")}</p>
        <ServicesForm />
        <button onClick={onDone} className={authButton}>
          {t("setup.finish")}
        </button>
      </AuthFrame>
    )
  }

  return (
    <AuthFrame title={t("setup.welcome")}>
      <p className="text-sm text-muted-foreground">{t("setup.intro")}</p>
      <form onSubmit={submit} className="space-y-3">
        <input className={authField} placeholder={t("auth.username")} autoComplete="username" autoCapitalize="none" value={form.username} onChange={set("username")} />
        <input className={authField} placeholder={t("setup.displayName")} autoComplete="nickname" value={form.display_name} onChange={set("display_name")} />
        <input className={authField} type="password" placeholder={t("setup.password", { min: PASSWORD_MIN })} autoComplete="new-password" value={form.password} onChange={set("password")} />
        <input className={authField} type="password" placeholder={t("setup.confirm")} autoComplete="new-password" value={form.confirm} onChange={set("confirm")} />
        {(problem || error) && <p className="text-sm text-destructive">{problem ?? error}</p>}
        <button disabled={busy || !form.username || form.password.length < PASSWORD_MIN || form.confirm !== form.password} className={authButton}>
          {busy ? t("setup.creating") : t("setup.create")}
        </button>
      </form>
    </AuthFrame>
  )
}
