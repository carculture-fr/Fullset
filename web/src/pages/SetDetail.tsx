import { HardDrive, Heart, ImageDown, Plus } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Link, useParams } from "react-router-dom"

import { Cover } from "@/components/cover"
import { ErrorNote } from "@/components/fields"
import { CARD_FRAME, COMPACT_FIELD, GRID_CLASS, SortMenu } from "@/components/library-tabs"
import { BackBar, ICON, Segmented } from "@/components/page-bits"
import { api, errorMessage, send, type SetItem, type SetSummary } from "@/lib/api"
import { euros } from "@/lib/format"

// Le « pokédex » d'une console : les jeux possédés en couleur, les manquants en silhouette.

type Filter = "tous" | "possedes" | "manquants"
type Sort = "position" | "nom" | "cote"
const SORTS: readonly Sort[] = ["position", "nom", "cote"]
const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()

export default function SetDetail() {
  const { t } = useTranslation()
  const { slug = "" } = useParams()
  const [data, setData] = useState<{ set: SetSummary; items: SetItem[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [filter, setFilter] = useState<Filter>("tous")
  const [sort, setSort] = useState<Sort>("position")
  const [q, setQ] = useState("")
  const [wished, setWished] = useState<number[]>([])

  const load = useCallback(
    () => api<{ set: SetSummary; items: SetItem[] }>(`/api/sets/${slug}`).then(setData, (err) => setError(errorMessage(err))),
    [slug],
  )
  useEffect(() => {
    load()
  }, [load])

  const shown = useMemo(() => {
    if (!data) return []
    const needle = norm(q.trim())
    const list = data.items.filter(
      (i) =>
        (filter === "tous" || (filter === "possedes") === (i.owned_game_id !== null)) &&
        (!needle || norm(i.title).includes(needle)),
    )
    if (sort === "nom") return [...list].sort((a, b) => a.title.localeCompare(b.title, "fr"))
    if (sort === "cote") return [...list].sort((a, b) => (b.price_cents ?? -1) - (a.price_cents ?? -1))
    return list
  }, [data, filter, sort, q])

  if (error && !data) return <p className="py-16 text-center text-destructive">{error}</p>
  if (!data) return <p className="py-16 text-center text-muted-foreground">{t("sets.loading")}</p>

  const { set } = data
  const percent = set.count ? Math.round((set.owned / set.count) * 100) : 0
  const withoutCover = data.items.filter((i) => !i.cover_url).length

  const covers = async () => {
    setBusy(true)
    setError(null)
    try {
      const r = await send<{ linked: number; remaining: number }>("POST", `/api/sets/${slug}/covers`)
      setNote(t("sets.coversDone", { linked: r.linked, remaining: r.remaining }))
      await load()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const checkRomm = async () => {
    setBusy(true)
    setError(null)
    try {
      const r = await send<{ matched: number; roms: number; platform: string | null }>("POST", `/api/sets/${slug}/romm`)
      setNote(r.platform ? t("sets.rommDone", { matched: r.matched, roms: r.roms, platform: r.platform }) : t("sets.rommNone"))
      await load()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const wish = async (item: SetItem) => {
    try {
      await send("POST", "/api/wishlist", { title: item.title, platform: set.platform, igdb_id: item.igdb_id, cover_url: item.cover_url })
      setWished((w) => [...w, item.position])
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <div className="pb-4">
      <BackBar to="/fullset" label={set.name} />

      <div className="mt-3 rounded-card bg-card p-4">
        <h1 className="text-[22px] leading-tight">{set.name}</h1>
        <p className="mt-0.5 text-[12px] text-muted-foreground">
          {set.platform}
          {set.source_url && (
            <>
              {" · "}
              <a href={set.source_url} target="_blank" rel="noreferrer noopener" className="underline">
                {t("sets.sourcePage", { source: set.source })}
              </a>
            </>
          )}
        </p>
        <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-background">
          <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${percent}%` }} />
        </div>
        <p className="num mt-1.5 text-[12px] text-muted-foreground">
          <strong className="font-semibold text-foreground">{t("sets.progress", { owned: set.owned, count: set.count })}</strong> · {t("sets.percent", { percent })} ·{" "}
          {t("sets.missing", { count: set.count - set.owned })}
          {set.missing_cents > 0 && <> · {t("sets.budgetLeft", { amount: euros(set.missing_cents) })}</>}
        </p>
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-2.5">
        <div className="basis-full sm:basis-auto">
          <Segmented options={["tous", "possedes", "manquants"] as const} value={filter} onChange={setFilter} label={t("sets.title")} display={(v) => t(v === "tous" ? "sets.all" : v === "possedes" ? "sets.owned" : "sets.missingFilter")} />
        </div>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("sets.searchPlaceholder")}
          aria-label={t("sets.searchPlaceholder")}
          className="h-10 min-w-0 basis-full rounded-full border border-border-strong bg-card px-4 text-base outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-muted-foreground focus:border-primary focus:shadow-[0_0_0_3px_var(--primary-tint)] sm:max-w-xs sm:flex-1 sm:basis-auto"
        />
        <SortMenu label={t("sets.title")} choices={SORTS.map((s) => ({ key: s, label: t(`sets.sort${s === "position" ? "Position" : s === "nom" ? "Name" : "Price"}`) }))} value={sort} onChange={setSort} className={`w-40 ${COMPACT_FIELD}`} />
        {withoutCover > 0 && (
          <button type="button" onClick={covers} disabled={busy} className="flex h-10 items-center gap-2 rounded-full bg-card px-4 text-[13px] font-semibold transition-colors duration-150 hover:bg-foreground/7 disabled:opacity-45">
            <ImageDown size={16} {...ICON} aria-hidden="true" />
            {busy ? t("sets.coversRunning") : t("sets.covers")}
          </button>
        )}
        <button type="button" onClick={checkRomm} disabled={busy} className="flex h-10 items-center gap-2 rounded-full bg-card px-4 text-[13px] font-semibold transition-colors duration-150 hover:bg-foreground/7 disabled:opacity-45">
          <HardDrive size={16} {...ICON} aria-hidden="true" />
          {busy ? t("sets.rommRunning") : t("sets.romm")}
        </button>
      </div>
      {(error || note) && <div className="mt-2.5">{error ? <ErrorNote message={error} /> : <p className="text-[12px] text-muted-foreground">{note}</p>}</div>}

      {shown.length === 0 ? (
        <p className="py-16 text-center text-muted-foreground">{t("sets.noMatch")}</p>
      ) : (
        <ul className={`mt-4 ${GRID_CLASS}`}>
          {shown.map((item) => (
            <li key={item.position}>
              <SetCard item={item} platform={set.platform} wished={wished.includes(item.position)} onWish={() => wish(item)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function SetCard({ item, platform, wished, onWish }: { item: SetItem; platform: string; wished: boolean; onWish: () => void }) {
  const { t } = useTranslation()
  const owned = item.owned_game_id !== null
  const add = `/ajouter?titre=${encodeURIComponent(item.title)}&plateforme=${encodeURIComponent(platform)}${item.igdb_id ? `&igdb=${item.igdb_id}` : ""}`
  return (
    <div className="group">
      <Link to={owned ? `/jeux/${item.owned_game_id}` : add} className="block rounded-[12px]" title={owned ? item.title : t("sets.iHaveIt")}>
        <div className={`${CARD_FRAME} ${owned ? "" : "opacity-45 grayscale"}`}>
          <Cover src={item.owned_cover ?? item.cover_url} title={item.title} platform={platform} className="w-full" />
        </div>
      </Link>
      <div className={`mt-1.5 line-clamp-2 text-[12px] leading-[1.25] ${owned ? "" : "text-muted-foreground"}`}>{item.title}</div>
      {item.price_cents !== null && !owned && (
        <div className="num text-[11px] text-subtle-foreground">
          {euros(item.price_cents)}
          {item.in_romm && <span className="ml-1.5 rounded-full bg-primary-tint px-1.5 py-px font-sans text-[10px] font-semibold text-primary-tint-foreground">{t("sets.inRomm")}</span>}
        </div>
      )}
      {!owned && (
        <div className="mt-1 flex gap-1">
          <Link to={add} className="flex min-h-8 flex-1 items-center justify-center gap-1 rounded-full bg-card text-[11px] font-semibold transition-colors duration-150 hover:bg-foreground/7">
            <Plus size={13} {...ICON} aria-hidden="true" />
            {t("sets.iHaveIt")}
          </Link>
          <button
            type="button"
            onClick={onWish}
            disabled={wished}
            aria-label={t("sets.addToWishlist")}
            title={wished ? t("sets.added") : t("sets.addToWishlist")}
            className={`grid size-8 shrink-0 place-items-center rounded-full transition-colors duration-150 ${wished ? "bg-primary-tint text-primary-tint-foreground" : "bg-card hover:bg-foreground/7"}`}
          >
            <Heart size={13} {...ICON} aria-hidden="true" fill={wished ? "currentColor" : "none"} />
          </button>
        </div>
      )}
    </div>
  )
}
