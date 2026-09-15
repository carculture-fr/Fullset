import { Barcode } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate, useSearchParams } from "react-router-dom"

import { CopyForm, GameRecap, newCopyValues } from "@/components/copy-form"
import { Chips, Field, inputClass } from "@/components/fields"
import { IgdbSearch } from "@/components/igdb-search"
import { BackBar, ICON } from "@/components/page-bits"
import { Scanner } from "@/components/scanner"
import { api, errorMessage, send, type BarcodeIdentify, type IgdbCandidate, type WishItem } from "@/lib/api"
import type { LibraryGame } from "@/lib/library"
import { useLibrary } from "@/lib/library-data"
import { copyPayload, uploadPhotos } from "@/lib/save-copy"

type Choice = { candidate: IgdbCandidate | null; title: string; platform: string }

const knownPlatformsOf = (games: LibraryGame[] | null) => [...new Set((games ?? []).map((g) => g.platform))]

const noteClass = "rounded-[16px] bg-card px-4 py-2.5 text-[13px]"

/** Indicateur d'étape « 2 / 3 » en chasse fixe, lu en toutes lettres. */
function Step({ n }: { n: number }) {
  const { t } = useTranslation()
  return (
    <span className="shrink-0 font-mono text-[12px] text-muted-foreground">
      <span aria-hidden="true">{n} / 3</span>
      <span className="sr-only">{t("add.step", { n, total: 3 })}</span>
    </span>
  )
}

/**
 * Ajout d'un achat en trois temps : le jeu (IGDB ou saisie libre), la plateforme, l'exemplaire.
 * Objectif du cahier des charges : moins d'une minute au téléphone, en boutique.
 */
