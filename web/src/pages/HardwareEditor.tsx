import { useEffect, useMemo, useState, type FormEvent } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate, useParams } from "react-router-dom"

import { HW_CONTENTS, HW_KINDS, HW_WORKING, REGIONS } from "@domain"
import { toneOf } from "@/components/condition"
import { ConditionGauge } from "@/components/condition-gauge"
import { ConditionsCard } from "@/components/copy-form"
import { Chips, ErrorNote, Field, ListChips, Menu, areaClass, inputClass } from "@/components/fields"
import { BackBar, Segmented, StickyCta } from "@/components/page-bits"
import { PhotoField } from "@/components/photo-field"
import { api, errorMessage, send, type CatalogPlatform, type HardwareDetail, type HardwareItem, type Photo } from "@/lib/api"
import { todayIso } from "@/lib/format"
import { currentLanguage, valueLabel } from "@/lib/i18n"
import { useLibrary } from "@/lib/library-data"
import { useLists, type ListKey } from "@/lib/lists"
import { searchPlatforms } from "@/lib/platform-search"
import { uploadPhotos } from "@/lib/save-copy"

const MAJOR_FAMILIES = ["Nintendo", "Sony", "Microsoft", "Sega"]

type Form = Record<
  | "kind"
  | "platform"
  | "model"
  | "edition"
  | "color"
  | "region"
  | "content"
  | "condition_item"
  | "condition_box"
  | "condition_manual"
  | "working"
  | "price"
  | "purchase_date"
  | "purchase_place"
  | "serial_number"
  | "comment",
  string
>

const EMPTY: Form = {
  kind: "Console",
  platform: "",
  model: "",
  edition: "",
  color: "",
  region: "PAL (Europe)",
  content: "Complet (boîte + notice)",
  condition_item: "",
  condition_box: "",
  condition_manual: "",
  working: "Fonctionnel",
  price: "",
  purchase_date: todayIso(),
  purchase_place: "",
  serial_number: "",
  comment: "",
}

const toForm = (h: HardwareItem): Form => ({
  kind: h.kind,
  platform: h.platform,
  model: h.model ?? "",
  edition: h.edition ?? "",
  color: h.color ?? "",
  region: h.region ?? "",
  content: h.content ?? "",
  condition_item: h.condition_item ?? "",
  condition_box: h.condition_box ?? "",
  condition_manual: h.condition_manual ?? "",
  working: h.working ?? "",
  // Virgule décimale en français ; le serveur accepte les deux.
  price: h.price_cents === null ? "" : (h.price_cents / 100).toFixed(2).replace(".", currentLanguage() === "fr" ? "," : "."),
  purchase_date: h.purchase_date ?? "",
  purchase_place: h.purchase_place ?? "",
  serial_number: h.serial_number ?? "",
  comment: h.comment ?? "",
})

