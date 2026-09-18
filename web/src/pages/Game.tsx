import { Pencil } from "lucide-react"
import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Link, useNavigate, useParams } from "react-router-dom"

import { ConditionBlock } from "@/components/condition"
import { Cover } from "@/components/cover"
import { ItemLife } from "@/components/life"
import { BackBar, ICON, tagClass } from "@/components/page-bits"
import { PhotoStrip } from "@/components/photo-field"
import { ValueBlock } from "@/components/value-block"
import { api, send, type CopyDetail, type GameDetail } from "@/lib/api"
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

  const year = game.release_date?.slice(0, 4)
  const rating = game.igdb_rating === null ? null : t("game.igdbRatingValue", { rating: game.igdb_rating })
  const meta: Array<[string, string | null]> = [
    [t("game.meta.developer"), game.developer],
    [t("game.meta.publisher"), game.publisher],
    [t("game.meta.release"), formatDate(game.release_date)],
    [t("game.meta.genres"), listLabel("igdb", game.genres)],
    [t("game.meta.modes"), listLabel("igdb", game.game_modes)],
    [t("game.meta.perspective"), listLabel("igdb", game.perspective)],
    [t("game.meta.series"), game.series],
    [t("game.meta.pegi"), game.pegi],
    [t("game.meta.igdbRating"), rating],
  ]
  // Méta courte du téléphone, sur deux lignes : studio, puis genre, PEGI et note.
  const shortMeta = [
    [game.developer, game.publisher !== game.developer ? game.publisher : null],
    [listLabel("igdb", game.genres), game.pegi && `${t("game.meta.pegi")} ${game.pegi}`, rating && `${t("game.meta.igdbRating")} ${rating}`],
  ]
    .map((line) => line.filter(Boolean).join(" · "))
    .filter(Boolean)

  return (
    <article className="pb-10">
      <BackBar
        onBack={back}
        label={
          <>
            {t("layout.library")}
            <span className="hidden lg:inline"> · {game.platform}</span>
          </>
        }
      >
        <Link to={`/jeux/${game.id}/modifier`} className={tagClass.surface}>
          <span className="lg:hidden">{t("common.edit")}</span>
          <span className="hidden lg:inline">{t("game.editGame")}</span>
        </Link>
      </BackBar>

      {/* 400 px : jaquette | titre, puis liens, résumé, exemplaires. 1280 px : trois colonnes.
          Les enveloppes « contents » laissent leurs enfants se placer dans la grille du téléphone. */}
      <div className="grid grid-cols-[132px_minmax(0,1fr)] gap-x-4 gap-y-5 lg:grid-cols-[240px_minmax(0,1fr)_380px] lg:items-start lg:gap-8">
        <div className="contents lg:col-start-1 lg:row-start-1 lg:flex lg:flex-col lg:gap-4">
          <Cover src={game.cover} title={game.title} platform={game.platform} size="large" className="col-start-1 row-start-1 w-full shadow-md" />
          <div className="col-span-2 row-start-2 flex flex-wrap gap-2">
            {game.igdb_id === null && (
              <Link to={`/jeux/${game.id}/modifier`} className={tagClass.accent}>
                {t("game.toMatchIgdb")}
              </Link>
            )}
            {game.igdb_url && (
              <a href={game.igdb_url} target="_blank" rel="noreferrer" className={tagClass.outline}>
                {t("game.igdbLink")}
              </a>
            )}
            {game.steam_appid && (
              <a href={`https://store.steampowered.com/app/${game.steam_appid}`} target="_blank" rel="noreferrer" className={tagClass.outline}>
                {t("game.steamLink")}
              </a>
            )}
            {game.romm && (
              <a href={game.romm.url} target="_blank" rel="noreferrer" className={tagClass.viz} title={game.romm.name}>
                {game.romm.platform ? t("game.rommLinkPlatform", { platform: game.romm.platform }) : t("game.rommLink")}
              </a>
            )}
            {/* Place du jeu dans les listes de référence suivies. */}
            {(game.sets ?? []).map((s) => (
              <Link key={s.slug} to={`/fullset/${s.slug}`} className={tagClass.outline}>
                {t("game.inSet", { position: s.position, set: s.name })}
              </Link>
            ))}
          </div>
        </div>

        <div className="contents lg:col-start-2 lg:row-start-1 lg:block">
          <header className="col-start-2 row-start-1 min-w-0 self-end">
            <div className="text-[11px] tracking-[0.08em] text-primary-text uppercase">{[game.platform, year].filter(Boolean).join(" · ")}</div>
            <h1 className="mt-1.5 text-[22px] leading-[1.05] break-words lg:text-[32px] lg:leading-[1.02]">{game.title}</h1>
            {shortMeta.length > 0 && (
              <div className="mt-2 text-[12px] text-muted-foreground lg:hidden">
                {shortMeta.map((line) => (
                  <div key={line}>{line}</div>
                ))}
              </div>
            )}
            <Rows rows={meta} className="mt-5 hidden lg:grid" />
          </header>
          {game.summary && <Summary text={game.summary} />}
        </div>

        <section className="col-span-2 row-start-4 lg:col-span-1 lg:col-start-3 lg:row-start-1">
          <div className="mb-3 flex items-center gap-2.5">
            <h2 className="text-[18px]">{t("game.copiesHeading", { count: game.copies.length })}</h2>
            <span className="num rounded-full bg-card px-2.5 py-0.5 text-[12px] text-muted-foreground">{game.copies.length}</span>
            <Link to={`/jeux/${game.id}/ajouter`} className="ml-auto flex min-h-11 items-center text-[14px] font-semibold text-primary-text hover:underline">
              {t("game.addCopy")}
            </Link>
          </div>
          <div className="space-y-3">
            {game.copies.map((c) => (
              <CopyCard key={c.id} copy={c} gameTitle={game.title} gameId={game.id} onChanged={refresh} />
            ))}
          </div>
        </section>
      </div>
    </article>
  )
}

