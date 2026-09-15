import { Plus } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Link, useSearchParams } from "react-router-dom"

import { ConditionDot } from "@/components/condition"
import { Cover } from "@/components/cover"
import { CARD_FRAME, COMPACT_FIELD, GRID_CLASS, GroupSummary, LibraryTabs, ROW_CLASS, SortMenu, ViewToggle, readView, writeSession, type View } from "@/components/library-tabs"
import { api, errorMessage, type HardwareItem } from "@/lib/api"
import { euros, formatDate } from "@/lib/format"
import { valueLabel } from "@/lib/i18n"
import { HARDWARE_SORTS, usePreferences, type HardwareSort } from "@/lib/preferences"

export const hardwareTitle = (h: Pick<HardwareItem, "platform" | "model" | "kind">) =>
  h.model ? `${h.platform} ${h.model}` : h.kind === "Console" ? h.platform : `${valueLabel("hwKind", h.kind)} ${h.platform}`

const collator = new Intl.Collator("fr", { sensitivity: "base", numeric: true })
const VIEW_KEY = "fullset-hardware-view"

// Plus récent ou plus cher d'abord ; sans date ni prix, en fin de liste.
function sortHardware(items: HardwareItem[], sort: HardwareSort) {
  const byTitle = (a: HardwareItem, b: HardwareItem) => collator.compare(hardwareTitle(a), hardwareTitle(b))
  const list = [...items]
  if (sort === "achat") return list.sort((a, b) => (b.purchase_date ?? "").localeCompare(a.purchase_date ?? "") || byTitle(a, b))
  if (sort === "prix") return list.sort((a, b) => (b.price_cents ?? -1) - (a.price_cents ?? -1) || byTitle(a, b))
  return list.sort(byTitle)
}

export default function Hardware() {
  const { t } = useTranslation()
  const { prefs } = usePreferences()
  const [params, setParams] = useSearchParams()
  const [items, setItems] = useState<HardwareItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Pas de réglage pour le matériel : la grille par défaut, le choix vaut pour la visite.
  const [view, setView] = useState<View>(() => readView(VIEW_KEY) ?? "grille")
  useEffect(() => {
    api<{ items: HardwareItem[] }>("/api/hardware").then((r) => setItems(r.items), (err) => setError(errorMessage(err)))
  }, [])

  // Le tri choisi ici vit dans l'adresse, le temps de la visite ; celui par défaut vient des réglages.
  const sort = HARDWARE_SORTS.find((s) => s.key === params.get("tri"))?.key ?? prefs.hardware_sort
  const setSort = (key: HardwareSort) => setParams(key === prefs.hardware_sort ? {} : { tri: key }, { replace: true })
  const changeView = (v: View) => {
    setView(v)
    writeSession(VIEW_KEY, v)
  }

  const groups = useMemo(() => {
    const map = new Map<string, HardwareItem[]>()
    for (const h of sortHardware(items ?? [], "nom")) map.set(h.platform, [...(map.get(h.platform) ?? []), h])
    return [...map].sort((a, b) => collator.compare(a[0], b[0]))
  }, [items])
  const flat = useMemo(() => (items && sort !== "plateforme" ? sortHardware(items, sort) : []), [items, sort])

  const title = <h1 className="text-[29px] leading-[1.1]">{t("layout.library")}</h1>
  if (error) {
    return (
      <div>
        {title}
        <p className="py-16 text-center text-destructive">{error}</p>
      </div>
    )
  }
  if (!items) {
    return (
      <div>
        {title}
        <p role="status" className="py-16 text-center text-muted-foreground">
          {t("library.loading")}
        </p>
      </div>
    )
  }
  const spent = items.reduce((n, h) => n + (h.price_cents ?? 0), 0)

  const renderItems = (list: HardwareItem[], showPlatform: boolean) =>
    view === "grille" ? (
      <ul className={GRID_CLASS}>
        {list.map((h) => (
          <li key={h.id}>
            <HardwareCard item={h} showPlatform={showPlatform} />
          </li>
        ))}
      </ul>
    ) : (
      <ul>
        {list.map((h) => (
          <li key={h.id}>
            <HardwareRow item={h} showPlatform={showPlatform} />
          </li>
        ))}
      </ul>
    )

  return (
    <div>
      {title}
      <p className="num mt-1 text-[13px] text-muted-foreground">
        {t("hardware.items", { count: items.length })} · <strong className="font-semibold text-foreground">{euros(spent)}</strong>
      </p>

      <div className="mt-3.5 flex flex-wrap items-center gap-x-2 gap-y-3">
        <LibraryTabs />
        {items.length > 0 && (
          <div className="ml-auto">
            <ViewToggle value={view} onChange={changeView} />
          </div>
        )}
      </div>

      {/* Le « + » du dock mène à l'ajout d'un jeu : l'ajout de matériel a son propre bouton ici. */}
      <div className="mt-3 mb-1 flex items-end gap-3 lg:mb-5">
        {items.length > 0 && (
          <SortMenu
            label={t("hardware.sortLabel")}
            choices={HARDWARE_SORTS.map((s) => ({ key: s.key, label: t(`sorts.hardware.${s.key}`) }))}
            value={sort}
            onChange={setSort}
            className={`w-full max-w-xs lg:max-w-60 ${COMPACT_FIELD}`}
          />
        )}
        <Link
          to="/consoles/ajouter"
          className="ml-auto flex h-11 shrink-0 items-center gap-2 rounded-full bg-card px-4 font-heading text-[14px] text-foreground transition-colors duration-150 hover:bg-foreground/7"
        >
          <Plus size={18} strokeWidth={2.75} aria-hidden="true" />
          {t("hardware.addHardware")}
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">
          <p>{t("hardware.empty")}</p>
          <Link to="/consoles/ajouter" className="mt-5 inline-flex h-11 items-center rounded-full bg-primary px-6 font-heading text-[15px] text-primary-foreground">
            {t("hardware.addConsole")}
          </Link>
        </div>
      ) : sort !== "plateforme" ? (
        <div className="mt-3">{renderItems(flat, true)}</div>
      ) : (
        <div className="mt-3 space-y-3 lg:space-y-5">
          {groups.map(([platform, list]) => (
            <details key={platform} open className="group">
              <GroupSummary name={platform} meta={`${t("hardware.items", { count: list.length })} · ${euros(list.reduce((n, h) => n + (h.price_cents ?? 0), 0))}`} />
              <div className="pb-2">{renderItems(list, false)}</div>
            </details>
          ))}
        </div>
      )}
    </div>
  )
}

