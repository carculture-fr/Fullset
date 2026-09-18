import { Barcode, Search, WifiOff } from "lucide-react"
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Trans, useTranslation } from "react-i18next"
import { Link, useNavigate, useSearchParams } from "react-router-dom"

import { ConditionDot } from "@/components/condition"
import { Cover } from "@/components/cover"
import { ErrorNote, inputClass } from "@/components/fields"
import { darkScreen, ManualEntry, ScannerHeader, Viewfinder } from "@/components/scanner"
import { api, errorMessage, send, type BarcodeIdentify, type KnownBarcode } from "@/lib/api"
import { euros } from "@/lib/format"
import { valueLabel } from "@/lib/i18n"
import { applyFilters, type LibraryGame } from "@/lib/library"
import { useLibrary } from "@/lib/library-data"

type Scan = { ean: string; gameId: number | null }

const ICON = { strokeWidth: 2.75 } as const
const primaryCta =
  "flex min-h-11 w-full items-center justify-center rounded-full bg-primary px-5 text-center font-heading text-[15px] leading-tight text-primary-foreground transition-transform duration-150 active:scale-[.98]"
const surfaceButton =
  "flex min-h-11 flex-1 items-center justify-center rounded-full bg-card px-4 text-center font-heading text-[15px] leading-tight transition-transform duration-150 active:scale-[.98]"
const tag = "inline-flex max-w-full items-center rounded-full bg-card px-2.5 py-1 text-[11px]"

/**
 * « Je l'ai déjà ? » en brocante : on scanne la boîte, la réponse vient de la bibliothèque et
 * des codes connus, tous deux en cache, donc aussi sans réseau. Un code inconnu se rattache
 * à un jeu possédé (il sera reconnu la fois suivante) ou mène à l'ajout.
 *
 * L'écran recouvre tout, barre d'onglets comprise : le lecteur se tient d'une main, au soleil,
 * et la feuille de réponse a besoin de toute la hauteur. On en sort par le rond « fermer ».
 */
