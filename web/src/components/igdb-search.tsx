import { useEffect, useState } from "react"

import { ErrorNote, inputClass } from "@/components/fields"
import { api, errorMessage, type IgdbCandidate } from "@/lib/api"

/** Recherche IGDB au fil de la frappe (pause de 350 ms), résultats en liste touchable. */
export function IgdbSearch({ onPick, initialQuery = "" }: { onPick: (c: IgdbCandidate) => void; initialQuery?: string }) {
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
      <input
        type="search"
        autoFocus
        className={inputClass}
        placeholder="Titre du jeu (titre PAL accepté)"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label="Rechercher sur IGDB"
      />
      <ErrorNote message={error} />
      {loading && <p className="text-sm text-muted-foreground">Recherche…</p>}
      {results && !loading && results.length === 0 && <p className="text-sm text-muted-foreground">Aucun résultat sur IGDB.</p>}
      {results && results.length > 0 && (
        <ul className="divide-y divide-border overflow-hidden rounded-lg bg-card">
          {results.map((r) => (
            <li key={r.igdb_id}>
              <button type="button" onClick={() => onPick(r)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-muted">
                {r.cover ? (
                  <img src={r.cover} alt="" loading="lazy" className="aspect-[3/4] w-11 shrink-0 rounded object-cover" />
                ) : (
                  <div className="aspect-[3/4] w-11 shrink-0 rounded bg-muted" />
                )}
                <div className="min-w-0">
                  <div className="truncate font-medium">{r.name}</div>
                  {r.original_name && <div className="truncate text-xs text-muted-foreground">{r.original_name}</div>}
                  <div className="truncate text-xs text-muted-foreground">
                    {[r.year, r.platforms.join(", ")].filter(Boolean).join(" · ")}
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
