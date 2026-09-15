import { Check, X } from "lucide-react"
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { cleanEan } from "@/lib/ean"

type Detector = { detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue: string }>> }
type DetectorClass = { new (opts: { formats: string[] }): Detector; getSupportedFormats(): Promise<string[]> }

// Formats des boîtes de jeux : EAN-13 en Europe, UPC-A sur les imports américains, EAN-8 rare.
const FORMATS = ["ean_13", "ean_8", "upc_a"]

const ICON = { strokeWidth: 2.75 } as const

/** Le lecteur est toujours sombre, même en thème clair : on le lit au soleil, en brocante. */
export const darkScreen = "bg-[#201e1d] text-[#f7f3ea]"

const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false

/**
 * Lecture à la caméra tant que `active`. Chrome sur Android lit avec BarcodeDetector, natif et
 * rapide ; Safari et Firefox n'en ont pas, ZXing prend alors le relais (chargé à la demande,
 * ~100 Ko). Un code n'est retenu que si sa clé de contrôle est juste, ce qui écarte les lectures
 * partielles. La caméra exige HTTPS : sur l'adresse du réseau local, il reste la saisie à la main.
 */
function useBarcodeCamera(active: boolean, onDetected: (ean: string) => void) {
  const { t } = useTranslation()
  const video = useRef<HTMLVideoElement>(null)
  const callback = useRef(onDetected)
  callback.current = onDetected
  const [error, setError] = useState<string | null>(window.isSecureContext ? null : t("scanner.httpsOnly"))

  useEffect(() => {
    if (!active || !window.isSecureContext || !navigator.mediaDevices?.getUserMedia) return
    let cancelled = false
    let stop = () => {}
    let done = false
    const found = (raw: string) => {
      const ean = cleanEan(raw)
      if (done || !ean) return
      done = true
      navigator.vibrate?.(60)
      callback.current(ean)
    }

    ;(async () => {
      try {
        const Native = (window as unknown as { BarcodeDetector?: DetectorClass }).BarcodeDetector
        const supported = Native ? await Native.getSupportedFormats() : []
        if (Native && supported.includes("ean_13")) {
          const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false })
          const release = () => stream.getTracks().forEach((t) => t.stop())
          if (cancelled || !video.current) return release()
          video.current.srcObject = stream
          await video.current.play()
          const detector = new Native({ formats: FORMATS.filter((f) => supported.includes(f)) })
          let timer = 0
          const tick = async () => {
            if (cancelled || done || !video.current) return
            try {
              for (const code of await detector.detect(video.current)) found(code.rawValue)
            } catch {
              // image pas encore prête : on retente au tour suivant
            }
            timer = window.setTimeout(tick, 150)
          }
          tick()
          stop = () => {
            clearTimeout(timer)
            release()
          }
        } else {
          const { BrowserMultiFormatOneDReader } = await import("@zxing/browser")
          const controls = await new BrowserMultiFormatOneDReader().decodeFromConstraints(
            { video: { facingMode: "environment" }, audio: false },
            video.current ?? undefined,
            (result) => result && found(result.getText()),
          )
          if (cancelled) return controls.stop()
          stop = () => controls.stop()
        }
        if (cancelled) stop()
      } catch (err) {
        if (cancelled) return
        const name = (err as Error).name
        setError(name === "NotAllowedError" ? t("scanner.denied") : t("scanner.unavailable"))
      }
    })()
    return () => {
      cancelled = true
      stop()
    }
  }, [active])

  return { video, error }
}

/**
 * Viseur : carte 28 px, flux caméra, masque assombri hors de la zone de lecture, cadre sauge
 * clair et ligne de balayage (immobile si l'appareil demande moins d'animations).
 * Hors lecture (`active` faux), `idle` prend la place du cadre (bouton pour relancer…).
 */
