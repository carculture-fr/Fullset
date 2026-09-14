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
  romm: {
    title: "RomM",
    helpUrl: "https://github.com/rommapp/romm",
    fields: { url: { label: "servicesForm.romm.url", placeholder: "http://192.168.1.10:8080" }, api_token: { label: "servicesForm.romm.apiToken" } },
  },
}

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
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-center gap-2">
        <span className="font-medium">{info.title}</span>
        <span className={`rounded px-1.5 text-xs ${status.configured ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}>{status.configured ? t("servicesForm.configured") : t("servicesForm.notConfigured")}</span>
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="ml-auto text-sm text-primary">
          {open ? t("common.close") : status.configured ? t("common.edit") : t("servicesForm.configure")}
        </button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{t(`servicesForm.${name}.what`)}</p>

      {open && (
        <div className="mt-3 space-y-3">
          {Object.entries(info.fields).map(([key, f]) => {
            const s = status.fields[key]
            const byEnv = s?.source === "env"
            return (
              <label key={key} className="block space-y-1 text-sm">
                <span className="text-muted-foreground">{t(f.label)}</span>
                <input
                  className={inputClass}
                  type={s?.secret ? "password" : "text"}
                  autoComplete="off"
                  disabled={byEnv}
                  placeholder={s?.preview ? t("servicesForm.keepPlaceholder", { preview: s.preview }) : f.placeholder}
                  value={draft[key] ?? ""}
                  onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                />
                {byEnv && <span className="block text-xs text-muted-foreground">{t("servicesForm.byEnv")}</span>}
              </label>
            )
          })}
          <a href={info.helpUrl} target="_blank" rel="noreferrer" className="inline-block text-xs text-primary underline">
            {t(`servicesForm.${name}.help`)} ↗
          </a>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={save} disabled={busy || !Object.values(draft).some((v) => v.trim())} className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
              {t("servicesForm.saveAndTest")}
            </button>
            {status.configured && (
              <button type="button" onClick={() => run(test)} disabled={busy} className="rounded-lg border border-border px-3 py-2 text-sm disabled:opacity-50">
                {busy ? t("servicesForm.testing") : t("servicesForm.test")}
              </button>
            )}
            {fromApp && (
              <button type="button" onClick={remove} disabled={busy} className="rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-destructive disabled:opacity-50">
                {t("servicesForm.remove")}
              </button>
            )}
          </div>
        </div>
      )}
      {result && <p className={`mt-2 rounded-lg px-3 py-2 text-sm ${result.ok ? "bg-muted" : "bg-destructive/15 text-destructive"}`}>{result.text}</p>}
    </div>
  )
}
