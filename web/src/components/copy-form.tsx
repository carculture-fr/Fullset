import { ChevronDown } from "lucide-react"
import { useState, type FormEvent, type ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { ConditionGauge } from "@/components/condition-gauge"
import { Cover } from "@/components/cover"
import { ICON, Segmented, StickyCta } from "@/components/page-bits"
import { PhotoField } from "@/components/photo-field"
import { Scanner } from "@/components/scanner"

import { CONTENTS, DIGITAL, GOALS, PLAY_STATUSES, REGIONS, SUPPORTS } from "@domain"
import { Chips, ErrorNote, Field, ListChips, areaClass, inputClass } from "@/components/fields"
import type { CopyDetail, Photo } from "@/lib/api"
import { euros, todayIso } from "@/lib/format"
import { currentLanguage, valueLabel } from "@/lib/i18n"
import { useLists, type ListKey } from "@/lib/lists"

export type CopyFormValues = {
  support: string | null
  content: string | null
  condition_game: string | null
  condition_box: string | null
  condition_manual: string | null
  play_status: string | null
  goal: string | null
  region: string | null
  edition: string
  price: string
  purchase_date: string
  purchase_place: string
  quantity: string
  tags: string
  barcode: string
  comment: string
  title_as_entered: string
  completion_date: string
  play_time_hours: string
  completion_pct: string
  rating: string
}

/** Valeurs par défaut d'un achat : ce qui est vrai la plupart du temps, pour ne saisir que l'essentiel. */
export function newCopyValues(platform?: string): CopyFormValues {
  const digital = platform === "PC"
  return {
    support: digital ? DIGITAL : "Physique",
    content: digital ? DIGITAL : "Complet (jeu + boîte + notice)",
    condition_game: null,
    condition_box: null,
    condition_manual: null,
    play_status: "Pas commencé",
    goal: "À garder",
    region: "PAL (Europe)",
    edition: "Standard",
    price: "",
    purchase_date: todayIso(),
    purchase_place: "",
    quantity: "1",
    tags: "",
    barcode: "",
    comment: "",
    title_as_entered: "",
    completion_date: "",
    play_time_hours: "",
    completion_pct: "",
    rating: "",
  }
}

const str = (v: string | number | null | undefined) => (v === null || v === undefined ? "" : String(v))

export function copyToValues(c: CopyDetail): CopyFormValues {
  return {
    support: c.support,
    content: c.content,
    condition_game: c.condition_game,
    condition_box: c.condition_box,
    condition_manual: c.condition_manual,
    play_status: c.play_status,
    goal: c.goal,
    region: c.region,
    edition: str(c.edition),
    // Virgule en français, point en anglais : le serveur accepte les deux.
    price: c.price_cents === null ? "" : (c.price_cents / 100).toFixed(2).replace(".", currentLanguage() === "fr" ? "," : "."),
    purchase_date: str(c.purchase_date),
    purchase_place: str(c.purchase_place),
    quantity: str(c.quantity),
    tags: str(c.tags),
    barcode: str(c.barcode),
    comment: str(c.comment),
    title_as_entered: c.title_as_entered,
    completion_date: str(c.completion_date),
    play_time_hours: str(c.play_time_hours),
    completion_pct: str(c.completion_pct),
    rating: str(c.rating),
  }
}

/** Montant saisi (« 4,00 », « 4.5 ») repris dans le bouton, ou null s'il ne se lit pas. */
export function typedAmount(price: string): string | null {
  const s = price.replace(/\s/g, "").replace(",", ".")
  const n = Number(s)
  return s && Number.isFinite(n) && n >= 0 ? euros(Math.round(n * 100)) : null
}

type Props = {
  initial: CopyFormValues
  submitLabel: string
  onSubmit: (values: CopyFormValues, newPhotos: File[]) => Promise<void>
  existingPhotos?: Photo[]
  onDeletePhoto?: (photo: Photo) => void
  /** Ajout : le montant saisi se répète dans le bouton (« Ajouter à la collection · 4,00 € »). */
  repeatAmount?: boolean
  /** « Plus de champs » ouvert d'emblée (modification : le statut ou les tags sont souvent la cible). */
  startExpanded?: boolean
}

const splitTags = (s: string) =>
  s
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)

