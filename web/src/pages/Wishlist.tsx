import { Plus } from "lucide-react"
import { useCallback, useEffect, useState, type FormEvent } from "react"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"

import { Cover } from "@/components/cover"
import { Chips, ErrorNote, Field, inputClass } from "@/components/fields"
import { IgdbSearch } from "@/components/igdb-search"
import { api, errorMessage, send, type IgdbCandidate, type WishItem } from "@/lib/api"
import { euros } from "@/lib/format"
import { currentLanguage } from "@/lib/i18n"

type Draft = { igdb_id: number | null; title: string; platform: string; cover_url: string | null; target_price: string; note: string }

const primaryButton =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-primary px-5 font-heading text-[15px] text-primary-foreground transition-[filter,transform] duration-150 hover:brightness-95 active:scale-[.98] disabled:opacity-45"
const ghostButton = "inline-flex min-h-10 items-center rounded-full px-3.5 text-[13px] font-semibold text-muted-foreground transition-colors duration-150 hover:bg-foreground/[.07] hover:text-foreground"

// Montant à modifier, avec le séparateur décimal de la langue (le serveur accepte les deux).
const priceText = (cents: number | null) => (cents === null ? "" : (cents / 100).toFixed(2).replace(".", currentLanguage() === "fr" ? "," : "."))

export default function Wishlist() {
  const { t } = useTranslation()
  const [items, setItems] = useState<WishItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const load = useCallback(() => api<{ items: WishItem[] }>("/api/wishlist").then((r) => setItems(r.items), (err) => setError(errorMessage(err))), [])
  useEffect(() => {
    load()
  }, [load])

  if (error) return <p className="py-16 text-center text-destructive">{error}</p>
  if (!items) return <p className="py-16 text-center text-muted-foreground">{t("wishlist.loading")}</p>

  const budget = items.reduce((n, w) => n + (w.target_price_cents ?? 0), 0)

  return (
    <div className="mx-auto max-w-2xl space-y-5 pb-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[36px]">{t("wishlist.title")}</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {t("wishlist.games", { count: items.length })}
            {budget > 0 && (
              <>
                {" · "}
                <span className="num font-semibold text-foreground">{t("wishlist.budget", { amount: euros(budget) })}</span>
              </>
            )}
          </p>
        </div>
        {!adding && (
          <button onClick={() => setAdding(true)} className={primaryButton}>
            <Plus size={18} strokeWidth={2.75} aria-hidden="true" />
            {t("wishlist.add")}
          </button>
        )}
      </div>

      {adding && (
        <AddWish
          onCancel={() => setAdding(false)}
          onSaved={async () => {
            setAdding(false)
            await load()
          }}
        />
      )}

      {items.length === 0 && !adding ? (
        <p className="py-10 text-center text-muted-foreground">{t("wishlist.empty")}</p>
      ) : (
        <ul className="space-y-3">
          {items.map((w) => (
            <WishCard key={w.id} item={w} onChanged={load} />
          ))}
        </ul>
      )}
    </div>
  )
}

