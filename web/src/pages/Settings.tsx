import { useEffect, useState, type FormEvent, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"

import { ErrorNote, Field, KeyedChips, inputClass } from "@/components/fields"
import { ServicesForm } from "@/components/services-form"
import { api, errorMessage, send, type Account, type SteamStatus, type SteamSyncReport } from "@/lib/api"
import { formatDateTime } from "@/lib/format"
import { SORTS } from "@/lib/library"
import { useLibrary } from "@/lib/library-data"
import { useLists, type ListKey, type ListValue } from "@/lib/lists"
import { GROUPS, HARDWARE_SORTS, LANGUAGE_CHOICES, VIEWS, usePreferences, type Preferences } from "@/lib/preferences"
import { useSession } from "@/lib/session"

// Libellés : `settings.lists.<clé>`.
const LIST_KEYS: ListKey[] = ["place", "edition", "tag", "hw_edition", "hw_color"]

const primaryButton =
  "inline-flex min-h-11 items-center justify-center rounded-full bg-primary px-5 font-heading text-[15px] text-primary-foreground transition-[filter,transform] duration-150 hover:brightness-95 active:scale-[.98] disabled:opacity-45"
const ghostButton = "inline-flex min-h-11 items-center rounded-full border border-border-strong px-4 text-sm font-semibold transition-colors duration-150 hover:bg-foreground/[.07] disabled:opacity-45"
const textButton = "inline-flex min-h-9 shrink-0 items-center rounded-full px-3 text-[13px] font-semibold text-muted-foreground transition-colors duration-150 hover:bg-foreground/[.07] hover:text-foreground disabled:opacity-30"

export default function Settings() {
  const { t } = useTranslation()
  return (
    <div className="mx-auto max-w-2xl space-y-4 pb-4 lg:space-y-5">
      <h1 className="text-[29px]">{t("settings.title")}</h1>
      <Profile />
      <DisplaySection />
      <Section title={t("settings.services.title")} note={t("settings.services.note")}>
        <ServicesForm />
      </Section>
      <Security />
      <ListsManager />
      <SteamSection />
      <Section title={t("settings.barcodes.title")} note={t("settings.barcodes.note")}>
        <Link to="/codes-barres" className={ghostButton}>
          {t("settings.barcodes.manage")}
        </Link>
      </Section>
    </div>
  )
}

/** Une section = une carte 24 px, titre en Caprasimo 20 px. */
function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="rounded-card bg-card p-4 sm:p-5">
      <h2 className="text-[18px]">{title}</h2>
      {note && <p className="mt-1 text-[13px] text-muted-foreground">{note}</p>}
      <div className="mt-5">{children}</div>
    </section>
  )
}

function Saved({ message }: { message: string | null }) {
  return message ? (
    <p role="status" className="rounded-[16px] bg-primary-tint px-4 py-2.5 text-sm text-primary-tint-foreground">
      {message}
    </p>
  ) : null
}

function Profile() {
  const { t } = useTranslation()
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
      setSaved(t("settings.profile.saved"))
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <Section title={t("settings.profile.title")}>
      <form onSubmit={save} className="space-y-3.5">
        <Field label={t("settings.profile.displayName")}>
          <input className={inputClass} value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} />
        </Field>
        <Field label={t("settings.profile.username")} hint={t("settings.profile.usernameHint")}>
          <input className={inputClass} autoComplete="username" autoCapitalize="none" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
        </Field>
        <Field label={t("settings.profile.email")} hint={t("settings.profile.emailHint")}>
          <input className={inputClass} type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>
        <ErrorNote message={error} />
        <Saved message={saved} />
        <button className={primaryButton}>{t("settings.profile.save")}</button>
      </form>
    </Section>
  )
}

