import { useEffect, useMemo, useState } from "react"
import { Link, useNavigate } from "react-router-dom"

import { ErrorNote, inputClass } from "@/components/fields"
import { api, errorMessage, send, type SteamCandidate } from "@/lib/api"
import { plural } from "@/lib/format"
import { useLibrary } from "@/lib/library-data"
import { filterOptions } from "@/lib/platform-search"

const hours = (minutes: number) => (minutes >= 60 ? `${Math.round(minutes / 6) / 10} h` : minutes > 0 ? `${minutes} min` : "jamais lancé")

/** Écran de choix (choix de conception) : les jeux Steam absents de la collection, à cocher. */
export default function Steam() {
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
      if (r.failed.length) setError(`Non ajoutés : ${r.failed.map((f) => `${f.name} (${f.error})`).join(", ")}`)
      else navigate("/?support=D%C3%A9mat%C3%A9rialis%C3%A9", { replace: true })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 pb-28">
      <Link to="/reglages" className="inline-block text-sm text-muted-foreground hover:text-foreground">
        ← Réglages
      </Link>
      <div>
        <h1 className="text-xl font-semibold">Jeux Steam à ajouter</h1>
        <p className="text-sm text-muted-foreground">
          {items ? plural(items.length, "jeu Steam absent", "jeux Steam absents") : "Chargement…"} de ta collection. Coche ceux à ajouter : ils arrivent en dématérialisé, achetés sur Steam, avec leur temps de jeu.
        </p>
      </div>
      <ErrorNote message={error} />
      {items && items.length > 0 && (
        <div className="flex gap-2">
          <input className={`${inputClass} min-w-0 flex-1`} placeholder="Chercher un jeu" value={q} onChange={(e) => setQ(e.target.value)} />
          <button
            type="button"
            onClick={() => setPicked((p) => (shown.every((i) => p.has(i.appid)) ? new Set([...p].filter((a) => !shown.some((i) => i.appid === a))) : new Set([...p, ...shown.map((i) => i.appid)])))}
            className="shrink-0 rounded-lg border border-border px-3 text-sm"
          >
            {shown.length && shown.every((i) => picked.has(i.appid)) ? "Tout décocher" : "Tout cocher"}
          </button>
        </div>
      )}
      {items && items.length === 0 && <p className="rounded-lg bg-card p-4 text-sm text-muted-foreground">Toute ta bibliothèque Steam est déjà dans Fullset.</p>}

      <ul className="divide-y divide-border rounded-lg bg-card">
        {shown.map((i) => (
          <li key={i.appid}>
            <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm">
              <input type="checkbox" className="size-4 shrink-0 accent-[var(--color-primary)]" checked={picked.has(i.appid)} onChange={() => toggle(i.appid)} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{i.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {hours(i.playtime_minutes)} · {i.igdb_id ? "fiche IGDB reconnue" : "sans fiche IGDB (titre Steam)"}
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>

      {picked.size > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
          <div className="mx-auto max-w-2xl">
            <button onClick={add} disabled={busy} className="w-full rounded-lg bg-primary py-3 font-medium text-primary-foreground disabled:opacity-50">
              {busy ? "Ajout en cours…" : `Ajouter ${plural(picked.size, "jeu", "jeux")}`}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
