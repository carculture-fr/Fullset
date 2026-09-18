import type { ParseKeys } from "i18next"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { ErrorNote, inputClass } from "@/components/fields"
import { api, errorMessage, send, type ServiceName, type ServicesStatus } from "@/lib/api"

// Textes (présentation, lien d'aide, libellés des champs) dans les fichiers de langue : `servicesForm.<service>.*`.
type Info = { title: string; helpUrl: string; fields: Record<string, { label: ParseKeys; placeholder?: string }> }

const INFO: Record<ServiceName, Info> = {
  igdb: {
    title: "IGDB",
    helpUrl: "https://api-docs.igdb.com/#account-creation",
    fields: { client_id: { label: "servicesForm.igdb.clientId" }, client_secret: { label: "servicesForm.igdb.clientSecret" } },
  },
  steam: {
    title: "Steam",
    helpUrl: "https://steamcommunity.com/dev/apikey",
    fields: { api_key: { label: "servicesForm.steam.apiKey" }, steam_id: { label: "servicesForm.steam.steamId", placeholder: "7656119…" } },
  },
  scandex: {
    title: "ScanDex",
    helpUrl: "https://scandex.gamery.app",
    fields: { token: { label: "servicesForm.scandex.token" } },
  },
  screenscraper: {
    title: "ScreenScraper",
    helpUrl: "https://www.screenscraper.fr/membreinscription.php",
    fields: {
      dev_id: { label: "servicesForm.screenscraper.devId" },
      dev_password: { label: "servicesForm.screenscraper.devPassword" },
      user: { label: "servicesForm.screenscraper.user" },
      password: { label: "servicesForm.screenscraper.password" },
    },
  },
  steamgriddb: {
    title: "SteamGridDB",
    helpUrl: "https://www.steamgriddb.com/profile/preferences/api",
    fields: { api_key: { label: "servicesForm.steamgriddb.apiKey" } },
  },
  romm: {
    title: "RomM",
    helpUrl: "https://github.com/rommapp/romm",
    fields: { url: { label: "servicesForm.romm.url", placeholder: "http://192.168.1.10:8080" }, api_token: { label: "servicesForm.romm.apiToken" } },
  },
}

const tag = "inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
const primaryButton =
  "inline-flex min-h-11 items-center justify-center rounded-full bg-primary px-5 font-heading text-[15px] text-primary-foreground transition-[filter,transform] duration-150 hover:brightness-95 active:scale-[.98] disabled:opacity-45"
const ghostButton = "inline-flex min-h-11 items-center rounded-full border border-border-strong px-4 text-sm font-semibold transition-colors duration-150 hover:bg-foreground/[.07] disabled:opacity-45"

/** Clés des services externes, toutes facultatives : assistant de premier lancement et Réglages. */
export function ServicesForm() {
  const { t } = useTranslation()
  const [status, setStatus] = useState<ServicesStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    api<ServicesStatus>("/api/services").then(setStatus, (err) => setError(errorMessage(err)))
  }, [])

  if (!status) return error ? <ErrorNote message={error} /> : <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
  return (
    <div className="space-y-3">
      {(Object.keys(INFO) as ServiceName[]).map((name) => (
        <ServiceCard key={name} name={name} status={status[name]} onSaved={setStatus} />
      ))}
    </div>
  )
}

/** Carte d'un service, en sous-carte (fond) posée sur la carte de la section. */
function ServiceCard({ name, status, onSaved }: { name: ServiceName; status: ServicesStatus[ServiceName]; onSaved: (s: ServicesStatus) => void }) {
  const { t } = useTranslation()
  const info = INFO[name]
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    setResult(null)
    try {
      await action()
    } catch (err) {
      setResult({ ok: false, text: errorMessage(err) })
    } finally {
      setBusy(false)
    }
  }
  const test = async () => {
    const r = await send<{ ok: boolean; message: string }>("POST", `/api/services/${name}/test`)
    setResult({ ok: r.ok, text: r.message })
  }
  const save = () =>
    run(async () => {
      onSaved(await send<ServicesStatus>("PUT", `/api/services/${name}`, Object.fromEntries(Object.entries(draft).filter(([, v]) => v.trim()))))
      setDraft({})
      await test()
    })
  const remove = () =>
    run(async () => {
      onSaved(await send<ServicesStatus>("PUT", `/api/services/${name}`, Object.fromEntries(Object.keys(info.fields).map((k) => [k, null]))))
    })

  const fromApp = Object.values(status.fields).some((f) => f.source === "app")

  return (
    <div className="rounded-[16px] bg-muted p-4">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <span className="font-heading text-[17px]">{info.title}</span>
        <span className={`${tag} ${status.configured ? "bg-primary-tint text-primary-tint-foreground" : "border border-border-strong text-muted-foreground"}`}>
          {status.configured ? t("servicesForm.configured") : t("servicesForm.notConfigured")}
        </span>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="ml-auto min-h-9 rounded-full px-2 text-[13px] font-semibold text-primary-text transition-colors duration-150 hover:bg-foreground/[.07]"
        >
          {open ? t("common.close") : status.configured ? t("common.edit") : t("servicesForm.configure")}
        </button>
      </div>
      <p className="mt-1 text-[13px] text-muted-foreground">{t(`servicesForm.${name}.what`)}</p>

      {open && (
        <div className="mt-4 space-y-3.5">
          {Object.entries(info.fields).map(([key, f]) => {
            const s = status.fields[key]
            const byEnv = s?.source === "env"
            return (
              <label key={key} className="block">
                <span className="mb-1.5 block text-[13px] font-semibold text-muted-foreground">{t(f.label)}</span>
                <input
                  className={`${inputClass} disabled:opacity-60`}
                  type={s?.secret ? "password" : "text"}
                  autoComplete="off"
                  disabled={byEnv}
                  placeholder={s?.preview ? t("servicesForm.keepPlaceholder", { preview: s.preview }) : f.placeholder}
                  value={draft[key] ?? ""}
                  onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                />
                {byEnv && <span className="mt-1 block text-xs text-subtle-foreground">{t("servicesForm.byEnv")}</span>}
              </label>
            )
          })}
          <a href={info.helpUrl} target="_blank" rel="noreferrer" className="inline-block text-[13px] font-semibold text-primary-text underline underline-offset-2">
            {t(`servicesForm.${name}.help`)} ↗
          </a>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={save} disabled={busy || !Object.values(draft).some((v) => v.trim())} className={primaryButton}>
              {t("servicesForm.saveAndTest")}
            </button>
            {status.configured && (
              <button type="button" onClick={() => run(test)} disabled={busy} className={ghostButton}>
                {busy ? t("servicesForm.testing") : t("servicesForm.test")}
              </button>
            )}
            {fromApp && (
              <button type="button" onClick={remove} disabled={busy} className={`${ghostButton} border-transparent text-muted-foreground hover:text-destructive`}>
                {t("servicesForm.remove")}
              </button>
            )}
          </div>
        </div>
      )}
      {result && (
        <p role="status" className={`mt-3 flex items-start gap-2 rounded-[16px] px-3.5 py-2 text-[13px] ${result.ok ? "bg-primary-tint text-primary-tint-foreground" : "bg-viz-bg text-destructive"}`}>
          <span aria-hidden="true" className="mt-[5px] size-2 shrink-0 rounded-full" style={{ background: result.ok ? "var(--cond-good)" : "var(--cond-bad)" }} />
          {result.text}
        </p>
      )}
    </div>
  )
}