/** Affichage par défaut : enregistré aussitôt, le même sur tous ses appareils. */
function DisplaySection() {
  const { t } = useTranslation()
  const { prefs, save } = usePreferences()
  const [error, setError] = useState<string | null>(null)
  const set = (patch: Partial<Preferences>) => {
    setError(null)
    save(patch).catch((err) => setError(errorMessage(err)))
  }

  return (
    <Section title={t("settings.display.title")} note={t("settings.display.note")}>
      <div className="space-y-3.5">
        <Field label={t("settings.display.language")}>
          <KeyedChips
            label={t("settings.display.languageLabel")}
            choices={LANGUAGE_CHOICES.map((c) => ({ key: c.key, label: t(`languages.${c.key}`) }))}
            value={prefs.language}
            onChange={(v) => set({ language: v })}
          />
        </Field>
        <Field label={t("settings.display.gamesSort")}>
          <KeyedChips
            label={t("settings.display.gamesSortLabel")}
            choices={SORTS.map((s) => ({ key: s.key, label: t(`sorts.games.${s.key}`) }))}
            value={prefs.games_sort}
            onChange={(v) => set({ games_sort: v })}
          />
        </Field>
        {prefs.games_sort === "plateforme" && (
          <Field label={t("settings.display.gamesGroups")}>
            <KeyedChips
              label={t("settings.display.gamesGroupsLabel")}
              choices={GROUPS.map((g) => ({ key: g.key, label: t(`groups.${g.key}`) }))}
              value={prefs.games_groups}
              onChange={(v) => set({ games_groups: v })}
            />
          </Field>
        )}
        <Field label={t("settings.display.gamesView")}>
          <KeyedChips
            label={t("settings.display.gamesViewLabel")}
            choices={VIEWS.map((v) => ({ key: v.key, label: t(`views.${v.key}`) }))}
            value={prefs.games_view}
            onChange={(v) => set({ games_view: v })}
          />
        </Field>
        <Field label={t("settings.display.hardwareSort")}>
          <KeyedChips
            label={t("settings.display.hardwareSortLabel")}
            choices={HARDWARE_SORTS.map((s) => ({ key: s.key, label: t(`sorts.hardware.${s.key}`) }))}
            value={prefs.hardware_sort}
            onChange={(v) => set({ hardware_sort: v })}
          />
        </Field>
        <ErrorNote message={error} />
      </div>
    </Section>
  )
}

function Security() {
  const { t } = useTranslation()
  const { logout } = useSession()
  const [saved, setSaved] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pw, setPw] = useState({ current: "", password: "", confirm: "" })

  const others = async () => {
    await send("POST", "/api/account/logout-others", {})
    setSaved(t("settings.security.othersDone"))
  }
  const changePassword = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setSaved(null)
    if (pw.password !== pw.confirm) return setError(t("settings.security.mismatch"))
    try {
      await send("PUT", "/api/account/password", { current: pw.current, password: pw.password })
      setPw({ current: "", password: "", confirm: "" })
      setSaved(t("settings.security.changed"))
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <Section title={t("settings.security.title")} note={t("settings.security.note")}>
      <form onSubmit={changePassword} className="space-y-3.5">
        <Field label={t("settings.security.current")}>
          <input className={inputClass} type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
        </Field>
        <Field label={t("settings.security.new")} hint={t("settings.security.newHint")}>
          <input className={inputClass} type="password" autoComplete="new-password" value={pw.password} onChange={(e) => setPw({ ...pw, password: e.target.value })} />
        </Field>
        <Field label={t("settings.security.confirm")}>
          <input className={inputClass} type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />
        </Field>
        <button disabled={!pw.current || pw.password.length < 10} className={primaryButton}>
          {t("settings.security.change")}
        </button>
      </form>
      <div className="mt-3 space-y-3">
        <ErrorNote message={error} />
        <Saved message={saved} />
      </div>
      <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-5">
        <button onClick={others} className={ghostButton}>
          {t("settings.security.logoutOthers")}
        </button>
        <button onClick={logout} className={ghostButton}>
          {t("settings.security.logout")}
        </button>
      </div>
    </Section>
  )
}