// Une photo prise passe devant l'image Commons ; les deux restent entières dans le cadre (fond blanc fondu).
const imageOf = (h: HardwareItem) => h.photo ?? h.image

function HardwareCard({ item: h, showPlatform }: { item: HardwareItem; showPlatform: boolean }) {
  useTranslation()
  const name = hardwareTitle(h)
  return (
    <Link to={`/consoles/${h.id}`} className="group block rounded-[12px]">
      <div className={CARD_FRAME}>
        <Cover src={imageOf(h)} title={name} platform={h.platform} fit="contain" className="w-full" />
      </div>
      <div className="mt-1.5 line-clamp-2 text-[12px] leading-[1.25]">{name}</div>
      {showPlatform && <div className="truncate text-[11px] text-muted-foreground">{h.platform}</div>}
      {h.working && (
        <div className="mt-0.5 text-[11px] text-muted-foreground">
          <ConditionDot value={h.working} size={7} />
        </div>
      )}
    </Link>
  )
}

function HardwareRow({ item: h, showPlatform }: { item: HardwareItem; showPlatform: boolean }) {
  useTranslation()
  const name = hardwareTitle(h)
  const details = [showPlatform ? h.platform : null, h.kind !== "Console" ? valueLabel("hwKind", h.kind) : null, h.edition, h.color].filter(Boolean).join(" · ")
  return (
    <Link to={`/consoles/${h.id}`} className={ROW_CLASS}>
      <Cover src={imageOf(h)} title={name} platform={h.platform} size="thumb" fit="contain" className="w-[38px]" />
      <div className="min-w-0">
        <div className="truncate text-[14px] font-semibold">{name}</div>
        <div className="flex min-w-0 items-center gap-1 text-[12px] text-muted-foreground">
          <span className="truncate">{details}</span>
          {h.working && (
            <>
              {details && <span aria-hidden="true">·</span>}
              <ConditionDot value={h.working} size={7} />
            </>
          )}
        </div>
      </div>
      <div className="text-right">
        <div className="num text-[14px] font-semibold">{h.price_cents === null ? "—" : euros(h.price_cents)}</div>
        {h.purchase_date && <div className="num text-[11px] text-muted-foreground">{formatDate(h.purchase_date)}</div>}
      </div>
    </Link>
  )
}