/** Résumé : trois lignes et « Lire la suite » au téléphone, complet sur grand écran. */
function Summary({ text }: { text: string }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [clamped, setClamped] = useState(false)
  const ref = useRef<HTMLParagraphElement>(null)
  useLayoutEffect(() => {
    const p = ref.current
    if (p && !open) setClamped(p.scrollHeight > p.clientHeight + 1)
  }, [text, open])
  return (
    <div className="col-span-2 row-start-3 lg:mt-6">
      <p ref={ref} className={`text-[13px] leading-[1.5] text-foreground/90 lg:line-clamp-none lg:text-[14px] ${open ? "" : "line-clamp-3"}`}>
        {text}
      </p>
      {(clamped || open) && (
        <button type="button" onClick={() => setOpen((o) => !o)} className="mt-1 min-h-8 text-[13px] text-primary-text hover:underline lg:hidden">
          {open ? t("game.readLess") : t("game.readMore")}
        </button>
      )}
    </div>
  )
}

function Rows({ rows, className = "" }: { rows: Array<[string, string | null]>; className?: string }) {
  return (
    <dl className={`grid-cols-[auto_1fr] gap-x-7 gap-y-1.5 text-[13px] ${className}`}>
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
  const tags: Array<[string | null, string]> = [
    [digital ? valueLabel("support", c.support) : valueLabel("content", c.content), tagClass.ink],
    [c.quantity > 1 ? `×${c.quantity}` : null, tagClass.ink],
    [valueLabel("region", c.region), tagClass.neutral],
    [c.edition, tagClass.neutral],
    [valueLabel("playStatus", c.play_status), tagClass.accent],
    [c.status ? valueLabel("eventKind", c.status) : null, tagClass.accent],
  ]
  const details = [
    c.goal && `${t("game.copy.goal")} : ${valueLabel("goal", c.goal)}`,
    c.tags && `${t("game.copy.tags")} : ${c.tags}`,
    c.barcode && `${t("game.copy.barcode")} ${c.barcode}`,
    c.title_as_entered !== gameTitle ? t("game.copy.enteredAs", { title: c.title_as_entered }) : null,
  ].filter(Boolean)
  const bought = [formatDate(c.purchase_date), c.purchase_place].filter(Boolean).join(" · ")

  return (
    <section className="flex flex-col gap-3.5 rounded-card bg-card p-4">
      <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
          {tags
            .filter(([label]) => label)
            .map(([label, cls]) => (
              <span key={`${cls}${label}`} className={cls}>
                {label}
              </span>
            ))}
        </div>
        <Link
          to={`/jeux/${gameId}/exemplaires/${c.id}`}
          aria-label={t("common.edit")}
          title={t("common.edit")}
          className="-mt-1.5 -mr-1.5 grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors duration-150 hover:bg-background/60 hover:text-foreground"
        >
          <Pencil size={16} {...ICON} aria-hidden="true" />
        </Link>
      </div>

      {!digital && (
        <ConditionBlock
          items={[
            { label: t("game.copy.conditionGame"), value: c.condition_game },
            { label: t("game.copy.conditionBox"), value: c.condition_box },
            { label: t("game.copy.conditionManual"), value: c.condition_manual },
          ]}
        />
      )}

      {(c.price_cents !== null || bought) && (
        <dl className="grid grid-cols-2 gap-3">
          <div>
            <dt className="text-[11px] text-muted-foreground">{t("game.copy.paid")}</dt>
            <dd className="num text-[13px] font-semibold">{c.price_cents === null ? "—" : euros(c.price_cents)}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-muted-foreground">{t("game.copy.purchased")}</dt>
            <dd className="num text-[13px] break-words">{bought || "—"}</dd>
          </div>
        </dl>
      )}

      <ValueBlock valuations={c.valuations} priceCents={c.price_cents} postUrl={`/api/copies/${c.id}/valuations`} deleteBase="/api/valuations" onChanged={onChanged} />

      {c.comment && <p className="rounded-[16px] bg-muted px-3 py-2.5 text-[13px] whitespace-pre-line">{c.comment}</p>}
      {details.length > 0 && <p className="text-[12px] break-words text-muted-foreground">{details.join(" · ")}</p>}

      <PhotoStrip
        photos={c.photos}
        addTo={`/jeux/${gameId}/exemplaires/${c.id}`}
        onUseAsCover={async (photo) => {
          await send("POST", `/api/photos/${photo.id}/cover`)
          await onChanged()
        }}
      />

      <ItemLife events={c.events} postUrl={`/api/copies/${c.id}/events`} deleteBase="/api/events" onChanged={onChanged} />
    </section>
  )
}