export function Viewfinder({
  active,
  onDetected,
  hint,
  idle,
  overlay,
}: {
  active: boolean
  onDetected: (ean: string) => void
  hint?: ReactNode
  idle?: ReactNode
  /** Posé en haut du viseur (message éphémère de la session à la suite). */
  overlay?: ReactNode
}) {
  const { t } = useTranslation()
  const { video, error } = useBarcodeCamera(active, onDetected)
  const line = useRef<HTMLDivElement>(null)
  const reading = active && !error

  // Animation par l'API Web Animations : la CSP interdit les feuilles de style injectées.
  useEffect(() => {
    if (!reading || !line.current || reducedMotion() || !line.current.animate) return
    const animation = line.current.animate([{ top: "30%" }, { top: "70%" }], {
      duration: 1600,
      iterations: Infinity,
      direction: "alternate",
      easing: "ease-in-out",
    })
    return () => animation.cancel()
  }, [reading])

  return (
    <>
      <div className="relative mx-auto aspect-[1/1.05] max-h-[46dvh] w-full overflow-hidden rounded-[28px] bg-[repeating-linear-gradient(135deg,#3a3630_0_8px,#2e2b25_8px_16px)]">
        {reading && (
          <>
            <video ref={video} muted playsInline className="absolute inset-0 size-full object-cover" />
            <div className="pointer-events-none absolute inset-y-[26%] inset-x-[12%] rounded-[18px] shadow-[0_0_0_999px_rgba(32,30,29,0.55)]" />
            <div className="pointer-events-none absolute inset-y-[26%] inset-x-[12%] rounded-[18px] border-[3px] border-[#aebf92]" />
            <div ref={line} className="pointer-events-none absolute inset-x-[12%] top-1/2 h-0.5 bg-[#aebf92] shadow-[0_0_12px_#aebf92]" />
          </>
        )}
        {error && <p className="absolute inset-0 grid place-items-center px-8 text-center text-[14px] leading-snug text-[#f7f3ea]/85">{error}</p>}
        {!active && !error && idle && <div className="absolute inset-0 grid place-items-center bg-[rgba(32,30,29,0.55)] p-5">{idle}</div>}
        {overlay && <div className="absolute inset-x-3 top-3 flex justify-center">{overlay}</div>}
      </div>
      <p className="mt-[18px] text-center text-[15px] text-[#f7f3ea]/75">{hint ?? t("scanner.frame")}</p>
    </>
  )
}

/** Saisie des chiffres à la main : pilule monospace et rond de validation. */
export function ManualEntry({ onDetected }: { onDetected: (ean: string) => void }) {
  const { t } = useTranslation()
  const [manual, setManual] = useState("")
  const [invalid, setInvalid] = useState(false)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const ean = cleanEan(manual)
    if (!ean) return setInvalid(true)
    setManual("")
    onDetected(ean)
  }

  return (
    <form onSubmit={submit} className="mt-[18px]">
      <div className="flex gap-2">
        <input
          className="min-h-[46px] min-w-0 flex-1 rounded-full bg-white/10 px-5 font-mono text-base tracking-[0.08em] text-[#f7f3ea] outline-none transition-shadow duration-150 placeholder:text-[#f7f3ea]/45 focus:shadow-[0_0_0_3px_#aebf92]"
          inputMode="numeric"
          autoComplete="off"
          aria-label={t("scanner.manualPlaceholder")}
          placeholder={t("scanner.manualPlaceholder")}
          value={manual}
          onChange={(e) => {
            setManual(e.target.value)
            setInvalid(false)
          }}
          aria-invalid={invalid}
        />
        <button
          disabled={!manual.trim()}
          aria-label={t("scanner.ok")}
          title={t("scanner.ok")}
          className="grid size-[46px] shrink-0 place-items-center rounded-full bg-[#f7f3ea] text-[#201e1d] transition-[opacity,transform] duration-150 active:scale-[.98] disabled:opacity-45"
        >
          <Check size={22} {...ICON} aria-hidden="true" />
        </button>
      </div>
      {invalid && (
        <p role="alert" className="mt-2 px-2 text-[13px] text-[#ffc6a5]">
          {t("scanner.invalid")}
        </p>
      )}
    </form>
  )
}

/** En-tête du lecteur : fermer (rond 40 px), titre en Caprasimo, puis ce qu'on y ajoute à droite. */
export function ScannerHeader({ title, titleId, onClose, children }: { title: string; titleId?: string; onClose: () => void; children?: ReactNode }) {
  const { t } = useTranslation()
  return (
    <div className="flex items-center gap-2.5 pt-3.5">
      <button
        type="button"
        onClick={onClose}
        aria-label={t("common.close")}
        title={t("common.close")}
        className="grid size-10 shrink-0 place-items-center rounded-full bg-white/12 transition-colors duration-150 hover:bg-white/20"
      >
        <X size={18} {...ICON} aria-hidden="true" />
      </button>
      <h2 id={titleId} className="min-w-0 truncate font-heading text-[18px]">
        {title}
      </h2>
      {children && <div className="ml-auto shrink-0">{children}</div>}
    </div>
  )
}

type Props = { onDetected: (ean: string) => void; onClose: () => void; title?: string }

/** Lecteur plein écran pour un formulaire (exemplaire, ajout d'un jeu). La brocante compose les mêmes pièces. */
export function Scanner({ onDetected, onClose, title: titleProp }: Props) {
  const { t } = useTranslation()
  const title = titleProp ?? t("scanner.defaultTitle")
  return (
    <div role="dialog" aria-modal="true" aria-label={title} className={`fixed inset-0 z-50 overflow-y-auto overscroll-contain ${darkScreen}`}>
      <div className="mx-auto flex min-h-dvh max-w-[480px] flex-col px-4 pb-[max(22px,env(safe-area-inset-bottom))]">
        <ScannerHeader title={title} onClose={onClose} />
        <div className="mt-[22px]">
          <Viewfinder active onDetected={onDetected} />
        </div>
        <ManualEntry onDetected={onDetected} />
      </div>
    </div>
  )
}
