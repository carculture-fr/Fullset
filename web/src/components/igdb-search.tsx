import { Search } from "lucide-react"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { Cover } from "@/components/cover"
import { ErrorNote, inputClass } from "@/components/fields"
import { ICON } from "@/components/page-bits"
import { api, errorMessage, type IgdbCandidate } from "@/lib/api"

/** Recherche IGDB au fil de la frappe (pause de 350 ms), résultats en liste touchable. */
export function IgdbSearch({ onPick, initialQuery = "" }: { onPick: (c: IgdbCandidate) => void; initialQuery?: string }) {
  const { t } = useTranslation()
  const [q, setQ] = useState(initialQuery)
  const [results, setResults] = useState<IgdbCandidate[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const query = q.trim()
    if (query.length < 2) {
      setResults(null)
      return
    }
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await api<{ results: IgdbCandidate[] }>(`/api/igdb/search?q=${encodeURIComponent(query)}`, { signal: controller.signal })
        setResults(res.results)
      } catch (err) {
        if (!controller.signal.aborted) setError(errorMessage(err))
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }, 350)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [q])

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search size={18} {...ICON} aria-hidden="true" className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          autoFocus
          className={`${inputClass} pl-11`}
          placeholder={t("igdbSearch.placeholder")}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label={t("igdbSearch.label")}
        />
      </div>
      <ErrorNote message={error} />
      {loading && <p className="px-1 text-sm text-muted-foreground">{t("igdbSearch.searching")}</p>}
      {results && !loading && results.length === 0 && <p className="px-1 text-sm text-muted-foreground">{t("igdbSearch.none")}</p>}
      {results && results.length > 0 && (
        <ul className="divide-y divide-border overflow-hidden rounded-card bg-card">
          {results.map((r) => (
            <li key={r.igdb_id}>
              <button type="button" onClick={() => onPick(r)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors duration-150 hover:bg-background/60">
                <Cover src={r.cover} title={r.name} platform={r.platforms[0]} size="thumb" className="w-11 shrink-0" />
                <span className="block min-w-0">
                  <span className="block truncate text-[14px] font-semibold">{r.name}</span>
                  {r.original_name && <span className="block truncate text-xs text-muted-foreground">{r.original_name}</span>}
                  <span className="block truncate text-xs text-muted-foreground">{[r.year, r.platforms.join(", ")].filter(Boolean).join(" · ")}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
