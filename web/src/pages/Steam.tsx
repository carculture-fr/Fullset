import { ArrowLeft, Check, Search } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Link, useNavigate } from "react-router-dom"

import { Cover } from "@/components/cover"
import { ErrorNote, inputClass } from "@/components/fields"
import { api, errorMessage, send, type SteamCandidate } from "@/lib/api"
import i18n from "@/lib/i18n"
import { useLibrary } from "@/lib/library-data"
import { filterOptions } from "@/lib/platform-search"

const ICON = { strokeWidth: 2.75 } as const

const hours = (minutes: number) =>
  minutes >= 60 ? i18n.t("steam.hours", { value: Math.round(minutes / 6) / 10 }) : minutes > 0 ? i18n.t("steam.minutes", { value: minutes }) : i18n.t("steam.neverPlayed")

/** Écran de choix (choix de conception) : les jeux Steam absents de la collection, à cocher. */
export default function Steam() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { reload } = useLibrary()
  const [items, setItems] = useState<SteamCandidate[] | null>(null)
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [q, setQ] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api<{ items: SteamCandidate[] }>("/api/steam/candidates").then((r) => setItems(r.items), (err) => setError(errorMessage(err)))
  }, [])

  const shown = useMemo(() => {
    if (!items) return []
    const hits = new Set(filterOptions(items.map((i) => i.name), q))
    return items.filter((i) => hits.has(i.name))
  }, [items, q])

  const toggle = (appid: number) =>
    setPicked((p) => {
      const next = new Set(p)
      if (next.has(appid)) next.delete(appid)
      else next.add(appid)
      return next
    })

  const add = async () => {
    setBusy(true)
    setError(null)
    try {
      const r = await send<{ added: unknown[]; failed: Array<{ name: string; error: string }> }>("POST", "/api/steam/import", { appids: [...picked] })
      await reload()
      if (r.failed.length) setError(t("steam.failed", { list: r.failed.map((f) => `${f.name} (${f.error})`).join(", ") }))
      else navigate("/?support=D%C3%A9mat%C3%A9rialis%C3%A9", { replace: true })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const allShownPicked = shown.length > 0 && shown.every((i) => picked.has(i.appid))

  return (
    <div className={`mx-auto max-w-2xl space-y-4 ${picked.size > 0 ? "pb-20 lg:pb-24" : ""}`}>
      <Link to="/reglages" className="inline-flex items-center gap-2.5 text-[13px] text-muted-foreground hover:text-foreground">
        <span className="grid size-10 place-items-center rounded-full bg-card text-foreground">
          <ArrowLeft size={18} {...ICON} aria-hidden="true" />
        </span>
        {t("layout.settings")}
      </Link>
      <div>
        <h1 className="text-[29px]">{t("steam.title")}</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          {t("steam.intro", { missing: items ? t("steam.missing", { count: items.length }) : t("steam.loading") })}
        </p>
      </div>
      <ErrorNote message={error} />
      {items && items.length > 0 && (
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Search size={18} {...ICON} aria-hidden="true" className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted-foreground" />
            <input className={`${inputClass} pl-11`} aria-label={t("steam.search")} placeholder={t("steam.search")} value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <button
            type="button"
            onClick={() => setPicked((p) => (allShownPicked ? new Set([...p].filter((a) => !shown.some((i) => i.appid === a))) : new Set([...p, ...shown.map((i) => i.appid)])))}
            className="min-h-11 shrink-0 rounded-full bg-card px-4 text-[13px] font-semibold"
          >
            {allShownPicked ? t("steam.uncheckAll") : t("steam.checkAll")}
          </button>
        </div>
      )}
      {items && items.length === 0 && <p className="rounded-card bg-card p-4 text-[13px] text-muted-foreground">{t("steam.allThere")}</p>}

      <ul>
        {shown.map((i) => {
          const on = picked.has(i.appid)
          return (
            <li key={i.appid} className="border-t border-border first:border-t-0">
              <label className="grid cursor-pointer grid-cols-[38px_minmax(0,1fr)_auto] items-center gap-3 py-2">
                <Cover src={null} title={i.name} platform="PC" size="thumb" />
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-semibold">{i.name}</span>
                  <span className="block truncate text-[12px] text-muted-foreground">
                    {hours(i.playtime_minutes)} · {i.igdb_id ? t("steam.igdbKnown") : t("steam.noIgdb")}
                  </span>
                </span>
                {/* Case à cocher ronde : la case native reste, invisible, pour le clavier et les lecteurs d'écran. */}
                <span className="relative grid size-11 place-items-center">
                  <input type="checkbox" className="peer absolute inset-0 cursor-pointer opacity-0" checked={on} onChange={() => toggle(i.appid)} />
                  <span
                    aria-hidden="true"
                    className={`grid size-6 place-items-center rounded-full border-[1.5px] transition-colors duration-150 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary ${
                      on ? "border-primary bg-primary text-primary-foreground" : "border-border-strong bg-transparent"
                    }`}
                  >
                    {on && <Check size={14} {...ICON} />}
                  </span>
                </span>
              </label>
            </li>
          )
        })}
      </ul>

      {picked.size > 0 && (
        <div className="fixed inset-x-0 bottom-[calc(78px+env(safe-area-inset-bottom))] z-20 bg-gradient-to-t from-background from-70% to-transparent px-4 pt-8 pb-3 lg:bottom-0 lg:left-[280px] lg:px-8 lg:pb-6">
          <div className="mx-auto max-w-2xl">
            <button
              onClick={add}
              disabled={busy}
              className="min-h-[48px] w-full rounded-full bg-primary px-5 font-heading text-[16px] text-primary-foreground shadow-md transition-transform duration-150 active:scale-[.98] disabled:opacity-45"
            >
              {busy ? t("steam.adding") : t("steam.addGames", { count: picked.size })}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
