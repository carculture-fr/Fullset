import { useCallback, useEffect, useState, type FormEvent } from "react"
import { Link } from "react-router-dom"

import { Cover } from "@/components/cover"
import { Chips, ErrorNote, Field, inputClass } from "@/components/fields"
import { IgdbSearch } from "@/components/igdb-search"
import { api, errorMessage, send, type IgdbCandidate, type WishItem } from "@/lib/api"
import { euros, plural } from "@/lib/format"

type Draft = { igdb_id: number | null; title: string; platform: string; cover_url: string | null; target_price: string; note: string }

const priceText = (cents: number | null) => (cents === null ? "" : (cents / 100).toFixed(2).replace(".", ","))

export default function Wishlist() {
  const [items, setItems] = useState<WishItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const load = useCallback(() => api<{ items: WishItem[] }>("/api/wishlist").then((r) => setItems(r.items), (err) => setError(errorMessage(err))), [])
  useEffect(() => {
    load()
  }, [load])

  if (error) return <p className="py-16 text-center text-destructive">{error}</p>
  if (!items) return <p className="py-16 text-center text-muted-foreground">Chargement…</p>

  const budget = items.reduce((n, w) => n + (w.target_price_cents ?? 0), 0)

  return (
    <div className="mx-auto max-w-2xl space-y-5 pb-10">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Liste de souhaits</h1>
          <p className="text-sm text-muted-foreground">
            {plural(items.length, "jeu", "jeux")}
            {budget > 0 && ` · budget cible ${euros(budget)}`}
          </p>
        </div>
        {!adding && (
          <button onClick={() => setAdding(true)} className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">
            + Ajouter
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
        <p className="py-10 text-center text-muted-foreground">Aucun souhait pour l'instant.</p>
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
    if (!window.confirm(`Retirer « ${w.title} » de la liste de souhaits ?`)) return
    await send("DELETE", `/api/wishlist/${w.id}`)
    onChanged()
  }

  const params = new URLSearchParams({ souhait: String(w.id) })
  return (
    <li className="flex gap-3 rounded-lg bg-card p-3">
      <Cover src={w.cover_url} title={w.title} className="aspect-[3/4] w-16 shrink-0 rounded" />
      <div className="min-w-0 flex-1">
        <div className="font-medium leading-tight">{w.title}</div>
        <div className="text-xs text-muted-foreground">{w.platform ?? "Plateforme non précisée"}</div>
        {editing ? (
          <form onSubmit={save} className="mt-2 space-y-2">
            <input className={inputClass} inputMode="decimal" placeholder="Prix cible (€)" value={price} onChange={(e) => setPrice(e.target.value)} />
            <input className={inputClass} placeholder="Note (édition voulue, état…)" value={note} onChange={(e) => setNote(e.target.value)} />
            <ErrorNote message={error} />
            <div className="flex gap-2">
              <button className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground">Enregistrer</button>
              <button type="button" onClick={() => setEditing(false)} className="px-2 text-sm text-muted-foreground">
                Annuler
              </button>
            </div>
          </form>
        ) : (
          <>
            <div className="mt-1 text-sm">{w.target_price_cents === null ? <span className="text-muted-foreground">Sans prix cible</span> : `Prix cible : ${euros(w.target_price_cents)}`}</div>
            {w.note && <div className="text-sm text-muted-foreground">{w.note}</div>}
            {w.owned_game_id !== null && (
              <Link to={`/jeux/${w.owned_game_id}`} className="mt-1 inline-block rounded-full bg-primary/20 px-2.5 py-0.5 text-xs text-primary">
                Déjà dans la collection
              </Link>
            )}
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
              <Link to={`/ajouter?${params}`} className="font-medium text-primary hover:underline">
                Je l'ai acheté
              </Link>
              <button onClick={() => setEditing(true)} className="text-muted-foreground hover:text-foreground">
                Modifier
              </button>
              <button onClick={remove} className="text-muted-foreground hover:text-destructive">
                Retirer
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
    <section className="space-y-4 rounded-lg bg-card p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Nouveau souhait</h2>
        <button onClick={onCancel} className="text-sm text-muted-foreground">
          Annuler
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
          <button onClick={() => start(null)} className="text-sm text-muted-foreground underline">
            Saisir sans IGDB
          </button>
        </>
      )}
      {!draft && candidate && (
        <Field label={`${candidate.name} : sur quelle plateforme ?`}>
          <Chips options={candidate.platforms} value={null} onChange={(p) => p && start(candidate, p)} placeholder="Choisir la plateforme" />
        </Field>
      )}
      {draft && (
        <form onSubmit={save} className="space-y-3">
          {draft.igdb_id === null ? (
            <Field label="Titre">
              <input className={inputClass} autoFocus value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            </Field>
          ) : (
            <div className="font-medium">{draft.title}</div>
          )}
          <Field label="Plateforme">
            <input className={inputClass} value={draft.platform} onChange={(e) => setDraft({ ...draft, platform: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Prix cible (€)">
              <input className={inputClass} inputMode="decimal" value={draft.target_price} onChange={(e) => setDraft({ ...draft, target_price: e.target.value })} />
            </Field>
            <Field label="Note">
              <input className={inputClass} placeholder="PAL, complet…" value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
            </Field>
          </div>
          <ErrorNote message={error} />
          <button className="w-full rounded-lg bg-primary py-2.5 font-medium text-primary-foreground">Ajouter à la liste</button>
        </form>
      )}
    </section>
  )
}