/** Bibliothèque Steam : lecture au bouton seulement, jeux absents sur un écran de choix. */
function SteamSection() {
  const { t } = useTranslation()
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
        t("settings.steam.report", {
          owned: t("settings.steam.reportOwned", { count: r.owned }),
          recognised: r.recognised,
          linked: t("settings.steam.reportLinked", { count: r.linked }),
          playtime: t("settings.steam.reportPlaytime", { count: r.playtime }),
        }),
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
    <Section title={t("settings.steam.title")} note={t("settings.steam.note")}>
      {status && !status.configured && <p className="text-sm text-muted-foreground">{t("settings.steam.notConfigured")}</p>}
      {status?.configured && (
        <div className="space-y-3.5">
          <p className="text-sm text-muted-foreground">
            {status.synced_at
              ? t("settings.steam.lastSync", {
                  date: formatDateTime(status.synced_at),
                  owned: t("settings.steam.games", { count: status.owned }),
                  linked: t("settings.steam.linked", { count: status.linked }),
                })
              : t("settings.steam.never")}
          </p>
          <div className="flex flex-wrap gap-2">
            <button onClick={sync} disabled={busy} className={primaryButton}>
              {busy ? t("settings.steam.syncing") : t("settings.steam.sync")}
            </button>
            {status.candidates > 0 && (
              <Link to="/steam" className={ghostButton}>
                {t("settings.steam.choose", { n: status.candidates })}
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
  const { t } = useTranslation()
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
  const tabClass = (on: boolean) =>
    `inline-flex min-h-10 items-center gap-1.5 rounded-full px-4 text-[14px] transition-colors duration-150 ${
      on ? "bg-primary font-heading text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground"
    }`

  return (
    <Section title={t("settings.lists.title")} note={t("settings.lists.note")}>
      <div className="flex flex-wrap gap-1.5" role="tablist">
        {LIST_KEYS.map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={tabClass(tab === k)}>
            {t(`settings.lists.${k}`)}
            {lists && <span className={`num font-sans text-xs ${tab === k ? "opacity-80" : "text-subtle-foreground"}`}>{lists[k].length}</span>}
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
        <input className={`${inputClass} min-w-0 flex-1`} placeholder={t("settings.lists.newValue")} value={draft} onChange={(e) => setDraft(e.target.value)} />
        <button disabled={!draft.trim()} className={`${primaryButton} min-h-11`}>
          {t("common.add")}
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
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(item.value)

  const rename = () => {
    const target = all.find((x) => x.id !== item.id && x.value.toLowerCase() === value.trim().toLowerCase())
    if (target && !window.confirm(t("settings.lists.mergeConfirm", { target: target.value, n: item.count, value: item.value }))) return
    run(async () => send("PUT", `/api/lists/${list}/${item.id}`, { value })).then(() => setEditing(false))
  }

  if (editing) {
    return (
      <li className="flex flex-wrap items-center gap-2 py-2.5">
        <input
          autoFocus
          className={`${inputClass} min-w-0 flex-1`}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") rename()
            if (e.key === "Escape") setEditing(false)
          }}
        />
        <button onClick={rename} className={primaryButton}>
          {t("common.save")}
        </button>
        <button onClick={() => setEditing(false)} className={textButton}>
          {t("common.cancel")}
        </button>
      </li>
    )
  }
  // Le libellé garde toute la largeur (sur téléphone, les boutons le tronquaient en « Easy… »).
  return (
    <li className="flex items-center gap-2 py-2.5 text-[14px]">
      <div className="min-w-0 flex-1">
        <div className="break-words">{item.value}</div>
        <div className="num text-xs text-muted-foreground">{item.count > 0 ? t("settings.lists.used", { count: item.count }) : t("settings.lists.unused")}</div>
      </div>
      <button onClick={() => { setValue(item.value); setEditing(true) }} className={textButton}>
        {t("common.rename")}
      </button>
      <button
        disabled={item.count > 0}
        title={item.count > 0 ? t("settings.lists.inUse") : undefined}
        onClick={() => window.confirm(t("settings.lists.deleteConfirm", { value: item.value })) && run(async () => send("DELETE", `/api/lists/${list}/${item.id}`))}
        className={`${textButton} hover:text-destructive`}
      >
        {t("common.delete")}
      </button>
    </li>
  )
}