/** Ajout (/consoles/ajouter) ou modification (/consoles/:id/modifier) d'une console, manette ou accessoire. */
export default function HardwareEditor() {
  const { t } = useTranslation()
  const { id } = useParams()
  const navigate = useNavigate()
  const { games } = useLibrary()
  const { lists, add } = useLists()
  const [form, setForm] = useState<Form | null>(id ? null : EMPTY)
  const [photos, setPhotos] = useState<Photo[]>([])
  const [files, setFiles] = useState<File[]>([])
  const [catalog, setCatalog] = useState<CatalogPlatform[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api<{ platforms: CatalogPlatform[] }>("/api/platforms").then((r) => setCatalog(r.platforms), () => {})
    if (id)
      api<HardwareDetail>(`/api/hardware/${id}`).then(
        (h) => {
          setForm(toForm(h))
          setPhotos(h.photos)
        },
        (err) => setError(errorMessage(err)),
      )
  }, [id])

  // Consoles proposées : celles déjà utilisées d'abord, puis les grands constructeurs de la plus
  // récente à la plus ancienne, puis le reste du catalogue RomM par nom. Une console de jeu
  // absente du catalogue (PC…) reste proposée.
  const platformOptions = useMemo(() => {
    const major = (p: CatalogPlatform) => MAJOR_FAMILIES.indexOf(p.family ?? "")
    const rank = (p: CatalogPlatform) => (p.used > 0 ? 0 : major(p) >= 0 ? 1 : 2)
    const sorted = [...catalog].sort(
      (a, b) => rank(a) - rank(b) || b.used - a.used || (rank(a) === 1 ? major(a) - major(b) || (b.generation ?? 0) - (a.generation ?? 0) : 0) || a.name.localeCompare(b.name, "fr"),
    )
    const extra = (games ?? []).map((g) => g.platform).filter((p) => !catalog.some((c) => c.name.toLowerCase() === p.toLowerCase()))
    const used = sorted.filter((p) => p.used > 0).map((p) => p.name)
    return [...new Set([...used, ...extra, ...sorted.map((p) => p.name)])]
  }, [catalog, games])
  const models = useMemo(() => catalog.find((p) => p.name.toLowerCase() === (form?.platform ?? "").toLowerCase())?.models ?? [], [catalog, form?.platform])

  if (!form) return <p className="py-16 text-center text-muted-foreground">{error ?? t("library.loading")}</p>

  const set = (key: keyof Form, value: string | null) => setForm((f) => ({ ...f!, [key]: value ?? "" }))
  const values = (k: ListKey) => lists?.[k].map((x) => x.value) ?? []
  const toggle = (key: keyof Form) => (x: string) => set(key, form[key].toLowerCase() === x.toLowerCase() ? "" : x)
  const orNull = (v: string) => v || null

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const target = id ? Number(id) : (await send<{ id: number }>("POST", "/api/hardware", form)).id
      if (id) await send("PUT", `/api/hardware/${id}`, form)
      await uploadPhotos(`/api/hardware/${target}/photos`, files)
      navigate(`/consoles/${target}`, { replace: true })
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!window.confirm(t("hardwareEditor.confirmDelete"))) return
    await send("DELETE", `/api/hardware/${id}`)
    navigate("/consoles", { replace: true })
  }

  const deletePhoto = async (p: Photo) => {
    if (!window.confirm(t("hardwareEditor.confirmDeletePhoto"))) return
    await send("DELETE", `/api/hardware-photos/${p.id}`)
    setPhotos((list) => list.filter((x) => x.id !== p.id))
  }

  return (
    <div className="mx-auto max-w-2xl">
      <BackBar to={id ? `/consoles/${id}` : "/consoles"} replace label={t("hardwareEditor.backLabel")}>
        {id && (
          <button onClick={remove} className="min-h-11 shrink-0 rounded-full px-3 text-[13px] font-semibold text-destructive hover:underline">
            {t("common.delete")}
          </button>
        )}
      </BackBar>
      <h1 className="mb-5 text-[26px]">{id ? t("common.edit") : t("hardwareEditor.titleAdd")}</h1>

      <form onSubmit={submit} className="space-y-3.5 pb-[90px]">
        <Segmented
          label={t("hardwareEditor.type")}
          options={HW_KINDS}
          value={form.kind as (typeof HW_KINDS)[number]}
          display={(k) => valueLabel("hwKind", k)}
          onChange={(k) => set("kind", k)}
        />
        <Field label={t("hardwareEditor.console")}>
          <Menu
            label={t("hardwareEditor.console")}
            options={platformOptions}
            selected={form.platform ? [form.platform] : []}
            onPick={(x) => setForm((f) => ({ ...f!, platform: x, model: "" }))}
            onClear={() => setForm((f) => ({ ...f!, platform: "", model: "" }))}
            onAdd={async (x) => setForm((f) => ({ ...f!, platform: x, model: "" }))}
            search={searchPlatforms}
            addOnlyIfNone
            placeholder={t("hardwareEditor.choosePlatform", { count: platformOptions.length })}
          />
        </Field>
        {form.platform && (
          <Field label={t("hardwareEditor.model")} hint={models.length ? t("hardwareEditor.modelHintKnown") : t("hardwareEditor.modelHintNew")}>
            <ListChips options={models} selected={form.model ? [form.model] : []} onToggle={toggle("model")} onAdd={async (x) => set("model", x)} />
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("hardwareEditor.edition")}>
            <ListChips options={values("hw_edition")} selected={form.edition ? [form.edition] : []} onToggle={toggle("edition")} onAdd={async (x) => set("edition", await add("hw_edition", x))} />
          </Field>
          <Field label={t("hardwareEditor.color")}>
            <ListChips options={values("hw_color")} selected={form.color ? [form.color] : []} onToggle={toggle("color")} onAdd={async (x) => set("color", await add("hw_color", x))} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("hardwareEditor.region")}>
            <Chips options={REGIONS} valueGroup="region" value={orNull(form.region)} onChange={(x) => set("region", x)} />
          </Field>
          <Field label={t("hardwareEditor.content")}>
            <Chips options={HW_CONTENTS} valueGroup="hwContent" value={orNull(form.content)} onChange={(x) => set("content", x)} />
          </Field>
        </div>

        <ConditionsCard>
          <ConditionGauge label={form.kind === "Console" ? t("hardwareDetail.console") : t("hardwareDetail.item")} value={orNull(form.condition_item)} onChange={(x) => set("condition_item", x)} />
          <ConditionGauge label={t("hardwareDetail.box")} value={orNull(form.condition_box)} onChange={(x) => set("condition_box", x)} />
          <ConditionGauge label={t("hardwareDetail.manual")} value={orNull(form.condition_manual)} onChange={(x) => set("condition_manual", x)} allowAbsent />
        </ConditionsCard>

        <Field label={t("hardwareEditor.working")}>
          <div role="radiogroup" aria-label={t("hardwareEditor.working")} className="flex flex-wrap gap-2">
            {HW_WORKING.map((w) => {
              const on = form.working === w
              return (
                <button
                  key={w}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => set("working", on ? "" : w)}
                  className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-[14px] transition-colors duration-150 ${
                    on ? "border-primary bg-primary-tint font-semibold text-primary-tint-foreground" : "border-border-strong bg-card"
                  }`}
                >
                  <span className="size-2 shrink-0 rounded-full" style={{ background: toneOf(w) }} aria-hidden="true" />
                  {valueLabel("hwWorking", w)}
                </button>
              )
            })}
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label={t("hardwareEditor.price")}>
            <input className={`${inputClass} num`} inputMode="decimal" placeholder={t("hardwareEditor.pricePlaceholder")} value={form.price} onChange={(e) => set("price", e.target.value)} />
          </Field>
          <Field label={t("hardwareEditor.purchaseDate")}>
            <input className={`${inputClass} num`} type="date" value={form.purchase_date} onChange={(e) => set("purchase_date", e.target.value)} />
          </Field>
        </div>
        <Field label={t("hardwareEditor.place")}>
          <ListChips options={values("place")} selected={form.purchase_place ? [form.purchase_place] : []} onToggle={toggle("purchase_place")} onAdd={async (x) => set("purchase_place", await add("place", x))} />
        </Field>
        <Field label={t("hardwareEditor.serial")}>
          <input className={`${inputClass} num`} value={form.serial_number} onChange={(e) => set("serial_number", e.target.value)} />
        </Field>
        <Field label={t("hardwareEditor.comment")}>
          <textarea className={areaClass} rows={2} value={form.comment} onChange={(e) => set("comment", e.target.value)} />
        </Field>
        <Field label={t("hardwareEditor.photos")}>
          <PhotoField existing={photos} onDeleteExisting={id ? deletePhoto : undefined} files={files} onFiles={setFiles} />
        </Field>

        <ErrorNote message={error} />

        <StickyCta disabled={busy || !form.platform} label={busy ? t("hardwareEditor.saving") : id ? t("common.save") : t("common.add")} />
      </form>
    </div>
  )
}
