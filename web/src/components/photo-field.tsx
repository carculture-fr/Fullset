import { Plus, X } from "lucide-react"
import { useEffect, useMemo } from "react"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"

import { ICON } from "@/components/page-bits"
import type { Photo } from "@/lib/api"

const thumb = "size-[72px] rounded-[10px] object-cover"
const removeButton = "absolute -top-1.5 -right-1.5 grid size-7 place-items-center rounded-full bg-background text-foreground shadow-sm"

/** Photos déjà enregistrées (supprimables) et nouvelles photos choisies, envoyées à l'enregistrement. */
export function PhotoField({
  existing = [],
  onDeleteExisting,
  files,
  onFiles,
}: {
  existing?: Photo[]
  onDeleteExisting?: (p: Photo) => void
  files: File[]
  onFiles: (files: File[]) => void
}) {
  const { t } = useTranslation()
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files])
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews])

  return (
    <div className="flex flex-wrap gap-2.5">
      {existing.map((p) => (
        <div key={p.id} className="relative">
          <img src={p.url} alt="" className={thumb} />
          {onDeleteExisting && (
            <button type="button" onClick={() => onDeleteExisting(p)} aria-label={t("photoField.delete")} className={removeButton}>
              <X size={14} {...ICON} aria-hidden="true" />
            </button>
          )}
        </div>
      ))}
      {previews.map((u, i) => (
        <div key={u} className="relative">
          <img src={u} alt="" className={`${thumb} opacity-80`} />
          <button type="button" onClick={() => onFiles(files.filter((_, j) => j !== i))} aria-label={t("photoField.remove")} className={removeButton}>
            <X size={14} {...ICON} aria-hidden="true" />
          </button>
        </div>
      ))}
      <label className="grid size-[72px] cursor-pointer place-items-center rounded-[10px] border-[1.5px] border-dashed border-border-strong text-muted-foreground transition-colors duration-150 hover:text-foreground">
        <Plus size={20} {...ICON} aria-hidden="true" />
        <span className="sr-only">{t("photoField.add")}</span>
        <input
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            onFiles([...files, ...(e.target.files ?? [])])
            e.target.value = ""
          }}
        />
      </label>
    </div>
  )
}

/** Vignettes 56 px d'une fiche (exemplaire, matériel), avec la case « + » qui mène au formulaire. */
export function PhotoStrip({ photos, addTo }: { photos: Photo[]; addTo: string }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-wrap gap-2">
      {photos.map((p) => (
        <a key={p.id} href={p.url} target="_blank" rel="noreferrer" className="block">
          <img src={p.url} alt="" loading="lazy" className="size-14 rounded-[10px] object-cover" />
        </a>
      ))}
      <Link
        to={addTo}
        aria-label={t("photoField.add")}
        title={t("photoField.add")}
        className="grid size-14 place-items-center rounded-[10px] border-[1.5px] border-dashed border-border-strong text-muted-foreground transition-colors duration-150 hover:text-foreground"
      >
        <Plus size={18} {...ICON} aria-hidden="true" />
      </Link>
    </div>
  )
}
