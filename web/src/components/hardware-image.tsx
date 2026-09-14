import { useState, type FormEvent } from "react"
import { Trans, useTranslation } from "react-i18next"

import { ErrorNote, inputClass } from "@/components/fields"
import { api, errorMessage, send, type CommonsImage, type HardwareDetail } from "@/lib/api"

/**
 * Image par défaut d'un élément de matériel : une photo de Wikimedia Commons, affichée tant
 * qu'aucune photo n'est prise (une photo prise passe toujours devant, dans la liste aussi).
 */
export function HardwareImage({ item, onChanged }: { item: HardwareDetail; onChanged: () => void }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState("")
  const [options, setOptions] = useState<CommonsImage[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const search = (query?: string) =>
    run(async () => {
      const r = await api<{ query: string; options: CommonsImage[] }>(`/api/hardware/${item.id}/image-options${query ? `?q=${encodeURIComponent(query)}` : ""}`)
      setQ(r.query)
      setOptions(r.options)
    })

  const toggle = () => {
    setOpen(!open)
    if (!open && !options) search()
  }

  const choose = (o: CommonsImage) =>
    run(async () => {
      await send("POST", `/api/hardware/${item.id}/image`, { title: o.title })
      setOpen(false)
      onChanged()
    })

  const remove = () =>
    run(async () => {
      await send("DELETE", `/api/hardware/${item.id}/image`)
      onChanged()
    })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (q.trim()) search(q.trim())
  }

  return (
    <section className="mt-4">
      {item.image && item.photos.length === 0 && (
        <figure className="overflow-hidden rounded-lg bg-white">
          <img src={item.image} alt={t("hardwareImage.alt", { platform: item.platform })} className="mx-auto max-h-64 w-full object-contain p-3" />
        </figure>
      )}
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {item.image ? (
          <span className="min-w-0">
            <Trans
              i18nKey={item.image_credit ? "hardwareImage.creditWith" : "hardwareImage.creditWithout"}
              values={{ credit: item.image_credit }}
              components={{ link: <a href={item.image_page ?? "https://commons.wikimedia.org"} target="_blank" rel="noreferrer" className="underline" /> }}
            />
            {item.photos.length > 0 && t("hardwareImage.photosFirst")}
          </span>
        ) : (
          <span>{t("hardwareImage.none")}</span>
        )}
        <button onClick={toggle} className="text-primary underline">
          {item.image ? t("hardwareImage.change") : t("hardwareImage.find")}
        </button>
        {item.image && (
          <button onClick={remove} disabled={busy} className="underline disabled:opacity-50">
            {t("hardwareImage.remove")}
          </button>
        )}
      </div>

      {open && (
        <div className="mt-3 rounded-lg bg-card p-3">
          <form onSubmit={submit} className="flex gap-2">
            <input className={`${inputClass} min-w-0 flex-1 py-2`} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t("hardwareImage.searchLabel")} placeholder={t("hardwareImage.searchPlaceholder")} />
            <button disabled={busy || !q.trim()} className="rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50">
              {t("hardwareImage.searchButton")}
            </button>
          </form>
          <p className="mt-1.5 text-xs text-muted-foreground">{t("hardwareImage.searchHint")}</p>
          <ErrorNote message={error} />
          {busy && !options && <p className="mt-3 text-sm text-muted-foreground">{t("hardwareImage.searching")}</p>}
          {options && options.length === 0 && <p className="mt-3 text-sm text-muted-foreground">{t("hardwareImage.noResults")}</p>}
          {options && options.length > 0 && (
            <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {options.map((o) => (
                <li key={o.title}>
                  <button
                    onClick={() => choose(o)}
                    disabled={busy}
                    className="block w-full overflow-hidden rounded-md border border-border bg-white text-left hover:border-primary disabled:opacity-50"
                    title={o.title.replace(/^File:/, "")}
                  >
                    <img src={o.thumb} alt="" loading="lazy" className="aspect-[4/3] w-full object-contain p-1" />
                    <span className="block truncate bg-card px-1.5 py-1 text-[11px] text-muted-foreground">{[o.artist, o.license].filter(Boolean).join(" · ") || o.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
