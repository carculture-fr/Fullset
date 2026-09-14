import { useEffect, useState, type FormEvent } from "react"
import { useTranslation } from "react-i18next"
import { Link, useNavigate, useParams } from "react-router-dom"

import { Cover } from "@/components/cover"
import { ErrorNote, Field, inputClass } from "@/components/fields"
import { IgdbSearch } from "@/components/igdb-search"
import { api, errorMessage, send, upload, type CoverOption, type GameDetail, type IgdbCandidate } from "@/lib/api"
import { shrinkImage } from "@/lib/images"
import { useLibrary } from "@/lib/library-data"

// Libellés : `editGame.fields.<clé>`.
const TEXT_FIELDS = ["developer", "publisher", "series", "genres", "game_modes", "perspective", "pegi"] as const

type FormState = Record<"title" | "summary" | "release_date" | (typeof TEXT_FIELDS)[number], string>

const toForm = (g: GameDetail): FormState => ({
  title: g.title,
  summary: g.summary ?? "",
  release_date: g.release_date ?? "",
  ...(Object.fromEntries(TEXT_FIELDS.map((k) => [k, g[k] ?? ""])) as Record<(typeof TEXT_FIELDS)[number], string>),
})

export default function EditGame() {
  const { t } = useTranslation()
  const { id } = useParams()
  const navigate = useNavigate()
  const { reload } = useLibrary()
  const [game, setGame] = useState<GameDetail | null>(null)
  const [form, setForm] = useState<FormState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [covers, setCovers] = useState<CoverOption[] | null>(null)
  const [relinking, setRelinking] = useState(false)

  const apply = (g: GameDetail) => {
    setGame(g)
    setForm(toForm(g))
  }

  useEffect(() => {
    api<GameDetail>(`/api/games/${id}`).then(apply, (err) => setError(errorMessage(err)))
  }, [id])

  if (!game || !form) return <p className="py-16 text-center text-muted-foreground">{error ?? t("editGame.loading")}</p>

  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const save = (e: FormEvent) => {
    e.preventDefault()
    run(async () => {
      await send("PUT", `/api/games/${game.id}`, form)
      await reload()
      navigate(`/jeux/${game.id}`, { replace: true })
    })
  }

  const refreshCover = async () => {
    apply(await api<GameDetail>(`/api/games/${game.id}`))
    await reload()
  }

  const relink = (c: IgdbCandidate) => {
    if (!window.confirm(t("editGame.confirmRelink", { name: c.name }))) return
    run(async () => {
      apply(await send<GameDetail>("POST", `/api/games/${game.id}/igdb`, { igdb_id: c.igdb_id }))
      setRelinking(false)
      setCovers(null)
      await reload()
    })
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8 pb-10">
      <div>
        <Link to={`/jeux/${game.id}`} replace className="text-sm text-muted-foreground hover:text-foreground">
          ← {game.title}
        </Link>
        <h1 className="mt-2 text-xl font-semibold">{t("editGame.title")}</h1>
        <p className="text-sm text-muted-foreground">{game.platform}</p>
      </div>

      <ErrorNote message={error} />

      <section className="space-y-3">
        <h2 className="font-semibold">{t("editGame.cover")}</h2>
        <div className="flex items-start gap-4">
          <Cover src={game.cover} title={game.title} className="aspect-[3/4] w-28 shrink-0 rounded-lg" />
          <div className="flex flex-col items-start gap-2 text-sm">
            {game.igdb_id !== null && (
              <button
                disabled={busy}
                onClick={() => run(async () => setCovers((await api<{ covers: CoverOption[] }>(`/api/games/${game.id}/cover-options`)).covers))}
                className="rounded-lg border border-border bg-card px-3 py-2"
              >
                {t("editGame.igdbCovers")}
              </button>
            )}
            <label className="cursor-pointer rounded-lg border border-border bg-card px-3 py-2">
              {t("editGame.usePhoto")}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  e.target.value = ""
                  if (file) run(async () => {
                    await upload(`/api/games/${game.id}/cover`, await shrinkImage(file, 1200), "jaquette.jpg")
                    await refreshCover()
                  })
                }}
              />
            </label>
            <span className="text-xs text-muted-foreground">
              {t("editGame.currentSource", {
                source: game.cover_source === null ? t("editGame.sourceNone") : ((t("editGame.coverSources", { returnObjects: true }) as Record<string, string>)[game.cover_source] ?? game.cover_source),
              })}
            </span>
          </div>
        </div>
        {covers && (
          covers.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("editGame.noOtherCover")}</p>
          ) : (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
              {covers.map((c) => (
                <button
                  key={c.url}
                  disabled={busy}
                  onClick={() => run(async () => {
                    await send("POST", `/api/games/${game.id}/cover/url`, { url: c.url })
                    setCovers(null)
                    await refreshCover()
                  })}
                  className="text-left"
                >
                  <img src={c.url} alt="" loading="lazy" className="aspect-[3/4] w-full rounded-md object-cover" />
                  <span className="text-xs text-muted-foreground">{c.label}</span>
                </button>
              ))}
            </div>
          )
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">{t("editGame.igdbSection")}</h2>
        {game.igdb_id === null ? (
          <p className="text-sm text-primary">{t("editGame.notLinked")}</p>
        ) : (
          <p className="text-sm text-muted-foreground">{t("editGame.linkedTo", { id: game.igdb_id })}</p>
        )}
        {relinking ? (
          <IgdbSearch onPick={relink} initialQuery={game.title} />
        ) : (
          <button onClick={() => setRelinking(true)} className="rounded-lg border border-border bg-card px-3 py-2 text-sm">
            {game.igdb_id === null ? t("editGame.link") : t("editGame.change")}
          </button>
        )}
      </section>

      <form onSubmit={save} className="space-y-4">
        <h2 className="font-semibold">{t("editGame.info")}</h2>
        <Field label={t("editGame.fields.title")}>
          <input className={inputClass} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </Field>
        <Field label={t("editGame.fields.summary")} hint={t("editGame.fields.summaryHint")}>
          <textarea className={inputClass} rows={6} value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} />
        </Field>
        <Field label={t("editGame.fields.release")}>
          <input className={inputClass} type="date" value={form.release_date} onChange={(e) => setForm({ ...form, release_date: e.target.value })} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          {TEXT_FIELDS.map((key) => (
            <Field key={key} label={t(`editGame.fields.${key}`)}>
              <input className={inputClass} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
            </Field>
          ))}
        </div>
        <button disabled={busy} className="w-full rounded-lg bg-primary py-3 font-medium text-primary-foreground disabled:opacity-50">
          {t("common.save")}
        </button>
      </form>
    </div>
  )
}
