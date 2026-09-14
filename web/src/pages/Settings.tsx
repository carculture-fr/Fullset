import { useEffect, useState, type FormEvent, type ReactNode } from "react"
import { Link } from "react-router-dom"

import { ErrorNote, Field, KeyedChips, inputClass } from "@/components/fields"
import { api, errorMessage, send, type Account, type SteamStatus, type SteamSyncReport } from "@/lib/api"
import { plural } from "@/lib/format"
import { SORTS } from "@/lib/library"
import { useLibrary } from "@/lib/library-data"
import { useLists, type ListKey, type ListValue } from "@/lib/lists"
import { GROUPS, HARDWARE_SORTS, VIEWS, usePreferences, type Preferences } from "@/lib/preferences"
import { useSession } from "@/lib/session"

const LIST_LABELS: Record<ListKey, string> = {
  place: "Lieux d'achat",
  edition: "Éditions (jeux)",
  tag: "Tags",
  hw_edition: "Éditions (matériel)",
  hw_color: "Couleurs",
}

export default function Settings() {
  return (
    <div className="mx-auto max-w-2xl space-y-5 pb-10">
      <h1 className="text-xl font-semibold">Réglages</h1>
      <Profile />
      <DisplaySection />
      <Security />
      <ListsManager />
      <SteamSection />
      <Section title="Codes-barres" note="Les codes appris au scan ou saisis sur tes exemplaires : les voir, les corriger, les exporter.">
        <Link to="/codes-barres" className="inline-block rounded-lg border border-border px-3 py-2 text-sm">
          Gérer les codes-barres
        </Link>
      </Section>
    </div>
  )
}

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="rounded-lg bg-card p-5">
      <h2 className="font-semibold">{title}</h2>
      {note && <p className="mt-0.5 text-xs text-muted-foreground">{note}</p>}
      <div className="mt-4">{children}</div>
    </section>
  )
}

function Saved({ message }: { message: string | null }) {
  return message ? <p className="rounded-lg bg-muted px-3 py-2 text-sm">{message}</p> : null
}

function Profile() {
  const [form, setForm] = useState({ username: "", display_name: "", email: "" })
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)

  useEffect(() => {
    api<Account>("/api/account").then(
      (a) => setForm({ username: a.username, display_name: a.display_name ?? "", email: a.email ?? "" }),
      (err) => setError(errorMessage(err)),
    )
  }, [])

  const save = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setSaved(null)
    try {
      await send("PUT", "/api/account", form)
      setSaved("Profil enregistré.")
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <Section title="Profil">
      <form onSubmit={save} className="space-y-3">
        <Field label="Nom affiché">
          <input className={inputClass} value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} />
        </Field>
        <Field label="Identifiant" hint="Celui qui sert à se connecter.">
          <input className={inputClass} autoComplete="username" autoCapitalize="none" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
        </Field>
        <Field label="E-mail" hint="Facultatif.">
          <input className={inputClass} type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>
        <ErrorNote message={error} />
        <Saved message={saved} />
        <button className="rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground">Enregistrer le profil</button>
      </form>
    </Section>
  )
}

/** Affichage par défaut : enregistré aussitôt, le même sur tous ses appareils. */
function DisplaySection() {
  const { prefs, save } = usePreferences()
  const [error, setError] = useState<string | null>(null)
  const set = (patch: Partial<Preferences>) => {
    setError(null)
    save(patch).catch((err) => setError(errorMessage(err)))
  }

  return (
    <Section title="Affichage par défaut" note="Comment s'ouvrent tes listes, sur tous tes appareils. Le tri et les boutons de la bibliothèque ne changent l'affichage que le temps de la visite.">
      <div className="space-y-3">
        <Field label="Jeux : tri">
          <KeyedChips label="Tri des jeux par défaut" choices={SORTS} value={prefs.games_sort} onChange={(v) => set({ games_sort: v })} />
        </Field>
        {prefs.games_sort === "plateforme" && (
          <Field label="Jeux : consoles à l'ouverture">
            <KeyedChips label="Consoles à l'ouverture" choices={GROUPS} value={prefs.games_groups} onChange={(v) => set({ games_groups: v })} />
          </Field>
        )}
        <Field label="Jeux : présentation">
          <KeyedChips label="Présentation des jeux par défaut" choices={VIEWS} value={prefs.games_view} onChange={(v) => set({ games_view: v })} />
        </Field>
        <Field label="Consoles et matériel : tri">
          <KeyedChips label="Tri du matériel par défaut" choices={HARDWARE_SORTS} value={prefs.hardware_sort} onChange={(v) => set({ hardware_sort: v })} />
        </Field>
        <ErrorNote message={error} />
      </div>
    </Section>
  )
}

