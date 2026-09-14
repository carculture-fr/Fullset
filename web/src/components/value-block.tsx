import { useState, type FormEvent } from "react"
import { useTranslation } from "react-i18next"

import { ErrorNote, inputClass } from "@/components/fields"
import { errorMessage, send, type Valuation } from "@/lib/api"
import { euros, formatDate, todayIso } from "@/lib/format"

/**
 * Valeur estimée d'un exemplaire ou d'un élément de matériel : la dernière estimation,
 * l'écart au prix payé, et l'historique daté (la plus récente fait foi).
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

  return (
    <div className="mt-3 rounded-md bg-muted px-3 py-2.5 text-sm">
      <div className="flex items-baseline justify-between gap-2">
        <div>
          <span className="text-muted-foreground">{t("valueBlock.estimated")} </span>
          {latest ? (
            <>
              <span className="font-medium">{euros(latest.amount_cents)}</span>
              <span className="text-xs text-muted-foreground"> {t("valueBlock.on", { date: formatDate(latest.valued_on) })}</span>
            </>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </div>
        <button type="button" onClick={() => setOpen((o) => !o)} className="shrink-0 text-primary hover:underline">
          {open ? t("valueBlock.close") : t("valueBlock.estimate")}
        </button>
      </div>
      {delta !== null && (
        <div className="text-xs text-muted-foreground">
          {t("valueBlock.delta", { amount: `${delta >= 0 ? "+" : "−"}${euros(Math.abs(delta))}` })}
        </div>
      )}
      {open && (
        <form onSubmit={submit} className="mt-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <input className={inputClass} inputMode="decimal" placeholder={t("valueBlock.amountPlaceholder")} value={amount} onChange={(e) => setAmount(e.target.value)} aria-label={t("valueBlock.amountLabel")} />
            <input className={inputClass} type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label={t("valueBlock.dateLabel")} />
          </div>
          <input className={inputClass} placeholder={t("valueBlock.notePlaceholder")} value={note} onChange={(e) => setNote(e.target.value)} />
          <ErrorNote message={error} />
          <button disabled={busy || !amount.trim()} className="w-full rounded-lg bg-primary py-2 font-medium text-primary-foreground disabled:opacity-50">
            {t("valueBlock.save")}
          </button>
          {valuations.length > 0 && (
            <ul className="divide-y divide-border pt-1">
              {valuations.map((v) => (
                <li key={v.id} className="flex items-baseline justify-between gap-2 py-1.5">
                  <span>
                    {formatDate(v.valued_on)} · <span className="font-medium">{euros(v.amount_cents)}</span>
                    {v.note && <span className="text-muted-foreground"> · {v.note}</span>}
                  </span>
                  <button type="button" onClick={() => remove(v.id)} aria-label={t("valueBlock.deleteLabel")} className="px-1 text-muted-foreground hover:text-destructive">
                    ×
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
