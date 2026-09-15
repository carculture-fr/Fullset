import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react"
import { Trans, useTranslation } from "react-i18next"

import { inputClass } from "@/components/fields"
import { Logo } from "@/components/layout"
import { ThemeToggle } from "@/components/theme-toggle"
import { ApiError, send } from "@/lib/api"
import { LANGUAGES, chooseLanguage, currentLanguage } from "@/lib/i18n"

export const authField = inputClass
export const authButton =
  "inline-flex min-h-11 w-full items-center justify-center rounded-full bg-primary px-5 font-heading text-[16px] text-primary-foreground transition-[filter,transform] duration-150 hover:brightness-95 active:scale-[.98] disabled:opacity-45"

/**
 * Cadre commun à la connexion et à l'assistant de premier lancement : carte 28 px centrée,
 * langue et thème en pilules sur le fond (sur la carte, leur surface ne se verrait pas).
 */
export function AuthFrame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 pt-20 pb-8">
      <div className="fixed top-4 right-4 flex items-center gap-2">
        <LanguageSwitcher />
        <ThemeToggle />
      </div>
      <div className="w-full max-w-[440px] space-y-5 rounded-[28px] bg-card p-5 shadow-sm sm:p-8">
        <div className="space-y-4">
          <Logo size={48} />
          <h1 className="text-[27px]">{title}</h1>
        </div>
        {children}
      </div>
    </main>
  )
}

/** Avant connexion : langue du navigateur, ou celle choisie ici (retenue sur l'appareil). */
export function LanguageSwitcher({ onChoose }: { onChoose?: (lang: (typeof LANGUAGES)[number]) => void } = {}) {
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
        className="flex h-9 min-w-9 items-center justify-center rounded-full bg-card px-3 text-[11px] font-semibold uppercase text-muted-foreground transition-colors duration-150 hover:text-foreground"
      >
        {current}
      </button>
      {open && (
        <ul className="absolute top-full right-0 z-40 mt-2 min-w-36 overflow-hidden rounded-[20px] border border-border bg-background py-1 text-sm shadow-md">
          {LANGUAGES.map((lang) => (
            <li key={lang}>
              <button
                type="button"
                lang={lang}
                aria-current={lang === current || undefined}
                onClick={() => {
                  chooseLanguage(lang)
                  onChoose?.(lang)
                  setOpen(false)
                }}
                className={`block w-full px-4 py-3 text-left hover:bg-card ${lang === current ? "font-semibold text-primary-text" : ""}`}
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
        <input className={authField} aria-label={t("auth.username")} placeholder={t("auth.username")} autoComplete="username" autoCapitalize="none" value={username} onChange={(e) => setUsername(e.target.value)} />
        <input className={authField} aria-label={t("auth.password")} type="password" placeholder={t("auth.password")} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="pt-1">
          <button disabled={busy || !username || !password} className={authButton}>
            {busy ? t("auth.signingIn") : t("auth.signIn")}
          </button>
        </div>
        <p className="pt-1 text-xs leading-relaxed text-muted-foreground">
          <Trans
            i18nKey="auth.forgot"
            values={{ command: "docker exec fullset node server/dist/cli/reset-password.js" }}
            components={{ code: <code className="rounded-md bg-background px-1.5 py-0.5 break-all" /> }}
          />
        </p>
      </form>
    </AuthFrame>
  )
}
