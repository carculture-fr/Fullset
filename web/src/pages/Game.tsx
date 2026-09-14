import { Fragment, useCallback, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { Link, useNavigate, useParams } from "react-router-dom"

import { Condition } from "@/components/condition"
import { Cover } from "@/components/cover"
import { ValueBlock } from "@/components/value-block"
import { api, type CopyDetail, type GameDetail } from "@/lib/api"
import { euros, formatDate } from "@/lib/format"
import { listLabel, valueLabel } from "@/lib/i18n"
import { useLibrary } from "@/lib/library-data"
import { DIGITAL } from "@domain"

export default function Game() {
  const { t } = useTranslation()
  const { id } = useParams()
  const navigate = useNavigate()
  const library = useLibrary()
  const [game, setGame] = useState<GameDetail | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => api<GameDetail>(`/api/games/${id}`).then(setGame, (err: Error) => setError(err.message)), [id])
  useEffect(() => {
    setGame(null)
    setError(null)
    load()
  }, [load])

  // Une estimation change aussi la bibliothèque (tri par valeur) : les deux se rechargent.
  const refresh = async () => {
    await load()
    await library.reload()
  }

  // Revenir en arrière garde les filtres et le défilement ; une fiche ouverte directement renvoie à l'accueil.
  const back = () => ((window.history.state?.idx ?? 0) > 0 ? navigate(-1) : navigate("/"))

  if (error) return <p className="py-16 text-center text-destructive">{error}</p>
  if (!game) return <p className="py-16 text-center text-muted-foreground">{t("game.loading")}</p>

  const meta: Array<[string, string | null]> = [
    [t("game.meta.developer"), game.developer],
    [t("game.meta.publisher"), game.publisher],
    [t("game.meta.release"), formatDate(game.release_date)],
    [t("game.meta.genres"), listLabel("igdb", game.genres)],
    [t("game.meta.modes"), listLabel("igdb", game.game_modes)],
    [t("game.meta.perspective"), listLabel("igdb", game.perspective)],
    [t("game.meta.series"), game.series],
    [t("game.meta.pegi"), game.pegi],
    [t("game.meta.igdbRating"), game.igdb_rating === null ? null : t("game.igdbRatingValue", { rating: game.igdb_rating })],
  ]

  return (
    <article className="pb-10">
      <button onClick={back} className="mb-3 text-sm text-muted-foreground hover:text-foreground">
        {t("game.back")}
      </button>

      <div className="flex flex-col gap-5 sm:flex-row">
        <Cover src={game.cover} title={game.title} className="aspect-[3/4] w-44 shrink-0 self-center rounded-lg sm:w-56 sm:self-start" />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl leading-tight font-semibold">{game.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-muted px-2.5 py-1">{game.platform}</span>
            {game.igdb_id === null && (
              <Link to={`/jeux/${game.id}/modifier`} className="rounded-full bg-primary/20 px-2.5 py-1 text-primary">
                {t("game.toMatchIgdb")}
              </Link>
            )}
            <Link to={`/jeux/${game.id}/modifier`} className="ml-auto text-sm text-muted-foreground hover:text-foreground">
              {t("game.editGame")}
            </Link>
          </div>
          <Rows rows={meta} className="mt-4" />
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {game.igdb_url && (
              <a href={game.igdb_url} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                {t("game.igdbLink")}
              </a>
            )}
            {game.steam_appid && (
              <a href={`https://store.steampowered.com/app/${game.steam_appid}`} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                {t("game.steamLink")}
              </a>
            )}
            {game.romm && (
              <a href={game.romm.url} target="_blank" rel="noreferrer" className="text-primary hover:underline" title={game.romm.name}>
                {game.romm.platform ? t("game.rommLinkPlatform", { platform: game.romm.platform }) : t("game.rommLink")}
              </a>
            )}
          </div>
        </div>
      </div>

      {game.summary && <p className="mt-5 max-w-3xl leading-relaxed text-foreground/90">{game.summary}</p>}

      <div className="mt-8 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{t("game.copies", { n: game.copies.length })}</h2>
        <Link to={`/jeux/${game.id}/ajouter`} className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm">
          {t("game.addCopy")}
        </Link>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {game.copies.map((c) => (
          <CopyCard key={c.id} copy={c} gameTitle={game.title} gameId={game.id} onChanged={refresh} />
        ))}
      </div>
    </article>
  )
}

function Rows({ rows, className = "" }: { rows: Array<[string, string | null]>; className?: string }) {
  return (
    <dl className={`grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm ${className}`}>
      {rows
        .filter(([, v]) => v)
        .map(([k, v]) => (
          <Fragment key={k}>
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="min-w-0 break-words">{v}</dd>
          </Fragment>
        ))}
    </dl>
  )
}

function CopyCard({ copy: c, gameTitle, gameId, onChanged }: { copy: CopyDetail; gameTitle: string; gameId: number; onChanged: () => Promise<void> }) {
  const { t } = useTranslation()
  const digital = c.support === DIGITAL
  const rows: Array<[string, string | null]> = [
    [t("game.copy.content"), digital ? null : valueLabel("content", c.content)],
    [t("game.copy.edition"), c.edition],
    [t("game.copy.region"), valueLabel("region", c.region)],
    [t("game.copy.status"), valueLabel("playStatus", c.play_status)],
    [t("game.copy.goal"), valueLabel("goal", c.goal)],
    [t("game.copy.price"), c.price_cents === null ? null : euros(c.price_cents)],
    [t("game.copy.purchased"), formatDate(c.purchase_date)],
    [t("game.copy.place"), c.purchase_place],
    [t("game.copy.quantity"), c.quantity > 1 ? String(c.quantity) : null],
    [t("game.copy.tags"), c.tags],
    [t("game.copy.barcode"), c.barcode],
  ]

  return (
    <section className="rounded-lg bg-card p-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-medium">{valueLabel("support", c.support)}</span>
        {c.title_as_entered !== gameTitle && <span className="text-xs text-muted-foreground">{t("game.copy.enteredAs", { title: c.title_as_entered })}</span>}
        <Link to={`/jeux/${gameId}/exemplaires/${c.id}`} className="ml-auto text-sm text-muted-foreground hover:text-foreground">
          {t("common.edit")}
        </Link>
      </div>
      {!digital && (
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Condition label={t("game.copy.conditionGame")} value={c.condition_game} />
          <Condition label={t("game.copy.conditionBox")} value={c.condition_box} />
          <Condition label={t("game.copy.conditionManual")} value={c.condition_manual} />
        </div>
      )}
      <Rows rows={rows} className="mt-3" />
      <ValueBlock valuations={c.valuations} priceCents={c.price_cents} postUrl={`/api/copies/${c.id}/valuations`} deleteBase="/api/valuations" onChanged={onChanged} />
      {c.comment && <p className="mt-3 rounded-md bg-muted px-3 py-2 text-sm">{c.comment}</p>}
      {c.photos.length > 0 && (
        <div className="mt-3 grid grid-cols-3 gap-2">
          {c.photos.map((p) => (
            <a key={p.id} href={p.url} target="_blank" rel="noreferrer">
              <img src={p.url} alt="" loading="lazy" className="aspect-square w-full rounded-md object-cover" />
            </a>
          ))}
        </div>
      )}
    </section>
  )
}