/** Rappel du jeu en tête du formulaire : vignette, console en kicker, titre, code retenu. */
export function GameRecap({ cover, title, platform, heading, ean }: { cover: string | null; title: string; platform?: string | null; heading?: string; ean?: string | null }) {
  const { t } = useTranslation()
  return (
    <div className="mb-5 flex items-center gap-3.5">
      <Cover src={cover} title={title} platform={platform} size="thumb" className="w-[52px] shrink-0" />
      <div className="min-w-0">
        {platform && <div className="truncate text-[11px] tracking-[0.08em] text-primary-text uppercase">{platform}</div>}
        <h1 className="text-[21px] leading-[1.1] break-words">{heading ?? title}</h1>
        {ean && <div className="mt-1 truncate font-mono text-[11px] text-muted-foreground">{t("copyForm.eanKept", { ean })}</div>}
      </div>
    </div>
  )
}

/** Carte des trois états (jauges à cinq crans), partagée avec le matériel. */
export function ConditionsCard({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  return (
    <section className="rounded-card bg-card px-4 py-3.5">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <h2 className="text-[16px]">{t("copyForm.conditionsTitle")}</h2>
        <span className="text-[11px] text-muted-foreground">{t("copyForm.conditionsHint")}</span>
      </div>
      {children}
    </section>
  )
}

export function CopyForm({ initial, submitLabel, onSubmit, existingPhotos = [], onDeletePhoto, repeatAmount = false, startExpanded = false }: Props) {
  const { t } = useTranslation()
  const [v, setV] = useState(initial)
  const [photos, setPhotos] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [more, setMore] = useState(startExpanded)
  const { lists, add } = useLists()
  const values = (k: ListKey) => lists?.[k].map((x) => x.value) ?? []
  const tags = splitTags(v.tags)
  const toggleTag = (t: string) =>
    set("tags", (tags.some((x) => x.toLowerCase() === t.toLowerCase()) ? tags.filter((x) => x.toLowerCase() !== t.toLowerCase()) : [...tags, t]).join(", "))

  const set = <K extends keyof CopyFormValues>(key: K, value: CopyFormValues[K]) => setV((prev) => ({ ...prev, [key]: value }))
  const digital = v.support === DIGITAL
  const amount = repeatAmount ? typedAmount(v.price) : null

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await onSubmit(v, photos)
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.unknownError"))
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3.5 pb-[90px]">
      {scanning && (
        <Scanner
          onClose={() => setScanning(false)}
          onDetected={(ean) => {
            set("barcode", ean)
            setScanning(false)
          }}
        />
      )}
      <Segmented
        label={t("copyForm.support")}
        options={SUPPORTS}
        value={v.support as (typeof SUPPORTS)[number] | null}
        display={(s) => valueLabel("support", s)}
        onChange={(s) => setV((prev) => ({ ...prev, support: s, content: s === DIGITAL ? DIGITAL : prev.content === DIGITAL ? "Complet (jeu + boîte + notice)" : prev.content }))}
      />

      {!digital && (
        <>
          <Field label={t("copyForm.content")}>
            <Chips valueGroup="content" options={CONTENTS.filter((c) => c !== DIGITAL)} value={v.content} onChange={(x) => set("content", x)} />
          </Field>
          <ConditionsCard>
            <ConditionGauge label={t("game.copy.conditionGame")} value={v.condition_game} onChange={(x) => set("condition_game", x)} />
            <ConditionGauge label={t("game.copy.conditionBox")} value={v.condition_box} onChange={(x) => set("condition_box", x)} />
            <ConditionGauge label={t("game.copy.conditionManual")} value={v.condition_manual} onChange={(x) => set("condition_manual", x)} allowAbsent />
          </ConditionsCard>
        </>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label={t("copyForm.price")}>
          <input className={`${inputClass} num`} inputMode="decimal" placeholder={t("copyForm.pricePlaceholder")} value={v.price} onChange={(e) => set("price", e.target.value)} />
        </Field>
        <Field label={t("copyForm.purchaseDate")}>
          <input className={`${inputClass} num`} type="date" value={v.purchase_date} onChange={(e) => set("purchase_date", e.target.value)} />
        </Field>
      </div>

      <Field label={t("copyForm.place")}>
        <ListChips
          options={values("place")}
          selected={v.purchase_place ? [v.purchase_place] : []}
          onToggle={(x) => set("purchase_place", v.purchase_place.toLowerCase() === x.toLowerCase() ? "" : x)}
          onAdd={async (x) => set("purchase_place", await add("place", x))}
        />
      </Field>

      <button type="button" onClick={() => setMore((m) => !m)} aria-expanded={more} className="flex min-h-11 w-full items-center gap-2 text-left text-[14px] font-semibold text-primary-text">
        <span className="min-w-0 flex-1">{more ? t("copyForm.fewer") : t("copyForm.moreDetail")}</span>
        <ChevronDown size={18} {...ICON} aria-hidden="true" className={`shrink-0 transition-transform duration-150 ${more ? "rotate-180" : ""}`} />
      </button>

      {more && (
        <div className="space-y-3.5">
          <Field label={t("copyForm.status")}>
            <Chips valueGroup="playStatus" options={PLAY_STATUSES} value={v.play_status} onChange={(x) => set("play_status", x)} />
          </Field>
          <Field label={t("copyForm.goal")}>
            <Chips valueGroup="goal" options={GOALS} value={v.goal} onChange={(x) => set("goal", x)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("copyForm.region")}>
              <Chips valueGroup="region" options={REGIONS} value={v.region} onChange={(x) => set("region", x)} />
            </Field>
            <Field label={t("copyForm.edition")}>
              <ListChips
                options={values("edition")}
                selected={v.edition ? [v.edition] : []}
                onToggle={(x) => set("edition", v.edition.toLowerCase() === x.toLowerCase() ? "" : x)}
                onAdd={async (x) => set("edition", await add("edition", x))}
              />
            </Field>
          </div>
          <Field label={t("copyForm.tags")} hint={t("copyForm.tagsHint")}>
            <ListChips multiple options={values("tag")} selected={tags} onToggle={toggleTag} onAdd={async (x) => toggleTag(await add("tag", x))} placeholder={t("copyForm.noTag")} />
          </Field>
          <Field label={t("copyForm.photos")}>
            <PhotoField existing={existingPhotos} onDeleteExisting={onDeletePhoto} files={photos} onFiles={setPhotos} />
          </Field>
          <Field label={t("copyForm.comment")}>
            <textarea className={areaClass} rows={2} value={v.comment} onChange={(e) => set("comment", e.target.value)} />
          </Field>
          <Field label={t("copyForm.titleEntered")} hint={t("copyForm.titleEnteredHint")}>
            <input className={inputClass} value={v.title_as_entered} onChange={(e) => set("title_as_entered", e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("copyForm.quantity")}>
              <input className={`${inputClass} num`} inputMode="numeric" value={v.quantity} onChange={(e) => set("quantity", e.target.value)} />
            </Field>
            <Field label={t("copyForm.barcode")}>
              <div className="flex gap-1.5">
                <input className={`${inputClass} num min-w-0 flex-1`} inputMode="numeric" value={v.barcode} onChange={(e) => set("barcode", e.target.value)} />
                <button
                  type="button"
                  onClick={() => setScanning(true)}
                  aria-label={t("copyForm.scan")}
                  title={t("copyForm.scan")}
                  className="grid size-12 shrink-0 place-items-center rounded-full border border-border-strong bg-card text-muted-foreground hover:text-foreground"
                >
                  <BarcodeIcon />
                </button>
              </div>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("copyForm.completed")}>
              <input className={`${inputClass} num`} type="date" value={v.completion_date} onChange={(e) => set("completion_date", e.target.value)} />
            </Field>
            <Field label={t("copyForm.duration")}>
              <input className={`${inputClass} num`} inputMode="decimal" value={v.play_time_hours} onChange={(e) => set("play_time_hours", e.target.value)} />
            </Field>
            <Field label={t("copyForm.completion")}>
              <input className={`${inputClass} num`} inputMode="numeric" value={v.completion_pct} onChange={(e) => set("completion_pct", e.target.value)} />
            </Field>
            <Field label={t("copyForm.rating")}>
              <input className={`${inputClass} num`} inputMode="numeric" value={v.rating} onChange={(e) => set("rating", e.target.value)} />
            </Field>
          </div>
        </div>
      )}

      <ErrorNote message={error} />

      <StickyCta disabled={busy} label={busy ? t("copyForm.saving") : amount ? `${submitLabel} · ${amount}` : submitLabel} />
    </form>
  )
}

export function BarcodeIcon({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" />
      <path d="M7 8v8M10 8v8M13 8v8M17 8v8" />
    </svg>
  )
}
