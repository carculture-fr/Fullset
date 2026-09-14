import { useEffect, useRef, useState, type FormEvent } from "react"
import { useTranslation } from "react-i18next"

import { inputClass } from "@/components/fields"
import { cleanEan } from "@/lib/ean"

type Props = { onDetected: (ean: string) => void; onClose: () => void; title?: string }

type Detector = { detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue: string }>> }
type DetectorClass = { new (opts: { formats: string[] }): Detector; getSupportedFormats(): Promise<string[]> }

// Formats des boîtes de jeux : EAN-13 en Europe, UPC-A sur les imports américains, EAN-8 rare.
const FORMATS = ["ean_13", "ean_8", "upc_a"]

/**
 * Lecteur plein écran. Chrome sur Android lit avec BarcodeDetector, natif et rapide ; Safari et
 * Firefox n'en ont pas, ZXing prend alors le relais (chargé à la demande, ~100 Ko). Un code n'est
 * retenu que si sa clé de contrôle est juste, ce qui écarte les lectures partielles.
 * La caméra exige HTTPS : sur l'adresse du réseau local, il reste la saisie à la main.
 */
export function Scanner({ onDetected, onClose, title: titleProp }: Props) {
  const { t } = useTranslation()
  const title = titleProp ?? t("scanner.defaultTitle")
  const video = useRef<HTMLVideoElement>(null)
  const callback = useRef(onDetected)
  callback.current = onDetected
  const [error, setError] = useState<string | null>(
    window.isSecureContext ? null : t("scanner.httpsOnly"),
  )
  const [manual, setManual] = useState("")
  const [manualError, setManualError] = useState(false)

  useEffect(() => {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) return
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
        setError(
          name === "NotAllowedError"
            ? t("scanner.denied")
            : t("scanner.unavailable"),
        )
      }
    })()
    return () => {
      cancelled = true
      stop()
    }
  }, [])

  const submitManual = (e: FormEvent) => {
    e.preventDefault()
    const ean = cleanEan(manual)
    if (!ean) return setManualError(true)
    onDetected(ean)
  }

  return (
    <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-50 flex flex-col bg-black text-white">
      <div className="flex items-center justify-between px-4 py-3">
        <h2 className="font-medium">{title}</h2>
        <button onClick={onClose} className="rounded-md px-3 py-1.5 text-sm hover:bg-white/10">
          {t("common.close")}
        </button>
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {!error && (
          <>
            <video ref={video} muted playsInline className="absolute inset-0 size-full object-cover" />
            {/* Gabarit : un code-barres est plus large que haut. */}
            <div className="pointer-events-none absolute top-1/2 left-1/2 h-32 w-[80%] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
            <p className="absolute right-0 bottom-4 left-0 text-center text-sm text-white/80">{t("scanner.frame")}</p>
          </>
        )}
        {error && <p className="px-6 pt-10 text-center text-sm text-white/85">{error}</p>}
      </div>
      <form onSubmit={submitManual} className="flex gap-2 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <input
          className={`${inputClass} min-w-0 flex-1 text-foreground`}
          inputMode="numeric"
          autoComplete="off"
          placeholder={t("scanner.manualPlaceholder")}
          value={manual}
          onChange={(e) => {
            setManual(e.target.value)
            setManualError(false)
          }}
          aria-invalid={manualError}
        />
        <button disabled={!manual.trim()} className="rounded-lg bg-primary px-4 font-medium text-primary-foreground disabled:opacity-50">
          {t("scanner.ok")}
        </button>
      </form>
      {manualError && <p className="-mt-2 px-4 pb-4 text-sm text-red-300">{t("scanner.invalid")}</p>}
    </div>
  )
}