function WishCard({ item: w, onChanged }: { item: WishItem; onChanged: () => void }) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [price, setPrice] = useState(priceText(w.target_price_cents))
  const [note, setNote] = useState(w.note ?? "")
  const [error, setError] = useState<string | null>(null)

  const save = async (e: FormEvent) => {
    e.preventDefault()
    try {
      await send("PUT", `/api/wishlist/${w.id}`, { ...w, target_price: price, note })
      setEditing(false)
      onChanged()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  const remove = async () => {
    if (!window.confirm(t("wishlist.confirmRemove", { title: w.title }))) return
    await send("DELETE", `/api/wishlist/${w.id}`)
    onChanged()
  }

  const params = new URLSearchParams({ souhait: String(w.id) })
  return (
    <li className="flex gap-4 rounded-card bg-card p-4">
      <Cover src={w.cover_url} title={w.title} platform={w.platform} size="thumb" className="w-16 shrink-0 self-start" />
      <div className="min-w-0 flex-1">
        <div className="text-[11px] tracking-[0.08em] text-primary-text uppercase">{w.platform ?? t("wishlist.noPlatform")}</div>
        <div className="mt-0.5 text-[15px] leading-tight font-semibold">{w.title}</div>
        {editing ? (
          <form onSubmit={save} className="mt-3 space-y-2">
            <input className={inputClass} inputMode="decimal" placeholder={t("wishlist.targetPricePlaceholder")} value={price} onChange={(e) => setPrice(e.target.value)} />
            <input className={inputClass} placeholder={t("wishlist.notePlaceholder")} value={note} onChange={(e) => setNote(e.target.value)} />
            <ErrorNote message={error} />
            <div className="flex flex-wrap gap-2">
              <button className={primaryButton}>{t("common.save")}</button>
              <button type="button" onClick={() => setEditing(false)} className={ghostButton}>
                {t("common.cancel")}
              </button>
            </div>
          </form>
        ) : (
          <>
            <div className="mt-1.5 text-[13px]">
              {w.target_price_cents === null ? (
                <span className="text-muted-foreground">{t("wishlist.noTargetPrice")}</span>
              ) : (
                <span className="num">{t("wishlist.targetPrice", { amount: euros(w.target_price_cents) })}</span>
              )}
            </div>
            {w.note && <div className="text-[13px] text-muted-foreground">{w.note}</div>}
            {w.owned_game_id !== null && (
              <Link to={`/jeux/${w.owned_game_id}`} className="mt-2 inline-flex rounded-full bg-primary-tint px-2.5 py-0.5 text-[11px] font-semibold text-primary-tint-foreground">
                {t("wishlist.owned")}
              </Link>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <Link to={`/ajouter?${params}`} className={`${primaryButton} min-h-10 px-4 text-[14px]`}>
                {t("wishlist.bought")}
              </Link>
              <button onClick={() => setEditing(true)} className={ghostButton}>
                {t("common.edit")}
              </button>
              <button onClick={remove} className={`${ghostButton} hover:text-destructive`}>
                {t("wishlist.remove")}
              </button>
            </div>
          </>
        )}
      </div>
    </li>
  )
}

/** Ajout d'un souhait : recherche IGDB puis plateforme, ou saisie libre. */
function AddWish({ onCancel, onSaved }: { onCancel: () => void; onSaved: () => void }) {
  const { t } = useTranslation()
  const [candidate, setCandidate] = useState<IgdbCandidate | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [error, setError] = useState<string | null>(null)

  const start = (c: IgdbCandidate | null, platform = "") =>
    setDraft({ igdb_id: c?.igdb_id ?? null, title: c?.name ?? "", platform, cover_url: c?.cover ?? null, target_price: "", note: "" })

  const save = async (e: FormEvent) => {
    e.preventDefault()
    try {
      await send("POST", "/api/wishlist", draft)
      onSaved()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <section className="space-y-4 rounded-card bg-card p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[20px]">{t("wishlist.newWish")}</h2>
        <button onClick={onCancel} className={ghostButton}>
          {t("common.cancel")}
        </button>
      </div>
      {!draft && !candidate && (
        <>
          <IgdbSearch
            onPick={(c) => {
              if (c.platforms.length === 1) start(c, c.platforms[0])
              else setCandidate(c)
            }}
          />
          <button onClick={() => start(null)} className="text-[13px] font-semibold text-primary-text underline underline-offset-2">
            {t("wishlist.withoutIgdb")}
          </button>
        </>
      )}
      {!draft && candidate && (
        <Field label={t("wishlist.whichPlatform", { title: candidate.name })}>
          <Chips options={candidate.platforms} value={null} onChange={(p) => p && start(candidate, p)} placeholder={t("wishlist.choosePlatform")} />
        </Field>
      )}
      {draft && (
        <form onSubmit={save} className="space-y-3.5">
          {draft.igdb_id === null ? (
            <Field label={t("wishlist.fieldTitle")}>
              <input className={inputClass} autoFocus value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            </Field>
          ) : (
            <div className="font-heading text-[18px]">{draft.title}</div>
          )}
          <Field label={t("wishlist.fieldPlatform")}>
            <input className={inputClass} value={draft.platform} onChange={(e) => setDraft({ ...draft, platform: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("wishlist.fieldTargetPrice")}>
              <input className={`${inputClass} num`} inputMode="decimal" value={draft.target_price} onChange={(e) => setDraft({ ...draft, target_price: e.target.value })} />
            </Field>
            <Field label={t("wishlist.fieldNote")}>
              <input className={inputClass} placeholder={t("wishlist.fieldNotePlaceholder")} value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
            </Field>
          </div>
          <ErrorNote message={error} />
          <button className={`${primaryButton} min-h-[54px] w-full text-[16px]`}>{t("wishlist.addToList")}</button>
        </form>
      )}
    </section>
  )
}