function Security() {
  const { logout } = useSession()
  const [saved, setSaved] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pw, setPw] = useState({ current: "", password: "", confirm: "" })

  const others = async () => {
    await send("POST", "/api/account/logout-others", {})
    setSaved("Les autres appareils sont déconnectés.")
  }
  const changePassword = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setSaved(null)
    if (pw.password !== pw.confirm) return setError("Les deux nouveaux mots de passe ne sont pas identiques.")
    try {
      await send("PUT", "/api/account/password", { current: pw.current, password: pw.password })
      setPw({ current: "", password: "", confirm: "" })
      setSaved("Mot de passe changé ; les autres appareils sont déconnectés.")
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <Section title="Sécurité" note="Une session se ferme après 14 jours sans visite.">
      <form onSubmit={changePassword} className="space-y-3">
        <Field label="Mot de passe actuel">
          <input className={inputClass} type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
        </Field>
        <Field label="Nouveau mot de passe" hint="10 caractères au moins.">
          <input className={inputClass} type="password" autoComplete="new-password" value={pw.password} onChange={(e) => setPw({ ...pw, password: e.target.value })} />
        </Field>
        <Field label="Confirme le nouveau mot de passe">
          <input className={inputClass} type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />
        </Field>
        <button disabled={!pw.current || pw.password.length < 10} className="rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50">
          Changer le mot de passe
        </button>
      </form>
      <div className="mt-3 space-y-3">
        <ErrorNote message={error} />
        <Saved message={saved} />
      </div>
      <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
        <button onClick={others} className="rounded-lg border border-border px-3 py-2 text-sm">
          Déconnecter les autres appareils
        </button>
        <button onClick={logout} className="rounded-lg border border-border px-3 py-2 text-sm">
          Se déconnecter
        </button>
      </div>
    </Section>
  )
}

/** Bibliothèque Steam : lecture au bouton seulement, jeux absents sur un écran de choix. */
function SteamSection() {
  const library = useLibrary()
  const [status, setStatus] = useState<SteamStatus | null>(null)
  const [report, setReport] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const load = () => api<SteamStatus>("/api/steam").then(setStatus, (err) => setError(errorMessage(err)))
  useEffect(() => {
    load()
  }, [])

  const sync = async () => {
    setBusy(true)
    setError(null)
    setReport(null)
    try {
      const r = await send<SteamSyncReport>("POST", "/api/steam/sync")
      setReport(
        `${plural(r.owned, "jeu")} sur Steam, ${r.recognised} reconnus par IGDB ; ${plural(r.linked, "jeu relié", "jeux reliés")}, ${plural(r.playtime, "temps de jeu mis", "temps de jeu mis")} à jour.`,
      )
      await load()
      await library.reload()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Section title="Steam" note="Relie tes jeux PC à ta bibliothèque Steam et reprend leur temps de jeu, quand tu appuies sur le bouton.">
      {status && !status.configured && (
        <p className="text-sm text-muted-foreground">Steam n'est pas encore configuré : il faut ta clé API Steam et ton SteamID sur le serveur.</p>
      )}
      {status?.configured && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {status.synced_at
              ? `Dernière lecture le ${new Date(status.synced_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })} : ${plural(status.owned, "jeu")}, ${plural(status.linked, "relié", "reliés")} à ta collection.`
              : "Jamais synchronisé."}
          </p>
          <div className="flex flex-wrap gap-2">
            <button onClick={sync} disabled={busy} className="rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50">
              {busy ? "Lecture de Steam…" : "Synchroniser maintenant"}
            </button>
            {status.candidates > 0 && (
              <Link to="/steam" className="rounded-lg border border-border px-3 py-2.5 text-sm">
                Choisir les jeux à ajouter ({status.candidates})
              </Link>
            )}
          </div>
          <Saved message={report} />
        </div>
      )}
      <ErrorNote message={error} />
    </Section>
  )
}

