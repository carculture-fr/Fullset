import { useEffect, useMemo, useState, type FormEvent } from "react"
import { useTranslation } from "react-i18next"
import { Link, useNavigate, useParams } from "react-router-dom"

import { CONDITIONS, HW_CONTENTS, HW_KINDS, HW_WORKING, MANUAL_CONDITIONS, REGIONS } from "@domain"
import { Chips, ErrorNote, Field, ListChips, Menu, inputClass } from "@/components/fields"
import { PhotoField } from "@/components/photo-field"
import { api, errorMessage, send, type CatalogPlatform, type HardwareDetail, type HardwareItem, type Photo } from "@/lib/api"
import { todayIso } from "@/lib/format"
import { currentLanguage } from "@/lib/i18n"
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
      <Link to={id ? `/consoles/${id}` : "/consoles"} replace className="mb-3 inline-block text-sm text-muted-foreground hover:text-foreground">
        {t("hardwareEditor.back")}
      </Link>
      <div className="mb-5 flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">{id ? t("common.edit") : t("hardwareEditor.titleAdd")}</h1>
        {id && (
          <button onClick={remove} className="text-sm text-destructive hover:underline">
            {t("common.delete")}
          </button>
        )}
      </div>

      <form onSubmit={submit} className="space-y-5 pb-24">
        <Field label={t("hardwareEditor.type")}>
          <Chips options={HW_KINDS} valueGroup="hwKind" value={form.kind} allowNone={false} onChange={(x) => set("kind", x)} />
        </Field>
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
            <ListChips options={models} selected={form.model ? [form.model] : []} onToggle={toggle("model")} onAdd={async (x) => set("model", x)} visible={12} />
          </Field>
        )}
        <Field label={t("hardwareEditor.edition")}>
          <ListChips options={values("hw_edition")} selected={form.edition ? [form.edition] : []} onToggle={toggle("edition")} onAdd={async (x) => set("edition", await add("hw_edition", x))} />
        </Field>
        <Field label={t("hardwareEditor.color")}>
          <ListChips options={values("hw_color")} selected={form.color ? [form.color] : []} onToggle={toggle("color")} onAdd={async (x) => set("color", await add("hw_color", x))} />
        </Field>
        <Field label={t("hardwareEditor.region")}>
          <Chips options={REGIONS} valueGroup="region" value={orNull(form.region)} onChange={(x) => set("region", x)} />
        </Field>
        <Field label={t("hardwareEditor.content")}>
          <Chips options={HW_CONTENTS} valueGroup="hwContent" value={orNull(form.content)} onChange={(x) => set("content", x)} />
        </Field>
        <Field label={form.kind === "Console" ? t("hardwareEditor.conditionConsole") : t("hardwareEditor.conditionPiece")}>
          <Chips options={CONDITIONS} valueGroup="condition" value={orNull(form.condition_item)} onChange={(x) => set("condition_item", x)} />
        </Field>
        <Field label={t("hardwareEditor.conditionBox")}>
          <Chips options={CONDITIONS} valueGroup="condition" value={orNull(form.condition_box)} onChange={(x) => set("condition_box", x)} />
        </Field>
        <Field label={t("hardwareEditor.conditionManual")}>
          <Chips options={MANUAL_CONDITIONS} valueGroup="condition" value={orNull(form.condition_manual)} onChange={(x) => set("condition_manual", x)} />
        </Field>
        <Field label={t("hardwareEditor.working")}>
          <Chips options={HW_WORKING} valueGroup="hwWorking" value={orNull(form.working)} onChange={(x) => set("working", x)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("hardwareEditor.price")}>
            <input className={inputClass} inputMode="decimal" placeholder={t("hardwareEditor.pricePlaceholder")} value={form.price} onChange={(e) => set("price", e.target.value)} />
          </Field>
          <Field label={t("hardwareEditor.purchaseDate")}>
            <input className={inputClass} type="date" value={form.purchase_date} onChange={(e) => set("purchase_date", e.target.value)} />
          </Field>
        </div>
        <Field label={t("hardwareEditor.place")}>
          <ListChips options={values("place")} selected={form.purchase_place ? [form.purchase_place] : []} onToggle={toggle("purchase_place")} onAdd={async (x) => set("purchase_place", await add("place", x))} />
        </Field>
        <Field label={t("hardwareEditor.serial")}>
          <input className={inputClass} value={form.serial_number} onChange={(e) => set("serial_number", e.target.value)} />
        </Field>
        <Field label={t("hardwareEditor.comment")}>
          <textarea className={inputClass} rows={2} value={form.comment} onChange={(e) => set("comment", e.target.value)} />
        </Field>
        <Field label={t("hardwareEditor.photos")}>
          <PhotoField existing={photos} onDeleteExisting={id ? deletePhoto : undefined} files={files} onFiles={setFiles} />
        </Field>

        <ErrorNote message={error} />

        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
          <div className="mx-auto max-w-2xl">
            <button disabled={busy || !form.platform} className="w-full rounded-lg bg-primary py-3 font-medium text-primary-foreground disabled:opacity-50">
              {busy ? t("hardwareEditor.saving") : id ? t("common.save") : t("common.add")}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
