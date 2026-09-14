import { useState, type FormEvent } from "react"

import { PhotoField } from "@/components/photo-field"
import { Scanner } from "@/components/scanner"

import { CONDITIONS, CONTENTS, DIGITAL, GOALS, MANUAL_CONDITIONS, PLAY_STATUSES, REGIONS, SUPPORTS } from "@domain"
import { Chips, ErrorNote, Field, ListChips, inputClass } from "@/components/fields"
import type { CopyDetail, Photo } from "@/lib/api"
import { todayIso } from "@/lib/format"
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
    price: c.price_cents === null ? "" : (c.price_cents / 100).toFixed(2).replace(".", ","),
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

type Props = {
  initial: CopyFormValues
  submitLabel: string
  onSubmit: (values: CopyFormValues, newPhotos: File[]) => Promise<void>
  existingPhotos?: Photo[]
  onDeletePhoto?: (photo: Photo) => void
}

const splitTags = (s: string) =>
  s
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)

export function CopyForm({ initial, submitLabel, onSubmit, existingPhotos = [], onDeletePhoto }: Props) {
  const [v, setV] = useState(initial)
  const [photos, setPhotos] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const { lists, add } = useLists()
  const values = (k: ListKey) => lists?.[k].map((x) => x.value) ?? []
  const tags = splitTags(v.tags)
  const toggleTag = (t: string) =>
    set("tags", (tags.some((x) => x.toLowerCase() === t.toLowerCase()) ? tags.filter((x) => x.toLowerCase() !== t.toLowerCase()) : [...tags, t]).join(", "))

  const set = <K extends keyof CopyFormValues>(key: K, value: CopyFormValues[K]) => setV((prev) => ({ ...prev, [key]: value }))
  const digital = v.support === DIGITAL

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await onSubmit(v, photos)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue.")
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5 pb-24">
      {scanning && (
        <Scanner
          onClose={() => setScanning(false)}
          onDetected={(ean) => {
            set("barcode", ean)
            setScanning(false)
          }}
        />
      )}
      <Field label="Support">
        <Chips
          options={SUPPORTS}
          value={v.support}
          allowNone={false}
          onChange={(s) => setV((prev) => ({ ...prev, support: s, content: s === DIGITAL ? DIGITAL : prev.content === DIGITAL ? "Complet (jeu + boîte + notice)" : prev.content }))}
        />
      </Field>

      {!digital && (
        <>
          <Field label="Contenu">
            <Chips options={CONTENTS.filter((c) => c !== DIGITAL)} value={v.content} onChange={(x) => set("content", x)} />
          </Field>
          <Field label="État du jeu">
            <Chips options={CONDITIONS} value={v.condition_game} onChange={(x) => set("condition_game", x)} />
          </Field>
          <Field label="État de la boîte">
            <Chips options={CONDITIONS} value={v.condition_box} onChange={(x) => set("condition_box", x)} />
          </Field>
          <Field label="État de la notice">
            <Chips options={MANUAL_CONDITIONS} value={v.condition_manual} onChange={(x) => set("condition_manual", x)} />
          </Field>
        </>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Prix payé (€)">
          <input className={inputClass} inputMode="decimal" placeholder="0,00" value={v.price} onChange={(e) => set("price", e.target.value)} />
        </Field>
        <Field label="Date d'achat">
          <input className={inputClass} type="date" value={v.purchase_date} onChange={(e) => set("purchase_date", e.target.value)} />
        </Field>
      </div>

      <Field label="Lieu d'achat">
        <ListChips
          options={values("place")}
          selected={v.purchase_place ? [v.purchase_place] : []}
          onToggle={(x) => set("purchase_place", v.purchase_place.toLowerCase() === x.toLowerCase() ? "" : x)}
          onAdd={async (x) => set("purchase_place", await add("place", x))}
        />
      </Field>

      <Field label="Statut">
        <Chips options={PLAY_STATUSES} value={v.play_status} onChange={(x) => set("play_status", x)} />
      </Field>
      <Field label="Objectif">
        <Chips options={GOALS} value={v.goal} onChange={(x) => set("goal", x)} />
      </Field>

      <Field label="Région">
        <Chips options={REGIONS} value={v.region} onChange={(x) => set("region", x)} />
      </Field>
      <Field label="Édition">
        <ListChips
          options={values("edition")}
          selected={v.edition ? [v.edition] : []}
          onToggle={(x) => set("edition", v.edition.toLowerCase() === x.toLowerCase() ? "" : x)}
          onAdd={async (x) => set("edition", await add("edition", x))}
        />
      </Field>
      <Field label="Tags" hint="Plusieurs possibles.">
        <ListChips multiple options={values("tag")} selected={tags} onToggle={toggleTag} onAdd={async (x) => toggleTag(await add("tag", x))} placeholder="Aucun tag" />
      </Field>

      <Field label="Commentaire">
        <textarea className={inputClass} rows={2} value={v.comment} onChange={(e) => set("comment", e.target.value)} />
      </Field>

      <Field label="Photos de l'exemplaire">
        <PhotoField existing={existingPhotos} onDeleteExisting={onDeletePhoto} files={photos} onFiles={setPhotos} />
      </Field>

      <details className="rounded-lg bg-card px-4 py-3">
        <summary className="cursor-pointer text-sm text-muted-foreground">Plus de champs</summary>
        <div className="mt-4 space-y-4">
          <Field label="Titre tel que saisi" hint="Laisser vide pour reprendre le titre du jeu.">
            <input className={inputClass} value={v.title_as_entered} onChange={(e) => set("title_as_entered", e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Quantité">
              <input className={inputClass} inputMode="numeric" value={v.quantity} onChange={(e) => set("quantity", e.target.value)} />
            </Field>
            <Field label="Code-barres">
              <div className="flex gap-1.5">
                <input className={`${inputClass} min-w-0 flex-1`} inputMode="numeric" value={v.barcode} onChange={(e) => set("barcode", e.target.value)} />
                <button
                  type="button"
                  onClick={() => setScanning(true)}
                  aria-label="Scanner le code-barres"
                  title="Scanner le code-barres"
                  className="flex w-11 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground"
                >
                  <BarcodeIcon />
                </button>
              </div>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Terminé le">
              <input className={inputClass} type="date" value={v.completion_date} onChange={(e) => set("completion_date", e.target.value)} />
            </Field>
            <Field label="Durée (heures)">
              <input className={inputClass} inputMode="decimal" value={v.play_time_hours} onChange={(e) => set("play_time_hours", e.target.value)} />
            </Field>
            <Field label="Achevé (%)">
              <input className={inputClass} inputMode="numeric" value={v.completion_pct} onChange={(e) => set("completion_pct", e.target.value)} />
            </Field>
            <Field label="Note (/100)">
              <input className={inputClass} inputMode="numeric" value={v.rating} onChange={(e) => set("rating", e.target.value)} />
            </Field>
          </div>
        </div>
      </details>

      <ErrorNote message={error} />

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
        <div className="mx-auto max-w-2xl">
          <button disabled={busy} className="w-full rounded-lg bg-primary py-3 font-medium text-primary-foreground disabled:opacity-50">
            {busy ? "Enregistrement…" : submitLabel}
          </button>
        </div>
      </div>
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