function ListsManager() {
  const { lists, reload } = useLists()
  const library = useLibrary()
  const [tab, setTab] = useState<ListKey>("place")
  const [draft, setDraft] = useState("")
  const [error, setError] = useState<string | null>(null)

  const run = async (action: () => Promise<unknown>) => {
    setError(null)
    try {
      await action()
      await reload()
      await library.reload() // un renommage change les exemplaires affichés
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  const values = lists?.[tab] ?? []
  const tabClass = (on: boolean) => `rounded-md px-3 py-1.5 text-sm ${on ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"}`

  return (
    <Section title="Listes" note="Les valeurs proposées à la saisie. Renommer met à jour tous les exemplaires ; renommer vers une valeur existante fusionne les deux.">
      <div className="flex flex-wrap gap-1" role="tablist">
        {(Object.keys(LIST_LABELS) as ListKey[]).map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={tabClass(tab === k)}>
            {LIST_LABELS[k]} {lists && <span className="text-xs text-muted-foreground">({lists[k].length})</span>}
          </button>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (draft.trim()) run(async () => send("POST", `/api/lists/${tab}`, { value: draft.trim() })).then(() => setDraft(""))
        }}
        className="mt-4 flex gap-2"
      >
        <input className={`${inputClass} min-w-0 flex-1 py-2`} placeholder="Nouvelle valeur" value={draft} onChange={(e) => setDraft(e.target.value)} />
        <button disabled={!draft.trim()} className="rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50">
          Ajouter
        </button>
      </form>
      <div className="mt-3">
        <ErrorNote message={error} />
      </div>

      <ul className="mt-2 divide-y divide-border">
        {values.map((v) => (
          <ValueRow key={v.id} list={tab} item={v} all={values} run={run} />
        ))}
      </ul>
    </Section>
  )
}

function ValueRow({ list, item, all, run }: { list: ListKey; item: ListValue; all: ListValue[]; run: (a: () => Promise<unknown>) => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(item.value)

  const rename = () => {
    const target = all.find((x) => x.id !== item.id && x.value.toLowerCase() === value.trim().toLowerCase())
    if (target && !window.confirm(`« ${target.value} » existe déjà. Fusionner ? Les ${item.count} utilisations de « ${item.value} » passeront sur « ${target.value} ».`)) return
    run(async () => send("PUT", `/api/lists/${list}/${item.id}`, { value })).then(() => setEditing(false))
  }

  if (editing) {
    return (
      <li className="flex flex-wrap items-center gap-2 py-2">
        <input
          autoFocus
          className={`${inputClass} min-w-0 flex-1 py-1.5`}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") rename()
            if (e.key === "Escape") setEditing(false)
          }}
        />
        <button onClick={rename} className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground">
          Enregistrer
        </button>
        <button onClick={() => setEditing(false)} className="px-1 text-sm text-muted-foreground">
          Annuler
        </button>
      </li>
    )
  }
  // Le libellé garde toute la largeur (sur téléphone, les boutons le tronquaient en « Easy… »).
  return (
    <li className="flex items-center gap-3 py-2 text-sm">
      <div className="min-w-0 flex-1">
        <div className="break-words">{item.value}</div>
        <div className="text-xs text-muted-foreground tabular-nums">{item.count > 0 ? `utilisée ${item.count} fois` : "inutilisée"}</div>
      </div>
      <button onClick={() => { setValue(item.value); setEditing(true) }} className="shrink-0 text-muted-foreground hover:text-foreground">
        Renommer
      </button>
      <button
        disabled={item.count > 0}
        title={item.count > 0 ? "Utilisée : renomme-la ou fusionne-la plutôt" : undefined}
        onClick={() => window.confirm(`Supprimer « ${item.value} » de la liste ?`) && run(async () => send("DELETE", `/api/lists/${list}/${item.id}`))}
        className="shrink-0 text-muted-foreground hover:text-destructive disabled:opacity-30"
      >
        Supprimer
      </button>
    </li>
  )
}
