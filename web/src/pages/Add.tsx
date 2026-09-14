import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate, useSearchParams } from "react-router-dom"

import { CopyForm, newCopyValues } from "@/components/copy-form"
import { Chips, Field, inputClass } from "@/components/fields"
import { IgdbSearch } from "@/components/igdb-search"
import { BarcodeIcon } from "@/components/copy-form"
import { Scanner } from "@/components/scanner"
import { api, errorMessage, send, type BarcodeIdentify, type IgdbCandidate, type WishItem } from "@/lib/api"
import type { LibraryGame } from "@/lib/library"
import { useLibrary } from "@/lib/library-data"
import { copyPayload, uploadPhotos } from "@/lib/save-copy"

type Choice = { candidate: IgdbCandidate | null; title: string; platform: string }

const knownPlatformsOf = (games: LibraryGame[] | null) => [...new Set((games ?? []).map((g) => g.platform))]

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

  if (choice) {
    return (
      <div className="mx-auto max-w-2xl">
        <button onClick={() => setChoice(null)} className="mb-3 text-sm text-muted-foreground hover:text-foreground">
          {t("add.changeGame")}
        </button>
        <div className="mb-5 flex items-center gap-3">
          {choice.candidate?.cover && <img src={choice.candidate.cover} alt="" className="aspect-[3/4] w-14 rounded object-cover" />}
          <div>
            <h1 className="text-xl leading-tight font-semibold">{choice.title}</h1>
            <div className="text-sm text-muted-foreground">{choice.platform}</div>
          </div>
        </div>
        {existing && (
          <p className="mb-4 rounded-lg bg-primary/15 px-3 py-2 text-sm">
            {t("add.alreadyOwned", { count: existing.copies.length })}
          </p>
        )}
        <CopyForm
          initial={{ ...newCopyValues(choice.platform), barcode: ean ?? "" }}
          submitLabel={t("add.submit")}
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
      <div className="mx-auto max-w-2xl space-y-5">
        <button onClick={() => setCandidate(null)} className="text-sm text-muted-foreground hover:text-foreground">
          {t("add.changeGame")}
        </button>
        <h1 className="text-xl font-semibold">{candidate.name}</h1>
        <Field label={t("add.whichPlatform")}>
          <Chips options={platforms} value={null} onChange={(p) => p && setChoice({ candidate, title: candidate.name, platform: p })} placeholder={t("add.choosePlatform")} />
        </Field>
        <Field label={t("add.otherPlatform")}>
          <div className="flex gap-2">
            <input className={inputClass} list="gc-platforms" value={otherPlatform} onChange={(e) => setOtherPlatform(e.target.value)} />
            <button
              disabled={!otherPlatform.trim()}
              onClick={() => setChoice({ candidate, title: candidate.name, platform: otherPlatform.trim() })}
              className="rounded-lg bg-primary px-4 font-medium text-primary-foreground disabled:opacity-50"
            >
              {t("add.ok")}
            </button>
          </div>
        </Field>
        <datalist id="gc-platforms">
          {knownPlatforms.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
      </div>
    )
  }

  if (manual) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <button onClick={() => setManual(false)} className="text-sm text-muted-foreground hover:text-foreground">
          {t("add.backToIgdb")}
        </button>
        <h1 className="text-xl font-semibold">{t("add.manualHeading")}</h1>
        <Field label={t("add.title")}>
          <input className={inputClass} autoFocus value={manualTitle} onChange={(e) => setManualTitle(e.target.value)} />
        </Field>
        <Field label={t("add.platform")}>
          <input className={inputClass} list="gc-platforms" value={otherPlatform} onChange={(e) => setOtherPlatform(e.target.value)} />
          <datalist id="gc-platforms">
            {knownPlatforms.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </Field>
        <button
          disabled={!manualTitle.trim() || !otherPlatform.trim()}
          onClick={() => setChoice({ candidate: null, title: manualTitle.trim(), platform: otherPlatform.trim() })}
          className="w-full rounded-lg bg-primary py-2.5 font-medium text-primary-foreground disabled:opacity-50"
        >
          {t("add.continue")}
        </button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold">{t("add.heading")}</h1>
      {scanning && <Scanner title={t("add.scanTitle")} onDetected={onScan} onClose={() => setScanning(false)} />}
      <button onClick={() => setScanning(true)} className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-card py-3 text-sm font-medium">
        <BarcodeIcon />
        {t("add.scanButton")}
      </button>
      {scanNote && <p className="rounded-lg bg-muted px-3 py-2 text-sm">{scanNote}</p>}
      {ean && <p className="rounded-lg bg-muted px-3 py-2 text-sm">{t("add.eanKept", { ean })}</p>}
      <IgdbSearch onPick={pick} />
      <button onClick={() => setManual(true)} className="text-sm text-muted-foreground underline">
        {t("add.notFound")}
      </button>
    </div>
  )
}
