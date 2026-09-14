import { useEffect, useMemo } from "react"

import type { Photo } from "@/lib/api"

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
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files])
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews])

  return (
    <div className="grid grid-cols-4 gap-2">
      {existing.map((p) => (
        <div key={p.id} className="relative">
          <img src={p.url} alt="" className="aspect-square w-full rounded-md object-cover" />
          {onDeleteExisting && (
            <button type="button" onClick={() => onDeleteExisting(p)} aria-label="Supprimer la photo" className="absolute top-1 right-1 rounded bg-background/85 px-1.5 text-sm">
              ×
            </button>
          )}
        </div>
      ))}
      {previews.map((u, i) => (
        <div key={u} className="relative">
          <img src={u} alt="" className="aspect-square w-full rounded-md object-cover opacity-80" />
          <button type="button" onClick={() => onFiles(files.filter((_, j) => j !== i))} aria-label="Retirer la photo" className="absolute top-1 right-1 rounded bg-background/85 px-1.5 text-sm">
            ×
          </button>
        </div>
      ))}
      <label className="flex aspect-square cursor-pointer items-center justify-center rounded-md border border-dashed border-border text-2xl text-muted-foreground">
        +
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