export default function Brocante() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { games } = useLibrary()
  const [codes, setCodes] = useState<KnownBarcode[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [scanning, setScanning] = useState(true)
  const [current, setCurrent] = useState<string | null>(null)
  const [history, setHistory] = useState<Scan[]>([])
  const [q, setQ] = useState("")
  // Session de scan à la maison (?enchainer=1) : après chaque boîte, le lecteur se rouvre.
  const [params, setParams] = useSearchParams()
  const chain = params.get("enchainer") === "1"
  const [toast, setToast] = useState<{ text: string; id: number } | null>(null)
  const [identified, setIdentified] = useState<BarcodeIdentify | null>(null)
  const [identifying, setIdentifying] = useState(false)
  // « Ce n'est pas lui » : la suggestion ScanDex est écartée pour ce code.
  const [rejected, setRejected] = useState(false)
  const online = useOnline()
  const sheet = useRef<HTMLElement>(null)

  const loadCodes = () =>
    api<{ codes: KnownBarcode[] }>("/api/barcodes").then(
      (r) => setCodes(r.codes),
      (err) => setError(errorMessage(err)),
    )
  useEffect(() => {
    loadCodes()
  }, [])

  // Le message de la session à la suite s'efface après deux secondes.
  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 2000)
    return () => clearTimeout(timer)
  }, [toast])

  // La feuille remonte à chaque réponse.
  useEffect(() => {
    const el = sheet.current
    if (!current || !el?.animate || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return
    el.animate([{ transform: "translateY(48px)", opacity: 0.4 }, { transform: "none", opacity: 1 }], { duration: 240, easing: "cubic-bezier(.2,.8,.2,1)" })
  }, [current])

  const gameById = (id: number | null) => (id === null ? null : (games?.find((g) => g.id === id) ?? null))
  const hit = current ? codes?.find((c) => c.ean === current) : undefined
  const owned = hit ? gameById(hit.game_id) : null

  const say = (text: string) => setToast({ text, id: Date.now() })

  const onScan = (ean: string) => {
    setScanning(false)
    setCurrent(ean)
    setQ("")
    setError(null)
    setIdentified(null)
    setRejected(false)
    const known = codes?.find((c) => c.ean === ean)
    setHistory((h) => [{ ean, gameId: known?.game_id ?? null }, ...h.filter((x) => x.ean !== ean)].slice(0, 30))
    const knownGame = known ? gameById(known.game_id) : null
    if (knownGame && chain) {
      // Déjà connu : un message dans le lecteur, qui se rouvre aussitôt pour la boîte suivante.
      say(t("brocante.lastKnown", { title: knownGame.title, platform: knownGame.platform }))
      setCurrent(null)
      setScanning(true)
      return
    }
    // Code inconnu : ScanDex propose un jeu (réseau nécessaire ; hors ligne, on s'en passe).
    if (!known && navigator.onLine) {
      setIdentifying(true)
      api<BarcodeIdentify>(`/api/barcodes/${ean}/identify`)
        .then(setIdentified, () => {})
        .finally(() => setIdentifying(false))
    }
  }

  const link = async (game: LibraryGame) => {
    if (!current) return
    setError(null)
    try {
      await send("POST", "/api/barcodes", { ean: current, game_id: game.id, edition: null })
      await loadCodes()
      setHistory((h) => h.map((x) => (x.ean === current ? { ...x, gameId: game.id } : x)))
      setQ("")
      if (chain) {
        say(t("brocante.lastLinked", { title: game.title, platform: game.platform }))
        setCurrent(null)
        setScanning(true)
      }
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  const close = () => {
    // Retour d'où l'on vient (bibliothèque, codes-barres…), sinon la bibliothèque.
    if (((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0) navigate(-1)
    else navigate("/")
  }

  // Même recherche que la bibliothèque (« mw3 » y trouve Modern Warfare 3).
  const matches = useMemo(() => (q.trim().length < 2 || !games ? [] : applyFilters(games, {}, q).slice(0, 8).map((r) => r.game)), [q, games])

  const loading = !codes || !games
  const linking = !!current && !owned

  const search = (label: string) => (
    <div className="mt-3.5">
      <label className="mb-1.5 block text-[13px] text-muted-foreground" htmlFor="brocante-q">
        {label}
      </label>
      <div className="relative">
        <Search size={18} {...ICON} aria-hidden="true" className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted-foreground" />
        <input id="brocante-q" className={`${inputClass} pl-11`} placeholder={linking ? t("brocante.unknown.linkPlaceholder") : t("brocante.titlePlaceholder")} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {q.trim().length >= 2 && matches.length === 0 && <p className="mt-2 px-1 text-[13px] text-muted-foreground">{t("brocante.nothing")}</p>}
      {matches.length > 0 && (
        <ul className="mt-2">
          {matches.map((g) => (
            <li key={g.id} className="grid grid-cols-[38px_minmax(0,1fr)_auto] items-center gap-3 border-t border-border py-2 first:border-t-0">
              <Cover src={g.cover} title={g.title} platform={g.platform} size="thumb" />
              <div className="min-w-0">
                <div className="truncate text-[14px] font-semibold">{g.title}</div>
                <div className="truncate text-[12px] text-muted-foreground">
                  {g.platform} · {t("brocante.copies", { count: g.copies.length })}
                </div>
              </div>
              {linking ? (
                <button onClick={() => link(g)} className="min-h-10 rounded-full bg-card px-4 text-[13px] font-semibold">
                  {t("brocante.itsThisOne")}
                </button>
              ) : (
                <Link to={`/jeux/${g.id}`} className="grid min-h-10 place-items-center rounded-full px-3 text-[13px] font-semibold text-primary-text">
                  {t("brocante.sheet")}
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )

  // Un retour à un scan de l'historique ne doit pas reprendre la suggestion d'un autre code.
  const suggestion = identified?.ean === current && identified.suggestion && !rejected ? identified.suggestion : null
  const suggestedOwned = suggestion && identified?.owned[0] ? gameById(identified.owned[0].id) : null

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="brocante-title" className={`fixed inset-0 z-40 overflow-y-auto overscroll-contain ${darkScreen}`}>
      <div className="mx-auto flex min-h-dvh max-w-[480px] flex-col">
        <div className="px-4 pb-[22px]">
          <ScannerHeader title={t("brocante.scannerTitle")} titleId="brocante-title" onClose={close}>
            <button
              type="button"
              aria-pressed={chain}
              onClick={() => setParams(chain ? {} : { enchainer: "1" }, { replace: true })}
              className={`min-h-9 rounded-full px-3.5 text-[11px] transition-colors duration-150 ${chain ? "bg-[#aebf92] font-semibold text-[#201e1d]" : "bg-white/12"}`}
            >
              {chain ? t("brocante.chainOn") : t("brocante.chainOff")}
            </button>
          </ScannerHeader>
          {!online && (
            <p role="status" className="mt-3 flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-[13px]">
              <WifiOff size={16} {...ICON} aria-hidden="true" className="shrink-0" />
              {t("layout.offline")}
            </p>
          )}
          <div className="mt-[22px]">
            <Viewfinder
              active={scanning}
              onDetected={onScan}
              hint={chain ? t("brocante.chainTitle") : undefined}
              idle={
                <button onClick={() => setScanning(true)} className="flex min-h-11 items-center gap-2.5 rounded-full bg-[#f7f3ea] px-5 font-heading text-[15px] text-[#201e1d] transition-transform duration-150 active:scale-[.98]">
                  <Barcode size={20} {...ICON} aria-hidden="true" />
                  {t("brocante.scanAnother")}
                </button>
              }
              overlay={
                <div aria-live="polite">
                  {toast && (
                    <span key={toast.id} className="inline-block max-w-full rounded-full bg-[#f7f3ea] px-4 py-2 text-center text-[13px] font-semibold text-[#201e1d] shadow-md">
                      {toast.text}
                    </span>
                  )}
                </div>
              }
            />
          </div>
          <ManualEntry onDetected={onScan} />
        </div>

        {/* Feuille basse : la réponse, la recherche par titre et les scans de la séance. */}
        <section
          ref={sheet}
          aria-live="polite"
          aria-busy={identifying}
          className="mt-auto rounded-t-[32px] bg-background px-4 pt-3.5 pb-[max(22px,env(safe-area-inset-bottom))] text-foreground shadow-lg ring-1 ring-border"
        >
          <div className="mx-auto mb-3.5 h-1 w-10 rounded-full bg-border-strong" aria-hidden="true" />
          <ErrorNote message={error} />
          {loading ? (
            <p className="py-2 text-[13px] text-muted-foreground">{t("common.loading")}</p>
          ) : current ? (
            owned ? (
              <Owned game={owned} ean={current} edition={hit?.edition ?? null} />
            ) : identifying ? (
              <Answer tone="none" title={t("brocante.unknown.code", { ean: current })}>
                <p className="mt-2 text-[13px] text-muted-foreground">{t("brocante.unknown.searching")}</p>
              </Answer>
            ) : suggestion ? (
              // ScanDex se trompe parfois (mesuré : 3 erreurs sur 18 codes trouvés) : c'est une question, pas une réponse.
              <div className="-mx-2 rounded-card bg-primary-tint px-4 pt-3.5 pb-4 text-primary-tint-foreground">
                <Answer tone="primary" title={suggestedOwned ? t("brocante.unknown.probablyOwned") : t("brocante.unknown.notOwned")}>
                  <p className="mt-2 text-[13px]">
                    {suggestedOwned ? (
                      <Trans
                        i18nKey="brocante.unknown.suggestionOwned"
                        values={{ name: suggestion.name, platform: suggestion.platform, owned: suggestedOwned.platform }}
                        components={{ strong: <strong /> }}
                      />
                    ) : (
                      <Trans i18nKey="brocante.unknown.suggestion" values={{ name: suggestion.name, platform: suggestion.platform }} components={{ strong: <strong /> }} />
                    )}
                  </p>
                  {/* Ce que les listes de référence en disent : la vraie question en brocante. */}
                  {(identified?.sets ?? [])
                    .filter((s) => !s.owned)
                    .map((s) => (
                      <p key={s.slug} className="mt-2 text-[13px] font-semibold">
                        {t("brocante.unknown.missingFromSet", { set: s.name })}
                        {s.price_cents !== null && <span className="num"> · {euros(s.price_cents)}</span>}
                      </p>
                    ))}
                  <div className="mt-3 grid grid-cols-[44px_minmax(0,1fr)] items-center gap-2.5 rounded-[14px] bg-background p-2 text-foreground">
                    <Cover src={suggestedOwned?.cover ?? null} title={suggestedOwned?.title ?? suggestion.name} platform={suggestedOwned?.platform ?? suggestion.platform} size="thumb" />
                    <div className="min-w-0">
                      <div className="truncate text-[14px] font-semibold">{suggestedOwned?.title ?? suggestion.name}</div>
                      <div className="truncate text-[12px] text-muted-foreground">{suggestedOwned?.platform ?? suggestion.platform}</div>
                    </div>
                  </div>
                  {suggestedOwned ? (
                    <button onClick={() => link(suggestedOwned)} className={`${primaryCta} mt-2.5`}>
                      {t("brocante.unknown.keep")}
                    </button>
                  ) : (
                    <Link
                      to={`/ajouter?ean=${current}&igdb=${suggestion.igdb_id}&titre=${encodeURIComponent(suggestion.name)}&plateforme=${encodeURIComponent(suggestion.platform)}`}
                      className={`${primaryCta} mt-2.5`}
                    >
                      {t("brocante.unknown.buyNamed", { name: suggestion.name })}
                    </Link>
                  )}
                  <div className="mt-2.5 flex justify-center gap-5 text-[12px]">
                    {suggestedOwned && (
                      <Link to={`/jeux/${suggestedOwned.id}`} className="underline">
                        {t("brocante.viewSheet")}
                      </Link>
                    )}
                    <button onClick={() => setRejected(true)} className="underline">
                      {t("brocante.unknown.rejectSuggestion")}
                    </button>
                  </div>
                </Answer>
              </div>
            ) : (
              <Answer tone="none" title={t("brocante.unknown.notOwned")}>
                <p className="mt-2 text-[13px] text-muted-foreground">
                  {t(identified?.configured ? "brocante.unknown.neverSeenScandex" : "brocante.unknown.neverSeen", { ean: current })}
                </p>
                {search(t("brocante.searchToLink"))}
                <Link to={`/ajouter?ean=${current}`} className={`${primaryCta} mt-3`}>
                  {t("brocante.unknown.buy")}
                </Link>
              </Answer>
            )
          ) : (
            <>
              <p className="text-[13px] text-muted-foreground">
                {t("brocante.intro")}{" "}
                <Link to="/codes-barres" className="font-semibold text-primary-text underline">
                  {t("brocante.allCodes")}
                </Link>
              </p>
              {search(t("brocante.searchByTitle"))}
            </>
          )}

          {history.length > 1 && (
            <div className="mt-5">
              <p className="mb-1 text-[11px] font-semibold tracking-[0.08em] text-subtle-foreground uppercase">{t("brocante.history")}</p>
              <ul>
                {history.map((s) => {
                  const g = gameById(s.gameId)
                  return (
                    <li key={s.ean} className="border-t border-border first:border-t-0">
                      <button onClick={() => setCurrent(s.ean)} className="flex min-h-11 w-full items-center justify-between gap-3 py-2 text-left text-[13px]">
                        <span className="min-w-0 truncate">{g ? `${g.title} (${g.platform})` : t("brocante.unknownCode")}</span>
                        <span className={`shrink-0 text-[12px] ${g ? "font-semibold text-primary-text" : "num font-mono text-muted-foreground"}`}>{g ? t("brocante.already") : s.ean}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

/** Titre de la réponse : pastille 10 px et phrase en Caprasimo. */
function Answer({ tone, title, children }: { tone: "primary" | "none"; title: string; children?: ReactNode }) {
  return (
    <div>
      <p className="flex items-center gap-2 font-heading text-[19px] leading-tight">
        <span className={`size-2.5 shrink-0 rounded-full ${tone === "primary" ? "bg-primary" : "bg-[var(--cond-none)]"}`} aria-hidden="true" />
        {title}
      </p>
      {children}
    </div>
  )
}

function Owned({ game, ean, edition }: { game: LibraryGame; ean: string; edition: string | null }) {
  const { t } = useTranslation()
  return (
    <div>
      <p className="flex items-center gap-2 font-heading text-[19px] leading-tight">
        <span className="size-2.5 shrink-0 rounded-full bg-[var(--cond-good)]" aria-hidden="true" />
        {t("brocante.owned.title")}
      </p>
      <div className="mt-3 grid grid-cols-[64px_minmax(0,1fr)] items-center gap-3">
        <Cover src={game.cover} title={game.title} platform={game.platform} size="thumb" />
        <div className="min-w-0">
          <div className="text-[15px] leading-tight font-semibold">{game.title}</div>
          <div className="mt-0.5 text-[12px] text-muted-foreground">
            <Trans i18nKey="brocante.owned.platformCode" values={{ platform: game.platform, ean }} components={{ mono: <span className="num font-mono" /> }} />
          </div>
          {edition && <div className="text-[11px] text-subtle-foreground">{t("brocante.owned.edition", { edition })}</div>}
          <ul className="mt-2 space-y-1.5">
            {game.copies.map((c) => (
              <li key={c.id} className="flex flex-wrap gap-1.5">
                <span className={tag}>{c.edition ?? t("brocante.owned.standard")}</span>
                {c.content && <span className={tag}>{valueLabel("content", c.content)}</span>}
                {c.support !== "Dématérialisé" && (
                  <span className={tag}>
                    <ConditionDot value={c.condition_game} size={7} />
                  </span>
                )}
                {c.quantity > 1 && <span className={`${tag} num`}>×{c.quantity}</span>}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="mt-3.5 flex gap-2">
        <Link to={`/jeux/${game.id}`} className={surfaceButton}>
          {t("brocante.viewSheet")}
        </Link>
        <Link to={`/jeux/${game.id}/ajouter?ean=${ean}`} className={surfaceButton}>
          {t("brocante.owned.another")}
        </Link>
      </div>
    </div>
  )
}

function useOnline() {
  const [online, setOnline] = useState(() => navigator.onLine)
  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener("online", update)
    window.addEventListener("offline", update)
    return () => {
      window.removeEventListener("online", update)
      window.removeEventListener("offline", update)
    }
  }, [])
  return online
}
