import { X } from "lucide-react"
import { useState, type FormEvent } from "react"
import { useTranslation } from "react-i18next"

import { ErrorNote, inputClass } from "@/components/fields"
import { ICON } from "@/components/page-bits"
import { errorMessage, send, type Valuation } from "@/lib/api"
import { euros, formatDate, todayIso } from "@/lib/format"

// Barres du mini-histogramme : les dernières estimations, dans l'ordre chronologique.
const HISTORY_BARS = 6

/**
 * Valeur estimée d'un exemplaire ou d'un élément de matériel : bloc sur fond « données »
 * (dernière estimation, écart au prix payé, mini-histogramme). Un toucher ouvre l'ajout et
 * l'historique daté (la plus récente fait foi).
 */
export function ValueBlock({
  valuations,
  priceCents,
  postUrl,
  deleteBase,
  onChanged,
}: {
  valuations: Valuation[]
  priceCents: number | null
  postUrl: string
  deleteBase: string
  onChanged: () => Promise<void> | void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState("")
  const [date, setDate] = useState(todayIso)
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const latest = valuations[0]
  const delta = latest && priceCents !== null ? latest.amount_cents - priceCents : null
  const bars = valuations.slice(0, HISTORY_BARS).reverse()
  const max = Math.max(...bars.map((v) => v.amount_cents), 1)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await send("POST", postUrl, { amount, valued_on: date, note })
      setAmount("")
      setNote("")
      await onChanged()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const remove = async (valuationId: number) => {
    if (!window.confirm(t("valueBlock.confirmDelete"))) return
    await send("DELETE", `${deleteBase}/${valuationId}`)
    await onChanged()
  }

  const sub = [delta !== null ? t("valueBlock.delta", { amount: `${delta >= 0 ? "+" : "−"}${euros(Math.abs(delta))}` }) : null, latest ? t("valueBlock.count", { count: valuations.length }) : null]
    .filter(Boolean)
    .join(" · ")

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 rounded-[16px] bg-viz-bg px-3.5 py-3 text-left text-viz-fg transition-[filter] duration-150 hover:brightness-[.98]"
      >
        <span className="block min-w-0 flex-1">
          <span className="block text-[11px] text-[var(--viz-label)]">
            {t("valueBlock.estimated")}
            {latest && ` · ${t("valueBlock.on", { date: formatDate(latest.valued_on) })}`}
          </span>
          <span className="num block font-heading text-[19px] leading-tight">{latest ? euros(latest.amount_cents) : "—"}</span>
          <span className="block text-[11px]">{latest ? sub : t("valueBlock.none")}</span>
        </span>
        {bars.length > 0 ? (
          <span className="flex h-[34px] shrink-0 items-end gap-[3px]" aria-hidden="true">
            {bars.map((v, i) => (
              <span
                key={v.id}
                className={`w-2 rounded-full ${i === bars.length - 1 ? "bg-viz-strong" : "bg-viz"}`}
                style={{ height: `${Math.max(6, Math.round((34 * v.amount_cents) / max))}px` }}
              />
            ))}
          </span>
        ) : (
          <span className="shrink-0 text-[13px] font-semibold">{t("valueBlock.estimate")}</span>
        )}
      </button>

      {open && (
        <form onSubmit={submit} className="space-y-2 rounded-[16px] bg-muted p-3 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <input className={`${inputClass} num`} inputMode="decimal" placeholder={t("valueBlock.amountPlaceholder")} value={amount} onChange={(e) => setAmount(e.target.value)} aria-label={t("valueBlock.amountLabel")} />
            <input className={`${inputClass} num`} type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label={t("valueBlock.dateLabel")} />
          </div>
          <input className={inputClass} placeholder={t("valueBlock.notePlaceholder")} value={note} onChange={(e) => setNote(e.target.value)} />
          <ErrorNote message={error} />
          <div className="flex gap-2">
            <button disabled={busy || !amount.trim()} className="h-11 flex-1 rounded-full bg-primary font-heading text-[15px] text-primary-foreground transition-transform duration-150 active:scale-[.98] disabled:opacity-45">
              {t("valueBlock.save")}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="h-11 rounded-full bg-card px-4 text-[14px] text-muted-foreground hover:text-foreground">
              {t("valueBlock.close")}
            </button>
          </div>
          {valuations.length > 0 && (
            <ul className="divide-y divide-border pt-1">
              {valuations.map((v) => (
                <li key={v.id} className="flex items-center justify-between gap-2 py-1">
                  <span className="num min-w-0">
                    {formatDate(v.valued_on)} · <span className="font-semibold">{euros(v.amount_cents)}</span>
                    {v.note && <span className="text-muted-foreground"> · {v.note}</span>}
                  </span>
                  <button
                    type="button"
                    onClick={() => remove(v.id)}
                    aria-label={t("valueBlock.deleteLabel")}
                    className="grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground hover:text-destructive"
                  >
                    <X size={16} {...ICON} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </form>
      )}
    </div>
  )
}
