import { useState, type FormEvent } from "react"
import { Trans, useTranslation } from "react-i18next"

import { ErrorNote, inputClass } from "@/components/fields"
import { tagClass } from "@/components/page-bits"
import { api, errorMessage, send, type CommonsImage, type CoverOption, type HardwareDetail } from "@/lib/api"

/**
 * Image par défaut d'un élément de matériel : une photo de Wikimedia Commons, montrée par la
 * fiche (jaquette `fit="contain"`) tant qu'aucune photo n'est prise. Ce bloc porte le crédit,
 * « Changer » (propositions + recherche libre) et « Retirer ».
 */
export function HardwareImage({ item, onChanged }: { item: HardwareDetail; onChanged: () => void }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState("")
  const [options, setOptions] = useState<CommonsImage[] | null>(null)
  /** Ce que les autres sources branchées ont de cette console (ScreenScraper). */
  const [others, setOthers] = useState<CoverOption[]>([])
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
      const r = await api<{ query: string; options: CommonsImage[]; others?: CoverOption[] }>(
        `/api/hardware/${item.id}/image-options${query ? `?q=${encodeURIComponent(query)}` : ""}`,
      )
      setQ(r.query)
      setOptions(r.options)
      setOthers(r.others ?? [])
    })

  /** Image venue d'une autre source : elle se demande par son repère, jamais par son adresse. */
  const chooseOther = (o: CoverOption) =>
    run(async () => {
      await send("POST", `/api/hardware/${item.id}/image`, { key: o.key })
      setOpen(false)
      onChanged()
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
    <section className="space-y-2">
      <p className="text-xs text-muted-foreground">
        {item.image ? (
          <>
            <Trans
              i18nKey={item.image_credit ? "hardwareImage.creditWith" : "hardwareImage.creditWithout"}
              values={{ credit: item.image_credit }}
              components={{ link: <a href={item.image_page ?? "https://commons.wikimedia.org"} target="_blank" rel="noreferrer" className="underline" /> }}
            />
            {item.photos.length > 0 && t("hardwareImage.photosFirst")}
          </>
        ) : (
          t("hardwareImage.none")
        )}
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={toggle} aria-expanded={open} className={tagClass.outline}>
          {item.image ? t("hardwareImage.change") : t("hardwareImage.find")}
        </button>
        {item.image && (
          <button type="button" onClick={remove} disabled={busy} className={`${tagClass.surface} disabled:opacity-45`}>
            {t("hardwareImage.remove")}
          </button>
        )}
      </div>

      {open && (
        <div className="rounded-card bg-card p-3">
          <form onSubmit={submit} className="flex gap-2">
            <input className={`${inputClass} min-w-0 flex-1 bg-background`} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t("hardwareImage.searchLabel")} placeholder={t("hardwareImage.searchPlaceholder")} />
            <button disabled={busy || !q.trim()} className="shrink-0 rounded-full bg-primary px-4 font-heading text-[14px] text-primary-foreground disabled:opacity-45">
              {t("hardwareImage.searchButton")}
            </button>
          </form>
          <p className="mt-1.5 px-1 text-xs text-muted-foreground">{t("hardwareImage.searchHint")}</p>
          <ErrorNote message={error} />
          {busy && !options && <p className="mt-3 px-1 text-sm text-muted-foreground">{t("hardwareImage.searching")}</p>}
          {options && options.length === 0 && <p className="mt-3 px-1 text-sm text-muted-foreground">{t("hardwareImage.noResults")}</p>}
          {others.length > 0 && (
            <>
              <p className="mt-3 px-1 text-xs font-semibold text-muted-foreground">{t("hardwareImage.otherSources")}</p>
              <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {others.map((o) => (
                  <li key={o.key}>
                    <button
                      type="button"
                      onClick={() => chooseOther(o)}
                      disabled={busy}
                      className="block w-full overflow-hidden rounded-[16px] border border-border bg-white text-left transition-colors duration-150 hover:border-primary disabled:opacity-45"
                      title={o.label}
                    >
                      <img src={o.thumb} alt="" loading="lazy" className="aspect-[4/3] w-full object-contain p-1" />
                      <span className="block truncate bg-background px-2 py-1 text-[11px] text-muted-foreground">{o.label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          {options && options.length > 0 && (
            <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {options.map((o) => (
                <li key={o.title}>
                  <button
                    type="button"
                    onClick={() => choose(o)}
                    disabled={busy}
                    className="block w-full overflow-hidden rounded-[16px] border border-border bg-white text-left transition-colors duration-150 hover:border-primary disabled:opacity-45"
                    title={o.title.replace(/^File:/, "")}
                  >
                    <img src={o.thumb} alt="" loading="lazy" className="aspect-[4/3] w-full object-contain p-1" />
                    <span className="block truncate bg-background px-2 py-1 text-[11px] text-muted-foreground">{[o.artist, o.license].filter(Boolean).join(" · ") || o.title}</span>
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
