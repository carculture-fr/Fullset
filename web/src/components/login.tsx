import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react"
import { Trans, useTranslation } from "react-i18next"

import { ThemeToggle } from "@/components/theme-toggle"
import { ApiError, send } from "@/lib/api"
import { LANGUAGES, chooseLanguage, currentLanguage } from "@/lib/i18n"

export const authField = "w-full rounded-lg border border-border bg-muted px-3 py-2.5 outline-none focus:border-primary"
export const authButton = "w-full rounded-lg bg-primary py-2.5 font-medium text-primary-foreground disabled:opacity-50"

/** Cadre commun à la connexion et à l'assistant de premier lancement. */
export function AuthFrame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-8">
      <div className="fixed top-3 right-3 flex items-center gap-1">
        <LanguageSwitcher />
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

/** Avant connexion : langue du navigateur, ou celle choisie ici (retenue sur l'appareil). */
function LanguageSwitcher() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const current = currentLanguage()

  useEffect(() => {
    if (!open) return
    const outside = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("pointerdown", outside)
    return () => document.removeEventListener("pointerdown", outside)
  }, [open])

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={t("auth.language")}
        title={t("auth.language")}
        className="flex h-9 items-center rounded-md px-2 text-xs font-medium uppercase text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        {current}
      </button>
      {open && (
        <ul className="absolute top-full right-0 z-30 mt-1 min-w-32 overflow-hidden rounded-lg border border-border bg-card py-1 text-sm shadow-lg shadow-black/30">
          {LANGUAGES.map((lang) => (
            <li key={lang}>
              <button
                type="button"
                lang={lang}
                aria-current={lang === current || undefined}
                onClick={() => {
                  chooseLanguage(lang)
                  setOpen(false)
                }}
                className={`block w-full px-3 py-2 text-left hover:bg-muted ${lang === current ? "font-medium text-primary" : ""}`}
              >
                {t(`languages.${lang}`)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function Login({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation()
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
      setError(err instanceof ApiError ? err.message : t("common.serverUnreachable"))
      setBusy(false)
    }
  }

  return (
    <AuthFrame title="Fullset">
      <form onSubmit={submit} className="space-y-3">
        <input className={authField} placeholder={t("auth.username")} autoComplete="username" autoCapitalize="none" value={username} onChange={(e) => setUsername(e.target.value)} />
        <input className={authField} type="password" placeholder={t("auth.password")} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <button disabled={busy || !username || !password} className={authButton}>
          {busy ? t("auth.signingIn") : t("auth.signIn")}
        </button>
        <p className="text-xs text-muted-foreground">
          <Trans
            i18nKey="auth.forgot"
            values={{ command: "docker exec fullset node server/dist/cli/reset-password.js" }}
            components={{ code: <code className="rounded bg-muted px-1" /> }}
          />
        </p>
      </form>
    </AuthFrame>
  )
}
