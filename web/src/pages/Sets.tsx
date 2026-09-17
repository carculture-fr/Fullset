import { Download, RefreshCw, Trash2 } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"

import { ErrorNote } from "@/components/fields"
import { ICON } from "@/components/page-bits"
import { api, errorMessage, send, type SetList, type SetSummary } from "@/lib/api"
import { euros, formatDate } from "@/lib/format"

// Mode Fullset : une liste de référence par console (ce qui existe à collectionner) et
// l'avancement de la collection dessus. Une liste n'est récupérée qu'au bouton.

const percent = (s: SetSummary) => (s.count ? Math.round((s.owned / s.count) * 100) : 0)

function Progress({ set }: { set: SetSummary }) {
  const { t } = useTranslation()
  const done = percent(set)
  return (
    <>
      <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-background" role="img" aria-label={t("sets.progress", { owned: set.owned, count: set.count })}>
        <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${done}%` }} />
      </div>
      <p className="num mt-1.5 text-[12px] text-muted-foreground">
        <strong className="font-semibold text-foreground">{t("sets.progress", { owned: set.owned, count: set.count })}</strong> · {t("sets.percent", { percent: done })}
        {set.missing_cents > 0 && <> · {t("sets.budgetLeft", { amount: euros(set.missing_cents) })}</>}
      </p>
    </>
  )
}

export default function Sets() {
  const { t } = useTranslation()
  const [lists, setLists] = useState<SetList[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(() => api<{ lists: SetList[] }>("/api/sets").then((r) => setLists(r.lists), (err) => setError(errorMessage(err))), [])
  useEffect(() => {
    load()
  }, [load])

  const refresh = async (slug: string) => {
    setBusy(slug)
    setError(null)
    try {
      await send("POST", `/api/sets/${slug}/refresh`)
      await load()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }
  const remove = async (slug: string) => {
    if (!window.confirm(t("sets.removeConfirm"))) return
    setBusy(slug)
    try {
      await send("DELETE", `/api/sets/${slug}`)
      await load()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  if (!lists) return <p className="py-16 text-center text-muted-foreground">{error ?? t("sets.loading")}</p>

  const saved = lists.filter((l) => l.saved)
  const rest = lists.filter((l) => !l.saved)

  return (
    <div className="space-y-5 pb-4">
      <div>
        <h1 className="text-[29px]">{t("sets.title")}</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">{t("sets.subtitle")}</p>
      </div>
      {error && <ErrorNote message={error} />}

      {saved.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {saved.map((l) => (
            <li key={l.slug} className="rounded-card bg-card p-4">
              <Link to={`/fullset/${l.slug}`} className="block">
                <h2 className="text-[18px] leading-tight">{l.name}</h2>
                <p className="mt-0.5 truncate text-[12px] text-muted-foreground">{l.platform}</p>
                <Progress set={l.saved!} />
              </Link>
              <div className="mt-3 flex items-center gap-2 text-[12px] text-muted-foreground">
                <span className="num min-w-0 flex-1 truncate">{t("sets.updated", { date: formatDate(l.saved!.fetched_at.slice(0, 10)) })}</span>
                <button type="button" onClick={() => refresh(l.slug)} disabled={busy === l.slug} title={t("sets.refresh")} aria-label={t("sets.refresh")} className="grid size-9 place-items-center rounded-full hover:bg-foreground/7 disabled:opacity-45">
                  <RefreshCw size={16} {...ICON} aria-hidden="true" className={busy === l.slug ? "animate-spin" : ""} />
                </button>
                <button type="button" onClick={() => remove(l.slug)} disabled={busy === l.slug} title={t("sets.remove")} aria-label={t("sets.remove")} className="grid size-9 place-items-center rounded-full hover:bg-foreground/7 disabled:opacity-45">
                  <Trash2 size={16} {...ICON} aria-hidden="true" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <section>
        <h2 className="text-[18px]">{saved.length > 0 ? t("sets.others") : t("sets.consoles")}</h2>
        <p className="mt-1 text-[12px] text-muted-foreground">{t("sets.sourceNote", { source: lists[0]?.source ?? "" })}</p>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {rest.map((l) => (
            <li key={l.slug} className="flex min-h-11 items-center gap-3 rounded-[20px] bg-card px-4 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px]">{l.name}</span>
                <span className="block truncate text-[12px] text-muted-foreground">{l.platform}</span>
              </span>
              <button
                type="button"
                onClick={() => refresh(l.slug)}
                disabled={busy === l.slug}
                className="flex h-9 shrink-0 items-center gap-2 rounded-full bg-background px-3.5 text-[13px] font-semibold transition-colors duration-150 hover:bg-foreground/7 disabled:opacity-45"
              >
                <Download size={15} {...ICON} aria-hidden="true" />
                {busy === l.slug ? t("sets.refreshing") : t("sets.fetch")}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