export default function Add() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { games, reload } = useLibrary()
  const [params] = useSearchParams()
  const wishId = params.get("souhait")
  // Depuis la page brocante : le code scanné suit dans l'exemplaire, et s'apprend à l'enregistrement.
  const ean = params.get("ean")
  // … et quand ScanDex a reconnu le jeu, il arrive déjà choisi (fiche IGDB et console).
  const igdbParam = Number(params.get("igdb")) || null
  const titleParam = params.get("titre")
  const platformParam = params.get("plateforme")
  const [candidate, setCandidate] = useState<IgdbCandidate | null>(null)
  const [manual, setManual] = useState(false)
  const [choice, setChoice] = useState<Choice | null>(null)
  const [otherPlatform, setOtherPlatform] = useState("")
  const [manualTitle, setManualTitle] = useState("")
  const [scanning, setScanning] = useState(false)
  const [scanNote, setScanNote] = useState<string | null>(null)

  // Scanner la boîte : un code déjà connu mène au jeu, un code reconnu par ScanDex préremplit
  // le jeu et la console ; sinon le code est gardé pour l'exemplaire et on cherche le jeu.
  const onScan = async (code: string) => {
    setScanning(false)
    setScanNote(t("add.searchingCode"))
    try {
      const known = await api<{ known: boolean; game: LibraryGame | null }>(`/api/barcodes/${code}`)
      if (known.known && known.game) return navigate(`/jeux/${known.game.id}/ajouter?ean=${code}`)
      const id = await api<BarcodeIdentify>(`/api/barcodes/${code}/identify`)
      if (id.suggestion) {
        setScanNote(null)
        return navigate(`/ajouter?ean=${code}&igdb=${id.suggestion.igdb_id}&titre=${encodeURIComponent(id.suggestion.name)}&plateforme=${encodeURIComponent(id.suggestion.platform)}`, { replace: true })
      }
      setScanNote(null)
      navigate(`/ajouter?ean=${code}`, { replace: true })
    } catch (err) {
      setScanNote(errorMessage(err))
    }
  }

  // Depuis la liste de souhaits (« Je l'ai acheté ») : le jeu et la plateforme sont déjà connus.
  useEffect(() => {
    if (!wishId) return
    api<{ items: WishItem[] }>("/api/wishlist").then(({ items }) => {
      const w = items.find((x) => String(x.id) === wishId)
      if (!w) return
      const c: IgdbCandidate | null =
        w.igdb_id === null ? null : { igdb_id: w.igdb_id, name: w.title, original_name: null, year: null, platforms: w.platform ? [w.platform] : [], cover: w.cover_url }
      if (w.platform) setChoice({ candidate: c, title: w.title, platform: w.platform })
      else if (c) setCandidate({ ...c, platforms: knownPlatformsOf(games) })
    })
  }, [wishId, games])

  useEffect(() => {
    if (!igdbParam || !titleParam || !platformParam) return
    const c: IgdbCandidate = { igdb_id: igdbParam, name: titleParam, original_name: null, year: null, platforms: [platformParam], cover: null }
    setChoice({ candidate: c, title: titleParam, platform: platformParam })
  }, [igdbParam, titleParam, platformParam])

  const knownPlatforms = useMemo(() => knownPlatformsOf(games), [games])
  const existing = choice?.candidate && games?.find((g) => g.igdb_id === choice.candidate!.igdb_id && g.platform === choice.platform)

  const pick = (c: IgdbCandidate) => {
    if (c.platforms.length === 1) setChoice({ candidate: c, title: c.name, platform: c.platforms[0] })
    else setCandidate(c)
  }

  const platformList = (
    <datalist id="gc-platforms">
      {knownPlatforms.map((p) => (
        <option key={p} value={p} />
      ))}
    </datalist>
  )

  if (choice) {
    return (
      <div className="mx-auto max-w-2xl">
        <BackBar onBack={() => setChoice(null)} label={t("add.changeGameLabel")}>
          <Step n={3} />
        </BackBar>
        <GameRecap cover={choice.candidate?.cover ?? existing?.cover ?? null} title={choice.title} platform={choice.platform} ean={ean} />
        {existing && <p className="mb-4 rounded-[16px] bg-primary-tint px-4 py-2.5 text-[13px] text-primary-tint-foreground">{t("add.alreadyOwned", { count: existing.copies.length })}</p>}
        <CopyForm
          initial={{ ...newCopyValues(choice.platform), barcode: ean ?? "" }}
          submitLabel={t("add.submit")}
          repeatAmount
          onSubmit={async (values, photos) => {
            const res = await send<{ gameId: number; copyId: number }>("POST", "/api/games", {
              igdb_id: choice.candidate?.igdb_id ?? null,
              platform: choice.platform,
              title: choice.title,
              copy: copyPayload(values),
            })
            await uploadPhotos(`/api/copies/${res.copyId}/photos`, photos)
            // Le souhait est exaucé : il quitte la liste (un échec ici n'annule pas l'achat).
            if (wishId) await send("DELETE", `/api/wishlist/${wishId}`).catch(() => {})
            await reload()
            navigate(`/jeux/${res.gameId}`, { replace: true })
          }}
        />
      </div>
    )
  }

  if (candidate) {
    const platforms = [...candidate.platforms].sort((a, b) => Number(knownPlatforms.includes(b)) - Number(knownPlatforms.includes(a)))
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <BackBar onBack={() => setCandidate(null)} label={t("add.changeGameLabel")}>
          <Step n={2} />
        </BackBar>
        <GameRecap cover={candidate.cover} title={candidate.name} platform={candidate.year ? String(candidate.year) : null} />
        <Field label={t("add.whichPlatform")}>
          <Chips options={platforms} value={null} onChange={(p) => p && setChoice({ candidate, title: candidate.name, platform: p })} placeholder={t("add.choosePlatform")} />
        </Field>
        <Field label={t("add.otherPlatform")}>
          <div className="flex gap-2">
            <input className={inputClass} list="gc-platforms" value={otherPlatform} onChange={(e) => setOtherPlatform(e.target.value)} />
            <button
              disabled={!otherPlatform.trim()}
              onClick={() => setChoice({ candidate, title: candidate.name, platform: otherPlatform.trim() })}
              className="shrink-0 rounded-full bg-primary px-5 font-heading text-[15px] text-primary-foreground disabled:opacity-45"
            >
              {t("add.ok")}
            </button>
          </div>
        </Field>
        {platformList}
      </div>
    )
  }

  if (manual) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <BackBar onBack={() => setManual(false)} label={t("add.backToIgdbLabel")}>
          <Step n={2} />
        </BackBar>
        <h1 className="text-[22px]">{t("add.manualHeading")}</h1>
        <Field label={t("add.title")}>
          <input className={inputClass} autoFocus value={manualTitle} onChange={(e) => setManualTitle(e.target.value)} />
        </Field>
        <Field label={t("add.platform")}>
          <input className={inputClass} list="gc-platforms" value={otherPlatform} onChange={(e) => setOtherPlatform(e.target.value)} />
          {platformList}
        </Field>
        <button
          disabled={!manualTitle.trim() || !otherPlatform.trim()}
          onClick={() => setChoice({ candidate: null, title: manualTitle.trim(), platform: otherPlatform.trim() })}
          className="h-[48px] w-full rounded-full bg-primary font-heading text-[17px] text-primary-foreground shadow-md transition-transform duration-150 active:scale-[.98] disabled:opacity-45"
        >
          {t("add.continue")}
        </button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-[29px]">{t("add.heading")}</h1>
        <Step n={1} />
      </div>
      {scanning && <Scanner title={t("add.scanTitle")} onDetected={onScan} onClose={() => setScanning(false)} />}
      <button
        onClick={() => setScanning(true)}
        className="flex h-[46px] w-full items-center justify-center gap-2.5 rounded-full bg-ink px-5 font-heading text-[15px] text-ink-foreground shadow-md transition-transform duration-150 active:scale-[.98]"
      >
        <Barcode size={20} {...ICON} aria-hidden="true" />
        {t("add.scanButton")}
      </button>
      {scanNote && <p className={noteClass}>{scanNote}</p>}
      {ean && <p className={noteClass}>{t("add.eanKept", { ean })}</p>}
      <IgdbSearch onPick={pick} />
      <button onClick={() => setManual(true)} className="min-h-11 text-[13px] text-muted-foreground underline hover:text-foreground">
        {t("add.notFound")}
      </button>
    </div>
  )
}
